# Stratosphere

Stratosphere is an AI-driven migration architect that interrogates VM runtime behavior and produces Kubernetes-native migration artifacts.

## Quickstart

```bash
cd /Users/bradfairley/Documents/Playground/stratosphere
npm install
npm run stratosphere -- --runtime-file fixtures/stratosphere/sample-runtime.json --out-dir artifacts/stratosphere
```

Outputs include Dockerfiles, Helm templates, Terraform scaffolding, VM DNA reports, and blue/green runbook artifacts.

## MCP Support

Start the MCP server:

```bash
npm run mcp:start
```

Tools exposed:
- `generate_migration_bundle`
- `list_ssh_discovery_commands`
