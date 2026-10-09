import { app, ipcMain } from 'electron'
import { isAbsolute } from 'node:path'
import type { Store } from '../persistence'
import type { CodeIntelMethod, CodeIntelResult } from '../../shared/code-intel-contract'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { getCodeIntelSidecar, shutdownCodeIntelSidecar } from '../code-intel/sidecar-client'
import { parseCodeIntelArgs, resolveCodeIntelWorkspace } from './code-intel-scope'
import { resolveAuthorizedPath } from './filesystem-auth'
import { isTrustedUIRenderer } from './ui'
import { createSenderScopedRequestCancellations } from './sender-scoped-request-cancellation'

export async function handleCodeIntelQuery(
  method: CodeIntelMethod,
  value: unknown,
  store: Store,
  signal?: AbortSignal
): Promise<CodeIntelResult> {
  if (!store.getSettings().experimentalCodeIntelligence) {
    return { status: 'unsupported', reason: 'disabled' }
  }
  const args = parseCodeIntelArgs(value)
  if (!args) {
    return {
      status: 'error',
      code: 'invalid-request',
      message: 'Invalid code intelligence request.'
    }
  }
  if (args.executionHostId !== 'local' || args.runtimeEnvironmentId || args.connectionId) {
    return { status: 'unsupported', reason: 'remote-runtime' }
  }
  const root = resolveCodeIntelWorkspace(
    {
      repos: store.getRepos(),
      folderWorkspaces: store.getFolderWorkspaces(),
      projectGroups: store.getProjectGroups()
    },
    args
  )
  if (!root) {
    return {
      status: 'error',
      code: 'invalid-owner',
      message: 'Workspace owner cannot be verified as local.'
    }
  }
  try {
    if (
      !isAbsolute(root) ||
      !isAbsolute(args.filePath) ||
      !isPathInsideOrEqual(root, args.filePath)
    ) {
      throw new Error('File is outside the workspace.')
    }
    const canonicalRoot = await resolveAuthorizedPath(root, store)
    const buffers = args.buffers ?? []
    for (const filePath of [args.filePath, ...buffers.map((buffer) => buffer.filePath)]) {
      if (!isAbsolute(filePath) || !isPathInsideOrEqual(root, filePath)) {
        throw new Error('Buffer is outside the workspace.')
      }
      const canonical = await resolveAuthorizedPath(filePath, store)
      if (!isPathInsideOrEqual(canonicalRoot, canonical)) {
        throw new Error('Buffer resolves outside the workspace.')
      }
    }
    if (signal?.aborted) {
      return { status: 'error', code: 'cancelled', message: 'Request cancelled.' }
    }
    return await getCodeIntelSidecar().query(
      method,
      { ...args, workspaceRoot: root, buffers },
      signal
    )
  } catch (error) {
    return {
      status: 'error',
      code: 'query-failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export function registerCodeIntelHandlers(store: Store): void {
  const cancellations = createSenderScopedRequestCancellations()
  for (const method of ['definition', 'references'] as const) {
    ipcMain.handle(`codeIntel:${method}`, async (event, value: unknown) => {
      if (!isTrustedUIRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
        return {
          status: 'error',
          code: 'untrusted-sender',
          message: 'Untrusted code intelligence sender.'
        }
      }
      const args = parseCodeIntelArgs(value)
      if (!args) {
        return {
          status: 'error',
          code: 'invalid-request',
          message: 'Invalid code intelligence request.'
        }
      }
      const key = String(args.requestId)
      const controller = cancellations.begin(event, key)
      try {
        return await handleCodeIntelQuery(method, args, store, controller?.signal)
      } finally {
        cancellations.finish(event, key, controller)
      }
    })
  }
  ipcMain.on('codeIntel:cancel', (event, requestId: unknown) => {
    if (
      isTrustedUIRenderer(event.sender) &&
      Number.isSafeInteger(requestId) &&
      typeof requestId === 'number'
    ) {
      cancellations.cancel(event, String(requestId))
    }
  })
  app.once('before-quit', shutdownCodeIntelSidecar)
}
