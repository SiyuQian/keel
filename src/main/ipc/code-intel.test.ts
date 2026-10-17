import { beforeEach, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import { getDefaultSettings } from '../../shared/constants'
const { query, authorize, handlers } = vi.hoisted(() => ({
  query: vi.fn(),
  authorize: vi.fn(async (path: string) => path),
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))
vi.mock('electron', () => ({
  app: { once: vi.fn() },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler),
    on: vi.fn()
  }
}))
vi.mock('../code-intel/sidecar-client', () => ({
  getCodeIntelSidecar: () => ({ query }),
  shutdownCodeIntelSidecar: vi.fn()
}))
vi.mock('./filesystem-auth', () => ({ resolveAuthorizedPath: authorize }))
vi.mock('./ui', () => ({ isTrustedUIRenderer: (sender: { id: number }) => sender.id === 1 }))
import { handleCodeIntelQuery, registerCodeIntelHandlers } from './code-intel'
const args = {
  workspaceId: 'folder:f',
  workspaceRoot: '/repo',
  executionHostId: 'local',
  filePath: '/repo/a.ts',
  relativePath: 'a.ts',
  position: { line: 0, character: 0 },
  bufferVersion: 1,
  requestId: 1
}
const folder = {
  id: 'f',
  folderPath: '/repo',
  projectGroupId: 'g',
  name: 'f',
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  createdAt: 0,
  updatedAt: 0
}
const storeInput = {
  getSettings: () => ({ ...getDefaultSettings('/tmp'), experimentalCodeIntelligence: true }),
  getRepos: () => [],
  getFolderWorkspaces: () => [folder],
  getProjectGroups: () => [{ id: 'g' }],
  getWorktreeMeta: () => undefined
}
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the filesystem boundary is mocked; the handler only calls the supplied Store methods.
const store = storeInput as unknown as Store
beforeEach(() => {
  vi.restoreAllMocks()
  query.mockClear()
  authorize.mockClear()
  query.mockResolvedValue({ status: 'ok', bufferVersion: 1, locations: [], truncated: false })
})
it('rejects remote/runtime targets before local filesystem authorization', async () => {
  for (const remote of [
    { executionHostId: 'ssh:remote' },
    { runtimeEnvironmentId: 'peer' },
    { connectionId: 'ssh' }
  ]) {
    expect(await handleCodeIntelQuery('definition', { ...args, ...remote }, store)).toMatchObject({
      status: 'unsupported',
      reason: 'remote-runtime'
    })
  }
  expect(authorize).not.toHaveBeenCalled()
  expect(query).not.toHaveBeenCalled()
})
it('rejects outside-workspace queries and overlays before analysis', async () => {
  expect(
    await handleCodeIntelQuery('definition', { ...args, filePath: '/secret/a.ts' }, store)
  ).toMatchObject({ status: 'error' })
  expect(
    await handleCodeIntelQuery(
      'definition',
      { ...args, buffers: [{ filePath: '/secret/b.ts', text: '', version: 1 }] },
      store
    )
  ).toMatchObject({ status: 'error' })
  expect(query).not.toHaveBeenCalled()
})
it('does no work when the experiment is disabled', async () => {
  vi.spyOn(store, 'getSettings').mockReturnValue(getDefaultSettings('/tmp'))
  expect(await handleCodeIntelQuery('definition', args, store)).toMatchObject({
    status: 'unsupported',
    reason: 'disabled'
  })
  expect(query).not.toHaveBeenCalled()
  expect(authorize).not.toHaveBeenCalled()
})
it('rejects subframes and untrusted windows', async () => {
  registerCodeIntelHandlers(store)
  const handler = handlers.get('codeIntel:definition')
  if (!handler) {
    throw new Error('Missing handler')
  }
  expect(await handler({ sender: { id: 2 } }, args)).toMatchObject({ code: 'untrusted-sender' })
  expect(await handler({ sender: { id: 1, mainFrame: {} }, senderFrame: {} }, args)).toMatchObject({
    code: 'untrusted-sender'
  })
  expect(query).not.toHaveBeenCalled()
})

it('rejects symlink destinations outside the canonical workspace', async () => {
  authorize.mockImplementation(async (path: string) =>
    path === '/repo/a.ts' ? '/outside/a.ts' : path
  )
  expect(await handleCodeIntelQuery('definition', args, store)).toMatchObject({ status: 'error' })
  expect(query).not.toHaveBeenCalled()
  authorize.mockImplementation(async (path: string) => path)
})
