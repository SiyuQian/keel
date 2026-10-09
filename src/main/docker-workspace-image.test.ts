import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureDockerWorkspaceImage } from './docker-workspace-image'

const { docker } = vi.hoisted(() => ({ docker: vi.fn() }))
vi.mock('./docker-workspace-connection', () => ({ dockerCommand: docker }))

describe('Docker image staging', () => {
  it('removes the private build context after a failed image build', async () => {
    let staging = ''
    docker.mockImplementation(async (_binding, args: string[]) => {
      staging = args[3]
      expect(readFileSync(join(staging, 'Dockerfile'), 'utf8')).toContain('FROM node:')
      expect(existsSync(join(staging, 'entrypoint.sh'))).toBe(true)
      throw new Error('fixture build failed')
    })
    await expect(
      ensureDockerWorkspaceImage(
        { cli: '/installed/docker', endpoint: 'unix:///local.sock', engineId: 'engine' },
        {}
      )
    ).rejects.toThrow('fixture build failed')
    expect(staging).not.toBe('')
    expect(existsSync(staging)).toBe(false)
  })
})
