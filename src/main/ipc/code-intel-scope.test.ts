import { expect, it } from 'vitest'
import { parseCodeIntelArgs, resolveCodeIntelWorkspace } from './code-intel-scope'
const args = {
  workspaceId: 'r::/repo',
  workspaceRoot: '/repo',
  executionHostId: 'local',
  filePath: '/repo/a.ts',
  relativePath: 'a.ts',
  position: { line: 0, character: 0 },
  bufferVersion: 1,
  requestId: 1
}
it.each([
  null,
  {},
  { ...args, position: { line: -1, character: 0 } },
  { ...args, requestId: Infinity },
  { ...args, bufferVersion: 1.5 },
  { ...args, filePath: '/repo/a.ts\0' }
])('rejects malformed IPC requests', (value) => {
  expect(parseCodeIntelArgs(value)).toBeNull()
})
it('refuses an SSH workspace even when a renderer claims it is local', () => {
  expect(
    resolveCodeIntelWorkspace(
      { repos: [{ id: 'r', connectionId: 'remote' }], folderWorkspaces: [], projectGroups: [] },
      args
    )
  ).toBeNull()
})
it('supports local folder workspaces and pins the stored root', () => {
  const store = {
    repos: [],
    folderWorkspaces: [{ id: 'f', folderPath: '/actual', projectGroupId: 'g' }],
    projectGroups: []
  }
  expect(
    resolveCodeIntelWorkspace(store, { ...args, workspaceId: 'folder:f', workspaceRoot: '/actual' })
  ).toBe('/actual')
  expect(
    resolveCodeIntelWorkspace(store, { ...args, workspaceId: 'folder:f', workspaceRoot: '/forged' })
  ).toBeNull()
})
it('rejects ambiguous repository owners', () => {
  expect(
    resolveCodeIntelWorkspace(
      {
        repos: [{ id: 'r' }, { id: 'r', connectionId: 'ssh' }],
        folderWorkspaces: [],
        projectGroups: []
      },
      args
    )
  ).toBeNull()
})
