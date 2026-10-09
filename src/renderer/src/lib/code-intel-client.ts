import { translate } from '@/i18n/i18n'
import {
  CODE_INTEL_MAX_BUFFERS,
  CODE_INTEL_MAX_BUFFER_TEXT,
  CODE_INTEL_MAX_TOTAL_TEXT,
  type CodeIntelMethod,
  type CodeIntelResult,
  type CodeIntelIpcArgs
} from '../../../shared/code-intel-contract'

export type CodeIntelClientArgs = Omit<CodeIntelIpcArgs, 'requestId'>

// Structurally compatible with Monaco's CancellationToken, but defined locally so
// this client stays free of a monaco import and easy to unit-test.
export type CodeIntelCancellation = {
  readonly isCancellationRequested: boolean
  onCancellationRequested: (listener: () => void) => { dispose: () => void }
}

let nextRequestId = 1

export async function queryCodeIntel(
  method: CodeIntelMethod,
  args: CodeIntelClientArgs,
  token?: CodeIntelCancellation
): Promise<CodeIntelResult> {
  if (token?.isCancellationRequested) {
    return {
      status: 'error',
      code: 'cancelled',
      message: translate('codeIntel.result.cancelled', 'request cancelled')
    }
  }
  if (args.executionHostId !== 'local' || args.runtimeEnvironmentId || args.connectionId) {
    return { status: 'unsupported', reason: 'remote-runtime' }
  }
  const buffers = args.buffers ?? []
  if (
    buffers.length > CODE_INTEL_MAX_BUFFERS ||
    (args.bufferText?.length ?? 0) > CODE_INTEL_MAX_BUFFER_TEXT ||
    buffers.some((buffer) => buffer.text.length > CODE_INTEL_MAX_BUFFER_TEXT) ||
    buffers.reduce((sum, buffer) => sum + buffer.text.length, args.bufferText?.length ?? 0) >
      CODE_INTEL_MAX_TOTAL_TEXT
  ) {
    return {
      status: 'error',
      code: 'buffer-limit',
      message: translate(
        'codeIntel.result.bufferLimit',
        'Too many or oversized open buffers. Save or close other files before navigating.'
      )
    }
  }
  const bridge = window.api.codeIntel
  const requestId = nextRequestId++
  // Why: forward the cancellation downstream — the main process aborts the
  // in-flight sidecar query keyed by this request id.
  const subscription = token?.onCancellationRequested(() => bridge.cancel(requestId))
  try {
    const payload = { ...args, requestId }
    return method === 'definition'
      ? await bridge.definition(payload)
      : await bridge.references(payload)
  } catch (error) {
    return {
      status: 'error',
      code: 'bridge-failure',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    subscription?.dispose()
  }
}
