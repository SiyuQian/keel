import type { DiscoveredSkill } from '../../shared/skills'
import type {
  WorkflowEntry,
  WorkflowObservation,
  WorkflowSkillDocument
} from '../../shared/workflow-observation'
import type { ResolvedSkillDiscoveryTarget } from './skill-discovery-target'
import { join, posix } from 'node:path'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'
import { toWindowsWslUncPath } from '../../shared/wsl-paths'
import {
  MAX_WORKFLOW_SOURCE_BYTES,
  parseWorkflowDefinition,
  parseWorkflowYaml
} from '../../shared/workflow-definition'
import { z } from 'zod'
import { workflowSkillCandidates } from '../../shared/workflow-skill-reference'
import { SkillScanCoalescer, isSkillRootUnavailableError } from './skill-scan-coalescer'
import { workflowScanBudget } from './workflow-scan-budget'
import { stablePathId } from './skill-discovery-sources'
import { runSkillCandidateTasks } from './skill-candidate-concurrency'

const MAX_CANDIDATES = 256
const MAX_DOCUMENTS = 128
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

function readError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000)
}
function missing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}
const VersionSchema = z.union([z.string().max(200), z.number().finite()]).optional()
const PackageMetadataSchema = z.object({
  version: VersionSchema,
  metadata: z.object({ version: VersionSchema }).optional()
})
function packageVersion(source: string): string | null {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1]
  if (!frontmatter) {
    return null
  }
  try {
    const parsed = PackageMetadataSchema.parse(parseWorkflowYaml(frontmatter))
    const version = parsed.metadata?.version ?? parsed.version
    return version === undefined ? null : String(version)
  } catch {
    return null
  }
}

const workflowScans = new SkillScanCoalescer<WorkflowObservation>(32, Date.now, {
  timeoutMs: 10_000,
  maximumPending: 8,
  budget: workflowScanBudget
})

const fileReads = new SkillScanCoalescer<string>(128, Date.now, {
  timeoutMs: 2000,
  maximumPending: 64,
  budget: workflowScanBudget
})
export function clearWorkflowDiscoveryCaches(): void {
  workflowScans.clear()
  fileReads.clear()
}

export async function observeWorkflows(
  skills: readonly DiscoveredSkill[],
  target: ResolvedSkillDiscoveryTarget,
  refresh = false
): Promise<WorkflowObservation> {
  const key = stablePathId(JSON.stringify([target, skills]))
  try {
    return (
      await workflowScans.run(key, { ttlMs: 0, refresh, replacePending: refresh }, (signal) =>
        readWorkflows(skills, target, signal, refresh)
      )
    ).value
  } catch (error) {
    if (!isSkillRootUnavailableError(error)) {
      throw error
    }
    throw new Error('Workflow discovery is still reading a slow location. Try again.', {
      cause: error
    })
  }
}

async function readWorkflows(
  skills: readonly DiscoveredSkill[],
  target: ResolvedSkillDiscoveryTarget,
  signal: AbortSignal,
  refresh: boolean
): Promise<WorkflowObservation> {
  const result: WorkflowObservation = { entries: [], documents: [], issues: [] }
  let bytes = 4096 // Reserve room for bounded inventory warnings.
  const fits = (value: WorkflowEntry | WorkflowSkillDocument): boolean => {
    const size = Buffer.byteLength(JSON.stringify(value)) + 1
    if (bytes + size > MAX_RESPONSE_BYTES) {
      return false
    }
    bytes += size
    return true
  }
  const diskPath = (path: string): string =>
    target.kind === 'wsl' ? toWindowsWslUncPath(path, target.distro) : path
  const read = async (path: string, fresh = false): Promise<string> => {
    signal.throwIfAborted()
    const file = await fileReads.run(
      diskPath(path),
      { ttlMs: 0, refresh: fresh, replacePending: fresh },
      async (readSignal) => {
        const file = await readNodeFileWithinLimit(diskPath(path), MAX_WORKFLOW_SOURCE_BYTES, {
          regularFileOnly: true,
          signal: readSignal
        })
        readSignal.throwIfAborted()
        return file.buffer.toString('utf8')
      }
    )
    signal.throwIfAborted()
    return file.value
  }
  const installed = skills.filter((skill) => skill.installed)
  if (installed.length > MAX_CANDIDATES) {
    result.issues.push(
      'Partial inventory: only the first 256 installed skill packages were inspected.'
    )
  }
  const candidates: { skill: DiscoveredSkill; directoryPath: string }[] = []
  locations: for (const skill of installed) {
    for (const directoryPath of new Set(skill.directoryPaths ?? [skill.directoryPath])) {
      if (candidates.length === MAX_CANDIDATES) {
        result.issues.push(
          'Partial inventory: only the first 256 installed package locations were inspected.'
        )
        break locations
      }
      candidates.push({ skill, directoryPath })
    }
  }
  const seenWorkflows = new Set<string>()
  for (let offset = 0; offset < candidates.length; offset += 4) {
    signal.throwIfAborted()
    const entries = await runSkillCandidateTasks(
      candidates
        .slice(offset, offset + 4)
        .map(({ skill, directoryPath }) => async (): Promise<WorkflowEntry | null> => {
          const path = (target.kind === 'wsl' ? posix : { join }).join(
            directoryPath,
            'workflow.yaml'
          )
          let source: string
          try {
            source = await read(path, refresh)
          } catch (error) {
            if (isSkillRootUnavailableError(error)) {
              throw error
            }
            return missing(error)
              ? null
              : { ownerId: skill.id, path, source: null, error: readError(error) }
          }
          try {
            return { ownerId: skill.id, path, source, definition: parseWorkflowDefinition(source) }
          } catch (error) {
            return { ownerId: skill.id, path, source, error: readError(error) }
          }
        })
    )
    for (const entry of entries) {
      if (!entry) {
        continue
      }
      if (entry.source !== null) {
        const identity = JSON.stringify([entry.ownerId, stablePathId(entry.source)])
        if (seenWorkflows.has(identity)) {
          continue
        }
        seenWorkflows.add(identity)
      }
      if (!fits(entry)) {
        result.issues.push('Partial inventory: workflow response reached the 2 MiB limit.')
        return result
      }
      result.entries.push(entry)
    }
  }
  const wanted = new Map<string, DiscoveredSkill>()
  for (const entry of result.entries) {
    const owner = installed.find((skill) => skill.id === entry.ownerId)
    if (owner) {
      wanted.set(owner.id, owner)
    }
    for (const stage of entry.definition?.stages ?? []) {
      for (const skill of stage.skill ? workflowSkillCandidates(stage.skill, installed) : []) {
        wanted.set(skill.id, skill)
      }
    }
  }
  if (wanted.size > MAX_DOCUMENTS) {
    result.issues.push('Partial Skill sources: only the first 128 documents were read.')
  }
  const sources = new Map<string, Promise<Omit<WorkflowSkillDocument, 'skillId'>>>()
  const documents = [...wanted.values()].slice(0, MAX_DOCUMENTS)
  for (let offset = 0; offset < documents.length; offset += 4) {
    signal.throwIfAborted()
    const batch = await runSkillCandidateTasks(
      documents.slice(offset, offset + 4).map((skill) => async () => {
        let pending = sources.get(skill.skillFilePath)
        if (!pending) {
          pending = read(skill.skillFilePath).then(
            (source) => ({ source, packageVersion: packageVersion(source) }),
            (error: unknown) => ({ source: null, packageVersion: null, error: readError(error) })
          )
          sources.set(skill.skillFilePath, pending)
        }
        return { skillId: skill.id, ...(await pending) }
      })
    )
    for (let document of batch) {
      if (!fits(document)) {
        document = {
          skillId: document.skillId,
          source: null,
          packageVersion: null,
          error: 'Skill source omitted: the response reached the 2 MiB limit.'
        }
        result.issues.push('Partial Skill sources: response reached the 2 MiB limit.')
        if (fits(document)) {
          result.documents.push(document)
        }
        return result
      }
      result.documents.push(document)
    }
  }
  return result
}
