import * as fs from "node:fs";

export interface DockerBinaryResolveOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  existsSync?: (filePath: string) => boolean;
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

function configuredDockerBinary(env: NodeJS.ProcessEnv): string | undefined {
  const configured = env.HOMERAIL_DOCKER_BIN || env.DOCKER_BIN;
  if (!configured) return undefined;
  const binary = unquote(configured);
  return binary || undefined;
}

export function windowsDockerBinaryCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
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

export function resolveDockerBinary(options: DockerBinaryResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.existsSync ?? fs.existsSync;
  const configured = configuredDockerBinary(env);
  if (configured) return configured;

  if (platform === "win32") {
    const found = windowsDockerBinaryCandidates(env).find((candidate) => exists(candidate));
    if (found) return found;
  }

  return "docker";
}

export function dockerNotFoundDetail(binary = resolveDockerBinary()): string {
  if (binary === "docker") {
    return "command not found; install Docker Desktop, add docker.exe to PATH, or set HOMERAIL_DOCKER_BIN";
  }
  return `command not found at ${binary}; set HOMERAIL_DOCKER_BIN to the Docker CLI path`;
}
