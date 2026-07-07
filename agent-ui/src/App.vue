<!-- src/App.vue -->
<template>
  <NConfigProvider
    :theme="uiStore.isDarkMode ? darkTheme : null"
    :locale="uiStore.naiveLocale"
    :date-locale="uiStore.naiveDateLocale"
  >
    <div id="app" class="h-screen w-full bg-background font-sans text-foreground overflow-hidden">
      <router-view />
      <Toast />
    </div>
  </NConfigProvider>
</template>

<script lang="ts" setup>
import { watch, onMounted, onUnmounted } from 'vue'
import { NConfigProvider, darkTheme } from 'naive-ui'
import { useUiStore } from '@/stores/ui-store'
import { useI18n } from 'vue-i18n'
import Toast from '@/components/controls/Toast.vue'
import { provideToast } from '@/components/controls/useToast'

// ============================================================================
// GLOBAL TOAST NOTIFICATION
// ============================================================================
const toast = provideToast()

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return String(err || '未知错误')
}

function notifyGlobalError(message: string): void {
  toast.showToast(message, 'error', 7000)
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  notifyGlobalError(messageOf(event.reason))
}

function handleWindowError(event: ErrorEvent): void {
  notifyGlobalError(messageOf(event.error || event.message))
}

// ============================================================================
// UI STORE & i18n (needed by all routes)
// ============================================================================
const uiStore = useUiStore()
const { locale: i18nLocale } = useI18n()

onMounted(async () => {
  // 初始化 UI store first, which loads locale from localStorage
  uiStore.initialize()

  // Then sync i18n with whatever locale was loaded
  i18nLocale.value = uiStore.locale

  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  window.addEventListener('error', handleWindowError)
})

onUnmounted(() => {
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  window.removeEventListener('error', handleWindowError)
})

// 同步 ui-store locale 变化到 i18n
watch(
  () => uiStore.locale,
  (newLocale) => {
    i18nLocale.value = newLocale
  }
)
</script>
