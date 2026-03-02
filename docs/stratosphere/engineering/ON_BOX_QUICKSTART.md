# On-Box Quickstart

*For SSH-first environments where users have terminal access on the VM.*

## 1) Download the Linux executable

```bash
VERSION=v0.1.0
ARCH=linux-x64 # use linux-arm64 on arm hosts

curl -fsSLO "https://github.com/fairley46/stratosphere/releases/download/${VERSION}/stratosphere-${ARCH}"
curl -fsSLO "https://github.com/fairley46/stratosphere/releases/download/${VERSION}/SHA256SUMS"
grep "stratosphere-${ARCH}" SHA256SUMS | sha256sum -c -

chmod +x "stratosphere-${ARCH}"
mv "stratosphere-${ARCH}" stratosphere
```

## 2) Run host prerequisites check

```bash
./stratosphere doctor
```

What `doctor` checks:
- Required local discovery commands (`sh`, `hostname`, `cat`, `ps`, `ip`, `ss`)
- Optional quality enhancers (`lsof`, `systemctl`, `crontab`)
- Optional delivery commands (`ssh`, `git`)
- Output directory writability

If required commands are missing, install packages and rerun `doctor`.

## 3) Start Stratosphere MCP server on the VM

```bash
./stratosphere mcp
```

Register this process as a local stdio MCP server in your agent host (Opencode, Claude Desktop, or equivalent enterprise Copilot shell).

## 4) Run migration generation from chat

Recommended MCP tool for terminal-first flow:
- `generate_local_vm_bundle`

Typical arguments:
- `out_dir`: where bundle artifacts will be written
- `strategy`: `minimal-change` | `balanced` | `aggressive-modernization`
- optional `intake_file` and `workspace_file` for richer context

## Optional: run without an agent host

If you do not have Opencode (or another MCP-compatible agent host) available on the VM, you can run Stratosphere directly:

```bash
./stratosphere --wizard --local-discovery --out-dir artifacts/my-migration
```

This uses terminal prompts (not a full-screen TUI) to collect intake/workspace context before generating the bundle.
This is a prompt-driven terminal UI (lightweight TUI), not a full-screen TUI.

## 5) First reports to review

Open these files first from the generated bundle:
1. `reports/executive-summary.md`
2. `reports/application-map-current.md`
3. `reports/application-map-future.md`
4. `reports/readiness.md`
5. `reports/cutover-plan.md`

## 6) What happens next

- App owner + platform engineer review unknowns and blockers.
- Required approvers sign off before execution-ready state.
- Platform team performs deployment/cutover from generated artifacts.

Stratosphere v1 remains planning-first: it generates governed artifacts and workflow state; it does not mutate live Kubernetes clusters directly.
