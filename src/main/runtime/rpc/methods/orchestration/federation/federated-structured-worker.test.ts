import { afterEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationDb } from '../../../../orchestration/db'
import { structuredWorkerIdentities } from '../../../../structured-worker-identity'
import { inspectRemoteAttachment } from './federation-attachment-observation'
afterEach(() => {
  structuredWorkerIdentities.clear()
  vi.restoreAllMocks()
})
it('preserves a structured remote attachment as unverifiable when its host is unavailable', async () => {
  const db = new OrchestrationDb(':memory:')
  const runtime = new OrcaRuntimeService()
  runtime.setOrchestrationDb(db)
  const identity = structuredWorkerIdentities.register({
    handle: 'structworker_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    agent: 'codex',
    paneKey: 'structured:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    processIncarnation: 'structured:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    worktreeId: 'wt',
    hostScope: { kind: 'local', hostId: 'local' }
  })
  db.createRemoteDispatchAttachment({
    runId: 'run',
    dispatchId: 'dispatch',
    taskId: 'task',
    homePeerFingerprint: 'home',
    protocolVersion: 3,
    runtimeEpoch: runtime.getRuntimeId(),
    mutationReceipt: {
      callerFingerprint: 'home',
      requestId: 'req',
      method: 'orchestration.federationAttachStart',
      payloadHash: 'hash'
    }
  })
  db.prepareRemoteAttachmentAuthority({
    dispatchId: 'dispatch',
    paneKey: identity.paneKey,
    processIncarnation: identity.processIncarnation,
    worktreeId: 'wt',
    terminalHandle: identity.handle,
    setupState: 'not_applicable',
    effects: [],
    hostScope: JSON.stringify(identity.hostScope),
    terminalOwnership: 'created'
  })
  vi.spyOn(runtime, 'showTerminal').mockRejectedValue(new Error('No PTY exists'))
  try {
    expect(await inspectRemoteAttachment(runtime, 'dispatch')).toMatchObject({
      exact: true,
      status: 'unverifiable',
      terminal: { handle: identity.handle, ptyId: null }
    })
  } finally {
    db.close()
  }
})
