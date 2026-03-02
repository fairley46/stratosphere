# Security Baseline Notes

Generated defaults include:
- Non-root container execution
- Dropped Linux capabilities
- Liveness/readiness/startup probes
- ConfigMap/Secret split templates
- Default egress policy template

## Component-specific Notes
- job-worker: stack=nodejs, kind=Deployment
- node: stack=nodejs, kind=CronJob
- PM2: stack=nodejs, kind=Deployment

Review all generated probes and environment injection before production rollout.
