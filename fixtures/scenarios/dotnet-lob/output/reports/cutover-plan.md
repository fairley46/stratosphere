# Blue/Green Cutover Plan

- Mode: blue-green
- Readiness gate: 8/70

## Stages
- prepare-green: Prepare green environment
  owner=platform-owner eta=30m
  rollbackTrigger=Policy mismatch or missing prerequisites
- deploy-green: Deploy generated workloads
  owner=application-owner eta=35m
  rollbackTrigger=Repeated startup failures or missing dependencies
- shift-5: Shift 5% traffic to green
  owner=platform-owner eta=15m traffic=5%
  rollbackTrigger=Error budget breach or dependency failures
- shift-25: Shift 25% traffic to green
  owner=platform-owner eta=20m traffic=25%
  rollbackTrigger=SLO breach, DB error spikes, or operator abort
- shift-50: Shift 50% traffic to green
  owner=platform-owner eta=25m traffic=50%
  rollbackTrigger=Sustained queue backlog growth or health probe failures
- shift-100: Shift 100% traffic to green
  owner=platform-owner eta=30m traffic=100%
  rollbackTrigger=Critical alert, severe performance regression, or policy breach
- stabilization-window: Stabilization and rollback hold window
  owner=operations eta=60m
  rollbackTrigger=SLO regression or unresolved high-priority incident

## Rollback Simulations
- Health Check Failure (confidence 0.93)
  trigger=Readiness probes fail for two consecutive windows
  expectedAction=Route traffic back to blue immediately and freeze green updates.
- SLO Breach (confidence 0.9)
  trigger=Latency/error SLO breach at 25%+ traffic stage
  expectedAction=Rollback to previous stable stage and open incident workflow.
- Data Path Regression (confidence 0.95)
  trigger=Stateful write/read validation fails
  expectedAction=Abort cutover, restore blue path, and preserve diagnostics.

## Notes
- Workload mix: 3 total (0 stateful, 1 scheduled).
- Downtime tolerance: unspecified.
- Human sign-off is required before and after cutover execution.

