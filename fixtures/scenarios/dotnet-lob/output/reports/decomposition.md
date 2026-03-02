# Decomposition Report

## HRPortal
- Kind: Deployment
- Stack: dotnet
- Confidence: 0.92
- Ports: 80, 443
- Dependencies: login.microsoftonline.com:443, mssql-prod.internal:1433
- Rationale:
  - Detected application stack: dotnet.
  - No stateful write requirements detected; safe stateless default.

## ReportWorker
- Kind: CronJob
- Stack: dotnet
- Confidence: 0.94
- Ports: none
- Dependencies: contoso-hr.servicebus.windows.net:443
- Rationale:
  - Observed cron/systemd timer activity mapped to this component.
  - Detected application stack: dotnet.
  - Batch scheduling pattern indicates Job/CronJob execution model.

## sssd
- Kind: Deployment
- Stack: dotnet
- Confidence: 0.92
- Ports: none
- Dependencies: dc01.corp.contoso.com:389
- Rationale:
  - Detected application stack: dotnet.
  - No stateful write requirements detected; safe stateless default.

## Blockers
- Azure Service Bus dependency detected (confidence 0.75). Validate Azure migration approach with vendor documentation before implementation.
- Advisory-only mode active due to vendor dependencies. Generated Helm/Terraform artifacts are for planning review only.

