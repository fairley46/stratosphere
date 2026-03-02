import type { DiscoveryResult, VendorDetectionResult } from "./types.js";

type VendorServicePattern = {
  service: string;
  patterns: string[];
};

type VendorConfig = {
  vendor: string;
  services: VendorServicePattern[];
};

const VENDOR_CONFIGS: VendorConfig[] = [
  {
    vendor: "AWS",
    services: [
      { service: "Lambda", patterns: ["lambda_handler", "aws_lambda", "lambdaclient", "aws-lambda"] },
      { service: "RDS", patterns: ["rds.amazonaws.com", "rdsclient"] },
      { service: "DynamoDB", patterns: ["dynamodb.amazonaws.com", "dynamodbclient", "aws-sdk/client-dynamodb"] },
      { service: "S3", patterns: ["s3.amazonaws.com", "s3client", "aws-sdk/client-s3", "boto3.client('s3')"] },
    ],
  },
  {
    vendor: "Azure",
    services: [
      { service: "CosmosDB", patterns: ["cosmos.azure.com", "cosmosclient", "@azure/cosmos"] },
      { service: "Service Bus", patterns: ["servicebus.windows.net", "servicebusclient", "@azure/service-bus"] },
      { service: "App Service", patterns: ["azurewebsites.net", "azurewebjobs"] },
    ],
  },
  {
    vendor: "GCP",
    services: [
      { service: "Firestore", patterns: ["firestore.googleapis.com", "@google-cloud/firestore"] },
      { service: "Pub/Sub", patterns: ["pubsub.googleapis.com", "@google-cloud/pubsub"] },
      { service: "Cloud Functions", patterns: ["cloudfunctions.net", "functions.framework"] },
    ],
  },
  {
    vendor: "Salesforce",
    services: [
      { service: "Platform Events", patterns: ["platform-event", ".salesforce.com", ".force.com"] },
      { service: "Apex Runtime", patterns: ["apex.execute", "streaming.salesforce.com"] },
    ],
  },
  {
    vendor: "Oracle",
    services: [
      { service: "OCI SDK", patterns: ["oci.oraclecloud.com", "oracle.cloud"] },
      { service: "Oracle DB", patterns: ["oracle.jdbc", "oracledb", "cx_oracle"] },
    ],
  },
  {
    vendor: "SAP",
    services: [
      { service: "NetWeaver", patterns: ["sap.netweaver", "sapnetweaver"] },
      { service: "HANA XS", patterns: ["hana.ondemand.com", "xsengine", "@sap/hana"] },
    ],
  },
];

/**
 * Scan discovery runtime data for cloud/vendor SDK patterns in process commands,
 * environment hints, and established connections.
 */
export function detectVendorDependencies(discovery: DiscoveryResult): VendorDetectionResult {
  const commandTokens = discovery.runtime.processes.map((p) => p.command.toLowerCase());
  const envKeyTokens = discovery.runtime.processes.flatMap((p) => Object.keys(p.envHints ?? {}).map((k) => k.toLowerCase()));
  const hostTokens = discovery.runtime.connections.map((c) => c.toHost.toLowerCase());
  const combined = [...commandTokens, ...envKeyTokens, ...hostTokens].join(" ");

  const detected: VendorDetectionResult["detected"] = [];

  for (const vendorConfig of VENDOR_CONFIGS) {
    for (const serviceDef of vendorConfig.services) {
      const matchedPattern = serviceDef.patterns.find((p) => combined.includes(p.toLowerCase()));
      if (matchedPattern) {
        detected.push({
          vendor: vendorConfig.vendor,
          service: serviceDef.service,
          confidence: 0.75,
          evidence: matchedPattern,
        });
      }
    }
  }

  const advisoryOnly = detected.length > 0;
  const notes = detected.map(
    (d) =>
      `${d.vendor} ${d.service} detected via pattern "${d.evidence}". Validate migration approach with vendor documentation before generating runnable artifacts.`
  );

  return { detected, advisoryOnly, notes };
}
