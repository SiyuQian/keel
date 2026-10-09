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
import { queryCodeIntel } from './code-intel-client'
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
  expect(context?.buffers.map((buffer) => buffer.filePath)).toEqual(['/repo/b.ts'])
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
  ).toEqual([])
})

it('reuses an open Windows target without changing its drive spelling', () => {
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0)
    return 1
  })
  const source = { ...file, id: 'a', filePath: 'C:/repo/a.ts', worktreeId: 'r::C:/repo' }
  const target = { ...source, id: 'b', filePath: 'C:/repo/b.ts' }
  fixture.state.openFiles = [source, target]
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
    opener.openCodeEditor(
      { getModel: () => model('file:///c%3A/repo/a.ts') },
      URI.file('C:/repo/b.ts')
    )
  ).toBe(true)
  expect(fixture.state.openFile).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: target.filePath }),
    expect.anything()
  )
  vi.unstubAllGlobals()
})

it('analyzes a clean open target model and rejects its result after a reload', () => {
  const second = { ...file, id: '/repo/b.ts', filePath: '/repo/b.ts', isDirty: false }
  fixture.state.openFiles = [file, second]
  let version = 1
  fixture.models.set(URI.file(second.filePath).toString(), {
    getValue: () => 'export const b = 1',
    getVersionId: () => version,
    isDisposed: () => false
  })
  const context = resolveCodeIntelContext(model('file:///repo/a.ts'))
  expect(context?.buffers).toEqual([
    { filePath: second.filePath, text: 'export const b = 1', version: 1 }
  ])
  version = 2
  expect(context?.isCurrent()).toBe(false)
})

it('navigates with unrelated large clean files without sending their snapshots', async () => {
  const unrelated = ['pnpm-lock.yaml', 'README.md', 'app.css', 'output.log'].map((name) => ({
    ...file,
    id: `/repo/${name}`,
    filePath: `/repo/${name}`,
    isDirty: false
  }))
  fixture.state.openFiles = [file, ...unrelated]
  const read = vi.fn(() => 'x'.repeat(4_000_001))
  for (const candidate of unrelated) {
    fixture.models.set(URI.file(candidate.filePath).toString(), {
      getValue: read,
      getVersionId: () => 1,
      isDisposed: () => false
    })
  }
  const context = resolveCodeIntelContext(model('file:///repo/a.ts'))
  expect(context?.buffers).toHaveLength(0)
  const definition = vi.fn().mockResolvedValue({ status: 'ok', locations: [], truncated: false })
  vi.stubGlobal('window', { api: { codeIntel: { definition } } })
  try {
    expect(
      await queryCodeIntel('definition', {
        workspaceId: 'r::/repo',
        workspaceRoot: '/repo',
        executionHostId: 'local',
        filePath: file.filePath,
        relativePath: file.relativePath,
        position: { line: 0, character: 0 },
        bufferVersion: 1,
        bufferText: 'export const a = 1',
        buffers: context?.buffers
      })
    ).toMatchObject({ status: 'ok' })
    expect(definition).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})

it.each([
  { text: '// config\n{ "compilerOptions": {} }', dirty: false, draft: false },
  { text: '', dirty: true, draft: false },
  { text: 'not valid JSON', dirty: true, draft: false },
  { text: '', dirty: false, draft: true }
])(
  'retains nonstandard config input $text (dirty: $dirty, draft: $draft)',
  ({ text, dirty, draft }) => {
    const candidate = { ...file, id: '/repo/base.txt', filePath: '/repo/base.txt', isDirty: dirty }
    fixture.state.openFiles = [file, candidate]
    if (draft) {
      fixture.state.editorDrafts[candidate.id] = text
    } else {
      fixture.models.set(
        URI.file(candidate.filePath).toString(),
        model(candidate.filePath, text, 2)
      )
    }
    expect(resolveCodeIntelContext(model('file:///repo/a.ts'))?.buffers).toEqual([
      { filePath: candidate.filePath, text, version: draft ? 0 : 2 }
    ])
  }
)

it.each(['b.tsx', 'b.mts', 'b.cjs', 'data.json', 'package.json', 'config/app.json', 'base.jsonc'])(
  'preserves clean and draft-only semantic snapshots for %s',
  (name) => {
    const candidate = { ...file, id: `/repo/${name}`, filePath: `/repo/${name}`, isDirty: false }
    fixture.state.openFiles = [file, candidate]
    fixture.models.set(
      URI.file(candidate.filePath).toString(),
      model(candidate.filePath, 'model text', 2)
    )
    const context = resolveCodeIntelContext(model('file:///repo/a.ts'))
    expect(context?.buffers).toEqual([
      { filePath: candidate.filePath, text: 'model text', version: 2 }
    ])
    fixture.models.clear()
    fixture.state.editorDrafts[candidate.id] = 'unsaved draft'
    expect(resolveCodeIntelContext(model('file:///repo/a.ts'))?.buffers).toEqual([
      { filePath: candidate.filePath, text: 'unsaved draft', version: 0 }
    ])
  }
)

it('keeps relevant clean snapshots when their budget is exceeded instead of querying stale disk text', async () => {
  const candidate = {
    ...file,
    id: '/repo/large.json',
    filePath: '/repo/large.json',
    isDirty: false
  }
  fixture.state.openFiles = [file, candidate]
  fixture.models.set(
    URI.file(candidate.filePath).toString(),
    model(candidate.filePath, ' '.repeat(4_000_001), 2)
  )
  const context = resolveCodeIntelContext(model('file:///repo/a.ts'))
  expect(context?.buffers.map((buffer) => [buffer.filePath, buffer.text.length])).toEqual([
    ['/repo/large.json', 4_000_001]
  ])
  const definition = vi.fn()
  vi.stubGlobal('window', { api: { codeIntel: { definition } } })
  try {
    expect(
      await queryCodeIntel('definition', {
        workspaceId: 'r::/repo',
        workspaceRoot: '/repo',
        executionHostId: 'local',
        filePath: file.filePath,
        relativePath: file.relativePath,
        position: { line: 0, character: 0 },
        bufferVersion: 1,
        bufferText: 'export const a = 1',
        buffers: context?.buffers
      })
    ).toMatchObject({ code: 'buffer-limit' })
    expect(definition).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})
