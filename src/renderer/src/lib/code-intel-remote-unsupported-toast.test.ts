import { beforeEach, expect, it, vi } from 'vitest'
const { info, error } = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info, error } }))
import {
  notifyIfRemoteUnsupported,
  resetRemoteUnsupportedToastForTest
} from './code-intel-remote-unsupported-toast'
beforeEach(() => {
  info.mockClear()
  error.mockClear()
  resetRemoteUnsupportedToastForTest()
})
it('shows remote unsupported once instead of pretending no definition exists', () => {
  notifyIfRemoteUnsupported({ status: 'unsupported', reason: 'remote-runtime' })
  notifyIfRemoteUnsupported({ status: 'unsupported', reason: 'remote-runtime' })
  expect(info).toHaveBeenCalledTimes(1)
})
it('surfaces invalid configuration errors and missing projects distinctly', () => {
  notifyIfRemoteUnsupported({ status: 'unsupported', reason: 'no-tsconfig' })
  notifyIfRemoteUnsupported({
    status: 'error',
    code: 'navigation-failed',
    message: 'Invalid config.'
  })
  expect(info).toHaveBeenCalledOnce()
  expect(error).toHaveBeenCalledWith('Code intelligence: Invalid config.')
})
it('does not toast successful empty results or cancellation', () => {
  notifyIfRemoteUnsupported({ status: 'ok', bufferVersion: 0, locations: [], truncated: false })
  notifyIfRemoteUnsupported({ status: 'error', code: 'cancelled', message: 'Cancelled.' })
  expect(info).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
