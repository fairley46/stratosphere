# Execution Workflow Spec

## Purpose
Define how Stratosphere moves from planning outputs to a controlled, human-approved execution *plan* while enforcing review, feedback, and approval gates.

## Core Principle
Stratosphere must pause for human review before any mutating operation.

In this repo/version, Stratosphere does not perform mutating operations against Kubernetes clusters. It produces a governed execution plan and persists workflow state to the bundle so humans can run the cutover externally.

## Lifecycle States
1. `DRAFTING`
- Intake, workspace, and targets are being collected.

2. `DISCOVERED`
- Runtime discovery and decomposition completed.

3. `REVIEW_REQUIRED`
- Initial package generated.
- User must review assumptions, maps, recommendations, and strategy.

4. `REVISION_REQUIRED`
- User provided changes or rejected assumptions.
- Stratosphere regenerates package and shows delta from previous revision.

5. `APPROVAL_PENDING`
- Review accepted.
- Required approvers must sign off.

6. `PREFLIGHT_RUNNING`
- Credentials, target connectivity, policy checks, and rollback readiness checks execute.

7. `EXECUTION_READY`
- Preflight passed and approvals are complete.
- Await explicit execute command.

8. `EXECUTING`
- Blue/green stages run with checkpointing.

9. `PAUSED_FOR_REVIEW`
- Optional pause point between major execution stages.

10. `ROLLBACK_RUNNING`
- Automatic or manual rollback in progress.

11. `COMPLETED`
- Execution finished successfully and post-run evidence is written.

12. `FAILED`
- Fatal failure; no further progression without operator intervention.

## Required Gates

### Gate A: Plan Review (Before Approval)
Required user actions:
- Confirm strategy (`minimal-change`, `balanced`, `aggressive-modernization`).
- Confirm target environment and cutover constraints.
- Confirm dependency mapping and blockers.
- Provide feedback if any assumption is incorrect.

Outputs shown:
- Current and future maps.
- Executive summary.
- Readiness score/confidence.
- Migration options report.
- ROI estimate.

Result:
- `accept` -> `APPROVAL_PENDING`
- `request_changes` -> `REVISION_REQUIRED`

### Gate B: Approval (Before Preflight/Execution)
Required:
- Named approvers from intake or policy.
- Approval threshold met.
- Approval audit trail recorded with timestamp and identity.

Result:
- pass -> `PREFLIGHT_RUNNING`
- fail -> remain `APPROVAL_PENDING`

### Gate C: Preflight (Before Mutation)
Checks:
- credentials/token validity
- target reachability
- policy/compliance constraints
- capacity/resource fit
- rollback prerequisites

Result:
- pass -> `EXECUTION_READY`
- fail -> `FAILED`

## Execution Stages (Blue/Green)
1. Prepare green environment.
2. Deploy workloads to green.
3. Run health and dependency checks.
4. Shift traffic gradually (5/25/50/100).
5. Observe SLO/alerts at each shift.
6. Finalize cutover and hold rollback window.

## Rollback Triggers
- health check failure
- SLO breach
- policy violation
- operator abort

Rollback behavior (as a plan/checklist):
- route traffic back to blue
- freeze green mutations
- capture diagnostics and incident summary

## Current Implementation Surface (What Exists Today)

Workflow state is persisted inside the generated bundle as:

- `reports/execution-job.json`

You can operate the workflow via:

- CLI: generate a bundle, then initialize workflow state from the engine (see `scripts/demo.sh`)
- MCP tools (recommended for agent workflows):
  - `init_execution_workflow`
  - `review_execution_workflow`
  - `approve_execution_workflow`
  - `run_execution_preflight`
  - `execute_workflow` (planning-only status progression)
  - `pause_execution_workflow`
  - `rollback_execution_workflow`
  - `compare_plan_revisions`

Future work may add an HTTP API, but this repo does not include an API server.

## Required Inputs Before Execution
1. Business requirements:
- criticality, downtime tolerance, compliance needs, approval contacts.

2. Technical targets:
- target cluster/environment, namespaces, networking rules, identity model.

3. Execution constraints:
- allowed windows, freeze periods, rollback SLA, max blast radius.

4. Auth configuration:
- scoped GitHub/GitLab credentials (for export execution later)
- environment credentials for deployment targets.

## Current Enforcement Status
- Implemented:
  - full lifecycle state machine with persisted transitions (`reports/execution-job.json`)
  - review + approval gates with required approver floor (`>=2`)
  - preflight checks for approvals/readiness/evidence/export-policy gate
  - execution, pause, rollback, and revision-diff tool surfaces in MCP (planning-only)
  - strategy/readiness/ROI/business-impact reporting and advisory blocker support
- Still roadmap-bound:
  - direct production mutation orchestration against live clusters
  - enterprise tenant validation of GitHub/GitLab export execution (token scopes, SSO constraints, hosted endpoints)
  - pilot workload validation across enterprise environments
