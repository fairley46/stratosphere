# Future-State Application Map

## Summary

```json
{
  "componentCount": 3,
  "blockers": [
    "Azure Service Bus dependency detected (confidence 0.75). Validate Azure migration approach with vendor documentation before implementation.",
    "Advisory-only mode active due to vendor dependencies. Generated Helm/Terraform artifacts are for planning review only."
  ],
  "byKind": {
    "Deployment": 2,
    "StatefulSet": 0,
    "CronJob": 1
  }
}
```

## Diagram

```mermaid
flowchart LR
  k8s_cluster(["Kubernetes Target Cluster"])
  wl_hrportal["HRPortal\nDeployment\ndotnet"]
  k8s_cluster --> wl_hrportal
  dep_login_microsoftonline_com_443(["login.microsoftonline.com:443"])
  wl_hrportal -->|depends on| dep_login_microsoftonline_com_443
  dep_mssql_prod_internal_1433(["mssql-prod.internal:1433"])
  wl_hrportal -->|depends on| dep_mssql_prod_internal_1433
  wl_reportworker["ReportWorker\nCronJob\ndotnet"]
  k8s_cluster --> wl_reportworker
  dep_contoso_hr_servicebus_windows_net_443(["contoso-hr.servicebus.windows.net:443"])
  wl_reportworker -->|depends on| dep_contoso_hr_servicebus_windows_net_443
  wl_sssd["sssd\nDeployment\ndotnet"]
  k8s_cluster --> wl_sssd
  dep_dc01_corp_contoso_com_389(["dc01.corp.contoso.com:389"])
  wl_sssd -->|depends on| dep_dc01_corp_contoso_com_389
```
