import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DOCKER_WORKSPACE_RECIPE } from '../shared/docker-workspace-recipe'
import {
  runEphemeralVmRecipeStart,
  runEphemeralVmRecipeCleanup,
  runEphemeralVmRecipeSuspend,
  runEphemeralVmRecipeResume
} from './ephemeral-vm-recipe-runner'

const { run, resolve } = vi.hoisted(() => ({
  run: vi.fn(),
  resolve: vi.fn((name: string) => name)
}))
vi.mock('../shared/child-process/run-process', () => ({ runProcess: run }))
vi.mock('../shared/node-cli-command-resolution', () => ({ resolveExecutableCommand: resolve }))

const root = mkdtempSync(join(tmpdir(), 'orca-docker-unit-'))
const context = { instanceId: 'orca-test', branch: 'feature/test', expectedRefHead: 'a'.repeat(40) }
let labels: Record<string, string>
let containerId: string
let containerName: string
const inspected = () => [
  {
    Id: containerId,
    Name: `/${containerName}`,
    Config: { Labels: labels },
    NetworkSettings: { Ports: { '22/tcp': [{ HostIp: '127.0.0.1', HostPort: '32222' }] } }
  }
]
const success = (stdout = '') => ({ code: 0, signal: null, stdout, stderr: '', timedOut: false })
beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root)
  labels = {}
  containerName = ''
  containerId = 'b'.repeat(64)
  run.mockReset().mockImplementation(async (spec) => {
    const args: string[] = spec.args ?? []
    const action = args[0] === '--host' ? args[2] : args[0]
    if (action === 'context') {
      return success(
        args[1] === 'show'
          ? 'default'
          : JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///fixture/docker.sock' } } }])
      )
    }
    if (action === 'info') {
      return success(JSON.stringify({ ID: 'engine-fixture', OSType: 'linux' }))
    }
    if (action === 'container') {
      return success(containerName ? containerId : '')
    }
    if (action === 'create') {
      containerName = args[args.indexOf('--name') + 1]
      args.forEach((arg, index) => {
        if (arg === '--label') {
          const [key, value] = args[index + 1].split('=')
          labels[key] = value
        }
      })
      return success(containerId)
    }
    if (action === 'inspect') {
      return success(JSON.stringify(inspected()))
    }
    if (args.includes('rev-parse')) {
      return success(context.expectedRefHead)
    }
    return success()
  })
  resolve.mockImplementation((name: string) => (name.startsWith('/') ? name : `/fixture/${name}`))
})

async function start(signal?: AbortSignal) {
  return runEphemeralVmRecipeStart({
    recipe: DOCKER_WORKSPACE_RECIPE,
    repoPath: root,
    context,
    userDataPath: root,
    signal
  })
}

describe('native Docker workspaces', () => {
  it('creates an isolated limited container and returns the existing SSH root contract', async () => {
    const result = await start()
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({
      schemaVersion: 2,
      checkoutMode: 'provisioned-root',
      connection: {
        type: 'ssh',
        projectRoot: '/home/agent/project',
        target: { host: '127.0.0.1', port: 32222, username: 'agent', identitiesOnly: true }
      }
    })
    const create = run.mock.calls
      .map(([spec]) => spec.args)
      .find((args) => args?.includes('create'))
    expect(create).toEqual(
      expect.arrayContaining(['--cpus', '2', '--memory', '4g', '--publish', '127.0.0.1::22'])
    )
    expect(create).not.toEqual(
      expect.arrayContaining(['--privileged', '--network=host', '--volume', '--mount'])
    )
    const lifecycle = {
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      context: result.context,
      recipeResult: result.result,
      userDataPath: root
    }
    expect((await runEphemeralVmRecipeSuspend(lifecycle)).ok).toBe(true)
    expect((await runEphemeralVmRecipeResume(lifecycle)).ok).toBe(true)
    expect((await runEphemeralVmRecipeCleanup(lifecycle)).ok).toBe(true)
  })
  it('preserves an existing workspace identity when creation is retried', async () => {
    const first = await start()
    if (!first.ok) {
      throw new Error(first.error)
    }
    const connection = 'connection' in first.result ? first.result.connection : null
    if (connection?.type !== 'ssh' || !connection.target.identityFile) {
      throw new Error('Missing SSH identity')
    }
    const before = readFileSync(connection.target.identityFile, 'utf8')
    const second = await start()
    expect(second.ok).toBe(false)
    expect(existsSync(connection.target.identityFile)).toBe(true)
    expect(readFileSync(connection.target.identityFile, 'utf8')).toBe(before)
  })
  it('rejects a different engine before touching the container', async () => {
    const result = await start()
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.ok).toBe(true)
    run.mockClear()
    run.mockImplementation(async () =>
      success(JSON.stringify({ ID: 'other-engine', OSType: 'linux' }))
    )
    const cleaned = await runEphemeralVmRecipeCleanup({
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      context: result.context,
      recipeResult: result.result,
      userDataPath: root
    })
    expect(cleaned.ok).toBe(false)
    expect(run.mock.calls.some(([spec]) => spec.args?.includes('rm'))).toBe(false)
  })
  it('rejects changed ownership before destructive actions', async () => {
    const result = await start()
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.ok).toBe(true)
    run.mockClear()
    labels = { ...labels, 'dev.orca.workspace.instance': 'unrelated' }
    const cleaned = await runEphemeralVmRecipeCleanup({
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      context: result.context,
      recipeResult: result.result,
      userDataPath: root
    })
    expect(cleaned.ok).toBe(false)
    expect(run.mock.calls.some(([spec]) => spec.args?.includes('rm'))).toBe(false)
  })
  it('rechecks the original engine after image build before creating resources', async () => {
    const original = run.getMockImplementation()!
    let infos = 0
    run.mockImplementation(async (spec) => {
      if (spec.args?.[2] === 'info' && ++infos > 1) {
        return success(JSON.stringify({ ID: 'replaced-engine', OSType: 'linux' }))
      }
      return original(spec)
    })
    const result = await start()
    expect(result.ok).toBe(false)
    expect(run.mock.calls.some(([spec]) => spec.args?.[2] === 'create')).toBe(false)
  })
  it('reconciles a cancelled create whose Docker response was interrupted', async () => {
    const controller = new AbortController()
    const original = run.getMockImplementation()!
    run.mockImplementation(async (spec) => {
      const result = await original(spec)
      if (spec.args?.[2] === 'create') {
        controller.abort()
      }
      return result
    })
    const result = await start(controller.signal)
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('recipeResult')
    const creation = run.mock.calls.find(([spec]) => spec.args?.[2] === 'create')?.[0]
    expect(creation.signal).toBeUndefined()
    const removal = run.mock.calls.find(([spec]) => spec.args?.[2] === 'rm')?.[0]
    expect(removal.args).toEqual([
      '--host',
      'unix:///fixture/docker.sock',
      'rm',
      '--force',
      containerId
    ])
    expect(removal.signal).toBeUndefined()
    expect(existsSync(join(root, 'docker-workspaces', containerName))).toBe(false)
  })
  it('persists retryable ownership metadata when provisioning rollback cannot contact Docker', async () => {
    const original = run.getMockImplementation()!
    run.mockImplementation(async (spec) => {
      if (spec.args?.includes('clone') || spec.args?.[2] === 'rm') {
        return { ...success(), code: 1, stderr: 'fixture failure' }
      }
      return original(spec)
    })
    const result = await provisionEphemeralVmRuntime({
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      userDataPath: root,
      repoId: 'fixture',
      branch: context.branch,
      expectedRefHead: context.expectedRefHead
    })
    expect(result.ok).toBe(false)
    const persisted = listEphemeralVmRuntimes(root)[0]
    expect(persisted).toMatchObject({
      status: 'cleanup_failed',
      cleanupStatus: 'failed',
      recipe: DOCKER_WORKSPACE_RECIPE,
      recipeResult: {
        userData: {
          endpoint: 'unix:///fixture/docker.sock',
          engineId: 'engine-fixture',
          containerId
        }
      }
    })
    run.mockImplementation(original)
    expect(
      (
        await cleanupEphemeralVmRuntime({
          recipe: persisted.recipe!,
          repoPath: root,
          userDataPath: root,
          runtimeId: persisted.id
        })
      ).ok
    ).toBe(true)
    expect(listEphemeralVmRuntimes(root)[0].status).toBe('cleaned')
  })
  it('keeps cleanup unverifiable on daemon failure', async () => {
    const result = await start()
    if (!result.ok) {
      throw new Error(result.error)
    }
    run.mockClear().mockResolvedValue({ ...success(), code: 1, stderr: 'daemon unavailable' })
    const cleanup = await runEphemeralVmRecipeCleanup({
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      context: result.context,
      recipeResult: result.result,
      userDataPath: root
    })
    expect(cleanup.ok).toBe(false)
    expect(run.mock.calls.some(([spec]) => spec.args?.[2] === 'rm')).toBe(false)
    expect(existsSync(join(root, 'docker-workspaces', containerName, 'id_ecdsa'))).toBe(true)
  })
  it('cleans the identity without removal when the original engine proves an identified container absent', async () => {
    const result = await start()
    if (!result.ok) {
      throw new Error(result.error)
    }
    const identityDirectory = join(root, 'docker-workspaces', containerName)
    expect(existsSync(identityDirectory)).toBe(true)
    containerName = ''
    run.mockClear()
    const cleanup = await runEphemeralVmRecipeCleanup({
      recipe: DOCKER_WORKSPACE_RECIPE,
      repoPath: root,
      context: result.context,
      recipeResult: result.result,
      userDataPath: root
    })
    expect(cleanup.ok).toBe(true)
    expect(existsSync(identityDirectory)).toBe(false)
    expect(run.mock.calls.map(([spec]) => spec.args?.[2])).toEqual(['info', 'container'])
  })
  it('retains recovery metadata when create returns no identity and absence cannot settle its outcome', async () => {
    const original = run.getMockImplementation()!
    run.mockImplementation(async (spec) =>
      spec.args?.[2] === 'create'
        ? { ...success(), code: 1, stderr: 'connection lost during create' }
        : original(spec)
    )
    const result = await start()
    if (result.ok) {
      throw new Error('Expected create failure')
    }
    expect(result).toMatchObject({
      recipeResult: {
        userData: { endpoint: 'unix:///fixture/docker.sock', instanceId: 'orca-test' }
      }
    })
    expect(
      existsSync(
        join(
          root,
          'docker-workspaces',
          String(result.recipeResult?.userData?.containerName),
          'id_ecdsa'
        )
      )
    ).toBe(true)
  })
})

import {
  provisionEphemeralVmRuntime,
  cleanupEphemeralVmRuntime
} from './ephemeral-vm-runtime-service'
import { listEphemeralVmRuntimes } from '../shared/ephemeral-vm-runtime-store'
afterAll(() => rmSync(root, { recursive: true, force: true }))
