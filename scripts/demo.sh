#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/artifacts/stratosphere-demo}"

RUNTIME_FILE="$ROOT_DIR/fixtures/stratosphere/sample-runtime.json"
INTAKE_FILE="$ROOT_DIR/fixtures/stratosphere/sample-intake.json"
WORKSPACE_FILE="$ROOT_DIR/fixtures/stratosphere/sample-workspace.json"

echo "Stratosphere demo starting..."
echo "Output directory: $OUT_DIR"

npm --prefix "$ROOT_DIR" run -s stratosphere -- \
  --runtime-file "$RUNTIME_FILE" \
  --strategy balanced \
  --intake-file "$INTAKE_FILE" \
  --workspace-file "$WORKSPACE_FILE" \
  --signoff-required-approvers 2 \
  --export-provider github \
  --export-owner acme-enterprise \
  --export-repo billing-modernization \
  --out-dir "$OUT_DIR"

node --input-type=module -e "
import { initExecutionWorkflow } from '${ROOT_DIR}/packages/engine/dist/index.js';
initExecutionWorkflow({
  migrationId: 'demo-migration',
  bundleDir: '${OUT_DIR}',
  targetEnvironment: 'demo-k8s',
  requiredApprovers: 2
});
"

required_files=(
  "reports/executive-summary.md"
  "reports/application-map-current.md"
  "reports/application-map-future.md"
  "reports/migration-options.md"
  "reports/readiness.md"
  "reports/roi-estimate.md"
  "reports/business-impact.md"
  "reports/cutover-plan.md"
  "reports/glossary.md"
  "reports/execution-job.json"
  "reports/repository-export.json"
)

echo ""
echo "Validating demo output files..."
for relative in "${required_files[@]}"; do
  target="$OUT_DIR/$relative"
  if [[ ! -f "$target" ]]; then
    echo "Missing required demo artifact: $target" >&2
    exit 1
  fi
  echo "  ok: $relative"
done

echo ""
echo "Demo complete."
echo "Start with: $OUT_DIR/reports/executive-summary.md"
echo "Then present: $OUT_DIR/reports/application-map-current.md -> $OUT_DIR/reports/application-map-future.md"
echo "Finish with: $OUT_DIR/reports/cutover-plan.md and $OUT_DIR/reports/business-impact.md"
