import type { Command } from "commander";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";
import { redactSecret } from "./llm-settings.js";

type VoiceRecognitionMode = "asr" | "omni";
type VoiceTtsOutputChannel = "final" | "commentary";
type VoiceCapability = "supports_llm" | "supports_asr" | "supports_tts";

interface GlobalOpts {
  json?: boolean;
  baseUrl?: string;
  requestTimeout?: number;
}

interface LlmSetting {
  id?: string;
  provider_id?: string;
  provider_name?: string;
  model_name?: string;
  display_name?: string;
  base_url?: string;
  provider_base_url?: string;
  asr_realtime_url?: string;
  tts_voice?: string;
  is_active?: boolean;
  supports_llm?: boolean;
  supports_asr?: boolean;
  supports_tts?: boolean;
}

interface VoiceSettings {
  recognition_mode?: VoiceRecognitionMode;
  omni_base_url?: string;
  omni_model?: string;
  omni_llm_setting_id?: string | null;
  llm_base_url?: string;
  llm_model?: string;
  llm_setting_id?: string | null;
  asr_base_url?: string;
  asr_realtime_url?: string;
  asr_model?: string;
  asr_llm_setting_id?: string | null;
  tts_base_url?: string;
  tts_model?: string;
  tts_llm_setting_id?: string | null;
  tts_voice?: string;
  tts_speed?: number | null;
  tts_stream?: boolean;
  tts_output_channels?: VoiceTtsOutputChannel[];
  [key: string]: unknown;
}

interface VoiceConfigureOptions {
  recognitionMode?: string;
  llmSettingId?: string;
  asrSettingId?: string;
  ttsSettingId?: string;
  ttsVoice?: string;
  ttsStream?: boolean;
  ttsOutputChannel?: VoiceTtsOutputChannel[];
}

const TTS_OUTPUT_CHANNELS = new Set<VoiceTtsOutputChannel>(["commentary", "final"]);

function collectTtsOutputChannel(value: string, previous: VoiceTtsOutputChannel[] = []): VoiceTtsOutputChannel[] {
  const channels = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const channel of channels) {
    if (!TTS_OUTPUT_CHANNELS.has(channel as VoiceTtsOutputChannel)) {
      throw new Error(`Invalid TTS output channel: ${channel}. Expected final or commentary.`);
    }
    if (!previous.includes(channel as VoiceTtsOutputChannel)) {
      previous.push(channel as VoiceTtsOutputChannel);
    }
  }
  return previous;
}

function normalizeRecognitionMode(value: string | undefined): VoiceRecognitionMode | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "asr" || normalized === "omni") return normalized;
  throw new Error("recognition mode must be 'asr' or 'omni'");
}

function normalizeTtsOutputChannels(value: VoiceTtsOutputChannel[] | undefined): VoiceTtsOutputChannel[] | undefined {
  if (!value || value.length === 0) return undefined;
  const result: VoiceTtsOutputChannel[] = [];
  if (value.includes("commentary")) result.push("commentary");
  if (value.includes("final")) result.push("final");
  return result.length ? result : ["final"];
}

function dataObject(response: BaseResponse): Record<string, unknown> {
  return response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {};
}

function settingsFromResponse(response: BaseResponse): LlmSetting[] {
  const data = dataObject(response);
  return Array.isArray(data.settings) ? data.settings as LlmSetting[] : [];
}

function settingLabel(setting: LlmSetting): string {
  return `${setting.display_name || setting.model_name || setting.id || "unknown"} (${setting.provider_id || "unknown"}/${setting.model_name || "unknown"})`;
}

function settingBaseUrl(setting: LlmSetting): string {
  return setting.base_url || setting.provider_base_url || "";
}

function findSetting(settings: LlmSetting[], id: string, capability: VoiceCapability): LlmSetting {
  const setting = settings.find((item) => item.id === id);
  if (!setting) {
    throw new Error(`Setting '${id}' not found.`);
  }
  if (setting.is_active !== true) {
    throw new Error(`Setting '${id}' is not active.`);
  }
  if (setting[capability] !== true) {
    throw new Error(`Setting '${id}' cannot be used here: ${capability}=false.`);
  }
  return setting;
}

function stripVoiceReadOnlyFields(settings: VoiceSettings): VoiceSettings {
  const next = { ...settings };
  delete next.omni_token_set;
  delete next.llm_token_set;
  delete next.asr_token_set;
  delete next.tts_token_set;
  return next;
}

function printVoiceSettings(settings: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(settings)) {
    console.log(`${key}: ${Array.isArray(value) ? value.join(",") : String(value ?? "")}`);
  }
}

export function registerVoiceCommand(program: Command): void {
  const voiceCmd = program
    .command("voice")
    .description("Inspect and configure voice runtime settings");

  voiceCmd
    .command("show")
    .description("Show current voice runtime settings")
    .action(async () => {
      const globalOpts = program.opts() as GlobalOpts;
      const client = getClient(globalOpts);
      try {
        const resp = await client.get<BaseResponse>("/api/voice");
        const safe = redactSecret(resp.data ?? resp);
        if (globalOpts.json) {
          console.log(JSON.stringify(safe));
          return;
        }
        printVoiceSettings(safe as Record<string, unknown>);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });

  voiceCmd
    .command("configure")
    .description("Configure current voice runtime setting selection")
    .option("--recognition-mode <mode>", "Recognition mode: asr or omni")
    .option("--llm-setting-id <id>", "Active LLM setting ID for manager replies")
    .option("--asr-setting-id <id>", "Active ASR setting ID")
    .option("--tts-setting-id <id>", "Active TTS setting ID")
    .option("--tts-voice <voice>", "TTS voice override")
    .option("--tts-stream", "Enable TTS streaming")
    .option("--no-tts-stream", "Disable TTS streaming")
    .option("--tts-output-channel <channel>", "TTS output channel, repeatable or comma-separated: final,commentary", collectTtsOutputChannel)
    .action(async (opts: VoiceConfigureOptions) => {
      const globalOpts = program.opts() as GlobalOpts;
      const client = getClient(globalOpts);

      try {
        const currentResponse = await client.get<BaseResponse>("/api/voice");
        const current = dataObject(currentResponse) as VoiceSettings;
        const next = stripVoiceReadOnlyFields(current);
        const changes: string[] = [];

        const mode = normalizeRecognitionMode(opts.recognitionMode);
        if (mode) {
          next.recognition_mode = mode;
          changes.push(`recognition_mode=${mode}`);
        }

        const needsSettings = Boolean(opts.llmSettingId || opts.asrSettingId || opts.ttsSettingId);
        const settings = needsSettings
          ? settingsFromResponse(await client.get<BaseResponse>("/api/llm/settings"))
          : [];

        if (opts.llmSettingId) {
          const setting = findSetting(settings, opts.llmSettingId, "supports_llm");
          next.llm_setting_id = setting.id ?? opts.llmSettingId;
          next.llm_base_url = settingBaseUrl(setting);
          next.llm_model = setting.model_name ?? "";
          changes.push(`llm=${settingLabel(setting)}`);
        }

        if (opts.asrSettingId) {
          const setting = findSetting(settings, opts.asrSettingId, "supports_asr");
          next.asr_llm_setting_id = setting.id ?? opts.asrSettingId;
          next.asr_base_url = settingBaseUrl(setting);
          next.asr_model = setting.model_name ?? "";
          next.asr_realtime_url = setting.asr_realtime_url || "/api/voice/asr/realtime";
          next.recognition_mode = next.recognition_mode ?? "asr";
          changes.push(`asr=${settingLabel(setting)}`);
        }

        if (opts.ttsSettingId) {
          const setting = findSetting(settings, opts.ttsSettingId, "supports_tts");
          next.tts_llm_setting_id = setting.id ?? opts.ttsSettingId;
          next.tts_base_url = settingBaseUrl(setting);
          next.tts_model = setting.model_name ?? "";
          if (setting.tts_voice && !opts.ttsVoice) {
            next.tts_voice = setting.tts_voice;
          }
          changes.push(`tts=${settingLabel(setting)}`);
        }

        if (opts.ttsVoice) {
          next.tts_voice = opts.ttsVoice;
          changes.push(`tts_voice=${opts.ttsVoice}`);
        }
        if (typeof opts.ttsStream === "boolean") {
          next.tts_stream = opts.ttsStream;
          changes.push(`tts_stream=${opts.ttsStream}`);
        }
        const outputChannels = normalizeTtsOutputChannels(opts.ttsOutputChannel);
        if (outputChannels) {
          next.tts_output_channels = outputChannels;
          changes.push(`tts_output_channels=${outputChannels.join(",")}`);
        }

        const resp = await client.put<BaseResponse>("/api/voice", next);
        const safe = redactSecret(resp.data ?? resp);
        if (globalOpts.json) {
          console.log(JSON.stringify(safe));
          return;
        }

        console.log("Voice settings updated.");
        if (changes.length) {
          for (const change of changes) console.log(`- ${change}`);
        }
        const updated = safe as Record<string, unknown>;
        console.log(`ASR: ${updated.asr_model ?? ""} ${updated.asr_realtime_url ? `(${updated.asr_realtime_url})` : ""}`.trim());
        console.log(`TTS: ${updated.tts_model ?? ""}`.trim());
        console.log(`LLM: ${updated.llm_model ?? ""}`.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });
}
