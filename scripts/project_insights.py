#!/usr/bin/env python3
"""Refresh shared MTOGO Project Insights through inherited issue fields."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from zoneinfo import ZoneInfo

import takt

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ZoneInfo("Europe/Copenhagen")


def api(endpoint, payload=None, method=None, paginate=False):
    args = ["gh", "api", "-H", "X-GitHub-Api-Version: 2026-03-10", endpoint]
    if paginate:
        args += ["--paginate", "--slurp"]
    if method or payload is not None:
        args += ["--method", method or "POST"]
    if payload is not None:
        args += ["--input", "-"]
    result = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True, timeout=120, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"GitHub API failed: {endpoint}")
    data = json.loads(result.stdout) if result.stdout.strip() else None
    if isinstance(data, dict) and data.get("errors"):
        raise RuntimeError("; ".join(error["message"] for error in data["errors"]))
    if paginate:
        return [item for page in data for item in page]
    return data


def pages(endpoint):
    return api(endpoint + ("&" if "?" in endpoint else "?") + "per_page=100", paginate=True)


def field_values(entries):
    return {entry["issue_field_id"]: (entry.get("single_select_option") or {}).get("name", entry["value"])
            for entry in entries}


def work_kind(labels):
    labels = {label["name"] if isinstance(label, dict) else label for label in labels}
    if labels & {"type:process", "type:decision"}:
        return "Process"
    if "type:verification" in labels:
        return "Verification"
    if labels & {"type:feature", "enhancement", "type:foundation", "bug", "breaking-change", "release:major"}:
        return "Delivery"
    return "Process" if "documentation" in labels else "Unclassified"


def metrics(issue, comments, current, fields, now, board_starts=()):
    """Keep calendar cycle time distinct from the intervals actually logged."""
    created = takt.timestamp(issue["created_at"])
    completed = issue["state"] == "closed" and issue.get("state_reason") == "completed"
    closed = takt.timestamp(issue["closed_at"]) if issue.get("closed_at") else None
    cutoff = min(now, closed) if closed and issue["state"] == "closed" else now
    events = [event for event in takt.flow_events(comments) if created <= event["time"] <= cutoff]
    starts = [(event["time"], "Takt log") for event in events if event["state"] == "in_progress"]
    for event in board_starts:
        at = takt.timestamp(event["createdAt"])
        if created <= at <= cutoff:
            starts.append((at, "Board history"))
    saved = current.get(fields["Flow started at"])
    if saved:
        at = takt.timestamp(saved)
        if not created <= at <= now:
            raise ValueError(f"Invalid saved start on issue #{issue['number']}")
        starts.append((at, current.get(fields["Start source"], "Unknown")))
    first, source = min(starts, key=lambda item: item[0]) if starts else (None, "Unknown")
    values = dict.fromkeys(fields)
    values["Flow kind"] = work_kind(issue.get("labels", []))
    values["Flow started at"] = takt.iso(first) if first else None
    values["Start source"] = source
    if completed and closed and closed <= now:
        local_closed = closed.astimezone(LOCAL)
        values["Flow done"] = local_closed.date().isoformat()
        values["Completion week"] = local_closed.strftime("%G-W%V")
        if first and first <= closed:
            values["Cycle days"] = round((closed - first).total_seconds() / 86400, 6)
    # Empty logs mean unknown duration. A logged start with no review records
    # means zero *logged* review, not proof that historical review never occurred.
    if any(event["state"] in {"in_progress", "review"} for event in events):
        totals = takt.flow_summary(events, cutoff)["totals"]
        values["Logged active hours"] = round(totals["in_progress"] / 3600, 6)
        values["Logged review hours"] = round(totals["review"] / 3600, 6)
    status = issue.get("status")
    active = status.get("id") in {4, 8} if status else bool(events and events[-1]["state"] in {"in_progress", "review"})
    if first and issue["state"] == "open" and active:
        values["Work age days"] = round((now - first).total_seconds() / 86400, 6)
    return values


def board_starts(repo, number, project_id):
    owner, name = repo.split("/")
    query = """query($owner:String!,$repo:String!,$number:Int!,$after:String){
      repository(owner:$owner,name:$repo){issue(number:$number){
        timelineItems(first:100,after:$after,itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){
          nodes{... on ProjectV2ItemStatusChangedEvent{id createdAt status project{id}}}
          pageInfo{hasNextPage endCursor}
        }
      }}
    }"""
    result, after = [], None
    while True:
        connection = api("graphql", {"query": query, "variables": {
            "owner": owner, "repo": name, "number": number, "after": after,
        }})["data"]["repository"]["issue"]["timelineItems"]
        result += [event for event in connection["nodes"] if event and event["status"] == "In progress"
                   and (event.get("project") or {}).get("id") == project_id]
        if not connection["pageInfo"]["hasNextPage"]:
            return result
        after = connection["pageInfo"]["endCursor"]


def write_values(repo, number, fields, current, desired):
    additions, removals = [], []
    for name, field_id in fields.items():
        value = desired[name]
        if value is None and field_id in current:
            removals.append(field_id)
        elif value is not None and current.get(field_id) != value:
            additions.append({"field_id": field_id, "value": value})
    endpoint = f"repos/{repo}/issues/{number}/issue-field-values"
    # POST changes only named fields; PUT or an empty POST would clear unrelated
    # fields. Clear only specific, owned derived values that became inapplicable.
    if additions:
        api(endpoint, {"issue_field_values": additions})
    for field_id in removals:
        api(f"{endpoint}/{field_id}", method="DELETE")
    return len(additions) + len(removals)


def sync_issue(repo, number, config, now, apply=False, history=False, tracked_only=False):
    issue = api(f"repos/{repo}/issues/{number}")
    if issue.get("pull_request"):
        return None
    fields = config["fields"]
    current = field_values(pages(f"repos/{repo}/issues/{number}/issue-field-values"))
    if tracked_only and fields["Flow kind"] not in current:
        return None
    comments = pages(f"repos/{repo}/issues/{number}/comments")
    history_starts = board_starts(repo, number, config["project_id"]) if history else []
    desired = metrics(issue, comments, current, fields, now, history_starts)
    changed = write_values(repo, number, fields, current, desired) if apply else 0
    return {"repository": repo, "number": number, "url": issue["html_url"], "title": issue["title"],
            "state": issue["state"], "status": (issue.get("status") or {}).get("name"),
            "metrics": desired, "changed_fields": changed, "board_start_evidence": history_starts,
            "timing_comments": [comment["html_url"] for comment in comments
                                if takt.flow_events([comment])]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--issue", type=int, action="append")
    scope.add_argument("--all", action="store_true")
    parser.add_argument("--tracked-only", action="store_true", help="Skip issues not yet opted into the metric fields")
    parser.add_argument("--board-history", action="store_true", help="Owner-only initial backfill from actual project history")
    parser.add_argument("--apply", action="store_true", help="Write derived issue field values; default is read-only")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config = json.loads((ROOT / ".flow-insights.json").read_text())
    if args.repo not in config["repositories"] or not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo):
        parser.error("Choose one of the configured MTOGO repositories with --repo")
    numbers = args.issue or [issue["number"] for issue in pages(f"repos/{args.repo}/issues?state=all")
                            if "pull_request" not in issue]
    if any(number <= 0 for number in numbers):
        parser.error("Issue numbers must be positive")
    now = dt.datetime.now(takt.UTC)
    records = []
    for number in numbers:
        record = sync_issue(args.repo, number, config, now, args.apply, args.board_history, args.tracked_only)
        if record:
            records.append(record)
            print(f"#{number}: {record['metrics']['Flow kind']}; start={record['metrics']['Start source']}; "
                  f"changed fields={record['changed_fields']}", flush=True)
    report = {"as_of": takt.iso(now), "repository": args.repo, "applied": args.apply, "issues": records}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    summary = (f"Project Insights: {len(records)} tracked issues; "
               f"{sum(record['changed_fields'] for record in records)} field updates. As of {report['as_of']}.")
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as stream:
            stream.write(summary + "\n\nCalendar time; missing starts stay unknown. "
                         "Logged hours cover only recorded intervals. See docs/project-insights.md.\n")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.TimeoutExpired) as error:
        print(f"Project Insights: {error}", file=sys.stderr)
        sys.exit(1)
