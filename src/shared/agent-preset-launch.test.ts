import { buildAgentStartupPlan } from './tui-agent-startup'
import { resolveAgentLaunchCommand } from './tui-agent-launch-command'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'
import { assertAgentPresetTerminalLine } from './agent-preset-instructions'
import { expect, it } from 'vitest'
import { encodeAgentSessionRecord } from './agent-session-record-stored-form'
import { isPersistedAgentSessionRecord } from './agent-session-record'
import { agentSessionRecordFixture } from './agent-session-record.test-fixture'

const preset = {
  id: 'review',
  name: 'Review',
  provider: 'codex' as const,
  systemInstructions: "Role's instructions: $(nothing)\nReview.",
  model: 'gpt-5.6-sol',
  effort: 'high'
}
it('accepts a bounded role snapshot on a stored session and rejects malformed snapshots', () => {
  const record = encodeAgentSessionRecord({
    ...agentSessionRecordFixture(),
    providerHandleChain: [],
    lease: {
      ...agentSessionRecordFixture().lease,
      claimStatus: 'released',
      provenHandleLinkId: null,
      ownerProcess: null,
      reservedSpawnToken: null
    }
  })
  expect(
    isPersistedAgentSessionRecord({
      ...record,
      agentPreset: {
        ...preset,
        provider: 'claude',
        model: 'retired-model',
        effort: 'retired-effort'
      }
    })
  ).toBe(true)
  expect(
    isPersistedAgentSessionRecord({
      ...record,
      agentPreset: { ...preset, provider: 'claude', systemInstructions: 'x'.repeat(2000) }
    })
  ).toBe(true)
  expect(
    isPersistedAgentSessionRecord({
      ...record,
      agentPreset: { ...preset, provider: 'claude', systemInstructions: 'x'.repeat(17000) }
    })
  ).toBe(false)
})

it('uses real provider instruction arguments on configured terminal surfaces', async () => {
  const codex = buildAgentStartupPlan({
    agent: 'codex',
    prompt: '',
    cmdOverrides: {},
    platform: 'darwin',
    allowEmptyPromptLaunch: true,
    agentPreset: preset,
    sessionOptions: { model: preset.model, effort: preset.effort }
  })
  expect(codex?.launchCommand).toContain('developer_instructions=')
  expect(codex?.launchCommand).toContain(preset.model)
  const claude = buildAgentStartupPlan({
    agent: 'claude',
    prompt: '',
    cmdOverrides: {},
    platform: 'win32',
    shell: 'powershell',
    allowEmptyPromptLaunch: true,
    agentPreset: { ...preset, provider: 'claude', systemInstructions: 'Review only.' }
  })
  expect(claude?.launchCommand).toContain('--append-system-prompt')
})

it('quotes role instructions as a single argument and preserves per-launch model and effort', async () => {
  for (const shell of ['posix', 'powershell'] as const) {
    const result = resolveAgentLaunchCommand({
      agent: 'codex',
      cmdOverrides: {},
      platform: shell === 'posix' ? 'darwin' : 'win32',
      shell,
      agentPreset: preset,
      sessionOptions: { model: preset.model, effort: preset.effort }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error)
    }
    const parsed = tokenizeStartupCommand(result.command, shell)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    expect(parsed.tokens).toContain(
      `developer_instructions=${JSON.stringify(preset.systemInstructions)}`
    )
    expect(parsed.tokens).toContain(preset.model)
    expect(parsed.tokens).toContain('model_reasoning_effort=high')
  }
})

it('refuses session reuse and competing instructions while retaining unrelated permissions', async () => {
  for (const agentArgs of [
    'resume abc',
    '--resume=abc',
    '-c developer_instructions="other"',
    '-c=base_instructions="other"',
    '--config=experimental_instructions_file="file"'
  ]) {
    expect(
      resolveAgentLaunchCommand({
        agent: 'codex',
        cmdOverrides: {},
        platform: 'darwin',
        shell: 'posix',
        agentPreset: preset,
        agentArgs
      }).ok
    ).toBe(false)
  }
  expect(
    resolveAgentLaunchCommand({
      agent: 'codex',
      cmdOverrides: {},
      platform: 'darwin',
      shell: 'posix',
      agentPreset: preset,
      agentArgs: '-c approval_policy="never"'
    }).ok
  ).toBe(true)
})

it('refuses unsafe Windows typed lines without restricting staged POSIX launches', async () => {
  expect(() => assertAgentPresetTerminalLine('win32', 'x'.repeat(512))).not.toThrow()
  expect(() => assertAgentPresetTerminalLine('win32', 'x'.repeat(513))).toThrow(
    'cannot safely carry'
  )
  expect(() => assertAgentPresetTerminalLine('win32', 'claude\nReview')).toThrow(
    'cannot safely carry'
  )
  expect(() => assertAgentPresetTerminalLine('linux', 'x'.repeat(16384))).not.toThrow()
})

it.each(['claude', 'codex'] as const)(
  'refuses %s preset instructions on cmd with supported surface guidance',
  (agent) => {
    expect(
      resolveAgentLaunchCommand({
        agent,
        cmdOverrides: {},
        platform: 'win32',
        shell: 'cmd',
        agentPreset: { ...preset, provider: agent, systemInstructions: 'Hi & % ( ) "there"' }
      })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/PowerShell.*native/) })
  }
)
