import type {
  GenerativeUiCompositionItemV1,
  GenerativeUiStoredNodeV1,
  GenerativeUiSurfaceContextV1,
} from 'homerail-protocol'

export const CUSTOM_RENDERER_BRIDGE_VERSION = 1 as const
export const CUSTOM_RENDERER_VIEW_VERSION = 1 as const
export const CUSTOM_RENDERER_VIEW_MAX_DEPTH = 8
export const CUSTOM_RENDERER_VIEW_MAX_NODES = 128
export const CUSTOM_RENDERER_VIEW_MAX_TEXT_BYTES = 16 * 1024
export const CUSTOM_RENDERER_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "img-src 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  'worker-src blob:',
  "manifest-src 'none'",
  "form-action 'none'",
] as const

export interface CustomRendererIdentityV1 {
  plugin_id: string
  plugin_version: string
  renderer_id: string
  renderer_digest: string
  node_id: string
  node_revision: number
}

export interface CustomRendererInitPayloadV1 {
  node: GenerativeUiStoredNodeV1
  placement: GenerativeUiCompositionItemV1
  context: GenerativeUiSurfaceContextV1
}

export type CustomRendererViewNodeV1 =
  | {
      type: 'box'
      direction?: 'row' | 'column'
      gap?: 'none' | 'sm' | 'md' | 'lg'
      align?: 'start' | 'center' | 'stretch'
      children: CustomRendererViewNodeV1[]
    }
  | {
      type: 'text'
      text: string
      variant?: 'body' | 'title' | 'muted'
    }
  | {
      type: 'button'
      label: string
      action_id: string
      variant?: 'primary' | 'secondary' | 'danger'
    }

export interface CustomRendererViewV1 {
  view_version: 1
  root: CustomRendererViewNodeV1
}

interface CustomRendererViewBudget {
  nodes: number
  text_bytes: number
  action_ids: ReadonlySet<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => allowed.has(key))
}

function boundedText(value: unknown, maxBytes: number, budget: CustomRendererViewBudget): string {
  if (typeof value !== 'string' || !value.length || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error('Custom Renderer view text is invalid')
  }
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes > maxBytes) throw new Error('Custom Renderer view text exceeds its field limit')
  budget.text_bytes += bytes
  if (budget.text_bytes > CUSTOM_RENDERER_VIEW_MAX_TEXT_BYTES) {
    throw new Error('Custom Renderer view exceeds its total text limit')
  }
  return value
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Custom Renderer view ${label} is invalid`)
  }
  return value as T
}

function normalizeViewNode(
  raw: unknown,
  budget: CustomRendererViewBudget,
  depth: number,
): CustomRendererViewNodeV1 {
  if (depth > CUSTOM_RENDERER_VIEW_MAX_DEPTH) throw new Error('Custom Renderer view is too deep')
  if (!isRecord(raw) || typeof raw.type !== 'string') throw new Error('Custom Renderer view node is invalid')
  budget.nodes += 1
  if (budget.nodes > CUSTOM_RENDERER_VIEW_MAX_NODES) throw new Error('Custom Renderer view has too many nodes')

  if (raw.type === 'text') {
    if (!hasOnlyKeys(raw, ['type', 'text'], ['variant'])) throw new Error('Custom Renderer text node fields are invalid')
    return {
      type: 'text',
      text: boundedText(raw.text, 2_000, budget),
      ...(raw.variant === undefined
        ? {}
        : { variant: enumValue(raw.variant, ['body', 'title', 'muted'] as const, 'text variant') }),
    }
  }
  if (raw.type === 'button') {
    if (!hasOnlyKeys(raw, ['type', 'label', 'action_id'], ['variant'])) {
      throw new Error('Custom Renderer button node fields are invalid')
    }
    const actionId = boundedText(raw.action_id, 160, budget)
    if (!budget.action_ids.has(actionId)) throw new Error('Custom Renderer button Action is not allowed')
    return {
      type: 'button',
      label: boundedText(raw.label, 120, budget),
      action_id: actionId,
      ...(raw.variant === undefined
        ? {}
        : { variant: enumValue(raw.variant, ['primary', 'secondary', 'danger'] as const, 'button variant') }),
    }
  }
  if (raw.type === 'box') {
    if (!hasOnlyKeys(raw, ['type', 'children'], ['direction', 'gap', 'align'])
      || !Array.isArray(raw.children)
      || raw.children.length < 1
      || raw.children.length > 32) {
      throw new Error('Custom Renderer box node fields are invalid')
    }
    return {
      type: 'box',
      ...(raw.direction === undefined
        ? {}
        : { direction: enumValue(raw.direction, ['row', 'column'] as const, 'box direction') }),
      ...(raw.gap === undefined
        ? {}
        : { gap: enumValue(raw.gap, ['none', 'sm', 'md', 'lg'] as const, 'box gap') }),
      ...(raw.align === undefined
        ? {}
        : { align: enumValue(raw.align, ['start', 'center', 'stretch'] as const, 'box alignment') }),
      children: raw.children.map(child => normalizeViewNode(child, budget, depth + 1)),
    }
  }
  throw new Error('Custom Renderer view node type is invalid')
}

/** Exact, bounded and expression-free view data accepted from an untrusted Worker. */
export function normalizeCustomRendererView(
  raw: unknown,
  actionIds: ReadonlySet<string>,
): CustomRendererViewV1 {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ['view_version', 'root']) || raw.view_version !== 1) {
    throw new Error('Custom Renderer view envelope is invalid')
  }
  const budget: CustomRendererViewBudget = { nodes: 0, text_bytes: 0, action_ids: actionIds }
  return { view_version: 1, root: normalizeViewNode(raw.root, budget, 1) }
}

export type CustomRendererBridgeMessageV1 =
  | ({ type: 'homerail.custom-renderer.ready' } & CustomRendererIdentityV1)
  | ({ type: 'homerail.custom-renderer.resize'; height: number } & CustomRendererIdentityV1)
  | ({ type: 'homerail.custom-renderer.action'; action_id: string } & CustomRendererIdentityV1)
  | ({ type: 'homerail.custom-renderer.error'; message: string } & CustomRendererIdentityV1)

export interface CustomRendererMessageExpectationV1 {
  source: MessageEventSource | null
  origin: string
  identity: CustomRendererIdentityV1
  nonce: string
  action_ids: ReadonlySet<string>
}

const COMMON_MESSAGE_KEYS = [
  'bridge_version',
  'type',
  'nonce',
  'plugin_id',
  'plugin_version',
  'renderer_id',
  'renderer_digest',
  'node_id',
  'node_revision',
]

function exactKeys(value: Record<string, unknown>, extra: string[] = []): boolean {
  const expected = [...COMMON_MESSAGE_KEYS, ...extra].sort()
  return Object.keys(value).sort().join('\0') === expected.join('\0')
}

function hasExactIdentity(
  value: Record<string, unknown>,
  identity: CustomRendererIdentityV1,
): boolean {
  return value.plugin_id === identity.plugin_id
    && value.plugin_version === identity.plugin_version
    && value.renderer_id === identity.renderer_id
    && value.renderer_digest === identity.renderer_digest
    && value.node_id === identity.node_id
    && value.node_revision === identity.node_revision
}

/** Reject-by-default parent-side parser for the trusted iframe Bridge. */
export function readCustomRendererBridgeMessage(
  event: Pick<MessageEvent, 'source' | 'origin' | 'data'>,
  expected: CustomRendererMessageExpectationV1,
): CustomRendererBridgeMessageV1 | undefined {
  if (event.source !== expected.source || event.origin !== expected.origin) return undefined
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return undefined
  const value = event.data as Record<string, unknown>
  if (
    value.bridge_version !== CUSTOM_RENDERER_BRIDGE_VERSION
    || value.nonce !== expected.nonce
    || !hasExactIdentity(value, expected.identity)
  ) return undefined
  const identity = structuredClone(expected.identity)
  if (value.type === 'homerail.custom-renderer.ready' && exactKeys(value)) {
    return { type: value.type, ...identity }
  }
  if (
    value.type === 'homerail.custom-renderer.resize'
    && exactKeys(value, ['height'])
    && Number.isSafeInteger(value.height)
    && Number(value.height) >= 48
    && Number(value.height) <= 2000
  ) return { type: value.type, ...identity, height: Number(value.height) }
  if (
    value.type === 'homerail.custom-renderer.action'
    && exactKeys(value, ['action_id'])
    && typeof value.action_id === 'string'
    && expected.action_ids.has(value.action_id)
  ) return { type: value.type, ...identity, action_id: value.action_id }
  if (
    value.type === 'homerail.custom-renderer.error'
    && exactKeys(value, ['message'])
    && typeof value.message === 'string'
    && value.message.length > 0
    && value.message.length <= 500
  ) return { type: value.type, ...identity, message: value.message }
  return undefined
}

export function createCustomRendererNonce(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure Renderer nonce generation is unavailable')
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Utf8(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Renderer source digest verification is unavailable')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Custom Renderer modules are deliberately single-file. Forbidding every
 * import token closes the language-level network loader that cannot be
 * reliably monkey-patched inside a Worker. A single named render export keeps
 * the executable surface auditable and prevents re-export loaders.
 */
export function validateCustomRendererModuleSource(source: string): void {
  const bytes = new TextEncoder().encode(source).byteLength
  if (!source.trim() || bytes > 512 * 1024 || /[\u0000\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
    throw new Error('Custom Renderer module source is invalid')
  }
  if (/\bimport\b/.test(source)) throw new Error('Custom Renderer module imports are forbidden')
  const exports = source.match(/\bexport\b/g) ?? []
  if (exports.length !== 1 || !/\bexport\s+(?:async\s+)?function\s+render\s*\(\s*payload\s*\)\s*\{/.test(source)) {
    throw new Error('Custom Renderer must have exactly one named render export')
  }
}

export function customRendererInitEnvelope(
  identity: CustomRendererIdentityV1,
  nonce: string,
  payload: CustomRendererInitPayloadV1,
  actionIds: readonly string[],
): Record<string, unknown> {
  return {
    bridge_version: CUSTOM_RENDERER_BRIDGE_VERSION,
    type: 'homerail.custom-renderer.init',
    nonce,
    ...structuredClone(identity),
    action_ids: [...new Set(actionIds)].sort(),
    payload: structuredClone(payload),
  }
}

export const CUSTOM_RENDERER_WORKER_BOOTSTRAP = String.raw`
(() => {
  'use strict';
  const safePostMessage = globalThis.postMessage.bind(globalThis);
  const safeAddEventListener = globalThis.addEventListener.bind(globalThis);
  const safeStructuredClone = globalThis.structuredClone.bind(globalThis);
  const safeObjectKeys = Object.keys.bind(Object);
  const safeHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
  const safeIsArray = Array.isArray.bind(Array);
  const safeEncode = new TextEncoder().encode.bind(new TextEncoder());
  const SafeSet = Set;
  const safeSetHas = Function.call.bind(Set.prototype.has);
  const exact = (value, required, optional = []) => {
    if (!value || typeof value !== 'object' || safeIsArray(value)) return false;
    const keys = safeObjectKeys(value);
    const allowed = new SafeSet(required.concat(optional));
    return required.every(key => safeHasOwn(value, key)) && keys.every(key => safeSetHas(allowed, key));
  };
  const exactIdentity = value => exact(value, [
    'plugin_id','plugin_version','renderer_id','renderer_digest','node_id','node_revision',
  ]) && typeof value.plugin_id === 'string' && typeof value.plugin_version === 'string'
    && typeof value.renderer_id === 'string' && /^[a-f0-9]{64}$/.test(value.renderer_digest)
    && typeof value.node_id === 'string' && Number.isSafeInteger(value.node_revision);
  const sameIdentity = (left, right) => left.plugin_id === right.plugin_id
    && left.plugin_version === right.plugin_version && left.renderer_id === right.renderer_id
    && left.renderer_digest === right.renderer_digest && left.node_id === right.node_id
    && left.node_revision === right.node_revision;
  const lock = name => {
    try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch {}
  };
  for (const name of [
    'fetch','XMLHttpRequest','WebSocket','WebSocketStream','EventSource','RTCPeerConnection',
    'WebTransport','Worker','SharedWorker','importScripts','BroadcastChannel','postMessage',
    'caches','indexedDB',
  ]) lock(name);
  try { Object.defineProperty(navigator, 'sendBeacon', { value: undefined, writable: false, configurable: false }); } catch {}

  const normalizeView = (raw, actionIds) => {
    if (!exact(raw, ['view_version','root']) || raw.view_version !== 1) throw new Error('view envelope is invalid');
    const budget = { nodes: 0, text: 0 };
    const actions = new SafeSet(actionIds);
    const text = (value, max) => {
      if (typeof value !== 'string' || !value.length || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        throw new Error('view text is invalid');
      }
      const bytes = safeEncode(value).byteLength;
      if (bytes > max) throw new Error('view text field is too large');
      budget.text += bytes;
      if (budget.text > 16384) throw new Error('view text budget exceeded');
      return value;
    };
    const choice = (value, values, label) => {
      if (typeof value !== 'string' || values.indexOf(value) < 0) throw new Error(label + ' is invalid');
      return value;
    };
    const node = (value, depth) => {
      if (depth > 8 || !value || typeof value !== 'object' || safeIsArray(value)) throw new Error('view depth is invalid');
      budget.nodes += 1;
      if (budget.nodes > 128) throw new Error('view node budget exceeded');
      if (value.type === 'text') {
        if (!exact(value, ['type','text'], ['variant'])) throw new Error('text fields are invalid');
        return { type: 'text', text: text(value.text, 2000), ...(value.variant === undefined ? {} : {
          variant: choice(value.variant, ['body','title','muted'], 'text variant'),
        }) };
      }
      if (value.type === 'button') {
        if (!exact(value, ['type','label','action_id'], ['variant'])) throw new Error('button fields are invalid');
        const actionId = text(value.action_id, 160);
        if (!safeSetHas(actions, actionId)) throw new Error('button Action is not allowed');
        return { type: 'button', label: text(value.label, 120), action_id: actionId,
          ...(value.variant === undefined ? {} : {
            variant: choice(value.variant, ['primary','secondary','danger'], 'button variant'),
          }) };
      }
      if (value.type === 'box') {
        if (!exact(value, ['type','children'], ['direction','gap','align']) || !safeIsArray(value.children)
          || value.children.length < 1 || value.children.length > 32) throw new Error('box fields are invalid');
        return { type: 'box',
          ...(value.direction === undefined ? {} : { direction: choice(value.direction, ['row','column'], 'box direction') }),
          ...(value.gap === undefined ? {} : { gap: choice(value.gap, ['none','sm','md','lg'], 'box gap') }),
          ...(value.align === undefined ? {} : { align: choice(value.align, ['start','center','stretch'], 'box alignment') }),
          children: value.children.map(child => node(child, depth + 1)),
        };
      }
      throw new Error('view node type is invalid');
    };
    return { view_version: 1, root: node(raw.root, 1) };
  };

  let configured = false;
  let identity;
  let nonce;
  let renderFunction;
  const send = (type, extra = {}) => safePostMessage({
    worker_protocol: 1, type, nonce, identity: safeStructuredClone(identity), ...extra,
  });
  const fail = (requestId, cause) => {
    const message = String(cause && cause.message ? cause.message : cause || 'Renderer Worker failed').slice(0, 500);
    send('homerail.custom-renderer.worker.error', {
      ...(requestId ? { request_id: requestId } : {}), message,
    });
  };
  safeAddEventListener('message', async event => {
    const value = event.data;
    if (!configured) {
      if (!exact(value, ['worker_protocol','type','nonce','identity','source'])
        || value.worker_protocol !== 1 || value.type !== 'homerail.custom-renderer.worker.configure'
        || typeof value.nonce !== 'string' || !/^[a-f0-9]{48}$/.test(value.nonce)
        || !exactIdentity(value.identity) || typeof value.source !== 'string'
        || value.source.length < 1 || safeEncode(value.source).byteLength > 512 * 1024
        || /\bimport\b/.test(value.source)
        || (value.source.match(/\bexport\b/g) || []).length !== 1
        || !/\bexport\s+(?:async\s+)?function\s+render\s*\(\s*payload\s*\)\s*\{/.test(value.source)) return;
      configured = true;
      identity = safeStructuredClone(value.identity);
      nonce = value.nonce;
      const moduleUrl = URL.createObjectURL(new Blob([value.source], { type: 'text/javascript' }));
      try {
        const module = await import(moduleUrl);
        if (typeof module.render !== 'function') throw new Error('Custom Renderer must export render(payload)');
        renderFunction = module.render;
        send('homerail.custom-renderer.worker.ready');
      } catch (cause) {
        fail(undefined, cause);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
      return;
    }
    if (!exact(value, ['worker_protocol','type','nonce','identity','request_id','payload','action_ids'])
      || value.worker_protocol !== 1 || value.type !== 'homerail.custom-renderer.worker.render'
      || value.nonce !== nonce || !exactIdentity(value.identity) || !sameIdentity(value.identity, identity)
      || typeof value.request_id !== 'string' || !/^render-[1-9][0-9]*$/.test(value.request_id)
      || !value.payload || typeof value.payload !== 'object' || safeIsArray(value.payload)
      || !safeIsArray(value.action_ids) || value.action_ids.some(item => typeof item !== 'string')) return;
    try {
      const rawView = await renderFunction(safeStructuredClone(value.payload));
      const view = normalizeView(rawView, value.action_ids);
      send('homerail.custom-renderer.worker.view', { request_id: value.request_id, view });
    } catch (cause) {
      fail(value.request_id, cause);
    }
  });
})();
`

/**
 * Builds a self-contained trusted bootstrap document. Chromium requires the
 * sandboxed srcdoc to retain its host origin in order to start a Blob Worker;
 * plugin bytes still execute only in that dedicated Worker, while the iframe
 * owns the fixed DOM renderer and Action bridge.
 */
export function buildCustomRendererSrcdoc(input: {
  source: string
  nonce: string
  identity: CustomRendererIdentityV1
  parent_origin: string
}): string {
  if (!/^https?:\/\/[^/]+$/.test(input.parent_origin)) {
    throw new Error('Custom Renderer parent origin must be an HTTP(S) origin')
  }
  validateCustomRendererModuleSource(input.source)
  const csp = [
    ...CUSTOM_RENDERER_CSP,
    `script-src 'nonce-${input.nonce}' blob:`,
    `style-src 'nonce-${input.nonce}'`,
  ].join('; ')
  const source = inlineJson(input.source)
  const workerBootstrap = inlineJson(CUSTOM_RENDERER_WORKER_BOOTSTRAP)
  const identity = inlineJson(input.identity)
  const nonce = inlineJson(input.nonce)
  const parentOrigin = inlineJson(input.parent_origin)
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${input.nonce}">
html,body,#homerail-custom-root{box-sizing:border-box;margin:0;min-height:48px}body{overflow:hidden}
.hr-box{display:flex}.hr-box--row{flex-direction:row}.hr-box--column{flex-direction:column}
.hr-gap--none{gap:0}.hr-gap--sm{gap:4px}.hr-gap--md{gap:8px}.hr-gap--lg{gap:12px}
.hr-align--start{align-items:flex-start}.hr-align--center{align-items:center}.hr-align--stretch{align-items:stretch}
.hr-text{white-space:pre-wrap;overflow-wrap:anywhere}.hr-text--title{font-size:1.05rem;font-weight:600}
.hr-text--muted{opacity:.72}.hr-button{appearance:none;border:1px solid currentColor;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.hr-button--primary{background:#2563eb;color:#fff}.hr-button--secondary{background:transparent}.hr-button--danger{background:#b91c1c;color:#fff}
</style>
</head><body><main id="homerail-custom-root"></main>
<script nonce="${input.nonce}">
(() => {
  'use strict';
  const identity = ${identity};
  const nonce = ${nonce};
  const parentOrigin = ${parentOrigin};
  const pluginSource = ${source};
  const workerBootstrap = ${workerBootstrap};
  const root = document.getElementById('homerail-custom-root');
  let initialized = false;
  let workerReady = false;
  let failed = false;
  let pendingPayload;
  let actionIds = [];
  let requestSequence = 0;
  let activeRequest;
  let requestTimer;
  const commonKeys = ['bridge_version','type','nonce','plugin_id','plugin_version','renderer_id','renderer_digest','node_id','node_revision','action_ids','payload'].sort();
  const workerIdentityKeys = ['plugin_id','plugin_version','renderer_id','renderer_digest','node_id','node_revision'].sort();
  const exactWorkerIdentity = value => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\\0') === workerIdentityKeys.join('\\0')
    && value.plugin_id === identity.plugin_id && value.plugin_version === identity.plugin_version
    && value.renderer_id === identity.renderer_id && value.renderer_digest === identity.renderer_digest
    && value.node_id === identity.node_id && value.node_revision === identity.node_revision;
  const canonicalStrings = value => Array.isArray(value) && value.every((item, index) => typeof item === 'string'
    && item.length > 0 && (index === 0 || value[index - 1] < item));
  const exactInit = value => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\\0') === commonKeys.join('\\0')
    && value.bridge_version === 1 && value.type === 'homerail.custom-renderer.init'
    && value.nonce === nonce
    && value.plugin_id === identity.plugin_id && value.plugin_version === identity.plugin_version
    && value.renderer_id === identity.renderer_id && value.renderer_digest === identity.renderer_digest
    && value.node_id === identity.node_id && value.node_revision === identity.node_revision
    && canonicalStrings(value.action_ids)
    && value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)
    && Object.keys(value.payload).sort().join('\\0') === ['context','node','placement'].join('\\0');
  const send = (type, extra = {}) => parent.postMessage({
    bridge_version: 1, type, nonce, ...identity, ...extra,
  }, parentOrigin);
  const workerUrl = URL.createObjectURL(new Blob([workerBootstrap], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl, { type: 'module', name: 'homerail-custom-renderer' });
  const fail = cause => {
    if (failed) return;
    failed = true;
    clearTimeout(requestTimer);
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    send('homerail.custom-renderer.error', {
      message: String(cause && cause.message ? cause.message : cause || 'Renderer failed').slice(0, 500),
    });
  };
  const normalizeView = raw => {
    const exact = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value)
      && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
      && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
    if (!exact(raw, ['view_version','root']) || raw.view_version !== 1) throw new Error('Custom Renderer view envelope is invalid');
    const allowedActions = new Set(actionIds);
    const budget = { nodes: 0, text: 0 };
    const text = (value, max) => {
      if (typeof value !== 'string' || !value.length || /[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/.test(value)) {
        throw new Error('Custom Renderer view text is invalid');
      }
      const bytes = new TextEncoder().encode(value).byteLength;
      if (bytes > max) throw new Error('Custom Renderer view text field is too large');
      budget.text += bytes;
      if (budget.text > 16384) throw new Error('Custom Renderer view text budget exceeded');
      return value;
    };
    const choice = (value, values, label) => {
      if (typeof value !== 'string' || !values.includes(value)) throw new Error(label + ' is invalid');
      return value;
    };
    const node = (value, depth) => {
      if (depth > 8 || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Custom Renderer view depth is invalid');
      budget.nodes += 1;
      if (budget.nodes > 128) throw new Error('Custom Renderer view node budget exceeded');
      if (value.type === 'text') {
        if (!exact(value, ['type','text'], ['variant'])) throw new Error('Custom Renderer text fields are invalid');
        return { type: 'text', text: text(value.text, 2000), ...(value.variant === undefined ? {} : {
          variant: choice(value.variant, ['body','title','muted'], 'text variant'),
        }) };
      }
      if (value.type === 'button') {
        if (!exact(value, ['type','label','action_id'], ['variant'])) throw new Error('Custom Renderer button fields are invalid');
        const actionId = text(value.action_id, 160);
        if (!allowedActions.has(actionId)) throw new Error('Custom Renderer button Action is not allowed');
        return { type: 'button', label: text(value.label, 120), action_id: actionId,
          ...(value.variant === undefined ? {} : {
            variant: choice(value.variant, ['primary','secondary','danger'], 'button variant'),
          }) };
      }
      if (value.type === 'box') {
        if (!exact(value, ['type','children'], ['direction','gap','align']) || !Array.isArray(value.children)
          || value.children.length < 1 || value.children.length > 32) throw new Error('Custom Renderer box fields are invalid');
        return { type: 'box',
          ...(value.direction === undefined ? {} : { direction: choice(value.direction, ['row','column'], 'box direction') }),
          ...(value.gap === undefined ? {} : { gap: choice(value.gap, ['none','sm','md','lg'], 'box gap') }),
          ...(value.align === undefined ? {} : { align: choice(value.align, ['start','center','stretch'], 'box alignment') }),
          children: value.children.map(child => node(child, depth + 1)),
        };
      }
      throw new Error('Custom Renderer view node type is invalid');
    };
    return { view_version: 1, root: node(raw.root, 1) };
  };
  const elementFor = node => {
    if (node.type === 'text') {
      const element = document.createElement(node.variant === 'title' ? 'strong' : 'span');
      element.classList.add('hr-text', 'hr-text--' + (node.variant || 'body'));
      element.textContent = node.text;
      return element;
    }
    if (node.type === 'button') {
      const element = document.createElement('button');
      element.type = 'button';
      element.classList.add('hr-button', 'hr-button--' + (node.variant || 'secondary'));
      element.textContent = node.label;
      element.addEventListener('click', event => {
        if (!event.isTrusted || navigator.userActivation?.isActive === false || !actionIds.includes(node.action_id)) return;
        send('homerail.custom-renderer.action', { action_id: node.action_id });
      });
      return element;
    }
    const element = document.createElement('div');
    element.classList.add('hr-box', 'hr-box--' + (node.direction || 'column'),
      'hr-gap--' + (node.gap || 'none'), 'hr-align--' + (node.align || 'stretch'));
    element.append(...node.children.map(elementFor));
    return element;
  };
  const dispatchRender = payload => {
    if (!workerReady) { pendingPayload = payload; return; }
    requestSequence += 1;
    activeRequest = 'render-' + requestSequence;
    clearTimeout(requestTimer);
    requestTimer = setTimeout(() => fail(new Error('Custom Renderer Worker timed out')), 2000);
    worker.postMessage({
      worker_protocol: 1,
      type: 'homerail.custom-renderer.worker.render',
      nonce,
      identity,
      request_id: activeRequest,
      payload: structuredClone(payload),
      action_ids: actionIds.slice(),
    });
  };
  addEventListener('message', event => {
    if (event.source !== parent || event.origin !== parentOrigin || !exactInit(event.data)) return;
    if (initialized) return;
    initialized = true;
    actionIds = event.data.action_ids.slice();
    dispatchRender(event.data.payload);
  });
  worker.addEventListener('message', event => {
    const value = event.data;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.worker_protocol !== 1 || value.nonce !== nonce
      || !exactWorkerIdentity(value.identity)) return;
    if (value.type === 'homerail.custom-renderer.worker.ready'
      && Object.keys(value).sort().join('\\0') === ['identity','nonce','type','worker_protocol'].join('\\0')) {
      workerReady = true;
      clearTimeout(bootstrapTimer);
      URL.revokeObjectURL(workerUrl);
      send('homerail.custom-renderer.ready');
      if (pendingPayload) {
      const payload = pendingPayload;
      pendingPayload = undefined;
        dispatchRender(payload);
      }
      return;
    }
    if (value.type === 'homerail.custom-renderer.worker.view'
      && Object.keys(value).sort().join('\\0') === ['identity','nonce','request_id','type','view','worker_protocol'].join('\\0')
      && value.request_id === activeRequest) {
      try {
        const view = normalizeView(value.view);
        clearTimeout(requestTimer);
        root.replaceChildren(elementFor(view.root));
      } catch (cause) { fail(cause); }
      return;
    }
    if (value.type === 'homerail.custom-renderer.worker.error'
      && (Object.keys(value).sort().join('\\0') === ['identity','message','nonce','type','worker_protocol'].join('\\0')
        || Object.keys(value).sort().join('\\0') === ['identity','message','nonce','request_id','type','worker_protocol'].join('\\0'))
      && (value.request_id === undefined || value.request_id === activeRequest)
      && typeof value.message === 'string' && value.message.length > 0 && value.message.length <= 500) {
      fail(new Error(value.message));
    }
  });
  worker.addEventListener('error', event => fail(event.error || event.message));
  worker.postMessage({
    worker_protocol: 1,
    type: 'homerail.custom-renderer.worker.configure',
    nonce,
    identity,
    source: pluginSource,
  });
  const bootstrapTimer = setTimeout(() => fail(new Error('Custom Renderer Worker failed to initialize')), 2000);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const height = Math.max(48, Math.min(2000, Math.ceil(document.documentElement.scrollHeight)));
      send('homerail.custom-renderer.resize', { height });
    }).observe(document.documentElement);
  }
})();
</script></body></html>`
}
