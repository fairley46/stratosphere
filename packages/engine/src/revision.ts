import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type JsonRecord = Record<string, unknown>;

function loadJson(path: string): JsonRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
  } catch {
    return undefined;
  }
}

export type RevisionDiff = {
  fromBundleDir: string;
  toBundleDir: string;
  changes: Array<{ path: string; from: unknown; to: unknown }>;
};

function collectComparableSummary(summary: JsonRecord | undefined): JsonRecord {
  if (!summary) return {};
  return {
    workloadCount: summary.workloadCount,
    blockers: summary.blockers,
    findings: (summary.validation as JsonRecord | undefined)?.findings,
    strategy: summary.strategy,
    readiness: summary.readiness,
    roi: summary.roi,
  };
}

export function diffPlanRevisions(fromBundleDir: string, toBundleDir: string): RevisionDiff {
  const fromSummary = collectComparableSummary(loadJson(join(fromBundleDir, "reports/migration-summary.json")));
  const toSummary = collectComparableSummary(loadJson(join(toBundleDir, "reports/migration-summary.json")));

  const changes: RevisionDiff["changes"] = [];
  const keys = new Set([...Object.keys(fromSummary), ...Object.keys(toSummary)]);
  for (const key of keys) {
    const fromValue = fromSummary[key];
    const toValue = toSummary[key];
    if (JSON.stringify(fromValue) === JSON.stringify(toValue)) continue;
    changes.push({ path: key, from: fromValue, to: toValue });
  }

  return {
    fromBundleDir,
    toBundleDir,
    changes,
  };
}
