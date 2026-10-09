import { AGENT_PRESETS_CAPABILITY, type AgentPreset } from '../../../../../../shared/agent-presets'
import type { AgentLaunchPreferences } from '../../../../../../shared/agent-session-host-authority'
import {
  findCatalogModel,
  findCatalogOption
} from '../../../../../../shared/agent-session-option-catalog'
import {
  getAgentSessionOptionLaunchCatalog,
  resolveAgentSessionOptionLaunch
} from '../../../../../../shared/agent-session-option-launch'
import { ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY } from '../../../../../../shared/protocol-version'
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

export type OrchestrationWorkerLaunchSelection = {
  agent: TuiAgent | null
  model: string | null
  effort: string | null
  agentPreset?: AgentPreset
}

export type OrchestrationWorkerLaunchReceipt = {
  requested: OrchestrationWorkerLaunchSelection
  effective: OrchestrationWorkerLaunchSelection | null
}

export function createWorkerLaunchReceipt(args: {
  agent: TuiAgent | null
  model?: string
  effort?: string
  agentPreset?: AgentPreset
}): OrchestrationWorkerLaunchReceipt {
  const selection = {
    agent: args.agent,
    model: args.model ?? null,
    effort: args.effort ?? null,
    ...(args.agentPreset ? { agentPreset: { ...args.agentPreset } } : {})
  }
  return { requested: selection, effective: { ...selection } }
}

export function createPendingWorkerLaunchReceipt(args: {
  agent: TuiAgent | null
  model?: string
  effort?: string
  agentPreset?: AgentPreset
}): OrchestrationWorkerLaunchReceipt {
  return {
    requested: {
      agent: args.agent,
      model: args.model ?? null,
      effort: args.effort ?? null,
      ...(args.agentPreset ? { agentPreset: { ...args.agentPreset } } : {})
    },
    effective: null
  }
}

export function resolveWorkerLaunchPreferences(args: {
  agent: TuiAgent
  openCodeModelLaunchSupported?: boolean
  createsWorktree?: boolean
  model?: string
  effort?: string
  agentPreset?: AgentPreset
}): {
  preferences: AgentLaunchPreferences | undefined
  receipt: OrchestrationWorkerLaunchReceipt
} {
  if (args.effort && !args.model) {
    throw new OrchestrationError('invalid_argument', '--effort requires --model.')
  }
  if (!args.model) {
    return {
      preferences: args.agentPreset ? { agentPreset: { ...args.agentPreset } } : undefined,
      receipt: createWorkerLaunchReceipt({ agent: args.agent, agentPreset: args.agentPreset })
    }
  }

  if (args.agent === 'opencode' && args.createsWorktree) {
    throw new OrchestrationError(
      'capability_unsupported',
      'OpenCode model selection requires an existing worktree. Use --worktree current or an existing worktree selector, or omit --model.'
    )
  }

  if (args.agent === 'opencode' && args.openCodeModelLaunchSupported !== true) {
    throw new OrchestrationError(
      'capability_unsupported',
      'This OpenCode TUI cannot verify launch-time model selection. Omit --model or use a supported OpenCode CLI.'
    )
  }

  const catalog = getAgentSessionOptionLaunchCatalog(args.agent)
  if (!catalog?.supportsWorkerLaunchPreferences || !catalog.modelApply.launchArgs) {
    throw new OrchestrationError(
      'invalid_argument',
      `Agent ${args.agent} does not support launch-time model selection. Omit --model to run the model from its own config.`
    )
  }

  if (args.effort) {
    const model = findCatalogModel(catalog, args.model)
    const option =
      findCatalogOption(model, 'effort') ??
      (!model
        ? catalog.unknownModelOptions?.find((candidate) => candidate.id === 'effort')
        : undefined)
    if (
      option?.kind.type !== 'select' ||
      !option.kind.choices.some((choice) => choice.value === args.effort)
    ) {
      throw new OrchestrationError(
        'invalid_argument',
        `Agent ${args.agent} model ${args.model} does not support effort ${args.effort}.`
      )
    }
  }

  const requested = {
    model: args.model,
    ...(args.effort ? { effort: args.effort } : {})
  }
  const resolved = resolveAgentSessionOptionLaunch(args.agent, requested, [], false)
  if (
    resolved.appliedValues.model !== args.model ||
    resolved.appliedValues.effort !== args.effort
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      `Agent ${args.agent} cannot apply the requested worker launch preferences.`
    )
  }

  const preferences: AgentLaunchPreferences = {
    ...requested,
    ...(args.agentPreset ? { agentPreset: { ...args.agentPreset } } : {})
  }
  return {
    preferences,
    receipt: createWorkerLaunchReceipt({ agent: args.agent, ...preferences })
  }
}

export function assertWorkerLaunchPreferencesCreateTerminal(args: {
  terminal?: string
  model?: string
  effort?: string
  agentPreset?: string
}): void {
  if (args.terminal && (args.model || args.effort || args.agentPreset)) {
    throw new OrchestrationError(
      'invalid_argument',
      args.agentPreset
        ? '--agent-preset requires a fresh session and cannot reuse --terminal.'
        : '--model and --effort cannot be applied when reusing an existing terminal.'
    )
  }
}

export function assertWorkerLaunchPreferencesRuntimeSupported(args: {
  model?: string
  effort?: string
  agentPreset?: string
  capabilities?: readonly string[]
  serverName: string
}): void {
  if (args.agentPreset && !args.capabilities?.includes(AGENT_PRESETS_CAPABILITY)) {
    throw new OrchestrationError(
      'capability_unsupported',
      `Connected server ${args.serverName} does not support Agent presets.`
    )
  }
  if (
    (args.model || args.effort) &&
    !args.capabilities?.includes(ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY)
  ) {
    throw new OrchestrationError(
      'capability_unsupported',
      `Connected server ${args.serverName} does not support worker model or effort overrides.`
    )
  }
}

export function resolveFederatedWorkerLaunchReceipt(
  remote: OrchestrationWorkerLaunchReceipt | undefined,
  requested: OrchestrationWorkerLaunchReceipt,
  remoteReady: boolean
): OrchestrationWorkerLaunchReceipt {
  if (remote) {
    return remote
  }
  return remoteReady
    ? { requested: requested.requested, effective: { ...requested.requested } }
    : requested
}
