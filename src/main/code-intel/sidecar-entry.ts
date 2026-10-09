import { parentPort } from 'node:worker_threads'
import type { CodeIntelMethod, CodeIntelRequest } from '../../shared/code-intel-contract'
import { LanguageServicePool } from './language-service-pool'
import { getDefinition, findReferences } from './navigation'

if (!parentPort) {
  throw new Error('Code intelligence requires a worker port.')
}
const port = parentPort
const pool = new LanguageServicePool({ maxServices: 1, idleMs: 60_000 })
port.on('message', (request: { id: number; method: CodeIntelMethod; params: CodeIntelRequest }) => {
  // Every request supplies a complete owner-scoped snapshot; no other workspace retains overlays.
  pool.setOverlays(request.params.buffers ?? [])
  const result =
    request.method === 'definition'
      ? getDefinition(pool, request.params)
      : findReferences(pool, request.params)
  port.postMessage({ id: request.id, result })
})
