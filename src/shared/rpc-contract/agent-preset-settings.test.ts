import { expect, it } from 'vitest'
import { SettingsUpdate } from './client-settings-params'

it('accepts role definitions and workflow bindings through the host settings mutation', () => {
  const saved = {
    agentPresets: [
      { id: 'review', name: 'Review', provider: 'codex', systemInstructions: 'Review correctness.' }
    ],
    workflowAgentBindings: { workflow: { defaultAgentId: 'review' } }
  }
  expect(SettingsUpdate.safeParse(saved).success).toBe(true)
})
