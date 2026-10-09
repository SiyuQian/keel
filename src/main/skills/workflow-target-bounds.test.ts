import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldIO, setTimeout as waitForIO } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import * as reader from '../../shared/node-bounded-file-reader'
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
    for (let i = 0; i < 500 && !blocked; i++) {
      await waitForIO(2)
    }
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
  let yamlReads = 0
  let finish!: (value: reader.BoundedNodeFileRead) => void
  vi.spyOn(reader, 'readNodeFileWithinLimit').mockImplementation((path, limit, options) => {
    if (path === join(owner, 'SKILL.md')) {
      blocked++
      return new Promise((resolve) => {
        finish = resolve
        releases.push(() => resolve({ buffer: Buffer.from('# Source'), stats: sourceStats }))
      })
    }
    return original(path, limit, options).then((value) => {
      if (path === join(owner, 'workflow.yaml')) {
        yamlReads++
      }
      return value
    })
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const old = discoverSkillsOnTarget(target, [], { includeWorkflows: true }).catch(() => undefined)
  for (let i = 0; i < 500 && !blocked; i++) {
    await waitForIO(2)
  }
  expect(blocked).toBe(1)
  await fs.writeFile(
    join(owner, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: New.}]'
  )
  const refreshed = discoverSkillsOnTarget(target, [], { includeWorkflows: true, refresh: true })
  void refreshed.catch(() => undefined)
  for (let i = 0; i < 500 && yamlReads < 2; i++) {
    await waitForIO(2)
  }
  expect(yamlReads).toBe(2)
  await vi.advanceTimersByTimeAsync(2500)
  await drain()
  const result = await refreshed
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
