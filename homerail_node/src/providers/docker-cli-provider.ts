import { execFile as execFileCb, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ExecutionProvider,
  ContainerConfig,
  ContainerInfo,
  ExecResult,
} from "./types.js";

type ExecFileOptions = {
  encoding?: BufferEncoding;
  maxBuffer?: number;
  windowsHide?: boolean;
};

export interface DockerCliProviderOptions {
  dockerPath?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  existsSync?: (filePath: string) => boolean;
}

export class DockerNotFoundError extends Error {
  constructor() {
    super("docker: command not found. Is Docker installed?");
    this.name = "DockerNotFoundError";
  }
}

export class DockerDaemonError extends Error {
  constructor() {
    super("Cannot connect to the Docker daemon. Is Docker running?");
    this.name = "DockerDaemonError";
  }
}

export class DockerPermissionError extends Error {
  constructor() {
    super(
      "permission denied while trying to connect to the Docker daemon. Is the current user in the docker group?",
    );
    this.name = "DockerPermissionError";
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function windowsDockerBinaryCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates = new Set<string>();
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"];
  candidates.add(`${programFiles}\\Docker\\Docker\\resources\\bin\\docker.exe`);
  if (programFilesX86) {
    candidates.add(`${programFilesX86}\\Docker\\Docker\\resources\\bin\\docker.exe`);
  }
  candidates.add("C:\\ProgramData\\chocolatey\\bin\\docker.exe");
  return [...candidates];
}

export function resolveDockerCliPath(options: DockerCliProviderOptions = {}): string {
  const configured = options.dockerPath || options.env?.HOMERAIL_DOCKER_BIN || options.env?.DOCKER_BIN;
  if (configured) return unquote(configured);

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.existsSync ?? existsSync;
  if (platform === "win32") {
    const found = windowsDockerBinaryCandidates(env).find((candidate) => exists(candidate));
    if (found) return found;
  }
  return "docker";
}

function execFile(
  file: string,
  args?: string[],
  options?: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cb = (
      err: Error | null,
      stdout: string | Buffer,
      stderr: string | Buffer,
    ) => {
      if (err) reject(err);
      else
        resolve({
          stdout: typeof stdout === "string" ? stdout : stdout.toString(),
          stderr: typeof stderr === "string" ? stderr : stderr.toString(),
        });
    };
    if (args !== undefined && options !== undefined) {
      execFileCb(file, args, { windowsHide: true, ...options }, cb);
    } else if (args !== undefined) {
      execFileCb(file, args, { windowsHide: true }, cb);
    } else {
      execFileCb(file, { windowsHide: true }, cb);
    }
  });
}

function classifyError(err: Error): Error {
  const msg = (err as NodeJS.ErrnoException).message || "";
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || msg.includes("command not found")) {
    return new DockerNotFoundError();
  }
  if (code === "EACCES" || msg.includes("permission denied")) {
    return new DockerPermissionError();
  }
  if (
    msg.includes("Cannot connect to the Docker daemon") ||
    msg.includes("Is the docker daemon running")
  ) {
    return new DockerDaemonError();
  }
  return err;
}

function buildMountArg(mount: NonNullable<ContainerConfig["mounts"]>[number]): string {
  const parts = [
    "type=bind",
    `source=${mount.host}`,
    `target=${mount.container}`,
  ];
  const modeParts = (mount.mode ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (modeParts.includes("ro") || modeParts.includes("readonly")) {
    parts.push("readonly");
  }
  return parts.join(",");
}

function buildCreateArgs(config: ContainerConfig): string[] {
  const args: string[] = ["create"];

  if (config.name) {
    args.push("--name", config.name);
  }

  if (config.workdir) {
    args.push("--workdir", config.workdir);
  }

  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }

  if (config.mounts) {
    for (const m of config.mounts) {
      args.push("--mount", buildMountArg(m));
    }
  }

  if (config.ports) {
    for (const p of config.ports) {
      const protocol = p.protocol ?? "tcp";
      const hostIp = p.hostIp ? `${p.hostIp}:` : "";
      args.push("-p", `${hostIp}${p.hostPort}:${p.containerPort}/${protocol}`);
    }
  }

  if (config.labels) {
    for (const [key, value] of Object.entries(config.labels)) {
      args.push("--label", `${key}=${value}`);
    }
  }

  if (config.extraHosts) {
    for (const entry of config.extraHosts) {
      args.push("--add-host", entry);
    }
  }

  if (config.network) {
    args.push("--network", config.network);
  }

  if (config.command && config.command.length > 0) {
    args.push("--entrypoint", config.command[0]!);
    args.push(config.image);
    if (config.command.length > 1) {
      args.push(...config.command.slice(1));
    }
  } else {
    args.push(config.image);
  }

  return args;
}

function parseInspectOutput(stdout: string): ContainerInfo {
  const parsed = JSON.parse(stdout);
  const data = parsed[0];
  const state = data.State;
  const name = typeof data.Name === "string" ? data.Name.replace(/^\//, "") : undefined;
  return {
    id: data.Id,
    status: normalizeStatus(state.Status),
    name,
    labels: data.Config?.Labels ?? undefined,
    exitCode: state.ExitCode,
    startedAt: state.StartedAt,
    finishedAt: state.FinishedAt,
    error: state.Error,
  };
}

function normalizeStatus(s: string): ContainerInfo["status"] {
  switch (s) {
    case "created":
      return "created";
    case "running":
      return "running";
    case "exited":
    case "stopped":
    case "dead":
      return "stopped";
    case "removing":
    case "removed":
      return "removed";
    default:
      return "stopped";
  }
}

async function parseCreateOutput(stdout: string, dockerPath: string): Promise<ContainerInfo> {
  const id = stdout.trim();
  const info = await execFile(dockerPath, ["inspect", id]);
  return parseInspectOutput(info.stdout);
}

export class DockerCliProvider implements ExecutionProvider {
  private readonly dockerPath: string;

  constructor(options: DockerCliProviderOptions = {}) {
    this.dockerPath = resolveDockerCliPath(options);
  }

  async create(config: ContainerConfig): Promise<ContainerInfo> {
    try {
      const args = buildCreateArgs(config);
      const { stdout } = await execFile(this.dockerPath, args, {
        encoding: "utf-8",
      });
      return parseCreateOutput(stdout, this.dockerPath);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async start(id: string): Promise<void> {
    try {
      await execFile(this.dockerPath, ["start", id]);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async stop(id: string): Promise<void> {
    try {
      await execFile(this.dockerPath, ["stop", id]);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async kill(id: string): Promise<void> {
    try {
      await execFile(this.dockerPath, ["kill", id]);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await execFile(this.dockerPath, ["rm", "-f", id]);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async exec(id: string, cmd: string[]): Promise<ExecResult> {
    try {
      const args = ["exec", id, ...cmd];
      const { stdout, stderr } = await execFile(this.dockerPath, args, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        exitCode: 0,
        stdout: stdout || "",
        stderr: stderr || "",
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number };
      if (e.code !== undefined && typeof e.code === "number") {
        return {
          exitCode: e.code,
          stdout: "",
          stderr: e.message || "",
        };
      }
      throw classifyError(err as Error);
    }
  }

  async *logs(id: string): AsyncIterable<string> {
    const child = spawn(this.dockerPath, ["logs", "-f", id], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let done = false;

    child.on("close", () => {
      done = true;
    });

    try {
      for await (const chunk of child.stdout) {
        yield chunk.toString("utf-8");
      }
    } finally {
      if (!done) {
        child.kill();
      }
    }
  }

  async inspect(id: string): Promise<ContainerInfo> {
    try {
      const { stdout } = await execFile(this.dockerPath, ["inspect", id], {
        encoding: "utf-8",
      });
      return parseInspectOutput(stdout);
    } catch (err) {
      throw classifyError(err as Error);
    }
  }

  async list(): Promise<ContainerInfo[]> {
    try {
      const { stdout } = await execFile(this.dockerPath, [
        "ps",
        "-a",
        "--format",
        "json",
      ]);
      if (!stdout.trim()) return [];
      return stdout
        .trim()
        .split("\n")
        .map((line) => {
          const raw = JSON.parse(line);
          const names = typeof raw.Names === "string"
            ? raw.Names.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [];
          const labels = typeof raw.Labels === "string" && raw.Labels
            ? Object.fromEntries(raw.Labels.split(",").filter(Boolean).map((item: string) => {
              const index = item.indexOf("=");
              return index === -1 ? [item, ""] : [item.slice(0, index), item.slice(index + 1)];
            }))
            : undefined;
          return {
            id: raw.ID,
            status: normalizeStatus(raw.State || raw.Status),
            name: names[0],
            labels,
            exitCode: raw.ExitCode !== undefined ? Number(raw.ExitCode) : undefined,
            startedAt: raw.StartedAt,
            finishedAt: raw.FinishedAt,
            error: raw.Error,
          };
        });
    } catch (err) {
      throw classifyError(err as Error);
    }
  }
}
