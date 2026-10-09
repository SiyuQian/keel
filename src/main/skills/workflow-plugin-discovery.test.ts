import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { clearSkillRootScanCache, discoverSkills } from './discovery'
import { workflowSkillCandidates } from '../../shared/workflow-skill-reference'
import { runProcess } from '../../shared/child-process/run-process'
import { buildWslSkillDiscoveryCommand, parseWslSkillDiscoveryOutput } from './skill-discovery-wsl'
import { buildSkillDiscoverySources } from './skill-discovery-sources'
import { resolveClaudePluginSkillSources } from './claude-plugin-skill-sources'
import { observeWorkflows } from './workflow-discovery'

const directories: string[] = []
afterEach(async () => {
  clearSkillRootScanCache()
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  vi.stubEnv('HERMES_HOME', '')
  const homeDir = await mkdtemp(join(tmpdir(), 'workflow-plugin-inventory-'))
  directories.push(homeDir)
  const codex = join(homeDir, '.codex', 'plugins', 'cache', 'market', 'unrelated-directory', '1.0')
  const claude = join(
    homeDir,
    '.claude',
    'plugins',
    'cache',
    'market',
    'arbitrary-directory',
    '2.0'
  )
  for (const packageRoot of [codex, claude]) {
    await mkdir(join(packageRoot, 'skills', 'pr-review'), { recursive: true })
    await writeFile(
      join(packageRoot, 'skills', 'pr-review', 'SKILL.md'),
      '---\nname: pr-review\ndescription: Review the change.\n---\nRead this source.'
    )
  }
  await mkdir(join(codex, '.codex-plugin'))
  await writeFile(
    join(codex, '.codex-plugin', 'plugin.json'),
    '{"name":"devpilot","skills":"./skills"}'
  )
  await writeFile(
    join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'devpilot@market': [{ scope: 'user', installPath: claude }] } })
  )
  await writeFile(
    join(homeDir, '.claude', 'settings.json'),
    '{"enabledPlugins":{"devpilot@market":true}}'
  )
  const owner = join(homeDir, '.agents', 'skills', 'orca-dev-workflow')
  await mkdir(owner, { recursive: true })
  await writeFile(join(owner, 'SKILL.md'), '---\nname: orca-dev-workflow\n---\nOwner.')
  await writeFile(
    join(owner, 'workflow.yaml'),
    'version: 1\nstages: [{id: review, session: worker, skill: "devpilot:pr-review", prompt: Review.}]'
  )
  return { homeDir, codex, claude }
}
it('resolves actual Codex and Claude discoveries and retains namespace aliases after canonical deduplication', async () => {
  const { homeDir, codex, claude } = await fixture()
  await mkdir(join(homeDir, '.codex', 'skills'), { recursive: true })
  await symlink(
    join(codex, 'skills', 'pr-review'),
    join(homeDir, '.codex', 'skills', 'alias'),
    'dir'
  )
  const result = await discoverSkills({ homeDir, cwd: homeDir })
  const matches = workflowSkillCandidates('devpilot:pr-review', result.skills)
  expect(matches.map((skill) => skill.skillFilePath).sort()).toEqual(
    [
      join(homeDir, '.codex', 'skills', 'alias', 'SKILL.md'),
      join(claude, 'skills', 'pr-review', 'SKILL.md')
    ].sort()
  )
  expect(workflowSkillCandidates('unrelated-directory:pr-review', result.skills)).toEqual([])
  expect(workflowSkillCandidates('wrong:pr-review', result.skills)).toEqual([])
  const observation = await observeWorkflows(result.skills, { kind: 'native-host', cwd: undefined })
  expect(
    matches.every((skill) =>
      observation.documents.some(
        (document) =>
          document.skillId === skill.id && document.source?.includes('Read this source.')
      )
    )
  ).toBe(true)
})
it('includes user Claude workflows without client cwd only for the workflow inventory scope', async () => {
  const { homeDir, claude } = await fixture()
  await writeFile(
    join(claude, 'skills', 'pr-review', 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: Read.}]'
  )
  const ordinary = await discoverSkills({ homeDir, includeCwd: false })
  expect(ordinary.skills.some((skill) => skill.providers.includes('claude'))).toBe(false)
  const workflows = await discoverSkills({ homeDir, includeCwd: false, includeUserPlugins: true })
  const observation = await observeWorkflows(workflows.skills, {
    kind: 'native-host',
    cwd: undefined
  })
  expect(
    observation.entries.some(
      (entry) => entry.path === join(claude, 'skills', 'pr-review', 'workflow.yaml')
    )
  ).toBe(true)
})
it('does not infer a namespace from a cache path when the manifest is absent', async () => {
  const { homeDir, codex } = await fixture()
  await rm(join(codex, '.codex-plugin'), { recursive: true })
  const result = await discoverSkills({ homeDir, includeCwd: false })
  expect(workflowSkillCandidates('devpilot:pr-review', result.skills)).toEqual([])
  expect(workflowSkillCandidates('pr-review', result.skills)).toHaveLength(1)
})

it.skipIf(process.platform === 'win32')(
  'executes the distro scanner against real plugin manifests and sources',
  async () => {
    const { homeDir, claude } = await fixture()
    const roots = [
      ...buildSkillDiscoverySources({ homeDir, includeCwd: false }),
      ...resolveClaudePluginSkillSources({
        cwd: homeDir,
        metadata: {
          installedPlugins: JSON.stringify({
            plugins: { 'devpilot@market': [{ scope: 'user', installPath: claude }] }
          }),
          settings: ['{"enabledPlugins":{"devpilot@market":true}}']
        }
      })
    ]
    const scan = await runProcess({
      program: 'bash',
      args: ['-c', buildWslSkillDiscoveryCommand(roots)],
      timeoutMs: 10000,
      maxOutputBytes: 2 * 1024 * 1024
    })
    expect(scan.code).toBe(0)
    const result = parseWslSkillDiscoveryOutput(scan.stdout, roots)
    expect(workflowSkillCandidates('devpilot:pr-review', result.skills)).toHaveLength(2)
    expect(workflowSkillCandidates('arbitrary-directory:pr-review', result.skills)).toEqual([])
  }
)

it('keeps current workspace namespaces when two aliases use the same installed package', async () => {
  const { homeDir, claude } = await fixture()
  const workspaces = [join(homeDir, 'alpha'), join(homeDir, 'beta')]
  await writeFile(
    join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      plugins: Object.fromEntries(
        ['alpha', 'beta'].map((name) => [
          `${name}@market`,
          [{ scope: 'user', installPath: claude }]
        ])
      )
    })
  )
  for (const [index, name] of ['alpha', 'beta'].entries()) {
    const cwd = workspaces[index]!
    await mkdir(join(cwd, '.claude'), { recursive: true })
    await writeFile(
      join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: {
          'alpha@market': name === 'alpha',
          'beta@market': name === 'beta',
          'devpilot@market': false
        }
      })
    )
    const result = await discoverSkills({ homeDir, cwd })
    expect(workflowSkillCandidates(`${name}:pr-review`, result.skills)).toHaveLength(1)
    expect(
      workflowSkillCandidates(`${name === 'alpha' ? 'beta' : 'alpha'}:pr-review`, result.skills)
    ).toEqual([])
  }
})

it.each(['native', 'wsl'])(
  'finds distinct workflow siblings of %s file-only Skill aliases and deduplicates equivalent siblings',
  async (runtime) => {
    const { homeDir, codex } = await fixture()
    const linked = join(homeDir, '.agents', 'skills', 'linked')
    const packageDirectory = join(codex, 'skills', 'pr-review')
    await mkdir(linked, { recursive: true })
    await symlink(join(packageDirectory, 'SKILL.md'), join(linked, 'SKILL.md'), 'file')
    const yaml =
      'version: 1\nname: Plugin workflow\nstages: [{id: read, session: worker, prompt: Read.}]'
    await writeFile(join(packageDirectory, 'workflow.yaml'), yaml)
    const discover = async (refresh = false) => {
      if (runtime === 'native') {
        return discoverSkills({ homeDir, includeCwd: false, refresh })
      }
      const roots = buildSkillDiscoverySources({ homeDir, includeCwd: false })
      const scan = await runProcess({
        program: 'bash',
        args: ['-c', buildWslSkillDiscoveryCommand(roots)],
        timeoutMs: 10000,
        maxOutputBytes: 2 * 1024 * 1024
      })
      expect(scan.code).toBe(0)
      return parseWslSkillDiscoveryOutput(scan.stdout, roots)
    }
    let result = await discover()
    let observation = await observeWorkflows(result.skills, { kind: 'native-host', cwd: undefined })
    expect(
      observation.entries.filter((entry) => entry.definition?.name === 'Plugin workflow')
    ).toHaveLength(1)
    await writeFile(join(linked, 'workflow.yaml'), yaml.replace('Plugin workflow', 'Home workflow'))
    result = await discover(true)
    observation = await observeWorkflows(result.skills, { kind: 'native-host', cwd: undefined })
    expect(
      observation.entries.filter(
        (entry) => entry.ownerId === result.skills.find((skill) => skill.name === 'pr-review')?.id
      )
    ).toHaveLength(2)
    await rm(join(linked, 'workflow.yaml'))
    await symlink(join(packageDirectory, 'workflow.yaml'), join(linked, 'workflow.yaml'), 'file')
    observation = await observeWorkflows(result.skills, { kind: 'native-host', cwd: undefined })
    expect(
      observation.entries.filter((entry) => entry.definition?.name === 'Plugin workflow')
    ).toHaveLength(1)
  }
)

it.skipIf(process.platform === 'win32')(
  'reads and emits each WSL package manifest once for multiple Skills',
  async () => {
    const { homeDir, codex } = await fixture()
    await mkdir(join(codex, 'skills', 'second'), { recursive: true })
    await writeFile(
      join(codex, 'skills', 'second', 'SKILL.md'),
      '---\nname: second\n---\nSecond source.'
    )
    const roots = buildSkillDiscoverySources({ homeDir, includeCwd: false }).filter(
      (root) => root.id === 'codex-plugin-cache'
    )
    const scan = await runProcess({
      program: 'bash',
      args: ['-c', buildWslSkillDiscoveryCommand(roots)],
      timeoutMs: 10000,
      maxOutputBytes: 2 * 1024 * 1024
    })
    expect(scan.code).toBe(0)
    expect(scan.stdout.split('\0').filter((field) => field === 'P')).toHaveLength(1)
    const skills = parseWslSkillDiscoveryOutput(scan.stdout, roots).skills
    expect(workflowSkillCandidates('devpilot:pr-review', skills)).toHaveLength(1)
    expect(workflowSkillCandidates('devpilot:second', skills)).toHaveLength(1)
  }
)
