import {
  agentPresetWorkerMode,
  assertAgentPresetExecutionRuntime,
  prepareAgentPresetWorkerMode,
  prepareFederatedAgentPreset
} from './worker-agent-preset'
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
import { OrchestrationDb } from '../../../../orchestration/db'
import { startLocalWorker } from './local-worker-start'

function host(presets: AgentPreset[]) {
  const settings = createGlobalSettingsFixture({ agentPresets: presets })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these preflight tests read only the host settings.
  const runtime = new OrcaRuntimeService({ getSettings: () => settings } as never)
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
  it('refuses configured session reuse before creating a task, dispatch, worktree or terminal', async () => {
    const selected = host([role])
    selected.settings.agentDefaultArgs = { codex: 'resume old-session' }
    const db = new OrchestrationDb(':memory:')
    const run = db.createRun({
      objective: 'Refusal proof',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'tab:leaf'
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: preflight reads only parent worktree and repository identity.
    vi.spyOn(selected.runtime, 'showManagedWorktree').mockResolvedValue({
      id: 'repo::parent',
      repoId: 'repo'
    } as never)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: preflight reads only repository kind and execution ownership.
    vi.spyOn(selected.runtime, 'showRepo').mockResolvedValue({
      id: 'repo',
      kind: 'git',
      executionHostId: 'local'
    } as never)
    vi.spyOn(selected.runtime, 'resolveProjectRuntimeForRepo').mockReturnValue(undefined)
    const create = vi
      .spyOn(selected.runtime, 'createManagedWorktree')
      .mockRejectedValue(new Error('Unexpected creation'))
    const terminal = vi
      .spyOn(selected.runtime, 'createTerminal')
      .mockRejectedValue(new Error('Unexpected terminal'))
    try {
      await expect(
        startLocalWorker({
          runtime: selected.runtime,
          db,
          run,
          coordinator: null,
          params: {
            from: 'term_coord',
            spec: 'Task',
            worktree: 'new-child',
            name: 'worker',
            agentPreset: 'review'
          },
          mode: agentPresetWorkerMode(selected.runtime, role),
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only workspaceId is read before the launch refusal.
          callerSession: { workspaceId: 'repo::parent' } as never
        })
      ).rejects.toThrow('fresh session')
      expect(db.listTasks({ runId: run.id })).toEqual([])
      expect(create).not.toHaveBeenCalled()
      expect(terminal).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })
  it.each([
    { connectionId: 'ssh-1' },
    { executionHostId: 'ssh:host' },
    { executionHostId: 'runtime:peer' },
    { runtime: 'wsl' },
    { runtime: 'repair' }
  ])('refuses a proxied repo %j', async (target) => {
    const selected = host([role])
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only execution ownership fields are read by this guard.
    vi.spyOn(selected.runtime, 'showRepo').mockResolvedValue(target as never)
    vi.spyOn(selected.runtime, 'resolveProjectRuntimeForRepo').mockReturnValue(
      target.runtime === 'repair'
        ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the guard reads only the repair status.
          ({ status: 'repair-required' } as never)
        : target.runtime === 'wsl'
          ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the guard reads only status and runtime kind.
            ({ status: 'resolved', runtime: { kind: 'wsl' } } as never)
          : undefined
    )
    await expect(
      assertAgentPresetExecutionRuntime(selected.runtime, { repo: 'repo' }, 'codex', false)
    ).rejects.toMatchObject({ code: 'capability_unsupported' })
  })
  it.each(['remote', 'wsl'] as const)('refuses %s workspaces on either surface', async (reason) => {
    const selected = host([role])
    vi.spyOn(selected.runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: false,
      reason
    })
    for (const native of [true, false]) {
      await expect(
        assertAgentPresetExecutionRuntime(selected.runtime, { worktree: 'wt' }, 'codex', native)
      ).rejects.toMatchObject({ code: 'capability_unsupported' })
    }
  })
  it('allows the owning native runtime and supported terminal fallback', async () => {
    const selected = host([role])
    vi.spyOn(selected.runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    await expect(
      assertAgentPresetExecutionRuntime(selected.runtime, { worktree: 'wt' }, 'codex')
    ).resolves.toMatchObject({ supported: true })
    vi.mocked(selected.runtime.getStructuredAgentSessionCreateSupport).mockResolvedValue({
      supported: false,
      reason: 'agent'
    })
    await expect(
      assertAgentPresetExecutionRuntime(selected.runtime, { worktree: 'wt' }, 'codex', false)
    ).resolves.toMatchObject({ supported: false })
  })
  it('checks terminal instructions before selecting either local or federated placement', async () => {
    const selected = host([role])
    selected.settings.agentDefaultArgs = { codex: 'resume old-session' }
    vi.spyOn(selected.runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    await expect(
      prepareAgentPresetWorkerMode({
        runtime: selected.runtime,
        preset: role,
        fallback: agentPresetWorkerMode(selected.runtime, role),
        target: { worktree: 'wt' }
      })
    ).rejects.toThrow('fresh session')
    await expect(
      prepareFederatedAgentPreset(selected.runtime, role, { worktree: 'wt' })
    ).rejects.toThrow('fresh session')
  })
  it('allows native-to-terminal fallback on the owning runtime', async () => {
    const selected = host([role])
    Object.assign(selected.settings, {
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: true
    })
    vi.spyOn(selected.runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: false,
      reason: 'agent'
    })
    const mode = await prepareAgentPresetWorkerMode({
      runtime: selected.runtime,
      preset: role,
      fallback: agentPresetWorkerMode(selected.runtime, role),
      target: { worktree: 'wt' }
    })
    expect(mode).toMatchObject({ preferred: 'structured', mode: 'terminal' })
    expect(await prepareFederatedAgentPreset(selected.runtime, role, { worktree: 'wt' })).toBe(
      false
    )
  })
  it('rejects cmd, oversized Windows lines and control bytes before terminal placement', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    if (!platform) {
      throw new Error('Missing platform descriptor')
    }
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
    try {
      for (const [shell, instructions] of [
        ['cmd.exe', 'Review.'],
        ['powershell.exe', 'x'.repeat(600)],
        ['powershell.exe', 'Review.\u001bOnly.']
      ]) {
        const windowsRole = {
          ...role,
          provider: 'claude' as const,
          model: undefined,
          effort: undefined,
          systemInstructions: instructions
        }
        const selected = host([windowsRole])
        selected.settings.terminalWindowsShell = shell
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the preflight reads only local execution ownership fields.
        vi.spyOn(selected.runtime, 'showRepo').mockResolvedValue({
          executionHostId: 'local'
        } as never)
        vi.spyOn(selected.runtime, 'resolveProjectRuntimeForRepo').mockReturnValue(undefined)
        await expect(
          prepareAgentPresetWorkerMode({
            runtime: selected.runtime,
            preset: windowsRole,
            fallback: agentPresetWorkerMode(selected.runtime, role),
            target: { repo: 'repo' }
          })
        ).rejects.toMatchObject({ code: 'capability_unsupported' })
      }
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
  })
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
