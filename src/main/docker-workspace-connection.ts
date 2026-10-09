import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { utils } from 'ssh2'
import { z } from 'zod'
import {
  signalProcessTree,
  forceTerminateProcessTree
} from '../shared/child-process/process-tree-termination'
import { runProcess } from '../shared/child-process/run-process'
import { resolveExecutableCommand } from '../shared/node-cli-command-resolution'
import type {
  EphemeralVmRecipeDoctorResult,
  EphemeralVmRecipeResult
} from '../shared/ephemeral-vm-recipes'
import { DOCKER_WORKSPACE_RECIPE } from '../shared/docker-workspace-recipe'

export const DockerBindingSchema = z.object({
  cli: z.string().min(1),
  endpoint: z.string().regex(/^(unix:\/\/\/|npipe:\/\/)/),
  engineId: z.string().min(1)
})
export type DockerBinding = z.infer<typeof DockerBindingSchema>
const EngineSchema = z.object({ ID: z.string().min(1), OSType: z.literal('linux') })
const ContextSchema = z
  .array(z.object({ Endpoints: z.object({ docker: z.object({ Host: z.string() }) }) }))
  .length(1)
export const DockerContainerSchema = z
  .array(
    z.object({
      Id: z.string().regex(/^[a-f0-9]{64}$/),
      Name: z.string(),
      Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
      NetworkSettings: z.object({
        Ports: z.record(
          z.string(),
          z.array(z.object({ HostIp: z.string(), HostPort: z.string() })).nullable()
        )
      })
    })
  )
  .length(1)

function managementEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('DOCKER_'))
  )
}

export async function dockerCommand(
  binding: Pick<DockerBinding, 'cli' | 'endpoint'>,
  args: string[],
  options: {
    signal?: AbortSignal
    timeoutMs?: number
    input?: string
    onStderr?: (chunk: string) => void
  } = {}
): Promise<string> {
  if (options.signal?.aborted) {
    throw new Error('Docker provisioning cancelled.')
  }
  const result = await runProcess({
    program: binding.cli,
    args: ['--host', binding.endpoint, ...args],
    env: managementEnvironment(),
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 60_000,
    input: options.input,
    terminationBarrier: options.onStderr
      ? {
          observeStderr: (chunk) => options.onStderr?.(chunk.toString()),
          signal: signalProcessTree,
          force: forceTerminateProcessTree
        }
      : true,
    maxOutputBytes: 4 * 1024 * 1024
  })
  if (options.signal?.aborted) {
    throw new Error('Docker provisioning cancelled.')
  }
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(
      `Docker ${args[0]} failed: ${result.stderr.trim() || (result.timedOut ? 'command timed out' : `exit ${result.code}`)}`
    )
  }
  return result.stdout.trim()
}

export async function resolveDockerBinding(signal?: AbortSignal): Promise<DockerBinding> {
  if (signal?.aborted) {
    throw new Error('Docker provisioning cancelled.')
  }
  const cli = resolveExecutableCommand('docker')
  if (!cli) {
    throw new Error(
      'Docker CLI not found. Install Docker Desktop, OrbStack, or Docker Engine and make docker available on PATH.'
    )
  }
  let endpoint = process.env.DOCKER_HOST
  if (!endpoint || process.env.DOCKER_CONTEXT) {
    const env = { ...process.env }
    delete env.DOCKER_HOST
    const current = await runProcess({ program: cli, args: ['context', 'show'], env, signal })
    if (current.code !== 0) {
      throw new Error(`Cannot resolve Docker context: ${current.stderr}`)
    }
    const context = await runProcess({
      program: cli,
      args: ['context', 'inspect', current.stdout.trim()],
      env,
      signal
    })
    if (context.code !== 0) {
      throw new Error(`Cannot inspect Docker context: ${context.stderr}`)
    }
    endpoint = ContextSchema.parse(JSON.parse(context.stdout))[0].Endpoints.docker.Host
  }
  if (!/^(unix:\/\/\/|npipe:\/\/)/.test(endpoint)) {
    throw new Error(
      'Docker workspaces require a local Unix socket or Windows named pipe. Select a local Docker context.'
    )
  }
  const partial = { cli, endpoint }
  let engine
  try {
    engine = EngineSchema.parse(
      JSON.parse(await dockerCommand(partial, ['info', '--format', '{{json .}}'], { signal }))
    )
  } catch (error) {
    throw new Error(
      `Docker requires a reachable Linux engine. Start Docker or switch to Linux containers. ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return { ...partial, engineId: engine.ID }
}

export async function verifyDockerBinding(
  binding: DockerBinding,
  signal?: AbortSignal
): Promise<void> {
  if (resolveExecutableCommand(binding.cli) !== binding.cli) {
    throw new Error(
      'The original Docker executable is unavailable. Restore it before managing this workspace.'
    )
  }
  const engine = EngineSchema.parse(
    JSON.parse(await dockerCommand(binding, ['info', '--format', '{{json .}}'], { signal }))
  )
  if (engine.ID !== binding.engineId) {
    throw new Error(
      'The Docker engine changed. Restore the original engine before managing this workspace.'
    )
  }
}

export async function doctorDockerWorkspace(
  repoPath: string
): Promise<EphemeralVmRecipeDoctorResult> {
  try {
    await resolveDockerBinding()
    return {
      recipeId: DOCKER_WORKSPACE_RECIPE.id,
      repoPath,
      ok: true,
      checks: [
        {
          id: 'docker.engine',
          status: 'pass',
          message: 'Local Linux Docker engine is ready. The first workspace may build its image.'
        }
      ]
    }
  } catch (error) {
    return {
      recipeId: DOCKER_WORKSPACE_RECIPE.id,
      repoPath,
      ok: false,
      checks: [
        {
          id: 'docker.engine',
          status: 'fail',
          message: error instanceof Error ? error.message : String(error),
          remediation:
            'Start your existing local Docker engine, select Linux containers, and check docker info.'
        }
      ]
    }
  }
}

export function dockerWorkspaceName(instanceId: string): string {
  return `orca-docker-${createHash('sha256').update(instanceId).digest('hex').slice(0, 32)}`
}

export function dockerIdentityDirectory(userDataPath: string, instanceId: string): string {
  return join(userDataPath, 'docker-workspaces', dockerWorkspaceName(instanceId))
}

export function createDockerIdentity(
  userDataPath: string,
  instanceId: string
): { identityFile: string; publicKey: string } {
  const directory = dockerIdentityDirectory(userDataPath, instanceId)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  // ssh2's Ed25519 serializer strips valid leading zero bytes from public keys.
  const keys = utils.generateKeyPairSync('ecdsa', { bits: 256 })
  const identityFile = join(directory, 'id_ecdsa')
  writeFileSync(identityFile, keys.private, { mode: 0o600, flag: 'wx' })
  return { identityFile, publicKey: keys.public }
}

export const DockerMetadataSchema = DockerBindingSchema.extend({
  provider: z.literal('docker-workspace-v1'),
  instanceId: z.string().min(1),
  containerName: z.string(),
  containerId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
})
export type DockerMetadata = z.infer<typeof DockerMetadataSchema>

export function dockerWorkspaceResult(
  metadata: DockerMetadata,
  userDataPath: string,
  port = 22
): EphemeralVmRecipeResult {
  return {
    schemaVersion: 2,
    checkoutMode: 'provisioned-root',
    connection: {
      type: 'ssh',
      projectRoot: '/home/agent/project',
      target: {
        label: 'Docker',
        host: '127.0.0.1',
        port,
        username: 'agent',
        identityFile: join(dockerIdentityDirectory(userDataPath, metadata.instanceId), 'id_ecdsa'),
        identityAgent: 'none',
        identitiesOnly: true
      }
    },
    userData: metadata
  }
}
