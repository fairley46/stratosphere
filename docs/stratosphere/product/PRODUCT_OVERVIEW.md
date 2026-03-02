# Stratosphere Product Overview

## Product Summary
Stratosphere is an enterprise migration architect for legacy applications.
It interrogates VM behavior, maps how an application works today, and generates a governed Kubernetes-first migration package teams can review and execute safely.

Core message:
"Interrogate the VM. Explain the system. Generate the migration plan."

## Who It Serves
1. Enterprise application owners modernizing long-running systems.
2. Platform and cloud migration engineers delivering repeatable transformations.
3. Security and operations teams requiring clear controls and auditability.

## Primary User Personas
1. Application Owner (non-technical)
   - Needs: a clear explanation of what exists today, what will change, and what risk remains.
   - Outputs they care about: executive summary, today vs future maps, business impact, ROI.
2. Platform / Cloud Engineer
   - Needs: deterministic artifacts and actionable guardrails.
   - Outputs they care about: Dockerfiles, Helm chart, Terraform scaffolding, validation, cutover plan.
3. Security / Risk Reviewer
   - Needs: human-in-the-loop controls, audit evidence, and safe defaults.
   - Outputs they care about: approvals workflow state, security baseline notes, sanitized error reporting.

## What the Product Delivers
1. Discovery and understanding:
   - Runtime discovery (`snapshot`, `local`, `ssh`).
   - VM DNA graph and dependency mapping.
   - Source and runtime correlation hints.
2. Migration intelligence:
   - Workload decomposition to `Deployment`, `StatefulSet`, `CronJob`.
   - Strategy options (`minimal-change`, `balanced`, `aggressive-modernization`).
   - Readiness scoring, unknowns tracking, confidence outputs.
3. Decision and business framing:
   - ROI estimate with VM sustainment and OS security overhead.
   - Business impact translation (customer/outage/security/operating effort).
   - Executive pack and glossary for non-technical stakeholders.
4. Delivery and governance:
   - Docker, Helm, Terraform artifact generation.
   - Blue/green cutover plan and rollback simulation.
   - Execution lifecycle with review, approvals, preflight, pause, rollback.
   - Export planning/execution policy scaffolding for GitHub/GitLab.

## End-to-End User Journey
1. Define context:
   - Intake captures business owner, criticality, downtime and compliance needs, and approval contacts.
   - Workspace captures multi-asset application composition.
2. Discover runtime:
   - Stratosphere interrogates system behavior and builds current-state map.
3. Generate migration package:
   - Future-state map, artifacts, validation, and decision reports are created.
4. Review and approve:
   - Teams assess readiness, risk, ROI, and cutover plan.
   - Named approvers provide formal sign-off.
5. Prepare execution:
   - Preflight checks validate policy and readiness gates before execution states.

## Product Access Modes
1. Standalone CLI:
   - deterministic local workflow for engineers and CI jobs.
2. MCP server:
   - agent-assisted workflow through enterprise copilots and local automation tools.

## Safety and Trust Model
1. Read-only discovery by default.
2. Human-in-the-loop gates for review and approvals.
3. Blue/green migration-first safety model with explicit rollback scenarios.
4. Advisory-only handling for vendor-owned/proprietary applications.
5. Structured errors and high automated test coverage gates.

## Current Delivery Status
Stratosphere is feature-complete for planning and governance-driven migration packaging (CLI + MCP + bundle generation).

The main gaps are operational validation and integration depth:
1. Pilot validation against representative enterprise workloads (to tune templates and confidence rules).
2. Enterprise export hardening (tenant/SSO expectations, scopes, and clearer preflight outcomes).
3. Optional future execution automation (deploying to clusters) behind strong governance gates.
