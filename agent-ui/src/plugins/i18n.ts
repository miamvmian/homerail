import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN/index'
import enUS from '@/locales/en-US/index'

export const i18n = createI18n({
  legacy: false, // 使用组合式API模式
  locale: 'zh-CN', // 默认语言
  fallbackLocale: 'en-US', // 回退语言
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
  globalInjection: true, // 全局注入 $t 函数
  missingWarn: false,
  fallbackWarn: false,
})
