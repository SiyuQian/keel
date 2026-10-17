const MAX_CONCURRENT_SKILL_CANDIDATES = 4

export async function runSkillCandidateTasks<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency = MAX_CONCURRENT_SKILL_CANDIDATES
): Promise<T[]> {
  const results = Array.from<T>({ length: tasks.length })
  let nextIndex = 0
  let failure: { error: unknown } | undefined

  async function worker(): Promise<void> {
    while (!failure) {
      const index = nextIndex
      nextIndex += 1
      if (index >= tasks.length) {
        return
      }
      try {
        results[index] = await tasks[index]()
      } catch (error) {
        failure ??= { error }
      }
    }
  }

  // Why: rejecting on the first error let sibling tasks keep running after the
  // caller, and any budget slot it holds, had moved on. Settle them, start no more.
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  if (failure) {
    throw failure.error
  }
  return results
}
