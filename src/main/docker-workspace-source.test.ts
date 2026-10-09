import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runProcess } from '../shared/child-process/run-process'
import { resolveExecutableCommand } from '../shared/node-cli-command-resolution'
import { copyDockerWorkspaceSource, safeDockerOrigin } from './docker-workspace-source'
const { docker } = vi.hoisted(() => ({ docker: vi.fn() }))
vi.mock('./docker-workspace-connection', () => ({ dockerCommand: docker }))
const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})
const binding = { cli: '/docker', endpoint: 'unix:///local.sock', engineId: 'engine' }
async function git(args: string[], cwd: string) {
  const program = resolveExecutableCommand('git')
  if (!program) {
    throw new Error('Git fixture prerequisite unavailable')
  }
  const result = await runProcess({
    program,
    args,
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_CONFIG_COUNT: '0'
    }
  })
  if (result.code !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout.trim()
}
describe('Docker committed source export', () => {
  it('exports the exact selected commit from a worktree into independent Git metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-docker-source-test-'))
    roots.push(root)
    const source = join(root, 'source with spaces')
    const checkout = join(root, 'checkout')
    const copiedBundle = join(root, 'copied.bundle')
    const worktree = join(root, 'worktree with spaces')
    mkdirSync(source)
    await git(['init', '-b', 'main'], source)
    await git(['config', 'user.name', 'Fixture'], source)
    await git(['config', 'user.email', 'fixture@example.invalid'], source)
    writeFileSync(join(source, 'file.txt'), 'selected')
    await git(['add', 'file.txt'], source)
    await git(['commit', '-m', 'selected'], source)
    const selected = await git(['rev-parse', 'HEAD'], source)
    writeFileSync(join(source, 'file.txt'), 'later')
    await git(['commit', '-am', 'later'], source)
    await git(['worktree', 'add', '--detach', worktree, 'HEAD'], source)
    writeFileSync(join(worktree, 'dirty.txt'), 'excluded')
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', 'credential.helper')
    vi.stubEnv('GIT_CONFIG_VALUE_0', '!exit 99')
    docker.mockReset().mockImplementation(async (_binding, args: string[]) => {
      if (args[0] === 'cp') {
        writeFileSync(copiedBundle, readFileSync(args[1]))
        return ''
      }
      const command = args.slice(4)
      if (args[0] !== 'exec' || command[0] !== 'git') {
        return ''
      }
      const translated = command
        .slice(1)
        .map((arg) =>
          arg === '/tmp/orca-source.bundle'
            ? copiedBundle
            : arg === '/home/agent/project'
              ? checkout
              : arg
        )
      return git(translated, root)
    })
    await copyDockerWorkspaceSource(
      binding,
      'owned',
      {
        recipeId: 'orca-docker',
        instanceId: 'fixture',
        repoPath: worktree,
        expectedRefHead: selected,
        ref: 'refs/heads/rewritten-remote',
        branch: 'feature/selected',
        repoUrl: 'https://user:secret@example.invalid/repo.git'
      },
      {}
    )
    expect(await git(['rev-parse', 'HEAD'], checkout)).toBe(selected)
    expect(await git(['branch', '--show-current'], checkout)).toBe('feature/selected')
    expect(readFileSync(join(checkout, 'file.txt'), 'utf8')).toBe('selected')
    expect(await git(['status', '--porcelain'], checkout)).toBe('')
    expect(await git(['remote'], checkout)).toBe('')
    expect(readFileSync(join(checkout, '.git', 'config'), 'utf8')).not.toContain(source)
    expect(await git(['status', '--porcelain'], worktree)).toBe('?? dirty.txt')
  })
  it.each([
    'https://user:secret@example.invalid/repo',
    'https://example.invalid/repo?token=secret',
    '/host/repo',
    'file:///host/repo'
  ])('omits inappropriate origins %s', (url) => {
    expect(safeDockerOrigin(url)).toBeNull()
  })
  it.each([
    'https://example.invalid/repo.git',
    'git@example.invalid:org/repo.git',
    'ssh://git@example.invalid/org/repo.git'
  ])('retains credential-free remote origin %s', (url) => {
    expect(safeDockerOrigin(url)).toBe(url)
  })
  it('rejects an unresolved SHA before exporting or touching Docker', async () => {
    docker.mockClear()
    await expect(
      copyDockerWorkspaceSource(
        binding,
        'owned',
        { recipeId: 'orca-docker', repoPath: '/repo', expectedRefHead: '--malicious' },
        {}
      )
    ).rejects.toThrow('resolved committed Git SHA')
    expect(docker).not.toHaveBeenCalled()
  })
})
