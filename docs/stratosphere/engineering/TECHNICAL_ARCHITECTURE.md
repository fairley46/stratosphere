# Stratosphere v1 Technical Architecture

Date: March 1, 2026

## 1) Architecture Goals
- Produce deterministic, auditable migration artifacts from live VM interrogation.
- Keep discovery read-only and safe for production systems.
- Support dual ingestion paths: runtime-only and runtime+source.
- Enforce human-in-the-loop control before deployment use.

## 2) High-Level System
```text
[Web UI / API]
     |
     v
[Orchestrator]
  |       |         |            |
  v       v         v            v
[SSH Discovery] [Source Analyzer] [Profiler] [Policy/Validation]
        \        /        \
         v      v          v
          [VM DNA Graph + Evidence Store]
                     |
                     v
          [Decomposition + Recommendation Engine]
                     |
                     v
              [Artifact Generators]
       (Dockerfile, Helm, Terraform/OpenStack)
                     |
                     v
             [Export + Delivery Service]
       (GitHub/GitLab repo + downloadable bundle)
```

## 3) Core Components
### 3.1 Orchestrator Service
Responsibilities:
- Manage job lifecycle and execution states.
- Trigger collectors, analyzers, and generators.
- Persist intermediate graph snapshots and confidence metadata.

Inputs:
- VM connection profile.
- Optional source repository path/credentials.
- Target platform matrix (cloud/on-prem/OpenStack).

Outputs:
- End-to-end migration package with decision trace.

### 3.2 SSH Discovery Service (Agentless v1)
Responsibilities:
- Execute read-only probes over SSH.
- Capture process tree, listening ports, startup services, scheduled jobs, env vars, key file path usage, and dependency hints.

Technical notes:
- Use allowlisted command set.
- Harden with command timeouts and privilege restrictions.
- Support Rocky Linux and RHEL first.

### 3.3 Source Analyzer Service
Responsibilities:
- Detect stack and build system from manifests and repository layout.
- Map runtime processes to source components where possible.

v1 stack support:
- Java/Spring
- .NET
- Node.js
- Python planned immediately after GA

### 3.4 Profiler Service
Responsibilities:
- Aggregate per-process CPU/memory/network samples over time windows.
- Infer right-sizing defaults for Kubernetes resources.

Output fields:
- Suggested requests/limits.
- Variance and confidence level.

### 3.5 VM DNA Graph + Evidence Store
Purpose:
- Canonical representation of app topology and behavior.

Node examples:
- Process, service, endpoint, datastore, schedule, filesystem volume, external dependency.

Edge examples:
- talks-to, reads-from, writes-to, starts-with, schedules.

Storage model:
- Graph snapshot (JSON/Graph DB abstraction).
- Evidence artifacts (command output hashes, file markers, source references).
- Decision logs (why a component was classified a certain way).

### 3.6 Decomposition + Recommendation Engine
Responsibilities:
- Classify components into `Deployment`, `StatefulSet`, `CronJob`/`Job`.
- Detect migration blockers (state coupling, hardcoded endpoints, privileged assumptions).
- Emit confidence and rationale per recommendation.

Decision framework:
- Rules-first baseline + model-assisted scoring.
- Conservative fallback to avoid over-decomposition.

### 3.7 Artifact Generators
Outputs:
- Dockerfiles with hardened defaults (minimal base, non-root user, reduced attack surface).
- Helm charts with probes/resources/configuration patterns and override values.
- Terraform modules for AWS/Azure/GCP/on-prem patterns plus OpenStack v1 generation.

Design requirements:
- Human-readable files.
- Strong defaults, minimal required edits.
- Environment override support without template rewrites.

### 3.8 Policy and Validation Service
Responsibilities:
- Validate generated artifacts for syntax and policy conformance.
- Enforce mandatory review checkpoints and report unresolved blockers.

v1 focus:
- Non-PCI launch with PCI-aware control mapping metadata.
- Policy-ready output for later compliance hardening.

### 3.9 Export and Delivery Service
Responsibilities:
- Package full migration bundle.
- Push to GitHub/GitLab repositories.
- Generate downloadable archive for offline handoff.

Bundle contents:
- Dockerfiles
- Helm chart
- Terraform modules
- Decomposition rationale report
- Validation report
- Blue/green runbook template

## 4) Control Plane and Safety
- Read-only discovery by default, explicit elevated mode disabled in v1.
- No direct deployment execution in v1.
- Mandatory final human approval state before marking package "deployable".
- Advisory-only mode for vendor-proprietary applications.

## 5) APIs (v1 Draft)
- `POST /migration-jobs`: create migration run.
- `GET /migration-jobs/{id}`: fetch status and stage output.
- `GET /migration-jobs/{id}/graph`: fetch VM DNA graph.
- `GET /migration-jobs/{id}/artifacts`: fetch generated artifacts metadata.
- `POST /migration-jobs/{id}/export`: export bundle or publish repository.
- `POST /migration-jobs/{id}/approve`: record human sign-off.

## 6) MCP/OpenCode Roadmap Hook
v1 uses SSH-first discovery. To extend coverage, design discovery adapters behind a common interface:
- `DiscoveryAdapter.run()`
- `DiscoveryAdapter.capabilities()`
- `DiscoveryAdapter.evidence()`

MCP/OpenCode can later become additional adapters without reworking the core orchestrator.

## 7) Target NFRs
- Median time-to-first-bundle: <60 minutes/VM.
- 99% job-state durability (resume/retry on non-fatal stage failures).
- Full traceability for every decomposition recommendation.
- Deterministic output for identical inputs and template versions.

## 8) Delivery Milestones
- Phase 1 (March 2026): orchestrator + SSH discovery + graph schema.
- Phase 2 (April 2026): decomposition engine + confidence reporting.
- Phase 3 (May 2026): artifact generators + export pipelines.
- Phase 4 (late May to early June 2026): validation hardening + pilot stabilization.
