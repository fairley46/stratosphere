# Stratosphere Demo Runbook

Date: March 2, 2026
Duration: 12-15 minutes

## Demo Objective
Show that Stratosphere can take a legacy VM view, explain the application clearly, and generate a governed migration package that engineers can act on.

## Demo Setup
```bash
cd /Users/bradfairley/Documents/Playground/stratosphere
npm install
npm run build
```

## Run Demo Command
```bash
npm run demo
```

Default output:
- `artifacts/stratosphere-demo/`

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
