import { Worker } from 'node:worker_threads'
import type {
  CodeIntelMethod,
  CodeIntelRequest,
  CodeIntelResult
} from '../../shared/code-intel-contract'
import { LazyWorkerThreadHost, type WorkerThreadFactory } from '../lazy-worker-thread-host'
import { currentWorkerEntryLayout, resolveWorkerThreadEntryPath } from '../worker-thread-entry-path'

type Response = { id: number; result: CodeIntelResult }
type Pending = { resolve: (result: CodeIntelResult) => void; cleanup: () => void }
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
        pending.cleanup()
        pending.resolve(response.result)
        if (!this.pending.size) {
          this.host.scheduleIdleTeardown()
        }
      },
      onError: (error) => this.retire('worker-failed', error.message),
      onExit: (code) => this.retire('worker-exited', `Code intelligence worker exited (${code}).`),
      onUnavailable: () => {}
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
      // Termination interrupts synchronous TS work; a cancel message cannot interrupt its event loop.
      const onAbort = (): void =>
        this.retire('cancelled', 'Request cancelled. Worker retirement requested.')
      const timer = setTimeout(
        () => this.retire('timeout', 'Code intelligence timed out. Worker retirement requested.'),
        30_000
      )
      this.pending.set(id, {
        resolve,
        cleanup: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        }
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        worker.postMessage({ id, method, params })
      } catch (error) {
        this.retire('worker-failed', error instanceof Error ? error.message : String(error))
      }
    })
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
  }
}
