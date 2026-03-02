import type {
  DiscoveryAdapter,
  DiscoveryRequest,
  DiscoveryResult,
  RuntimeSnapshot,
} from "./types.js";

const SSH_DISCOVERY_COMMANDS = [
  "uname -a",
  "cat /etc/os-release",
  "hostname -f",
  "ip -brief addr",
  "ps -eo pid,user,%cpu,rss,args --sort=-%cpu",
  "ss -lntup",
  "systemctl list-units --type=service --state=running",
  "crontab -l",
  "for d in /etc/cron.d /etc/cron.daily /etc/cron.hourly; do ls -la $d; done",
  "lsof -nP -i",
  "find /var /opt /srv -maxdepth 3 -type f -printf '%p\\n'",
] as const;

function cloneRuntime(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RuntimeSnapshot;
}

export class SnapshotDiscoveryAdapter implements DiscoveryAdapter {
  readonly name = "snapshot";

  async collect(request: DiscoveryRequest): Promise<DiscoveryResult> {
    if (!request.runtimeSnapshot) {
      throw new Error("SnapshotDiscoveryAdapter requires request.runtimeSnapshot");
    }

    return {
      runtime: cloneRuntime(request.runtimeSnapshot),
      evidence: {
        collector: this.name,
        commands: [],
        warnings: [],
        collectedAt: new Date().toISOString(),
      },
    };
  }
}

export class SshDiscoveryAdapter implements DiscoveryAdapter {
  readonly name = "ssh-readonly";

  async collect(request: DiscoveryRequest): Promise<DiscoveryResult> {
    if (!request.connection) {
      throw new Error("SshDiscoveryAdapter requires request.connection");
    }

    if (!request.runtimeSnapshot) {
      throw new Error(
        "SSH execution is not wired in this scaffold yet. Provide runtimeSnapshot while keeping SSH evidence metadata."
      );
    }

    const warnings = [
      "Using provided runtimeSnapshot fallback. Remote SSH command execution adapter is planned for next increment.",
    ];

    return {
      runtime: cloneRuntime(request.runtimeSnapshot),
      evidence: {
        collector: this.name,
        commands: [...SSH_DISCOVERY_COMMANDS],
        warnings,
        collectedAt: new Date().toISOString(),
      },
    };
  }
}

export function getSshDiscoveryCommandSet(): readonly string[] {
  return SSH_DISCOVERY_COMMANDS;
}
