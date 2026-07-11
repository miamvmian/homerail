import type {
  GenerativeUiDevice,
  GenerativeUiStoredNodeV1,
  GenerativeUiSurface,
} from 'homerail-protocol'
import type { Component } from 'vue'

export type GenerativeUiRendererMode = 'specialized' | 'core_projection'

export interface GenerativeUiRendererRegistrationV1 {
  renderer_api_version: 1
  kind: string
  kind_version: number
  surface: GenerativeUiSurface
  device: GenerativeUiDevice
  mode: GenerativeUiRendererMode
  component: Component
}

export type GenerativeUiRendererResolutionV1 =
  | { mode: 'specialized' | 'core_projection'; component: Component; registration: GenerativeUiRendererRegistrationV1 }
  | { mode: 'fallback'; reason: 'renderer_not_registered' }
  | { mode: 'unavailable'; reason: 'portable_fallback_invalid' }

const KINDS = /^[a-z0-9]+(?:[.-][a-z0-9]+)+\/[a-z][a-z0-9._-]*$/
const SURFACES = new Set<GenerativeUiSurface>(['task', 'execution', 'result', 'ambient'])
const DEVICES = new Set<GenerativeUiDevice>(['phone', 'desktop', 'tv'])

function key(
  kind: string,
  kindVersion: number,
  surface: GenerativeUiSurface,
  device: GenerativeUiDevice,
): string {
  return `${kind}\u0000${kindVersion}\u0000${surface}\u0000${device}`
}

function portableFallbackValid(node: GenerativeUiStoredNodeV1): boolean {
  const fallback = node.fallback
  if (!fallback || typeof fallback !== 'object') return false
  if (typeof fallback.title !== 'string' || !fallback.title.trim() || fallback.title.length > 200) return false
  if (fallback.summary !== undefined && (typeof fallback.summary !== 'string' || fallback.summary.length > 4000)) {
    return false
  }
  if (fallback.items !== undefined && (
    !Array.isArray(fallback.items)
    || fallback.items.length > 16
    || fallback.items.some(item => typeof item !== 'string' || item.length > 500)
  )) return false
  if (fallback.artifact_refs !== undefined && (
    !Array.isArray(fallback.artifact_refs)
    || fallback.artifact_refs.length > 16
    || fallback.artifact_refs.some(reference => (
      !reference
      || typeof reference !== 'object'
      || typeof reference.label !== 'string'
      || !reference.label
      || typeof reference.uri !== 'string'
      || !reference.uri
    ))
  )) return false
  return true
}

/** Immutable exact-match Renderer Registry. Runtime mutation is deliberately absent. */
export class GenerativeUiRendererRegistry {
  readonly #specialized = new Map<string, GenerativeUiRendererRegistrationV1>()
  readonly #coreProjections = new Map<string, GenerativeUiRendererRegistrationV1>()
  readonly #registrations: readonly GenerativeUiRendererRegistrationV1[]

  constructor(registrations: readonly GenerativeUiRendererRegistrationV1[]) {
    const stable: GenerativeUiRendererRegistrationV1[] = []
    for (const registration of registrations) {
      if (registration.renderer_api_version !== 1) throw new Error('Unsupported renderer_api_version')
      if (!KINDS.test(registration.kind)) throw new Error(`Invalid renderer kind: ${registration.kind}`)
      if (!Number.isSafeInteger(registration.kind_version) || registration.kind_version < 1) {
        throw new Error(`Invalid renderer kind_version: ${registration.kind}`)
      }
      if (!SURFACES.has(registration.surface)) throw new Error(`Invalid renderer surface: ${registration.surface}`)
      if (!DEVICES.has(registration.device)) throw new Error(`Invalid renderer device: ${registration.device}`)
      if (registration.mode !== 'specialized' && registration.mode !== 'core_projection') {
        throw new Error(`Invalid renderer mode: ${String(registration.mode)}`)
      }
      if (!registration.component) throw new Error(`Renderer component is required: ${registration.kind}`)
      const registrationKey = key(
        registration.kind,
        registration.kind_version,
        registration.surface,
        registration.device,
      )
      const target = registration.mode === 'specialized' ? this.#specialized : this.#coreProjections
      if (target.has(registrationKey)) {
        throw new Error(
          `Duplicate ${registration.mode} renderer: ${registration.kind}@${registration.kind_version}/${registration.surface}/${registration.device}`,
        )
      }
      const frozen = Object.freeze({ ...registration })
      target.set(registrationKey, frozen)
      stable.push(frozen)
    }
    this.#registrations = Object.freeze(stable)
    Object.freeze(this)
  }

  get registrations(): readonly GenerativeUiRendererRegistrationV1[] {
    return this.#registrations
  }

  resolve(
    node: GenerativeUiStoredNodeV1,
    surface: GenerativeUiSurface,
    device: GenerativeUiDevice,
  ): GenerativeUiRendererResolutionV1 {
    const registrationKey = key(node.kind, node.kind_version, surface, device)
    const specialized = this.#specialized.get(registrationKey)
    if (specialized) return { mode: 'specialized', component: specialized.component, registration: specialized }
    const coreProjection = this.#coreProjections.get(registrationKey)
    if (coreProjection) {
      return { mode: 'core_projection', component: coreProjection.component, registration: coreProjection }
    }
    return portableFallbackValid(node)
      ? { mode: 'fallback', reason: 'renderer_not_registered' }
      : { mode: 'unavailable', reason: 'portable_fallback_invalid' }
  }
}
