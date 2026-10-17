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

/** Stable `issues` codes the renderer localizes. Older hosts sent English text, shown as is. */
export const WORKFLOW_ISSUES = {
  packages: 'partial-packages',
  locations: 'partial-locations',
  response: 'partial-response',
  documents: 'partial-documents',
  documentResponse: 'partial-document-response',
  unavailableLocations: 'unavailable-locations'
} as const
