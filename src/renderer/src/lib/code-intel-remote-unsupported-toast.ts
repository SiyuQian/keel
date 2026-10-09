import { toast } from 'sonner'
import { isUnsupportedResult, type CodeIntelResult } from '../../../shared/code-intel-contract'

// Why: providers swallow non-ok results into an empty location list, so a remote
// or SSH worktree looks identical to "no definition found". Surface the real
// reason once per session — a deduped toast — so the user understands the gap
// instead of assuming navigation is broken. Repeated hovers must not spam it.
let notified = false
const reported = new Set<string>()

export function notifyIfRemoteUnsupported(result: CodeIntelResult): void {
  if (
    result.status === 'error' &&
    !['cancelled', 'busy', 'worker-unavailable'].includes(result.code) &&
    !reported.has(result.code)
  ) {
    reported.add(result.code)
    toast.error(`Code intelligence: ${result.message}`)
  }
  if (
    result.status === 'unsupported' &&
    result.reason === 'no-tsconfig' &&
    !reported.has(result.reason)
  ) {
    reported.add(result.reason)
    toast.info('No TypeScript or JavaScript project includes this file.')
  }
  if (notified || !isUnsupportedResult(result) || result.reason !== 'remote-runtime') {
    return
  }
  notified = true
  toast.info('Code intelligence is not available on remote or SSH worktrees yet.')
}

export function resetRemoteUnsupportedToastForTest(): void {
  notified = false
  reported.clear()
}
