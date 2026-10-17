import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryCodeIntel } from './code-intel-client'

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error cleanup test global
  delete globalThis.window
})

function stubApi(impl: () => Promise<unknown>): void {
  // @ts-expect-error minimal window stub
  globalThis.window = { api: { codeIntel: { references: impl, definition: impl } } }
}

describe('queryCodeIntel', () => {
  it('forwards file path, position, and buffer overlay to the bridge', async () => {
    const references = vi.fn().mockResolvedValue({ status: 'ok', locations: [], truncated: false })
    // @ts-expect-error minimal window stub
    globalThis.window = { api: { codeIntel: { references, definition: references } } }
    await queryCodeIntel('references', {
      workspaceId: 'r::/repo',
      workspaceRoot: '/repo',
      executionHostId: 'local',
      filePath: '/repo/a.ts',
      relativePath: 'a.ts',
      position: { line: 1, character: 2 },
      bufferVersion: 7,
      bufferText: 'const x = 1',
      connectionId: undefined
    })
    expect(references).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'r::/repo',
        workspaceRoot: '/repo',
        executionHostId: 'local',
        filePath: '/repo/a.ts',
        bufferVersion: 7,
        bufferText: 'const x = 1'
      })
    )
  })

  it('cancels the in-flight request when the cancellation token fires', () => {
    const cancel = vi.fn()
    const references = vi.fn().mockReturnValue(new Promise(() => {}))
    // @ts-expect-error minimal window stub
    globalThis.window = { api: { codeIntel: { references, definition: references, cancel } } }
    let fire: () => void = () => {}
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        fire = listener
        return { dispose: vi.fn() }
      }
    }
    void queryCodeIntel(
      'references',
      {
        workspaceId: 'r::/repo',
        workspaceRoot: '/repo',
        executionHostId: 'local',
        filePath: '/repo/a.ts',
        relativePath: 'a.ts',
        position: { line: 0, character: 0 },
        bufferVersion: 0
      },
      token
    )
    fire()
    expect(cancel).toHaveBeenCalledWith(expect.any(Number))
  })

  it('short-circuits without querying when the token is already cancelled', async () => {
    const references = vi.fn()
    globalThis.window = {
      // @ts-expect-error minimal window stub
      api: { codeIntel: { references, definition: references, cancel: vi.fn() } }
    }
    const result = await queryCodeIntel(
      'references',
      {
        workspaceId: 'r::/repo',
        workspaceRoot: '/repo',
        executionHostId: 'local',
        filePath: '/repo/a.ts',
        relativePath: 'a.ts',
        position: { line: 0, character: 0 },
        bufferVersion: 0
      },
      { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: vi.fn() }) }
    )
    expect(references).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'error', code: 'cancelled', message: 'request cancelled' })
  })

  it('returns an error result when the bridge throws', async () => {
    stubApi(() => Promise.reject(new Error('boom')))
    const result = await queryCodeIntel('definition', {
      workspaceId: 'r::/repo',
      workspaceRoot: '/repo',
      executionHostId: 'local',
      filePath: '/repo/a.ts',
      relativePath: 'a.ts',
      position: { line: 0, character: 0 },
      bufferVersion: 0
    })
    expect(result.status).toBe('error')
  })
})

it('rejects oversized overlay snapshots before IPC without truncating them', async () => {
  const bridge = vi.fn()
  stubApi(bridge)
  const args = {
    workspaceId: 'r::/repo',
    workspaceRoot: '/repo',
    executionHostId: 'local',
    filePath: '/repo/a.ts',
    relativePath: 'a.ts',
    position: { line: 0, character: 0 },
    bufferVersion: 1
  }
  const buffers = Array.from({ length: 65 }, (_, i) => ({
    filePath: `/repo/${i}.ts`,
    text: '',
    version: 1
  }))
  expect(await queryCodeIntel('definition', { ...args, buffers })).toMatchObject({
    code: 'buffer-limit'
  })
  expect(
    await queryCodeIntel('definition', { ...args, bufferText: 'x'.repeat(4_000_001) })
  ).toMatchObject({ code: 'buffer-limit' })
  expect(bridge).not.toHaveBeenCalled()
})
