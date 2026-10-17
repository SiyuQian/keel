import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  discoverCodexPluginNamespaces,
  pluginManifestNamespace,
  pluginNamespace
} from './skill-plugin-provenance'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function layout(manifestDirectory: 'package' | 'above', manifest: string) {
  const base = await mkdtemp(join(tmpdir(), 'plugin-provenance-'))
  directories.push(base)
  const root = join(base, 'cache')
  const packageRoot = join(root, 'market', 'package', '1')
  const skillFilePath = join(packageRoot, 'skills', 'source', 'SKILL.md')
  await mkdir(join(packageRoot, 'skills', 'source'), { recursive: true })
  await writeFile(skillFilePath, '# Source')
  const owner = manifestDirectory === 'package' ? packageRoot : base
  await mkdir(join(owner, '.codex-plugin'), { recursive: true })
  await writeFile(join(owner, '.codex-plugin', 'plugin.json'), manifest)
  return { root, skillFilePath }
}
const discover = (root: string, skillFilePath: string) =>
  discoverCodexPluginNamespaces(root, skillFilePath, new AbortController().signal, new Map())

it('accepts only bounded plain plugin names', () => {
  expect(pluginNamespace('verified.v1')).toBe('verified.v1')
  expect(pluginNamespace('../escape')).toBeUndefined()
  expect(pluginNamespace('a/b')).toBeUndefined()
  expect(pluginNamespace('x'.repeat(201))).toBeUndefined()
  expect(pluginManifestNamespace('{"name":"verified"}')).toBe('verified')
  expect(pluginManifestNamespace('{"name":"../escape"}')).toBeUndefined()
  expect(pluginManifestNamespace('not json')).toBeUndefined()
})

it('reads the namespace from the manifest of the package that owns the Skill', async () => {
  const { root, skillFilePath } = await layout('package', '{"name":"verified"}')
  expect(await discover(root, skillFilePath)).toEqual(['verified'])
})

it('ignores a manifest above the scanned root', async () => {
  const { root, skillFilePath } = await layout('above', '{"name":"outside"}')
  expect(await discover(root, skillFilePath)).toEqual([])
})

it('ignores invalid and oversized manifests', async () => {
  const invalid = await layout('package', '{"name":"../escape"}')
  expect(await discover(invalid.root, invalid.skillFilePath)).toEqual([])
  const oversized = await layout(
    'package',
    JSON.stringify({ name: 'verified', padding: 'x'.repeat(256 * 1024) })
  )
  expect(await discover(oversized.root, oversized.skillFilePath)).toEqual([])
})

it('ignores a Skill path outside the root', async () => {
  const { root, skillFilePath } = await layout('package', '{"name":"verified"}')
  expect(await discover(join(root, 'market', 'other'), skillFilePath)).toEqual([])
})
