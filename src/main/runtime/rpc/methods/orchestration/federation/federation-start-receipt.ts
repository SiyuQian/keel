import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type {
  createStructuredWorkerSessionForWorktree,
  WorkerSetupReceipt
} from '../worker/worker-topology'
import { tearDownFailedWorkerStart } from '../worker/failed-worker-start-teardown'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { parseRemoteFederatedWorkerStartReceipt } from './federated-attach-receipt'
import type { OrchestrationDb } from '../../../../orchestration/db'
import { isFederationEffectUnknown } from './federation-effects'
import type { OrchestrationWorkerLaunchReceipt } from '../worker/worker-launch-preferences'

export async function failFederatedAttachmentWithReceipt(args: {
  runtime: OrcaRuntimeService
  structuredSession: Awaited<ReturnType<typeof createStructuredWorkerSessionForWorktree>> | null
  db: OrchestrationDb
  dispatchId: string
  runtimeEpoch: string
  failedStage: string
  error: unknown
  setup: WorkerSetupReceipt
  launch: OrchestrationWorkerLaunchReceipt
}): Promise<unknown> {
  const reason = args.error instanceof Error ? args.error.message : String(args.error)
  const unknown = isFederationEffectUnknown(args.error, args.failedStage)
  if (!unknown) {
    await tearDownFailedWorkerStart(args)
  }
  const attachment = args.db.failRemoteAttachment(
    args.dispatchId,
    args.failedStage,
    reason,
    unknown
  )
  return {
    dispatchId: args.dispatchId,
    state: attachment.state === 'start_unknown' ? 'outcome_unknown' : attachment.state,
    stage: attachment.stage,
    runtimeEpoch: args.runtimeEpoch,
    failedStage: args.failedStage,
    lastError: reason,
    setup: args.setup,
    launch: args.launch,
    effects: JSON.parse(attachment.effects) as unknown[],
    residualResources: JSON.parse(attachment.residual_resources) as unknown[]
  }
}

export function assertRemoteAgentPresetConfirmed(
  id: string | undefined,
  remote: ReturnType<typeof parseRemoteFederatedWorkerStartReceipt>
): void {
  if (id && remote.state === 'ready' && remote.launch?.effective?.agentPreset?.id !== id) {
    throw new OrchestrationError(
      'operation_unknown',
      'The execution runtime did not confirm the selected Agent preset.'
    )
  }
}
