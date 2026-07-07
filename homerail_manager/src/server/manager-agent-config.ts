import * as http from "node:http";
import {
  readManagerAgentConfig,
  saveManagerAgentConfig,
} from "../persistence/manager-agent-config.js";
import { resolveManagerAgentConfig } from "./manager-agent-container.js";
import { normalizeManagerAgentHarness } from "homerail-protocol";

interface BaseResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

function json(res: http.ServerResponse, status: number, body: BaseResponse): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function ok(res: http.ServerResponse, message: string, data?: unknown): void {
  json(res, 200, { success: true, message, data });
}

function badRequest(res: http.ServerResponse, message: string): void {
  json(res, 400, { success: false, message, error: message });
}

function serverError(res: http.ServerResponse, message: string): void {
  json(res, 500, { success: false, message, error: message });
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function _string(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateManagerConfig(config: ReturnType<typeof readManagerAgentConfig>): void {
  if (!config.llm_setting_id && !config.provider_name && config.harness !== "kimi_code") return;
  resolveManagerAgentConfig(
    undefined,
    config.provider_name ?? undefined,
    config.model_name ?? undefined,
    config.llm_setting_id ?? undefined,
    config.harness,
    config.reasoning_effort,
  );
}

export function validateConfigPatch(patch: Record<string, unknown>): void {
  const current = readManagerAgentConfig();
  const settingId = _string(patch.llm_setting_id);
  const providerName = _string(patch.provider_name);
  const modelName = _string(patch.model_name);
  const harness = normalizeManagerAgentHarness(patch.harness) ?? current.harness;
  validateManagerConfig({
    ...current,
    harness,
    llm_setting_id: settingId === undefined ? current.llm_setting_id : settingId,
    provider_name: providerName === undefined ? current.provider_name : providerName,
    model_name: modelName === undefined ? current.model_name : modelName,
  });
}

export function managerAgentConfigRoutesHandler(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const method = req.method || "GET";

  if (pathname !== "/api/manager-agent/config") return false;

  if (method === "GET") {
    ok(res, "Manager Agent config loaded", readManagerAgentConfig());
    return true;
  }

  if (method === "PUT") {
    readJsonBody(req)
      .then((body) => {
        try {
          validateConfigPatch(body);
        } catch (err) {
          badRequest(res, err instanceof Error ? err.message : String(err));
          return;
        }
        const next = saveManagerAgentConfig(body);
        ok(res, "Manager Agent config saved", next);
      })
      .catch((err) => serverError(res, err instanceof Error ? err.message : String(err)));
    return true;
  }

  badRequest(res, "Unsupported Manager Agent config method");
  return true;
}
