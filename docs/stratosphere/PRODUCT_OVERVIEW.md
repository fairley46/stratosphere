# Stratosphere Product Overview

Date: March 2, 2026

## Product Summary
Stratosphere is a migration planning product for legacy applications. It inspects how an application runs today, explains findings in plain language, and generates a human-reviewed migration package for modern Kubernetes-oriented deployment targets.

## What Exists Today
1. Runtime discovery in three modes: `snapshot`, `local`, and `ssh`.
2. VM DNA and dependency mapping (processes, ports, storage writes, external calls, scheduled jobs).
3. Decomposition recommendations into `Deployment`, `StatefulSet`, and `CronJob`.
4. Artifact generation (Dockerfiles, Helm templates, Terraform scaffolds, validation outputs, blue/green runbook).
5. Current-state and future-state application maps.
6. Business intake + application workspace context integrated into generated outputs.
7. Plain-language executive summary artifact for non-technical stakeholders.
8. Vendor-owned advisory blocker behavior.
9. CLI and MCP interfaces for direct and agent-assisted workflows.
10. Structured error handling and high automated test confidence.

## User Journey (Non-Technical Owner)
1. Provide business context:
   app name, business owner, criticality, downtime tolerance, compliance needs, vendor ownership, approval contacts.
2. Provide application scope:
   workspace assets (VMs, databases, queues, external services) and relationships.
3. Choose discovery mode:
   snapshot file, local VM discovery, or read-only SSH discovery.
4. Run Stratosphere:
   system interrogates runtime and builds current-state understanding.
5. Review proposed future architecture:
   workload recommendations with rationale and confidence.
6. Review generated package:
   technical artifacts + executive summary + validation and sign-off outputs.
7. Human decision gate:
   approvers validate findings before deployment planning proceeds.

## Output Package
1. Stakeholder-friendly:
   `reports/executive-summary.md`, `reports/application-map-*.md`.
2. Technical:
   Dockerfiles, Helm chart/templates, Terraform scaffolding, decomposition and validation reports.
3. Governance:
   sign-off checkpoint/template, blue/green runbook, advisory blockers for vendor-owned systems.
4. Intelligence:
   runtime profile summary, source-analysis mapping hints.

## Safety Model
1. Discovery is read-only by default.
2. v1 is planning-first (no automatic production cutover execution).
3. Human sign-off remains mandatory.
4. Blue/green migration model is used to protect current-state operation.
5. Vendor-owned systems can be marked advisory-only for controlled handling.

## Current Product Boundary (Before Phase 4)
Stratosphere is strong on discovery, decomposition, output generation, and review artifacts.  
Phase 4 focuses on decision-layer maturity: migration strategy options, readiness scoring, business impact framing, ROI signals, improved reporting/help, and export execution hardening.
