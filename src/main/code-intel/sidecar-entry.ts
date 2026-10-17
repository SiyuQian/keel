import { parentPort } from 'node:worker_threads'
import { LanguageServicePool } from './language-service-pool'
import { answerCodeIntelRequest, type CodeIntelWorkerRequest } from './navigation'

if (!parentPort) {
  throw new Error('Code intelligence requires a worker port.')
}
const port = parentPort
const pool = new LanguageServicePool({ maxServices: 1 })
port.on('message', (request: CodeIntelWorkerRequest) => {
  port.postMessage(answerCodeIntelRequest(pool, request))
})
