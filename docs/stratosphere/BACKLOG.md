# Stratosphere Product Backlog

Date: March 2, 2026  
Owner: Product + Platform Engineering

This backlog prioritizes non-technical user experience so long-running app owners can understand decisions, risk, and next steps without infrastructure expertise.

## Priority Definitions
- `P0`: Must-have for near-term product usability with non-technical app owners.
- `P1`: High-value expansion after P0 is stable.
- `P2`: Important enhancements after core adoption path is proven.

## P0 (Next Major Iteration)

### 1) Guided Intake Wizard (Plain Language)
- Problem: users do not know what technical inputs are required.
- Deliverable: question flow using business language (app owner, downtime tolerance, critical windows, compliance, vendor ownership, approval contacts).
- Acceptance:
  - User can complete intake without knowing infrastructure terminology.
  - Required inputs for discovery and artifact generation are captured or explicitly marked unknown.

### 2) Application Workspace (Beyond Single VM)
- Problem: one app often spans multiple servers and dependencies.
- Deliverable: workspace model that groups multiple VMs, databases, queues, and external services into one application scope.
- Acceptance:
  - User can create one migration workspace containing multiple infrastructure assets.
  - Generated outputs reflect full application composition, not single-host view only.

### 3) Executive “Today vs Future” Views
- Problem: current reports are technical-first.
- Deliverable: one-page plain-English summaries of current-state and future-state maps.
- Acceptance:
  - Summary avoids infrastructure jargon and explains implications in business terms.
  - Output can be shared directly with app owners and leadership.

### 4) Migration Options With Tradeoffs
- Problem: users need choices, not one technical recommendation.
- Deliverable: option sets such as `minimal change`, `balanced`, `aggressive modernization` with risk/time/cost deltas.
- Acceptance:
  - At least 3 strategy options shown for eligible workloads.
  - Each option includes estimated effort, risk, and expected benefits.

### 5) Readiness Score + Unknowns Tracker
- Problem: teams need confidence and explicit gaps before action.
- Deliverable: readiness score and unresolved-question checklist tied to recommendation confidence.
- Acceptance:
  - Every migration package includes a readiness score.
  - Unknowns are listed with owner and required action before cutover.

### 6) Built-In Approval Workflow
- Problem: manual sign-off needs stronger product enforcement.
- Deliverable: named approvers, checkpoints, audit log, and hard gate preventing execution-ready status without approvals.
- Acceptance:
  - Package cannot be marked deployable until required approvals are complete.
  - Approval events are timestamped and auditable.

## P1 (Following Iteration)

### 7) Business Impact Translation Layer
- Problem: technical findings are hard to prioritize for app owners.
- Deliverable: plain-language impact statements (customer risk, outage risk, security risk, operational effort).
- Acceptance:
  - Every major finding includes an impact category and severity.
  - Executive summary includes top 3 business risks and mitigations.

### 8) Vendor-Owned Application Advisory Flow
- Problem: some systems are vendor-managed and should not be decomposed blindly.
- Deliverable: detection + advisory mode with “engage vendor” guidance and alternatives.
- Acceptance:
  - Vendor-owned signals trigger advisory warning state.
  - Output includes recommended vendor engagement next steps.

### 9) Blue/Green Cutover Planner + Rollback Simulation
- Problem: app owners need operational confidence before transition.
- Deliverable: staged cutover timeline with validation gates and rollback triggers.
- Acceptance:
  - Plan includes phased traffic shifts and rollback conditions.
  - Human-readable checklist maps each step to owner and success criteria.

### 10) Cost/ROI Estimator
- Problem: business stakeholders need clear financial justification.
- Deliverable: before/after run-cost estimate, one-time migration effort, payback window.
- Acceptance:
  - Package includes baseline and projected run-cost comparison.
  - ROI assumptions are explicit and editable.

## P2 (Maturity Enhancements)

### 11) Executive Reporting Pack
- Problem: outputs are useful but not presentation-ready for leadership.
- Deliverable: exportable summary pack (decision memo, risk register, migration checklist).
- Acceptance:
  - One-click generation of stakeholder-friendly report bundle.
  - Includes both business summary and technical appendix.

### 12) In-Product Glossary and Contextual Help
- Problem: unfamiliar migration terms create friction.
- Deliverable: inline definitions and “what this means” helper text across UI/flows.
- Acceptance:
  - Critical terms have plain-language explanations.
  - Users can complete primary workflow without external documentation.

## Sequencing Recommendation
1. Build P0 features 1, 2, and 3 first (intake + workspace + executive views).
2. Add P0 features 4, 5, and 6 (decision quality + governance).
3. Deliver P1/P2 based on pilot feedback and adoption blockers.

## Phase 1-3 Kickoff Status (March 2, 2026)

Implemented kickoff foundations:
- Phase 1:
  - JSON-based guided intake model + validation.
  - JSON-based application workspace model + validation.
  - Plain-language executive summary artifact for non-technical stakeholders.
- Phase 2:
  - Initial source-analysis report (`runtime -> component mapping hints`).
  - Initial runtime profile summary report (top CPU/memory process view).
- Phase 3:
  - Vendor-owned advisory blocker injection into decomposition workflow.

Remaining in these phases:
- UI/agent-driven guided wizard experience (current intake is file-driven).
- Deeper source-code analyzers by stack and build system.
- Time-window profiler and variance/confidence modeling.
- Full governance workflow service/API beyond file-level sign-off outputs.

## Phase 4 Kickoff Inputs Needed

To start Phase 4 implementation immediately, these decisions are required:
1. Strategy option set definition:
   `minimal-change`, `balanced`, `aggressive-modernization` scope and default rules.
2. Readiness scoring rubric:
   scoring weights for blockers, findings severity, confidence, and unknown inputs.
3. Business impact categories:
   mapping rules for customer risk, outage risk, security risk, and operating effort.
4. ROI assumptions:
   default cost inputs (compute/storage/network and migration effort assumptions).
5. Reporting target format:
   markdown-only vs markdown + JSON pack for executive sharing.
6. Export execution policy:
   when `export_execute` is allowed, required approvals, and token/auth model for GitHub/GitLab.

## Unified Roadmap by Section (Original Scope + Backlog)

This section merges the original v1 scope gaps with backlog additions into one execution list.

### A) User Experience and Communication
1. Guided intake wizard in plain language.
2. Application workspace for multi-VM, multi-dependency applications.
3. Executive current-state vs future-state summaries for non-technical owners.
4. Readiness score + unknowns tracker.
5. Migration options with tradeoffs (`minimal change`, `balanced`, `aggressive modernization`).
6. Business impact translation (customer risk, outage risk, security risk, operating effort).
7. Cost/ROI estimator.
8. Executive reporting pack and in-product glossary/help.

### B) Migration Intelligence and Artifact Quality
9. Source analyzer that maps runtime processes to source/build files (Java/.NET/Node first).
10. Time-window runtime profiler for stronger right-sizing recommendations.

### C) Governance, Safety, and Delivery Controls
11. Enforced human approval workflow as a hard gate.
12. Vendor-owned/proprietary application advisory mode.
13. Blue/green cutover planner with rollback simulation.
14. Executable GitHub/GitLab export path (beyond planning-only mode).

### D) Release Validation and Readiness
15. Pilot validation against real enterprise-style workloads across three profiles.
- Yes: this item is explicitly workload testing, not just feature development.
- Goal: prove complete, human-approved bundles with no source VM disruption.

## Working Demo Plan (Build Now)

Yes, we can build a working demo now. Recommended demo scope:

### Demo Goal
- Show a non-technical app owner a complete end-to-end migration planning flow in under 15 minutes.

### Demo Inputs
- 1 sample multi-component runtime snapshot (or local discovery on a lab VM).
- 1 simulated application workspace containing:
  - app server VM
  - stateful data dependency
  - scheduled batch process

### Demo Flow
1. Complete guided intake (plain language prompts).
2. Generate current-state map and executive summary.
3. Generate future-state recommendations with option tradeoffs.
4. Review readiness score, unknowns, and key business risks.
5. Generate migration bundle + blue/green runbook + approval checkpoint.
6. Show export plan output (GitHub/GitLab dry-run in demo).

### Demo Success Criteria
- Non-technical user can explain:
  - how the app works today,
  - what changes are recommended,
  - what risks remain before cutover.
- Full artifact package is produced with human sign-off checkpoint.
