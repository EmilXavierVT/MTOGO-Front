# Project Insights and flow evidence

Tracking: [backend #37](https://github.com/EmilXavierVT/MTOGO/issues/37),
[frontend #19](https://github.com/EmilXavierVT/MTOGO-Front/issues/19).
[Open the shared project's Insights](https://github.com/users/EmilXavierVT/projects/7/insights).

The project uses inherited **issue fields** for measurements. This lets each
repository's Actions token update its own issues with `issues: write`, without a
long-lived project token. The field definitions belong to EmilXavierVT; only MTOGO
and MTOGO-Front are configured for collection. Existing board options, manual
estimates/dates, assignments and status synchronization are preserved.

## Measurements

| Field | Source and unit |
| --- | --- |
| Flow kind | Labels classify Delivery, Process, Verification or Unclassified work. |
| Flow started at | First evidenced In progress timestamp, stored in UTC. Unknown remains empty. |
| Start source | Takt log, Board history or Unknown. |
| Flow done | Actual completed issue closure, as a Copenhagen calendar date. |
| Completion week | Actual completed closure's ISO week in Europe/Copenhagen; distinct from the planned Uge. |
| Cycle days | Calendar days from the first evidenced start to the latest completed closure, including review, waiting and reopening intervals. Empty without both endpoints. |
| Logged active hours | Sum of recorded In progress intervals, in calendar hours. |
| Logged review hours | Sum of recorded In review intervals, in calendar hours. |
| Work age days | Calendar days since the first evidenced start for current In progress/In review work; refreshed daily. |

Cycle time and logged hours answer different questions. The latter cover only
trusted Takt comments accepted by the existing parser, including repeated visits
and pauses. They are **not hours worked**. A numeric zero means zero recorded
time; no usable timing log leaves those fields empty. Earlier review/active
intervals may be missing even when a first start can be recovered from board
history. Do not compare these values to person-hour estimates as if they were
actual effort.

The initial owner-run backfill reads real status transitions on **this project**
and saves the earliest observed In progress timestamp. It does not turn issue
creation, assignment, planned dates or a manual date without a timestamp into an
actual start. Future refreshes preserve that earlier timestamp even if the Actions
token cannot read the private project's old timeline. These are the first
**recorded** transitions; unavailable earlier history is not reconstructed.

Closing an issue as not planned does not set completion/cycle/week fields.
Reopening clears those derived values and retains the first evidenced start.
Completing it again uses the latest actual closure; current throughput counts an
issue once in that latest completion week. This is not a count of every repeated
close event. Current board fields cannot reconstruct historical WIP by column;
the existing burn-up chart tracks issue lifecycle state instead.

Process/decision labels take precedence, then verification, then feature,
foundation or bug labels. Documentation-only work is Process; unclassified work
stays separate. A throughput count measures completed **issues**, so linked
backend/frontend issues can both count. It is not a count of distinct features.
Never present extra meetings or controlled verification issues as more product
delivery.

## Refreshing and evidence

Each repository runs `.github/workflows/project-insights.yml` after Issue time and
Ready runs, on issue creation/closure/reopening/label changes, and daily at
05:17 UTC. The workflow always checks out the default branch, never the triggering
workflow's head. Field-change events are not subscribed, avoiding refresh loops.
Daily sweeps update only issues already opted into the metric fields; issue events
initialize newly tracked issues.

The workflow summary states the collection time and number of updates. Its
`project-insights` JSON artifact contains per-issue values and timing-comment
links and is retained for 90 days. Issue field changes also remain in the issue
timeline. The private owner-run initial snapshot additionally retains the source
board transition IDs. API failures fail the collection visibly; they do not change
application delivery, rewrite status history or publish application code.

Read-only preview and an explicit write:

```sh
python3 scripts/project_insights.py --repo EmilXavierVT/MTOGO --issue 37
python3 scripts/project_insights.py --repo EmilXavierVT/MTOGO --issue 37 --apply
# Owner-only initial history backfill (requires existing project access):
python3 scripts/project_insights.py --repo EmilXavierVT/MTOGO --issue 37 --board-history --apply
# Routine refresh of already tracked issues:
python3 scripts/project_insights.py --repo EmilXavierVT/MTOGO --all --tracked-only --apply
```

Use the equivalent repository argument for MTOGO-Front. `.flow-insights.json` holds
the shared non-secret field IDs. Updates use additive POST and field-specific
clears; unrelated issue fields are never replaced. No empty bulk update is sent.
Completion week options cover the repository's first week (2026-W46) through
2027-W52. Before a later week is needed, the account owner must extend the existing
field's options in Settings → Planning → Issue fields; repository tokens cannot
change account-wide definitions. Unsupported options cause a visible API failure.

## Chart definitions

Keep the default Burn up and Status charts. Use these current charts alongside
them:

| Chart | Configuration |
| --- | --- |
| Weekly throughput | Completion week, count of issues, grouped by Flow kind; completed issues only. |
| Cycle time | Repository, average Cycle days; completed issues with an evidenced cycle. |
| Logged review time | Repository, average Logged review hours; completed issues with a timing log. |
| Work in progress | Status, count of issues, grouped by Repository; In progress/In review only. |
| Work by kind | Flow kind, count of issues, grouped by Status. |
| Timing coverage | Start source, count of issues, grouped by Repository; work that has started or finished. |

The existing historical chart named Throughput is renamed Completion trend because
it is cumulative lifecycle progress, not completions per week. Filters and
configuration can be inspected in GitHub's Configure panel. Empty timing values
are excluded from averages rather than counted as zero.

Sources: [issue fields in projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-issue-fields),
[issue field values API](https://docs.github.com/en/rest/issues/issue-field-values),
[chart configuration](https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/configuring-charts),
[Takt timing semantics](takt-workflow.md#issue-time).
