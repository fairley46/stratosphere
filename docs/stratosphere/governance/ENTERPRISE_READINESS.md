# Enterprise Readiness

Date: March 2, 2026

## Objective
Define what "enterprise-ready" means for Stratosphere so engineering, security, and operations teams can adopt it with clear expectations.

## Current Readiness Baseline
1. Discovery safety:
   - Read-only discovery model for snapshot, local, and SSH modes.
2. Governance:
   - Review and approval workflow with enforced approver floor (`>=2`).
3. Change control:
   - Planning-first execution model with explicit preflight and rollback pathways.
4. Evidence and audit:
   - Report bundle includes run metadata, readiness, strategy, ROI, impact, and execution state.
5. Quality:
   - Automated tests and coverage gate at or above 99% line threshold.

## Security and Access Model
1. Principle of least privilege:
   - VM interrogation uses read-only command allowlists.
2. Explicit export policy gate:
   - Export execution requires `STRATOSPHERE_ENABLE_EXPORT_EXECUTION=true` and token env configuration.
3. Human sign-off before mutation:
   - Workflow must pass review + approvals + preflight prior to execute states.
4. Vendor-owned advisory mode:
   - Proprietary systems can be forced to advisory review instead of blind decomposition.

## Operational Expectations
1. Inputs:
   - Runtime snapshot/local/SSH, optional business intake, optional workspace model.
2. Outputs:
   - Technical artifacts + executive reports + governance reports.
3. Ownership model:
   - App owner, platform owner, security reviewer.
4. Runtime expectations:
   - Deterministic artifacts for equivalent inputs and templates.

## Recommended Controls Before Production Rollout
1. Identity and secrets:
   - Standardize token env variable names per provider and tenant policy.
2. Policy hardening:
   - Add org-specific validation rules and compliance mappings.
3. Integration hardening:
   - Validate provider-side export execution under service identities and enterprise tenancy constraints.
4. Observability:
   - Track pipeline runs, approval events, and failure causes in centralized logging.
5. Release model:
   - Maintain release notes, migration templates versioning, and backward-compatibility guidance.

## Gaps Requiring Real Environment Validation
1. Pilot execution against representative workloads.
2. Platform-specific preflight checks in target clusters.
3. Provider API mutation behavior under enterprise token scopes.

## Definition of Enterprise-Ready for GA
1. Three pilot workloads complete with human-approved bundles and no source disruption.
2. Security sign-off on access model and export execution policy.
3. Operational runbook accepted by platform and SRE teams.
4. Demo and onboarding flow usable by engineers without creator assistance.
