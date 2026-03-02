# Stratosphere v1 Pilot Execution Plan

Date: March 1, 2026

## 1) Pilot Purpose
Validate that Stratosphere can reliably produce human-approved, deploy-ready migration artifacts for difficult VM-hosted applications without disrupting existing production systems.

## 2) Pilot Success Criteria
- Complete migration bundles generated for 3 pilot workloads.
- At least 70% artifact acceptance with minor edits only.
- Median package generation time under 60 minutes per VM.
- Blue/green deployment plan produced for every workload.
- Zero disruptive action on source VMs during discovery.

## 3) Pilot Cohorts (3 Workload Profiles)
1. Enterprise Java/Spring monolith on RHEL with external database dependency.
2. .NET line-of-business service on Rocky Linux with scheduled batch jobs.
3. Node.js application on RHEL with mixed stateless/stateful process behavior.

Note: If a target app is vendor-owned/proprietary, run in advisory-only mode and require vendor review sign-off.

## 4) Timeline (6 Weeks)
### Week 1: Intake and Readiness
- Select pilot systems and owners.
- Confirm SSH read-only access and legal/security approvals.
- Capture baseline metadata (SLOs, traffic patterns, dependencies).

Exit criteria:
- All three pilots have approved access, stakeholder owners, and known rollback constraints.

### Week 2-3: Discovery and Decomposition
- Run SSH discovery and optional source ingest.
- Build VM DNA graph for each workload.
- Generate decomposition recommendations with confidence rationale.

Exit criteria:
- Architecture review completed with component-level accept/reject decisions.

### Week 4: Artifact Generation
- Generate Dockerfiles, Helm charts, and Terraform modules (cloud + OpenStack applicable targets).
- Publish outputs to GitHub/GitLab repos and archive bundles.

Exit criteria:
- Artifact bundles pass lint/syntax checks and are ready for review.

### Week 5: Validation and Review
- Execute policy/validation checks.
- Produce blue/green cutover runbook and rollback procedure.
- Conduct joint review with app owner, platform owner, and security reviewer.

Exit criteria:
- Final human sign-off achieved for each pilot package.

### Week 6: Dry Run and Retrospective
- Perform non-production dry-run deployments from generated artifacts.
- Measure drift between expected and observed behavior.
- Capture lessons and template improvements for v1 GA.

Exit criteria:
- Pilot scorecard published with pass/fail and remediations.

## 5) Roles and Responsibilities
- Product Owner: pilot scope, acceptance criteria, stakeholder communication.
- Migration Architect: decomposition reviews and target topology approval.
- Platform Engineer: Kubernetes/Helm/Terraform validation and dry-run support.
- Security Reviewer: policy checks and vendor-proprietary guardrails.
- Application Owner: final functional sign-off and risk acknowledgment.

## 6) Deliverables Per Pilot VM
- VM DNA graph report.
- Decomposition decision report (with confidence + rationale).
- Dockerfile set.
- Helm chart package.
- Terraform modules (including OpenStack where required).
- Validation report.
- Blue/green runbook and rollback checklist.
- Final sign-off record.

## 7) Measurement Framework
Operational:
- Time to complete discovery.
- Time to first artifact package.
- Number of manual edits per artifact type.

Quality:
- Artifact acceptance rate.
- Validation failures by category.
- Decomposition confidence vs reviewer override rate.

Business:
- Estimated manual effort avoided.
- Estimated infrastructure right-sizing delta.
- Estimated per-VM cost comparison (manual baseline vs Stratosphere flat fee).

## 8) Risk Register
- Access constraints delay discovery.
  Mitigation: pre-approve SSH requirements and fallback windows.
- Incomplete source code coverage.
  Mitigation: runtime-only fallback with explicit confidence penalties.
- Tight coupling blocks decomposition.
  Mitigation: conservative packaging and phased extraction recommendations.
- Vendor app support limitations.
  Mitigation: advisory-only mode and vendor engagement path.

## 9) Go/No-Go Criteria for GA
Go if all are true:
- 3/3 pilot bundles complete and human-approved.
- Median generation time meets <60 minute target.
- No critical validation blockers remain unresolved.
- No source VM disruption incidents.

No-Go if any are true:
- Repeat decomposition errors requiring major manual redesign.
- Unacceptable artifact quality requiring full rewrites.
- Missing governance controls for final approval and traceability.
