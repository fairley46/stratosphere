# Stratosphere Quickstart

## Generate a migration package from a runtime snapshot

From the `stratosphere/` directory:

```bash
npm run stratosphere -- \
  --runtime-file fixtures/stratosphere/sample-runtime.json \
  --out-dir artifacts/stratosphere
```

## Optional: include SSH connection metadata

```bash
npm run stratosphere -- \
  --runtime-file fixtures/stratosphere/sample-runtime.json \
  --ssh-host 10.40.8.23 \
  --ssh-user migration-readonly \
  --ssh-port 22 \
  --out-dir artifacts/stratosphere
```

## Print read-only SSH discovery command set

```bash
npm run stratosphere -- --print-ssh-commands
```

## Start MCP server

```bash
npm run mcp:start
```

## Generated bundle

- `docker/<component>/Dockerfile`
- `helm/Chart.yaml`
- `helm/values.yaml`
- `helm/templates/workloads.yaml`
- `helm/templates/services.yaml`
- `terraform/{aws,azure,gcp,openstack}/main.tf`
- `reports/decomposition.md`
- `reports/vm-dna.json`
- `reports/vm-dna-graph.json`
- `reports/validation.json`
- `reports/blue-green-runbook.md`
- `reports/migration-summary.json`
