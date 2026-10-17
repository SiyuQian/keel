import { describe, expect, it } from 'vitest'
import { runSkillCandidateTasks } from './skill-candidate-concurrency'

describe('runSkillCandidateTasks', () => {
  it('bounds concurrency and preserves task order', async () => {
    let active = 0
    let maxActive = 0
    const results = await runSkillCandidateTasks(
      Array.from({ length: 12 }, (_, index) => async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 12 - index))
        active -= 1
        return index
      })
    )

    expect(maxActive).toBe(4)
    expect(results).toEqual(Array.from({ length: 12 }, (_, index) => index))
  })

  it('rejects only after running siblings settle and starts no further task', async () => {
    const gates: (() => void)[] = []
    let started = 0
    let settled = 0
    const outcome = runSkillCandidateTasks(
      Array.from({ length: 8 }, (_, index) => async () => {
        started += 1
        if (index === 0) {
          throw new Error('first failed')
        }
        await new Promise<void>((resolve) => gates.push(resolve))
        settled += 1
        return index
      })
    ).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : 'unknown')
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(started).toBe(4)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending')
    for (const release of gates.splice(0)) {
      release()
    }
    expect(await outcome).toBe('first failed')
    expect(settled).toBe(3)
    expect(started).toBe(4)
  })
})
