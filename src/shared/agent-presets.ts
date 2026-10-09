import { z } from 'zod'
import { findCatalogModel, findCatalogOption } from './agent-session-option-catalog'
import { getAgentSessionOptionLaunchCatalog } from './agent-session-option-launch'

export const AGENT_PRESETS_CAPABILITY = 'agent-presets-v1' as const
export const MAX_AGENT_SYSTEM_INSTRUCTIONS = 16_384
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(
    (value) => !value.includes('\0') && !['__proto__', 'constructor', 'prototype'].includes(value)
  )
const presetId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/)
export const StoredAgentPresetSchema = z
  .object({
    id: presetId,
    name: z.string().trim().min(1).max(128),
    provider: z.enum(['claude', 'codex']),
    systemInstructions: z
      .string()
      .max(MAX_AGENT_SYSTEM_INSTRUCTIONS)
      .refine((value) => !value.includes('\0')),
    model: z.string().trim().min(1).max(512).optional(),
    effort: z.string().trim().min(1).max(512).optional()
  })
  .strict()
export const AgentPresetSchema = StoredAgentPresetSchema.superRefine((preset, ctx) => {
  if (!preset.effort) {
    return
  }
  const catalog = getAgentSessionOptionLaunchCatalog(preset.provider)
  const model = preset.model && catalog ? findCatalogModel(catalog, preset.model) : undefined
  const option =
    findCatalogOption(model || undefined, 'effort') ??
    (!model ? catalog?.unknownModelOptions?.find((entry) => entry.id === 'effort') : undefined)
  if (
    !preset.model ||
    option?.kind.type !== 'select' ||
    !option.kind.choices.some((choice) => choice.value === preset.effort)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effort'],
      message: 'Choose a model and a supported effort.'
    })
  }
})
export type AgentPreset = z.infer<typeof AgentPresetSchema>
export const AgentPresetsSchema = z
  .array(AgentPresetSchema)
  .max(64)
  .refine(
    (presets) => new Set(presets.map((preset) => preset.id)).size === presets.length,
    'Agent IDs must be unique.'
  )
export const WorkflowAgentBindingSchema = z
  .object({
    defaultAgentId: presetId.optional(),
    stepAgentIds: z
      .record(identifier, presetId)
      .refine((steps) => Object.keys(steps).length <= 128)
      .optional()
  })
  .strict()
export const WorkflowAgentBindingsSchema = z
  .record(identifier, WorkflowAgentBindingSchema)
  .refine((bindings) => Object.keys(bindings).length <= 128)
export type WorkflowAgentBinding = z.infer<typeof WorkflowAgentBindingSchema>
export type WorkflowAgentBindings = z.infer<typeof WorkflowAgentBindingsSchema>

const BUILTIN_ROLES: readonly AgentPreset[] = [
  {
    id: 'planning',
    name: 'Planning',
    provider: 'codex',
    systemInstructions:
      'Clarify the task and inspect existing code before proposing a plan. Identify boundaries, risks and concrete acceptance checks. Preserve repository instructions and ask the coordinator about unresolved decisions.'
  },
  {
    id: 'implementation',
    name: 'Implementation',
    provider: 'codex',
    systemInstructions:
      'Implement the supplied task with the smallest complete change. Reuse existing code, preserve repository instructions and verify observable behavior. Report changed files, checks and remaining limitations to the coordinator.'
  },
  {
    id: 'review',
    name: 'Review',
    provider: 'codex',
    systemInstructions:
      'Review the supplied change against the task and repository instructions. Inspect callers and failure paths. Report actionable findings with file, line, evidence and severity. Remain read-only unless the task explicitly requests repairs.'
  }
]
export function getAgentPresets(saved: readonly AgentPreset[] | undefined): AgentPreset[] {
  return (saved ?? BUILTIN_ROLES).map((preset) => ({ ...preset }))
}
export function normalizeAgentPresets(value: unknown): AgentPreset[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return []
  }
  const found = new Set<string>()
  return value.slice(0, 64).flatMap((candidate) => {
    const parsed = StoredAgentPresetSchema.safeParse(candidate)
    if (!parsed.success || found.has(parsed.data.id)) {
      return []
    }
    found.add(parsed.data.id)
    return [parsed.data]
  })
}
export function normalizeWorkflowAgentBindings(value: unknown): WorkflowAgentBindings | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 128)
      .flatMap(([key, candidate]) => {
        if (
          !identifier.safeParse(key).success ||
          !candidate ||
          typeof candidate !== 'object' ||
          Array.isArray(candidate)
        ) {
          return []
        }
        const binding: WorkflowAgentBinding = {}
        if ('defaultAgentId' in candidate) {
          const parsed = presetId.safeParse(candidate.defaultAgentId)
          if (parsed.success) {
            binding.defaultAgentId = parsed.data
          }
        }
        if (
          'stepAgentIds' in candidate &&
          candidate.stepAgentIds &&
          typeof candidate.stepAgentIds === 'object' &&
          !Array.isArray(candidate.stepAgentIds)
        ) {
          binding.stepAgentIds = Object.fromEntries(
            Object.entries(candidate.stepAgentIds)
              .slice(0, 128)
              .flatMap(([step, id]) => {
                const parsedStep = identifier.safeParse(step)
                const parsedId = presetId.safeParse(id)
                return parsedStep.success && parsedId.success
                  ? [[parsedStep.data, parsedId.data]]
                  : []
              })
          )
        }
        return [[key, binding]]
      })
  )
}
export function resolveWorkflowAgent(
  presets: readonly AgentPreset[],
  binding: WorkflowAgentBinding | undefined,
  stepId: string
): AgentPreset | undefined {
  const id = binding?.stepAgentIds?.[stepId] ?? binding?.defaultAgentId
  if (!id) {
    return undefined
  }
  const preset = presets.find((candidate) => candidate.id === id)
  if (!preset) {
    throw new Error(`Agent preset ${id} is missing. Restore it or change the workflow binding.`)
  }
  return { ...preset }
}
