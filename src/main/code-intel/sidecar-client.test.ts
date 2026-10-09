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
it('cancels only the hovered request while preserving concurrent work', async () => {
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  const abort = new AbortController()
  const a = client.query('definition', params, abort.signal)
  const b = client.query('references', params)
  const first = worker.postMessage.mock.calls[0][0]
  abort.abort()
  expect(await a).toMatchObject({ code: 'cancelled' })
  expect(worker.terminate).not.toHaveBeenCalled()
  worker.emit('message', {
    id: first.id,
    result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
  })
  const second = worker.postMessage.mock.calls.at(-1)?.[0]
  worker.emit('message', {
    id: second.id,
    result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
  })
  expect(await b).toMatchObject({ status: 'ok' })
  client.shutdown()
})
it('does not execute cancelled queued hover work', async () => {
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  const a = client.query('references', params)
  const abort = new AbortController()
  const b = client.query('definition', params, abort.signal)
  abort.abort()
  expect(await b).toMatchObject({ code: 'cancelled' })
  expect(worker.postMessage).toHaveBeenCalledOnce()
  worker.emit('message', {
    id: worker.postMessage.mock.calls[0][0].id,
    result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
  })
  expect(await a).toMatchObject({ status: 'ok' })
  expect(worker.postMessage).toHaveBeenCalledOnce()
  client.shutdown()
})
it('reports worker startup failures', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const client = new CodeIntelSidecarClient(() => {
    throw new Error('Missing worker entry')
  })
  expect(await client.query('definition', params)).toMatchObject({ code: 'worker-unavailable' })
  expect(warn).toHaveBeenCalledWith('[code-intel] worker unavailable:', 'Missing worker entry')
  client.shutdown()
  warn.mockRestore()
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
it('does not retire the worker for queue wait', async () => {
  vi.useFakeTimers()
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  try {
    const first = client.query('definition', params)
    const second = client.query('references', params)
    await vi.advanceTimersByTimeAsync(25_000)
    worker.emit('message', {
      id: worker.postMessage.mock.calls[0][0].id,
      result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
    })
    expect(await first).toMatchObject({ status: 'ok' })
    let settled = false
    void second.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(settled).toBe(false)
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.emit('message', {
      id: worker.postMessage.mock.calls[1][0].id,
      result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
    })
    expect(await second).toMatchObject({ status: 'ok' })
  } finally {
    client.shutdown()
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
  vi.useFakeTimers()
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
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await pending).toMatchObject({ code: 'timeout' })
  expect(await client.query('definition', params)).toMatchObject({ code: 'worker-unavailable' })
  expect(factory).toHaveBeenCalledOnce()
  finish(0)
  await Promise.resolve()
  await Promise.resolve()
  const replacement = client.query('definition', params)
  expect(factory).toHaveBeenCalledTimes(2)
  client.shutdown()
  await replacement
  vi.useRealTimers()
})

it('bounds active and queued work even after active cancellation', async () => {
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  const active = new AbortController()
  const queued = new AbortController()
  const calls = [
    client.query('definition', params, active.signal),
    client.query('definition', params, queued.signal),
    ...Array.from({ length: 6 }, () => client.query('references', params))
  ]
  active.abort()
  expect(await calls[0]).toMatchObject({ code: 'cancelled' })
  expect(await client.query('definition', params)).toMatchObject({ code: 'busy' })
  queued.abort()
  expect(await calls[1]).toMatchObject({ code: 'cancelled' })
  const replacement = client.query('definition', params)
  expect(worker.postMessage).toHaveBeenCalledOnce()
  client.shutdown()
  expect(await replacement).toMatchObject({ code: 'shutdown' })
  await Promise.all(calls)
})

it('retires idle workers after completing a query', async () => {
  vi.useFakeTimers()
  const worker = new Transport()
  const client = new CodeIntelSidecarClient(() => worker)
  try {
    const call = client.query('definition', params)
    worker.emit('message', {
      id: worker.postMessage.mock.calls[0][0].id,
      result: { status: 'ok', bufferVersion: 1, locations: [], truncated: false }
    })
    await call
    await vi.advanceTimersByTimeAsync(59_999)
    expect(worker.terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(worker.terminate).toHaveBeenCalledOnce()
  } finally {
    client.shutdown()
    vi.useRealTimers()
  }
})

it('bounds cancelled CPU work by the original deadline', async () => {
  vi.useFakeTimers()
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
  expect(terminated).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(30_000)
  const result = terminated.mock.results[0]
  if (result?.type !== 'return') {
    throw new Error('Termination was not requested.')
  }
  await result.value
  expect(worker.threadId).toBe(-1)
  client.shutdown()
  vi.useRealTimers()
})
