import { beforeEach, expect, it, vi } from 'vitest'
import { URI } from 'monaco-editor/esm/vs/base/common/uri.js'
import type { OpenFile } from '@/store/slices/editor'
import { getDefaultSettings } from '../../../shared/constants'

const fixture = vi.hoisted(() => {
  const openFiles: OpenFile[] = []
  const editorDrafts: Record<string, string> = {}
  const state = {
    settings: { experimentalCodeIntelligence: true },
    openFiles,
    editorDrafts,
    activeWorktreeId: null,
    repos: [{ id: 'r', executionHostId: 'local', path: '/repo', name: 'repo' }],
    worktreesByRepo: { r: [{ id: 'r::/repo', repoId: 'r', hostId: 'local' }] },
    folderWorkspaces: [],
    detectedWorktreesByRepo: {},
    runtimeEnvironments: [],
    activeGroupIdByWorktree: {},
    openFile: vi.fn(() => ''),
    setPendingEditorReveal: vi.fn()
  }
  const opener: unknown = null
  return { state, opener, models: new Map() }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state, subscribe: vi.fn() } }))
vi.mock('monaco-editor', () => ({
  Uri: URI,
  editor: {
    getModel: (uri: URI) => fixture.models.get(uri.toString()),
    registerEditorOpener: (opener: unknown) => {
      fixture.opener = opener
    }
  },
  typescript: {
    typescriptDefaults: { modeConfiguration: {}, setModeConfiguration: vi.fn() },
    javascriptDefaults: { modeConfiguration: {}, setModeConfiguration: vi.fn() }
  }
}))
import { resolveCodeIntelContext, installCodeIntelStoreBinding } from './code-intel-store-binding'
const file: OpenFile = {
  id: '/repo/a.ts',
  filePath: '/repo/a.ts',
  relativePath: 'a.ts',
  worktreeId: 'r::/repo',
  mode: 'edit',
  language: 'typescript',
  isDirty: true
}
function model(path: string, text = '', version = 1) {
  return {
    uri: URI.parse(path),
    getValue: () => text,
    getVersionId: () => version,
    isDisposed: () => false
  }
}
beforeEach(() => {
  fixture.models.clear()
  fixture.state = {
    settings: { ...getDefaultSettings('/tmp'), experimentalCodeIntelligence: true },
    openFiles: [file],
    editorDrafts: { [file.id]: 'export const a = 1' },
    activeWorktreeId: null,
    repos: [{ id: 'r', executionHostId: 'local', path: '/repo', name: 'repo' }],
    worktreesByRepo: { r: [{ id: 'r::/repo', repoId: 'r', hostId: 'local' }] },
    folderWorkspaces: [],
    detectedWorktreesByRepo: {},
    runtimeEnvironments: [],
    activeGroupIdByWorktree: {},
    openFile: vi.fn(() => ''),
    setPendingEditorReveal: vi.fn()
  }
})
it('resolves the exact owner URI and rejects generated diff URIs', () => {
  expect(resolveCodeIntelContext(model('file:///repo/a.ts'))?.executionHostId).toBe('local')
  expect(resolveCodeIntelContext(model('file:///repo/a.ts#other-owner'))).toBeNull()
  expect(resolveCodeIntelContext(model('orca-diff:///repo/a.ts'))).toBeNull()
})
it('ships all dirty buffers in the same workspace and discards results after another edit', () => {
  const second = { ...file, id: '/repo/b.ts', filePath: '/repo/b.ts', relativePath: 'b.ts' }
  fixture.state.openFiles = [file, second]
  fixture.state.editorDrafts = {
    [file.id]: 'export const a = 1',
    [second.id]: 'import { a } from "./a"'
  }
  const context = resolveCodeIntelContext(model('file:///repo/a.ts'))
  expect(context?.buffers.map((buffer) => buffer.filePath)).toEqual(['/repo/a.ts', '/repo/b.ts'])
  expect(context?.isCurrent()).toBe(true)
  fixture.state.editorDrafts = { ...fixture.state.editorDrafts, [second.id]: 'changed' }
  expect(context?.isCurrent()).toBe(false)
})
it('opens a cross-file target through the existing editor action and reveals its exact position', () => {
  const openFile = vi.fn(() => '/repo/b.ts')
  const reveal = vi.fn()
  fixture.state.openFile = openFile
  fixture.state.setPendingEditorReveal = reveal
  fixture.state.activeGroupIdByWorktree = {}
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0)
    return 1
  })
  installCodeIntelStoreBinding()
  const opener = fixture.opener
  if (
    !opener ||
    typeof opener !== 'object' ||
    !('openCodeEditor' in opener) ||
    typeof opener.openCodeEditor !== 'function'
  ) {
    throw new Error('Missing editor opener')
  }
  expect(
    opener.openCodeEditor({ getModel: () => model('file:///repo/a.ts') }, URI.file('/repo/b.ts'), {
      lineNumber: 3,
      column: 7
    })
  ).toBe(true)
  expect(openFile).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: '/repo/b.ts', worktreeId: 'r::/repo', mode: 'edit' }),
    expect.objectContaining({ suppressActiveRuntimeFallback: true })
  )
  expect(reveal).toHaveBeenLastCalledWith({
    filePath: '/repo/b.ts',
    fileId: '/repo/b.ts',
    line: 3,
    column: 7,
    matchLength: 0
  })
  vi.unstubAllGlobals()
})

it('excludes dirty buffers from a different workspace even on the same host', () => {
  const other = { ...file, id: '/other/a.ts', filePath: '/other/a.ts', worktreeId: 'r::/other' }
  fixture.state.openFiles = [file, other]
  fixture.state.editorDrafts = { [file.id]: 'export const a = 1', [other.id]: 'secret' }
  expect(
    resolveCodeIntelContext(model('file:///repo/a.ts'))?.buffers.map((buffer) => buffer.filePath)
  ).toEqual(['/repo/a.ts'])
})
