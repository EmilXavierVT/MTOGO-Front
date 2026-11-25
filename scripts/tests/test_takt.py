import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import takt

spec = importlib.util.spec_from_file_location("publish_images", takt.ROOT / "scripts/publish_images.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class VersionTests(unittest.TestCase):
    def test_existing_issue_categories(self):
        for label in takt.PATCH_LABELS:
            with self.subTest(label=label):
                self.assertEqual(takt.change_kind([label, "priority:P0"]), "patch")

    def test_largest_classification_wins(self):
        self.assertEqual(takt.change_kind(["bug", "type:feature"]), "minor")
        self.assertEqual(takt.change_kind(["enhancement", "breaking-change"]), "breaking")
        self.assertEqual(takt.change_kind(["breaking-change", "release:major"]), "major")

    def test_unclassified_issue_is_rejected(self):
        with self.assertRaises(ValueError):
            takt.change_kind(["area:engineering"])

    def test_bump_policy_and_resets(self):
        cases = [
            ("v0.1.0", "patch", "v0.1.1"), ("v0.1.9", "minor", "v0.2.0"),
            ("v0.3.2", "breaking", "v0.4.0"), ("v0.3.2", "major", "v1.0.0"),
            ("v1.3.2", "breaking", "v2.0.0"), ("v1.3.2", "minor", "v1.4.0"),
            (None, "patch", "v0.1.0"), (None, "minor", "v0.1.0"),
            (None, "major", "v1.0.0"),
        ]
        for previous, kind, expected in cases:
            with self.subTest(previous=previous, kind=kind):
                self.assertEqual(takt.next_version(previous, kind), expected)

    def test_invalid_versions_and_bumps_fail(self):
        for version in ["v01.2.3", "1.2.3", "v1.2.3-rc.1", "v1.2"]:
            with self.assertRaises(ValueError):
                takt.parse_version(version)
        with self.assertRaises(ValueError):
            takt.next_version("v0.1.0", "unknown")


class FlowTests(unittest.TestCase):
    def event(self, state, hour, key, **overrides):
        at = f"2026-11-24T{hour:02}:00:00Z"
        return {
            "id": hour, "created_at": at, "author_association": "OWNER",
            "user": {"login": "owner"},
            "body": "<!-- mtogo-flow:v1 " + json.dumps({"state": state, "at": at, "key": key}) + " -->",
            **overrides,
        }

    def summary(self, comments, hour=18):
        return takt.flow_summary(takt.flow_events(comments), takt.timestamp(f"2026-11-24T{hour:02}:00:00Z"))

    def test_repeated_visits_accumulate_and_done_stops_clock(self):
        comments = [
            self.event("in_progress", 11, "a"), self.event("review", 13, "b"),
            self.event("in_progress", 14, "c"), self.event("review", 15, "d"),
            self.event("done", 16, "e"),
        ]
        result = self.summary(comments)
        self.assertEqual(result["totals"], {"in_progress": 3 * 3600, "review": 2 * 3600})
        self.assertEqual(result["current_seconds"], 0)
        self.assertEqual(result["state"], "done")

    def test_reopening_excludes_done_time(self):
        result = self.summary([
            self.event("in_progress", 11, "a"), self.event("done", 12, "b"),
            self.event("in_progress", 16, "c"),
        ])
        self.assertEqual(result["totals"]["in_progress"], 3 * 3600)
        self.assertEqual(result["current_seconds"], 2 * 3600)

    def test_repeated_state_does_not_reset_current_clock(self):
        result = self.summary([self.event("review", 11, "a"), self.event("review", 12, "b")], 13)
        self.assertEqual(result["current_seconds"], 2 * 3600)
        self.assertEqual(result["since"], "2026-11-24T11:00:00Z")

    def test_untrusted_malformed_future_and_duplicate_events_are_ignored(self):
        comments = [
            self.event("in_progress", 11, "a"),
            self.event("review", 12, "a"),  # same idempotency key
            self.event("done", 13, "b", author_association="NONE"),
            self.event("done", 14, "c", body="<!-- mtogo-flow:v1 {} -->"),
            self.event("done", 17, "d", created_at="2026-11-24T13:00:00Z"),
        ]
        self.assertEqual(len(takt.flow_events(comments)), 1)
        self.assertEqual(self.summary(comments)["totals"]["in_progress"], 7 * 3600)

    def test_github_actions_bot_events_are_accepted(self):
        comments = [self.event("review", 11, "a", author_association="NONE", user={"login": "github-actions[bot]"})]
        self.assertEqual(self.summary(comments)["state"], "review")

    def test_calendar_duration_and_timezone(self):
        self.assertEqual(takt.duration(90061), "1d 1h 1m")
        self.assertEqual(takt.timestamp("2026-11-24T12:00:00+01:00"), takt.timestamp("2026-11-24T11:00:00Z"))
        self.assertIn("12:00 CET", takt.flow_report(self.summary([self.event("review", 11, "a")])))
        with self.assertRaises(ValueError):
            takt.timestamp("2026-11-24T11:00:00")


class NativeStatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / ".tt-config.json").write_text(json.dumps({"flow": {"status_ids": {
            "backlog": 2, "todo": 3, "in_progress": 4, "review": 8,
            "done": 5, "not_planned": 6, "duplicate": 7,
        }}}))
        self.comments = []
        for target, value in [("ROOT", self.root), ("pages", lambda *args: list(self.comments)),
                              ("api", self.post), ("run", self.unexpected_command)]:
            mocked = patch.object(takt, target, value)
            mocked.start()
            self.addCleanup(mocked.stop)

    def unexpected_command(self, *args, **kwargs):
        self.fail("Timing events must not run branch or delivery commands")

    def post(self, endpoint, payload=None):
        self.assertEqual(endpoint, "repos/owner/repo/issues/42/comments")
        self.comments.append({
            "id": len(self.comments) + 1, "body": payload["body"],
            "created_at": takt.iso(dt.datetime.now(takt.UTC)),
            "author_association": "NONE", "user": {"login": "github-actions[bot]"},
        })
        return self.comments[-1]

    def send(self, status_id, hour, previous=None, snapshot=None, action="status_changed"):
        status = {"id": status_id, "name": "Display names can change"}
        event = {
            "action": action, "repository": {"full_name": "owner/repo"},
            "issue": {"number": 42, "updated_at": f"2026-11-24T{hour:02}:00:00Z",
                      "status": {"id": snapshot if snapshot is not None else status_id}},
            "status": status,
            "changes": {"status": {"from": {"id": previous} if previous else None}},
        }
        path = self.root / "event.json"
        path.write_text(json.dumps(event))
        takt.event_handler(path)

    def summary(self):
        return takt.flow_summary(takt.flow_events(self.comments), takt.timestamp("2026-11-24T18:00:00Z"))

    def test_board_round_trip_pauses_backlog_and_accumulates_visits(self):
        self.send(4, 11, 2)
        self.send(8, 12, 4)
        self.send(2, 13, 8)
        self.send(4, 14, 2)
        self.send(5, 16, 4)
        result = self.summary()
        self.assertEqual(result["state"], "done")
        self.assertEqual(result["current_seconds"], 0)
        self.assertEqual(result["totals"], {"in_progress": 3 * 3600, "review": 3600})

    def test_queued_events_keep_payload_time_and_captured_status(self):
        self.send(4, 11, 2, snapshot=5)
        result = self.summary()
        self.assertEqual(result["state"], "in_progress")
        self.assertEqual(result["since"], "2026-11-24T11:00:00Z")
        self.assertEqual(result["totals"]["in_progress"], 7 * 3600)

    def test_duplicate_delivery_does_not_add_another_transition(self):
        self.send(4, 11, 2)
        self.send(4, 11, 2)
        self.assertEqual(len(self.comments), 1)

    def test_out_of_order_events_produce_the_same_intervals(self):
        for status, hour, previous in [(4, 14, 2), (5, 16, 4), (2, 10, None),
                                       (8, 12, 4), (4, 11, 2), (2, 13, 8)]:
            self.send(status, hour, previous)
        result = self.summary()
        self.assertEqual(result["state"], "done")
        self.assertEqual(result["totals"], {"in_progress": 3 * 3600, "review": 3600})
        self.assertNotIn("-1h", self.comments[-1]["body"])

    def test_older_start_is_preserved_when_latest_state_is_also_in_progress(self):
        self.send(4, 14, 8)
        self.send(8, 12, 4)
        self.send(4, 11, 2)
        self.assertEqual(self.summary()["totals"], {"in_progress": 5 * 3600, "review": 2 * 3600})
        self.assertEqual(len(self.comments), 3)

    def test_workon_and_deliver_logs_do_not_reset_native_intervals(self):
        takt.record_flow("owner/repo", 42, "in_progress", "workon:old-client", at="2026-11-24T11:00:00Z")
        self.send(4, 11, 2)
        self.send(8, 12, 4)
        takt.record_flow("owner/repo", 42, "review", "review:verified-sha")
        self.send(5, 16, 8)
        self.assertEqual(self.summary()["totals"], {"in_progress": 3600, "review": 4 * 3600})
        self.assertEqual(len(self.comments), 4)

    def test_native_lifecycle_duplicates_are_ignored_and_reopening_pauses(self):
        self.send(4, 11, 2)
        self.send(5, 12, 4)
        self.send(5, 12, 4, action="closed")
        self.send(2, 14, 5)
        self.send(2, 14, 5, action="reopened")
        result = self.summary()
        self.assertEqual(result["state"], "backlog")
        self.assertEqual(result["totals"]["in_progress"], 3600)
        self.assertEqual(len(self.comments), 3)

    def test_unknown_status_is_ignored(self):
        self.send(999, 11, 2)
        self.assertEqual(self.comments, [])

    def test_todo_and_terminal_statuses_stop_accumulating_active_time(self):
        for status_id, state in [(3, "todo"), (6, "not_planned"), (7, "duplicate")]:
            with self.subTest(state=state):
                self.comments.clear()
                self.send(4, 11, 2)
                self.send(status_id, 12, 4)
                result = self.summary()
                self.assertEqual(result["state"], state)
                self.assertEqual(result["totals"]["in_progress"], 3600)
                if state in takt.TERMINAL_STATES:
                    self.assertEqual(result["current_seconds"], 0)


class DeliveryBoardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / ".tt-config.json").write_text(json.dumps({"project": {"owner": "owner", "number": 7}}))
        self.board = "In progress"
        self.trace = []
        self.fail_checks = False

    def command(self, args, **kwargs):
        if str(args[0]).endswith("scripts/check.sh"):
            self.trace.append("verify")
            if self.fail_checks:
                raise RuntimeError("Verification failed")
        elif args[:3] == ["gh", "tt", "deliver"]:
            # Simulate gh-tt's stale field cache silently skipping the board update.
            self.trace.append("submit")
            self.assertEqual(self.board, "In review", "Delivery submitted with stale board status")
        else:
            self.fail(f"Unexpected command: {args}")
        return ""

    def api(self, endpoint, payload=None):
        self.trace.append("api")
        if endpoint == "graphql":
            query = payload["query"]
            if query.lstrip().startswith("query"):
                return {"data": {"user": {"projectV2": {
                    "id": "project", "fields": {"nodes": [{"id": "field", "name": "Status", "options": [
                        {"id": "review-option", "name": "In review"},
                    ]}]},
                }}}}
            if "addProjectV2ItemById" in query:
                return {"data": {"addProjectV2ItemById": {"item": {"id": "item"}}}}
            if "updateProjectV2ItemFieldValue" in query:
                self.assertEqual(payload["variables"]["o"], "review-option")
                self.board = "In review"
                return {"data": {"updateProjectV2ItemFieldValue": {"projectV2Item": {"id": "item"}}}}
        if endpoint == "repos/owner/repo/issues/42":
            return {"node_id": "issue"}
        if endpoint == "repos/owner/repo/issues/42/comments":
            return {}
        self.fail(f"Unexpected API call: {endpoint}")

    def invoke(self):
        def git(*args):
            if args == ("status", "--porcelain"):
                return ""
            if args == ("branch", "--show-current"):
                return "42-flow"
            self.fail(f"Unexpected git call: {args}")
        with patch.object(takt, "ROOT", self.root), patch.object(takt, "git", side_effect=git), \
             patch.object(takt, "run", side_effect=self.command), patch.object(takt, "api", side_effect=self.api), \
             patch.object(takt, "repository", return_value="owner/repo"), \
             patch.object(takt, "remote_head", return_value="a" * 40), patch.object(takt, "pages", return_value=[]), \
             patch.object(sys, "argv", ["takt.py", "deliver"]):
            takt.main()

    def test_delivery_uses_live_board_metadata_even_when_upstream_cache_is_stale(self):
        self.invoke()
        self.assertEqual(self.board, "In review")
        self.assertEqual(self.trace[0], "verify")
        self.assertIn("submit", self.trace)

    def test_failed_local_verification_does_not_move_the_board_or_submit(self):
        self.fail_checks = True
        with self.assertRaisesRegex(RuntimeError, "Verification failed"):
            self.invoke()
        self.assertEqual(self.board, "In progress")
        self.assertEqual(self.trace, ["verify"])


class GitFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "source"
        self.origin = Path(self.temp.name) / "origin.git"
        self.root.mkdir()
        subprocess.run(["git", "init", "--bare", "-q", str(self.origin)], check=True)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.root)], check=True)
        self.root_patch = patch.object(takt, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.addCleanup(self.temp.cleanup)
        takt.git("config", "user.name", "Fixture")
        takt.git("config", "user.email", "fixture@example.test")
        takt.git("remote", "add", "origin", str(self.origin))
        self.base = self.commit("base")
        takt.git("push", "-u", "origin", "main")
        self.api_patch = patch.object(takt, "api", return_value={"labels": [{"name": "type:foundation"}]})
        self.api_patch.start()
        self.addCleanup(self.api_patch.stop)

    def commit(self, text):
        (self.root / "code.txt").write_text(text)
        takt.git("add", "code.txt")
        takt.git("commit", "-qm", text)
        return takt.git("rev-parse", "HEAD")

    def candidate(self):
        takt.git("checkout", "-qb", "98-flow")
        self.commit("part one")
        self.source = self.commit("part two")
        takt.git("push", "origin", "98-flow")
        tree = takt.git("rev-parse", "HEAD^{tree}")
        sha = takt.git("commit-tree", tree, "-p", self.base, "-m", "Delivery #98")
        takt.git("update-ref", "refs/heads/ready/98-flow", sha)
        takt.git("push", "origin", "ready/98-flow")
        return sha


class DeliveryTests(GitFixture):
    def test_dirty_delivery_stops_before_checks_or_pushes(self):
        self.candidate()
        (self.root / "uncommitted.txt").write_text("work")
        with patch.object(sys, "argv", ["takt.py", "deliver"]), self.assertRaisesRegex(ValueError, "Commit or stash"):
            takt.main()

    def test_squashed_tree_and_sha_survive_fast_forward(self):
        sha = self.candidate()
        plan = takt.ready_plan("owner/repo", "ready/98-flow", sha)
        self.assertEqual(plan["source_sha"], self.source)
        takt.git("checkout", "-q", "main")
        takt.git("merge", "--ff-only", sha)
        self.assertEqual(takt.git("rev-parse", "HEAD"), sha)
        self.assertEqual(takt.git("rev-parse", "HEAD^{tree}"), plan["tree"])
        self.assertEqual(plan["bump"], "patch")

    def test_advanced_main_is_rejected(self):
        sha = self.candidate()
        takt.git("checkout", "-q", "main")
        self.commit("teammate delivered")
        takt.git("push", "origin", "main")
        with self.assertRaisesRegex(ValueError, "exactly one parent"):
            takt.ready_plan("owner/repo", "ready/98-flow", sha)

    def test_development_work_after_delivery_is_preserved(self):
        sha = self.candidate()
        self.commit("new work")
        takt.git("push", "origin", "98-flow")
        with self.assertRaisesRegex(ValueError, "Development branch changed"):
            takt.ready_plan("owner/repo", "ready/98-flow", sha)
        self.assertIsNotNone(takt.remote_head("98-flow"))

    def test_unsquashed_candidate_is_rejected(self):
        self.candidate()
        with self.assertRaisesRegex(ValueError, "exactly one parent"):
            takt.assert_candidate(self.source, self.base)

    def test_superseded_ready_run_is_rejected(self):
        sha = self.candidate()
        new = takt.git("commit-tree", takt.git("rev-parse", "HEAD^{tree}"), "-p", self.base, "-m", "replacement")
        takt.git("push", "--force", "origin", f"{new}:refs/heads/ready/98-flow")
        with self.assertRaisesRegex(ValueError, "superseded"):
            takt.ready_plan("owner/repo", "ready/98-flow", sha)

    def test_promotion_rechecks_current_remote_refs(self):
        sha = self.candidate()
        plan = takt.ready_plan("owner/repo", "ready/98-flow", sha)
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_SHA": sha, "TAKT_BASE_SHA": self.base}):
            takt.promotion_check(plan)
            self.commit("late work")
            takt.git("push", "origin", "98-flow")
            with self.assertRaisesRegex(ValueError, "Development branch advanced"):
                takt.promotion_check(plan)

    def test_promotion_requires_an_activation_baseline(self):
        sha = self.candidate()
        plan = takt.ready_plan("owner/repo", "ready/98-flow", sha)
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_SHA": sha, "TAKT_BASE_SHA": ""}):
            with self.assertRaisesRegex(ValueError, "TAKT_BASE_SHA"):
                takt.promotion_check(plan)

    def test_frozen_plan_rejects_tampering(self):
        sha = self.candidate()
        plan = takt.ready_plan("owner/repo", "ready/98-flow", sha)
        for changes in [{"sha": "a" * 40}, {"repository": "other/repo"}, {"bump": "major"}, {"issue": 99}, {"source_branch": "98-../bad"}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                takt.validate_plan({**plan, **changes}, "owner/repo", sha)

    def test_version_order_is_numeric_and_reachable(self):
        takt.git("tag", "v0.9.0")
        takt.git("tag", "v0.10.0")
        self.assertEqual(takt.latest_version(self.base), "v0.10.0")
        self.assertEqual(publisher.pending_commits(self.base, self.base), [])
        with self.assertRaises(ValueError):
            publisher.pending_commits("main", self.base)

    def test_leased_cleanup_does_not_delete_new_work(self):
        self.candidate()
        expected = self.source
        current = self.commit("new shared work")
        takt.git("push", "origin", "98-flow")
        with self.assertRaises(RuntimeError):
            takt.git("push", f"--force-with-lease=refs/heads/98-flow:{expected}", "origin", ":refs/heads/98-flow")
        self.assertEqual(takt.remote_head("98-flow"), current)

    def test_all_queued_commits_are_versioned_in_order_and_retries_do_not_build(self):
        takt.git("tag", "v0.1.0", self.base)
        takt.git("push", "origin", "refs/tags/v0.1.0")
        first = self.commit("feature")
        second = self.commit("fix")
        takt.git("push", "origin", "main")
        plans = {
            first: {"parent": self.base, "bump": "minor", "issue": 98},
            second: {"parent": first, "bump": "patch", "issue": 99},
        }
        registry = {}
        builds = []
        original_run = takt.run

        def fake_build(image, sha, version):
            builds.append(sha)
            value = "sha256:" + sha + "0" * 24
            registry[f"{image}:sha-{sha}"] = value
            return value

        def fake_run(args, **kwargs):
            if args[0] == "docker":
                registry[args[args.index("--tag") + 1]] = args[-1].split("@")[1]
                return ""
            return original_run(args, **kwargs)

        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "owner/repo"}), \
             patch.object(takt, "verified_plan", side_effect=lambda repo, sha: plans[sha]), \
             patch.object(publisher, "build_image", side_effect=fake_build), \
             patch.object(publisher, "digest", side_effect=registry.get), \
             patch.object(takt, "run", side_effect=fake_run):
            publisher.publish("owner/image", self.base)
            publisher.publish("owner/image", self.base)
        self.assertEqual(builds, [first, second])
        self.assertEqual(takt.git("rev-parse", "v0.2.0^{commit}"), first)
        self.assertEqual(takt.git("rev-parse", "v0.2.1^{commit}"), second)
        self.assertEqual(registry["owner/image:latest"], registry[f"owner/image:sha-{second}"])
        self.assertEqual(takt.remote_head("main"), second)


class EvidenceTests(unittest.TestCase):
    def test_green_workflow_without_green_verification_is_rejected(self):
        runs = [{"id": 1, "head_sha": "a" * 40, "head_branch": "ready/98-flow", "run_number": 1, "run_attempt": 1}]
        with patch.object(takt, "pages", side_effect=[runs, [{"name": "Takt verification", "conclusion": "failure"}]]), \
             patch.object(subprocess, "check_output") as download:
            with self.assertRaisesRegex(ValueError, "No successful Takt verification"):
                takt.verified_plan("owner/repo", "a" * 40)
            download.assert_not_called()

    def test_only_the_matching_verified_artifact_is_consumed(self):
        sha = "a" * 40
        plan = {
            "schema": 1, "repository": "owner/repo", "sha": sha, "parent": "b" * 40,
            "source_sha": "c" * 40, "tree": "d" * 40, "source_branch": "98-flow",
            "issue": 98, "labels": ["bug"], "bump": "patch",
        }
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w") as archive:
            archive.writestr("release-plan.json", json.dumps(plan))
        runs = [{"id": 1, "head_sha": sha, "head_branch": "ready/98-flow", "run_number": 1, "run_attempt": 1}]
        pages = [runs, [{"name": "Takt verification", "conclusion": "success"}],
                 [{"id": 2, "name": "release-plan", "expired": False}]]
        with patch.object(takt, "pages", side_effect=pages), \
             patch.object(subprocess, "check_output", return_value=content.getvalue()):
            self.assertEqual(takt.verified_plan("owner/repo", sha), plan)

class RegistryTests(unittest.TestCase):
    def test_same_digest_is_an_idempotent_retry(self):
        with patch.object(publisher, "digest", return_value="sha256:same"), patch.object(takt, "run") as run:
            publisher.ensure_tag("owner/image", "v0.1.0", "sha256:same")
            run.assert_not_called()

    def test_existing_version_can_never_be_reassigned(self):
        with patch.object(publisher, "digest", return_value="sha256:old"), patch.object(takt, "run") as run:
            with self.assertRaisesRegex(ValueError, "Refusing to overwrite"):
                publisher.ensure_tag("owner/image", "v0.1.0", "sha256:new")
            run.assert_not_called()

    def test_sha_image_is_reused_without_rebuilding(self):
        with patch.object(publisher, "digest", return_value="sha256:existing"), patch.object(takt, "git") as git:
            self.assertEqual(publisher.build_image("owner/image", "a" * 40), "sha256:existing")
            git.assert_not_called()

    def test_registry_outage_is_not_treated_as_a_missing_tag(self):
        result = subprocess.CompletedProcess([], 1, "", "429 Too Many Requests")
        with patch.object(subprocess, "run", return_value=result):
            with self.assertRaises(RuntimeError):
                publisher.digest("owner/image:v0.1.0")

    def test_only_a_missing_manifest_allows_a_new_build(self):
        result = subprocess.CompletedProcess([], 1, "", "ERROR: owner/image:v0.1.0: not found")
        with patch.object(subprocess, "run", return_value=result):
            self.assertIsNone(publisher.digest("owner/image:v0.1.0"))


if __name__ == "__main__":
    unittest.main()
