# Stratosphere Execution Workflow Spec

Date: March 2, 2026

## Purpose
Define how Stratosphere moves from planning-only outputs to controlled execution while enforcing user feedback and approval gates.

## Core Principle
Stratosphere must pause for human review before any mutating operation.

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

Rollback behavior:
- route traffic back to blue
- freeze green mutations
- capture diagnostics and incident summary

## API Surface (Execution-Oriented)
1. `POST /migration-jobs`
- create or regenerate plan
- accepts intake/workspace/targets/strategy

2. `POST /migration-jobs/{id}/review`
- submit `accept` or `request_changes`
- includes structured feedback payload

3. `POST /migration-jobs/{id}/approve`
- record approver decision

4. `POST /migration-jobs/{id}/preflight`
- run preflight checks

5. `POST /migration-jobs/{id}/execute`
- start execution only when state is `EXECUTION_READY`

6. `POST /migration-jobs/{id}/pause`
- optional checkpoint pause

7. `POST /migration-jobs/{id}/resume`
- continue from paused state

8. `POST /migration-jobs/{id}/rollback`
- manual rollback trigger

9. `GET /migration-jobs/{id}`
- lifecycle state + stage details

10. `GET /migration-jobs/{id}/artifacts`
- all generated and runtime evidence

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
- Implemented today:
  - review-centric planning outputs
  - strategy/readiness/ROI reports
  - advisory blocker support for vendor-owned apps
- Not yet implemented:
  - full lifecycle state machine with persisted transitions
  - execution APIs and preflight/execute/rollback orchestration
  - enforcement of approval policy on mutating operations
