import Docker from "dockerode";
import type {
  ExecutionProvider,
  ContainerConfig,
  ContainerInfo,
  ExecResult,
} from "./types.js";

export interface DockerApiProviderOptions {
  socketPath?: string;
  host?: string;
  port?: number;
}

export function resolveDockerApiOptions(
  opts?: DockerApiProviderOptions,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): DockerApiProviderOptions | undefined {
  if (opts && Object.keys(opts).length > 0) return opts;
  if (env.DOCKER_HOST?.trim()) return opts;
  if (platform === "win32") return { socketPath: "//./pipe/docker_engine" };
  return opts;
}

function normalizeStatus(s: string): ContainerInfo["status"] {
  switch (s) {
    case "created":
      return "created";
    case "running":
      return "running";
    case "exited":
    case "dead":
      return "stopped";
    case "removing":
      return "removed";
    default:
      return "stopped";
  }
}

function toContainerInfo(data: Docker.ContainerInspectInfo): ContainerInfo {
  const name = typeof data.Name === "string" ? data.Name.replace(/^\//, "") : undefined;
  return {
    id: data.Id,
    status: normalizeStatus(data.State.Status || "unknown"),
    name,
    labels: data.Config?.Labels ?? undefined,
    exitCode: data.State.ExitCode,
    startedAt: data.State.StartedAt,
    finishedAt: data.State.FinishedAt,
    error: data.State.Error,
  };
}

export class DockerApiProvider implements ExecutionProvider {
  private docker: Docker;

  constructor(opts?: DockerApiProviderOptions) {
    this.docker = new Docker(resolveDockerApiOptions(opts));
  }

  async create(config: ContainerConfig): Promise<ContainerInfo> {
    const createOpts: Docker.ContainerCreateOptions = {
      Image: config.image,
      Cmd: config.command,
      Env: config.env
        ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      Labels: config.labels,
      WorkingDir: config.workdir,
    };

    if (config.name) {
      createOpts.name = config.name;
    }

    if (config.mounts && config.mounts.length > 0) {
      createOpts.HostConfig = {
        Mounts: config.mounts.map((m) => ({
          Type: "bind",
          Source: m.host,
          Target: m.container,
          ReadOnly: (m.mode ?? "").split(",").map((part) => part.trim().toLowerCase()).includes("ro"),
        })),
      };
    }

    if (config.ports && config.ports.length > 0) {
      const exposedPorts: Record<string, Record<string, never>> = {};
      const portBindings: Record<string, Array<{ HostIp?: string; HostPort: string }>> = {};
      for (const p of config.ports) {
        const protocol = p.protocol ?? "tcp";
        const key = `${p.containerPort}/${protocol}`;
        exposedPorts[key] = {};
        portBindings[key] = [{
          HostIp: p.hostIp,
          HostPort: String(p.hostPort),
        }];
      }
      createOpts.ExposedPorts = exposedPorts;
      createOpts.HostConfig = {
        ...createOpts.HostConfig,
        PortBindings: portBindings,
      };
    }

    if (config.extraHosts && config.extraHosts.length > 0) {
      createOpts.HostConfig = {
        ...createOpts.HostConfig,
        ExtraHosts: config.extraHosts,
      };
    }

    if (config.network) {
      createOpts.HostConfig = {
        ...createOpts.HostConfig,
        NetworkMode: config.network,
      };
    }

    const container = await this.docker.createContainer(createOpts);
    const data = await container.inspect();
    return toContainerInfo(data);
  }

  async start(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.start();
  }

  async stop(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.stop();
  }

  async kill(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.kill();
  }

  async remove(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.remove({ force: true });
  }

  async exec(id: string, cmd: string[]): Promise<ExecResult> {
    const container = this.docker.getContainer(id);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise<ExecResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let exitCode = 0;

      stream.on("data", (chunk: Buffer) => {
        // dockerode multiplexes stdout/stderr into a single stream;
        // demuxStream separates them. For simplicity we capture all output.
        stdout += chunk.toString();
      });

      stream.on("end", () => {
        exec.inspect((_err, data) => {
          if (data?.ExitCode !== undefined && data.ExitCode !== null) {
            exitCode = data.ExitCode;
          }
          resolve({ exitCode, stdout, stderr });
        });
      });

      stream.on("error", reject);
    });
  }

  async *logs(id: string): AsyncIterable<string> {
    const container = this.docker.getContainer(id);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    for await (const chunk of stream) {
      yield chunk.toString("utf-8");
    }
  }

  async inspect(id: string): Promise<ContainerInfo> {
    const container = this.docker.getContainer(id);
    const data = await container.inspect();
    return toContainerInfo(data);
  }

  async list(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: true });
    return containers.map((c) => ({
      id: c.Id,
      status: normalizeStatus(c.State || c.Status),
      name: c.Names?.[0]?.replace(/^\//, ""),
      labels: c.Labels,
      exitCode: undefined,
      startedAt: c.Created ? new Date(c.Created * 1000).toISOString() : undefined,
      finishedAt: undefined,
      error: c.Status?.includes("Error") ? c.Status : undefined,
    }));
  }
}
