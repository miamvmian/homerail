export const NATIVE_GAMEPAD_BUTTON_EVENT = 'homerail:native-gamepad-button'
export const NATIVE_GAMEPAD_ANALOG_EVENT = 'homerail:native-gamepad-analog'

export interface NativeGamepadButtonDetail {
  index: number
  pressed: boolean
  repeat?: boolean
  keyCode?: number
}

export interface NativeGamepadAnalogDetail {
  panX?: number
  panY?: number
  scrollY?: number
  zoomOut?: number
  zoomIn?: number
  hatX?: number
  hatY?: number
}

export function nativeGamepadEventDetail<T>(event: Event): T | null {
  const detail = (event as CustomEvent<T>).detail
  return detail && typeof detail === 'object' ? detail : null
}
