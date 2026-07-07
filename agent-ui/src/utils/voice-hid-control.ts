export interface VoiceHidButtonBinding {
  enabled: boolean
  productName: string
  vendorId: number
  productId: number
  reportId: number
  byteIndex: number
  pressedValue: number
  action: 'toggle_listening'
  updatedAt: string
}

export interface VoiceKeyboardButtonBinding {
  enabled: boolean
  code: string
  key: string
  location: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  action: 'toggle_listening'
  updatedAt: string
}

const STORAGE_KEY = 'omni.voice.hidButtonBinding.v1'
const KEYBOARD_STORAGE_KEY = 'omni.voice.keyboardButtonBinding.v1'
const INPUT_MODE_STORAGE_KEY = 'omni.voice.inputSubmitMode.v1'
const VAD_SILENCE_MS_STORAGE_KEY = 'omni.voice.vadSilenceMs.v1'
const DEFAULT_VAD_SILENCE_MS = 2000
const MIN_VAD_SILENCE_MS = 500
const MAX_VAD_SILENCE_MS = 6000

export type VoiceInputSubmitMode = 'vad_auto' | 'keyword'

export function getHidApi(): any | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as any).hid ?? null
}

export function voiceHidSupported(): boolean {
  return Boolean(getHidApi())
}

export function loadVoiceHidButtonBinding(): VoiceHidButtonBinding | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as VoiceHidButtonBinding
    if (!parsed.enabled || typeof parsed.vendorId !== 'number' || typeof parsed.productId !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function saveVoiceHidButtonBinding(binding: VoiceHidButtonBinding): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(binding))
}

export function clearVoiceHidButtonBinding(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function loadVoiceKeyboardButtonBinding(): VoiceKeyboardButtonBinding | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(KEYBOARD_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as VoiceKeyboardButtonBinding
    if (!parsed.enabled || (!parsed.code && !parsed.key)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveVoiceKeyboardButtonBinding(binding: VoiceKeyboardButtonBinding): void {
  localStorage.setItem(KEYBOARD_STORAGE_KEY, JSON.stringify(binding))
}

export function clearVoiceKeyboardButtonBinding(): void {
  localStorage.removeItem(KEYBOARD_STORAGE_KEY)
}

export function formatVoiceHidBinding(binding: VoiceHidButtonBinding | null): string {
  if (!binding) return '未绑定'
  return `${binding.productName || 'HID device'} · ${binding.vendorId}:${binding.productId} · report ${binding.reportId} byte[${binding.byteIndex}]=${binding.pressedValue}`
}

export function formatVoiceKeyboardBinding(binding: VoiceKeyboardButtonBinding | null): string {
  if (!binding) return '未绑定'
  const modifiers = [
    binding.ctrlKey ? 'Ctrl' : '',
    binding.altKey ? 'Alt' : '',
    binding.shiftKey ? 'Shift' : '',
    binding.metaKey ? 'Meta' : '',
  ].filter(Boolean)
  const key = binding.code || binding.key
  return [...modifiers, key].join('+')
}

export function keyboardEventMatchesBinding(binding: VoiceKeyboardButtonBinding, event: KeyboardEvent): boolean {
  const sameKey = binding.code ? event.code === binding.code : event.key === binding.key
  return sameKey
    && event.location === binding.location
    && event.altKey === binding.altKey
    && event.ctrlKey === binding.ctrlKey
    && event.metaKey === binding.metaKey
    && event.shiftKey === binding.shiftKey
}

export function keyboardBindingFromEvent(event: KeyboardEvent): VoiceKeyboardButtonBinding {
  return {
    enabled: true,
    code: event.code,
    key: event.key,
    location: event.location,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    action: 'toggle_listening',
    updatedAt: new Date().toISOString(),
  }
}

export function findPressedByte(bytes: number[]): { index: number; value: number } | null {
  const index = bytes.findIndex(value => value !== 0)
  if (index < 0) return null
  return { index, value: bytes[index] }
}

export function hidReportMatchesBinding(binding: VoiceHidButtonBinding, event: any): boolean {
  if (event.reportId !== binding.reportId) return false
  const bytes = Array.from(new Uint8Array(event.data.buffer)) as number[]
  return bytes[binding.byteIndex] === binding.pressedValue
}

export function hidDeviceMatchesBinding(binding: VoiceHidButtonBinding, device: any): boolean {
  return device.vendorId === binding.vendorId && device.productId === binding.productId
}

export function loadVoiceInputSubmitMode(): VoiceInputSubmitMode {
  if (typeof localStorage === 'undefined') return 'keyword'
  const value = localStorage.getItem(INPUT_MODE_STORAGE_KEY)
  return value === 'vad_auto' ? 'vad_auto' : 'keyword'
}

export function saveVoiceInputSubmitMode(mode: VoiceInputSubmitMode): void {
  localStorage.setItem(INPUT_MODE_STORAGE_KEY, mode)
}

export function labelVoiceInputSubmitMode(mode: VoiceInputSubmitMode): string {
  return mode === 'vad_auto' ? 'VAD 结束自动发送' : '关键词发送'
}

export function normalizeVoiceVadSilenceMs(value: unknown): number {
  if (value === null || value === undefined || value === '') return DEFAULT_VAD_SILENCE_MS
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_VAD_SILENCE_MS
  const rounded = Math.round(numeric)
  return Math.min(MAX_VAD_SILENCE_MS, Math.max(MIN_VAD_SILENCE_MS, rounded))
}

export function loadVoiceVadSilenceMs(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VAD_SILENCE_MS
  return normalizeVoiceVadSilenceMs(localStorage.getItem(VAD_SILENCE_MS_STORAGE_KEY))
}

export function saveVoiceVadSilenceMs(value: unknown): number {
  const normalized = normalizeVoiceVadSilenceMs(value)
  localStorage.setItem(VAD_SILENCE_MS_STORAGE_KEY, String(normalized))
  return normalized
}
