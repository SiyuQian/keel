import {
  AGENT_PRESETS_CAPABILITY,
  getAgentPresets,
  resolveWorkflowAgent,
  type AgentPreset,
  type WorkflowAgentBindings
} from '../../shared/agent-presets'
import type { RuntimeStatus } from '../../shared/runtime-types'
import type { SkillDiscoveryResult } from '../../shared/skills'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

async function settings(ctx: HandlerContext) {
  const status = await ctx.client.call<RuntimeStatus>('status.get')
  if (!status.result.capabilities?.includes(AGENT_PRESETS_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'Update the owning runtime to access Agent presets.'
    )
  }
  const response = await ctx.client.call<{
    settings: { agentPresets?: AgentPreset[]; workflowAgentBindings?: WorkflowAgentBindings }
  }>('settings.get')
  return {
    response,
    agents: getAgentPresets(response.result.settings.agentPresets),
    bindings: response.result.settings.workflowAgentBindings ?? {}
  }
}
const list: CommandHandler = async (ctx) => {
  const saved = await settings(ctx)
  printResult({ ...saved.response, result: { agents: saved.agents } }, ctx.json, (result) =>
    result.agents
      .map(
        (agent) =>
          `${agent.id} · ${agent.name} · ${agent.provider} · ${agent.model ?? 'provider default'} · ${agent.effort ?? 'provider default'}`
      )
      .join('\n')
  )
}
const show: CommandHandler = async (ctx) => {
  const saved = await settings(ctx)
  const id = getRequiredStringFlag(ctx.flags, 'id')
  const agent = saved.agents.find((candidate) => candidate.id === id)
  if (!agent) {
    throw new RuntimeClientError('not_found', `Agent preset ${id} is missing on this runtime.`)
  }
  printResult({ ...saved.response, result: { agent } }, ctx.json, (result) =>
    JSON.stringify(result.agent, null, 2)
  )
}
const workflows: CommandHandler = async (ctx) => {
  const saved = await settings(ctx)
  const inventory = await ctx.client.call<SkillDiscoveryResult>('skills.discover', {
    includeWorkflows: true
  })
  const entries =
    inventory.result.workflows?.entries.map((entry) => ({
      id: entry.ownerId,
      name: entry.definition?.name,
      path: entry.path,
      steps: entry.definition?.stages.map((stage) => stage.id) ?? [],
      binding: saved.bindings[entry.ownerId] ?? null,
      error: entry.error
    })) ?? []
  printResult({ ...inventory, result: { workflows: entries } }, ctx.json, (result) =>
    JSON.stringify(result.workflows, null, 2)
  )
}
const resolve: CommandHandler = async (ctx) => {
  const saved = await settings(ctx)
  const workflowId = getRequiredStringFlag(ctx.flags, 'workflow')
  const stepId = getRequiredStringFlag(ctx.flags, 'step')
  const inventory = await ctx.client.call<SkillDiscoveryResult>('skills.discover', {
    includeWorkflows: true
  })
  const workflow = inventory.result.workflows?.entries.find((entry) => entry.ownerId === workflowId)
  if (!workflow?.definition?.stages.some((stage) => stage.id === stepId)) {
    throw new RuntimeClientError(
      'not_found',
      'The installed workflow or step is missing on this runtime.'
    )
  }
  let agent
  try {
    agent = resolveWorkflowAgent(saved.agents, saved.bindings[workflowId], stepId)
  } catch (cause) {
    throw new RuntimeClientError(
      'not_found',
      cause instanceof Error ? cause.message : String(cause)
    )
  }
  if (!agent) {
    throw new RuntimeClientError(
      'invalid_argument',
      'No Agent is configured for this workflow step.'
    )
  }
  printResult(
    { ...saved.response, result: { workflowId, stepId, agentPresetId: agent.id, agent } },
    ctx.json,
    (result) => JSON.stringify(result, null, 2)
  )
}
export const AGENT_PRESET_HANDLERS: Record<string, CommandHandler> = {
  'agents list': list,
  'agents show': show,
  'agents workflows': workflows,
  'agents resolve': resolve
}
