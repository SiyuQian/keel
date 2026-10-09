import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { DiscoveredSkill } from '../../shared/skills'
import { observeWorkflows } from './workflow-discovery'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture(): Promise<DiscoveredSkill> {
  const directoryPath = await mkdtemp(join(tmpdir(), 'workflow-observation-'))
  directories.push(directoryPath)
  const skillFilePath = join(directoryPath, 'SKILL.md')
  await writeFile(skillFilePath, '---\nname: example\nversion: 0.3.2\n---\nRead this skill.')
  return {
    id: directoryPath,
    name: 'example',
    description: 'A workflow.',
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Home',
    rootPath: directoryPath,
    directoryPath,
    skillFilePath,
    installed: true,
    updatedAt: null
  }
}
it('reads fixed siblings and source documents while retaining invalid definitions', async () => {
  const [valid, absent, invalid] = await Promise.all([fixture(), fixture(), fixture()])
  const source =
    'version: 1\nstages:\n  - { id: read, session: worker, skill: example, prompt: Read. }\n'
  await writeFile(join(valid.directoryPath, 'workflow.yaml'), source)
  await writeFile(join(invalid.directoryPath, 'workflow.yaml'), 'version: 2')
  const observation = await observeWorkflows([valid, absent, invalid], {
    kind: 'native-host',
    cwd: undefined
  })
  expect(observation.entries).toHaveLength(2)
  expect(observation.entries[0]).toMatchObject({
    ownerId: valid.id,
    source,
    definition: { version: 1 }
  })
  expect(observation.entries[1]?.error).toBeTruthy()
  expect(observation.documents.find((d) => d.skillId === valid.id)).toMatchObject({
    packageVersion: '0.3.2',
    source: expect.stringContaining('Read this skill.')
  })
})
it('makes oversized and non-file source errors visible', async () => {
  const [oversized, unreadable] = await Promise.all([fixture(), fixture()])
  await writeFile(join(oversized.directoryPath, 'workflow.yaml'), 'x'.repeat(131073))
  await mkdir(join(unreadable.directoryPath, 'workflow.yaml'))
  const result = await observeWorkflows([oversized, unreadable], {
    kind: 'native-host',
    cwd: undefined
  })
  expect(result.entries).toHaveLength(2)
  expect(result.entries.every((entry) => entry.error && entry.source === null)).toBe(true)
})
it('reads the installed metadata.version convention without treating body text as metadata', async () => {
  const skill = await fixture()
  await writeFile(
    skill.skillFilePath,
    '---\nname: example\nmetadata:\n  version: "0.3.2"\n---\nversion: body text'
  )
  await writeFile(
    join(skill.directoryPath, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: Read.}]'
  )
  const result = await observeWorkflows([skill], { kind: 'native-host', cwd: undefined })
  expect(result.documents[0]?.packageVersion).toBe('0.3.2')
})
it('bounds candidate scans and aggregate output with visible partial inventory', async () => {
  const skill = await fixture()
  await writeFile(
    join(skill.directoryPath, 'workflow.yaml'),
    'version: 1\nstages: [{id: read, session: worker, prompt: Read.}]'
  )
  const result = await observeWorkflows(
    Array.from({ length: 257 }, (_, i) => ({ ...skill, id: String(i) })),
    { kind: 'native-host', cwd: undefined }
  )
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(result.issues.join(' ')).toContain('256')
})
it('stops before aggregate source bytes exceed the response limit', async () => {
  const skill = await fixture()
  await writeFile(
    join(skill.directoryPath, 'workflow.yaml'),
    `version: 1\nstages: [{id: read, session: worker, prompt: "${'x'.repeat(90000)}"}]`
  )
  const result = await observeWorkflows(
    Array.from({ length: 20 }, (_, i) => ({ ...skill, id: String(i) })),
    { kind: 'native-host', cwd: undefined }
  )
  expect(result.entries.length).toBeGreaterThan(0)
  expect(result.entries.length).toBeLessThan(20)
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(result.issues.join(' ')).toContain('2 MiB')
})
