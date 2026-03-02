# Stratosphere v1 PRD

Date: March 1, 2026  
Owner: Product + Platform Engineering

## 1) Product Summary
Stratosphere is an AI-driven migration architect that interrogates running virtual machines over SSH, optionally inspects source code, and produces deploy-ready Kubernetes migration artifacts. v1 focuses on human-reviewed artifact generation, not automated production cutover.

## 2) Problem Statement
Enterprise teams still run high-risk, high-cost monoliths on Rocky Linux and RHEL VMs. Manual migration requires long discovery cycles, brittle assumptions, and inconsistent infrastructure artifacts. Most "lift-and-shift" tools preserve technical debt rather than eliminating it.

## 3) Target Users
- Enterprise application owners responsible for legacy modernization.
- Cloud migration consultants (external or internal professional services teams).
- Platform engineering teams that need standardized, secure migration artifacts.

## 4) Goals (v1)
- Reduce discovery and decomposition time from weeks to under 1 hour per VM.
- Generate production-leaning artifacts (Dockerfile, Helm, Terraform) with opinionated defaults.
- Preserve safety through read-only discovery, blue/green guidance, and mandatory human approval.
- Support runtime-only and runtime+source-code migration paths.

## 5) Non-Goals (v1)
- No automatic migration execution or automated cutover.
- No in-place mutation of source VMs.
- No hard PCI certification gate in v1; design remains PCI-aware for later hardening.

## 6) v1 Scope
### In-Scope
- Discovery over SSH for Rocky Linux and RHEL.
- Decomposition recommendations for `Deployment`, `StatefulSet`, `CronJob`/`Job`.
- Artifact generation:
  - Secure Dockerfiles (non-root defaults)
  - Helm charts with probes/resources/config patterns
  - Terraform modules for AWS, Azure, GCP, and OpenStack targets
- Export options:
  - Downloadable artifact bundle
  - Auto-created GitHub/GitLab repository
- Human approval workflow and blue/green migration runbook output.

### Out-of-Scope
- Agent-based runtime instrumentation in v1.
- Auto-remediation on VM.
- One-click production execution.

## 7) Core Workflow
1. Connect to VM using read-only SSH credentials.
2. Collect runtime telemetry and dependency metadata.
3. Optionally ingest source code and build manifests.
4. Build VM DNA graph and classify workload boundaries.
5. Generate artifact bundle and validation report.
6. Route outputs for human review and sign-off.
7. Execute blue/green deployment externally (human-operated).

## 8) Functional Requirements
- FR-1: SSH collector must inventory processes, ports, services, scheduled jobs, and filesystem hot paths.
- FR-2: Source analyzer must detect stack/build patterns for Java/Spring, .NET, and Node.js (Python next).
- FR-3: Decomposition engine must output recommended workload type with confidence score and rationale.
- FR-4: Generator must output valid Helm and Terraform with environment override support.
- FR-5: System must flag vendor-proprietary applications as advisory-only with explicit warning.
- FR-6: Exporter must support GitHub and GitLab repository creation.

## 9) Non-Functional Requirements
- NFR-1: Read-only discovery mode by default.
- NFR-2: Median time to first artifact package under 60 minutes per VM.
- NFR-3: All generated artifacts must pass lint/validation checks before export.
- NFR-4: End-to-end traceability from discovery input to generated output decisions.

## 10) Business Model (v1)
- Pricing: flat per-VM fee.
- Sales support: include side-by-side comparison of estimated manual migration effort/cost vs Stratosphere output model.

## 11) Success Metrics
- 70%+ of generated artifacts accepted with only minor edits.
- 30%+ median resource right-sizing opportunity identified.
- 50% reduction in discovery/refactor effort against manual baseline.
- 100% of migration bundles include explicit human sign-off checkpoint.

## 12) Risks and Mitigations
- Risk: Incomplete runtime visibility via SSH only.  
  Mitigation: confidence scoring + explicit gaps report + roadmap to MCP/agent augmentation.
- Risk: Vendor-owned applications with unsupported internals.  
  Mitigation: advisory-only mode and vendor-engagement recommendations.
- Risk: Overconfidence in decomposition for tightly coupled monoliths.  
  Mitigation: conservative defaults and mandatory reviewer confirmation.

## 13) Release Gate
Stratosphere v1 is release-ready when pilot workloads across three enterprise profiles produce complete, validated, human-approved artifact bundles without source VM disruption.
