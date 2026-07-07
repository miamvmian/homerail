import { homedir } from "node:os";

export function resolveHomerailHome(): string {
  const envHome = process.env["HOMERAIL_HOME"];
  if (envHome) {
    return normalizePath(envHome);
  }
  return normalizePath(`${homedir()}/.homerail`);
}

export function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export const isWindows = process.platform === "win32";
export const isMacOS = process.platform === "darwin";
export const isLinux = process.platform === "linux";
