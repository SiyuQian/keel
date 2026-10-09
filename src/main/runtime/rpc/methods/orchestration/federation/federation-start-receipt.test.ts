import { expect, it } from 'vitest'
import { assertRemoteAgentPresetConfirmed } from './federation-start-receipt'

it.each([undefined, 'different'])('refuses a ready peer receipt with preset %s', (id) => {
  const role = {
    id: id ?? 'ignored',
    name: 'Role',
    provider: 'codex' as const,
    systemInstructions: ''
  }
  const receipt = {
    dispatchId: 'd',
    state: 'ready',
    ...(id
      ? {
          launch: {
            requested: { agent: 'codex' as const, model: null, effort: null },
            effective: { agent: 'codex' as const, model: null, effort: null, agentPreset: role }
          }
        }
      : {})
  }
  expect(() => assertRemoteAgentPresetConfirmed('review', receipt)).toThrow('did not confirm')
  try {
    assertRemoteAgentPresetConfirmed('review', receipt)
  } catch (error) {
    expect(error).toMatchObject({ code: 'operation_unknown' })
  }
})
it('accepts a matching receipt and preserves legacy or non-ready replies', () => {
  const role = {
    id: 'review',
    name: 'Role',
    provider: 'codex' as const,
    systemInstructions: 'Review.'
  }
  expect(() =>
    assertRemoteAgentPresetConfirmed('review', {
      dispatchId: 'd',
      state: 'ready',
      launch: {
        requested: { agent: 'codex', model: null, effort: null },
        effective: { agent: 'codex', model: null, effort: null, agentPreset: role }
      }
    })
  ).not.toThrow()
  expect(() =>
    assertRemoteAgentPresetConfirmed(undefined, { dispatchId: 'd', state: 'ready' })
  ).not.toThrow()
  expect(() =>
    assertRemoteAgentPresetConfirmed('review', { dispatchId: 'd', state: 'failed' })
  ).not.toThrow()
})
