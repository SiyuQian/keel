import { useEffect, useMemo, useRef, useState } from 'react'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
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
  const [settings, setSettings] = useState<AgentPresetSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const generation = useRef(0)
  const environmentId = target?.kind === 'environment' ? target.environmentId : undefined
  const kind = target?.kind
  const owner = useMemo<RuntimeClientTarget | null>(
    () =>
      kind === 'environment' && environmentId
        ? { kind, environmentId }
        : kind === 'local'
          ? { kind }
          : null,
    [kind, environmentId]
  )
  useEffect(() => {
    const current = ++generation.current
    setSettings(null)
    setError(unavailableReason ?? null)
    setSaving(false)
    if (!owner || unavailableReason) {
      return
    }
    void (async () => {
      const status = await callRuntimeRpc<RuntimeStatus>(owner, 'status.get')
      if (!status.capabilities?.includes(AGENT_PRESETS_CAPABILITY)) {
        throw new Error('Update the owning runtime to configure Agent presets.')
      }
      const response = await callRuntimeRpc<{ settings: AgentPresetSettings }>(
        owner,
        'settings.get'
      )
      if (current === generation.current) {
        setSettings(response.settings)
      }
    })().catch((cause: unknown) => {
      if (current === generation.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })
    return () => {
      generation.current = current + 1
    }
  }, [owner, unavailableReason])
  async function save(updates: AgentPresetSettings): Promise<boolean> {
    if (!owner || !settings || saving) {
      return false
    }
    const current = generation.current
    setSaving(true)
    setError(null)
    try {
      const response = await callRuntimeRpc<{ settings: AgentPresetSettings }>(
        owner,
        'settings.update',
        updates
      )
      if (current !== generation.current) {
        return false
      }
      setSettings(response.settings)
      return true
    } catch (cause) {
      if (current === generation.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      return false
    } finally {
      if (current === generation.current) {
        setSaving(false)
      }
    }
  }
  return {
    settings,
    presets: settings ? getAgentPresets(settings.agentPresets) : [],
    bindings: settings?.workflowAgentBindings ?? {},
    error,
    saving,
    save
  }
}
export type AgentPresetSettingsController = ReturnType<typeof useAgentPresetSettings>
