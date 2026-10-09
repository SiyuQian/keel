import { beforeEach, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  fixture.query.mockReset()
  fixture.enabled = true
  fixture.version = 1
})

const found: CodeIntelResult = {
  status: 'ok',
  bufferVersion: 1,
  truncated: false,
  locations: [
    {
      absolutePath: '/repo/b.ts',
      relativePath: 'b.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
    }
  ]
}

function hoverHarness() {
  let move: (event: monaco.editor.IEditorMouseEvent) => void = () => {}
  let leave: () => void = () => {}
  let keyUp: (event: monaco.IKeyboardEvent) => void = () => {}
  const decorations = { set: vi.fn(), clear: vi.fn() }
  const queries: { finish: (result: CodeIntelResult) => void; token: CodeIntelCancellation }[] = []
  const model = {
    getLanguageId: () => 'typescript',
    getVersionId: () => fixture.version,
    getValue: () => 'const word = 1',
    getWordAtPosition: (position: monaco.IPosition) =>
      position.column >= 14
        ? { word: 'next', startColumn: 14, endColumn: 18 }
        : { word: 'word', startColumn: 7, endColumn: 11 }
  }
  fixture.query.mockImplementation(
    (_method, _args, token: CodeIntelCancellation) =>
      new Promise<CodeIntelResult>((finish) => queries.push({ finish, token }))
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the installer only reads these editor members.
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
    onKeyUp: (listener: typeof keyUp) => {
      keyUp = listener
      return { dispose: vi.fn() }
    }
  } as unknown as monaco.editor.IStandaloneCodeEditor
  const link = installCodeIntelHoverLink(editor)
  return {
    link,
    queries,
    decorations,
    leave: () => leave(),
    release: () => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only reads keyCode.
      keyUp({ keyCode: 5 } as monaco.IKeyboardEvent)
    },
    move: (column = 7) => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only reads modifiers and target type/position.
      move({
        event: { ctrlKey: true, metaKey: true },
        target: { type: 6, position: { lineNumber: 1, column } }
      } as monaco.editor.IEditorMouseEvent)
    }
  }
}

it('preserves one pending query through debounce and in-flight mouse jitter on the same word', async () => {
  vi.useFakeTimers()
  const hover = hoverHarness()
  try {
    hover.move()
    await vi.advanceTimersByTimeAsync(60)
    hover.move(8)
    await vi.advanceTimersByTimeAsync(60)
    expect(hover.queries).toHaveLength(1)
    hover.move(9)
    await vi.advanceTimersByTimeAsync(120)
    expect(hover.queries).toHaveLength(1)
    expect(hover.queries[0].token.isCancellationRequested).toBe(false)
    hover.queries[0].finish(found)
    await Promise.resolve()
    expect(hover.decorations.set).toHaveBeenCalledOnce()
    hover.move(10)
    await vi.advanceTimersByTimeAsync(120)
    expect(hover.queries).toHaveLength(1)
  } finally {
    hover.link.dispose()
    vi.useRealTimers()
  }
})

it('replaces pending and underlined queries when the same word has a new model version', async () => {
  vi.useFakeTimers()
  const hover = hoverHarness()
  try {
    hover.move()
    await vi.advanceTimersByTimeAsync(120)
    fixture.version = 2
    hover.move()
    expect(hover.queries[0].token.isCancellationRequested).toBe(true)
    hover.queries[0].finish(found)
    await Promise.resolve()
    expect(hover.decorations.set).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(120)
    expect(hover.queries).toHaveLength(2)
    hover.queries[1].finish({ ...found, bufferVersion: 2 })
    await Promise.resolve()
    expect(hover.decorations.set).toHaveBeenCalledOnce()
    fixture.version = 3
    hover.move()
    await vi.advanceTimersByTimeAsync(120)
    expect(hover.queries).toHaveLength(3)
  } finally {
    hover.link.dispose()
    vi.useRealTimers()
  }
})

it('cancels work when moving to another word and accepts only the new result', async () => {
  vi.useFakeTimers()
  const hover = hoverHarness()
  try {
    hover.move()
    await vi.advanceTimersByTimeAsync(120)
    hover.move(14)
    expect(hover.queries[0].token.isCancellationRequested).toBe(true)
    await vi.advanceTimersByTimeAsync(120)
    expect(hover.queries).toHaveLength(2)
    hover.queries[0].finish(found)
    await Promise.resolve()
    expect(hover.decorations.set).not.toHaveBeenCalled()
    hover.queries[1].finish(found)
    await Promise.resolve()
    expect(hover.decorations.set).toHaveBeenCalledOnce()
  } finally {
    hover.link.dispose()
    vi.useRealTimers()
  }
})

it.each(['leave', 'release', 'dispose'] as const)(
  'cancels pending hover on %s and suppresses its late result',
  async (action) => {
    vi.useFakeTimers()
    const hover = hoverHarness()
    try {
      hover.move()
      await vi.advanceTimersByTimeAsync(120)
      if (action === 'dispose') {
        hover.link.dispose()
      } else {
        hover[action]()
      }
      expect(hover.queries[0].token.isCancellationRequested).toBe(true)
      hover.queries[0].finish(found)
      await Promise.resolve()
      expect(hover.decorations.set).not.toHaveBeenCalled()
    } finally {
      hover.link.dispose()
      vi.useRealTimers()
    }
  }
)

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
