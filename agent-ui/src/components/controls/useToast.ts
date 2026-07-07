// useToast.ts
import { ref, provide, inject, InjectionKey, Ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastInterface {
  message: Ref<string>;
  show: Ref<boolean>;
  type: Ref<ToastType>;
  icon: Ref<string | null>;
  showToast: (msg: string, toastType?: ToastType, duration?: number) => void;
  closeToast: () => void;
}

export const ToastSymbol: InjectionKey<ToastInterface> = Symbol('Toast')

export function createToast(): ToastInterface {
  const message = ref('')
  const show = ref(false)
  const type = ref<ToastType>('info')
  const icon = ref<string | null>(null)
  const timer = ref<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string, toastType: ToastType = 'info', duration?: number) => {
    message.value = msg
    show.value = true
    type.value = toastType

    // 设置对应的图标
    switch (toastType) {
      case 'success':
        icon.value = 'CheckCircleIcon'
        break
      case 'error':
        icon.value = 'XCircleIcon'
        break
      case 'info':
        icon.value = 'InformationCircleIcon'
        break
      case 'warning':
        icon.value = 'ExclamationCircleIcon'
        break
    }

    // 根据类型设置默认显示时间
    let displayDuration = duration
    if (displayDuration === undefined) {
      switch (toastType) {
        case 'error':
          displayDuration = 5000 // 错误消息显示5秒
          break
        case 'warning':
          displayDuration = 4000 // 警告消息显示4秒
          break
        case 'success':
          displayDuration = 3000 // 成功消息显示3秒
          break
        case 'info':
        default:
          displayDuration = 3000 // 信息消息显示3秒
          break
      }
    }

    if (timer.value) clearTimeout(timer.value)
    timer.value = setTimeout(() => {
      show.value = false
    }, displayDuration)
  }

  const closeToast = () => {
    show.value = false
    if (timer.value) {
      clearTimeout(timer.value)
      timer.value = null
    }
  }

  return {
    message,
    show,
    type,
    icon,
    showToast,
    closeToast
  }
}

export function provideToast() {
  const toast = createToast()
  provide(ToastSymbol, toast)
  return toast
}

export function useToast(): ToastInterface {
  const injectedToast = inject(ToastSymbol)
  if (!injectedToast) {
    throw new Error('No toast provided!')
  }
  return injectedToast
}