import type { Command } from "commander";
import * as readline from "node:readline";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";
import { redactSecret } from "./llm-settings.js";
import { getLocalSecret } from "../local-config.js";

interface CatalogModel {
  id?: string;
  recommended?: boolean;
  supports_llm?: boolean;
  supports_asr?: boolean;
  supports_tts?: boolean;
  supports_audio_input?: boolean;
  supports_image_input?: boolean;
  supports_video_input?: boolean;
}

interface CatalogEndpoint {
  id: string;
  provider_id?: string;
  name?: string;
  plan_type?: string;
  protocol?: string;
  base_url?: string;
  chat_completions_base_url?: string;
  responses_base_url?: string;
  anthropic_base_url?: string;
  auth_type?: string;
  key_hint?: string;
  default_model?: string;
  supports_llm?: boolean;
  supports_asr?: boolean;
  supports_tts?: boolean;
  supports_audio_input?: boolean;
  supports_image_input?: boolean;
  supports_video_input?: boolean;
  models?: CatalogModel[];
}

interface CatalogProvider {
  id: string;
  name?: string;
  status?: string;
  default_model?: string;
  base_url?: string;
  chat_completions_base_url?: string;
  responses_base_url?: string;
  anthropic_base_url?: string;
  supports_llm?: boolean;
  supports_asr?: boolean;
  supports_tts?: boolean;
  supports_audio_input?: boolean;
  supports_image_input?: boolean;
  supports_video_input?: boolean;
  endpoints?: CatalogEndpoint[];
}

interface ConfigureBody {
  provider_id: string;
  model_name: string;
  endpoint_id?: string;
  endpoint_name?: string;
  plan_type?: string;
  protocol?: string;
  auth_type?: string;
  key_hint?: string;
  base_url: string;
  chat_completions_base_url?: string;
  responses_base_url?: string;
  anthropic_base_url?: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
  supports_llm: boolean;
  supports_asr?: boolean;
  supports_tts?: boolean;
  supports_audio_input?: boolean;
  supports_image_input?: boolean;
  supports_video_input?: boolean;
}

interface GlobalOpts {
  json?: boolean;
  baseUrl?: string;
  requestTimeout?: number;
}

interface ConfigureOptions {
  providerId?: string;
  endpointId?: string;
  modelName?: string;
  endpoint?: string;
  modelBaseUrl?: string;
  chatCompletionsEndpoint?: string;
  chatCompletionsBaseUrl?: string;
  responsesEndpoint?: string;
  responsesBaseUrl?: string;
  anthropicEndpoint?: string;
  anthropicBaseUrl?: string;
  apiKey?: string;
  apiKeyStdin?: boolean;
  setDefault?: boolean;
}

function normalizeOptionalUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

function optionChatBaseUrl(opts: ConfigureOptions): string | undefined {
  return normalizeOptionalUrl(
    opts.chatCompletionsEndpoint ??
      opts.chatCompletionsBaseUrl ??
      opts.endpoint ??
      opts.modelBaseUrl,
  );
}

function optionResponsesBaseUrl(opts: ConfigureOptions): string | undefined {
  return normalizeOptionalUrl(opts.responsesEndpoint ?? opts.responsesBaseUrl);
}

function optionAnthropicBaseUrl(opts: ConfigureOptions): string | undefined {
  return normalizeOptionalUrl(opts.anthropicEndpoint ?? opts.anthropicBaseUrl);
}

function optionBaseUrls(opts: ConfigureOptions): {
  baseUrl?: string;
  chatCompletionsBaseUrl?: string;
  responsesBaseUrl?: string;
  anthropicBaseUrl?: string;
} {
  const chatCompletionsBaseUrl = optionChatBaseUrl(opts);
  const responsesBaseUrl = optionResponsesBaseUrl(opts);
  const anthropicBaseUrl = optionAnthropicBaseUrl(opts);
  return {
    baseUrl: chatCompletionsBaseUrl ?? responsesBaseUrl ?? anthropicBaseUrl,
    chatCompletionsBaseUrl,
    responsesBaseUrl,
    anthropicBaseUrl,
  };
}

function hasEndpointOverride(opts: ConfigureOptions): boolean {
  return Boolean(
    opts.endpoint?.trim() ||
      opts.modelBaseUrl?.trim() ||
      opts.chatCompletionsEndpoint?.trim() ||
      opts.chatCompletionsBaseUrl?.trim() ||
      opts.responsesEndpoint?.trim() ||
      opts.responsesBaseUrl?.trim() ||
      opts.anthropicEndpoint?.trim() ||
      opts.anthropicBaseUrl?.trim(),
  );
}

function providerSecretEnv(providerId: string): string {
  const suffix = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return suffix ? `HOMERAIL_${suffix}_API_KEY` : "HOMERAIL_API_KEY";
}

function resolveApiKey(providerId: string, cliKey?: string): string {
  const providerEnv = providerSecretEnv(providerId);
  const value = cliKey || getLocalSecret(providerEnv) || getLocalSecret("HOMERAIL_API_KEY") || "";
  if (!value.trim()) {
    throw new Error(
      `API key is required. Use --api-key-stdin or --api-key. ${providerEnv} and HOMERAIL_API_KEY are legacy import fallbacks.`,
    );
  }
  return value;
}

function readLineFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl.on("error", reject);
  });
}

async function loadProviderCatalog(client: ReturnType<typeof getClient>): Promise<CatalogProvider[]> {
  const response = await client.get<BaseResponse>("/api/llm/providers");
  const data = response.data as { providers?: CatalogProvider[] } | undefined;
  return data?.providers ?? [];
}

function providerEndpoints(provider: CatalogProvider): CatalogEndpoint[] {
  return provider.endpoints ?? [];
}

function modelId(model: CatalogModel | undefined): string | undefined {
  return typeof model?.id === "string" && model.id.trim() ? model.id.trim() : undefined;
}

function endpointModels(endpoint: CatalogEndpoint): CatalogModel[] {
  return endpoint.models ?? [];
}

function endpointContainsModel(endpoint: CatalogEndpoint, modelName: string): boolean {
  if (endpoint.default_model === modelName) return true;
  return endpointModels(endpoint).some((model) => modelId(model) === modelName);
}

function modelForEndpoint(endpoint: CatalogEndpoint, requestedModel?: string): CatalogModel | undefined {
  const models = endpointModels(endpoint);
  if (requestedModel) return models.find((model) => modelId(model) === requestedModel);
  return models.find((model) => model.recommended && modelId(model)) ?? models.find((model) => modelId(model));
}

function selectedModelName(provider: CatalogProvider, endpoint: CatalogEndpoint, requestedModel?: string): string {
  const selected = modelForEndpoint(endpoint, requestedModel);
  return requestedModel || modelId(selected) || endpoint.default_model || provider.default_model || "";
}

function findProviderById(providers: CatalogProvider[], id?: string): CatalogProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

function findProviderByEndpointId(providers: CatalogProvider[], endpointId: string): CatalogProvider | undefined {
  return providers.find((provider) => providerEndpoints(provider).some((endpoint) => endpoint.id === endpointId));
}

function findProvidersByModelId(providers: CatalogProvider[], modelName: string): CatalogProvider[] {
  return providers.filter((provider) => providerEndpoints(provider).some((endpoint) => endpointContainsModel(endpoint, modelName)));
}

function findEndpoint(provider: CatalogProvider, endpointId: string): CatalogEndpoint | undefined {
  return providerEndpoints(provider).find((endpoint) => endpoint.id === endpointId);
}

function endpointIds(endpoints: CatalogEndpoint[]): string {
  return endpoints.map((endpoint) => endpoint.id).join(", ");
}

function selectCatalogProvider(providers: CatalogProvider[], alias: string, opts: ConfigureOptions): CatalogProvider | undefined {
  if (opts.providerId?.trim()) return findProviderById(providers, opts.providerId.trim());
  return findProviderById(providers, alias) ??
    (opts.endpointId ? findProviderByEndpointId(providers, opts.endpointId) : undefined) ??
    findProviderByEndpointId(providers, alias) ??
    singleOrUndefined(findProvidersByModelId(providers, opts.modelName?.trim() || alias));
}

function selectCatalogEndpoint(provider: CatalogProvider, alias: string, opts: ConfigureOptions): CatalogEndpoint {
  const endpoints = providerEndpoints(provider);
  const endpointId = opts.endpointId?.trim();
  if (endpointId) {
    const endpoint = findEndpoint(provider, endpointId);
    if (!endpoint) throw new Error(`Endpoint '${endpointId}' is not available for provider '${provider.id}'.`);
    return endpoint;
  }

  const aliasEndpoint = findEndpoint(provider, alias);
  if (aliasEndpoint) return aliasEndpoint;

  const requestedModel = opts.modelName?.trim() || (alias === provider.id ? "" : alias);
  const modelMatches = requestedModel ? endpoints.filter((endpoint) => endpointContainsModel(endpoint, requestedModel)) : [];
  if (modelMatches.length === 1) return modelMatches[0];
  if (modelMatches.length > 1) {
    throw new Error(
      `Model '${requestedModel}' is available on multiple endpoints for provider '${provider.id}'. Use --endpoint-id. Available endpoints: ${endpointIds(modelMatches)}`,
    );
  }

  if (endpoints.length === 1) return endpoints[0];
  throw new Error(
    `Provider '${provider.id}' has multiple endpoints. Use --endpoint-id. Available endpoints: ${endpointIds(endpoints)}`,
  );
}

function singleOrUndefined<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function inferProtocol(baseUrls: ReturnType<typeof optionBaseUrls>): string {
  if (baseUrls.anthropicBaseUrl && !baseUrls.chatCompletionsBaseUrl && !baseUrls.responsesBaseUrl) {
    return "anthropic_compatible";
  }
  return "openai_compatible";
}

function boolValue(
  model: CatalogModel | undefined,
  endpoint: CatalogEndpoint | undefined,
  provider: CatalogProvider | undefined,
  key: keyof Pick<CatalogModel, "supports_llm" | "supports_asr" | "supports_tts" | "supports_audio_input" | "supports_image_input" | "supports_video_input">,
  defaultValue: boolean,
): boolean {
  return model?.[key] ?? endpoint?.[key] ?? provider?.[key] ?? defaultValue;
}

function buildCatalogBody(
  provider: CatalogProvider,
  endpoint: CatalogEndpoint,
  alias: string,
  opts: ConfigureOptions,
  apiKey: string,
): ConfigureBody {
  if (hasEndpointOverride(opts)) {
    throw new Error("Catalog endpoint base URLs are read-only. Create a custom provider or use `hr llm-settings add` for overrides.");
  }
  const requestedModel = opts.modelName?.trim() || (alias === provider.id || alias === endpoint.id ? undefined : alias);
  const modelName = selectedModelName(provider, endpoint, requestedModel);
  if (!modelName) throw new Error(`No model is configured for endpoint '${endpoint.id}'. Use --model-name.`);
  const model = modelForEndpoint(endpoint, modelName);
  const baseUrl = endpoint.base_url ?? endpoint.chat_completions_base_url ?? endpoint.responses_base_url ?? endpoint.anthropic_base_url;
  if (!baseUrl) throw new Error(`Endpoint '${endpoint.id}' does not define a base URL.`);
  return {
    provider_id: provider.id,
    model_name: modelName,
    endpoint_id: endpoint.id,
    endpoint_name: endpoint.name,
    plan_type: endpoint.plan_type,
    protocol: endpoint.protocol,
    auth_type: endpoint.auth_type,
    key_hint: endpoint.key_hint,
    base_url: baseUrl,
    chat_completions_base_url: endpoint.chat_completions_base_url,
    responses_base_url: endpoint.responses_base_url,
    anthropic_base_url: endpoint.anthropic_base_url,
    api_key: apiKey,
    is_active: true,
    is_default: opts.setDefault !== false,
    supports_llm: boolValue(model, endpoint, provider, "supports_llm", true),
    supports_asr: boolValue(model, endpoint, provider, "supports_asr", false),
    supports_tts: boolValue(model, endpoint, provider, "supports_tts", false),
    supports_audio_input: boolValue(model, endpoint, provider, "supports_audio_input", false),
    supports_image_input: boolValue(model, endpoint, provider, "supports_image_input", false),
    supports_video_input: boolValue(model, endpoint, provider, "supports_video_input", false),
  };
}

function buildCustomBody(alias: string, opts: ConfigureOptions, apiKey: string): ConfigureBody {
  const providerId = opts.providerId?.trim() || alias;
  const modelName = opts.modelName?.trim();
  if (!modelName) throw new Error("Custom provider configuration requires --model-name.");
  const urls = optionBaseUrls(opts);
  if (!urls.baseUrl) {
    throw new Error("Custom provider configuration requires --chat-completions-endpoint, --responses-endpoint, or --anthropic-endpoint.");
  }
  return {
    provider_id: providerId,
    model_name: modelName,
    endpoint_id: opts.endpointId?.trim() || "custom",
    plan_type: "custom",
    protocol: inferProtocol(urls),
    base_url: urls.baseUrl,
    chat_completions_base_url: urls.chatCompletionsBaseUrl,
    responses_base_url: urls.responsesBaseUrl,
    anthropic_base_url: urls.anthropicBaseUrl,
    api_key: apiKey,
    is_active: true,
    is_default: opts.setDefault !== false,
    supports_llm: true,
  };
}

async function ensureCustomProvider(client: ReturnType<typeof getClient>, body: ConfigureBody): Promise<void> {
  if (body.endpoint_id !== "custom") return;
  await client.post<BaseResponse>("/api/llm/providers", {
    id: body.provider_id,
    name: body.provider_id,
    status: "active",
    default_model: body.model_name,
    base_url: body.base_url,
    chat_completions_base_url: body.chat_completions_base_url,
    responses_base_url: body.responses_base_url,
    anthropic_base_url: body.anthropic_base_url,
    supports_llm: true,
  });
}

export async function buildModelConfigureBody(
  client: ReturnType<typeof getClient>,
  alias: string,
  opts: ConfigureOptions,
  apiKey?: string,
): Promise<{ body: ConfigureBody; customProvider: boolean }> {
  const catalog = await loadProviderCatalog(client);
  const provider = selectCatalogProvider(catalog, alias, opts);
  if (provider) {
    const endpoint = selectCatalogEndpoint(provider, alias, opts);
    return { body: buildCatalogBody(provider, endpoint, alias, opts, resolveApiKey(provider.id, apiKey)), customProvider: false };
  }
  const customProviderId = opts.providerId?.trim() || alias;
  const body = buildCustomBody(alias, opts, "__pending_api_key__");
  body.api_key = resolveApiKey(customProviderId, apiKey);
  return { body, customProvider: true };
}

export function registerModelCommand(program: Command): void {
  const modelCmd = program
    .command("model")
    .description("Configure and inspect model runtime settings");

  modelCmd
    .command("configure")
    .description("Configure a model by resolving a provider, endpoint, or model alias from the Manager provider catalog")
    .argument("<alias>", "Provider ID, endpoint ID, model ID, or custom provider ID")
    .option("--provider-id <id>", "Provider ID override")
    .option("--endpoint-id <id>", "Provider catalog endpoint ID")
    .option("--model-name <name>", "Model ID/name to enable")
    .option("--endpoint <url>", "Legacy alias for --chat-completions-endpoint on custom providers")
    .option("--model-base-url <url>", "Alias for --endpoint")
    .option("--chat-completions-endpoint <url>", "Chat Completions base URL for custom providers")
    .option("--chat-completions-base-url <url>", "Alias for --chat-completions-endpoint")
    .option("--responses-endpoint <url>", "Responses API base URL for custom providers")
    .option("--responses-base-url <url>", "Alias for --responses-endpoint")
    .option("--anthropic-endpoint <url>", "Anthropic-compatible base URL for custom providers")
    .option("--anthropic-base-url <url>", "Alias for --anthropic-endpoint")
    .option("--api-key <key>", "API key (prefer --api-key-stdin; env vars are legacy import fallbacks)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option("--set-default", "Mark this setting as the default", true)
    .action(
      async (
        alias: string,
        opts: ConfigureOptions,
      ) => {
        const globalOpts = program.opts() as GlobalOpts;
        const client = getClient(globalOpts);

        try {
          const normalizedAlias = alias.trim();
          if (!normalizedAlias) {
            console.error("Error: provider, endpoint, model, or custom alias is required");
            process.exitCode = 1;
            return;
          }
          const apiKey = opts.apiKeyStdin ? await readLineFromStdin() : opts.apiKey;
          const { body, customProvider } = await buildModelConfigureBody(client, normalizedAlias, opts, apiKey);
          if (customProvider) await ensureCustomProvider(client, body);
          const resp = await client.post<BaseResponse>("/api/llm/settings", body);
          const safe = redactSecret(resp.data ?? resp);

          if (globalOpts.json) {
            console.log(JSON.stringify(safe));
            return;
          }

          const data = resp.data as Record<string, unknown> | undefined;
          console.log(`Configured ${body.provider_id}/${body.model_name}`);
          console.log(`Setting ID: ${data?.id ?? "unknown"}`);
          console.log(`Manager: ${client.baseUrl}`);
          console.log("Next: hr doctor");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Error: ${redactSecret(msg)}`);
          process.exitCode = 1;
        }
      },
    );

  modelCmd
    .command("list")
    .description("List configured model settings")
    .action(async () => {
      const globalOpts = program.opts() as GlobalOpts;
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>("/api/llm/settings");
        const safe = redactSecret(resp.data ?? resp);
        if (globalOpts.json) {
          console.log(JSON.stringify(safe));
          return;
        }

        const data = safe as { settings?: Array<Record<string, unknown>> };
        const settings = data.settings ?? [];
        if (!settings.length) {
          console.log("No model settings found. Run: hr model configure <provider-or-endpoint-alias>");
          return;
        }
        console.log(`${"Provider".padEnd(18)} ${"Model".padEnd(16)} ${"Active".padEnd(8)} Default`);
        console.log("-".repeat(54));
        for (const setting of settings) {
          console.log(
            `${String(setting.provider_id ?? "-").padEnd(18)} ${String(setting.model_name ?? "-").padEnd(16)} ${String(setting.is_active ?? "-").padEnd(8)} ${String(setting.is_default ?? "-")}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${redactSecret(msg)}`);
        process.exitCode = 1;
      }
    });
}
