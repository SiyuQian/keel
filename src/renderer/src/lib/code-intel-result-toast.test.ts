import { beforeEach, expect, it, vi } from 'vitest'
const { info, error } = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info, error } }))
import { notifyCodeIntelResult, resetCodeIntelResultToastForTest } from './code-intel-result-toast'
beforeEach(() => {
  info.mockClear()
  error.mockClear()
  resetCodeIntelResultToastForTest()
})
it('shows remote unsupported once instead of pretending no definition exists', () => {
  notifyCodeIntelResult({ status: 'unsupported', reason: 'remote-runtime' })
  notifyCodeIntelResult({ status: 'unsupported', reason: 'remote-runtime' })
  expect(info).toHaveBeenCalledTimes(1)
})
it('surfaces invalid configuration errors and missing projects distinctly', () => {
  notifyCodeIntelResult({ status: 'unsupported', reason: 'no-tsconfig' })
  notifyCodeIntelResult({
    status: 'error',
    code: 'navigation-failed',
    message: 'Invalid config.'
  })
  expect(info).toHaveBeenCalledOnce()
  expect(error).toHaveBeenCalledWith('Code intelligence: Invalid config.')
})
it('does not toast successful empty results or cancellation', () => {
  notifyCodeIntelResult({ status: 'ok', bufferVersion: 0, locations: [], truncated: false })
  notifyCodeIntelResult({ status: 'error', code: 'cancelled', message: 'Cancelled.' })
  expect(info).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
it('surfaces worker unavailability instead of pretending no definition exists', () => {
  notifyCodeIntelResult({
    status: 'error',
    code: 'worker-unavailable',
    message: 'Worker unavailable.'
  })
  expect(error).toHaveBeenCalledWith('Code intelligence: Worker unavailable.')
})
