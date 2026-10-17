import { z } from 'zod'
import { isAlias, parseDocument, visit } from 'yaml'

export const MAX_WORKFLOW_SOURCE_BYTES = 128 * 1024

const StageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1),
  session: z.string().trim().min(1).max(200),
  skill: z.string().trim().min(1).max(200).nullable().optional(),
  output: z.string().trim().min(1).max(1000).nullable().optional()
})
const DefinitionSchema = z.object({
  version: z.literal(1),
  name: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  max_plan_revisions: z.number().int().nonnegative().optional(),
  max_fix_rounds: z.number().int().nonnegative().optional(),
  stages: z.array(StageSchema).min(1).max(64)
})
export type WorkflowDefinition = z.infer<typeof DefinitionSchema>
export function parseWorkflowYaml(source: string): unknown {
  if (new TextEncoder().encode(source).length > MAX_WORKFLOW_SOURCE_BYTES) {
    throw new Error('Workflow exceeds the 128 KiB source limit')
  }
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length) {
    throw new Error(document.errors[0]!.message)
  }
  let nodes = 0
  visit(document, (_key, node, path) => {
    if (++nodes > 4096 || path.length > 32) {
      throw new Error('Workflow exceeds parsing limits')
    }
    if (isAlias(node)) {
      throw new Error('Workflow aliases are not supported')
    }
  })
  return document.toJS({ maxAliasCount: 0 })
}
export function parseWorkflowDefinition(source: string): WorkflowDefinition {
  const definition = DefinitionSchema.parse(parseWorkflowYaml(source))
  if (new Set(definition.stages.map((stage) => stage.id)).size !== definition.stages.length) {
    throw new Error('Workflow stage IDs must be unique')
  }
  return definition
}
export function isOrcaCoordinatorWorkflow(owner: string, definition: WorkflowDefinition): boolean {
  const ids = ['clarify', 'plan', 'plan-review', 'implement', 'publish', 'review', 'fix', 'accept']
  const sessions = [
    'coordinator',
    'coordinator',
    'coordinator',
    'worker',
    'coordinator',
    'fresh-terminal',
    'fresh-terminal',
    'coordinator'
  ]
  const skills = [
    'devpilot:grilling',
    null,
    null,
    null,
    'devpilot:pr-creator',
    'devpilot:pr-review',
    'devpilot:handling-code-review',
    null
  ]
  return (
    owner === 'orca-dev-workflow' &&
    definition.stages.length === ids.length &&
    definition.stages.every(
      (stage, index) =>
        stage.id === ids[index] &&
        stage.session === sessions[index] &&
        (stage.skill ?? null) === skills[index]
    )
  )
}
