# Stratosphere Quickstart

## Generate a migration package from a runtime snapshot

From the `stratosphere/` directory:

```bash
npm run stratosphere -- \
  --runtime-file fixtures/stratosphere/sample-runtime.json \
  --out-dir artifacts/stratosphere
```

## Generate with audit and export planning

```bash
npm run stratosphere -- \
  --runtime-file fixtures/stratosphere/sample-runtime.json \
  --initiated-by platform-team \
  --signoff-required-approvers 2 \
  --export-provider github \
  --export-owner my-org \
  --export-repo billing-migration
```

## Generate from local VM discovery (no runtime file)

```bash
npm run stratosphere -- \
  --local-discovery \
  --initiated-by platform-team \
  --signoff-required-approvers 2 \
  --out-dir artifacts/stratosphere
```

## Input validation behavior

- Conflicting inputs (example: `--local-discovery` with `--ssh-host`) are rejected.
- Missing required inputs return structured error output with code + hint.
- Invalid JSON snapshot files return explicit parse errors.

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

## MCP local-VM flow

Use MCP tool `generate_local_vm_bundle` when Stratosphere MCP is running on the target VM.

## Run tests

```bash
npm run test
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
