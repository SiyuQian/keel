import { agentPresetWorkerMode } from './worker-agent-preset'
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { RuntimeClientSettingsController } from '../../../../runtime-client-settings'
import { createGlobalSettingsFixture } from '../../../../../../shared/global-settings-test-fixture'
import {
  prepareLocalWorkerStart,
  prepareFederationAttachmentWorkerStart
} from './worker-start-validation'
import { assertWorkerLaunchPreferencesRuntimeSupported } from './worker-launch-preferences'
import { AGENT_PRESETS_CAPABILITY, type AgentPreset } from '../../../../../../shared/agent-presets'

function host(presets: AgentPreset[]) {
  const runtime = new OrcaRuntimeService()
  const settings = createGlobalSettingsFixture({ agentPresets: presets })
  vi.spyOn(runtime, 'getClientSettings').mockImplementation(() =>
    new RuntimeClientSettingsController({ getSettings: () => settings }).get()
  )
  vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
  return { runtime, settings }
}
const role: AgentPreset = {
  id: 'review',
  name: 'Review',
  provider: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'high',
  systemInstructions: 'Review correctness.'
}
describe('host-owned worker Agent selection', () => {
  it('uses host definitions and snapshots the selected role before concurrent edits', () => {
    const first = host([{ ...role }])
    const second = host([
      { ...role, provider: 'claude', model: 'opus', systemInstructions: 'Other host role.' }
    ])
    const launch = prepareLocalWorkerStart({
      runtime: first.runtime,
      createsWorktree: false,
      params: { spec: 'task', from: 'coordinator', agentPreset: 'review' }
    })
    const remote = prepareFederationAttachmentWorkerStart({
      runtime: second.runtime,
      createsWorktree: false,
      params: {
        protocolVersion: 3,
        dispatchId: 'dispatch1',
        taskId: 'task1',
        taskSpec: 'task',
        worktree: 'wt',
        agentPreset: 'review'
      }
    })
    first.settings.agentPresets![0].systemInstructions = 'Changed later.'
    expect(launch.agent).toBe('codex')
    expect(launch.launch.preferences).toMatchObject({
      model: 'gpt-5.6-sol',
      effort: 'high',
      agentPreset: { systemInstructions: 'Review correctness.' }
    })
    expect(remote.agent).toBe('claude')
    expect(remote.launch.preferences?.agentPreset?.systemInstructions).toBe('Other host role.')
  })
  it.each([{ terminal: 'existing' }, { agent: 'claude' }, { model: 'opus' }, { effort: 'high' }])(
    'rejects a preset conflicting with %j before placement',
    (conflict) => {
      const selected = host([role])
      expect(() =>
        prepareLocalWorkerStart({
          runtime: selected.runtime,
          createsWorktree: false,
          params: { spec: 'task', from: 'coordinator', agentPreset: 'review', ...conflict }
        })
      ).toThrow()
    }
  )
  it('refuses a missing role rather than using provider defaults', () => {
    expect(() =>
      prepareLocalWorkerStart({
        runtime: host([]).runtime,
        createsWorktree: false,
        params: { spec: 'task', from: 'coordinator', agentPreset: 'deleted' }
      })
    ).toThrow('missing on the execution host')
  })
  it('refuses an old remote host before it can discard a role selector', () => {
    expect(() =>
      assertWorkerLaunchPreferencesRuntimeSupported({
        agentPreset: 'review',
        serverName: 'old',
        capabilities: []
      })
    ).toThrow('does not support Agent presets')
    expect(() =>
      assertWorkerLaunchPreferencesRuntimeSupported({
        agentPreset: 'review',
        serverName: 'new',
        capabilities: [AGENT_PRESETS_CAPABILITY]
      })
    ).not.toThrow()
  })
  it('selects the host surface using the resolved provider', () => {
    const selected = host([role])
    expect(agentPresetWorkerMode(selected.runtime, role).mode).toBe('terminal')
    Object.assign(selected.settings, {
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: true
    })
    expect(agentPresetWorkerMode(selected.runtime, role).mode).toBe('structured')
  })
  it('preserves the legacy raw-agent receipt shape', () => {
    const launch = prepareLocalWorkerStart({
      runtime: host([]).runtime,
      createsWorktree: false,
      params: { spec: 'task', from: 'coordinator', agent: 'codex' }
    })
    expect(launch.launch).toEqual({
      preferences: undefined,
      receipt: {
        requested: { agent: 'codex', model: null, effort: null },
        effective: { agent: 'codex', model: null, effort: null }
      }
    })
  })
})
