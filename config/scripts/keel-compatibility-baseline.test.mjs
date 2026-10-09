import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { parse } from 'yaml'
import { runProcessSync } from './script-child-process.mjs'

const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8'))
const steps = workflow.jobs['cross-version-wire'].steps
const selection = steps.find((step) => step.name?.includes('compatibility baseline'))
const fixtures = steps.find((step) => step.name === 'Fetch historical Orca compatibility fixtures')
const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([false, true])(
  'pins the Keel baseline before upstream tags arrive (released=%s)',
  (released) => {
    const root = mkdtempSync(join(tmpdir(), 'keel-baseline-'))
    roots.push(root)
    const git = (args) => {
      const result = runProcessSync({ program: 'git', args, cwd: root })
      expect(result.code, result.stderr).toBe(0)
      return result.stdout.trim()
    }
    git(['init', '--quiet'])
    git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-qm',
      'release'
    ])
    const release = git(['rev-parse', 'HEAD'])
    if (released) {
      git(['tag', 'v0.1.0'])
    }
    git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-qm',
      'base'
    ])
    const base = git(['rev-parse', 'HEAD'])
    git(['tag', 'v0.2.0-rc.1'])
    mkdirSync(join(root, 'config', 'scripts'), { recursive: true })
    writeFileSync(
      join(root, 'config', 'scripts', 'stable-release-tags.mjs'),
      readFileSync('config/scripts/stable-release-tags.mjs')
    )
    const body = selection.run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/)
    expect(
      body,
      'the selection must pin the baseline through the shared release selector'
    ).not.toBeNull()
    const output = join(root, 'github-env')
    const result = runProcessSync({
      program: process.env.ORCA_TEST_NODE_EXECUTABLE || process.execPath,
      args: ['--input-type=module', '--eval', body[1]],
      cwd: root,
      env: { ...process.env, BASE_SHA: base, GITHUB_ENV: output }
    })
    expect(result.code, result.stderr).toBe(0)
    git(['tag', 'v1.4.222'])
    const baseline = readFileSync(output, 'utf8').trim().split('=')[1]
    expect(git(['rev-parse', baseline])).toBe(released ? release : base)
    expect(steps.indexOf(selection)).toBeLessThan(steps.indexOf(fixtures))
  }
)

it('fetches the release needed by the imported clear-tab compatibility test', () => {
  expect(fixtures.run).toContain('refs/tags/v1.4.222:refs/tags/v1.4.222')
})
