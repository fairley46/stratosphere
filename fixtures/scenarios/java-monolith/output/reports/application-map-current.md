# Current-State Application Map

## Summary

```json
{
  "host": {
    "hostname": "acme-billing-prod-01",
    "os": "linux",
    "distro": "Rocky Linux 9",
    "ip": "10.20.4.11"
  },
  "processCount": 3,
  "scheduledJobCount": 2,
  "externalDependencyCount": 3,
  "graph": {
    "nodeCount": 16,
    "edgeCount": 17
  }
}
```

## Diagram

```mermaid
flowchart LR
  host_acme_billing_prod_01["acme-billing-prod-01\nRocky Linux 9"]
  proc_billing_app_2481["billing-app\nports:8080\nmem:1890Mi"]
  host_acme_billing_prod_01 -->|runs| proc_billing_app_2481
  ext_postgres_primary_internal_5432(["postgres-primary.internal:5432"])
  proc_billing_app_2481 -->|tcp| ext_postgres_primary_internal_5432
  ext_payments_stripe_com_443(["payments.stripe.com:443"])
  proc_billing_app_2481 -->|tcp| ext_payments_stripe_com_443
  ext_smtp_sendgrid_net_587(["smtp.sendgrid.net:587"])
  proc_billing_app_2481 -->|tcp| ext_smtp_sendgrid_net_587
  fs_var_lib_billing_uploads[["/var/lib/billing/uploads"]]
  proc_billing_app_2481 -->|writes| fs_var_lib_billing_uploads
  fs_var_log_billing_app_log[["/var/log/billing/app.log"]]
  proc_billing_app_2481 -->|writes| fs_var_log_billing_app_log
  fs_etc_billing_application_properties[["/etc/billing/application.properties"]]
  proc_billing_app_2481 -->|writes| fs_etc_billing_application_properties
  proc_catalina_2612["catalina\nports:8009\nmem:210Mi"]
  host_acme_billing_prod_01 -->|runs| proc_catalina_2612
  fs_var_log_tomcat_catalina_out[["/var/log/tomcat/catalina.out"]]
  proc_catalina_2612 -->|writes| fs_var_log_tomcat_catalina_out
  proc_liquibase_2730["liquibase\nports:none\nmem:128Mi"]
  host_acme_billing_prod_01 -->|runs| proc_liquibase_2730
  proc_liquibase_2730 -->|tcp| ext_postgres_primary_internal_5432
  job_liquibase_migrate{"liquibase-migrate\n@reboot"}
  proc_liquibase_2730 -->|scheduled| job_liquibase_migrate
  job_invoice_export{"invoice-export\n0 3 * * *"}
```
