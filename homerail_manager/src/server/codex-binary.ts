import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DEFAULT_CODEX_BIN = "codex";

export interface CodexBinaryResolution {
  command: string;
  requested: string;
  needsShell: boolean;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function isPathLike(command: string): boolean {
  return path.isAbsolute(command) || command.includes("/") || command.includes("\\");
}

function windowsCommandNeedsShell(command: string): boolean {
  return isWindows() && /\.(cmd|bat)$/i.test(command);
}

function windowsExecutableNames(command: string): string[] {
  if (!isWindows()) return [command];
  if (/\.(exe|cmd|bat)$/i.test(command)) return [command];
  return [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command];
}

function pathCandidates(command: string): string[] {
  if (!isWindows()) return [command];
  const parsed = path.parse(command);
  if (/\.(exe|cmd|bat)$/i.test(parsed.base)) return [command];
  return windowsExecutableNames(parsed.base).map((name) => path.join(parsed.dir, name));
}

function existingFile(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function findExecutableOnPath(command: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const names = windowsExecutableNames(command);
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      const found = existingFile(candidate);
      if (found) return found;
    }
  }
  return null;
}

function commonCodexCandidates(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".codex", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex",
  ];

  if (isWindows()) {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    candidates.push(...pathCandidates(path.join(home, ".codex", "bin", "codex")));
    if (appData) candidates.push(...pathCandidates(path.join(appData, "npm", "codex")));
    if (localAppData) {
      candidates.push(...pathCandidates(path.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex")));
      candidates.push(...pathCandidates(path.join(localAppData, "Microsoft", "WindowsApps", "codex")));
      candidates.push(...pathCandidates(path.join(localAppData, "pnpm", "codex")));
      candidates.push(...pathCandidates(path.join(localAppData, "Volta", "bin", "codex")));
    }
  }

  return Array.from(new Set(candidates));
}

export function resolveCodexBinary(requested = process.env.HOMERAIL_CODEX_BIN ?? process.env.CODEX_BIN_PATH ?? DEFAULT_CODEX_BIN): CodexBinaryResolution | null {
  const trimmed = requested.trim() || DEFAULT_CODEX_BIN;

  if (isPathLike(trimmed)) {
    for (const candidate of pathCandidates(trimmed)) {
      const found = existingFile(candidate);
      if (found) return { command: found, requested: trimmed, needsShell: windowsCommandNeedsShell(found) };
    }
    return null;
  }

  for (const candidate of commonCodexCandidates()) {
    const found = existingFile(candidate);
    if (found) return { command: found, requested: trimmed, needsShell: windowsCommandNeedsShell(found) };
  }

  const fromPath = findExecutableOnPath(trimmed);
  if (fromPath) return { command: fromPath, requested: trimmed, needsShell: windowsCommandNeedsShell(fromPath) };
  return null;
}

export function runCodexCommandSync(command: string, args: string[], timeoutMs = 5_000): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    timeout: timeoutMs,
    encoding: "utf-8",
    env: process.env,
    shell: windowsCommandNeedsShell(command),
  });
}
