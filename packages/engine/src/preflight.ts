import { KubeConfig, CoreV1Api as K8sCoreV1Api, StorageV1Api as K8sStorageV1Api } from "@kubernetes/client-node";
import type { PreflightCheck } from "./types.js";

export type ClusterPreflightInput = {
  kubeconfig: string;
  kubeContext?: string;
  namespace: string;
  requiredStorageClass?: string;
  totalCpuMillicores?: number;
  totalMemoryMb?: number;
};

// Minimal interfaces for the K8s API clients. Compatible with both @kubernetes/client-node
// v0.x (returns { body: T }) and v1.x (returns T directly), and testable with plain mock objects.
export interface ClusterCoreApi {
  listNode(...args: unknown[]): Promise<unknown>;
  readNamespace(name: string, ...args: unknown[]): Promise<unknown>;
  listNamespacedResourceQuota(ns: string, ...args: unknown[]): Promise<unknown>;
  listNamespacedSecret(ns: string, ...args: unknown[]): Promise<unknown>;
}

export interface ClusterStorageApi {
  listStorageClass(...args: unknown[]): Promise<unknown>;
}

function unwrap<T>(response: unknown): T {
  if (response && typeof response === "object" && "body" in response) {
    return (response as { body: T }).body;
  }
  return response as T;
}

function items(response: unknown): unknown[] {
  const data = unwrap<{ items?: unknown[] }>(response);
  return data?.items ?? [];
}

async function checkConnectivity(coreV1: ClusterCoreApi): Promise<PreflightCheck> {
  try {
    const nodes = items(await coreV1.listNode());
    return {
      id: "k8s-connectivity",
      title: "Kubernetes API connectivity",
      passed: true,
      message: `API server reachable. ${nodes.length} node(s) visible.`,
    };
  } catch (error) {
    return {
      id: "k8s-connectivity",
      title: "Kubernetes API connectivity",
      passed: false,
      message: `Cannot reach API server: ${String(error).split("\n")[0]}`,
    };
  }
}

async function checkNamespace(coreV1: ClusterCoreApi, namespace: string): Promise<PreflightCheck> {
  try {
    await coreV1.readNamespace(namespace);
    return {
      id: "k8s-namespace",
      title: "Target namespace",
      passed: true,
      message: `Namespace "${namespace}" exists.`,
    };
  } catch (error) {
    const msg = String(error);
    if (msg.includes("404") || msg.includes("not found")) {
      return {
        id: "k8s-namespace",
        title: "Target namespace",
        passed: false,
        message: `Namespace "${namespace}" does not exist. Create it before execution or grant create-namespace permissions.`,
      };
    }
    return {
      id: "k8s-namespace",
      title: "Target namespace",
      passed: false,
      message: `Namespace check failed: ${msg.split("\n")[0]}`,
    };
  }
}

async function checkResourceQuota(
  coreV1: ClusterCoreApi,
  namespace: string,
  totalCpuMillicores: number,
  totalMemoryMb: number
): Promise<PreflightCheck> {
  try {
    const quotas = items(await coreV1.listNamespacedResourceQuota(namespace));
    if (quotas.length === 0) {
      return {
        id: "k8s-resource-quota",
        title: "Cluster resource capacity",
        passed: true,
        message: `No ResourceQuotas set on namespace "${namespace}". Resources unrestricted.`,
      };
    }
    return {
      id: "k8s-resource-quota",
      title: "Cluster resource capacity",
      passed: true,
      message: `ResourceQuota present. Ensure cluster has ${totalCpuMillicores}m CPU and ${totalMemoryMb}Mi memory available.`,
    };
  } catch (error) {
    return {
      id: "k8s-resource-quota",
      title: "Cluster resource capacity",
      passed: false,
      message: `Resource quota check failed: ${String(error).split("\n")[0]}`,
    };
  }
}

async function checkStorageClass(storageV1: ClusterStorageApi, requiredClass?: string): Promise<PreflightCheck> {
  try {
    const classes = items(await storageV1.listStorageClass()) as Array<{ metadata?: { name?: string } }>;
    if (!requiredClass) {
      return {
        id: "k8s-storage-class",
        title: "Storage class availability",
        passed: true,
        message: `${classes.length} storage class(es) available. Verify provisioner meets StatefulSet needs.`,
      };
    }
    const found = classes.some((sc) => sc?.metadata?.name === requiredClass);
    return {
      id: "k8s-storage-class",
      title: "Storage class availability",
      passed: found,
      message: found
        ? `Required storage class "${requiredClass}" is available.`
        : `Required storage class "${requiredClass}" not found. Available: ${classes.map((sc) => sc?.metadata?.name).join(", ") || "none"}.`,
    };
  } catch (error) {
    return {
      id: "k8s-storage-class",
      title: "Storage class availability",
      passed: false,
      message: `Storage class check failed: ${String(error).split("\n")[0]}`,
    };
  }
}

async function checkImagePullSecret(coreV1: ClusterCoreApi, namespace: string): Promise<PreflightCheck> {
  try {
    const secrets = items(await coreV1.listNamespacedSecret(namespace)) as Array<{
      type?: string;
      metadata?: { name?: string };
    }>;
    const pullSecrets = secrets.filter((s) => s?.type === "kubernetes.io/dockerconfigjson");
    if (pullSecrets.length > 0) {
      return {
        id: "k8s-image-pull-secret",
        title: "Image pull secret",
        passed: true,
        message: `${pullSecrets.length} pull secret(s) configured: ${pullSecrets.map((s) => s?.metadata?.name).join(", ")}.`,
      };
    }
    return {
      id: "k8s-image-pull-secret",
      title: "Image pull secret",
      passed: true,
      message: "No pull secrets configured. Required only for private registries.",
    };
  } catch (error) {
    return {
      id: "k8s-image-pull-secret",
      title: "Image pull secret",
      passed: false,
      message: `Pull secret check failed: ${String(error).split("\n")[0]}`,
    };
  }
}

function buildLoadFailedChecks(reason: string): PreflightCheck[] {
  const msg = `Kubeconfig load failed: ${reason}`;
  return [
    { id: "k8s-connectivity", title: "Kubernetes API connectivity", passed: false, message: msg },
    { id: "k8s-namespace", title: "Target namespace", passed: false, message: "Skipped (kubeconfig unavailable)." },
    { id: "k8s-resource-quota", title: "Cluster resource capacity", passed: false, message: "Skipped (kubeconfig unavailable)." },
    { id: "k8s-storage-class", title: "Storage class availability", passed: false, message: "Skipped (kubeconfig unavailable)." },
    { id: "k8s-image-pull-secret", title: "Image pull secret", passed: false, message: "Skipped (kubeconfig unavailable)." },
  ];
}

/**
 * Run the 5 cluster checks against already-constructed API clients.
 * Exported for testing with mock clients — production code calls runClusterPreflightChecks().
 */
export async function runChecksWithClients(
  coreV1: ClusterCoreApi,
  storageV1: ClusterStorageApi,
  input: Omit<ClusterPreflightInput, "kubeconfig">
): Promise<PreflightCheck[]> {
  return Promise.all([
    checkConnectivity(coreV1),
    checkNamespace(coreV1, input.namespace),
    checkResourceQuota(coreV1, input.namespace, input.totalCpuMillicores ?? 500, input.totalMemoryMb ?? 512),
    checkStorageClass(storageV1, input.requiredStorageClass),
    checkImagePullSecret(coreV1, input.namespace),
  ]);
}

/**
 * Run 5 real Kubernetes cluster preflight checks using @kubernetes/client-node.
 * Gracefully returns failed checks on any connection or auth error.
 */
export async function runClusterPreflightChecks(input: ClusterPreflightInput): Promise<PreflightCheck[]> {
  try {
    const kc = new KubeConfig();
    const trimmed = input.kubeconfig.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("apiVersion:")) {
      kc.loadFromString(input.kubeconfig);
    } else {
      kc.loadFromFile(input.kubeconfig);
    }
    if (input.kubeContext) {
      kc.setCurrentContext(input.kubeContext);
    }
    const coreV1 = kc.makeApiClient(K8sCoreV1Api) as unknown as ClusterCoreApi;
    const storageV1 = kc.makeApiClient(K8sStorageV1Api) as unknown as ClusterStorageApi;
    return runChecksWithClients(coreV1, storageV1, input);
  } catch (error) {
    return buildLoadFailedChecks(String(error).split("\n")[0]);
  }
}
