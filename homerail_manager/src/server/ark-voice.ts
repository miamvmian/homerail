import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { IncomingMessage } from "node:http";
import { WebSocket, type RawData } from "ws";
import type { LLMSetting } from "../persistence/llm-settings.js";

export const OPEN_SPEECH_PROTOCOL = "volcengine_openspeech";
export const ARK_VOICE_PROTOCOL = OPEN_SPEECH_PROTOCOL;
export const LEGACY_DOUBAO_VOICE_PROTOCOL = "volcengine_doubao_voice";
export const OPEN_SPEECH_ENDPOINT_ID = "volcengine_openspeech_api";
export const ARK_VOICE_ENDPOINT_ID = OPEN_SPEECH_ENDPOINT_ID;
export const LEGACY_ARK_VOICE_ENDPOINT_ID = "volcengine_ark_voice_api";
export const LEGACY_DOUBAO_VOICE_ENDPOINT_ID = "volcengine_doubao_voice_token";
export const LEGACY_ARK_AGENT_PLAN_VOICE_ENDPOINT_ID = "volcengine_ark_agent_plan_voice";
export const ARK_TTS_MODEL = "doubao-seed-tts-2.0";
export const ARK_ASR_MODEL = "doubao-seed-asr-2.0";
export const ARK_TTS_RESOURCE_ID = "seed-tts-2.0";
export const ARK_ASR_RESOURCE_ID = "volc.seedasr.sauc.duration";
export const ARK_TTS_HTTP_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
export const ARK_TTS_REALTIME_URL = "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream";
export const ARK_TTS_BIDIRECTIONAL_URL = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";
export const ARK_ASR_REALTIME_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
export const ARK_ASR_ASYNC_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
export const DEFAULT_ARK_TTS_VOICE = "zh_female_vv_uranus_bigtts";
export const DEFAULT_ARK_TTS_FORMAT = "mp3";
export const DEFAULT_ARK_TTS_SAMPLE_RATE = 24_000;

const ASR_CONNECT_TIMEOUT_MS = 20_000;
const TTS_CONNECT_TIMEOUT_MS = 30_000;
const ASR_CHUNK_BYTES = 64 * 1024;

type ArkVoiceService = "asr" | "tts";

export interface ArkVoiceRuntime {
  model: string;
  apiKey: string;
  resourceId: string;
  ttsHttpUrl: string;
  ttsRealtimeUrl: string;
  ttsBidirectionalUrl: string;
  asrRealtimeUrl: string;
  asrAsyncUrl: string;
  ttsVoice: string;
  ttsFormat: string;
  ttsSampleRate: number;
}

export interface ArkTtsOptions {
  text: string;
  voice?: string;
  format?: string;
  sampleRate?: number;
}

export interface ArkTtsResult {
  audio: Buffer;
  contentType: string;
  raw: unknown[];
}

export interface ArkAsrResult {
  text: string;
  raw: unknown[];
}

export class ArkVoiceError extends Error {
  code?: string | number;
  status?: number;

  constructor(message: string, options: { code?: string | number; status?: number } = {}) {
    super(message);
    this.name = "ArkVoiceError";
    this.code = options.code;
    this.status = options.status;
  }
}

const enum ArkMessageType {
  FullClientRequest = 0b0001,
  AudioOnlyClient = 0b0010,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  Error = 0b1111,
}

const enum ArkMessageFlag {
  NoSeq = 0b0000,
  PositiveSeq = 0b0001,
  LastNoSeq = 0b0010,
  NegativeSeq = 0b0011,
  WithEvent = 0b0100,
}

const enum ArkSerialization {
  None = 0b0000,
  Json = 0b0001,
}

const enum ArkCompression {
  None = 0b0000,
  Gzip = 0b0001,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRawDataBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function arkAuthHeaders(runtime: ArkVoiceRuntime, service: ArkVoiceService): Record<string, string> {
  return {
    "X-Api-Key": runtime.apiKey,
    "X-Api-Resource-Id": resourceIdFor(runtime, service),
  };
}

export function isArkVoiceSetting(setting: LLMSetting | undefined): setting is LLMSetting {
  return Boolean(setting && (
    setting.protocol === OPEN_SPEECH_PROTOCOL ||
    setting.protocol === "volcengine_ark_voice" ||
    setting.protocol === LEGACY_DOUBAO_VOICE_PROTOCOL ||
    setting.voice_adapter === OPEN_SPEECH_PROTOCOL ||
    setting.voice_adapter === "volcengine_ark_voice" ||
    setting.voice_adapter === LEGACY_DOUBAO_VOICE_PROTOCOL ||
    setting.endpoint_id === OPEN_SPEECH_ENDPOINT_ID ||
    setting.endpoint_id === LEGACY_ARK_VOICE_ENDPOINT_ID ||
    setting.endpoint_id === LEGACY_DOUBAO_VOICE_ENDPOINT_ID ||
    setting.endpoint_id === LEGACY_ARK_AGENT_PLAN_VOICE_ENDPOINT_ID
  ));
}

export function arkVoiceModelIdsForSetting(setting: LLMSetting): string[] {
  const models = Array.isArray(setting.models) ? setting.models.filter(Boolean) : [];
  const ids = new Set(models.length ? models : [setting.model_name]);
  if (setting.supports_tts) ids.add(ARK_TTS_MODEL);
  if (setting.supports_asr) ids.add(ARK_ASR_MODEL);
  return [...ids];
}

export function arkVoiceRuntimeFromSetting(setting: LLMSetting, service: ArkVoiceService): ArkVoiceRuntime {
  return {
    model: service === "asr" ? ARK_ASR_MODEL : ARK_TTS_MODEL,
    apiKey: setting.api_key,
    resourceId: resourceIdForSetting(setting, service),
    ttsHttpUrl: setting.tts_http_url || ARK_TTS_HTTP_URL,
    ttsRealtimeUrl: setting.tts_realtime_url || ARK_TTS_REALTIME_URL,
    ttsBidirectionalUrl: setting.tts_bidirectional_url || ARK_TTS_BIDIRECTIONAL_URL,
    asrRealtimeUrl: setting.asr_realtime_url || ARK_ASR_REALTIME_URL,
    asrAsyncUrl: setting.asr_async_url || ARK_ASR_ASYNC_URL,
    ttsVoice: setting.tts_voice || DEFAULT_ARK_TTS_VOICE,
    ttsFormat: setting.tts_format || DEFAULT_ARK_TTS_FORMAT,
    ttsSampleRate: setting.tts_sample_rate || DEFAULT_ARK_TTS_SAMPLE_RATE,
  };
}

function resourceIdForSetting(setting: LLMSetting, service: ArkVoiceService): string {
  const modelName = setting.model_name.toLowerCase();
  if (service === "asr") {
    return modelName.includes("asr") && setting.resource_id ? setting.resource_id : ARK_ASR_RESOURCE_ID;
  }
  return modelName.includes("tts") && setting.resource_id ? setting.resource_id : ARK_TTS_RESOURCE_ID;
}

function resourceIdFor(runtime: ArkVoiceRuntime, service: ArkVoiceService): string {
  if (service === "asr") return runtime.resourceId === ARK_TTS_RESOURCE_ID ? ARK_ASR_RESOURCE_ID : runtime.resourceId;
  return runtime.resourceId === ARK_ASR_RESOURCE_ID ? ARK_TTS_RESOURCE_ID : runtime.resourceId;
}

function normalizeArkErrorMessage(message: string, status?: number, code?: string | number): string {
  return message || (status ? `HTTP ${status}` : code ? String(code) : "豆包语音 openspeech 请求失败");
}

function arkErrorDetailsFromPayload(payload: unknown): { code?: string | number; message?: string } {
  if (!isRecord(payload)) return {};
  const header = isRecord(payload.header) ? payload.header : undefined;
  const source = header ?? payload;
  const code = typeof source.code === "number" || typeof source.code === "string" ? source.code : undefined;
  let message = typeof source.message === "string" ? source.message : undefined;
  if (!message && typeof source.error === "string") message = source.error;
  if (!message && isRecord(source.error) && typeof source.error.message === "string") {
    message = source.error.message;
  }
  return { code, message };
}

function isSuccessArkCode(code: string | number | undefined): boolean {
  return code === undefined || code === 0 || code === "0" || code === 20000000 || code === "20000000";
}

function arkErrorFromTextBody(body: string, fallback: string, status?: number): ArkVoiceError {
  const trimmed = body.trim();
  if (!trimmed) return new ArkVoiceError(normalizeArkErrorMessage(fallback, status), { status });
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const detail = arkErrorDetailsFromPayload(parsed);
    return new ArkVoiceError(normalizeArkErrorMessage(detail.message || trimmed, status, detail.code), {
      status,
      code: detail.code,
    });
  } catch {
    return new ArkVoiceError(normalizeArkErrorMessage(trimmed || fallback, status), { status });
  }
}

function errorFromUnexpectedResponse(service: ArkVoiceService, response: IncomingMessage, body: string): ArkVoiceError {
  const status = response.statusCode;
  const fallback = `豆包语音 openspeech ${service.toUpperCase()} WebSocket 握手失败${status ? `：${status}` : ""}`;
  return arkErrorFromTextBody(body, fallback, status);
}

function handleUnexpectedResponse(
  service: ArkVoiceService,
  response: IncomingMessage,
  done: (err?: unknown) => void,
): void {
  let body = "";
  response.setEncoding("utf-8");
  response.on("data", (chunk) => {
    body += String(chunk);
    if (body.length > 4096) body = body.slice(0, 4096);
  });
  response.on("end", () => done(errorFromUnexpectedResponse(service, response, body)));
  response.on("error", (err) => done(err));
}

export function toArkVoiceError(err: unknown): Error {
  if (err instanceof ArkVoiceError) return err;
  if (err instanceof Error) return new ArkVoiceError(normalizeArkErrorMessage(err.message));
  return new ArkVoiceError(normalizeArkErrorMessage(String(err)));
}

function contentTypeForAudioFormat(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "mp3" || normalized === "mpeg") return "audio/mpeg";
  if (normalized === "wav" || normalized === "pcm16") return "audio/wav";
  if (normalized === "ogg" || normalized === "opus") return "audio/ogg";
  return "application/octet-stream";
}

export function parseArkTtsJsonLines(text: string, format = DEFAULT_ARK_TTS_FORMAT): ArkTtsResult {
  const chunks: Buffer[] = [];
  const raw: unknown[] = [];
  const errors: Array<{ code?: string | number; message: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:")) trimmed = trimmed.slice("data:".length).trim();
    if (!trimmed || trimmed === "[DONE]") continue;
    let item: unknown;
    try {
      item = JSON.parse(trimmed);
    } catch (err) {
      throw new ArkVoiceError(`豆包语音 openspeech TTS 返回了无法解析的 JSON 行：${err instanceof Error ? err.message : String(err)}`);
    }
    raw.push(item);
    if (!isRecord(item)) continue;
    const detail = arkErrorDetailsFromPayload(item);
    const code = detail.code;
    const message = detail.message ?? "";
    if (typeof item.data === "string" && item.data.trim()) {
      chunks.push(Buffer.from(item.data.trim(), "base64"));
    } else if (isRecord(item.data)) {
      const data = item.data;
      const encoded = typeof data.audio === "string"
        ? data.audio
        : typeof data.audio_data === "string"
          ? data.audio_data
          : "";
      if (encoded.trim()) chunks.push(Buffer.from(encoded.trim(), "base64"));
    }
    if (isSuccessArkCode(code)) {
      continue;
    }
    errors.push({ code, message });
  }
  if (errors.length) {
    const first = errors[0];
    throw new ArkVoiceError(normalizeArkErrorMessage(first.message, undefined, first.code), { code: first.code });
  }
  const audio = Buffer.concat(chunks);
  if (!audio.byteLength) {
    throw new ArkVoiceError("豆包语音 openspeech TTS 没有返回音频数据");
  }
  return { audio, contentType: contentTypeForAudioFormat(format), raw };
}

function looksLikeAudio(buffer: Buffer): boolean {
  if (buffer.byteLength < 4) return false;
  if (buffer.subarray(0, 3).toString("utf-8") === "ID3") return true;
  if (buffer.subarray(0, 4).toString("utf-8") === "RIFF") return true;
  if (buffer.subarray(0, 4).toString("utf-8") === "OggS") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

export async function synthesizeArkTtsHttp(runtime: ArkVoiceRuntime, options: ArkTtsOptions): Promise<ArkTtsResult> {
  const text = options.text.trim();
  if (!text) throw new ArkVoiceError("Missing required field: text");
  if (!runtime.apiKey) throw new ArkVoiceError("Missing TTS API key");
  const format = options.format || runtime.ttsFormat || DEFAULT_ARK_TTS_FORMAT;
  const sampleRate = options.sampleRate || runtime.ttsSampleRate || DEFAULT_ARK_TTS_SAMPLE_RATE;
  const upstream = await fetch(runtime.ttsHttpUrl || ARK_TTS_HTTP_URL, {
    method: "POST",
    headers: {
      ...arkAuthHeaders(runtime, "tts"),
      "X-Api-Request-Id": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      req_params: {
        text,
        speaker: options.voice || runtime.ttsVoice || DEFAULT_ARK_TTS_VOICE,
        audio_params: {
          format,
          sample_rate: sampleRate,
        },
      },
    }),
  });
  const body = Buffer.from(await upstream.arrayBuffer());
  const responseText = body.toString("utf-8");
  if (!upstream.ok) {
    throw arkErrorFromTextBody(responseText, `豆包语音 openspeech TTS HTTP 请求失败：${upstream.status}`, upstream.status);
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (/^audio\//i.test(contentType) || looksLikeAudio(body)) {
    return {
      audio: body,
      contentType: contentType || contentTypeForAudioFormat(format),
      raw: [],
    };
  }
  return parseArkTtsJsonLines(responseText, format);
}

export async function synthesizeArkTts(runtime: ArkVoiceRuntime, options: ArkTtsOptions): Promise<ArkTtsResult> {
  const text = options.text.trim();
  if (!text) throw new ArkVoiceError("Missing required field: text");
  if (!runtime.apiKey) throw new ArkVoiceError("Missing TTS API key");
  const format = options.format || runtime.ttsFormat || DEFAULT_ARK_TTS_FORMAT;
  const sampleRate = options.sampleRate || runtime.ttsSampleRate || DEFAULT_ARK_TTS_SAMPLE_RATE;
  return new Promise<ArkTtsResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const raw: unknown[] = [];
    let settled = false;
    let timer: NodeJS.Timeout;
    let ws: WebSocket;
    const requestId = randomUUID();
    const done = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // Ignore close failures after upstream errors.
      }
      if (err) {
        reject(toArkVoiceError(err));
        return;
      }
      const audio = Buffer.concat(chunks);
      if (!audio.byteLength) {
        reject(new ArkVoiceError("豆包语音 openspeech TTS 没有返回音频数据"));
        return;
      }
      resolve({ audio, contentType: contentTypeForAudioFormat(format), raw });
    };
    timer = setTimeout(() => done(new ArkVoiceError("豆包语音 openspeech TTS 请求超时")), TTS_CONNECT_TIMEOUT_MS);
    ws = new WebSocket(runtime.ttsRealtimeUrl || ARK_TTS_REALTIME_URL, {
      headers: {
        ...arkAuthHeaders(runtime, "tts"),
        "X-Api-Connect-Id": requestId,
        "X-Api-Request-Id": requestId,
        "X-Control-Require-Usage-Tokens-Return": "*",
      },
      maxPayload: 20 * 1024 * 1024,
    });
    ws.on("open", () => {
      try {
        ws.send(buildArkTtsRequest({
          req_params: {
            speaker: options.voice || runtime.ttsVoice || DEFAULT_ARK_TTS_VOICE,
            text,
            audio_params: {
              format,
              sample_rate: sampleRate,
            },
          },
        }));
      } catch (err) {
        done(err);
      }
    });
    ws.on("message", (data) => {
      try {
        const packet = parseArkVoicePacket(toRawDataBuffer(data));
        if (Buffer.isBuffer(packet.payload) && packet.payload.byteLength) {
          chunks.push(packet.payload);
        } else if (packet.payload !== undefined) {
          raw.push(packet.payload);
          if (isRecord(packet.payload)) {
            const code = packet.payload.code;
            const message = typeof packet.payload.message === "string"
              ? packet.payload.message
              : typeof packet.payload.error === "string"
                ? packet.payload.error
                : "";
            if (code !== undefined && code !== 0 && code !== "0" && code !== 20000000 && code !== "20000000") {
              throw new ArkVoiceError(normalizeArkErrorMessage(message, undefined, code as string | number), {
                code: code as string | number,
              });
            }
          }
        }
        if (packet.isLast || packet.event === 152) done();
      } catch (err) {
        done(err);
      }
    });
    ws.on("error", done);
    ws.on("unexpected-response", (_request, response) => {
      handleUnexpectedResponse("tts", response, done);
    });
    ws.on("close", () => {
      if (!settled) done(chunks.length ? undefined : new ArkVoiceError("豆包语音 openspeech TTS 连接已关闭"));
    });
  });
}

function arkHeader(
  messageType: ArkMessageType,
  flags: ArkMessageFlag,
  serialization: ArkSerialization,
  compression: ArkCompression,
): Buffer {
  return Buffer.from([
    (1 << 4) | 1,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0,
  ]);
}

function payloadEnvelope(sequence: number, payload: Buffer): Buffer {
  const meta = Buffer.alloc(8);
  meta.writeInt32BE(sequence, 0);
  meta.writeUInt32BE(payload.byteLength, 4);
  return Buffer.concat([meta, payload]);
}

function payloadOnlyEnvelope(payload: Buffer): Buffer {
  const meta = Buffer.alloc(4);
  meta.writeUInt32BE(payload.byteLength, 0);
  return Buffer.concat([meta, payload]);
}

function eventPayloadEnvelope(event: number, payload: Buffer): Buffer {
  const meta = Buffer.alloc(8);
  meta.writeInt32BE(event, 0);
  meta.writeUInt32BE(payload.byteLength, 4);
  return Buffer.concat([meta, payload]);
}

export function buildArkTtsRequest(payload: unknown): Buffer {
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    arkHeader(
      ArkMessageType.FullClientRequest,
      ArkMessageFlag.NoSeq,
      ArkSerialization.Json,
      ArkCompression.Gzip,
    ),
    payloadOnlyEnvelope(encoded),
  ]);
}

export function buildArkFullClientRequest(sequence: number, payload: unknown): Buffer {
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    arkHeader(
      ArkMessageType.FullClientRequest,
      ArkMessageFlag.PositiveSeq,
      ArkSerialization.Json,
      ArkCompression.Gzip,
    ),
    payloadEnvelope(sequence, encoded),
  ]);
}

export function buildArkAudioOnlyRequest(sequence: number, audio: Buffer, isLast: boolean): Buffer {
  const encoded = gzipSync(audio);
  return Buffer.concat([
    arkHeader(
      ArkMessageType.AudioOnlyClient,
      isLast ? ArkMessageFlag.NegativeSeq : ArkMessageFlag.PositiveSeq,
      ArkSerialization.None,
      ArkCompression.Gzip,
    ),
    payloadEnvelope(isLast ? -Math.abs(sequence) : sequence, encoded),
  ]);
}

export interface ArkParsedPacket {
  type: number;
  flags: number;
  sequence?: number;
  event?: number;
  isLast: boolean;
  payload?: unknown;
  errorCode?: number;
}

export function parseArkVoicePacket(data: Buffer): ArkParsedPacket {
  if (data.byteLength < 4) {
    throw new ArkVoiceError("豆包语音 openspeech 返回了过短的数据包");
  }
  const headerSize = (data[0] & 0x0f) * 4;
  const type = (data[1] >> 4) & 0x0f;
  const flags = data[1] & 0x0f;
  const serialization = (data[2] >> 4) & 0x0f;
  const compression = data[2] & 0x0f;
  let offset = headerSize;
  let sequence: number | undefined;
  let event: number | undefined;
  let errorCode: number | undefined;
  const seqFlag = flags & 0b0011;
  if (type === ArkMessageType.Error) {
    if (offset + 8 > data.byteLength) throw new ArkVoiceError("豆包语音 openspeech 错误包缺少 payload");
    errorCode = data.readInt32BE(offset);
    offset += 4;
  } else if ((flags & ArkMessageFlag.WithEvent) === ArkMessageFlag.WithEvent) {
    if (offset + 4 > data.byteLength) throw new ArkVoiceError("豆包语音 openspeech 数据包缺少 event");
    event = data.readInt32BE(offset);
    offset += 4;
    if (seqFlag === ArkMessageFlag.PositiveSeq || seqFlag === ArkMessageFlag.NegativeSeq) {
      if (offset + 4 > data.byteLength) throw new ArkVoiceError("豆包语音 openspeech 数据包缺少 sequence");
      sequence = data.readInt32BE(offset);
      offset += 4;
    }
  } else if (seqFlag === ArkMessageFlag.PositiveSeq || seqFlag === ArkMessageFlag.NegativeSeq) {
    if (offset + 4 > data.byteLength) throw new ArkVoiceError("豆包语音 openspeech 数据包缺少 sequence");
    sequence = data.readInt32BE(offset);
    offset += 4;
  }
  let payload: unknown;
  if (offset + 4 <= data.byteLength) {
    const payloadSize = data.readUInt32BE(offset);
    offset += 4;
    const payloadBuffer = data.subarray(offset, offset + payloadSize);
    const decoded = compression === ArkCompression.Gzip ? gunzipSync(payloadBuffer) : payloadBuffer;
    if (serialization === ArkSerialization.Json || type === ArkMessageType.Error) {
      const text = decoded.toString("utf-8");
      payload = text ? JSON.parse(text) : {};
    } else {
      payload = decoded;
    }
  }
  if (type === ArkMessageType.Error) {
    const message = isRecord(payload)
      ? String(payload.message ?? payload.error ?? JSON.stringify(payload))
      : String(payload ?? "");
    throw new ArkVoiceError(normalizeArkErrorMessage(message, undefined, errorCode), { code: errorCode });
  }
  return {
    type,
    flags,
    sequence,
    event,
    isLast: event === 152 || seqFlag === ArkMessageFlag.NegativeSeq || seqFlag === ArkMessageFlag.LastNoSeq || (sequence ?? 0) < 0,
    payload,
    errorCode,
  };
}

export function buildArkServerResponseForTest(payload: unknown, sequence = -1): Buffer {
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    arkHeader(
      ArkMessageType.FullServerResponse,
      sequence < 0 ? ArkMessageFlag.NegativeSeq : ArkMessageFlag.PositiveSeq,
      ArkSerialization.Json,
      ArkCompression.Gzip,
    ),
    payloadEnvelope(sequence, encoded),
  ]);
}

export function buildArkTtsAudioResponseForTest(audio: Buffer, event = 352): Buffer {
  return Buffer.concat([
    arkHeader(
      ArkMessageType.AudioOnlyServer,
      ArkMessageFlag.WithEvent,
      ArkSerialization.None,
      ArkCompression.None,
    ),
    eventPayloadEnvelope(event, audio),
  ]);
}

export function buildArkTtsEventResponseForTest(payload: unknown, event = 152): Buffer {
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    arkHeader(
      ArkMessageType.FullServerResponse,
      ArkMessageFlag.WithEvent,
      ArkSerialization.Json,
      ArkCompression.Gzip,
    ),
    eventPayloadEnvelope(event, encoded),
  ]);
}

function decodeAudioDataUrl(audioDataUrl: string): { buffer: Buffer; contentType: string } {
  const match = audioDataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new ArkVoiceError("Invalid audio_data_url");
  const contentType = match[1] || "audio/wav";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  return {
    contentType,
    buffer: isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf-8"),
  };
}

function parseWavPcm(buffer: Buffer): { pcm: Buffer; sampleRate: number; channels: number; bits: number } {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return { pcm: buffer, sampleRate: 16_000, channels: 1, bits: 16 };
  }
  let offset = 12;
  let sampleRate = 16_000;
  let channels = 1;
  let bits = 16;
  let pcm: Buffer | undefined;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + size, buffer.byteLength);
    if (chunkId === "fmt " && size >= 16) {
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bits = buffer.readUInt16LE(start + 14);
    } else if (chunkId === "data") {
      pcm = buffer.subarray(start, end);
      break;
    }
    offset = start + size + (size % 2);
  }
  return { pcm: pcm ?? buffer, sampleRate, channels, bits };
}

function buildArkAsrRequest(audio: { sampleRate: number; channels: number; bits: number }): Record<string, unknown> {
  return {
    user: { uid: "homerail" },
    audio: {
      format: "pcm",
      codec: "raw",
      rate: audio.sampleRate,
      bits: audio.bits,
      channel: audio.channels,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      show_utterances: true,
      enable_nonstream: false,
    },
  };
}

function collectTranscript(value: unknown, out: string[], keyHint = ""): void {
  if (typeof value === "string") {
    if (/(^|_)(text|transcript|sentence|utterance|payload_msg|result)(_|$)/i.test(keyHint) && value.trim()) {
      out.push(value.trim());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTranscript(item, out, keyHint);
    return;
  }
  if (!isRecord(value)) return;
  let hasDirectTranscript = false;
  for (const key of ["text", "transcript", "payload_msg"]) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) {
      out.push(direct.trim());
      hasDirectTranscript = true;
    }
  }
  if (hasDirectTranscript) return;
  for (const [key, child] of Object.entries(value)) {
    collectTranscript(child, out, key);
  }
}

export function extractArkTranscript(payloads: unknown[]): string {
  const texts: string[] = [];
  for (const payload of payloads) collectTranscript(payload, texts);
  return [...new Set(texts)].join("\n").trim();
}

export async function transcribeArkAsr(runtime: ArkVoiceRuntime, audioDataUrl: string): Promise<ArkAsrResult> {
  if (!audioDataUrl) throw new ArkVoiceError("Missing required field: audio_data_url");
  if (!runtime.apiKey) throw new ArkVoiceError("Missing ASR API key");
  const decoded = decodeAudioDataUrl(audioDataUrl);
  if (!decoded.contentType.includes("wav") && !decoded.contentType.includes("pcm")) {
    throw new ArkVoiceError("豆包语音 openspeech ASR 当前仅支持 WAV/PCM16 输入");
  }
  const wav = parseWavPcm(decoded.buffer);
  if (!wav.pcm.byteLength) throw new ArkVoiceError("No ASR audio received");

  return new Promise<ArkAsrResult>((resolve, reject) => {
    const raw: unknown[] = [];
    let settled = false;
    let sequence = 1;
    let timer: NodeJS.Timeout;
    let ws: WebSocket;
    const requestId = randomUUID();
    const done = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // Ignore close failures after upstream errors.
      }
      if (err) {
        reject(toArkVoiceError(err));
        return;
      }
      resolve({ text: extractArkTranscript(raw), raw });
    };
    timer = setTimeout(() => done(new ArkVoiceError("豆包语音 openspeech ASR 请求超时")), ASR_CONNECT_TIMEOUT_MS);
    ws = new WebSocket(runtime.asrRealtimeUrl, {
      headers: {
        ...arkAuthHeaders(runtime, "asr"),
        "X-Api-Request-Id": requestId,
        "X-Api-Connect-Id": requestId,
        "X-Api-Sequence": "-1",
      },
      maxPayload: 20 * 1024 * 1024,
    });
    ws.on("open", () => {
      try {
        ws.send(buildArkFullClientRequest(sequence++, buildArkAsrRequest(wav)));
        for (let offset = 0; offset < wav.pcm.byteLength; offset += ASR_CHUNK_BYTES) {
          const chunk = wav.pcm.subarray(offset, Math.min(offset + ASR_CHUNK_BYTES, wav.pcm.byteLength));
          const isLast = offset + ASR_CHUNK_BYTES >= wav.pcm.byteLength;
          ws.send(buildArkAudioOnlyRequest(sequence++, chunk, isLast));
        }
      } catch (err) {
        done(err);
      }
    });
    ws.on("message", (data) => {
      try {
        const packet = parseArkVoicePacket(toRawDataBuffer(data));
        if (packet.payload !== undefined) raw.push(packet.payload);
        if (packet.isLast) done();
      } catch (err) {
        done(err);
      }
    });
    ws.on("error", done);
    ws.on("unexpected-response", (_request, response) => {
      handleUnexpectedResponse("asr", response, done);
    });
    ws.on("close", () => {
      if (!settled) done(raw.length ? undefined : new ArkVoiceError("豆包语音 openspeech ASR 连接已关闭"));
    });
  });
}
