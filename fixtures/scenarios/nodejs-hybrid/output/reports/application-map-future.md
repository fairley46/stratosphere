# Future-State Application Map

## Summary

```json
{
  "componentCount": 3,
  "blockers": [
    "node: both persistent writes and scheduled execution detected; verify workload split."
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
  wl_job_worker["job-worker\nDeployment\nnodejs"]
  k8s_cluster --> wl_job_worker
  dep_mongo_rs0_internal_27017(["mongo-rs0.internal:27017"])
  wl_job_worker -->|depends on| dep_mongo_rs0_internal_27017
  dep_redis_cluster_internal_6379(["redis-cluster.internal:6379"])
  wl_job_worker -->|depends on| dep_redis_cluster_internal_6379
  wl_node["node\nCronJob\nnodejs"]
  k8s_cluster --> wl_node
  dep_api_stripe_com_443(["api.stripe.com:443"])
  wl_node -->|depends on| dep_api_stripe_com_443
  wl_node -->|depends on| dep_mongo_rs0_internal_27017
  wl_node -->|depends on| dep_redis_cluster_internal_6379
  wl_pm2["PM2\nDeployment\nnodejs"]
  k8s_cluster --> wl_pm2
```
