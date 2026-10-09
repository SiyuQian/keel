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
    recipe.id === DOCKER_WORKSPACE_RECIPE.id &&
    recipe.name === DOCKER_WORKSPACE_RECIPE.name &&
    recipe.description === DOCKER_WORKSPACE_RECIPE.description &&
    recipe.checkoutMode === DOCKER_WORKSPACE_RECIPE.checkoutMode &&
    recipe.create === DOCKER_WORKSPACE_RECIPE.create &&
    recipe.suspend === DOCKER_WORKSPACE_RECIPE.suspend &&
    recipe.resume === DOCKER_WORKSPACE_RECIPE.resume &&
    recipe.destroy === DOCKER_WORKSPACE_RECIPE.destroy
  )
}
