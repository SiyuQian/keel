import { z } from 'zod'
import { resolve } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import type { CodeIntelIpcArgs } from '../../shared/code-intel-contract'

const text = z.string().max(4_000_000)
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
      .max(64)
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
      8_000_000
  )
export function parseCodeIntelArgs(value: unknown): CodeIntelIpcArgs | null {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}
type Owner = { connectionId?: string | null; executionHostId?: string | null }
type ScopeStore = {
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
  let root: string | undefined
  if (args.workspaceId.startsWith('folder:')) {
    const candidates = store.folderWorkspaces.filter((row) => row.id === args.workspaceId.slice(7))
    const folder = candidates.length === 1 ? candidates[0] : undefined
    const group = folder && store.projectGroups.find((row) => row.id === folder.projectGroupId)
    if (!folder || !local(folder) || (group && !local(group))) {
      return null
    }
    root = folder.folderPath
  } else {
    const id = splitWorktreeIdForFilesystem(args.workspaceId)
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
