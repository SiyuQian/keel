import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { z } from 'zod'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'

const PluginNamespaceSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/)
const PluginManifestSchema = z.object({ name: PluginNamespaceSchema })

export function pluginNamespace(value: unknown): string | undefined {
  const parsed = PluginNamespaceSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function pluginManifestNamespace(source: string): string | undefined {
  try {
    const parsed = PluginManifestSchema.safeParse(JSON.parse(source))
    return parsed.success ? parsed.data.name : undefined
  } catch {
    return undefined
  }
}

export async function discoverCodexPluginNamespaces(
  rootPath: string,
  skillFilePath: string,
  signal: AbortSignal,
  manifests: Map<string, Promise<string | undefined>>
): Promise<string[]> {
  const relativePath = relative(rootPath, skillFilePath)
  const segments = relativePath.split(sep)
  if (isAbsolute(relativePath) || segments[0] === '..' || segments.length > 10) {
    return []
  }
  let directory = dirname(skillFilePath)
  for (let depth = 0; depth < segments.length; depth++) {
    signal.throwIfAborted()
    for (const marker of ['.codex-plugin', '.claude-plugin']) {
      const path = join(directory, marker, 'plugin.json')
      let pending = manifests.get(path)
      if (!pending) {
        pending = readNodeFileWithinLimit(path, 256 * 1024, { regularFileOnly: true, signal }).then(
          (file) => pluginManifestNamespace(file.buffer.toString('utf8')),
          () => undefined
        )
        manifests.set(path, pending)
      }
      const namespace = await pending
      if (namespace) {
        return [namespace]
      }
    }
    directory = dirname(directory)
  }
  return []
}
