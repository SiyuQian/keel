import type { AgentPreset } from '../../../../../../shared/agent-presets'
import type { AgentLaunchPreferences } from '../../../../../../shared/agent-session-host-authority'
import { assertAgentPresetExecutionRuntime } from '../worker/worker-agent-preset'
import {
  createStructuredWorkerSessionForWorktree,
  type WorkerEffect,
  type WorkerSetupReceipt
} from '../worker/worker-topology'
import { awaitStructuredWorkerSetupGate } from '../worker/worker-start-structured-setup-gate'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type {
  RuntimeTerminalClose,
  RuntimeTerminalShow
} from '../../../../../../shared/runtime-terminal-contracts'
import {
  resolveStructuredWorkerIdentity,
  observeStructuredWorker
} from '../../../../structured-worker-authority'
import { stopStructuredWorker } from '../../orchestration-structured-worker-lifecycle'
import { parsePaneKey } from '../../../../../../shared/stable-pane-id'

export function inspectFederatedStructuredWorker(
  runtime: OrcaRuntimeService,
  dispatchId: string,
  handle: string
) {
  const db = runtime.getOrchestrationDb()
  const identity = resolveStructuredWorkerIdentity(handle, db)
  if (!identity) {
    return null
  }
  const observation = observeStructuredWorker(identity)
  const exact = db.isRemoteAttachmentProcessCurrent({
    dispatchId,
    paneKey: identity.paneKey,
    processIncarnation: identity.processIncarnation
  })
  const pane = parsePaneKey(identity.paneKey)
  const terminal: RuntimeTerminalShow = {
    handle,
    ptyId: null,
    worktreeId: identity.worktreeId,
    worktreePath: '',
    branch: '',
    tabId: pane?.tabId ?? identity.sessionId,
    leafId: pane?.leafId ?? identity.sessionId,
    title: `${identity.agent} Agent`,
    connected: observation.status === 'live',
    writable: observation.status === 'live',
    lastOutputAt: null,
    preview: '',
    paneRuntimeId: 0,
    rendererGraphEpoch: 0
  }
  return {
    terminal,
    exact,
    status: exact ? observation.status : ('identity_changed' as const),
    ...(observation.reason ? { reason: observation.reason } : {})
  }
}

export async function closeFederatedWorker(
  runtime: OrcaRuntimeService,
  dispatchId: string,
  handle: string
): Promise<RuntimeTerminalClose> {
  const identity = resolveStructuredWorkerIdentity(handle, runtime.getOrchestrationDb())
  if (!identity) {
    return runtime.closeTerminal(handle)
  }
  const stop = await stopStructuredWorker(identity, dispatchId, runtime)
  return {
    handle,
    tabId: identity.sessionId,
    ptyKilled: stop.stopped,
    ...(!stop.stopped
      ? { ptyStopVerdict: 'unverifiable' as const, ptyStopReason: stop.reason }
      : {})
  }
}

export async function createFederatedStructuredWorker(args: {
  runtime: OrcaRuntimeService
  worktreeId: string
  preset: AgentPreset
  setup: WorkerSetupReceipt
  effects: WorkerEffect[]
  dispatchId: string
  launchPreferences: AgentLaunchPreferences | undefined
  timeoutMs: number
}) {
  const wait = await awaitStructuredWorkerSetupGate(args)
  if (wait && !wait.satisfied) {
    throw new Error(`Setup is not ready for the Agent (${wait.status}).`)
  }
  await assertAgentPresetExecutionRuntime(
    args.runtime,
    { worktree: `id:${args.worktreeId}` },
    args.preset.provider
  )
  return createStructuredWorkerSessionForWorktree({ ...args, agent: args.preset.provider })
}
