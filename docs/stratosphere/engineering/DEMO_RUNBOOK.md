# Demo Runbook

*A 12-15 minute walkthrough you can run live, using committed fixtures.*

## Demo Objective
Show that Stratosphere can take a legacy VM view, explain the application clearly, and generate a governed migration package that engineers can act on.

## Demo Setup
```bash
cd /path/to/stratosphere
npm install
npm run build
```

## Run Demo Command

### Option 1: One-command demo (recommended)
```bash
npm run demo
```
Output: `artifacts/stratosphere-demo/`

### Option 2: Scenario fixtures (good for Q&A)

These scenario outputs are committed under `fixtures/scenarios/*/output/` so you can present without running anything.
If you want to regenerate them, re-run the commands below.

### Scenario A: Java Spring Boot monolith
Rocky Linux 9, Spring Boot + PostgreSQL, Liquibase migrations, stateful uploads, secrets: `DB_PASSWORD`, `JWT_SECRET`, `SMTP_API_KEY`.
```bash
npm run stratosphere -- \
  --runtime-file fixtures/scenarios/java-monolith/runtime.json \
  --out-dir fixtures/scenarios/java-monolith/output
```

### Scenario B: .NET Line-of-Business (vendor advisory)
RHEL 8, ASP.NET + SQL Server, Azure Service Bus SDK. **Triggers vendor advisory mode** — Helm/Terraform generated for review only, not immediate deployment.
```bash
npm run stratosphere -- \
  --runtime-file fixtures/scenarios/dotnet-lob/runtime.json \
  --out-dir fixtures/scenarios/dotnet-lob/output
```
Expected output: `blockers=2` (Azure Service Bus advisory + advisory-only blocker).

### Scenario C: Node.js hybrid service
Ubuntu 22.04, PM2 cluster (4 workers) + background job worker, Redis + MongoDB, secrets: `REDIS_PASSWORD`, `MONGO_URI`, `STRIPE_SECRET_KEY`.
```bash
npm run stratosphere -- \
  --runtime-file fixtures/scenarios/nodejs-hybrid/runtime.json \
  --out-dir fixtures/scenarios/nodejs-hybrid/output
```

## Demo Flow
1. Start with business framing:
   - Open `reports/executive-summary.md`
   - Explain "what exists today" and "why migration is needed now".
2. Show technical reality:
   - Open `reports/application-map-current.md`
   - Highlight discovered dependencies and stateful components.
3. Show recommended future:
   - Open `reports/application-map-future.md`
   - Explain workload types (`Deployment`, `StatefulSet`, `CronJob`).
4. Show decision confidence:
   - Open `reports/migration-options.md` and `reports/readiness.md`
   - Explain strategy recommendation and unknowns.
5. Show business decision layer:
   - Open `reports/roi-estimate.md` and `reports/business-impact.md`
   - Explain cost and risk in plain language.
6. Show operational safety:
   - Open `reports/cutover-plan.md` and `reports/execution-job.json`
   - Explain approval gates, preflight checks, and rollback simulation.
7. Show delivery path:
   - Open `reports/repository-export.json`
   - Explain policy-gated export execution and auditability.

## Demo Success Criteria
1. Non-technical stakeholder understands current vs future state.
2. Engineer sees actionable artifacts and governance gates.
3. Team can explain clear next step without ambiguity.

## Demo Notes for Presenter
1. Keep emphasis on "human-in-the-loop, not blind automation."
2. Stress that source workload remains protected via blue/green planning.
3. Close with MCP + CLI flexibility for enterprise environments.
