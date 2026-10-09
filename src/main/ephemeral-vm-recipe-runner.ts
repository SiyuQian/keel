import { isDockerWorkspaceRecipe } from '../shared/docker-workspace-recipe'
import * as shell from '../shared/ephemeral-vm-recipe-runner'
import {
  startDockerWorkspace,
  lifecycleDockerWorkspace,
  resumeDockerWorkspace
} from './docker-workspace-runtime'

export type * from '../shared/ephemeral-vm-recipe-runner'
export {
  buildEphemeralVmRecipeCleanupCommand,
  buildEphemeralVmRecipeCleanupPayload
} from '../shared/ephemeral-vm-recipe-runner'

type StartArgs = shell.EphemeralVmRecipeStartArgs & { userDataPath?: string }
type LifecycleArgs = shell.EphemeralVmRecipeLifecycleArgs & { userDataPath?: string }
function userDataPath(args: { userDataPath?: string }): string {
  if (!args.userDataPath) {
    throw new Error('Docker workspace requires the app-owned user data directory.')
  }
  return args.userDataPath
}

export function runEphemeralVmRecipeStart(
  args: StartArgs
): Promise<shell.EphemeralVmRecipeStartResult> {
  return isDockerWorkspaceRecipe(args.recipe)
    ? startDockerWorkspace({ ...args, userDataPath: userDataPath(args) })
    : shell.runEphemeralVmRecipeStart(args)
}
export function runEphemeralVmRecipeCleanup(
  args: LifecycleArgs
): Promise<shell.EphemeralVmRecipeCleanupResult> {
  return isDockerWorkspaceRecipe(args.recipe)
    ? lifecycleDockerWorkspace({ ...args, userDataPath: userDataPath(args) }, 'destroy')
    : shell.runEphemeralVmRecipeCleanup(args)
}
export function runEphemeralVmRecipeSuspend(
  args: LifecycleArgs
): Promise<shell.EphemeralVmRecipeCleanupResult> {
  return isDockerWorkspaceRecipe(args.recipe)
    ? lifecycleDockerWorkspace({ ...args, userDataPath: userDataPath(args) }, 'suspend')
    : shell.runEphemeralVmRecipeSuspend(args)
}
export function runEphemeralVmRecipeResume(
  args: LifecycleArgs
): Promise<shell.EphemeralVmRecipeResumeResult> {
  return isDockerWorkspaceRecipe(args.recipe)
    ? resumeDockerWorkspace({ ...args, userDataPath: userDataPath(args) })
    : shell.runEphemeralVmRecipeResume(args)
}
