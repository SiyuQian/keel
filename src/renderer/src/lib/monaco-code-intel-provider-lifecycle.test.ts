import { expect, it, vi } from 'vitest'
import type * as monaco from 'monaco-editor'
import type { WorktreeContext } from './code-intel-editor-context'
import type { CodeIntelResult } from '../../../shared/code-intel-contract'

const fixture = vi.hoisted(() => ({
  definitions: new Map<string, monaco.languages.DefinitionProvider>(),
  references: new Map<string, monaco.languages.ReferenceProvider>(),
  query: vi.fn()
}))
vi.mock('monaco-editor', () => ({
  languages: {
    registerDocumentHighlightProvider: vi.fn(),
    registerDefinitionProvider: (language: string, provider: monaco.languages.DefinitionProvider) =>
      fixture.definitions.set(language, provider),
    registerReferenceProvider: (language: string, provider: monaco.languages.ReferenceProvider) =>
      fixture.references.set(language, provider)
  }
}))
vi.mock('./code-intel-client', () => ({ queryCodeIntel: fixture.query }))
vi.mock('./code-intel-result-toast', () => ({ notifyCodeIntelResult: vi.fn() }))
import { registerCodeIntelProviders } from './monaco-code-intel-providers'

it('gates navigation and discards canceled hover, owner, model and disabled results', async () => {
  let enabled = false
  let current = true
  let version = 1
  const context: WorktreeContext = {
    filePath: '/repo/a.ts',
    worktreeRoot: '/repo',
    workspaceId: 'r::/repo',
    executionHostId: 'local',
    isDirty: false,
    buffers: [],
    isCurrent: () => current
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: providers only use these model members; no editor bundle runs in this test.
  const model = {
    uri: { fragment: '' },
    getValue: () => 'const a = 1',
    getVersionId: () => version
  } as monaco.editor.ITextModel
  const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() }
  registerCodeIntelProviders(
    () => context,
    () => enabled
  )
  const definition = fixture.definitions.get('typescript')
  const references = fixture.references.get('typescript')
  if (!definition || !references) {
    throw new Error('Missing providers')
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: providers read only lineNumber and column.
  const position = { lineNumber: 1, column: 7 } as monaco.Position
  expect(await definition.provideDefinition(model, position, token)).toEqual([])
  expect(
    await references.provideReferences(model, position, { includeDeclaration: true }, token)
  ).toEqual([])
  expect(fixture.query).not.toHaveBeenCalled()
  for (const invalidate of [
    () => {
      token.isCancellationRequested = true
    },
    () => {
      current = false
    },
    () => {
      version = 2
    },
    () => {
      enabled = false
    }
  ]) {
    enabled = true
    current = true
    version = 1
    token.isCancellationRequested = false
    let finish: (value: CodeIntelResult) => void = () => {}
    fixture.query.mockImplementation(
      () =>
        new Promise<CodeIntelResult>((resolve) => {
          finish = resolve
        })
    )
    const pending = definition.provideDefinition(model, position, token)
    expect(fixture.query).toHaveBeenLastCalledWith(
      'definition',
      expect.objectContaining({ bufferText: 'const a = 1', bufferVersion: 1 }),
      token
    )
    invalidate()
    finish({
      status: 'ok',
      bufferVersion: 1,
      locations: [
        {
          absolutePath: '/repo/b.ts',
          relativePath: 'b.ts',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
        }
      ],
      truncated: false
    })
    expect(await pending).toEqual([])
  }
})
