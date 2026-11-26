import datetime as dt
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import project_insights as insights
import takt

NAMES = ["Flow started at", "Cycle days", "Logged active hours", "Logged review hours", "Flow done",
         "Work age days", "Flow kind", "Start source", "Completion week"]
FIELDS = {name: index + 1 for index, name in enumerate(NAMES)}


class MetricsTests(unittest.TestCase):
    def issue(self, **changes):
        return {"number": 42, "created_at": "2026-11-20T00:00:00Z", "state": "closed",
                "state_reason": "completed", "closed_at": "2026-11-24T16:00:00Z",
                "labels": [{"name": "type:feature"}], **changes}

    def comments(self, *states):
        import json
        return [{"id": index, "created_at": at, "author_association": "OWNER",
                 "body": "<!-- mtogo-flow:v1 " + json.dumps({"state": state, "at": at, "key": str(index)}) + " -->"}
                for index, (state, at) in enumerate(states)]

    def metrics(self, issue=None, comments=(), current=None, board=(), now="2026-11-26T12:00:00Z"):
        return insights.metrics(issue or self.issue(), comments, current or {}, FIELDS, takt.timestamp(now), board)

    def test_cycle_includes_backlog_and_review_but_logged_hours_exclude_backlog(self):
        result = self.metrics(comments=self.comments(
            ("in_progress", "2026-11-24T08:00:00Z"), ("review", "2026-11-24T10:00:00Z"),
            ("backlog", "2026-11-24T11:00:00Z"), ("in_progress", "2026-11-24T14:00:00Z"),
            ("done", "2026-11-24T16:00:00Z")))
        self.assertAlmostEqual(result["Cycle days"], 8 / 24, places=6)
        self.assertEqual(result["Logged active hours"], 4)
        self.assertEqual(result["Logged review hours"], 1)

    def test_missing_history_is_empty_not_zero_or_issue_creation(self):
        result = self.metrics()
        for name in ["Flow started at", "Cycle days", "Logged active hours", "Logged review hours"]:
            self.assertIsNone(result[name])
        self.assertEqual(result["Start source"], "Unknown")
        self.assertEqual(result["Flow done"], "2026-11-24")

    def test_reopening_preserves_first_start_and_clears_completion(self):
        saved = {FIELDS["Flow started at"]: "2026-11-21T08:00:00Z", FIELDS["Start source"]: "Board history"}
        result = self.metrics(self.issue(state="open", state_reason=None, closed_at=None,
                                       status={"id": 4}), current=saved,
                              comments=self.comments(("in_progress", "2026-11-26T08:00:00Z")))
        self.assertEqual(result["Flow started at"], "2026-11-21T08:00:00Z")
        self.assertEqual(result["Start source"], "Board history")
        for name in ["Flow done", "Completion week", "Cycle days"]:
            self.assertIsNone(result[name])
        self.assertAlmostEqual(result["Work age days"], 5 + 4 / 24, places=6)

    def test_not_planned_is_not_throughput(self):
        result = self.metrics(self.issue(state_reason="not_planned"))
        for name in ["Flow done", "Completion week", "Cycle days"]:
            self.assertIsNone(result[name])

    def test_closed_issue_does_not_accumulate_after_closure_when_done_log_is_missing(self):
        result = self.metrics(comments=self.comments(("in_progress", "2026-11-24T08:00:00Z")))
        self.assertEqual(result["Logged active hours"], 8)

    def test_untrusted_future_and_pre_creation_starts_are_not_used(self):
        comments = self.comments(("in_progress", "2026-11-24T08:00:00Z"))
        comments[0]["author_association"] = "NONE"
        result = self.metrics(comments=comments, board=[{"createdAt": "2026-11-19T00:00:00Z"},
                                                       {"createdAt": "2026-12-01T00:00:00Z"}])
        self.assertIsNone(result["Flow started at"])

    def test_board_start_is_precise_and_earlier_than_resumed_takt_log(self):
        result = self.metrics(comments=self.comments(("in_progress", "2026-11-24T08:00:00Z")),
                              board=[{"createdAt": "2026-11-21T08:00:00Z"}])
        self.assertEqual(result["Start source"], "Board history")
        self.assertAlmostEqual(result["Cycle days"], 3 + 8 / 24, places=6)
        self.assertEqual(result["Logged active hours"], 8)

    def test_completion_week_uses_local_iso_week_across_year_boundary(self):
        result = self.metrics(self.issue(closed_at="2027-01-03T23:30:00Z"), now="2027-01-05T00:00:00Z")
        self.assertEqual(result["Flow done"], "2027-01-04")
        self.assertEqual(result["Completion week"], "2027-W01")

    def test_backlog_does_not_report_active_age(self):
        result = self.metrics(self.issue(state="open", closed_at=None, status={"id": 2}),
                              comments=self.comments(("in_progress", "2026-11-24T08:00:00Z")))
        self.assertIsNone(result["Work age days"])

    def test_invalid_persisted_start_is_rejected(self):
        with self.assertRaises(ValueError):
            self.metrics(current={FIELDS["Flow started at"]: "2026-12-01T00:00:00Z"})

    def test_kind_separates_process_and_verification_from_delivery(self):
        for labels, kind in [(["type:process", "bug"], "Process"), (["type:decision"], "Process"),
                             (["type:verification"], "Verification"), (["type:foundation"], "Delivery"),
                             (["documentation"], "Process"), ([], "Unclassified")]:
            self.assertEqual(insights.work_kind(labels), kind)

    @patch.object(insights, "api")
    def test_updates_are_idempotent_and_never_replace_unrelated_fields(self, api):
        current = {FIELDS["Cycle days"]: 2, FIELDS["Flow kind"]: "Delivery", 999: "Keep this"}
        desired = dict.fromkeys(FIELDS)
        desired["Flow kind"] = "Delivery"
        desired["Flow done"] = "2026-11-24"
        self.assertEqual(insights.write_values("owner/repo", 42, FIELDS, current, desired), 2)
        api.assert_any_call("repos/owner/repo/issues/42/issue-field-values",
                            {"issue_field_values": [{"field_id": FIELDS["Flow done"], "value": "2026-11-24"}]})
        api.assert_any_call(f"repos/owner/repo/issues/42/issue-field-values/{FIELDS['Cycle days']}", method="DELETE")
        api.reset_mock()
        self.assertEqual(insights.write_values("owner/repo", 42, FIELDS,
                         {FIELDS["Flow kind"]: "Delivery", FIELDS["Flow done"]: "2026-11-24", 999: "Keep this"}, desired), 0)
        api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
