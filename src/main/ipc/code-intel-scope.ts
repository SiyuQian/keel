import { z } from 'zod'
import { resolve } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import {
  isLocalExecutionHost,
  resolveAgentWorkspaceExecutionHostId
} from '../agent-hooks/restored-subagent-liveness-sweep'
import {
  CODE_INTEL_MAX_BUFFERS,
  CODE_INTEL_MAX_BUFFER_TEXT,
  CODE_INTEL_MAX_TOTAL_TEXT,
  type CodeIntelIpcArgs
} from '../../shared/code-intel-contract'

const text = z.string().max(CODE_INTEL_MAX_BUFFER_TEXT)
const path = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => !value.includes('\0'))
const integer = z.number().int().nonnegative().safe()
const schema = z
  .object({
    filePath: path,
    relativePath: z.string().max(32_768),
    position: z.object({ line: integer, character: integer }),
    bufferVersion: integer,
    bufferText: text.optional(),
    buffers: z
      .array(z.object({ filePath: path, text, version: integer }))
      .max(CODE_INTEL_MAX_BUFFERS)
      .optional(),
    workspaceRoot: path,
    workspaceId: path,
    executionHostId: path,
    runtimeEnvironmentId: z.string().max(1024).nullable().optional(),
    connectionId: z.string().max(1024).optional(),
    requestId: integer
  })
  .refine(
    (value) =>
      (value.buffers?.reduce((sum, buffer) => sum + buffer.text.length, 0) ?? 0) +
        (value.bufferText?.length ?? 0) <=
      CODE_INTEL_MAX_TOTAL_TEXT
  )
export function parseCodeIntelArgs(value: unknown): CodeIntelIpcArgs | null {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}
type Owner = { connectionId?: string | null; executionHostId?: string | null }
type ScopeStore = {
  getWorktreeMeta: (worktreeId: string) => { hostId?: string | null } | null | undefined
  repos: readonly (Owner & { id: string })[]
  folderWorkspaces: readonly (Owner & { id: string; folderPath: string; projectGroupId: string })[]
  projectGroups: readonly (Owner & { id: string })[]
}
function local(owner: Owner): boolean {
  return !owner.connectionId && (!owner.executionHostId || owner.executionHostId === 'local')
}
export function resolveCodeIntelWorkspace(
  store: ScopeStore,
  args: CodeIntelIpcArgs
): string | null {
  if (args.executionHostId !== 'local' || args.runtimeEnvironmentId || args.connectionId) {
    return null
  }
  const host = resolveAgentWorkspaceExecutionHostId(args.workspaceId, {
    getRepo: (id) => {
      const candidates = store.repos.filter((row) => row.id === id)
      return candidates.length === 1 ? candidates[0] : null
    },
    getWorktreeMeta: store.getWorktreeMeta,
    getFolderWorkspace: (id) => {
      const candidates = store.folderWorkspaces.filter((row) => row.id === id)
      return candidates.length === 1 ? candidates[0] : null
    },
    getProjectGroups: () => store.projectGroups
  })
  if (!isLocalExecutionHost(host)) {
    return null
  }
  let root: string | undefined
  const scope = parseWorkspaceKey(args.workspaceId)
  if (scope?.type === 'folder') {
    const candidates = store.folderWorkspaces.filter((row) => row.id === scope.folderWorkspaceId)
    const folder = candidates.length === 1 ? candidates[0] : undefined
    const group = folder && store.projectGroups.find((row) => row.id === folder.projectGroupId)
    if (!folder || !local(folder) || !group || !local(group)) {
      return null
    }
    root = folder.folderPath
  } else {
    const id = splitWorktreeIdForFilesystem(
      scope?.type === 'worktree' ? scope.worktreeId : args.workspaceId
    )
    if (!id) {
      return null
    }
    const candidates = store.repos.filter((row) => row.id === id.repoId)
    if (candidates.length !== 1 || !local(candidates[0])) {
      return null
    }
    root = id.worktreePath
  }
  return normalizeRuntimePathForComparison(resolve(root)) ===
    normalizeRuntimePathForComparison(args.workspaceRoot ?? '')
    ? resolve(root)
    : null
}
