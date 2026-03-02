# Security Baseline Notes

Generated defaults include:
- Non-root container execution
- Dropped Linux capabilities
- Liveness/readiness/startup probes
- ConfigMap/Secret split templates
- Default egress policy template

## Component-specific Notes
- billing-app: stack=java-spring, kind=StatefulSet
- catalina: stack=java-spring, kind=Deployment
- liquibase: stack=java-spring, kind=CronJob

Review all generated probes and environment injection before production rollout.
