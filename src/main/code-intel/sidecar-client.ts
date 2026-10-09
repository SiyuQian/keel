import { Worker } from 'node:worker_threads'
import type {
  CodeIntelMethod,
  CodeIntelRequest,
  CodeIntelResult
} from '../../shared/code-intel-contract'
import { LazyWorkerThreadHost, type WorkerThreadFactory } from '../lazy-worker-thread-host'
import { currentWorkerEntryLayout, resolveWorkerThreadEntryPath } from '../worker-thread-entry-path'

type Response = { id: number; result: CodeIntelResult }
type Pending = {
  resolve: (result: CodeIntelResult) => void
  cleanup: () => void
  request: { id: number; method: CodeIntelMethod; params: CodeIntelRequest }
}
let singleton: CodeIntelSidecarClient | null = null
export function getCodeIntelSidecar(): CodeIntelSidecarClient {
  return (singleton ??= new CodeIntelSidecarClient())
}
export function shutdownCodeIntelSidecar(): void {
  singleton?.shutdown()
  singleton = null
}

export class CodeIntelSidecarClient {
  private nextId = 1
  private activeId: number | null = null
  private readonly pending = new Map<number, Pending>()
  private readonly host: LazyWorkerThreadHost<Response>
  constructor(
    factory: WorkerThreadFactory = () =>
      new Worker(
        resolveWorkerThreadEntryPath(
          currentWorkerEntryLayout(__dirname),
          'code-intel-worker-entry.js'
        )
      )
  ) {
    this.host = new LazyWorkerThreadHost({
      factory,
      idleTeardownMs: 60_000,
      awaitRetirement: true,
      isIdle: () => this.pending.size === 0,
      onMessage: (response) => {
        const pending = this.pending.get(response.id)
        if (!pending) {
          return
        }
        this.pending.delete(response.id)
        this.activeId = null
        pending.cleanup()
        pending.resolve(response.result)
        this.dispatchNext()
        if (!this.pending.size) {
          this.host.scheduleIdleTeardown()
        }
      },
      onError: (error) => this.retire('worker-failed', error.message),
      onExit: (code) => this.retire('worker-exited', `Code intelligence worker exited (${code}).`),
      onUnavailable: (error) =>
        console.warn(
          '[code-intel] worker unavailable:',
          error instanceof Error ? error.message : String(error)
        )
    })
  }
  query(
    method: CodeIntelMethod,
    params: CodeIntelRequest,
    signal?: AbortSignal
  ): Promise<CodeIntelResult> {
    if (signal?.aborted) {
      return Promise.resolve({ status: 'error', code: 'cancelled', message: 'Request cancelled.' })
    }
    if (this.pending.size >= 8) {
      return Promise.resolve({
        status: 'error',
        code: 'busy',
        message: 'Code intelligence is busy.'
      })
    }
    this.host.clearIdleTimer()
    const worker = this.host.ensure()
    if (!worker) {
      return Promise.resolve({
        status: 'error',
        code: 'worker-unavailable',
        message: 'Code intelligence worker is unavailable or retiring.'
      })
    }
    const id = this.nextId++
    return new Promise((resolve) => {
      const onAbort = (): void => {
        const pending = this.pending.get(id)
        if (!pending) {
          return
        }
        pending.resolve({ status: 'error', code: 'cancelled', message: 'Request cancelled.' })
        // Active synchronous work retains its deadline and slot until completion; queued work never starts.
        if (id !== this.activeId) {
          this.pending.delete(id)
          pending.cleanup()
        }
      }
      const timer = setTimeout(
        () => this.retire('timeout', 'Code intelligence timed out. Worker retirement requested.'),
        30_000
      )
      this.pending.set(id, {
        resolve,
        request: { id, method, params },
        cleanup: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        }
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      this.dispatchNext()
    })
  }
  private dispatchNext(): void {
    if (this.activeId !== null) {
      return
    }
    const next = this.pending.values().next().value
    if (!next) {
      return
    }
    this.activeId = next.request.id
    try {
      this.host.ensure()?.postMessage(next.request)
    } catch (error) {
      this.retire('worker-failed', error instanceof Error ? error.message : String(error))
    }
  }
  shutdown(): void {
    this.retire('shutdown', 'Code intelligence shut down.')
  }
  private retire(code: string, message: string): void {
    this.host.destroy()
    for (const pending of this.pending.values()) {
      pending.cleanup()
      pending.resolve({ status: 'error', code, message })
    }
    this.pending.clear()
    this.activeId = null
  }
}
