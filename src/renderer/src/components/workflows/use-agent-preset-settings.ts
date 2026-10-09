import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import {
  AGENT_PRESETS_CAPABILITY,
  getAgentPresets,
  type AgentPreset,
  type WorkflowAgentBindings
} from '../../../../shared/agent-presets'

export type AgentPresetSettings = {
  agentPresets?: AgentPreset[]
  workflowAgentBindings?: WorkflowAgentBindings
}
export function useAgentPresetSettings(
  target: RuntimeClientTarget | null,
  unavailableReason?: string
) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const generation = useRef(0)
  // A new target identity marks a peer boundary even when its environment ID is unchanged.
  const owner = useMemo(
    () =>
      target
        ? {
            target,
            pairingRevision:
              target.kind === 'environment'
                ? getRuntimeEnvironmentRevision(target.environmentId)
                : undefined
          }
        : null,
    [target]
  )
  const [loaded, setLoaded] = useState<{
    owner: typeof owner
    settings: AgentPresetSettings
  } | null>(null)
  const active = useRef<{ owner: typeof owner; abort: AbortController } | null>(null)
  const settings = loaded?.owner === owner ? (loaded?.settings ?? null) : null
  const isCurrentOwner = useCallback(() => {
    return (
      !!owner &&
      active.current?.owner === owner &&
      !active.current.abort.signal.aborted &&
      (owner.target.kind === 'local' ||
        getRuntimeEnvironmentRevision(owner.target.environmentId) === owner.pairingRevision)
    )
  }, [owner])
  useEffect(() => {
    const current = ++generation.current
    setLoaded(null)
    setError(unavailableReason ?? null)
    setSaving(false)
    if (!owner || unavailableReason) {
      return
    }
    const abort = new AbortController()
    active.current = { owner, abort }
    const options = {
      signal: abort.signal,
      expectedEnvironmentPairingRevision: owner.pairingRevision
    }
    void (async () => {
      const status = await callRuntimeRpc<RuntimeStatus>(
        owner.target,
        'status.get',
        undefined,
        options
      )
      if (current !== generation.current || !isCurrentOwner()) {
        return
      }
      if (!status.capabilities?.includes(AGENT_PRESETS_CAPABILITY)) {
        throw new Error(
          translate(
            'agentPresets.updateRequired',
            'Update the owning runtime to configure Agent presets.'
          )
        )
      }
      const response = await callRuntimeRpc<{ settings: AgentPresetSettings }>(
        owner.target,
        'settings.get',
        undefined,
        options
      )
      if (current === generation.current && isCurrentOwner()) {
        setLoaded({ owner, settings: response.settings })
      }
    })().catch((cause: unknown) => {
      if (current === generation.current && isCurrentOwner()) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })
    return () => {
      abort.abort()
      generation.current = current + 1
    }
  }, [owner, unavailableReason, isCurrentOwner])
  async function save(updates: AgentPresetSettings): Promise<boolean> {
    if (!owner || !settings || saving || !isCurrentOwner()) {
      return false
    }
    const current = generation.current
    setSaving(true)
    setError(null)
    try {
      const response = await callRuntimeRpc<{ settings: AgentPresetSettings }>(
        owner.target,
        'settings.update',
        updates,
        {
          signal: active.current?.abort.signal,
          expectedEnvironmentPairingRevision: owner.pairingRevision
        }
      )
      if (current !== generation.current || !isCurrentOwner()) {
        return false
      }
      setLoaded({ owner, settings: response.settings })
      return true
    } catch (cause) {
      if (current === generation.current && isCurrentOwner()) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      return false
    } finally {
      if (current === generation.current && isCurrentOwner()) {
        setSaving(false)
      }
    }
  }
  return {
    owner,
    settings,
    presets: settings ? getAgentPresets(settings.agentPresets) : [],
    bindings: settings?.workflowAgentBindings ?? {},
    error,
    saving,
    save
  }
}
export type AgentPresetSettingsController = ReturnType<typeof useAgentPresetSettings>
