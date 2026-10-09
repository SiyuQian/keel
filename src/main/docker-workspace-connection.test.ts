import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { utils } from 'ssh2'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDockerIdentity,
  dockerCommand,
  doctorDockerWorkspace,
  resolveDockerBinding
} from './docker-workspace-connection'
const { run, resolve } = vi.hoisted(() => ({ run: vi.fn(), resolve: vi.fn() }))
vi.mock('../shared/child-process/run-process', () => ({ runProcess: run }))
vi.mock('../shared/node-cli-command-resolution', () => ({ resolveExecutableCommand: resolve }))
const success = (stdout: string) => ({ code: 0, signal: null, stdout, stderr: '', timedOut: false })
beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('DOCKER_HOST', undefined)
  vi.stubEnv('DOCKER_CONTEXT', undefined)
  resolve.mockReset().mockReturnValue('/installed/docker')
  run.mockReset().mockImplementation(async ({ args }) => {
    if (args[0] === 'context') {
      return success(
        args[1] === 'show'
          ? 'desktop-linux'
          : JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///local.sock' } } }])
      )
    }
    return success(JSON.stringify({ ID: 'engine-id', OSType: 'linux' }))
  })
})
describe('Docker prerequisites', () => {
  it('returns actionable missing CLI diagnostics', async () => {
    resolve.mockReturnValue(null)
    const result = await doctorDockerWorkspace('/repo')
    expect(result.ok).toBe(false)
    expect(result.checks[0].message).toContain('Docker CLI not found')
    expect(run).not.toHaveBeenCalled()
  })
  it('does not claim success when the daemon cannot be reached', async () => {
    run.mockImplementation(async ({ args }) =>
      args[0] === '--host'
        ? { ...success(''), code: 1, stderr: 'Cannot connect to the Docker daemon' }
        : success(
            args[1] === 'show'
              ? 'default'
              : JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///local.sock' } } }])
          )
    )
    const result = await doctorDockerWorkspace('/repo')
    expect(result.ok).toBe(false)
    expect(result.checks[0].message).toContain('Start Docker')
  })
  it('rejects Windows container engines', async () => {
    vi.stubEnv('DOCKER_HOST', 'npipe:////./pipe/docker_engine')
    run.mockResolvedValue(success(JSON.stringify({ ID: 'engine', OSType: 'windows' })))
    expect((await doctorDockerWorkspace('/repo')).ok).toBe(false)
  })
  it.each(['ssh://remote', 'tcp://127.0.0.1:2375', 'https://engine.example'])(
    'rejects nonlocal endpoints %s before contacting them',
    async (endpoint) => {
      vi.stubEnv('DOCKER_HOST', endpoint)
      await expect(resolveDockerBinding()).rejects.toThrow(
        'local Unix socket or Windows named pipe'
      )
      expect(run).not.toHaveBeenCalled()
    }
  )
  it('captures the context endpoint and removes later Docker environment overrides', async () => {
    vi.stubEnv('DOCKER_CONTEXT', 'desktop-linux')
    vi.stubEnv('DOCKER_HOST', 'tcp://unrelated:2375')
    vi.stubEnv('DOCKER_TLS_VERIFY', '1')
    const binding = await resolveDockerBinding()
    expect(binding).toEqual({
      cli: '/installed/docker',
      endpoint: 'unix:///local.sock',
      engineId: 'engine-id'
    })
    const management = run.mock.calls.at(-1)?.[0]
    expect(management.args).toEqual([
      '--host',
      'unix:///local.sock',
      'info',
      '--format',
      '{{json .}}'
    ])
    expect(management.env.DOCKER_CONTEXT).toBeUndefined()
    expect(management.env.DOCKER_HOST).toBeUndefined()
    expect(management.env.DOCKER_TLS_VERIFY).toBeUndefined()
  })
  it('reports Docker build progress before the command completes', async () => {
    const onStderr = vi.fn()
    run.mockImplementation(async (spec) => {
      spec.terminationBarrier?.observeStderr?.('building image layer\n')
      expect(onStderr).toHaveBeenCalledWith('building image layer\n')
      return success('image')
    })
    await dockerCommand({ cli: '/installed/docker', endpoint: 'unix:///local.sock' }, ['build'], {
      onStderr
    })
  })
  it('passes provisioning cancellation to Docker context and daemon probes', async () => {
    const controller = new AbortController()
    await resolveDockerBinding(controller.signal)
    expect(run.mock.calls.every(([spec]) => spec.signal === controller.signal)).toBe(true)
  })
  it('supports a local Windows named pipe when it serves Linux containers', async () => {
    vi.stubEnv('DOCKER_HOST', 'npipe:////./pipe/docker_engine')
    expect(await resolveDockerBinding()).toMatchObject({
      endpoint: 'npipe:////./pipe/docker_engine',
      engineId: 'engine-id'
    })
  })
  it('generates SSH identities that the existing SSH parser can read and match to the public key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-docker-key-roundtrip-'))
    try {
      for (let index = 0; index < 2048; index++) {
        const identity = createDockerIdentity(directory, `roundtrip-${index}`)
        const privateKey = utils.parseKey(readFileSync(identity.identityFile))
        const publicKey = utils.parseKey(identity.publicKey)
        if (privateKey instanceof Error || publicKey instanceof Error) {
          throw new Error('Generated Docker identity is not readable by the SSH parser')
        }
        expect(privateKey.getPublicSSH().equals(publicKey.getPublicSSH())).toBe(true)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
