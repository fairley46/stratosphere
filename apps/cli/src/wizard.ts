import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  validateApplicationWorkspace,
  validateBusinessIntake,
  type ApplicationWorkspace,
  type BusinessIntake,
  type MigrationStrategy,
  type WorkspaceAssetType,
} from "@stratosphere/engine";

type GuidedIntakeResult = {
  intake: BusinessIntake;
  workspace: ApplicationWorkspace;
  strategy?: MigrationStrategy;
};

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback?: string
): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
  if (answer.length > 0) return answer;
  return fallback ?? "";
}

async function askEnum<T extends string>(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  allowed: readonly T[],
  fallback: T
): Promise<T> {
  while (true) {
    const answer = (await ask(rl, `${prompt} (${allowed.join("/")})`, fallback)).toLowerCase();
    if (allowed.includes(answer as T)) return answer as T;
    output.write(`Please choose one of: ${allowed.join(", ")}\n`);
  }
}

async function askNumber(rl: ReturnType<typeof createInterface>, prompt: string, fallback: number): Promise<number> {
  while (true) {
    const answer = await ask(rl, prompt, String(fallback));
    const parsed = Number.parseInt(answer, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    output.write("Please enter a valid non-negative integer.\n");
  }
}

async function askYesNo(rl: ReturnType<typeof createInterface>, prompt: string, fallback: boolean): Promise<boolean> {
  const defaultText = fallback ? "yes" : "no";
  while (true) {
    const answer = (await ask(rl, `${prompt} (yes/no)`, defaultText)).toLowerCase();
    if (answer === "yes" || answer === "y") return true;
    if (answer === "no" || answer === "n") return false;
    output.write("Please answer yes or no.\n");
  }
}

export async function runGuidedIntakeWizard(): Promise<GuidedIntakeResult> {
  const rl = createInterface({ input, output });

  try {
    output.write("\nStratosphere Guided Intake Wizard\n");
    output.write("Use plain business answers. You do not need infrastructure expertise.\n\n");

    const applicationName = await ask(rl, "Application name");
    const businessOwner = await ask(rl, "Business owner name");
    const technicalOwnerRaw = await ask(rl, "Technical owner name (optional)");
    const criticality = await askEnum(rl, "How critical is this app to the business?", ["low", "medium", "high"], "medium");
    const downtimeTolerance = await askEnum(
      rl,
      "How much downtime can this app tolerate?",
      ["none", "limited", "flexible"],
      "limited"
    );
    const complianceNeeds = parseCsv(await ask(rl, "Compliance needs (comma-separated, optional)", ""));
    const vendorOwned = await askYesNo(rl, "Is this a vendor-owned/proprietary application?", false);
    const approvalContacts = parseCsv(await ask(rl, "Approval contacts (comma-separated emails or names)", ""));
    const notesRaw = await ask(rl, "Additional notes (optional)", "");

    const strategyRaw = await askEnum(
      rl,
      "Preferred migration approach",
      ["minimal-change", "balanced", "aggressive-modernization"],
      "balanced"
    );

    const workspaceName = await ask(rl, "Workspace name", `${applicationName}-workspace`);
    const assetCount = await askNumber(rl, "How many application assets are in scope?", 3);

    const assets: ApplicationWorkspace["assets"] = [];
    for (let index = 0; index < assetCount; index += 1) {
      output.write(`\nAsset ${index + 1} of ${assetCount}\n`);
      const type = await askEnum<WorkspaceAssetType>(
        rl,
        "Asset type",
        ["vm", "database", "queue", "external-service"],
        index === 0 ? "vm" : "database"
      );
      const id = await ask(rl, "Asset id (short unique id)", `${type}-${index + 1}`);
      const name = await ask(rl, "Asset name", id);
      const description = await ask(rl, "Asset description (optional)", "");
      assets.push({
        id,
        type,
        name,
        description: description || undefined,
      });
    }

    const relationshipCount = await askNumber(rl, "How many relationships connect these assets?", Math.max(0, assetCount - 1));
    const relationships: ApplicationWorkspace["relationships"] = [];
    for (let index = 0; index < relationshipCount; index += 1) {
      output.write(`\nRelationship ${index + 1} of ${relationshipCount}\n`);
      const fromAssetId = await ask(rl, "From asset id");
      const toAssetId = await ask(rl, "To asset id");
      const description = await ask(rl, "Relationship description (optional)", "");
      relationships.push({
        fromAssetId,
        toAssetId,
        description: description || undefined,
      });
    }

    const intake = validateBusinessIntake({
      applicationName,
      businessOwner,
      technicalOwner: technicalOwnerRaw || undefined,
      criticality,
      downtimeTolerance,
      complianceNeeds,
      vendorOwned,
      approvalContacts,
      notes: notesRaw || undefined,
    });

    const workspace = validateApplicationWorkspace({
      workspaceName,
      assets,
      relationships,
    });

    output.write("\nWizard complete. Running migration pipeline with captured inputs.\n\n");
    return {
      intake,
      workspace,
      strategy: strategyRaw,
    };
  } finally {
    rl.close();
  }
}
