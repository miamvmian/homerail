import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-console': 'warn',
      'no-debugger': 'warn'
    }
  },
  {
    ignores: ['node_modules', 'dist', '*.d.ts']
  }
)
