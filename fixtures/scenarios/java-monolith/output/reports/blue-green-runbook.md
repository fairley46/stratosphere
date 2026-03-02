# Blue/Green Runbook

## Safety Rules
- Keep source VM workload running during full validation.
- Route green traffic gradually after health checks pass.
- Maintain rollback path to blue environment until acceptance sign-off.

## Workloads in Scope
- billing-app -> StatefulSet (confidence 0.92)
- catalina -> Deployment (confidence 0.92)
- liquibase -> CronJob (confidence 0.94)

## Cutover Steps
1. Deploy generated Helm chart to green namespace.
2. Validate probes, logs, dependency reachability, and baseline SLOs.
3. Shift 5% traffic to green, monitor, then increment to 25%, 50%, and 100%.
4. Keep blue deployment active for rollback window.
5. Record final human approval and migration completion notes.

## Rollback
1. Restore traffic to blue endpoint.
2. Scale down green workloads only after incident triage completes.
3. Preserve generated artifacts and logs for postmortem.
