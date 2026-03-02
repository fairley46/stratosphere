# Decomposition Report

## billing-app
- Kind: StatefulSet
- Stack: java-spring
- Confidence: 0.92
- Ports: 8080
- Dependencies: payments.stripe.com:443, postgres-primary.internal:5432, smtp.sendgrid.net:587
- Rationale:
  - Detected persistent file writes under stateful filesystem paths.
  - Detected application stack: java-spring.
  - Persistent volume claim recommended to preserve writable state.

## catalina
- Kind: Deployment
- Stack: java-spring
- Confidence: 0.92
- Ports: 8009
- Dependencies: none
- Rationale:
  - Detected application stack: java-spring.
  - No stateful write requirements detected; safe stateless default.

## liquibase
- Kind: CronJob
- Stack: java-spring
- Confidence: 0.94
- Ports: none
- Dependencies: postgres-primary.internal:5432
- Rationale:
  - Observed cron/systemd timer activity mapped to this component.
  - Detected application stack: java-spring.
  - Batch scheduling pattern indicates Job/CronJob execution model.

