import { describe, expect, it } from 'vitest'
import {
  AgentPresetsSchema,
  getAgentPresets,
  normalizeAgentPresets,
  resolveWorkflowAgent
} from './agent-presets'

describe('Agent presets and workflow bindings', () => {
  it('keeps provider defaults unset and preserves an intentionally empty list', () => {
    const defaults = getAgentPresets(undefined)
    expect(defaults.map((preset) => preset.id)).toEqual(['planning', 'implementation', 'review'])
    expect(
      defaults.every((preset) => preset.model === undefined && preset.effort === undefined)
    ).toBe(true)
    expect(getAgentPresets([])).toEqual([])
  })
  it('validates bounded instructions independently of the 512 character option guard', () => {
    const role = {
      id: 'review',
      name: 'Review',
      provider: 'codex',
      systemInstructions: 'x'.repeat(2000)
    }
    expect(AgentPresetsSchema.safeParse([role]).success).toBe(true)
    expect(
      AgentPresetsSchema.safeParse([{ ...role, systemInstructions: 'x'.repeat(17000) }]).success
    ).toBe(false)
    expect(AgentPresetsSchema.safeParse([role, role]).success).toBe(false)
    expect(AgentPresetsSchema.safeParse([{ ...role, effort: 'high' }]).success).toBe(false)
    expect(AgentPresetsSchema.safeParse([{ ...role, provider: 'opencode' }]).success).toBe(false)
  })
  it('preserves valid stored roles without replacing corrupt or deleted ones', () => {
    expect(normalizeAgentPresets([{ id: 'bad' }])).toEqual([])
    expect(normalizeAgentPresets(undefined)).toBeUndefined()
  })
  it('resolves a step override before the default and refuses a deleted reference', () => {
    const presets = getAgentPresets(undefined)
    const binding = {
      defaultAgentId: 'planning',
      stepAgentIds: { implement: 'implementation', review: 'deleted' }
    }
    expect(resolveWorkflowAgent(presets, binding, 'implement')?.id).toBe('implementation')
    expect(resolveWorkflowAgent(presets, binding, 'plan')?.id).toBe('planning')
    expect(() => resolveWorkflowAgent(presets, binding, 'review')).toThrow('deleted')
    expect(resolveWorkflowAgent(presets, undefined, 'plan')).toBeUndefined()
  })
  it('rejects unsupported effort without choosing a model', () => {
    expect(
      AgentPresetsSchema.safeParse([
        {
          id: 'r',
          name: 'R',
          provider: 'codex',
          systemInstructions: '',
          model: 'gpt-5.6-sol',
          effort: 'impossible'
        }
      ]).success
    ).toBe(false)
  })
})
