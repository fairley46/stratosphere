# Backlog

This file is intentionally short: it lists what remains to make Stratosphere easier to adopt in real enterprises, without duplicating the README.

---

## What Ships Today (In This Repo)

- Interfaces: CLI (`apps/cli`) and MCP server (`apps/mcp`).
- Discovery modes: runtime snapshot file, local read-only discovery, SSH read-only discovery.
- Outputs: Kubernetes-first migration bundle with Dockerfiles, Helm chart scaffold, Terraform scaffold, and decision reports.
- Governance artifacts: review + approval gates, preflight checks, and a blue/green cutover plan (planning-only).
- Export: GitHub/GitLab export planning, plus optional export execution behind an explicit policy gate.

---

## What This Version Does Not Do (Yet)

- No Web UI.
- No HTTP API server.
- No direct Kubernetes deployment or traffic shifting automation.
- No real OAuth login flow (export execution is token-env based; `authMode` is currently informational).
- No full-screen TUI yet; the CLI wizard (`--wizard`) is a prompt-driven terminal UI (lightweight TUI), and MCP is the agent-driven interface.

---

## P0: Next Work (Adoption Blockers)

- Pilot validation against real enterprise workloads (see `PILOT_EXECUTION_PLAN.md`).
- Tighten docs and UX around "what Stratosphere can guarantee vs what it infers" (confidence + unknowns).
- Export hardening for enterprise tenants:
  - token scope/SSO guidance and better preflight checks
  - clearer safe defaults for self-hosted GitHub/GitLab base URLs
- Stack-aware source analyzers (deeper than manifest detection) and better runtime-to-source correlation.

---

## P1: Execution-Adjacent Work

- Kubernetes preflight integrations (real cluster connectivity checks and policy checks, not just bundle-local checks).
- Optional "apply to cluster" mode behind a hard governance gate (still human-approved, still blue/green).

---

## P2: Product Surface Expansion

- Workspace-scale discovery orchestration across multiple VMs (coordinated runs + merged application map).
- Optional HTTP API service built around the engine (for teams that want server-mode orchestration).
