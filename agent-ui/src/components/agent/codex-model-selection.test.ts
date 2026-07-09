import { describe, expect, it } from 'vitest'

import type { CodexModel } from '@/api/agent'
import {
  resolveCodexModelOptions,
  resolveSelectedCodexModel
} from './codex-model-selection'

function model(id: string, isDefault = false): CodexModel {
  return {
    id,
    model: id,
    display_name: id,
    description: '',
    is_default: isDefault,
    default_reasoning_effort: 'medium',
    supported_reasoning_efforts: ['medium'],
    service_tiers: []
  }
}

describe('Codex model selection', () => {
  it('shows only account models after the app-server catalog loads', () => {
    const options = resolveCodexModelOptions([model('gpt-5.5', true)], 'gpt-5.6-sol', true)

    expect(options.map(option => option.model)).toEqual(['gpt-5.5'])
    expect(resolveSelectedCodexModel(options, 'gpt-5.6-sol')).toBe('gpt-5.5')
  })

  it('keeps the saved model as a temporary fallback when catalog loading fails', () => {
    const options = resolveCodexModelOptions([], 'gpt-5.6-sol', false)

    expect(options.map(option => option.model)).toEqual(['gpt-5.6-sol'])
    expect(resolveSelectedCodexModel(options, 'gpt-5.6-sol')).toBe('gpt-5.6-sol')
  })
})
