import { useCallback, useEffect, useState } from 'react'
import { discoverSkillsForRuntimeTarget } from '@/runtime/runtime-skills-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { SkillDiscoveryResult, SkillDiscoveryTarget } from '../../../../shared/skills'

export function useWorkflowInventory(
  runtimeTarget: RuntimeClientTarget | null,
  discoveryTarget?: SkillDiscoveryTarget
) {
  const [attempt, setAttempt] = useState(0)
  const [scan, setScan] = useState<{
    runtimeTarget: RuntimeClientTarget
    discoveryTarget?: SkillDiscoveryTarget
    attempt: number
    result?: SkillDiscoveryResult
    error?: string
  } | null>(null)
  const [loadingRequest, setLoadingRequest] = useState<{
    runtimeTarget: RuntimeClientTarget
    discoveryTarget?: SkillDiscoveryTarget
    attempt: number
  } | null>(null)
  useEffect(() => {
    if (!runtimeTarget) {
      return
    }
    let active = true
    const timer = setTimeout(
      () => setLoadingRequest({ runtimeTarget, discoveryTarget, attempt }),
      200
    )
    void discoverSkillsForRuntimeTarget(runtimeTarget, {
      ...discoveryTarget,
      includeWorkflows: true,
      ...(attempt > 0 ? { refresh: true } : {})
    }).then(
      (result) => {
        clearTimeout(timer)
        if (active) {
          setScan({ runtimeTarget, discoveryTarget, attempt, result })
        }
      },
      (error: unknown) => {
        clearTimeout(timer)
        if (active) {
          setScan({
            runtimeTarget,
            discoveryTarget,
            attempt,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [runtimeTarget, discoveryTarget, attempt])
  const current =
    scan?.runtimeTarget === runtimeTarget &&
    scan?.discoveryTarget === discoveryTarget &&
    scan?.attempt === attempt
      ? scan
      : null
  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  const previous =
    scan?.runtimeTarget === runtimeTarget && scan?.discoveryTarget === discoveryTarget ? scan : null
  return {
    result: current ? current.result : previous?.result,
    error: current?.error,
    loading: !current,
    visibleLoading:
      !current &&
      loadingRequest?.runtimeTarget === runtimeTarget &&
      loadingRequest?.discoveryTarget === discoveryTarget &&
      loadingRequest?.attempt === attempt,
    refresh
  }
}
