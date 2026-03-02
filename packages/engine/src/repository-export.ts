import type {
  ArtifactBundle,
  RepositoryExportAction,
  RepositoryExportRequest,
  RepositoryExportResult,
} from "./types.js";

interface RepositoryExporter {
  provider: RepositoryExportRequest["provider"];
  plan(bundle: ArtifactBundle, request: RepositoryExportRequest): RepositoryExportResult;
}

function makeBaseActions(request: RepositoryExportRequest): RepositoryExportAction[] {
  const dryRun = request.dryRun ?? true;
  const status = dryRun ? "planned" : "skipped";
  return [
    {
      kind: "create-repository",
      description: `Create ${request.provider} repository ${request.owner}/${request.repository}`,
      status,
    },
    {
      kind: "create-branch",
      description: "Create migration artifacts branch (codex/stratosphere-migration)",
      status,
    },
    {
      kind: "push-artifacts",
      description: "Push generated artifacts and reports",
      status,
    },
    {
      kind: "open-merge-request",
      description: request.provider === "github" ? "Open pull request" : "Open merge request",
      status,
    },
  ];
}

class GitHubExporter implements RepositoryExporter {
  readonly provider = "github" as const;

  plan(bundle: ArtifactBundle, request: RepositoryExportRequest): RepositoryExportResult {
    return {
      provider: this.provider,
      dryRun: request.dryRun ?? true,
      actions: makeBaseActions(request),
      warnings: [
        "GitHub export runs in planning mode. Configure tokenized API integration before enabling execution.",
        `Planned artifact file count: ${bundle.artifacts.length}`,
      ],
    };
  }
}

class GitLabExporter implements RepositoryExporter {
  readonly provider = "gitlab" as const;

  plan(bundle: ArtifactBundle, request: RepositoryExportRequest): RepositoryExportResult {
    return {
      provider: this.provider,
      dryRun: request.dryRun ?? true,
      actions: makeBaseActions(request),
      warnings: [
        "GitLab export runs in planning mode. Configure project/group token integration before enabling execution.",
        `Planned artifact file count: ${bundle.artifacts.length}`,
      ],
    };
  }
}

const EXPORTERS: RepositoryExporter[] = [new GitHubExporter(), new GitLabExporter()];

export function planRepositoryExport(
  bundle: ArtifactBundle,
  request?: RepositoryExportRequest
): RepositoryExportResult | undefined {
  if (!request) return undefined;

  const exporter = EXPORTERS.find((candidate) => candidate.provider === request.provider);
  if (!exporter) {
    return {
      provider: request.provider,
      dryRun: true,
      actions: [],
      warnings: [`No exporter configured for provider: ${request.provider}`],
    };
  }

  return exporter.plan(bundle, request);
}
