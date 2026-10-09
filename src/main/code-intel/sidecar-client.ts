import { Worker } from 'node:worker_threads'
import type {
  CodeIntelMethod,
  CodeIntelRequest,
  CodeIntelResult
} from '../../shared/code-intel-contract'
import type { WorkerThreadFactory } from '../lazy-worker-thread-host'
import { WorkerThreadRequestQueue } from '../worker-thread-request-queue'
import { currentWorkerEntryLayout, resolveWorkerThreadEntryPath } from '../worker-thread-entry-path'

type Response = { id: number; result: CodeIntelResult }
type Request = { id: number; method: CodeIntelMethod; params: CodeIntelRequest }
class CodeIntelWorkerUnavailableError extends Error {}
const BUSY_MESSAGE = 'Code intelligence is busy.'
const TIMEOUT_MESSAGE = 'Code intelligence timed out. Worker retirement requested.'
const EXIT_MESSAGE = 'Code intelligence worker exited.'
let singleton: CodeIntelSidecarClient | null = null
export function getCodeIntelSidecar(): CodeIntelSidecarClient {
  return (singleton ??= new CodeIntelSidecarClient())
}
export function shutdownCodeIntelSidecar(): void {
  singleton?.shutdown()
  singleton = null
}

export class CodeIntelSidecarClient {
  private readonly queue: WorkerThreadRequestQueue<Request, Response>
  private stopped = false
  constructor(
    factory: WorkerThreadFactory = () =>
      new Worker(
        resolveWorkerThreadEntryPath(
          currentWorkerEntryLayout(__dirname),
          'code-intel-worker-entry.js'
        )
      )
  ) {
    this.queue = new WorkerThreadRequestQueue({
      factory,
      idleTeardownMs: 60_000,
      awaitRetirement: true,
      retainActiveSlotOnAbort: true,
      maxConsecutiveDeaths: 1,
      queueCap: { maxQueuedCalls: 7, describeFull: () => BUSY_MESSAGE },
      createUnavailableError: (message) => new CodeIntelWorkerUnavailableError(message),
      describeTimeout: () => TIMEOUT_MESSAGE,
      describeExit: () => EXIT_MESSAGE,
      describeCrashLoop: (lastError) => lastError,
      onUnavailable: (error) =>
        console.warn(
          '[code-intel] worker unavailable:',
          error instanceof Error ? error.message : String(error)
        )
    })
  }
  async query(
    method: CodeIntelMethod,
    params: CodeIntelRequest,
    signal?: AbortSignal
  ): Promise<CodeIntelResult> {
    try {
      return (await this.queue.dispatch((id) => ({ id, method, params }), 30_000, signal)).result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = signal?.aborted
        ? 'cancelled'
        : this.stopped
          ? 'shutdown'
          : error instanceof CodeIntelWorkerUnavailableError
            ? 'worker-unavailable'
            : message === BUSY_MESSAGE
              ? 'busy'
              : message === TIMEOUT_MESSAGE
                ? 'timeout'
                : message === EXIT_MESSAGE
                  ? 'worker-exited'
                  : 'worker-failed'
      return { status: 'error', code, message }
    }
  }
  shutdown(): void {
    this.stopped = true
    this.queue.dispose()
  }
}
