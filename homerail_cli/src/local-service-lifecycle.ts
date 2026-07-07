import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { getHomerailHome } from "./local-config.js";

export type LocalRuntimeServiceId =
  | "manager"
  | "node"
  | "ui-https"
  | "ui-http"
  | "worker-image";

export type LocalRuntimeServiceState =
  | "running"
  | "healthy"
  | "degraded"
  | "stopped"
  | "missing"
  | "unknown";

export interface LocalRuntimeServiceStatus {
  id: LocalRuntimeServiceId;
  label: string;
  state: LocalRuntimeServiceState;
  pid?: number;
  pid_running?: boolean;
  healthy?: boolean;
  log_path?: string;
  detail?: string;
}

export interface RuntimeServiceControlStatus {
  service_id: "homerail-runtime";
  label: string;
  platform: NodeJS.Platform;
  supported: boolean;
  installed: boolean;
  config_path: string;
  load_domain?: string;
  detail?: string;
}

export interface RuntimeServiceLifecycleResult {
  action: "install" | "uninstall";
  status: RuntimeServiceControlStatus;
  loaded?: boolean;
  unloaded?: boolean;
}

export interface RuntimeServiceLifecycleOptions {
  platform?: NodeJS.Platform;
  homerailHome?: string;
  homeDir?: string;
  repoRoot?: string;
  cliPath?: string;
  nodePath?: string;
  load?: boolean;
  unload?: boolean;
}

export interface RuntimeStatusLike {
  managerPid?: number;
  nodePid?: number;
  uiHttpsPid?: number;
  uiHttpPid?: number;
  managerPidRunning?: boolean;
  nodePidRunning?: boolean;
  uiHttpsPidRunning?: boolean;
  uiHttpPidRunning?: boolean;
  managerHealthy?: boolean;
  runtime?: unknown;
}

const LAUNCH_AGENT_LABEL = "com.homerail.runtime";
const LAUNCH_AGENT_FILE = `${LAUNCH_AGENT_LABEL}.plist`;

function defaultRepoRoot(): string {
  const override = process.env.HOMERAIL_REPO_ROOT?.trim();
  if (override) return override;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}

function defaultCliPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "cli.js");
}

function logsDir(homerailHome = getHomerailHome()): string {
  return path.join(homerailHome, "logs");
}

function logPath(name: string, homerailHome = getHomerailHome()): string {
  return path.join(logsDir(homerailHome), `${name}.log`);
}

function launchAgentsDir(homeDir = os.homedir()): string {
  return path.join(homeDir, "Library", "LaunchAgents");
}

function launchAgentPath(options: RuntimeServiceLifecycleOptions = {}): string {
  return path.join(launchAgentsDir(options.homeDir), LAUNCH_AGENT_FILE);
}

function launchAgentDomain(): string | undefined {
  const getuid = process.getuid;
  return typeof getuid === "function" ? `gui/${getuid()}` : undefined;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plistString(value: string): string {
  return `<string>${xmlEscape(value)}</string>`;
}

function plistArray(values: string[]): string {
  return [
    "<array>",
    ...values.map((value) => `  ${plistString(value)}`),
    "</array>",
  ].join("\n");
}

function plistEnv(values: Record<string, string>): string {
  return [
    "<dict>",
    ...Object.entries(values).flatMap(([key, value]) => [
      `  <key>${xmlEscape(key)}</key>`,
      `  ${plistString(value)}`,
    ]),
    "</dict>",
  ].join("\n");
}

export function createLaunchAgentPlist(options: RuntimeServiceLifecycleOptions = {}): string {
  const homerailHome = options.homerailHome ?? getHomerailHome();
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const cliPath = options.cliPath ?? defaultCliPath();
  const nodePath = options.nodePath ?? process.execPath;
  const outLog = logPath("launchd", homerailHome);
  const errLog = logPath("launchd", homerailHome);
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  ${plistString(LAUNCH_AGENT_LABEL)}`,
    "  <key>ProgramArguments</key>",
    plistArray([nodePath, cliPath, "start", "--ui"]).split("\n").map((line) => `  ${line}`).join("\n"),
    "  <key>WorkingDirectory</key>",
    `  ${plistString(repoRoot)}`,
    "  <key>EnvironmentVariables</key>",
    plistEnv({
      HOMERAIL_HOME: homerailHome,
      HOMERAIL_REPO_ROOT: repoRoot,
      PATH: process.env.PATH ?? "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    }).split("\n").map((line) => `  ${line}`).join("\n"),
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <false/>",
    "  <key>StandardOutPath</key>",
    `  ${plistString(outLog)}`,
    "  <key>StandardErrorPath</key>",
    `  ${plistString(errLog)}`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export function getRuntimeServiceControlStatus(
  options: RuntimeServiceLifecycleOptions = {},
): RuntimeServiceControlStatus {
  const platform = options.platform ?? process.platform;
  const configPath = launchAgentPath(options);
  const supported = platform === "darwin";
  return {
    service_id: "homerail-runtime",
    label: LAUNCH_AGENT_LABEL,
    platform,
    supported,
    installed: supported && fs.existsSync(configPath),
    config_path: configPath,
    load_domain: supported ? launchAgentDomain() : undefined,
    detail: supported ? undefined : "Service registration is implemented for macOS LaunchAgent; Linux/Windows hooks are explicit extension points.",
  };
}

function runLaunchctl(args: string[]): void {
  const result = spawnSync("launchctl", args, { encoding: "utf-8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `launchctl ${args.join(" ")} failed`).trim();
    throw new Error(detail);
  }
}

export function installRuntimeService(
  options: RuntimeServiceLifecycleOptions = {},
): RuntimeServiceLifecycleResult {
  const status = getRuntimeServiceControlStatus(options);
  if (!status.supported) {
    return { action: "install", status };
  }
  const homerailHome = options.homerailHome ?? getHomerailHome();
  fs.mkdirSync(launchAgentsDir(options.homeDir), { recursive: true });
  fs.mkdirSync(logsDir(homerailHome), { recursive: true });
  fs.writeFileSync(status.config_path, createLaunchAgentPlist(options), "utf-8");
  let loaded = false;
  if (options.load !== false && status.load_domain) {
    runLaunchctl(["bootstrap", status.load_domain, status.config_path]);
    loaded = true;
  }
  return {
    action: "install",
    status: getRuntimeServiceControlStatus(options),
    loaded,
  };
}

export function uninstallRuntimeService(
  options: RuntimeServiceLifecycleOptions = {},
): RuntimeServiceLifecycleResult {
  const status = getRuntimeServiceControlStatus(options);
  if (!status.supported) {
    return { action: "uninstall", status };
  }
  let unloaded = false;
  if (options.unload !== false && status.installed && status.load_domain) {
    try {
      runLaunchctl(["bootout", status.load_domain, status.config_path]);
      unloaded = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!detail.includes("Could not find specified service") && !detail.includes("No such process")) {
        throw err;
      }
    }
  }
  if (fs.existsSync(status.config_path)) fs.rmSync(status.config_path, { force: true });
  return {
    action: "uninstall",
    status: getRuntimeServiceControlStatus(options),
    unloaded,
  };
}

function runtimeData(runtime: unknown): Record<string, unknown> {
  return runtime && typeof runtime === "object" ? runtime as Record<string, unknown> : {};
}

export function buildLocalRuntimeServiceStatuses(
  status: RuntimeStatusLike,
  homerailHome = getHomerailHome(),
): LocalRuntimeServiceStatus[] {
  const data = runtimeData(status.runtime);
  const connectedWorkers = typeof data.connected_workers === "number" ? data.connected_workers : 0;
  return [
    {
      id: "manager",
      label: "Manager",
      state: status.managerHealthy ? "healthy" : status.managerPidRunning ? "degraded" : "stopped",
      pid: status.managerPid,
      pid_running: status.managerPidRunning,
      healthy: status.managerHealthy,
      log_path: logPath("manager", homerailHome),
    },
    {
      id: "node",
      label: "Node",
      state: status.nodePidRunning ? "running" : "stopped",
      pid: status.nodePid,
      pid_running: status.nodePidRunning,
      log_path: logPath("node", homerailHome),
    },
    {
      id: "ui-https",
      label: "Agent UI HTTPS",
      state: status.uiHttpsPidRunning ? "running" : "stopped",
      pid: status.uiHttpsPid,
      pid_running: status.uiHttpsPidRunning,
      log_path: logPath("ui-https", homerailHome),
    },
    {
      id: "ui-http",
      label: "Agent UI HTTP",
      state: status.uiHttpPidRunning ? "running" : "stopped",
      pid: status.uiHttpPid,
      pid_running: status.uiHttpPidRunning,
      log_path: logPath("ui", homerailHome),
    },
    {
      id: "worker-image",
      label: "Worker image preflight",
      state: connectedWorkers > 0 ? "running" : "unknown",
      detail: connectedWorkers > 0
        ? `${connectedWorkers} worker connection(s) active`
        : "Checked by hr start and hr doctor --docker before Docker-backed runs.",
    },
  ];
}
