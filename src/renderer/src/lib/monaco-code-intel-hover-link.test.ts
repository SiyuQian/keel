import { expect, it, vi } from 'vitest'
import type * as monaco from 'monaco-editor'
import type { CodeIntelResult } from '../../../shared/code-intel-contract'
import type { CodeIntelCancellation } from './code-intel-client'

const fixture = vi.hoisted(() => ({ query: vi.fn(), enabled: true, version: 1 }))
vi.mock('monaco-editor', async () => ({
  CancellationTokenSource: (await import('monaco-editor/esm/vs/base/common/cancellation.js'))
    .CancellationTokenSource,
  editor: { MouseTargetType: { CONTENT_TEXT: 6 } },
  KeyCode: { Ctrl: 5, Meta: 57 },
  Range: class {
    constructor(..._args: number[]) {}
  }
}))
vi.mock('./code-intel-editor-context', () => ({
  isCodeIntelEnabled: () => fixture.enabled,
  resolveCodeIntelWorktree: () => ({
    worktreeRoot: '/repo',
    filePath: '/repo/a.ts',
    workspaceId: 'r::/repo',
    executionHostId: 'local',
    buffers: [],
    isDirty: true,
    isCurrent: () => true
  })
}))
vi.mock('./code-intel-client', () => ({ queryCodeIntel: fixture.query }))
vi.stubGlobal('navigator', { userAgent: 'Mac' })
import { installCodeIntelHoverLink } from './monaco-code-intel-hover-link'

it('cancels replaced hover work and never underlines a canceled result', async () => {
  vi.useFakeTimers()
  let move: (event: monaco.editor.IEditorMouseEvent) => void = () => {}
  let leave: () => void = () => {}
  const decorations = { set: vi.fn(), clear: vi.fn() }
  const model = {
    getLanguageId: () => 'typescript',
    getVersionId: () => fixture.version,
    getValue: () => 'const a = 1',
    getWordAtPosition: () => ({ word: 'a', startColumn: 7, endColumn: 8 })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hover installer only uses these editor members.
  const editor = {
    createDecorationsCollection: () => decorations,
    getModel: () => model,
    onMouseMove: (listener: typeof move) => {
      move = listener
      return { dispose: vi.fn() }
    },
    onMouseLeave: (listener: typeof leave) => {
      leave = listener
      return { dispose: vi.fn() }
    },
    onKeyUp: () => ({ dispose: vi.fn() })
  } as unknown as monaco.editor.IStandaloneCodeEditor
  let finish: (result: CodeIntelResult) => void = () => {}
  let cancellation: CodeIntelCancellation | undefined
  const canceled = vi.fn()
  fixture.query.mockImplementation((_method, _args, token: CodeIntelCancellation | undefined) => {
    cancellation = token
    token?.onCancellationRequested(canceled)
    return new Promise<CodeIntelResult>((resolve) => {
      finish = resolve
    })
  })
  const link = installCodeIntelHoverLink(editor)
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hover installer reads only event modifiers and target position/type.
    move({
      event: { ctrlKey: true, metaKey: true },
      target: { type: 6, position: { lineNumber: 1, column: 7 } }
    } as monaco.editor.IEditorMouseEvent)
    await vi.advanceTimersByTimeAsync(120)
    leave()
    expect(cancellation?.isCancellationRequested).toBe(true)
    expect(canceled).toHaveBeenCalledOnce()
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
    await Promise.resolve()
    expect(decorations.set).not.toHaveBeenCalled()
  } finally {
    link.dispose()
    vi.useRealTimers()
  }
})
