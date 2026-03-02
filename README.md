# Stratosphere

Stratosphere is an AI-driven migration architect that interrogates VM runtime behavior and produces Kubernetes-native migration artifacts.

## Quickstart

```bash
cd /Users/bradfairley/Documents/Playground/stratosphere
npm install
npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json --out-dir artifacts/stratosphere
```

Outputs include Dockerfiles, Helm templates, Terraform scaffolding, VM DNA reports, and blue/green runbook artifacts.
Each run now also includes:
- `reports/application-map-current.md` (how it works today)
- `reports/application-map-future.md` (proposed future architecture map)

## Local VM Discovery (No SSH)

Run Stratosphere directly on the VM and interrogate local runtime state:

```bash
npm run stratosphere -- --local-discovery --out-dir artifacts/stratosphere
```

## Input Modes

- `snapshot`: provide `--runtime-file` JSON
- `local`: provide `--local-discovery` (runs read-only commands on the same VM)
- `ssh`: provide `--ssh-host` + `--ssh-user` (optional `--ssh-port`, `--ssh-key`)

CLI validates conflicting/missing flags and returns structured errors with:
- `code`
- `message`
- `hint`
- `details`

## Validate

```bash
npm run test
npm run test:coverage
```

## Export Planning

```bash
npm run stratosphere -- \
  --runtime-file fixtures/stratosphere/sample-runtime.json \
  --export-provider github \
  --export-owner my-org \
  --export-repo migration-bundle
```

By default export runs in dry-run planning mode and writes `reports/repository-export.json`.

## MCP Support

Start the MCP server:

```bash
npm run mcp:start
```

Tools exposed:
- `generate_migration_bundle`
- `list_ssh_discovery_commands`
- `generate_local_vm_bundle`
- `validate_migration_bundle`
- `explain_decomposition`

## Opencode Local VM Use Case

When running on the target VM, register Stratosphere MCP in Opencode as a local stdio server:

```json
{
  "mcpServers": {
    "stratosphere": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "cwd": "/Users/bradfairley/Documents/Playground/stratosphere"
    }
  }
}
```

Then call `generate_local_vm_bundle` from Opencode to generate artifacts from local runtime state.
