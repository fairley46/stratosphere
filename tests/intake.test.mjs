import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveSummary,
  toErrorPayload,
  validateApplicationWorkspace,
  validateBusinessIntake,
} from "../packages/engine/dist/index.js";

test("validateBusinessIntake accepts complete payload", () => {
  const intake = validateBusinessIntake({
    applicationName: "Billing Platform",
    businessOwner: "Finance",
    technicalOwner: "Platform",
    criticality: "high",
    downtimeTolerance: "limited",
    complianceNeeds: ["pci"],
    vendorOwned: false,
    approvalContacts: ["owner@acme.com"],
    notes: "Blue/green cutover",
  });
  assert.equal(intake.applicationName, "Billing Platform");
  assert.equal(intake.criticality, "high");
});

test("validateBusinessIntake rejects invalid criticality", () => {
  assert.throws(
    () =>
      validateBusinessIntake({
        applicationName: "Billing Platform",
        businessOwner: "Finance",
        criticality: "urgent",
        downtimeTolerance: "limited",
        complianceNeeds: [],
        vendorOwned: false,
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("validateBusinessIntake rejects non-object payload", () => {
  assert.throws(
    () => validateBusinessIntake(null),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("validateBusinessIntake rejects missing required string", () => {
  assert.throws(
    () =>
      validateBusinessIntake({
        businessOwner: "Finance",
        criticality: "high",
        downtimeTolerance: "limited",
        complianceNeeds: [],
        vendorOwned: false,
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_MISSING");
      return true;
    }
  );
});

test("validateBusinessIntake rejects invalid optional string and arrays/booleans", () => {
  assert.throws(
    () =>
      validateBusinessIntake({
        applicationName: "Billing Platform",
        businessOwner: "Finance",
        technicalOwner: 1234,
        criticality: "high",
        downtimeTolerance: "limited",
        complianceNeeds: [],
        vendorOwned: false,
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      validateBusinessIntake({
        applicationName: "Billing Platform",
        businessOwner: "Finance",
        criticality: "high",
        downtimeTolerance: "limited",
        complianceNeeds: "pci",
        vendorOwned: false,
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      validateBusinessIntake({
        applicationName: "Billing Platform",
        businessOwner: "Finance",
        criticality: "high",
        downtimeTolerance: "limited",
        complianceNeeds: ["", "pci"],
        vendorOwned: false,
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      validateBusinessIntake({
        applicationName: "Billing Platform",
        businessOwner: "Finance",
        criticality: "high",
        downtimeTolerance: "limited",
        complianceNeeds: ["pci"],
        vendorOwned: "false",
        approvalContacts: ["owner@acme.com"],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("validateApplicationWorkspace accepts valid graph", () => {
  const workspace = validateApplicationWorkspace({
    workspaceName: "billing-app",
    assets: [
      { id: "vm-1", type: "vm", name: "Billing VM" },
      { id: "db-1", type: "database", name: "Billing DB" },
    ],
    relationships: [{ fromAssetId: "vm-1", toAssetId: "db-1", description: "app -> db" }],
  });
  assert.equal(workspace.assets.length, 2);
  assert.equal(workspace.relationships.length, 1);
});

test("validateApplicationWorkspace rejects broken relationship", () => {
  assert.throws(
    () =>
      validateApplicationWorkspace({
        workspaceName: "billing-app",
        assets: [{ id: "vm-1", type: "vm", name: "Billing VM" }],
        relationships: [{ fromAssetId: "vm-1", toAssetId: "db-missing" }],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("validateApplicationWorkspace rejects invalid shape", () => {
  assert.throws(
    () =>
      validateApplicationWorkspace({
        workspaceName: "billing-app",
        assets: [],
        relationships: [],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      validateApplicationWorkspace({
        workspaceName: "billing-app",
        assets: [{ id: "vm-1", type: "vm", name: "Billing VM", description: 10 }],
        relationships: [],
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );

  assert.throws(
    () =>
      validateApplicationWorkspace({
        workspaceName: "billing-app",
        assets: [{ id: "vm-1", type: "vm", name: "Billing VM" }],
        relationships: "bad",
      }),
    (error) => {
      const payload = toErrorPayload(error);
      assert.equal(payload.code, "INPUT_INVALID");
      return true;
    }
  );
});

test("buildExecutiveSummary outputs plain-language migration guidance", () => {
  const summary = buildExecutiveSummary({
    migrationId: "mig-1",
    intake: {
      applicationName: "Billing Platform",
      businessOwner: "Finance",
      criticality: "high",
      downtimeTolerance: "limited",
      complianceNeeds: ["pci"],
      vendorOwned: false,
      approvalContacts: ["owner@acme.com"],
    },
    workspace: {
      workspaceName: "billing-app",
      assets: [{ id: "vm-1", type: "vm", name: "Billing VM" }],
      relationships: [],
    },
    decomposition: {
      recommendations: [
        {
          componentId: "api",
          componentName: "api",
          kind: "Deployment",
          stack: "nodejs",
          confidence: 0.9,
          rationale: [],
          imageTag: "api:latest",
          ports: [8080],
          resourceRecommendation: {
            cpuRequestMillicores: 100,
            cpuLimitMillicores: 200,
            memoryRequestMb: 128,
            memoryLimitMb: 256,
          },
          dependencies: [],
        },
      ],
      blockers: [],
    },
    validation: {
      findings: [],
      readyForHumanReview: true,
      requiresHumanSignoff: true,
    },
  });

  assert.ok(summary.includes("Executive Summary"));
  assert.ok(summary.includes("Billing Platform"));
  assert.ok(summary.includes("Proceed to human sign-off"));
});

test("buildExecutiveSummary covers blocker/remediation branch without optional inputs", () => {
  const summary = buildExecutiveSummary({
    migrationId: "mig-2",
    decomposition: { recommendations: [], blockers: ["manual review"] },
    validation: {
      findings: [{ severity: "high", message: "missing probe" }],
      readyForHumanReview: false,
      requiresHumanSignoff: true,
    },
  });

  assert.ok(summary.includes("Resolve blockers/findings"));
  assert.ok(!summary.includes("Business Context"));
});
