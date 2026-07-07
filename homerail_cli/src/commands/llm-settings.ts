import { InvalidArgumentError, type Command } from "commander";
import * as readline from "node:readline";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

const SECRET_KEYS = new Set([
  "api_key",
  "apiKey",
  "secret",
  "token",
  "password",
]);

const SECRET_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/(api[_-]?key|token|secret|password)=([^&\s]+)/gi, "$1=***REDACTED***"],
  [/(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi, "$1***REDACTED***"],
  [/\b(sk-[A-Za-z0-9._~+/=-]{8,})\b/g, "***REDACTED***"],
];

function redactSecretText(value: string): string {
  return SECRET_TEXT_PATTERNS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    value,
  );
}

/**
 * Recursively redact values whose key looks like a secret.
 * Returns a deep-cloned, redacted copy.
 */
export function redactSecret<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactSecretText(obj) as T;
  if (Array.isArray(obj)) return obj.map(redactSecret) as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>,
    )) {
      if (SECRET_KEYS.has(key) && typeof value === "string") {
        out[key] = "***REDACTED***";
      } else {
        out[key] = redactSecret(value);
      }
    }
    return out as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

async function resolveApiKey(
  cliKey: string | undefined,
  useStdin: boolean,
): Promise<string> {
  if (useStdin) {
    return readLineFromStdin();
  }
  if (cliKey) return cliKey;
  if (process.env.HOMERAIL_API_KEY) return process.env.HOMERAIL_API_KEY;
  throw new Error(
    "API key is required. Use --api-key-stdin or --api-key. HOMERAIL_API_KEY is a legacy import fallback.",
  );
}

export function readLineFromStdin(
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
): Promise<string> {
  if (!input.isTTY) {
    return new Promise((resolve, reject) => {
      let data = "";
      input.setEncoding("utf8");
      input.on("data", (chunk) => { data += String(chunk); });
      input.on("end", () => resolve(data.trim()));
      input.on("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input,
      output: process.stdout,
    });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl.on("error", reject);
  });
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("value must be a positive integer");
  }
  return parsed;
}

interface SharedSettingOptions {
  providerId?: string;
  modelName?: string;
  displayName?: string;
  endpointId?: string;
  endpointName?: string;
  planType?: string;
  protocol?: string;
  authType?: string;
  keyHint?: string;
  modelBaseUrl?: string;
  chatCompletionsBaseUrl?: string;
  chatCompletionsEndpoint?: string;
  responsesBaseUrl?: string;
  responsesEndpoint?: string;
  anthropicBaseUrl?: string;
  anthropicEndpoint?: string;
  resourceId?: string;
  voiceAdapter?: string;
  ttsHttpUrl?: string;
  ttsRealtimeUrl?: string;
  ttsBidirectionalUrl?: string;
  asrRealtimeUrl?: string;
  asrAsyncUrl?: string;
  ttsVoice?: string;
  ttsFormat?: string;
  ttsSampleRate?: number;
  supportsLlm?: boolean;
  supportsAsr?: boolean;
  supportsTts?: boolean;
  supportsAudioInput?: boolean;
  supportsImageInput?: boolean;
  supportsVideoInput?: boolean;
}

interface AddSettingOptions extends SharedSettingOptions {
  providerId: string;
  modelName: string;
  apiKey?: string;
  apiKeyStdin?: boolean;
  default?: boolean;
}

interface UpdateSettingOptions extends SharedSettingOptions {
  apiKey?: string;
  apiKeyStdin?: boolean;
  active?: boolean;
  inactive?: boolean;
  default?: boolean;
}

function addVoiceEndpointOptions(command: Command): Command {
  return command
    .option("--endpoint-name <name>", "Provider catalog endpoint display name")
    .option("--key-hint <hint>", "API key hint shown to users")
    .option("--chat-completions-base-url <url>", "Chat Completions base URL")
    .option("--chat-completions-endpoint <url>", "Alias for --chat-completions-base-url")
    .option("--responses-base-url <url>", "Responses API base URL")
    .option("--responses-endpoint <url>", "Alias for --responses-base-url")
    .option("--anthropic-base-url <url>", "Anthropic-compatible base URL")
    .option("--anthropic-endpoint <url>", "Alias for --anthropic-base-url")
    .option("--resource-id <id>", "Provider resource ID for voice/native adapters")
    .option("--voice-adapter <adapter>", "Voice adapter identifier")
    .option("--tts-http-url <url>", "TTS HTTP endpoint URL")
    .option("--tts-realtime-url <url>", "TTS realtime WebSocket URL")
    .option("--tts-bidirectional-url <url>", "TTS bidirectional WebSocket URL")
    .option("--asr-realtime-url <url>", "ASR realtime WebSocket URL")
    .option("--asr-async-url <url>", "ASR async/batch endpoint URL")
    .option("--tts-voice <voice>", "Default TTS voice")
    .option("--tts-format <format>", "Default TTS output format")
    .option("--tts-sample-rate <hz>", "Default TTS sample rate", parsePositiveInteger);
}

function addCapabilityOptions(command: Command, includeNegated = false): Command {
  let result = command
    .option("--supports-llm", "Supports LLM")
    .option("--supports-asr", "Supports ASR")
    .option("--supports-tts", "Supports TTS")
    .option("--supports-audio-input", "Supports audio input")
    .option("--supports-image-input", "Supports image input")
    .option("--supports-video-input", "Supports video input");
  if (includeNegated) {
    result = result
      .option("--no-supports-llm", "Does not support LLM")
      .option("--no-supports-asr", "Does not support ASR")
      .option("--no-supports-tts", "Does not support TTS")
      .option("--no-supports-audio-input", "Does not support audio input")
      .option("--no-supports-image-input", "Does not support image input")
      .option("--no-supports-video-input", "Does not support video input");
  }
  return result;
}

function addCommonSettingOptions(command: Command, includeRequired = true): Command {
  const withIds = includeRequired
    ? command
      .requiredOption("--provider-id <id>", "Provider ID")
      .requiredOption("--model-name <name>", "Model name")
    : command
      .option("--provider-id <id>", "Provider ID")
      .option("--model-name <name>", "Model name");
  return addVoiceEndpointOptions(withIds
    .option("--display-name <name>", "Display name")
    .option("--endpoint-id <id>", "Provider catalog endpoint ID")
    .option("--plan-type <type>", "Plan type: api_billing, token_plan, coding_plan, agent_plan, subscription, custom")
    .option("--protocol <type>", "Protocol: openai_compatible, anthropic_compatible, dashscope_native, volcengine_openspeech, volcengine_ark_voice, custom")
    .option("--auth-type <type>", "Auth type: bearer, api-key, x-api-key, subscription-key, custom")
    .option("--model-base-url <url>", "Provider/model base URL"));
}

function applySharedSettingOptions(body: Record<string, unknown>, opts: SharedSettingOptions): void {
  const stringMappings: Array<[keyof SharedSettingOptions, string]> = [
    ["providerId", "provider_id"],
    ["modelName", "model_name"],
    ["displayName", "display_name"],
    ["endpointId", "endpoint_id"],
    ["endpointName", "endpoint_name"],
    ["planType", "plan_type"],
    ["protocol", "protocol"],
    ["authType", "auth_type"],
    ["keyHint", "key_hint"],
    ["modelBaseUrl", "base_url"],
    ["chatCompletionsBaseUrl", "chat_completions_base_url"],
    ["chatCompletionsEndpoint", "chat_completions_base_url"],
    ["responsesBaseUrl", "responses_base_url"],
    ["responsesEndpoint", "responses_base_url"],
    ["anthropicBaseUrl", "anthropic_base_url"],
    ["anthropicEndpoint", "anthropic_base_url"],
    ["resourceId", "resource_id"],
    ["voiceAdapter", "voice_adapter"],
    ["ttsHttpUrl", "tts_http_url"],
    ["ttsRealtimeUrl", "tts_realtime_url"],
    ["ttsBidirectionalUrl", "tts_bidirectional_url"],
    ["asrRealtimeUrl", "asr_realtime_url"],
    ["asrAsyncUrl", "asr_async_url"],
    ["ttsVoice", "tts_voice"],
    ["ttsFormat", "tts_format"],
  ];
  for (const [optionKey, bodyKey] of stringMappings) {
    const value = opts[optionKey];
    if (typeof value === "string") body[bodyKey] = value;
  }
  if (typeof opts.ttsSampleRate === "number") {
    body.tts_sample_rate = opts.ttsSampleRate;
  }
}

function applyCapabilityOptions(
  body: Record<string, unknown>,
  opts: SharedSettingOptions,
  defaultValue?: boolean,
): void {
  const mappings: Array<[keyof SharedSettingOptions, string]> = [
    ["supportsLlm", "supports_llm"],
    ["supportsAsr", "supports_asr"],
    ["supportsTts", "supports_tts"],
    ["supportsAudioInput", "supports_audio_input"],
    ["supportsImageInput", "supports_image_input"],
    ["supportsVideoInput", "supports_video_input"],
  ];
  for (const [optionKey, bodyKey] of mappings) {
    const value = opts[optionKey];
    if (typeof value === "boolean") {
      body[bodyKey] = value;
    } else if (typeof defaultValue === "boolean") {
      body[bodyKey] = defaultValue;
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerLlmSettingsCommand(program: Command): void {
  const settingsCmd = program
    .command("llm-settings")
    .description("Manage LLM model settings");

  // -- list ----------------------------------------------------------------
  settingsCmd
    .command("list")
    .description("List LLM model settings")
    .action(async () => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>("/api/llm/settings");
        const data = resp.data as
          | { settings?: Array<Record<string, unknown>> }
          | undefined;
        const settings = data?.settings ?? [];

        const safeData = redactSecret(resp.data ?? resp);

        if (globalOpts.json) {
          console.log(JSON.stringify(safeData));
          return;
        }

        if (settings.length === 0) {
          console.log("No model settings found.");
          return;
        }

        const safeSettings = redactSecret(settings);
        console.log(
          `${"ID".padEnd(20)} ${"Provider".padEnd(14)} ${"Model".padEnd(26)} ${"Active".padEnd(8)} API Key`,
        );
        console.log("-".repeat(90));
        for (const s of safeSettings) {
          const rec = s as Record<string, unknown>;
          const id = String(rec.id ?? "?").slice(0, 20);
          const provider = String(
            rec.provider_id ?? rec.providerId ?? "-",
          ).slice(0, 14);
          const model = String(rec.model_name ?? rec.modelName ?? "-").slice(
            0,
            26,
          );
          const active = String(
            rec.is_active ?? rec.isActive ?? "-",
          ).slice(0, 8);
          const apiKey = String(rec.api_key ?? rec.apiKey ?? "-");
          console.log(
            `${id.padEnd(20)} ${provider.padEnd(14)} ${model.padEnd(26)} ${active.padEnd(8)} ${apiKey}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });

  // -- add -----------------------------------------------------------------
  const addCommand = settingsCmd
    .command("add")
    .description("Add a new LLM model setting")
    .option("--api-key <key>", "API key (prefer --api-key-stdin; env vars are legacy import fallbacks)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option("--default", "Mark this setting as default", false)
    .addHelpText("after", "\nUse --api-key-stdin for secrets in shell history-sensitive environments.");
  addCapabilityOptions(addCommonSettingOptions(addCommand), false)
    .action(
      async (opts: AddSettingOptions) => {
        const globalOpts = program.opts() as {
          json?: boolean;
          baseUrl?: string;
          requestTimeout?: number;
        };
        const client = getClient(globalOpts);

        try {
          const apiKey = await resolveApiKey(opts.apiKey, !!opts.apiKeyStdin);

          const body: Record<string, unknown> = {
            api_key: apiKey,
            is_default: !!opts.default,
          };
          applySharedSettingOptions(body, opts);
          applyCapabilityOptions(body, opts, false);

          const resp = await client.post<BaseResponse>(
            "/api/llm/settings",
            body,
          );

          const safeData = redactSecret(resp.data ?? resp);

          if (globalOpts.json) {
            console.log(JSON.stringify(safeData));
            return;
          }

          const data = resp.data as Record<string, unknown> | undefined;
          const id = data?.id ?? "?";
          console.log(
            `Setting added (id: ${id}). ${resp.message || "Success"}`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Error: ${redactSecret(msg)}`);
          process.exitCode = 1;
        }
      },
    );

  // -- update --------------------------------------------------------------
  const updateCommand = settingsCmd
    .command("update <id>")
    .description("Update an existing LLM model setting")
    .option("--api-key <key>", "API key (prefer --api-key-stdin; env vars are legacy import fallbacks)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option("--active", "Mark this setting active")
    .option("--inactive", "Mark this setting inactive")
    .option("--default", "Mark this setting as default")
    .option("--no-default", "Mark this setting as non-default");
  addCapabilityOptions(addCommonSettingOptions(updateCommand, false), true)
    .action(async (id: string, opts: UpdateSettingOptions) => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const body: Record<string, unknown> = {};
        applySharedSettingOptions(body, opts);
        applyCapabilityOptions(body, opts);
        if (opts.apiKeyStdin || opts.apiKey) {
          body.api_key = await resolveApiKey(opts.apiKey, !!opts.apiKeyStdin);
        }
        if (opts.active && opts.inactive) {
          throw new Error("Use only one of --active or --inactive.");
        }
        if (typeof opts.active === "boolean" || typeof opts.inactive === "boolean") {
          body.is_active = Boolean(opts.active) && !opts.inactive;
        }
        if (typeof opts.default === "boolean") {
          body.is_default = opts.default;
        }

        const resp = await client.put<BaseResponse>(
          `/api/llm/settings/${encodeURIComponent(id)}`,
          body,
        );
        const safeData = redactSecret(resp.data ?? resp);

        if (globalOpts.json) {
          console.log(JSON.stringify(safeData));
          return;
        }

        console.log(`Setting ${id} updated. ${resp.message || "Success"}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });

  // -- get -----------------------------------------------------------------
  settingsCmd
    .command("get <id>")
    .description("Get a specific LLM model setting")
    .action(async (id: string) => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>("/api/llm/settings");
        const data = resp.data as
          | { settings?: Array<Record<string, unknown>> }
          | undefined;
        const settings = data?.settings ?? [];
        const setting = settings.find(
          (s) => s.id === id || String(s.id) === id,
        );

        if (!setting) {
          console.error(`Error: Setting '${id}' not found.`);
          process.exitCode = 1;
          return;
        }

        const safeSetting = redactSecret(setting);

        if (globalOpts.json) {
          console.log(JSON.stringify(safeSetting));
          return;
        }

        for (const [key, value] of Object.entries(
          safeSetting as Record<string, unknown>,
        )) {
          console.log(`${key}: ${value}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });

  // -- delete --------------------------------------------------------------
  settingsCmd
    .command("delete <id>")
    .description("Delete an LLM model setting")
    .action(async (id: string) => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const resp = await client.delete<BaseResponse>(
          `/api/llm/settings/${encodeURIComponent(id)}`,
        );

        const safeData = redactSecret(resp.data ?? resp);

        if (globalOpts.json) {
          console.log(JSON.stringify(safeData));
          return;
        }

        console.log(`Setting ${id} deleted. ${resp.message || ""}`.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });
}
