import { afterEach, expect, it, vi } from 'vitest'
import { stat } from 'node:fs/promises'
import * as reader from '../../shared/node-bounded-file-reader'
import { observeWorkflows } from './workflow-discovery'
import type { DiscoveredSkill } from '../../shared/skills'

const stats = await stat(process.cwd())
const skill = (id: string): DiscoveredSkill => ({
  id,
  name: id,
  description: null,
  providers: ['codex'],
  sourceKind: 'home',
  sourceLabel: 'Home',
  rootPath: '/skills',
  directoryPath: `/skills/${id}`,
  skillFilePath: `/skills/${id}/SKILL.md`,
  installed: true,
  updatedAt: null
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('releases callers on a stalled read, shares retries and recovers after the underlying read returns', async () => {
  vi.useFakeTimers()
  let finish!: (value: reader.BoundedNodeFileRead) => void
  let signal: AbortSignal | undefined
  const spy = vi
    .spyOn(reader, 'readNodeFileWithinLimit')
    .mockImplementationOnce((_path, _limit, options) => {
      signal = options?.signal
      return new Promise<reader.BoundedNodeFileRead>((resolve) => {
        finish = resolve
      })
    })
  const target = { kind: 'native-host', cwd: undefined } as const
  const results = Promise.allSettled([
    observeWorkflows([skill('stalled')], target),
    observeWorkflows([skill('stalled')], target)
  ])
  await vi.advanceTimersByTimeAsync(10000)
  expect(await Promise.race([results, Promise.resolve('pending')])).not.toBe('pending')
  const answers = await results
  expect(
    answers.every(
      (answer) => answer.status === 'rejected' && /try again/i.test(String(answer.reason))
    )
  ).toBe(true)
  expect(spy).toHaveBeenCalledTimes(1)
  expect(signal?.aborted).toBe(true)
  await expect(observeWorkflows([skill('stalled')], target)).rejects.toThrow(/try again/i)
  expect(spy).toHaveBeenCalledTimes(1)
  spy.mockRejectedValue(Object.assign(new Error('Absent'), { code: 'ENOENT' }))
  finish({
    buffer: Buffer.from('version: 1\nstages: [{id: read, session: worker, prompt: Read.}]'),
    stats
  })
  await vi.advanceTimersByTimeAsync(0)
  expect((await observeWorkflows([skill('stalled')], target)).entries).toEqual([])
})
it('reads independent Skill documents with four workers and preserves inventory order', async () => {
  const installed = Array.from({ length: 8 }, (_, i) => skill(`parallel-${i}`))
  let active = 0
  let peak = 0
  vi.spyOn(reader, 'readNodeFileWithinLimit').mockImplementation(async (path) => {
    const document = path.endsWith('SKILL.md')
    if (document) {
      active++
      peak = Math.max(peak, active)
    }
    await new Promise((resolve) => setImmediate(resolve))
    if (document) {
      active--
    }
    return {
      buffer: Buffer.from(
        document ? '# Source' : 'version: 1\nstages: [{id: read, session: worker, prompt: Read.}]'
      ),
      stats
    }
  })
  const result = await observeWorkflows(installed, { kind: 'native-host', cwd: undefined })
  expect(peak).toBe(4)
  expect(result.documents.map((document) => document.skillId)).toEqual(installed.map((s) => s.id))
})

it('does not share observations when referenced Skills differ beyond the candidate limit', async () => {
  vi.spyOn(reader, 'readNodeFileWithinLimit').mockImplementation(async (path) => {
    await new Promise((resolve) => setImmediate(resolve))
    if (path.endsWith('workflow.yaml') && path !== '/skills/owner/workflow.yaml') {
      throw Object.assign(new Error('Absent'), { code: 'ENOENT' })
    }
    const source = path.endsWith('workflow.yaml')
      ? 'version: 1\nstages: [{id: read, session: worker, skill: reference, prompt: Read.}]'
      : path.includes('/first/')
        ? '# First source'
        : '# Second source'
    return { buffer: Buffer.from(source), stats }
  })
  const prefix = [skill('owner'), ...Array.from({ length: 255 }, (_, i) => skill(`absent-${i}`))]
  const reference = {
    ...skill('reference'),
    directoryPath: '/skills/first',
    skillFilePath: '/skills/first/SKILL.md'
  }
  const target = { kind: 'native-host', cwd: undefined } as const
  const [first, second] = await Promise.all([
    observeWorkflows([...prefix, reference], target),
    observeWorkflows(
      [...prefix, { ...reference, skillFilePath: '/skills/second/SKILL.md' }],
      target
    )
  ])
  expect(first.documents.find((document) => document.skillId === 'reference')?.source).toBe(
    '# First source'
  )
  expect(second.documents.find((document) => document.skillId === 'reference')?.source).toBe(
    '# Second source'
  )
})
