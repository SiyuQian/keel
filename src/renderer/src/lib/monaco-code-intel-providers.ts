import { relativePathInsideRoot } from '../../../shared/cross-platform-path'
import { toEditorModelUri } from '@/components/editor/editor-model-uri'
import type { WorktreeContext } from './code-intel-editor-context'
import * as monaco from 'monaco-editor'
import { isOkResult, type CodeIntelResult } from '../../../shared/code-intel-contract'
import { queryCodeIntel, type CodeIntelClientArgs } from './code-intel-client'
import { notifyCodeIntelResult } from './code-intel-result-toast'

const LANGUAGES = ['typescript', 'javascript'] as const

export type RequestContext = Omit<WorktreeContext, 'isCurrent' | 'isDirty' | 'buffers'> & {
  monacoPosition: { lineNumber: number; column: number }
  bufferText: string
  bufferVersion: number
  isDirty?: boolean
  buffers?: WorktreeContext['buffers']
}
export type WorktreeResolver = (model: monaco.editor.ITextModel) => WorktreeContext | null

export function buildReferenceRequest(ctx: RequestContext): CodeIntelClientArgs {
  return {
    filePath: ctx.filePath,
    relativePath: toPosixRelative(ctx.worktreeRoot, ctx.filePath),
    position: { line: ctx.monacoPosition.lineNumber - 1, character: ctx.monacoPosition.column - 1 },
    bufferVersion: ctx.bufferVersion,
    bufferText: ctx.bufferText,
    connectionId: ctx.connectionId,
    workspaceRoot: ctx.worktreeRoot,
    workspaceId: ctx.workspaceId,
    executionHostId: ctx.executionHostId,
    runtimeEnvironmentId: ctx.runtimeEnvironmentId,
    buffers: ctx.buffers
  }
}

// Why: the buffer can change while the async query runs. A result computed
// against an older version has ranges at shifted offsets, so it must be
// discarded rather than applied to the now-current document.
export function isStaleResult(result: CodeIntelResult, currentBufferVersion: number): boolean {
  return isOkResult(result) && result.bufferVersion !== currentBufferVersion
}

export function toMonacoLocations(
  result: CodeIntelResult,
  ownerKey = ''
): monaco.languages.Location[] {
  if (!isOkResult(result)) {
    return []
  }
  return result.locations.map((loc) => ({
    // Why: open the absolute path the language service resolved. Reconstructing
    // from the worktree root breaks when the project root (nearest tsconfig) is
    // a subdirectory of the worktree, as in monorepos.
    uri: monaco.Uri.parse(toEditorModelUri(loc.absolutePath, ownerKey)),
    range: new monaco.Range(
      loc.range.start.line + 1,
      loc.range.start.character + 1,
      loc.range.end.line + 1,
      loc.range.end.character + 1
    )
  }))
}

function toPosixRelative(root: string, filePath: string): string {
  return relativePathInsideRoot(root, filePath) ?? filePath
}

let registered = false

export function registerCodeIntelProviders(
  resolveWorktree: WorktreeResolver,
  isEnabled: () => boolean
): void {
  if (registered) {
    return
  }
  registered = true

  for (const language of LANGUAGES) {
    monaco.languages.registerDocumentHighlightProvider(language, {
      provideDocumentHighlights: (model, position) => {
        if (!isEnabled()) {
          return []
        }
        const range = getImportStringRange(model, position)
        if (range) {
          return [{ range, kind: monaco.languages.DocumentHighlightKind.Text }]
        }
        return []
      }
    })

    monaco.languages.registerDefinitionProvider(language, {
      provideDefinition: async (model, position, token) => {
        if (!isEnabled()) {
          return []
        }
        const ctx = resolveWorktree(model)
        if (!ctx) {
          return []
        }
        const result = await queryCodeIntel('definition', buildArgs(ctx, model, position), token)
        notifyCodeIntelResult(result)
        if (
          token.isCancellationRequested ||
          !isEnabled() ||
          !ctx.isCurrent() ||
          isStaleResult(result, model.getVersionId())
        ) {
          return []
        }
        return toMonacoLocations(result, model.uri.fragment)
      }
    })

    monaco.languages.registerReferenceProvider(language, {
      provideReferences: async (model, position, _context, token) => {
        if (!isEnabled()) {
          return []
        }
        const ctx = resolveWorktree(model)
        if (!ctx) {
          return []
        }
        const result = await queryCodeIntel('references', buildArgs(ctx, model, position), token)
        notifyCodeIntelResult(result)
        if (
          token.isCancellationRequested ||
          !isEnabled() ||
          !ctx.isCurrent() ||
          isStaleResult(result, model.getVersionId())
        ) {
          return []
        }
        return toMonacoLocations(result, model.uri.fragment)
      }
    })
  }
}

function buildArgs(
  ctx: WorktreeContext,
  model: monaco.editor.ITextModel,
  position: monaco.Position
): CodeIntelClientArgs {
  return buildReferenceRequest({
    worktreeRoot: ctx.worktreeRoot,
    filePath: ctx.filePath,
    monacoPosition: { lineNumber: position.lineNumber, column: position.column },
    bufferText: model.getValue(),
    bufferVersion: model.getVersionId(),
    connectionId: ctx.connectionId,
    workspaceId: ctx.workspaceId,
    executionHostId: ctx.executionHostId,
    runtimeEnvironmentId: ctx.runtimeEnvironmentId,
    buffers: ctx.buffers,
    isDirty: ctx.isDirty
  })
}

export function getImportStringRange(
  model: Pick<monaco.editor.ITextModel, 'getLineContent'>,
  position: Pick<monaco.Position, 'lineNumber' | 'column'>
): monaco.Range | null {
  const line = model.getLineContent(position.lineNumber)
  const lineNum = position.lineNumber
  const col = position.column - 1

  const trimmed = line.trimStart()
  if (!trimmed.startsWith('import ') && !trimmed.startsWith('import(')) {
    return null
  }

  const fromMatch = line.match(/\bfrom\s+(['"])/)
  if (fromMatch) {
    const quoteChar = fromMatch[1]
    const quotePos = line.indexOf(quoteChar, fromMatch.index!)
    const closePos = line.indexOf(quoteChar, quotePos + 1)
    if (closePos === -1) {
      return null
    }
    if (col > quotePos && col < closePos) {
      return new monaco.Range(lineNum, quotePos + 2, lineNum, closePos + 1)
    }
    return null
  }

  const bareMatch = line.match(/^import\s+(['"])/)
  if (bareMatch) {
    const quoteChar = bareMatch[1]
    const quotePos = line.indexOf(quoteChar, bareMatch.index!)
    const closePos = line.indexOf(quoteChar, quotePos + 1)
    if (closePos === -1) {
      return null
    }
    if (col > quotePos && col < closePos) {
      return new monaco.Range(lineNum, quotePos + 2, lineNum, closePos + 1)
    }
  }

  return null
}
