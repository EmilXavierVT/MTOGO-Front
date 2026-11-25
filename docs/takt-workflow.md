# Local checks, Takt delivery and issue time

Automatic Takt delivery and issue-based image publication are controlled separately
in each repository by the GitHub Actions variable `TAKT_ENABLED`. They are active
only when its value is exactly `true`. Installing or merging the workflow files does
not enable delivery; complete the maintainer cutover below to activate it.

Before activation, use the existing PR workflow. After activation, `gh deliver`
verifies and delivers an issue branch without a PR. Check the repository variable
and main branch protection in GitHub when confirming which workflow is active.

Tracking issue: [MTOGO #98](https://github.com/EmilXavierVT/MTOGO/issues/98);
frontend implementation: [MTOGO-Front #9](https://github.com/EmilXavierVT/MTOGO-Front/issues/9).

## Check locally

Use Java 17 for the backend, Node 24 for the frontend, and Python 3.9+ for the
delivery tools. Maven Wrapper pins Maven 3.9.16. On macOS the check script selects
Java 17 with java_home; on Linux/WSL set JAVA_HOME or put Java 17 on PATH.
On Windows, run the shell tools inside WSL. Install gh, Git and the runtime inside
that same environment.

In the frontend, select Node 24 (nvm use) and run npm ci once. Repeat npm ci after
package-lock.json changes, not before every check.

| Command | Backend | Frontend |
| --- | --- | --- |
| ./scripts/check.sh quick | Delivery-tool tests, Checkstyle, JUnit | Delivery-tool tests, ESLint, generated route types, TypeScript, Vitest |
| ./scripts/check.sh verify | Above plus packaging, PMD and JaCoCo gates | Above plus production build |

Local runs retain caches. Backend delivery CI adds clean to verify. The existing
PMD failure priorities and 5% coverage floor are preserved; Checkstyle uses the
existing XML and keeps import warnings nonblocking. Neither command starts Docker.
MegaLinter remains a separate manual workflow.

## Set up the developer commands

After reviewing the scripts:

~~~sh
gh auth login
gh auth refresh -s project
./scripts/setup-local.sh
# Optional: install the quick check before each push.
./scripts/setup-local.sh --hooks
~~~

Setup installs the pinned gh-tt extension and imports workon, wrapup, deliver and
flow aliases, replacing aliases with those names. An existing different
core.hooksPath is preserved; it is never silently replaced.
To remove this repository's optional hook, run git config --local --unset core.hooksPath.
No changes to global Java or Node configuration are required.

## Day-to-day delivery

~~~sh
gh workon -i 42
# Develop and collaborate. The issue is assigned and put In progress.
./scripts/check.sh quick
gh wrapup -m "Describe this step"

git fetch origin
git rebase origin/main
gh deliver
~~~

Main is the only long-lived branch. Each repository uses its own issues and
short-lived issue-number branches. Cross-repository work uses linked issues.
RESPONSIBLES initially assigns all paths to @EmilXavierVT. Collaborate during
development; after activation PR approval is replaced by the automated delivery gate.

The deliver alias runs local verification before calling upstream gh-tt. A clean
workspace is required: uncommitted changes are not silently left out. gh-tt prepares
one commit with the same tree as the development branch and pushes ready/<branch>.
The ready workflow freezes the issue classification, validates the branch heads,
runs the same verification and saves release-plan.json for that exact SHA.
Ordinary issue-branch pushes do not start remote checks.

When activated, delivery rechecks main, the ready branch and the development branch,
then fast-forwards the verified SHA into main. Main is never force-pushed. If a
teammate advances main, sync and deliver again. A failed verification leaves main and
the issue open. Continue on the development branch, run gh workon to resume its timer,
and deliver again when ready.

After success, unchanged branches are deleted using expected-SHA leases and the
issue is closed. Newer shared-branch work is preserved. Issue closure moves the card
to Done when the project's closed-item workflow is configured.

## Issue time

The shared MTOGO board uses **Backlog**, **In progress**, **In review** and **Done**.
Keep the project's issue-status synchronization enabled. GitHub matches board
options to native issue statuses by name, so the former Review column is renamed
In review. Repository status IDs are configured in `.tt-config.json` under
`flow.status_ids`; verify them with `gh api repos/<owner>/<repo>/planning-statuses`.

Dragging an issue to a matching column sends an `issues.status_changed` event.
The Issue time workflow records it in the existing timestamped issue-comment log:

| Destination | Timing effect |
| --- | --- |
| In progress | Start or resume accumulated development time |
| In review | Start or resume accumulated review time |
| Backlog or Todo | Pause development/review accumulation |
| Done, Not planned or Duplicate | Stop development/review accumulation |

Choosing a closed status also closes the issue; choosing an open status for a
closed issue reopens it. Reopening normally returns it to Backlog. These are
GitHub's native status semantics. Dragging a card does not create a code branch,
verify changes, promote code or publish an image. Continue using `gh workon`,
`gh wrapup` and `gh deliver` for the code workflow.

~~~sh
gh flow time --issue 42
gh flow time --issue 42 --comment
# Command alternatives to board moves:
gh flow review --issue 42
gh flow start --issue 42
gh flow backlog --issue 42
gh flow done --issue 42
~~~

Reports show the current state and its start, plus accumulated In progress and
In review time across repeated visits. Repeated states do not reset the interval.
Duplicate event keys are ignored, and explicitly timestamped transitions are sorted
chronologically even when Actions receives them out of order. Workon, deliver and
manual flow commands remain compatible with the same log. Lifecycle events remain
a fallback for repositories without native issue statuses.

Native status logs use the issue update timestamp captured in the webhook payload,
not when an Actions runner starts. The top-level event status identifies the move;
the issue's snapshot can already show a later status. GitHub timestamps have
one-second precision, and a payload built after another issue update can carry that
later update time. This is captured-event timing, not a guarantee of the exact
physical drag instant. Posting the comment can be delayed until Actions runs.

Times are stored in UTC and displayed in Europe/Copenhagen. Reports measure
**calendar time**, including evenings, weekends and blocked periods, rather than
hours worked. Existing history is preserved; enabling this workflow does not
invent missing historical transitions.

An owner or collaborator can comment `/flow time` to receive a fresh report.
Reports are snapshots with an explicit as-of time. The timing log accepts only
collaborator, member, owner or GitHub Actions bot comments. The workflow needs only
its existing repository token and cannot deliver application code.

Sources: [GitHub issue-status synchronization](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issue-statuses#syncing-statuses-with-projects),
[status-change events](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/issue-status-webhooks-and-workflows).

## Automatic versions

Versions are independent for emilxvt/mtogo and emilxvt/mtogo-front.
The backend continues from v0.1.0. The frontend's first release is v0.1.0 unless an
explicit major release is selected.

| Issue labels | Bump |
| --- | --- |
| release:major | Major, including the deliberate transition to 1.0.0 |
| breaking-change | Minor under 0.x; major from 1.x onwards |
| type:feature or enhancement | Minor |
| bug, documentation, type:foundation, type:verification, type:process, type:decision | Patch |

The largest applicable bump wins. An issue with no recognized classification cannot
be delivered. Labels are frozen during ready verification, so later edits cannot
reinterpret a publication already in progress.

After delivery, the publisher processes every main commit after TAKT_BASE_SHA in
ancestry order, even if workflow runs were queued in a different order. Each commit
must have a successful Takt verification and a matching saved release plan.
It builds at most one SHA image, adds the semantic image tag, verifies both digests,
then writes a matching annotated Git tag. Published Git version tags are the release
ledger. Retries reuse the SHA image and allocated version and refuse to reassign a
version to another digest. Older queued commits get versions but cannot replace
latest while a newer commit is on main.

Example: feature issue -> v0.2.0; next bug -> v0.2.1. Git tags, image tags and image
revision labels all refer to the delivered SHA. The build uses a separate Docker Hub
buildcache tag; Watchtower continues following latest. No extra version-bump commit
is written to main.

The backend manual version workflow can verify/promote an existing Git version tag
using the existing SHA image. It checks exact-SHA Takt evidence when enabled, or
legacy CI while disabled. An existing matching image version is a no-op; a different
digest is rejected. Weekly demo notes may select an existing automatic version.

## Maintainer cutover after team validation

Do this separately in each repository. Keep automatic delivery disabled until the
prepared ready commit passes verification and the required settings are in place.

1. Merge the reviewed bootstrap PR under the current PR rules. Run local quick/verify
   checks and the new CI. Keep a copy of the existing main protection settings.
2. Run python3 scripts/takt.py setup-labels to create missing classification labels,
   preserving existing labels. Confirm the project's exact status names are
   Backlog, In progress, In review and Done, and its closed-item workflow selects Done.
3. Create a fine-grained PAT with resource owner EmilXavierVT, selecting only
   MTOGO and MTOGO-Front, with Contents and Workflows write access. Metadata read
   access is included automatically. Store it privately as READY_PUSHER in each
   repository (`gh secret set READY_PUSHER` accepts hidden input). The token is used
   for the verified main push so GitHub starts the image publication workflow;
   ordinary GITHUB_TOKEN pushes do not trigger another push workflow. The ordinary
   workflow token handles issue updates and artifact reads. Renew READY_PUSHER
   before the chosen token expiration; keep its value out of commits and logs.
4. Set TAKT_BASE_SHA to the full current main SHA at cutover. This excludes historical
   PR/merge commits without release plans. Leave it fixed afterwards.
5. Prepare an issue/ready branch while delivery is disabled and verify that
   Takt verification succeeds. Then replace main's PR-approval requirement and old
   required-check names with the GitHub Actions Takt verification check, app-id 15368.
   Keep administrator enforcement and disallow force pushes and deletion; require
   linear history.
6. Enable the repository variable TAKT_ENABLED=true and rerun the ready workflow.
   Verify the exact prepared SHA reaches main, the issue closes, and the versioned
   publisher produces matching Git/image versions. Check Watchtower and the existing
   deployment smoke checks as usual.

The release-plan artifact is retained for 90 days. Repair a failed publication
before that evidence expires; the publisher refuses missing evidence rather than
guessing issue labels. Upstream actions/extensions are pinned. actionlint 1.7.12
predates GitHub's documented concurrency queue option and native issue-status
events. These two syntax false positives are narrowly ignored in MegaLinter and
in the validation command:

~~~sh
actionlint -shellcheck='' \
  -ignore '^unexpected.key..queue..for..concurrency..section' \
  -ignore '^invalid activity type "status_changed" for "issues" Webhook event'
~~~

To roll back the workflow, disable TAKT_ENABLED, restore the saved PR/check
protection settings and use the legacy publisher again. Existing versions and issue
time history remain. Application rollback uses the existing deployment runbook and
known image digests; disabling Takt does not roll back deployed applications.

Sources: [Takt workflow](https://www.lakruzz.com/stories/githubs-enfant-terrible/),
[gh-tt](https://github.com/devx-cafe/gh-tt),
[Takt actions](https://github.com/devx-cafe/takt-actions),
[SemVer](https://semver.org/spec/v2.0.0.html),
[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
