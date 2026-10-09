import { translate } from '@/i18n/i18n'
import { resolveWorkflowAgent } from '../../../../shared/agent-presets'
import type { AgentPresetSettingsController } from './use-agent-preset-settings'
import { AgentChoice } from './AgentChoice'

export function WorkflowAgentBinding({
  workflowId,
  stepId,
  controller
}: {
  workflowId: string
  stepId?: string
  controller: AgentPresetSettingsController
}): React.JSX.Element {
  const { settings, presets, bindings, saving, error, save } = controller
  const binding = bindings[workflowId]
  let resolved
  let missing: string | null = null
  try {
    resolved = resolveWorkflowAgent(presets, binding, stepId ?? '')
  } catch (cause) {
    missing = cause instanceof Error ? cause.message : String(cause)
  }
  const label = stepId
    ? translate('agentPresets.stepAgent', 'Step Agent')
    : translate('agentPresets.defaultAgent', 'Workflow default Agent')
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      <AgentChoice
        label={label}
        value={stepId ? binding?.stepAgentIds?.[stepId] : binding?.defaultAgentId}
        presets={presets}
        disabled={!settings || saving}
        emptyLabel={
          stepId
            ? translate('agentPresets.inherit', 'Use workflow default')
            : translate('agentPresets.unconfigured', 'No Agent configured')
        }
        onChange={(id) => {
          const next = { ...binding }
          if (stepId) {
            next.stepAgentIds = { ...binding?.stepAgentIds }
            if (id) {
              next.stepAgentIds[stepId] = id
            } else {
              delete next.stepAgentIds[stepId]
            }
          } else if (id) {
            next.defaultAgentId = id
          } else {
            delete next.defaultAgentId
          }
          void save({ workflowAgentBindings: { ...bindings, [workflowId]: next } })
        }}
      />
      {missing ? (
        <p role="alert" className="break-words text-xs text-destructive">
          {missing}
        </p>
      ) : null}
      {resolved ? (
        <p className="break-words text-xs text-muted-foreground">
          {resolved.name} · {resolved.provider} ·{' '}
          {resolved.model ?? translate('agentPresets.providerDefault', 'Provider default')} ·{' '}
          {resolved.effort ?? translate('agentPresets.providerDefault', 'Provider default')}
        </p>
      ) : null}
      {resolved && stepId ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          orca orchestration worker-start --spec &lt;task&gt; --agent-preset {resolved.id}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {saving ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('agentPresets.saving', 'Saving…')}
        </p>
      ) : null}
    </section>
  )
}
