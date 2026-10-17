import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldIO } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import * as reader from '../../shared/node-bounded-file-reader'
import type { Repo } from '../../shared/repo-types'
import { clearSkillDiscoveryCaches, discoverSkillsOnTarget } from './skill-discovery-target'

vi.mock('node:os', { spy: true })
vi.mock('node:fs/promises', { spy: true })
const actualFs = await vi.importActual<typeof fs>('node:fs/promises')
const actualOs = await vi.importActual<typeof os>('node:os')
const directories: string[] = []
const releases: (() => void)[] = []
async function drain() {
  for (let i = 0; i < 500; i++) {
    await yieldIO()
  }
}
afterEach(async () => {
  for (const release of releases.splice(0)) {
    release()
  }
  await drain()
  vi.restoreAllMocks()
  vi.mocked(fs.stat).mockImplementation(actualFs.stat)
  vi.mocked(os.homedir).mockImplementation(actualOs.homedir)
  vi.useRealTimers()
  clearSkillDiscoveryCaches()
  await Promise.all(
    directories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true }))
  )
})
async function fixture() {
  const home = await fs.mkdtemp(join(os.tmpdir(), 'workflow-target-bounds-'))
  directories.push(home)
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  const owner = join(home, '.agents', 'skills', 'owner')
  await fs.mkdir(owner, { recursive: true })
  await fs.writeFile(join(owner, 'SKILL.md'), '---\nname: owner\n---\nSource.')
  await fs.writeFile(
    join(owner, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: Old.}]'
  )
  return { home, owner, target: { kind: 'native-host', cwd: undefined } as const }
}

it.each(['registry', 'settings', 'manifest', 'root'])(
  'bounds actual target discovery when %s operations stall and does not multiply retries',
  async (kind) => {
    const { home, target } = await fixture()
    const packageRoot = join(home, '.codex', 'plugins', 'cache', 'market', 'package', '1')
    await fs.mkdir(join(packageRoot, 'skills', 'source'), { recursive: true })
    await fs.writeFile(join(packageRoot, 'skills', 'source', 'SKILL.md'), '# Source')
    await fs.mkdir(join(packageRoot, '.codex-plugin'))
    await fs.writeFile(join(packageRoot, '.codex-plugin', 'plugin.json'), '{"name":"verified"}')
    const original = actualFs.stat
    let blocked = 0
    let markEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve
    })
    let finish!: (value: Awaited<ReturnType<typeof fs.stat>>) => void
    const heldStats = await original(home)
    vi.spyOn(fs, 'stat').mockImplementation((path) => {
      const name = String(path)
      const hold =
        kind === 'registry'
          ? name.endsWith('installed_plugins.json')
          : kind === 'settings'
            ? name.endsWith('.claude/settings.json')
            : kind === 'manifest'
              ? name.endsWith('.codex-plugin/plugin.json')
              : name === join(home, '.agents', 'skills')
      if (!hold) {
        return original(path)
      }
      blocked++
      markEntered()
      return new Promise((resolve) => {
        finish = resolve
        releases.push(() => resolve(heldStats))
      })
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const pending = discoverSkillsOnTarget(target, [], { includeWorkflows: true, refresh: true })
    const outcome = pending.then(
      (value) => ({ value }),
      (error) => ({ error })
    )
    // Why race: settling without reaching the held path must fail fast, not time out.
    expect(await Promise.race([entered.then(() => 'entered' as const), outcome])).toBe('entered')
    expect(blocked).toBe(1)
    await vi.advanceTimersByTimeAsync(11000)
    await drain()
    expect(await Promise.race([outcome, Promise.resolve('pending')])).not.toBe('pending')
    for (let i = 0; i < 12; i++) {
      const retry = discoverSkillsOnTarget(target, [], {
        includeWorkflows: true,
        refresh: true
      }).catch(() => undefined)
      await drain()
      await vi.advanceTimersByTimeAsync(11000)
      await drain()
      await retry
    }
    expect(blocked).toBe(1)
    finish(heldStats)
    await vi.advanceTimersByTimeAsync(0)
  }
)

it('refreshes YAML while an older Skill document read remains pending', async () => {
  const { home, owner, target } = await fixture()
  const original = reader.readNodeFileWithinLimit
  const sourceStats = await fs.stat(join(owner, 'SKILL.md'))
  let blocked = 0
  let markEntered!: () => void
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve
  })
  let finish!: (value: reader.BoundedNodeFileRead) => void
  let yamlReads = 0
  let markYamlReread!: () => void
  const yamlReread = new Promise<void>((resolve) => {
    markYamlReread = resolve
  })
  vi.spyOn(reader, 'readNodeFileWithinLimit').mockImplementation((path, limit, options) => {
    if (path === join(owner, 'workflow.yaml')) {
      return original(path, limit, options).finally(() => {
        yamlReads++
        if (yamlReads === 2) {
          markYamlReread()
        }
      })
    }
    if (path === join(owner, 'SKILL.md')) {
      blocked++
      markEntered()
      return new Promise((resolve) => {
        finish = resolve
        releases.push(() => resolve({ buffer: Buffer.from('# Source'), stats: sourceStats }))
      })
    }
    return original(path, limit, options)
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const old = discoverSkillsOnTarget(target, [], { includeWorkflows: true }).catch(() => undefined)
  await Promise.race([entered, old])
  expect(blocked).toBe(1)
  await fs.writeFile(
    join(owner, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: New.}]'
  )
  const refreshed = discoverSkillsOnTarget(target, [], { includeWorkflows: true, refresh: true })
  // Why wait for the re-read rather than a fixed yield count: on a slow runner the
  // fake clock otherwise fires the 2 s file-read deadline before real I/O returns.
  await Promise.race([yamlReread, refreshed])
  expect(yamlReads).toBe(2)
  await drain()
  await vi.advanceTimersByTimeAsync(5000)
  await drain()
  const result = await Promise.race([refreshed, Promise.resolve(undefined)])
  expect(result?.workflows?.entries[0]?.definition?.stages[0]?.prompt).toBe('New.')
  expect(result?.workflows?.documents[0]?.error).toMatch(/slow|timed out/i)
  expect(blocked).toBe(1)
  finish({ buffer: Buffer.from('# Source'), stats: await fs.stat(join(owner, 'SKILL.md')) })
  await vi.advanceTimersByTimeAsync(11000)
  await old
  clearSkillDiscoveryCaches()
  vi.restoreAllMocks()
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  expect(
    (await discoverSkillsOnTarget(target, [], { includeWorkflows: true })).workflows?.documents[0]
      ?.source
  ).toContain('Source.')
})

it('lists the last repository workflow when the inventory exceeds the pending budget', async () => {
  const { home, target } = await fixture()
  const repos = await Promise.all(
    Array.from({ length: 10 }, async (_, index): Promise<Repo> => {
      const path = join(home, `repo-${index}`)
      await fs.mkdir(path, { recursive: true })
      return {
        id: `repo-${index}`,
        path,
        displayName: `Repo ${index}`,
        badgeColor: '#737373',
        addedAt: 1,
        kind: 'git',
        connectionId: null
      }
    })
  )
  const last = join(home, 'repo-9', '.agents', 'skills', 'last')
  await fs.mkdir(last, { recursive: true })
  await fs.writeFile(join(last, 'SKILL.md'), '---\nname: last\n---\nLast.')
  await fs.writeFile(
    join(last, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: Last.}]'
  )
  for (const refresh of [false, true]) {
    const result = await discoverSkillsOnTarget(target, repos, { includeWorkflows: true, refresh })
    expect(result.sources.length).toBeGreaterThan(64)
    expect(result.sources.filter((source) => source.skippedReason === 'unavailable')).toEqual([])
    expect(
      result.workflows?.entries.map((entry) => entry.definition?.stages[0]?.prompt)
    ).toContain('Last.')
  }
})
