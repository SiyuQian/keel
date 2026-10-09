import { expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
const { invoke, send } = vi.hoisted(() => ({ invoke: vi.fn(), send: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: { invoke, send } }))
import { codeIntelApi } from './code-intel-bridge'

it('routes navigation and cancellation to their main-process channels', async () => {
  const args = {
    workspaceId: 'r::/repo',
    workspaceRoot: '/repo',
    executionHostId: 'local',
    filePath: '/repo/a.ts',
    relativePath: 'a.ts',
    position: { line: 0, character: 0 },
    bufferVersion: 1,
    requestId: 7
  }
  const result = { status: 'unsupported', reason: 'disabled' }
  invoke.mockResolvedValue(result)
  expect(await codeIntelApi.definition(args)).toBe(result)
  expect(await codeIntelApi.references(args)).toBe(result)
  codeIntelApi.cancel(7)
  expect(invoke.mock.calls).toEqual([
    ['codeIntel:definition', args],
    ['codeIntel:references', args]
  ])
  expect(send).toHaveBeenCalledWith('codeIntel:cancel', 7)
})
it('keeps navigation off in default settings', () => {
  expect(getDefaultSettings('/tmp').experimentalCodeIntelligence).toBe(false)
})
