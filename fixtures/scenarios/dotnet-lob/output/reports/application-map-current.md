# Current-State Application Map

## Summary

```json
{
  "host": {
    "hostname": "hr-lob-prod-02",
    "os": "linux",
    "distro": "Red Hat Enterprise Linux 8.9",
    "ip": "10.30.7.44"
  },
  "processCount": 3,
  "scheduledJobCount": 1,
  "externalDependencyCount": 4,
  "graph": {
    "nodeCount": 16,
    "edgeCount": 17
  }
}
```

## Diagram

```mermaid
flowchart LR
  host_hr_lob_prod_02["hr-lob-prod-02\nRed Hat Enterprise Linux 8.9"]
  proc_hrportal_3102["HRPortal\nports:80,443\nmem:1240Mi"]
  host_hr_lob_prod_02 -->|runs| proc_hrportal_3102
  ext_mssql_prod_internal_1433(["mssql-prod.internal:1433"])
  proc_hrportal_3102 -->|tcp| ext_mssql_prod_internal_1433
  ext_login_microsoftonline_com_443(["login.microsoftonline.com:443"])
  proc_hrportal_3102 -->|tcp| ext_login_microsoftonline_com_443
  fs_opt_lob_attachments[["/opt/lob/attachments"]]
  proc_hrportal_3102 -->|writes| fs_opt_lob_attachments
  fs_var_log_hrportal_app_log[["/var/log/hrportal/app.log"]]
  proc_hrportal_3102 -->|writes| fs_var_log_hrportal_app_log
  proc_reportworker_3290["ReportWorker\nports:none\nmem:380Mi"]
  host_hr_lob_prod_02 -->|runs| proc_reportworker_3290
  ext_contoso_hr_servicebus_windows_net_443(["contoso-hr.servicebus.windows.net:443"])
  proc_reportworker_3290 -->|tcp| ext_contoso_hr_servicebus_windows_net_443
  fs_opt_lob_reports_scheduled[["/opt/lob/reports/scheduled"]]
  proc_reportworker_3290 -->|writes| fs_opt_lob_reports_scheduled
  proc_sssd_3445["sssd\nports:none\nmem:58Mi"]
  host_hr_lob_prod_02 -->|runs| proc_sssd_3445
  ext_dc01_corp_contoso_com_389(["dc01.corp.contoso.com:389"])
  proc_sssd_3445 -->|tcp| ext_dc01_corp_contoso_com_389
  fs_var_log_sssd_sssd_log[["/var/log/sssd/sssd.log"]]
  proc_sssd_3445 -->|writes| fs_var_log_sssd_sssd_log
  job_monthly_headcount_report{"monthly-headcount-report\n0 6 1 * *"}
  proc_reportworker_3290 -->|scheduled| job_monthly_headcount_report
```
