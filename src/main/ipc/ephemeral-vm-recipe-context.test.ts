const { runtime } = vi.hoisted(() => ({ runtime: vi.fn() }))
vi.mock('../local-project-runtime-resolution', () => ({
  resolveLocalProjectRuntimeForRepo: runtime
}))
import { describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import {
  combineEphemeralVmRecipes,
  listRecipes,
  listRecipeCatalog,
  resolveRecipeForRepo
} from './ephemeral-vm-recipe-context'

const repo = {
  id: 'repo',
  displayName: 'Fixture',
  path: '/missing-fixture',
  badgeColor: '',
  addedAt: 0
}
function storeFor(overrides = {}): Store {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these recipe paths only read getRepo/getRepos.
  return {
    getRepo: () => ({ ...repo, ...overrides }),
    getRepos: () => [{ ...repo, ...overrides }]
  } as never
}

describe('built-in Docker discovery', () => {
  it('lists and resolves Docker without project recipes', () => {
    const result = listRecipes(storeFor(), 'repo')
    expect(result.recipes).toContainEqual(
      expect.objectContaining({
        id: 'orca-docker',
        name: 'Docker',
        checkoutMode: 'provisioned-root'
      })
    )
    expect(listRecipeCatalog(storeFor())[0]?.recipes).toEqual(result.recipes)
    expect(resolveRecipeForRepo(repo.path, 'orca-docker')).toEqual(result.recipes[0])
  })
  it('preserves project/plugin precedence on collisions', () => {
    const recipe = { id: 'orca-docker', name: 'Custom', create: 'custom' }
    expect(combineEphemeralVmRecipes([recipe], [recipe])).toEqual([recipe])
  })
  it.each([{ kind: 'folder' }, { connectionId: 'ssh' }, { executionHostId: 'runtime:remote' }])(
    'does not offer Docker on unsupported repos %o',
    (overrides) => {
      expect(listRecipes(storeFor(overrides), 'repo').recipes).toEqual([])
      expect(listRecipeCatalog(storeFor(overrides))).toEqual([])
    }
  )
  it('excludes the built-in on WSL while retaining authored recipes', () => {
    runtime.mockReturnValueOnce({ status: 'ready', runtime: { kind: 'wsl', distro: 'Ubuntu' } })
    const authored = { id: 'custom', name: 'Custom', create: 'create' }
    expect(listRecipes(storeFor(), 'repo', [authored]).recipes).toEqual([authored])
  })
})
