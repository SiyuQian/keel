import { expect, it } from 'vitest'
import {
  adapterFor,
  fakeClaude,
  identityFor,
  recordingJournalSink
} from './claude-structured-session-test-support'

it('appends each role to the Claude system preset without changing permission policy', async () => {
  const claude = fakeClaude()
  const adapter = adapterFor(claude, { options: { permissionMode: 'default' } })
  try {
    for (const [index, text] of ['Review security.', 'Implement the task.'].entries()) {
      await adapter.acquire({
        identity: { ...identityFor(`session-${index}`), providerHandle: null },
        fence: 1,
        spawnToken: `spawn-${index}`,
        events: recordingJournalSink(),
        agentPreset: {
          id: `role-${index}`,
          name: 'Role',
          provider: 'claude',
          systemInstructions: text
        }
      })
      expect(claude.connections[index]?.launch.options).toMatchObject({
        systemPrompt: { type: 'preset', preset: 'claude_code', append: text },
        permissionMode: 'default'
      })
      expect(claude.connections[index]?.sent).toEqual([])
    }
    expect(claude.connections[0]?.launch.options.systemPrompt).toMatchObject({
      append: 'Review security.'
    })
  } finally {
    await adapter.closeSession('session-0')
    await adapter.closeSession('session-1')
  }
})
