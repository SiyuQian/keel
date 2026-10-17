import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '../shared/child-process/run-process'
import { resolveExecutableCommand } from '../shared/node-cli-command-resolution'
import type { EphemeralVmRecipeContext } from '../shared/ephemeral-vm-recipe-runner'
import { dockerCommand, type DockerBinding } from './docker-workspace-connection'

export function safeDockerOrigin(url: string | undefined): string | null {
  if (!url) {
    return null
  }
  try {
    const parsed = new URL(url)
    return ['https:', 'ssh:'].includes(parsed.protocol) &&
      !parsed.password &&
      (parsed.protocol !== 'https:' || !parsed.username) &&
      !parsed.search &&
      !parsed.hash
      ? url
      : null
  } catch {
    return /^[\w.-]+@[\w.-]+:[^\s]+$/.test(url) ? url : null
  }
}

export async function copyDockerWorkspaceSource(
  binding: DockerBinding,
  container: string,
  context: EphemeralVmRecipeContext,
  options: { signal?: AbortSignal; onStderr?: (chunk: string) => void }
): Promise<void> {
  const sha = context.expectedRefHead
  if (!sha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) {
    throw new Error('Docker requires the resolved committed Git SHA.')
  }
  const git = resolveExecutableCommand('git')
  if (!git) {
    throw new Error('Git is unavailable on the local host.')
  }
  const staging = mkdtempSync(join(tmpdir(), 'orca-docker-source-'))
  const bare = join(staging, 'export.git')
  const bundle = join(staging, 'source.bundle')
  const empty = join(staging, 'empty')
  mkdirSync(empty)
  const globalConfig = join(staging, 'gitconfig')
  writeFileSync(globalConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
    ),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_TERMINAL_PROMPT: '0'
  }
  const execute = async (args: string[]): Promise<string> => {
    if (options.signal?.aborted) {
      throw new Error('Docker provisioning cancelled.')
    }
    const result = await runProcess({
      program: git,
      args: ['-c', `core.hooksPath=${empty}`, ...args],
      env,
      signal: options.signal,
      timeoutMs: 120_000
    })
    if (options.signal?.aborted || result.code !== 0 || result.timedOut || result.outputTruncated) {
      throw new Error(`Git export failed: ${result.stderr || 'cancelled or timed out'}`)
    }
    return result.stdout.trim()
  }
  try {
    const branch = context.branch ?? 'workspace'
    await execute(['check-ref-format', '--branch', branch])
    if (branch.startsWith('-') || branch.includes('@{')) {
      throw new Error('Invalid Docker workspace branch.')
    }
    options.onStderr?.(
      'Exporting the selected Git commit without host credentials or uncommitted edits…\n'
    )
    // SHA-256 needs matching storage. SHA-1 keeps the Git 2.25-compatible init command.
    await execute([
      'init',
      '--bare',
      `--template=${empty}`,
      ...(sha.length === 64 ? ['--object-format=sha256'] : []),
      bare
    ])
    // Protocol v2 can fetch a selected non-tip commit on Git 2.25.
    await execute([
      '-C',
      bare,
      '-c',
      'protocol.file.allow=always',
      '-c',
      'protocol.version=2',
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      context.repoPath,
      sha
    ])
    await execute(['-C', bare, 'update-ref', 'refs/heads/orca-export', sha])
    await execute(['-C', bare, 'bundle', 'create', bundle, 'refs/heads/orca-export'])
    await dockerCommand(binding, ['cp', bundle, `${container}:/tmp/orca-source.bundle`], options)
    await dockerCommand(
      binding,
      [
        'exec',
        '--user',
        'agent',
        container,
        'git',
        'clone',
        '--no-checkout',
        '/tmp/orca-source.bundle',
        '/home/agent/project'
      ],
      options
    )
    await dockerCommand(
      binding,
      [
        'exec',
        '--user',
        'agent',
        container,
        'git',
        '-C',
        '/home/agent/project',
        'checkout',
        '-b',
        branch,
        sha
      ],
      options
    )
    const actual = await dockerCommand(
      binding,
      [
        'exec',
        '--user',
        'agent',
        container,
        'git',
        '-C',
        '/home/agent/project',
        'rev-parse',
        'HEAD'
      ],
      options
    )
    if (actual !== sha) {
      throw new Error('Docker checkout does not match the selected commit.')
    }
    await dockerCommand(
      binding,
      [
        'exec',
        '--user',
        'agent',
        container,
        'git',
        '-C',
        '/home/agent/project',
        'remote',
        'remove',
        'origin'
      ],
      options
    )
    const origin = safeDockerOrigin(context.repoUrl)
    if (origin) {
      await dockerCommand(
        binding,
        [
          'exec',
          '--user',
          'agent',
          container,
          'git',
          '-C',
          '/home/agent/project',
          'remote',
          'add',
          'origin',
          origin
        ],
        options
      )
    }
    await dockerCommand(binding, ['exec', container, 'rm', '/tmp/orca-source.bundle'], options)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
