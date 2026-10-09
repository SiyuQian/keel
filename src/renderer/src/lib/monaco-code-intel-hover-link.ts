import * as monaco from 'monaco-editor'
import { isOkResult } from '../../../shared/code-intel-contract'
import { resolveCodeIntelWorktree, isCodeIntelEnabled } from './code-intel-editor-context'
import { queryCodeIntel } from './code-intel-client'
import { buildReferenceRequest } from './monaco-code-intel-providers'

// Monaco's standalone hover cannot underline targets without an open preview model.

const QUERY_DEBOUNCE_MS = 120
const SUPPORTED_LANGUAGES = new Set(['typescript', 'javascript'])

const isMac = navigator.userAgent.includes('Mac')

function modifierHeld(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}

function wordKey(line: number, word: monaco.editor.IWordAtPosition): string {
  return `${line}:${word.startColumn}-${word.endColumn}`
}

export function installCodeIntelHoverLink(
  editor: monaco.editor.IStandaloneCodeEditor
): monaco.IDisposable {
  const decorations = editor.createDecorationsCollection([])
  let activeKey: string | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Bumped to invalidate any in-flight async query whose result is now stale.
  let queryToken = 0
  let cancellation: monaco.CancellationTokenSource | null = null

  function clearLink(): void {
    if (activeKey === null) {
      return
    }
    activeKey = null
    decorations.clear()
  }

  function cancelPending(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    queryToken += 1
    cancellation?.cancel()
    cancellation?.dispose()
    cancellation = null
  }

  function underline(line: number, word: monaco.editor.IWordAtPosition, key: string): void {
    activeKey = key
    decorations.set([
      {
        range: new monaco.Range(line, word.startColumn, line, word.endColumn),
        options: { inlineClassName: 'code-intel-definition-link' }
      }
    ])
  }

  function evaluate(line: number, word: monaco.editor.IWordAtPosition): void {
    const key = wordKey(line, word)
    if (key === activeKey) {
      // Already underlined this exact word — nothing to do.
      return
    }
    cancelPending()
    const model = editor.getModel()
    if (!model) {
      return
    }
    const ctx = resolveCodeIntelWorktree(model)
    if (!ctx) {
      clearLink()
      return
    }
    const token = queryToken
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const source = new monaco.CancellationTokenSource()
      cancellation = source
      const args = buildReferenceRequest({
        ...ctx,
        worktreeRoot: ctx.worktreeRoot,
        filePath: ctx.filePath,
        monacoPosition: { lineNumber: line, column: word.startColumn },
        bufferText: model.getValue(),
        bufferVersion: model.getVersionId(),
        connectionId: ctx.connectionId,
        isDirty: ctx.isDirty
      })
      void queryCodeIntel('definition', args, source.token).then((result) => {
        if (
          token !== queryToken ||
          !isCodeIntelEnabled() ||
          !ctx.isCurrent() ||
          model.getVersionId() !== args.bufferVersion
        ) {
          return
        }
        if (isOkResult(result) && result.locations.length > 0) {
          underline(line, word, key)
        } else {
          clearLink()
        }
      })
    }, QUERY_DEBOUNCE_MS)
  }

  const moveSub = editor.onMouseMove((e) => {
    if (!isCodeIntelEnabled() || !modifierHeld(e.event)) {
      cancelPending()
      clearLink()
      return
    }
    const model = editor.getModel()
    if (!model || !SUPPORTED_LANGUAGES.has(model.getLanguageId())) {
      cancelPending()
      clearLink()
      return
    }
    const position = e.target.position
    if (!position || e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) {
      cancelPending()
      clearLink()
      return
    }
    const word = model.getWordAtPosition(position)
    if (!word) {
      cancelPending()
      clearLink()
      return
    }
    evaluate(position.lineNumber, word)
  })

  const leaveSub = editor.onMouseLeave(() => {
    cancelPending()
    clearLink()
  })

  // Why: drop the link as soon as the modifier is released, even without mouse
  // movement, so the affordance does not linger after the user lets go.
  const keyUpSub = editor.onKeyUp((e) => {
    if (e.keyCode === monaco.KeyCode.Ctrl || e.keyCode === monaco.KeyCode.Meta) {
      cancelPending()
      clearLink()
    }
  })

  return {
    dispose(): void {
      cancelPending()
      moveSub.dispose()
      leaveSub.dispose()
      keyUpSub.dispose()
      decorations.clear()
    }
  }
}
