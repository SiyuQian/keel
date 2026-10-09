import { posix as pathPosix } from 'node:path'
import { summarizeSkillMarkdown } from '../../shared/skill-metadata'
import type {
  DiscoveredSkill,
  SkillDiscoveryResult,
  SkillDiscoverySource,
  SkillSourceKind
} from '../../shared/skills'
import {
  sortDiscoveredSkills,
  sortSkillDiscoverySources,
  sourceKindForSkill,
  sourceLabelForSkill,
  stablePathId,
  type SkillScanRoot
} from './skill-discovery-sources'
import { rootMayContainSourceKind } from './skill-discovery-source-filter'
import { pluginManifestNamespace } from './skill-plugin-provenance'

export type WslSkillDiscoveryObservation = {
  rows: { canonicalSkillFilePath: string; skill: DiscoveredSkill }[]
  sources: SkillDiscoverySource[]
  scannedAt: number
}

function readProtocolField(fields: string[], index: number): string {
  const value = fields[index]
  if (value === undefined) {
    throw new Error('WSL skill discovery returned an incomplete response.')
  }
  return value
}

export function readWslSkillDiscoveryObservation(
  output: string,
  roots: readonly SkillScanRoot[],
  scannedAt = Date.now()
): WslSkillDiscoveryObservation {
  const fields = output.split('\0')
  const rootExists = new Map<number, boolean>()
  const packages = new Map<
    string,
    { rootPath: string; directory: string; namespace: string | undefined }
  >()
  const rows: WslSkillDiscoveryObservation['rows'] = []
  let index = 0
  while (index < fields.length && fields[index]) {
    const recordKind = fields[index++]
    const rootIndex = Number.parseInt(readProtocolField(fields, index++), 10)
    const root = roots[rootIndex]
    if (!root) {
      throw new Error('WSL skill discovery returned an unknown source.')
    }
    if (recordKind === 'R') {
      rootExists.set(rootIndex, readProtocolField(fields, index++) === '1')
      continue
    }
    if (recordKind === 'P') {
      const skillFilePath = readProtocolField(fields, index++)
      const manifest = Buffer.from(readProtocolField(fields, index++), 'base64')
      const namespace =
        manifest.length <= 256 * 1024
          ? pluginManifestNamespace(manifest.toString('utf8'))
          : undefined
      const marker = pathPosix.basename(pathPosix.dirname(skillFilePath))
      const directory = pathPosix.dirname(pathPosix.dirname(skillFilePath))
      const relative = pathPosix.relative(root.path, directory)
      if (
        root.id === 'codex-plugin-cache' &&
        pathPosix.basename(skillFilePath) === 'plugin.json' &&
        ['.codex-plugin', '.claude-plugin'].includes(marker) &&
        relative !== '..' &&
        !relative.startsWith('../') &&
        !pathPosix.isAbsolute(relative)
      ) {
        const key = JSON.stringify([root.path, directory])
        const existing = packages.get(key)
        if (!existing?.namespace) {
          packages.set(key, { rootPath: root.path, directory, namespace })
        }
        continue
      }
      const row = rows.findLast(
        (item) => item.skill.skillFilePath === skillFilePath && item.skill.rootPath === root.path
      )
      if (
        root.id === 'codex-plugin-cache' &&
        namespace &&
        row &&
        !row.skill.pluginNamespaces?.length
      ) {
        row.skill.pluginNamespaces = [namespace]
      }
      continue
    }
    if (recordKind !== 'S') {
      throw new Error('WSL skill discovery returned an invalid response.')
    }

    const skillFilePath = readProtocolField(fields, index++)
    const canonicalSkillFilePath = readProtocolField(fields, index++)
    const updatedAtSeconds = Number.parseInt(readProtocolField(fields, index++), 10)
    const markdown = Buffer.from(readProtocolField(fields, index++), 'base64').toString('utf8')
    const directoryPath = pathPosix.dirname(skillFilePath)
    const summary = summarizeSkillMarkdown(markdown)
    const sourceKind = sourceKindForSkill(root, skillFilePath, pathPosix)
    const directoryName = pathPosix.basename(directoryPath)
    rows.push({
      canonicalSkillFilePath,
      skill: {
        id: stablePathId(canonicalSkillFilePath),
        name: summary.name ?? directoryName,
        description: summary.description,
        // Copy: `root.providers` is shared across every skill/source from this
        // root, so a later in-place merge must not mutate the aliased array.
        providers: [...root.providers],
        sourceKind,
        sourceLabel: sourceLabelForSkill(root, sourceKind),
        rootPath: root.path,
        rootPaths: [root.path],
        ...(root.pluginNamespaces ? { pluginNamespaces: [...root.pluginNamespaces] } : {}),
        directoryPaths: [directoryPath],
        directoryPath,
        skillFilePath,
        installed: true,
        updatedAt: Number.isFinite(updatedAtSeconds) ? updatedAtSeconds * 1000 : null
      }
    })
  }

  for (const row of rows) {
    let directory = pathPosix.dirname(row.skill.skillFilePath)
    for (let depth = 0; depth < 10; depth++) {
      const location = packages.get(JSON.stringify([row.skill.rootPath, directory]))
      if (location) {
        if (location.namespace) {
          row.skill.pluginNamespaces = [location.namespace]
        }
        break
      }
      if (directory === row.skill.rootPath) {
        break
      }
      directory = pathPosix.dirname(directory)
    }
  }
  const sources: SkillDiscoverySource[] = roots.map((root, rootIndex) => {
    const exists = rootExists.get(rootIndex) ?? false
    return {
      ...root,
      providers: [...root.providers],
      exists,
      skippedReason: exists ? undefined : 'missing'
    }
  })
  return {
    rows,
    sources: sortSkillDiscoverySources(sources),
    scannedAt
  }
}

export function projectWslSkillDiscovery(
  observation: WslSkillDiscoveryObservation,
  sourceKinds?: readonly SkillSourceKind[],
  names?: readonly string[]
): SkillDiscoveryResult {
  const normalizedNames = names?.map((name) => name.trim().toLowerCase()).filter(Boolean)
  const expectedNames = normalizedNames?.length ? new Set(normalizedNames) : undefined
  const skillsByCanonicalPath = new Map<string, DiscoveredSkill>()
  for (const { canonicalSkillFilePath, skill } of observation.rows) {
    if (sourceKinds?.length && !sourceKinds.includes(skill.sourceKind)) {
      continue
    }
    const directoryName = pathPosix.basename(skill.directoryPath)
    if (
      expectedNames &&
      !expectedNames.has(skill.name.trim().toLowerCase()) &&
      !expectedNames.has(directoryName.trim().toLowerCase())
    ) {
      continue
    }
    // Filter aliases before deduplication; each name/source may select a different row.
    const existing = skillsByCanonicalPath.get(canonicalSkillFilePath)
    if (existing) {
      existing.directoryPaths = [
        ...new Set([
          ...(existing.directoryPaths ?? [existing.directoryPath]),
          ...(skill.directoryPaths ?? [skill.directoryPath])
        ])
      ]
      if (skill.pluginNamespaces?.length) {
        existing.pluginNamespaces = [
          ...new Set([...(existing.pluginNamespaces ?? []), ...skill.pluginNamespaces])
        ]
      }
      const existingRoots = (existing.rootPaths ??= [existing.rootPath])
      for (const rootPath of skill.rootPaths ?? [skill.rootPath]) {
        if (!existingRoots.includes(rootPath)) {
          existingRoots.push(rootPath)
        }
      }
      for (const provider of skill.providers) {
        if (!existing.providers.includes(provider)) {
          existing.providers.push(provider)
        }
      }
      continue
    }
    skillsByCanonicalPath.set(canonicalSkillFilePath, {
      ...skill,
      providers: [...skill.providers],
      directoryPaths: [...(skill.directoryPaths ?? [skill.directoryPath])],
      rootPaths: [...(skill.rootPaths ?? [skill.rootPath])],
      ...(skill.pluginNamespaces ? { pluginNamespaces: [...skill.pluginNamespaces] } : {})
    })
  }
  return {
    skills: sortDiscoveredSkills([...skillsByCanonicalPath.values()]),
    sources: observation.sources
      .filter((source) => rootMayContainSourceKind(source, sourceKinds))
      .map((source) => ({ ...source, providers: [...source.providers] })),
    scannedAt: observation.scannedAt
  }
}

export function parseWslSkillDiscoveryOutput(
  output: string,
  roots: readonly SkillScanRoot[],
  scannedAt = Date.now(),
  sourceKinds?: readonly SkillSourceKind[],
  names?: readonly string[]
): SkillDiscoveryResult {
  return projectWslSkillDiscovery(
    readWslSkillDiscoveryObservation(output, roots, scannedAt),
    sourceKinds,
    names
  )
}
