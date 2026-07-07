import { describe, expect, it } from 'vitest'
import {
  NATIVE_GAMEPAD_ANALOG_EVENT,
  NATIVE_GAMEPAD_BUTTON_EVENT,
  nativeGamepadEventDetail,
  type NativeGamepadAnalogDetail,
  type NativeGamepadButtonDetail,
} from './native-gamepad-events'

describe('native gamepad events', () => {
  it('extracts native button event details', () => {
    const event = new CustomEvent<NativeGamepadButtonDetail>(NATIVE_GAMEPAD_BUTTON_EVENT, {
      detail: { index: 1, pressed: true, repeat: false },
    })

    expect(nativeGamepadEventDetail<NativeGamepadButtonDetail>(event)).toEqual({
      index: 1,
      pressed: true,
      repeat: false,
    })
  })

  it('extracts native analog event details', () => {
    const event = new CustomEvent<NativeGamepadAnalogDetail>(NATIVE_GAMEPAD_ANALOG_EVENT, {
      detail: { scrollY: 0.5, panX: -0.25 },
    })

    expect(nativeGamepadEventDetail<NativeGamepadAnalogDetail>(event)).toEqual({
      scrollY: 0.5,
      panX: -0.25,
    })
  })
})
