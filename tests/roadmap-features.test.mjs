import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBusinessImpactReport,
  buildBlueGreenCutoverPlan,
  buildGlossaryPack,
  buildRuntimeWindowProfile,
  buildSourceAnalysis,
  renderBlueGreenCutoverPlanMarkdown,
  renderBusinessImpactMarkdown,
  renderGlossaryMarkdown,
  renderRuntimeWindowProfileMarkdown,
} from "../packages/engine/dist/index.js";

function recommendation(kind, name = kind.toLowerCase()) {
  return {
    componentId: `${name}-id`,
    componentName: name,
    kind,
    stack: kind === "StatefulSet" ? "dotnet" : "nodejs",
    confidence: 0.81,
    rationale: [],
    imageTag: "x:latest",
    ports: [8080],
    resourceRecommendation: {
      cpuRequestMillicores: 200,
      cpuLimitMillicores: 400,
      memoryRequestMb: 256,
      memoryLimitMb: 512,
    },
    dependencies: [],
  };
}

test("business impact report translates technical risk into business categories", () => {
  const report = buildBusinessImpactReport({
    decomposition: {
      recommendations: [recommendation("StatefulSet"), recommendation("Deployment", "api")],
      blockers: ["manual data cutover needed"],
    },
    validation: {
      findings: [{ severity: "high", message: "security context missing" }],
      readyForHumanReview: false,
      requiresHumanSignoff: true,
    },
    intake: {
      applicationName: "Billing",
      businessOwner: "Ops",
      criticality: "high",
      downtimeTolerance: "none",
      complianceNeeds: ["pci"],
      vendorOwned: false,
      approvalContacts: ["owner@example.com"],
    },
    readinessUnknowns: ["Approval contacts for DB owner missing"],
  });

  assert.equal(report.assessments.length, 4);
  assert.ok(report.topRisks.length >= 1);
  assert.ok(report.assessments.some((item) => item.category === "customer-risk" && item.severity === "high"));
  assert.ok(renderBusinessImpactMarkdown(report).includes("Business Impact"));
});

test("business impact report supports low-risk branch", () => {
  const report = buildBusinessImpactReport({
    decomposition: { recommendations: [recommendation("Deployment", "api")], blockers: [] },
    validation: { findings: [], readyForHumanReview: true, requiresHumanSignoff: true },
    intake: {
      applicationName: "Internal Tool",
      businessOwner: "IT",
      criticality: "low",
      downtimeTolerance: "flexible",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: ["it@example.com"],
    },
    readinessUnknowns: [],
  });

  assert.ok(report.assessments.some((item) => item.category === "customer-risk" && item.severity === "low"));
});

test("cutover plan generates stages and rollback simulation guidance", () => {
  const plan = buildBlueGreenCutoverPlan({
    decomposition: {
      recommendations: [recommendation("StatefulSet"), recommendation("Deployment", "api"), recommendation("CronJob", "cleanup")],
      blockers: [],
    },
    intake: {
      applicationName: "Billing",
      businessOwner: "Ops",
      criticality: "medium",
      downtimeTolerance: "limited",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: ["ops@example.com"],
    },
    readinessScore: 82,
  });

  assert.equal(plan.mode, "blue-green");
  assert.ok(plan.stages.some((item) => item.id === "shift-100"));
  assert.ok(plan.rollbackSimulations.length >= 3);
  assert.ok(renderBlueGreenCutoverPlanMarkdown(plan).includes("Rollback Simulations"));
});

test("glossary pack renders plain-language terms", () => {
  const glossary = buildGlossaryPack();
  assert.ok(glossary.entries.length > 0);
  const markdown = renderGlossaryMarkdown(glossary);
  assert.ok(markdown.includes("Stratosphere Glossary"));
  assert.ok(markdown.includes("Blue/Green Migration"));
});

test("runtime window profile aggregates sample variance and confidence", () => {
  const discovery = {
    runtime: {
      host: { hostname: "vm-a", os: "linux" },
      processes: [
        {
          pid: 1,
          name: "api",
          command: "node api.js",
          user: "app",
          cpuPercent: 20,
          memoryMb: 256,
          listeningPorts: [8080],
          fileWrites: [],
        },
      ],
      connections: [],
      scheduledJobs: [],
      profileWindowSamples: [
        {
          capturedAt: "2026-03-02T10:00:00.000Z",
          processes: [
            { processName: "api", cpuPercent: 20, memoryMb: 256 },
            { processName: "worker", cpuPercent: 10, memoryMb: 128 },
          ],
        },
        {
          capturedAt: "2026-03-02T10:15:00.000Z",
          processes: [
            { processName: "api", cpuPercent: 35, memoryMb: 300 },
            { processName: "worker", cpuPercent: 18, memoryMb: 140 },
          ],
        },
      ],
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: "2026-03-02T10:20:00.000Z",
      commandResults: [],
    },
  };

  const profile = buildRuntimeWindowProfile(discovery);
  assert.equal(profile.sampleCount, 2);
  assert.equal(profile.windowMinutes, 15);
  assert.ok(profile.processProfiles.some((item) => item.processName === "api"));
  assert.ok(renderRuntimeWindowProfileMarkdown(profile).includes("Runtime Window Profile"));
});

test("runtime window profile falls back to point-in-time sample when no window data exists", () => {
  const discovery = {
    runtime: {
      host: { hostname: "vm-b", os: "linux" },
      processes: [
        {
          pid: 10,
          name: "api",
          command: "node api.js",
          user: "app",
          cpuPercent: 21,
          memoryMb: 220,
          listeningPorts: [8080],
          fileWrites: [],
        },
      ],
      connections: [],
      scheduledJobs: [],
    },
    evidence: {
      collector: "snapshot",
      commands: [],
      warnings: [],
      collectedAt: "2026-03-02T12:00:00.000Z",
      commandResults: [],
    },
  };

  const profile = buildRuntimeWindowProfile(discovery);
  assert.equal(profile.sampleCount, 1);
  assert.equal(profile.windowMinutes, 0);
});

test("source analysis produces stack/file hints and low-confidence warnings", () => {
  const report = buildSourceAnalysis(
    {
      runtime: {
        host: { hostname: "vm-c", os: "linux" },
        processes: [
          {
            pid: 1,
            name: "unknown-worker",
            command: "run worker",
            user: "app",
            cpuPercent: 2,
            memoryMb: 64,
            listeningPorts: [],
            fileWrites: [],
          },
        ],
        connections: [],
        scheduledJobs: [],
        source: {
          repositoryPath: "/srv/app",
          detectedStacks: ["unknown"],
          buildFiles: [],
        },
      },
      evidence: {
        collector: "snapshot",
        commands: [],
        warnings: [],
        collectedAt: "2026-03-02T12:00:00.000Z",
        commandResults: [],
      },
    },
    {
      recommendations: [],
      blockers: [],
    }
  );

  assert.equal(report.componentMappings.length, 1);
  assert.ok(report.componentMappings[0].notes.length > 0);
  assert.ok(report.warnings.length > 0);
});
