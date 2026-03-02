import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadinessAssessment,
  buildRoiEstimate,
  buildStrategyOptionsReport,
  renderReadinessMarkdown,
  renderRoiMarkdown,
  renderStrategyOptionsMarkdown,
} from "../packages/engine/dist/index.js";

function rec(kind, confidence = 0.9) {
  return {
    componentId: `${kind.toLowerCase()}-a`,
    componentName: `${kind}-a`,
    kind,
    stack: "nodejs",
    confidence,
    rationale: [],
    imageTag: "x:latest",
    ports: [],
    resourceRecommendation: {
      cpuRequestMillicores: 100,
      cpuLimitMillicores: 200,
      memoryRequestMb: 128,
      memoryLimitMb: 256,
    },
    dependencies: [],
  };
}

test("buildStrategyOptionsReport recommends minimal-change for blockers/high findings", () => {
  const report = buildStrategyOptionsReport(
    { recommendations: [rec("Deployment")], blockers: ["x"] },
    { findings: [{ severity: "high", message: "x" }], readyForHumanReview: false, requiresHumanSignoff: true }
  );
  assert.equal(report.recommended, "minimal-change");
  assert.ok(report.rationale.includes("Blockers"));
});

test("buildStrategyOptionsReport recommends balanced for multi-stateful", () => {
  const report = buildStrategyOptionsReport(
    { recommendations: [rec("StatefulSet"), rec("StatefulSet")], blockers: [] },
    { findings: [], readyForHumanReview: true, requiresHumanSignoff: true }
  );
  assert.equal(report.recommended, "balanced");
});

test("buildStrategyOptionsReport recommends aggressive for low blocker profile", () => {
  const report = buildStrategyOptionsReport(
    { recommendations: [rec("Deployment")], blockers: [] },
    { findings: [], readyForHumanReview: true, requiresHumanSignoff: true }
  );
  assert.equal(report.recommended, "aggressive-modernization");
});

test("buildReadinessAssessment computes score/status/confidence and graph", () => {
  const readiness = buildReadinessAssessment({
    decomposition: { recommendations: [rec("Deployment", 0.8)], blockers: ["x"] },
    validation: {
      findings: [
        { severity: "high", message: "h" },
        { severity: "medium", message: "m" },
        { severity: "low", message: "l" },
      ],
      readyForHumanReview: false,
      requiresHumanSignoff: true,
    },
    intake: {
      applicationName: "Billing",
      businessOwner: "Ops",
      criticality: "high",
      downtimeTolerance: "limited",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
    workspace: {
      workspaceName: "w",
      assets: [{ id: "a", type: "vm", name: "A" }],
      relationships: [],
    },
  });

  assert.equal(readiness.status, "NOT_READY");
  assert.ok(readiness.score <= 100);
  assert.ok(readiness.unknowns.length > 0);
  assert.ok(readiness.mermaid.includes("Readiness Score"));
});

test("buildReadinessAssessment handles missing intake/workspace and no recommendations", () => {
  const readiness = buildReadinessAssessment({
    decomposition: { recommendations: [], blockers: [] },
    validation: { findings: [], readyForHumanReview: true, requiresHumanSignoff: true },
  });
  assert.equal(readiness.status, "CONDITIONAL");
  assert.ok(readiness.unknowns.some((item) => item.includes("Business intake")));
});

test("buildRoiEstimate covers strategy branches and criticality tiers", () => {
  const minimal = buildRoiEstimate({
    strategy: "minimal-change",
    processCount: 2,
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "low",
      downtimeTolerance: "flexible",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
  });
  const balanced = buildRoiEstimate({
    strategy: "balanced",
    processCount: 4,
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "medium",
      downtimeTolerance: "limited",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
  });
  const aggressive = buildRoiEstimate({
    strategy: "aggressive-modernization",
    processCount: 6,
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "high",
      downtimeTolerance: "none",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
  });

  assert.ok(minimal.projections.oneTimeMigrationUsd < aggressive.projections.oneTimeMigrationUsd);
  assert.ok(minimal.assumptions.vmSecurityOverheadMonthlyUsd < aggressive.assumptions.vmSecurityOverheadMonthlyUsd);
  assert.ok(balanced.notes.length > 0);
});

test("buildRoiEstimate handles no-payback branch", () => {
  const roi = buildRoiEstimate({
    strategy: "minimal-change",
    processCount: 1,
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "low",
      downtimeTolerance: "flexible",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
  });
  assert.ok(roi.projections.paybackMonths === null || roi.projections.paybackMonths >= 0);
});

test("markdown renderers produce expected sections", () => {
  const options = buildStrategyOptionsReport(
    { recommendations: [rec("Deployment")], blockers: [] },
    { findings: [], readyForHumanReview: true, requiresHumanSignoff: true }
  );
  const readiness = buildReadinessAssessment({
    decomposition: { recommendations: [rec("Deployment")], blockers: [] },
    validation: { findings: [], readyForHumanReview: true, requiresHumanSignoff: true },
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "medium",
      downtimeTolerance: "limited",
      complianceNeeds: ["pci"],
      vendorOwned: false,
      approvalContacts: ["x@y.com"],
    },
    workspace: {
      workspaceName: "w",
      assets: [{ id: "a", type: "vm", name: "A" }],
      relationships: [{ fromAssetId: "a", toAssetId: "a" }],
    },
  });
  const roi = buildRoiEstimate({
    strategy: "balanced",
    processCount: 3,
    intake: {
      applicationName: "A",
      businessOwner: "B",
      criticality: "medium",
      downtimeTolerance: "limited",
      complianceNeeds: [],
      vendorOwned: false,
      approvalContacts: [],
    },
  });

  assert.ok(renderStrategyOptionsMarkdown(options).includes("Migration Strategy Options"));
  assert.ok(renderReadinessMarkdown(readiness).includes("Readiness Assessment"));
  assert.ok(renderRoiMarkdown(roi).includes("ROI Estimate"));
});
