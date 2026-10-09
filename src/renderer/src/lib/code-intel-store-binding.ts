import * as monaco from 'monaco-editor'
import { createScanner } from 'jsonc-parser'
import { useAppStore } from '@/store'
import { getEditorModelOwnerKey } from '@/components/editor/editor-model-owner'
import { toEditorModelUri } from '@/components/editor/editor-model-uri'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { relativePathInsideRoot } from '../../../shared/cross-platform-path'
import { detectLanguage } from './language-detect'
import { scheduleEditorLineReveal } from '@/store/slices/editor/focus/editor-focus-reveal'
import { setCodeIntelEditorContext, type WorktreeContext } from './code-intel-editor-context'
import { setTypeScriptNavigationMode } from './monaco-typescript-navigation-mode'
import { basename } from './path'

export function resolveCodeIntelContext(
  model: Pick<monaco.editor.ITextModel, 'uri' | 'isDisposed'>
): WorktreeContext | null {
  const state = useAppStore.getState()
  const file = state.openFiles.find(
    (file) =>
      file.mode === 'edit' &&
      toEditorModelUri(file.filePath, getEditorModelOwnerKey(file, state)) === model.uri.toString()
  )
  if (!file) {
    return null
  }
  const owner = getEditorModelOwnerKey(file, state)
  const scope = parseWorkspaceKey(file.worktreeId)
  const folder =
    scope?.type === 'folder'
      ? state.folderWorkspaces.find(
          (folder) =>
            folder.id === scope.folderWorkspaceId &&
            (owner !== '' || (folder.executionHostId ?? 'local') === 'local')
        )
      : null
  const root = folder?.folderPath ?? splitWorktreeIdForFilesystem(file.worktreeId)?.worktreePath
  if (!root) {
    return null
  }
  const buffers: WorktreeContext['buffers'] = []
  const snapshots: (() => boolean)[] = []
  for (const candidate of state.openFiles) {
    if (
      candidate.mode !== 'edit' ||
      candidate.id === file.id ||
      candidate.worktreeId !== file.worktreeId ||
      getEditorModelOwnerKey(candidate, state) !== owner
    ) {
      continue
    }
    if (relativePathInsideRoot(root, candidate.filePath) === null) {
      continue
    }
    const bufferModel = monaco.editor.getModel(
      monaco.Uri.parse(toEditorModelUri(candidate.filePath, owner))
    )
    if (!bufferModel && !candidate.isDirty && state.editorDrafts[candidate.id] === undefined) {
      continue
    }
    const text = bufferModel?.getValue() ?? state.editorDrafts[candidate.id]
    if (text === undefined) {
      continue
    }
    const language = detectLanguage(candidate.filePath)
    // Config extends accepts arbitrary filenames; unsaved malformed inputs must never fall back to disk.
    if (
      !candidate.isDirty &&
      state.editorDrafts[candidate.id] === undefined &&
      language !== 'typescript' &&
      language !== 'javascript' &&
      language !== 'json'
    ) {
      const scanner = createScanner(text, true)
      scanner.scan()
      if (text[scanner.getTokenOffset()] !== '{') {
        continue
      }
    }
    const version = bufferModel?.getVersionId() ?? 0
    buffers.push({ filePath: candidate.filePath, text, version })
    snapshots.push(() =>
      bufferModel
        ? !bufferModel.isDisposed() && bufferModel.getVersionId() === version
        : useAppStore.getState().editorDrafts[candidate.id] === text
    )
  }
  const files = state.openFiles
  const drafts = state.editorDrafts
  return {
    worktreeRoot: root,
    filePath: file.filePath,
    workspaceId: file.worktreeId,
    executionHostId: owner === '' ? 'local' : 'unresolved',
    runtimeEnvironmentId: file.runtimeEnvironmentId,
    isDirty: file.isDirty,
    buffers,
    isCurrent: () => {
      const current = useAppStore.getState()
      return (
        !model.isDisposed() &&
        current.settings?.experimentalCodeIntelligence === true &&
        current.openFiles === files &&
        current.editorDrafts === drafts &&
        getEditorModelOwnerKey(file, current) === owner &&
        snapshots.every((check) => check())
      )
    }
  }
}
let installed = false
export function installCodeIntelStoreBinding(): void {
  if (installed) {
    return
  }
  installed = true
  const enabled = (): boolean =>
    useAppStore.getState().settings?.experimentalCodeIntelligence === true
  setCodeIntelEditorContext(resolveCodeIntelContext, enabled)
  setTypeScriptNavigationMode(enabled())
  useAppStore.subscribe((state, previous) => {
    if (
      state.settings?.experimentalCodeIntelligence !==
      previous.settings?.experimentalCodeIntelligence
    ) {
      setTypeScriptNavigationMode(enabled())
    }
  })
  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selection) {
      if (!enabled()) {
        return false
      }
      const model = source.getModel()
      const context = model && resolveCodeIntelContext(model)
      if (!context || context.executionHostId !== 'local') {
        return false
      }
      if (model.uri.toString() === resource.toString()) {
        return false
      }
      const state = useAppStore.getState()
      const sourceFile = state.openFiles.find(
        (file) =>
          file.mode === 'edit' &&
          toEditorModelUri(file.filePath, getEditorModelOwnerKey(file, state)) ===
            model.uri.toString()
      )
      if (!sourceFile || resource.scheme !== 'file' || resource.fragment !== model.uri.fragment) {
        return false
      }
      const target =
        state.openFiles.find(
          (file) =>
            file.mode === 'edit' &&
            file.worktreeId === sourceFile.worktreeId &&
            toEditorModelUri(file.filePath, getEditorModelOwnerKey(file, state)) ===
              resource.toString()
        )?.filePath ?? resource.fsPath
      const fileId = state.openFile(
        {
          filePath: target,
          relativePath: relativePathInsideRoot(context.worktreeRoot, target) ?? basename(target),
          worktreeId: sourceFile.worktreeId,
          runtimeEnvironmentId: null,
          language: detectLanguage(target),
          mode: 'edit'
        },
        {
          preview: true,
          targetGroupId: state.activeGroupIdByWorktree[sourceFile.worktreeId],
          recordReplacedPreview: true,
          suppressActiveRuntimeFallback: true
        }
      )
      const line =
        selection &&
        ('startLineNumber' in selection ? selection.startLineNumber : selection.lineNumber)
      const column =
        selection && ('startColumn' in selection ? selection.startColumn : selection.column)
      scheduleEditorLineReveal(useAppStore.getState, target, line ?? 1, column ?? 1, fileId)
      return true
    }
  })
}
