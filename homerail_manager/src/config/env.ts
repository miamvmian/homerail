import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

export function getHomerailHome(): string {
  return process.env.HOMERAIL_HOME || path.join(os.homedir(), ".homerail");
}

export const DEFAULT_MANAGER_PORT = 19191;
export const DEFAULT_MANAGER_HOST = "127.0.0.1";

export function getPort(): number {
  return parseInt(process.env.HOMERAIL_MANAGER_PORT || String(DEFAULT_MANAGER_PORT), 10);
}

export function getHost(): string {
  return process.env.HOMERAIL_MANAGER_HOST?.trim() || DEFAULT_MANAGER_HOST;
}

export function getDataRoot(): string {
  return path.join(getHomerailHome(), "manager");
}

export function getDefaultWorkspacePath(): string {
  return path.join(getHomerailHome(), "workspace", "default");
}

export function ensureDefaultWorkspacePath(): string {
  const dir = getDefaultWorkspacePath();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataRoot(), "homerail.db");
}

export function getSessionStoreRoot(): string {
  return path.join(getDataRoot(), "session-store");
}

export function getLegacyManagerTsDataRoot(): string {
  return path.join(getHomerailHome(), "manager-ts");
}

export function getPythonManagerDataRoot(): string {
  return getDataRoot();
}

export function isIsolatedFromPythonManager(): boolean {
  return false;
}
