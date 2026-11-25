#!/usr/bin/env python3
"""Takt delivery metadata, issue-based versions and issue flow times (stdlib only)."""

import argparse
import datetime as dt
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
SHA = re.compile(r"[0-9a-f]{40}")
VERSION = re.compile(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
MARKER = re.compile(r"<!-- mtogo-flow:v1 (\{[^\n]*\}) -->")
STATES = {
    "backlog": "Backlog", "todo": "Todo", "in_progress": "In progress",
    "review": "In review", "done": "Done", "not_planned": "Not planned",
    "duplicate": "Duplicate",
}
TERMINAL_STATES = {"done", "not_planned", "duplicate"}
TRUSTED = {"OWNER", "MEMBER", "COLLABORATOR"}
PATCH_LABELS = {
    "bug", "documentation", "type:foundation", "type:verification",
    "type:process", "type:decision",
}


def run(args, *, cwd=None, capture=True, input_text=None, env=None):
    result = subprocess.run(
        [str(arg) for arg in args], cwd=cwd or ROOT, text=True, input=input_text,
        capture_output=capture, env=env,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or "").strip() or f"{args[0]} exited {result.returncode}")
    return result.stdout.strip() if capture else ""


def git(*args):
    return run(["git", *args])


def api(endpoint, payload=None):
    args = ["gh", "api", endpoint]
    if payload is not None:
        args += ["--method", "POST", "--input", "-"]
    result = json.loads(run(args, input_text=json.dumps(payload) if payload is not None else None))
    if isinstance(result, dict) and result.get("errors"):
        raise RuntimeError("; ".join(item["message"] for item in result["errors"]))
    return result


def pages(endpoint, key=None):
    endpoint += ("&" if "?" in endpoint else "?") + "per_page=100"
    result = json.loads(run(["gh", "api", "--paginate", "--slurp", endpoint]))
    return [item for page in result for item in (page[key] if key else page)]


def repository():
    value = os.environ.get("GITHUB_REPOSITORY") or json.loads(
        run(["gh", "repo", "view", "--json", "nameWithOwner"])
    )["nameWithOwner"]
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", value):
        raise ValueError("Invalid repository name")
    return value


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Flow timestamps must include a timezone")
    return parsed.astimezone(UTC)


def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def change_kind(labels):
    labels = set(labels)
    if "release:major" in labels:
        return "major"
    if "breaking-change" in labels:
        return "breaking"
    if labels & {"type:feature", "enhancement"}:
        return "minor"
    if labels & PATCH_LABELS:
        return "patch"
    raise ValueError("Classify the issue: feature/enhancement, bug, documentation or a supported type:* label")


def parse_version(tag):
    match = VERSION.fullmatch(tag)
    if not match:
        raise ValueError(f"Not a stable version tag: {tag}")
    return tuple(int(part) for part in match.groups())


def next_version(previous, kind):
    if kind not in {"major", "breaking", "minor", "patch"}:
        raise ValueError("Unknown release bump")
    if previous is None:
        return "v1.0.0" if kind == "major" else "v0.1.0"
    major, minor, patch = parse_version(previous)
    if kind == "major" or (kind == "breaking" and major > 0):
        return f"v{major + 1}.0.0"
    if kind in {"minor", "breaking"}:
        return f"v{major}.{minor + 1}.0"
    return f"v{major}.{minor}.{patch + 1}"


def latest_version(commit):
    tags = git("tag", "--merged", commit, "--list", "v[0-9]*").splitlines()
    tags = [tag for tag in tags if VERSION.fullmatch(tag)]
    return max(tags, key=parse_version) if tags else None


def validate_plan(plan, repo, sha):
    if plan.get("schema") != 1 or plan.get("repository") != repo or plan.get("sha") != sha:
        raise ValueError("Release plan does not match the verified repository and commit")
    for field in ("sha", "parent", "source_sha", "tree"):
        if not isinstance(plan.get(field), str) or not SHA.fullmatch(plan[field]):
            raise ValueError(f"Invalid {field} in release plan")
    if type(plan.get("issue")) is not int or plan["issue"] < 1:
        raise ValueError("Invalid issue in release plan")
    source = plan.get("source_branch", "")
    if not re.fullmatch(r"[0-9]+-[A-Za-z0-9._/-]+", source) or ".." in source:
        raise ValueError("Invalid source branch")
    if int(source.split("-", 1)[0]) != plan["issue"]:
        raise ValueError("Issue does not match source branch")
    labels = plan.get("labels")
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ValueError("Invalid issue labels")
    if change_kind(labels) != plan.get("bump"):
        raise ValueError("Release bump does not match frozen labels")
    return plan


def assert_candidate(sha, parent):
    if not SHA.fullmatch(sha) or not SHA.fullmatch(parent):
        raise ValueError("Expected full commit SHAs")
    parents = git("show", "-s", "--format=%P", sha).split()
    if parents != [parent]:
        raise ValueError("Ready commit must have exactly one parent: current main. Sync and deliver again.")


def remote_head(branch):
    result = git("ls-remote", "--heads", "origin", f"refs/heads/{branch}")
    return result.split()[0] if result else None


def ready_plan(repo, branch, sha):
    match = re.fullmatch(r"ready/([0-9]+-[A-Za-z0-9._/-]+)", branch)
    if not match:
        raise ValueError("Expected ready/<issue-number>-<branch>")
    source = match[1]
    issue_number = int(source.split("-", 1)[0])
    git("fetch", "origin", "main", "--tags")
    parent = git("rev-parse", "FETCH_HEAD")
    assert_candidate(sha, parent)
    if remote_head(branch) != sha:
        raise ValueError("Ready branch moved; this run is superseded")
    source_sha = remote_head(source)
    if not source_sha:
        raise ValueError("Development branch is missing")
    git("fetch", "origin", f"refs/heads/{source}")
    tree = git("rev-parse", f"{sha}^{{tree}}")
    if git("rev-parse", f"{source_sha}^{{tree}}") != tree:
        raise ValueError("Development branch changed after delivery; deliver its current tree again")
    issue = api(f"repos/{repo}/issues/{issue_number}")
    if "pull_request" in issue:
        raise ValueError("Delivery must reference an issue, not a PR")
    labels = sorted(label["name"] for label in issue["labels"])
    return validate_plan({
        "schema": 1, "repository": repo, "sha": sha, "parent": parent,
        "tree": tree, "source_sha": source_sha, "source_branch": source,
        "issue": issue_number, "labels": labels, "bump": change_kind(labels),
    }, repo, sha)


def verified_plan(repo, sha):
    """Read only the immutable plan uploaded by a successful verification job."""
    runs = pages(f"repos/{repo}/actions/workflows/ready.yml/runs?head_sha={sha}&event=push", "workflow_runs")
    for workflow in sorted(runs, key=lambda item: (item["run_number"], item["run_attempt"]), reverse=True):
        if workflow["head_sha"] != sha or not workflow["head_branch"].startswith("ready/"):
            continue
        jobs = pages(f"repos/{repo}/actions/runs/{workflow['id']}/jobs", "jobs")
        if not any(job["name"] == "Takt verification" and job["conclusion"] == "success" for job in jobs):
            continue
        artifacts = pages(f"repos/{repo}/actions/runs/{workflow['id']}/artifacts", "artifacts")
        artifact = next((item for item in artifacts if item["name"] == "release-plan" and not item["expired"]), None)
        if not artifact:
            continue
        content = subprocess.check_output(["gh", "api", f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"], cwd=ROOT)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            info = archive.getinfo("release-plan.json")
            if info.file_size > 100_000:
                raise ValueError("Release plan is unexpectedly large")
            return validate_plan(json.loads(archive.read(info)), repo, sha)
    raise ValueError(f"No successful Takt verification and release plan found for {sha}")


def flow_events(comments):
    events = []
    seen = set()
    for comment in comments:
        if comment.get("author_association") not in TRUSTED and comment.get("user", {}).get("login") != "github-actions[bot]":
            continue
        match = MARKER.search(comment.get("body") or "")
        if not match:
            continue
        try:
            event = json.loads(match[1])
            at = timestamp(event["at"])
            key = event["key"]
            if event["state"] not in STATES or not isinstance(key, str) or not key or key in seen:
                continue
            # A client may backdate an explicit start, but cannot start an interval in the future.
            if at > timestamp(comment["created_at"]) + dt.timedelta(minutes=1):
                continue
            seen.add(key)
            events.append({**event, "time": at, "id": comment["id"]})
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(events, key=lambda event: (event["time"], event["id"]))


def flow_summary(events, now=None):
    now = now or dt.datetime.now(UTC)
    totals = {"in_progress": 0.0, "review": 0.0}
    state, since = None, None
    for event in sorted(events, key=lambda item: (item["time"], item["id"])):
        if event["time"] > now:
            continue
        if event["state"] == state:
            continue
        if state in totals:
            totals[state] += (event["time"] - since).total_seconds()
        state, since = event["state"], event["time"]
    current = max(0.0, (now - since).total_seconds()) if since and state not in TERMINAL_STATES else 0.0
    if state in totals:
        totals[state] += current
    return {"state": state, "since": iso(since) if since else None, "current_seconds": current, "totals": totals, "as_of": iso(now)}


def duration(seconds):
    minutes = int(seconds // 60)
    days, minutes = divmod(minutes, 1440)
    hours, minutes = divmod(minutes, 60)
    return (f"{days}d " if days else "") + f"{hours}h {minutes}m"


def flow_report(summary):
    state = STATES.get(summary["state"], "Not recorded")
    since = timestamp(summary["since"]).astimezone(ZoneInfo("Europe/Copenhagen")).strftime("%d %b %Y %H:%M %Z") if summary["since"] else "not recorded"
    return (
        f"State: **{state}** · since {since}\n\n"
        f"| Time | Duration |\n| --- | --- |\n"
        f"| Current state | {duration(summary['current_seconds'])} |\n"
        f"| Total In progress | {duration(summary['totals']['in_progress'])} |\n"
        f"| Total In review | {duration(summary['totals']['review'])} |\n\n"
        f"As of {summary['as_of']}. Calendar time, including nights and weekends."
    )


def record_flow(repo, issue, state, key, at=None):
    comments = pages(f"repos/{repo}/issues/{issue}/comments")
    events = flow_events(comments)
    if any(event["key"] == key for event in events):
        return
    now = dt.datetime.now(UTC)
    event = {"state": state, "at": at or iso(now), "key": key}
    if timestamp(event["at"]) > now:
        raise ValueError("Cannot record a future transition")
    # Keep explicit, older transitions even when the latest state is identical:
    # a delayed In progress event can belong before an already-recorded review.
    if at is None and events and events[-1]["state"] == state:
        return
    summary = flow_summary([*events, {**event, "time": timestamp(event["at"]), "id": 2**63}], now)
    body = f"Moved to **{STATES[state]}**.\n\n{flow_report(summary)}\n\n<!-- mtogo-flow:v1 {json.dumps(event, sort_keys=True)} -->"
    api(f"repos/{repo}/issues/{issue}/comments", {"body": body})


def project_state(repo, issue, state):
    config = json.loads((ROOT / ".tt-config.json").read_text())["project"]
    query = """query($owner:String!,$number:Int!){
      user(login:$owner){projectV2(number:$number){id fields(first:50){nodes{
        ... on ProjectV2SingleSelectField{id name options{id name}}
      }}}}}"""
    data = api("graphql", {"query": query, "variables": {"owner": config["owner"], "number": config["number"]}})
    project = data["data"]["user"]["projectV2"]
    field = next(item for item in project["fields"]["nodes"] if item.get("name") == "Status")
    names = {STATES[state], "Review"} if state == "review" else {STATES[state]}
    option = next(item for item in field["options"] if item["name"] in names)
    content = api(f"repos/{repo}/issues/{issue}")["node_id"]
    item = api("graphql", {
        "query": "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}",
        "variables": {"p": project["id"], "c": content},
    })["data"]["addProjectV2ItemById"]["item"]["id"]
    api("graphql", {
        "query": "mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}",
        "variables": {"p": project["id"], "i": item, "f": field["id"], "o": option["id"]},
    })


def promotion_check(plan):
    repo, sha = repository(), os.environ["GITHUB_SHA"]
    validate_plan(plan, repo, sha)
    baseline = os.environ.get("TAKT_BASE_SHA", "")
    if not SHA.fullmatch(baseline):
        raise ValueError("Set TAKT_BASE_SHA before enabling automatic delivery")
    git("merge-base", "--is-ancestor", baseline, plan["parent"])
    if remote_head("ready/" + plan["source_branch"]) != sha:
        raise ValueError("Ready branch changed; refusing a superseded delivery")
    parent = remote_head("main")
    assert_candidate(sha, parent)
    if parent != plan["parent"]:
        raise ValueError("Main advanced; sync and deliver again")
    if remote_head(plan["source_branch"]) != plan["source_sha"]:
        raise ValueError("Development branch advanced; deliver its current work")


def finalize(plan):
    repo, sha = plan["repository"], plan["sha"]
    git("fetch", "origin", "main")
    git("merge-base", "--is-ancestor", sha, "FETCH_HEAD")
    if remote_head(plan["source_branch"]) != plan["source_sha"]:
        print("Development branch advanced; preserving it and leaving the issue open.")
        return
    # Leases make deletion conditional even if another push races the checks above.
    for branch, expected in [
        ("ready/" + plan["source_branch"], sha), (plan["source_branch"], plan["source_sha"]),
    ]:
        if remote_head(branch) == expected:
            git("push", f"--force-with-lease=refs/heads/{branch}:{expected}", "origin", f":refs/heads/{branch}")
    # Repeated runs do not add another transition; issue closure is also idempotent.
    record_flow(repo, plan["issue"], "done", f"done:{sha}")
    run(["gh", "issue", "close", str(plan["issue"]), "--repo", repo])


def planning_state(status):
    """Match stable repository status IDs, independently of display-name edits."""
    if not isinstance(status, dict):
        return None
    config = json.loads((ROOT / ".tt-config.json").read_text())
    status_ids = config.get("flow", {}).get("status_ids", {})
    return next((state for state, value in status_ids.items()
                 if state in STATES and value == status.get("id")), None)


def event_handler(path):
    event = json.loads(Path(path).read_text())
    repo = event["repository"]["full_name"]
    action = event.get("action")
    if event.get("issue", {}).get("pull_request"):
        return
    if "comment" in event:
        comment = event["comment"]
        if comment.get("author_association") not in TRUSTED or (comment.get("body") or "").strip() != "/flow time":
            return
        number = event["issue"]["number"]
        summary = flow_summary(flow_events(pages(f"repos/{repo}/issues/{number}/comments")))
        api(f"repos/{repo}/issues/{number}/comments", {"body": flow_report(summary)})
    elif "issue" in event and action == "status_changed":
        issue = event["issue"]
        # The top-level status describes this transition. issue.status is a later
        # snapshot and can already show another column when changes happen quickly.
        status = event.get("status")
        state = planning_state(status)
        if state is None:
            return
        previous = event.get("changes", {}).get("status", {}).get("from") or {}
        at = iso(timestamp(issue["updated_at"]))
        key = f"status:{at}:{previous.get('id', 'none')}:{status['id']}"
        record_flow(repo, issue["number"], state, key, at=at)
    elif "issue" in event and action in {"closed", "reopened"}:
        issue = event["issue"]
        # Native statuses emit status_changed too. Let that event record the
        # captured transition; lifecycle payloads may describe a newer status.
        if planning_state(issue.get("status")) is not None:
            return
        if not flow_events(pages(f"repos/{repo}/issues/{issue['number']}/comments")):
            return
        state = "done" if action == "closed" else "in_progress"
        record_flow(repo, issue["number"], state, f"issue:{action}:{issue['updated_at']}")


def branch_issue():
    match = re.match(r"^(\d+)-", git("branch", "--show-current"))
    if not match:
        raise ValueError("Use an issue-prefixed branch created by gh workon")
    return int(match[1])


def setup_labels(repo):
    labels = dict(json.loads((ROOT / ".tt-config.json").read_text())["labels"])
    labels.update({
        "bug": {"color": "d73a4a", "description": "Bug fix; patch image version"},
        "documentation": {"color": "0075ca", "description": "Documentation; patch image version"},
        "enhancement": {"color": "a2eeef", "description": "New capability; minor image version"},
        "breaking-change": {"color": "b60205", "description": "Breaking change; minor under 0.x, major after 1.0"},
        "release:major": {"color": "b60205", "description": "Explicit major release, including starting 1.0.0"},
    })
    existing = {label["name"] for label in pages(f"repos/{repo}/labels")}
    for name, metadata in labels.items():
        if name not in existing:
            api(f"repos/{repo}/labels", {"name": name, "color": metadata["color"], "description": metadata["description"]})
            print(f"Created {name}")


def main():
    # Forward all upstream workon flags without introducing a second argument dialect.
    if len(sys.argv) > 1 and sys.argv[1] == "workon":
        run(["gh", "tt", "workon", *sys.argv[2:]], capture=False)
        record_flow(repository(), branch_issue(), "in_progress", "workon:" + iso(dt.datetime.now(UTC)))
        return
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    ready = commands.add_parser("ready-plan")
    ready.add_argument("--output", required=True)
    for name in ("check-promotion", "finalize"):
        command = commands.add_parser(name)
        command.add_argument("--plan", required=True)
    commands.add_parser("deliver")
    commands.add_parser("setup-labels")
    flow = commands.add_parser("flow")
    flow.add_argument("action", choices=["start", "review", "backlog", "done", "time"])
    flow.add_argument("--issue", type=int)
    flow.add_argument("--comment", action="store_true")
    event = commands.add_parser("event")
    event.add_argument("--path", required=True)
    args = parser.parse_args()
    if args.command == "ready-plan":
        plan = ready_plan(repository(), os.environ["GITHUB_REF_NAME"], os.environ["GITHUB_SHA"])
        Path(args.output).write_text(json.dumps(plan, indent=2) + "\n")
        record_flow(plan["repository"], plan["issue"], "review", f"review:{plan['sha']}")
    elif args.command == "check-promotion":
        promotion_check(json.loads(Path(args.plan).read_text()))
    elif args.command == "finalize":
        finalize(json.loads(Path(args.plan).read_text()))
    elif args.command == "deliver":
        branch_issue()
        if git("status", "--porcelain"):
            raise ValueError("Commit or stash all work before delivery")
        run([ROOT / "scripts/check.sh", "verify"], capture=False)
        env = {**os.environ, "TAKT_CHECKS_PASSED": "1"}
        run(["gh", "tt", "deliver"], capture=False, env=env)
        branch = git("branch", "--show-current")
        sha = remote_head("ready/" + branch)
        if sha:
            record_flow(repository(), branch_issue(), "review", f"review:{sha}")
    elif args.command == "flow":
        repo = repository()
        issue = args.issue or branch_issue()
        if args.action == "time":
            report = flow_report(flow_summary(flow_events(pages(f"repos/{repo}/issues/{issue}/comments"))))
            print(report)
            if args.comment:
                api(f"repos/{repo}/issues/{issue}/comments", {"body": report})
        else:
            state = {"start": "in_progress", "review": "review", "backlog": "backlog", "done": "done"}[args.action]
            project_state(repo, issue, state)
            record_flow(repo, issue, state, f"manual:{iso(dt.datetime.now(UTC))}")
            if state == "done":
                run(["gh", "issue", "close", str(issue), "--repo", repo])
    elif args.command == "event":
        event_handler(args.path)
    elif args.command == "setup-labels":
        setup_labels(repository())


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, StopIteration, OSError) as error:
        print(f"Takt: {error}", file=sys.stderr)
        sys.exit(1)
