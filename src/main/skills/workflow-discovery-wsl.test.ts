import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as reader from '../../shared/node-bounded-file-reader'
import { observeWorkflows } from './workflow-discovery'

it('reads WSL siblings and documents only through the owning distro with bounded concurrency', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-wsl-'))
  const yaml = join(directory, 'workflow.yaml')
  const markdown = join(directory, 'SKILL.md')
  await writeFile(yaml, 'version: 1\nstages: [{id: read, session: worker, prompt: Read.}]')
  await writeFile(markdown, '# Installed Skill')
  const original = reader.readNodeFileWithinLimit
  let active = 0
  let peak = 0
  const reads: string[] = []
  const spy = vi
    .spyOn(reader, 'readNodeFileWithinLimit')
    .mockImplementation(async (path, limit, options) => {
      reads.push(path)
      expect(limit).toBe(131072)
      expect(options?.regularFileOnly).toBe(true)
      active++
      peak = Math.max(peak, active)
      try {
        return await original(path.endsWith('workflow.yaml') ? yaml : markdown, limit, options)
      } finally {
        active--
      }
    })
  try {
    const skills = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: 'example',
      description: null,
      providers: ['agent-skills'] as const,
      sourceKind: 'home' as const,
      sourceLabel: 'Home',
      rootPath: '/home/dev/skills',
      directoryPath: `/home/dev/skills/${i}`,
      skillFilePath: '/home/dev/skills/example/SKILL.md',
      installed: true,
      updatedAt: null
    })).map((skill) => ({ ...skill, providers: [...skill.providers] }))
    const result = await observeWorkflows(skills, {
      kind: 'wsl',
      distro: 'Ubuntu',
      homeDir: '/home/dev',
      cwd: undefined
    })
    expect(result.entries).toHaveLength(8)
    expect(result.entries[0]?.path).toBe('/home/dev/skills/0/workflow.yaml')
    expect(reads[0]).toBe('\\\\wsl.localhost\\Ubuntu\\home\\dev\\skills\\0\\workflow.yaml')
    expect(reads.filter((path) => path.endsWith('SKILL.md'))).toEqual([
      '\\\\wsl.localhost\\Ubuntu\\home\\dev\\skills\\example\\SKILL.md'
    ])
    expect(peak).toBeLessThanOrEqual(4)
  } finally {
    spy.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})
