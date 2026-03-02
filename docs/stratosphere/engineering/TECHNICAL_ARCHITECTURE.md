# Technical Architecture

This repo ships Stratosphere as:

- A standalone CLI (`apps/cli`)
- A local MCP server over stdio (`apps/mcp`) for agent workflows (Claude Desktop, Opencode, etc.)
- An in-process engine library (`packages/engine`) used by both

There is no Web UI or HTTP API in this version.

---

## Architecture Goals

- Deterministic, auditable migration bundles from the same inputs and templates.
- Safe discovery: read-only by default for snapshot, local, and SSH flows.
- Human-in-the-loop: the tool produces artifacts and a reviewable plan, but does not deploy to clusters in v1.
- Strong UX under failure: structured errors, redaction, and actionable hints.

---

## High-Level Flow

```text
[CLI]                       [MCP Server (stdio)]
  |                                 |
  +--------------+------------------+
                 v
          [@stratosphere/engine]
                 |
                 | 1) Validate inputs (intake/workspace/targets)
                 | 2) Discovery (runtime file | local | SSH)
                 | 3) Normalize -> RuntimeSnapshot + Evidence
                 | 4) Build app maps + VM DNA graph
                 | 5) Decompose -> workloads + confidence + blockers
                 | 6) Generate artifacts (Docker/Helm/Terraform) + reports
                 | 7) Export plan (optional) + gated export execution (optional)
                 v
      [Bundle Dir: docker/ helm/ terraform/ reports/]
```

Key constraint:

- The output is "ready for review and deployment by humans".
- Execution workflow artifacts exist (blue/green plan, approvals, preflight checks), but Stratosphere does not mutate Kubernetes clusters directly in this version.

---

## Repo Layout

- `apps/cli`: CLI wrapper around the engine pipeline.
- `apps/mcp`: MCP server exposing engine capabilities as tools.
- `packages/engine`: discovery, decomposition, report generation, artifact generation, export, and workflow state machine.
- `fixtures/`: sample runtime snapshots, intake/workspace examples, and scenario fixtures.
- `scripts/`: demo automation (`scripts/demo.sh`).
- `tests/`: Node test runner coverage + behavior tests.
- `artifacts/`: default output directory for generated bundles (gitignored).

---

## Engine: Main Responsibilities

### 1) Validation (Inputs and Safety)

The engine validates and normalizes:

- Business intake (`validateBusinessIntake`)
- Application workspace (`validateApplicationWorkspace`)
- Bundle directory state (`validateBundleDirectory`)
- Export request parameters and policy gates

The goal is to fail fast with actionable error payloads (code + message + hint) instead of partially generating bundles.

### 2) Discovery (Evidence Collection)

Discovery is an adapter interface:

- `DiscoveryAdapter.collect(request) -> { runtime, evidence }`

Current adapters include:

- Runtime snapshot file ingestion
- Local read-only discovery (runs on the host where CLI/MCP executes)
- SSH read-only discovery (allowlisted commands + timeouts)

SSH discovery is intentionally constrained:

- Fixed allowlisted command set (no arbitrary remote shell execution)
- Command timeout enforcement
- Output snippet clamping to avoid runaway logs

### 3) Decomposition (Recommendations + Confidence)

The engine classifies components into Kubernetes workload types:

- `Deployment` for stateless services
- `StatefulSet` when stateful storage/dependencies are detected
- `CronJob`/`Job` for scheduled/batch work

Each recommendation carries:

- Rationale (what evidence caused the decision)
- Confidence score
- Blockers / unknowns that require human confirmation

### 4) Artifact Generation + Reports

The engine writes a bundle directory that includes:

- Dockerfiles per component (`docker/`)
- Helm chart scaffold (`helm/`)
- Terraform scaffold (`terraform/`)
- Reports and decision artifacts (`reports/`)

Reports are designed to be readable by both engineers and non-technical app owners:

- Executive summary
- Current vs future application maps
- Migration options and readiness score
- ROI estimate and business impact translation
- Cutover plan (blue/green stages + rollback triggers)

### 5) Export: Plan vs Execute

Stratosphere supports:

- Export planning output (always available)
- Export execution (optional, explicitly policy-gated)

Export execution requires both:

- `--export-execute`
- `STRATOSPHERE_ENABLE_EXPORT_EXECUTION=true` (environment gate)

Provider integration targets:

- GitHub
- GitLab

---

## Execution Workflow (Governance, Not Deployment)

The workflow state machine is persisted as:

- `reports/execution-job.json`

It models:

- Review gate
- Approval threshold gate (>=2 approvers)
- Preflight checks (including readiness threshold)
- Execution steps as a plan/checklist (blue/green), not live cluster mutation

MCP tools expose workflow operations for agent workflows, but execution remains planning-only in this version.

---

## What This Version Does Not Include

To avoid confusion, these are intentionally out of scope for the current repo:

- A Web UI
- An HTTP API server
- Direct Kubernetes cluster mutation / traffic shifting automation

Those belong in a future "orchestrator service" built around the engine, after pilot validation and enterprise auth/policy requirements are finalized.

