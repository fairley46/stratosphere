import { StratosphereError } from "./errors.js";
import type {
  ApplicationWorkspace,
  BusinessCriticality,
  BusinessIntake,
  DecompositionResult,
  DowntimeTolerance,
  ValidationResult,
} from "./types.js";

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: "Expected an object payload.",
      hint: "Provide a JSON object with required fields.",
    });
  }
  return input as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new StratosphereError({
    code: "INPUT_MISSING",
    message: `Missing required field: ${key}`,
    hint: `Provide a non-empty string for "${key}".`,
  });
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new StratosphereError({
    code: "INPUT_INVALID",
    message: `Field "${key}" must be a non-empty string when provided.`,
    hint: `Fix "${key}" in your JSON payload.`,
  });
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Field "${key}" must be an array of strings.`,
      hint: `Provide "${key}": ["value-a", "value-b"].`,
    });
  }

  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: `Field "${key}" contains an invalid value.`,
        hint: `All "${key}" entries must be non-empty strings.`,
      });
    }
    out.push(item.trim());
  }
  return out;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value === "boolean") return value;
  throw new StratosphereError({
    code: "INPUT_INVALID",
    message: `Field "${key}" must be true or false.`,
    hint: `Provide a boolean value for "${key}".`,
  });
}

function readEnum<T extends string>(record: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: `Field "${key}" must be one of: ${allowed.join(", ")}.`,
      hint: `Update "${key}" to a supported value.`,
    });
  }
  return value as T;
}

export function validateBusinessIntake(input: unknown): BusinessIntake {
  const record = asRecord(input);
  return {
    applicationName: readString(record, "applicationName"),
    businessOwner: readString(record, "businessOwner"),
    technicalOwner: readOptionalString(record, "technicalOwner"),
    criticality: readEnum<BusinessCriticality>(record, "criticality", ["low", "medium", "high"]),
    downtimeTolerance: readEnum<DowntimeTolerance>(record, "downtimeTolerance", ["none", "limited", "flexible"]),
    complianceNeeds: readStringArray(record, "complianceNeeds"),
    vendorOwned: readBoolean(record, "vendorOwned"),
    approvalContacts: readStringArray(record, "approvalContacts"),
    notes: readOptionalString(record, "notes"),
  };
}

function validateWorkspaceAsset(input: unknown): ApplicationWorkspace["assets"][number] {
  const record = asRecord(input);
  const type = readEnum(record, "type", ["vm", "database", "queue", "external-service"]);
  return {
    id: readString(record, "id"),
    type,
    name: readString(record, "name"),
    description: readOptionalString(record, "description"),
  };
}

function validateWorkspaceRelationship(input: unknown): ApplicationWorkspace["relationships"][number] {
  const record = asRecord(input);
  return {
    fromAssetId: readString(record, "fromAssetId"),
    toAssetId: readString(record, "toAssetId"),
    description: readOptionalString(record, "description"),
  };
}

export function validateApplicationWorkspace(input: unknown): ApplicationWorkspace {
  const record = asRecord(input);

  const assetsRaw = record.assets;
  if (!Array.isArray(assetsRaw) || assetsRaw.length === 0) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: "Workspace requires at least one asset.",
      hint: 'Provide "assets": [{ "id": "...", "type": "vm", "name": "..." }].',
    });
  }

  const relationshipsRaw = record.relationships;
  if (!Array.isArray(relationshipsRaw)) {
    throw new StratosphereError({
      code: "INPUT_INVALID",
      message: 'Field "relationships" must be an array.',
      hint: 'Provide "relationships": [] when there are no edges.',
    });
  }

  const assets = assetsRaw.map(validateWorkspaceAsset);
  const assetIdSet = new Set(assets.map((asset) => asset.id));
  const relationships = relationshipsRaw.map(validateWorkspaceRelationship);

  for (const relation of relationships) {
    if (!assetIdSet.has(relation.fromAssetId) || !assetIdSet.has(relation.toAssetId)) {
      throw new StratosphereError({
        code: "INPUT_INVALID",
        message: "Workspace relationship references unknown asset ids.",
        hint: "Ensure fromAssetId/toAssetId values exist in assets[].id.",
        details: relation,
      });
    }
  }

  return {
    workspaceName: readString(record, "workspaceName"),
    assets,
    relationships,
  };
}

export function buildExecutiveSummary(input: {
  migrationId: string;
  intake?: BusinessIntake;
  workspace?: ApplicationWorkspace;
  decomposition: DecompositionResult;
  validation: ValidationResult;
}): string {
  const { migrationId, intake, workspace, decomposition, validation } = input;
  const deploymentCount = decomposition.recommendations.filter((item) => item.kind === "Deployment").length;
  const statefulSetCount = decomposition.recommendations.filter((item) => item.kind === "StatefulSet").length;
  const cronJobCount = decomposition.recommendations.filter((item) => item.kind === "CronJob").length;

  const lines: string[] = [];
  lines.push("# Executive Summary");
  lines.push("");
  lines.push(`Migration ID: ${migrationId}`);
  if (intake?.applicationName) lines.push(`Application: ${intake.applicationName}`);
  if (intake?.businessOwner) lines.push(`Business owner: ${intake.businessOwner}`);
  lines.push("");
  lines.push("## What Stratosphere Found");
  lines.push(
    `- ${decomposition.recommendations.length} application component(s): ${deploymentCount} stateless service(s), ${statefulSetCount} stateful service(s), ${cronJobCount} scheduled job(s).`
  );
  lines.push(`- ${decomposition.blockers.length} blocker(s) require human review before cutover.`);
  lines.push(`- Validation findings: ${validation.findings.length} total.`);
  lines.push("");

  if (workspace) {
    lines.push("## Application Scope");
    lines.push(
      `- Workspace "${workspace.workspaceName}" currently models ${workspace.assets.length} asset(s) and ${workspace.relationships.length} relationship(s).`
    );
    lines.push("");
  }

  if (intake) {
    lines.push("## Business Context");
    lines.push(`- Criticality: ${intake.criticality}`);
    lines.push(`- Downtime tolerance: ${intake.downtimeTolerance}`);
    lines.push(`- Vendor-owned: ${intake.vendorOwned ? "yes" : "no"}`);
    lines.push(`- Compliance needs: ${intake.complianceNeeds.length > 0 ? intake.complianceNeeds.join(", ") : "none listed"}`);
    lines.push("");
  }

  lines.push("## Recommended Next Step");
  if (decomposition.blockers.length > 0 || !validation.readyForHumanReview) {
    lines.push("- Resolve blockers/findings and complete human sign-off before deployment planning.");
  } else {
    lines.push("- Proceed to human sign-off and controlled blue/green deployment planning.");
  }

  return `${lines.join("\n")}\n`;
}
