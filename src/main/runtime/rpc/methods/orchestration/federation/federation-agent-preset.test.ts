import { configureFederationWorkerRuntime } from './federation-runtime.test-support'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationDb } from '../../../../orchestration/db'
import { createGlobalSettingsFixture } from '../../../../../../shared/global-settings-test-fixture'
import { RuntimeClientSettingsController } from '../../../../runtime-client-settings'
const createSession = vi.fn(async (_args: Record<string, unknown>) => ({
  identity: { handle: 'structworker_remote', sessionId: 'remote_session' },
  host: {}
}))
const sendPreamble = vi.fn(async (_args: Record<string, unknown>) => 'accepted')
vi.mock('../../orchestration-structured-worker-session', () => ({
  releaseStructuredWorkerSession: vi.fn(),
  createStructuredWorkerSession: (args: never) => createSession(args),
  sendStructuredWorkerPreamble: (args: never) => sendPreamble(args)
}))
const { ORCHESTRATION_METHODS } = await import('../../orchestration')
const role = {
  id: 'review',
  name: 'Review',
  provider: 'codex' as const,
  systemInstructions: 'Execution host instructions.',
  model: 'gpt-5.6-sol',
  effort: 'high'
}
describe('federated Agent preset sessions', () => {
  let db: OrchestrationDb
  afterEach(() => {
    db?.close()
    vi.restoreAllMocks()
    createSession.mockClear()
    sendPreamble.mockClear()
  })
  async function start(reason?: 'remote' | 'wsl', native = true) {
    db = new OrchestrationDb(':memory:')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: launch preflight reads only the host settings from this fixture store.
    const runtime = new OrcaRuntimeService({
      getSettings: () => createGlobalSettingsFixture({ agentPresets: [role] })
    } as never)
    runtime.setOrchestrationDb(db)
    vi.spyOn(runtime, 'getClientSettings').mockReturnValue(
      new RuntimeClientSettingsController({
        getSettings: () =>
          createGlobalSettingsFixture({
            agentPresets: [role],
            experimentalNativeChat: native,
            experimentalStructuredNativeChat: native,
            openAgentTabsInChatByDefault: native
          })
      }).get()
    )
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue(
      reason ? { supported: false, reason } : { supported: true }
    )
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only this workspace identity.
    vi.spyOn(runtime, 'showManagedTerminalWorkspace').mockResolvedValue({
      id: 'folder:remote-workspace'
    } as never)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockReturnValue('tab_remote:leaf_remote')
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockReturnValue('structured:remote_session')
    vi.spyOn(runtime, 'getTerminalOrchestrationCliCommand').mockReturnValue('orca')
    if (native) {
      vi.spyOn(runtime, 'createTerminal').mockRejectedValue(
        new Error('Native preset must not start a terminal')
      )
    } else {
      configureFederationWorkerRuntime(runtime)
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this branch consumes only the created terminal handle.
      vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
        handle: 'term_windows_worker'
      } as never)
    }
    const method = ORCHESTRATION_METHODS.find(
      (item) => item.name === 'orchestration.federationAttachStart'
    )!
    return method.handler(
      method.params!.parse({
        runId: 'run-home',
        dispatchId: 'ctx_remote',
        taskId: 'task_remote',
        taskSpec: 'Review the preceding result.',
        depth: 2,
        protocolVersion: 3,
        worktree: 'folder:remote-workspace',
        agentPreset: role.id
      }),
      {
        runtime,
        orchestrationMutation: {
          callerFingerprint: 'home_peer',
          requestId: 'request_remote',
          method: method.name,
          payloadHash: 'remote_payload'
        }
      }
    )
  }
  it('launches a fresh native session with the host snapshot and delivers the coordinator task', async () => {
    expect(await start()).toMatchObject({
      state: 'ready',
      launch: { effective: { agentPreset: role } }
    })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        agentPreset: role,
        options: { model: role.model, effort: role.effort }
      })
    )
    expect(sendPreamble).toHaveBeenCalledWith(
      expect.objectContaining({ preamble: expect.stringContaining('Review the preceding result.') })
    )
  })
  it('launches the configured terminal surface with a fresh host-owned role', async () => {
    expect(await start(undefined, false)).toMatchObject({
      state: 'ready',
      launch: { effective: { agentPreset: role } }
    })
    expect(createSession).not.toHaveBeenCalled()
  })
  it.each(['remote', 'wsl'] as const)(
    'refuses %s proxy execution before attachment or session effects',
    async (reason) => {
      await expect(start(reason)).rejects.toThrow('execution runtime')
      expect(db.getRemoteDispatchAttachment('ctx_remote')).toBeUndefined()
      expect(createSession).not.toHaveBeenCalled()
    }
  )
})
