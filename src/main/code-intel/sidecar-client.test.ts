import { Worker } from 'node:worker_threads'
import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { CodeIntelSidecarClient } from './sidecar-client'

class Transport extends EventEmitter {
  unref = vi.fn()
  postMessage = vi.fn()
  terminate = vi.fn(async () => 0)
}
const params = {
  filePath: '/repo/a.ts',
  relativePath: 'a.ts',
  bufferVersion: 1,
  position: { line: 0, character: 0 }
}
it('retires the worker on cancellation so CPU work cannot accumulate', async () => {
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  const abort = new AbortController()
  const pending = client.query('definition', params, abort.signal)
  abort.abort()
  expect(await pending).toMatchObject({ status: 'error', code: 'cancelled' })
  expect(worker.terminate).toHaveBeenCalledOnce()
  client.shutdown()
})
it('removes abort listeners after successful responses', async () => {
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  const abort = new AbortController()
  const pending = client.query('definition', params, abort.signal)
  const request = worker.postMessage.mock.calls[0][0]
  worker.emit('message', {
    id: request.id,
    result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
  })
  expect(await pending).toMatchObject({ status: 'ok' })
  abort.abort()
  expect(worker.terminate).not.toHaveBeenCalled()
  client.shutdown()
})
it('terminates timed-out work and settles concurrent requests', async () => {
  vi.useFakeTimers()
  try {
    const worker = new Transport()
    const client = new CodeIntelSidecarClient(() => worker)
    const a = client.query('definition', params)
    const b = client.query('references', params)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await a).toMatchObject({ status: 'error', code: 'timeout' })
    expect(await b).toMatchObject({ status: 'error' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    client.shutdown()
  } finally {
    vi.useRealTimers()
  }
})
it('does not start an already cancelled query', async () => {
  const factory = vi.fn(() => new Transport())
  const client = new CodeIntelSidecarClient(factory)
  const abort = new AbortController()
  abort.abort()
  expect(await client.query('definition', params, abort.signal)).toMatchObject({
    code: 'cancelled'
  })
  expect(factory).not.toHaveBeenCalled()
  client.shutdown()
})

it('waits for retirement before permitting a replacement worker', async () => {
  let finish: (value: number) => void = () => {}
  const worker = new Transport()
  worker.terminate.mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve
      })
  )
  const factory = vi.fn(() => worker)
  const client = new CodeIntelSidecarClient(factory)
  const abort = new AbortController()
  const pending = client.query('definition', params, abort.signal)
  abort.abort()
  await pending
  expect(await client.query('definition', params)).toMatchObject({ code: 'worker-unavailable' })
  expect(factory).toHaveBeenCalledOnce()
  finish(0)
  await Promise.resolve()
  await Promise.resolve()
  const replacement = client.query('definition', params)
  expect(factory).toHaveBeenCalledTimes(2)
  client.shutdown()
  await replacement
})

it('actually terminates a busy CPU worker after cancellation', async () => {
  const worker = new Worker(
    "require('node:worker_threads').parentPort.postMessage('busy'); while (true) {}",
    { eval: true }
  )
  await new Promise((resolve) => worker.once('message', resolve))
  const terminated = vi.spyOn(worker, 'terminate')
  const client = new CodeIntelSidecarClient(() => worker)
  const abort = new AbortController()
  const pending = client.query('definition', params, abort.signal)
  abort.abort()
  expect(await pending).toMatchObject({ code: 'cancelled' })
  const result = terminated.mock.results[0]
  if (result?.type !== 'return') {
    throw new Error('Termination was not requested.')
  }
  await result.value
  expect(worker.threadId).toBe(-1)
  client.shutdown()
})
