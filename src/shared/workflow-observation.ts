import type { WorkflowDefinition } from './workflow-definition'

export type WorkflowEntry = {
  ownerId: string
  path: string
  source: string | null
  definition?: WorkflowDefinition
  error?: string
}
export type WorkflowSkillDocument = {
  skillId: string
  source: string | null
  packageVersion: string | null
  error?: string
}
export type WorkflowObservation = {
  entries: WorkflowEntry[]
  documents: WorkflowSkillDocument[]
  issues: string[]
}
