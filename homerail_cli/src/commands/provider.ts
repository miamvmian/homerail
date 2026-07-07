import type { Command } from "commander";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";

export function registerProviderCommand(program: Command): void {
  const providerCmd = program
    .command("provider")
    .description("List and inspect LLM providers");

  providerCmd
    .command("list")
    .description("List available LLM providers")
    .action(async () => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>("/api/llm/providers");
        const data = resp.data as
          | { providers?: Array<Record<string, unknown>> }
          | undefined;
        const providers = data?.providers ?? [];

        if (globalOpts.json) {
          console.log(JSON.stringify(resp.data ?? resp));
          return;
        }

        if (providers.length === 0) {
          console.log("No providers found.");
          return;
        }

        console.log(
          `${"ID".padEnd(20)} ${"Name".padEnd(20)} ${"Display Name".padEnd(24)}`,
        );
        console.log("-".repeat(64));
        for (const p of providers) {
          const id = String(p.id ?? "?").slice(0, 20);
          const name = String(p.name ?? p.id ?? "-").slice(0, 20);
          const displayName = String(
            p.display_name ?? p.displayName ?? "-",
          ).slice(0, 24);
          console.log(
            `${id.padEnd(20)} ${name.padEnd(20)} ${displayName.padEnd(24)}`,
          );
        }
      } catch (err: unknown) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  providerCmd
    .command("get <id>")
    .description("Get details for a specific LLM provider")
    .action(async (id: string) => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>("/api/llm/providers");
        const data = resp.data as
          | { providers?: Array<Record<string, unknown>> }
          | undefined;
        const providers = data?.providers ?? [];
        const provider = providers.find(
          (p) => p.id === id || String(p.id) === id,
        );

        if (!provider) {
          console.error(`Error: Provider '${id}' not found.`);
          process.exitCode = 1;
          return;
        }

        if (globalOpts.json) {
          console.log(JSON.stringify(provider));
          return;
        }

        for (const [key, value] of Object.entries(provider)) {
          console.log(`${key}: ${value}`);
        }
      } catch (err: unknown) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  providerCmd
    .command("upsert")
    .alias("add")
    .description("Add or update a custom LLM provider")
    .requiredOption("--id <id>", "Provider ID")
    .requiredOption("--default-model <name>", "Default model name")
    .option("--name <name>", "Provider display name")
    .option("--provider-base-url <url>", "Provider base URL")
    .option("--chat-completions-base-url <url>", "Chat Completions-compatible base URL")
    .option("--responses-base-url <url>", "OpenAI Responses-compatible base URL")
    .option("--anthropic-base-url <url>", "Anthropic Messages-compatible base URL")
    .option("--status <status>", "Provider status: active or paused", "active")
    .option("--supports-asr", "Provider supports ASR", false)
    .option("--supports-tts", "Provider supports TTS", false)
    .option("--supports-audio-input", "Provider supports audio input", false)
    .action(async (opts: {
      id: string;
      name?: string;
      defaultModel: string;
      providerBaseUrl?: string;
      chatCompletionsBaseUrl?: string;
      responsesBaseUrl?: string;
      anthropicBaseUrl?: string;
      status?: string;
      supportsAsr?: boolean;
      supportsTts?: boolean;
      supportsAudioInput?: boolean;
    }) => {
      const globalOpts = program.opts() as {
        json?: boolean;
        baseUrl?: string;
        requestTimeout?: number;
      };
      const client = getClient(globalOpts);
      const status = opts.status === "paused" ? "paused" : "active";

      try {
        const body: Record<string, unknown> = {
          id: opts.id,
          name: opts.name,
          status,
          default_model: opts.defaultModel,
          supports_asr: !!opts.supportsAsr,
          supports_tts: !!opts.supportsTts,
          supports_audio_input: !!opts.supportsAudioInput,
        };
        if (opts.providerBaseUrl) body.base_url = opts.providerBaseUrl;
        if (opts.chatCompletionsBaseUrl) body.chat_completions_base_url = opts.chatCompletionsBaseUrl;
        if (opts.responsesBaseUrl) body.responses_base_url = opts.responsesBaseUrl;
        if (opts.anthropicBaseUrl) body.anthropic_base_url = opts.anthropicBaseUrl;

        const resp = await client.post<BaseResponse>("/api/llm/providers", body);

        if (globalOpts.json) {
          console.log(JSON.stringify(resp.data ?? resp));
          return;
        }

        const data = resp.data as Record<string, unknown> | undefined;
        console.log(`Provider upserted: ${String(data?.id ?? opts.id)}`);
      } catch (err: unknown) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
