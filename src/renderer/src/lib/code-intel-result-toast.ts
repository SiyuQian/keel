import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isUnsupportedResult, type CodeIntelResult } from '../../../shared/code-intel-contract'

// Report navigation failures once per code so repeated hover queries do not flood the user.
let notified = false
const reported = new Set<string>()

export function notifyCodeIntelResult(result: CodeIntelResult): void {
  if (result.status === 'error' && result.code !== 'cancelled' && !reported.has(result.code)) {
    reported.add(result.code)
    toast.error(
      translate('codeIntel.result.error', 'Code intelligence: {{message}}', {
        message: result.message
      })
    )
  }
  if (
    result.status === 'unsupported' &&
    result.reason === 'no-tsconfig' &&
    !reported.has(result.reason)
  ) {
    reported.add(result.reason)
    toast.info(
      translate(
        'codeIntel.result.noProject',
        'No TypeScript or JavaScript project includes this file.'
      )
    )
  }
  if (notified || !isUnsupportedResult(result) || result.reason !== 'remote-runtime') {
    return
  }
  notified = true
  toast.info(
    translate(
      'codeIntel.result.remote',
      'Code intelligence is not available on remote or SSH worktrees yet.'
    )
  )
}

export function resetCodeIntelResultToastForTest(): void {
  notified = false
  reported.clear()
}
