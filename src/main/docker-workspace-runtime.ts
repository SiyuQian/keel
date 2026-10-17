import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { isDockerWorkspaceRecipe } from '../shared/docker-workspace-recipe'
import type { EphemeralVmRecipeResult } from '../shared/ephemeral-vm-recipes'
import type {
  EphemeralVmRecipeStartArgs,
  EphemeralVmRecipeStartResult,
  EphemeralVmRecipeLifecycleArgs,
  EphemeralVmRecipeCleanupResult,
  EphemeralVmRecipeResumeResult,
  EphemeralVmRecipeContext
} from '../shared/ephemeral-vm-recipe-runner'
import {
  createDockerIdentity,
  dockerCommand,
  DockerMetadataSchema,
  dockerWorkspaceResult,
  type DockerMetadata,
  DockerContainerSchema,
  dockerWorkspaceName,
  dockerIdentityDirectory,
  resolveDockerBinding,
  verifyDockerBinding
} from './docker-workspace-connection'
import { ensureDockerWorkspaceImage } from './docker-workspace-image'
import { copyDockerWorkspaceSource } from './docker-workspace-source'

export type DockerWorkspaceStartArgs = EphemeralVmRecipeStartArgs & { userDataPath: string }
export type DockerWorkspaceLifecycleArgs = EphemeralVmRecipeLifecycleArgs & { userDataPath: string }
const INSTANCE_LABEL = 'dev.orca.workspace.instance'
const PROVIDER_LABEL = 'dev.orca.workspace.provider'

function metadataFor(args: DockerWorkspaceLifecycleArgs): DockerMetadata {
  if (!isDockerWorkspaceRecipe(args.recipe)) {
    throw new Error('Not the built-in Docker workspace recipe.')
  }
  const metadata = DockerMetadataSchema.parse(args.recipeResult.userData)
  if (
    metadata.instanceId !== args.context.instanceId ||
    metadata.containerName !== dockerWorkspaceName(metadata.instanceId)
  ) {
    throw new Error('Docker workspace identity does not match its runtime.')
  }
  return metadata
}

async function inspectOwned(metadata: DockerMetadata, signal?: AbortSignal) {
  // An empty filtered list is absence only after a successful engine response.
  const listing = await dockerCommand(
    metadata,
    [
      'container',
      'ls',
      '--all',
      '--filter',
      `name=^/${metadata.containerName}$`,
      '--format',
      '{{.ID}}'
    ],
    { signal }
  )
  if (!listing) {
    return null
  }
  const inspected = DockerContainerSchema.parse(
    JSON.parse(await dockerCommand(metadata, ['inspect', metadata.containerName], { signal }))
  )[0]
  if (
    inspected.Name !== `/${metadata.containerName}` ||
    inspected.Config.Labels?.[INSTANCE_LABEL] !== metadata.instanceId ||
    inspected.Config.Labels?.[PROVIDER_LABEL] !== 'docker-workspace-v1' ||
    (metadata.containerId && inspected.Id !== metadata.containerId)
  ) {
    throw new Error('Docker ownership changed. Refusing to manage an unrelated container.')
  }
  return inspected
}

async function connectionResult(
  metadata: DockerMetadata,
  userDataPath: string,
  signal?: AbortSignal
): Promise<EphemeralVmRecipeResult> {
  const inspected = await inspectOwned(metadata, signal)
  if (!inspected) {
    throw new Error('The Docker workspace container is missing.')
  }
  const bindings = inspected.NetworkSettings.Ports['22/tcp']
  const port = Number(bindings?.[0]?.HostPort)
  if (
    bindings?.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Docker SSH must be published only on loopback.')
  }
  // Wait for sshd to generate its per-container host keys before SSH attachment.
  await dockerCommand(
    metadata,
    [
      'exec',
      metadata.containerName,
      'sh',
      '-c',
      'for i in $(seq 1 50); do test -s /etc/ssh/ssh_host_ed25519_key.pub && exit 0; sleep 0.1; done; exit 1'
    ],
    { signal }
  )
  return dockerWorkspaceResult(metadata, userDataPath, port)
}

export async function startDockerWorkspace(
  args: DockerWorkspaceStartArgs
): Promise<EphemeralVmRecipeStartResult> {
  const context: EphemeralVmRecipeContext = {
    ...args.context,
    instanceId: args.context?.instanceId ?? `orca-${randomUUID()}`,
    recipeId: args.recipe.id,
    repoPath: args.repoPath
  }
  let metadata: DockerMetadata | undefined
  let createAttempted = false
  let identityCreated = false
  try {
    if (!isDockerWorkspaceRecipe(args.recipe)) {
      throw new Error('Not the built-in Docker workspace recipe.')
    }
    const binding = await resolveDockerBinding(args.signal)
    if (args.signal?.aborted) {
      throw new Error('Docker provisioning cancelled.')
    }
    const instanceId = context.instanceId ?? ''
    metadata = {
      ...binding,
      provider: 'docker-workspace-v1',
      instanceId,
      containerName: dockerWorkspaceName(instanceId)
    }
    const existing = await inspectOwned(metadata, args.signal)
    if (existing) {
      throw new Error('This Docker workspace already exists. Use its existing runtime lifecycle.')
    }
    const image = await ensureDockerWorkspaceImage(binding, args)
    await verifyDockerBinding(binding, args.signal)
    const identity = createDockerIdentity(args.userDataPath, instanceId)
    identityCreated = true
    const publicKeyPath = join(
      dockerIdentityDirectory(args.userDataPath, instanceId),
      'authorized_keys'
    )
    writeFileSync(publicKeyPath, `${identity.publicKey}\n`, { mode: 0o600 })
    args.onStderr?.('Creating an isolated Docker workspace (2 CPUs, 4 GiB)…\n')
    if (args.signal?.aborted) {
      throw new Error('Docker provisioning cancelled.')
    }
    createAttempted = true
    const containerId = await dockerCommand(
      binding,
      [
        'create',
        '--name',
        metadata.containerName,
        '--label',
        `${INSTANCE_LABEL}=${instanceId}`,
        '--label',
        `${PROVIDER_LABEL}=docker-workspace-v1`,
        '--cpus',
        '2',
        '--memory',
        '4g',
        '--publish',
        '127.0.0.1::22',
        image
      ],
      // Wait for the resource identity before reconciling cancellation on the daemon.
      { ...args, signal: undefined }
    )
    metadata.containerId = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(containerId)
    await dockerCommand(
      binding,
      ['cp', publicKeyPath, `${metadata.containerName}:/home/agent/.ssh/authorized_keys`],
      args
    )
    await inspectOwned(metadata, args.signal)
    await dockerCommand(binding, ['start', metadata.containerId], args)
    await dockerCommand(
      binding,
      ['exec', metadata.containerId, 'chown', 'agent:agent', '/home/agent/.ssh/authorized_keys'],
      args
    )
    await dockerCommand(
      binding,
      ['exec', metadata.containerId, 'chmod', '600', '/home/agent/.ssh/authorized_keys'],
      args
    )
    await copyDockerWorkspaceSource(binding, metadata.containerId, context, args)
    const result = await connectionResult(metadata, args.userDataPath, args.signal)
    return { ok: true, context, result, stdout: '', stderr: '' }
  } catch (error) {
    const failure = {
      ok: false as const,
      context,
      error: error instanceof Error ? error.message : String(error),
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null
    }
    if (!metadata || !createAttempted) {
      if (metadata && identityCreated) {
        rmSync(dockerIdentityDirectory(args.userDataPath, metadata.instanceId), {
          recursive: true,
          force: true
        })
      }
      return failure
    }
    // Cancel the client operation, then reconcile through the original engine without the aborted signal.
    const recipeResult = dockerWorkspaceResult(metadata, args.userDataPath)
    const cleaned = await lifecycleDockerWorkspace(
      { ...args, signal: undefined, context, recipeResult },
      'destroy'
    )
    return cleaned.ok
      ? failure
      : {
          ...failure,
          recipeResult,
          error: `${failure.error} Cleanup failed: ${cleaned.error}. Retry cleanup from environment runtimes.`
        }
  }
}

export async function lifecycleDockerWorkspace(
  args: DockerWorkspaceLifecycleArgs,
  mode: 'destroy' | 'suspend'
): Promise<EphemeralVmRecipeCleanupResult> {
  try {
    const metadata = metadataFor(args)
    await verifyDockerBinding(metadata, args.signal)
    const owned = await inspectOwned(metadata, args.signal)
    if (!owned && !metadata.containerId) {
      throw new Error(
        'Docker create did not return a container identity. Its outcome is unverifiable; retry cleanup after inspecting the original engine.'
      )
    }
    if (!owned && mode === 'suspend') {
      throw new Error('The Docker workspace container is missing.')
    }
    if (owned) {
      await dockerCommand(
        metadata,
        mode === 'destroy' ? ['rm', '--force', owned.Id] : ['stop', owned.Id],
        args
      )
    }
    if (mode === 'destroy') {
      rmSync(dockerIdentityDirectory(args.userDataPath, metadata.instanceId), {
        recursive: true,
        force: true
      })
    }
    return { ok: true, skipped: false, stdout: '', stderr: '', exitCode: 0, signal: null }
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null
    }
  }
}

export async function resumeDockerWorkspace(
  args: DockerWorkspaceLifecycleArgs
): Promise<EphemeralVmRecipeResumeResult> {
  try {
    const metadata = metadataFor(args)
    await verifyDockerBinding(metadata, args.signal)
    const owned = await inspectOwned(metadata, args.signal)
    if (!owned) {
      throw new Error(
        'The Docker workspace container is missing. It cannot be recreated without losing workspace data.'
      )
    }
    await dockerCommand(metadata, ['start', owned.Id], args)
    const result = await connectionResult(metadata, args.userDataPath, args.signal)
    return { ok: true, skipped: false, context: args.context, result, stdout: '', stderr: '' }
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      context: args.context,
      error: error instanceof Error ? error.message : String(error),
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null
    }
  }
}
