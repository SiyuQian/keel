import type { OrcaVmRecipe } from './orca-yaml-hook-types'

export const DOCKER_WORKSPACE_RECIPE: OrcaVmRecipe = {
  id: 'orca-docker',
  name: 'Docker',
  description: 'Independent Linux checkout with Claude and Codex. Log in inside this workspace.',
  checkoutMode: 'provisioned-root',
  create: 'orca-internal:docker:create:v1',
  suspend: 'orca-internal:docker:suspend:v1',
  resume: 'orca-internal:docker:resume:v1',
  destroy: 'orca-internal:docker:destroy:v1'
}

export function isDockerWorkspaceRecipe(recipe: OrcaVmRecipe): boolean {
  return (
    Object.keys(recipe).length === Object.keys(DOCKER_WORKSPACE_RECIPE).length &&
    Object.entries(DOCKER_WORKSPACE_RECIPE).every(
      ([key, value]) => Reflect.get(recipe, key) === value
    )
  )
}
