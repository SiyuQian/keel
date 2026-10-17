import type { CodeIntelBuffer } from '../../../shared/code-intel-contract'
import type * as monaco from 'monaco-editor'

export type WorktreeContext = {
  worktreeRoot: string
  filePath: string
  workspaceId: string
  executionHostId: string
  runtimeEnvironmentId?: string | null
  connectionId?: string
  isDirty: boolean
  buffers: CodeIntelBuffer[]
  isCurrent: () => boolean
}

let worktreeResolver: (model: monaco.editor.ITextModel) => WorktreeContext | null = () => null
let enabledGetter: () => boolean = () => false

export function setCodeIntelEditorContext(
  resolver: (model: monaco.editor.ITextModel) => WorktreeContext | null,
  isEnabled: () => boolean
): void {
  worktreeResolver = resolver
  enabledGetter = isEnabled
}

export function resolveCodeIntelWorktree(model: monaco.editor.ITextModel): WorktreeContext | null {
  return worktreeResolver(model)
}

export function isCodeIntelEnabled(): boolean {
  return enabledGetter()
}
