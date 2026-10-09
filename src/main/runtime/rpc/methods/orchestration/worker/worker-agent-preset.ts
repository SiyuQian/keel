import {
  type WorkerStartModeReceipt,
  decideWorkerStartMode,
  readWorkerStartModeSettings
} from '../../orchestration-worker-start-mode'
import {
  AgentPresetSchema,
  getAgentPresets,
  type AgentPreset
} from '../../../../../../shared/agent-presets'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

export function resolveWorkerAgentPreset(
  runtime: Pick<OrcaRuntimeService, 'getClientSettings'>,
  params: {
    agentPreset?: string
    agent?: string
    terminal?: string
    model?: string
    effort?: string
  }
): AgentPreset | undefined {
  if (!params.agentPreset) {
    return undefined
  }
  if (params.terminal || params.agent || params.model || params.effort) {
    throw new OrchestrationError(
      'invalid_argument',
      '--agent-preset requires a fresh session and cannot combine with --terminal, --agent, --model or --effort.'
    )
  }
  const preset = getAgentPresets(runtime.getClientSettings().agentPresets).find(
    (candidate) => candidate.id === params.agentPreset
  )
  if (!preset) {
    throw new OrchestrationError(
      'agent_unconfigured',
      `Agent preset ${params.agentPreset} is missing on the execution host.`
    )
  }
  const parsed = AgentPresetSchema.safeParse(preset)
  if (!parsed.success) {
    throw new OrchestrationError(
      'invalid_argument',
      'The Agent preset has invalid provider, instructions or launch preferences.'
    )
  }
  return parsed.data
}

export async function assertAgentPresetExecutionRuntime(
  runtime: OrcaRuntimeService,
  target: { repo?: string; worktree?: string },
  provider: 'claude' | 'codex',
  native = true
): Promise<void> {
  if (target.repo) {
    const repo = await runtime.showRepo(target.repo)
    const projectRuntime = runtime.resolveProjectRuntimeForRepo(repo)
    if (
      repo.connectionId ||
      (repo.executionHostId && repo.executionHostId !== 'local') ||
      projectRuntime?.status === 'repair-required' ||
      projectRuntime?.runtime.kind === 'wsl'
    ) {
      throw new OrchestrationError(
        'capability_unsupported',
        'Agent presets require the owning execution runtime. Connect to that host and use --on; proxy SSH/WSL launch is unsupported.'
      )
    }
  } else if (target.worktree) {
    const support = await runtime.getStructuredAgentSessionCreateSupport(target.worktree, provider)
    if (!support.supported && (native || support.reason === 'remote' || support.reason === 'wsl')) {
      throw new OrchestrationError(
        'capability_unsupported',
        `Agent presets require a native session on the owning execution runtime (${support.reason ?? 'unsupported'}).`
      )
    }
  }
}

export function agentPresetWorkerMode(runtime: OrcaRuntimeService, preset: AgentPreset) {
  return decideWorkerStartMode({
    params: { agent: preset.provider },
    settings: readWorkerStartModeSettings(runtime)
  })
}

export async function prepareAgentPresetWorkerMode(args: {
  runtime: OrcaRuntimeService
  preset: AgentPreset | undefined
  fallback: WorkerStartModeReceipt
  target: { repo?: string; worktree?: string }
}): Promise<WorkerStartModeReceipt> {
  if (!args.preset) {
    return args.fallback
  }
  const mode = agentPresetWorkerMode(args.runtime, args.preset)
  await assertAgentPresetExecutionRuntime(
    args.runtime,
    args.target,
    args.preset.provider,
    mode.mode === 'structured'
  )
  return mode
}

export async function prepareFederatedAgentPreset(
  runtime: OrcaRuntimeService,
  preset: AgentPreset | undefined,
  target: { repo?: string; worktree?: string }
): Promise<boolean> {
  if (!preset) {
    return false
  }
  const native = agentPresetWorkerMode(runtime, preset).mode === 'structured'
  await assertAgentPresetExecutionRuntime(runtime, target, preset.provider, native)
  return native
}
