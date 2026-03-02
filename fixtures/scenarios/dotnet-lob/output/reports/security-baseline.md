# Security Baseline Notes

Generated defaults include:
- Non-root container execution
- Dropped Linux capabilities
- Liveness/readiness/startup probes
- ConfigMap/Secret split templates
- Default egress policy template

## Component-specific Notes
- HRPortal: stack=dotnet, kind=Deployment
- ReportWorker: stack=dotnet, kind=CronJob
- sssd: stack=dotnet, kind=Deployment

Review all generated probes and environment injection before production rollout.
