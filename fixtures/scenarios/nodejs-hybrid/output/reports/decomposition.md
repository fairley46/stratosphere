# Decomposition Report

## job-worker
- Kind: Deployment
- Stack: nodejs
- Confidence: 0.92
- Ports: none
- Dependencies: mongo-rs0.internal:27017, redis-cluster.internal:6379
- Rationale:
  - Detected application stack: nodejs.
  - No stateful write requirements detected; safe stateless default.

## node
- Kind: CronJob
- Stack: nodejs
- Confidence: 0.86
- Ports: 3000, 3001, 3002, 3003
- Dependencies: api.stripe.com:443, mongo-rs0.internal:27017, redis-cluster.internal:6379
- Rationale:
  - Observed cron/systemd timer activity mapped to this component.
  - Detected persistent file writes under stateful filesystem paths.
  - Detected application stack: nodejs.
  - Batch scheduling pattern indicates Job/CronJob execution model.

## PM2
- Kind: Deployment
- Stack: nodejs
- Confidence: 0.92
- Ports: none
- Dependencies: none
- Rationale:
  - Detected application stack: nodejs.
  - No stateful write requirements detected; safe stateless default.

## Blockers
- node: both persistent writes and scheduled execution detected; verify workload split.

