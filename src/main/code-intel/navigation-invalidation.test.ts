import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { LanguageServicePool } from './language-service-pool'
import { getDefinition, findReferences } from './navigation'

let root: string
let pool: LanguageServicePool
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'code-intel-invalidation-'))
  pool = new LanguageServicePool({ maxServices: 3, idleMs: 60_000 })
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }))
  await writeFile(join(root, 'a.ts'), 'export const value = 1\n')
  await writeFile(join(root, 'b.ts'), 'import { value } from "./a"\nvalue\n')
})
afterEach(async () => {
  pool.disposeAll()
  await rm(root, { force: true, recursive: true })
})
function request(file = 'b.ts') {
  return {
    filePath: join(root, file),
    relativePath: file,
    position: { line: 1, character: 1 },
    bufferVersion: 1
  }
}
it('refreshes definitions after an agent changes an unopened file on disk', async () => {
  getDefinition(pool, request())
  await writeFile(join(root, 'a.ts'), '\n\nexport const value = 1\n')
  const result = getDefinition(pool, request())
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.range.start.line).toBe(2)
  }
})
it('includes new reference files after a query', async () => {
  findReferences(pool, request())
  await writeFile(join(root, 'c.ts'), 'import { value } from "./a"\nvalue\n')
  const result = findReferences(pool, request())
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations.map((l) => l.relativePath)).toContain('c.ts')
  }
})
it('selects a referenced config and uses its path aliases', async () => {
  await mkdir(join(root, 'config'))
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ files: [], references: [{ path: './config/app.json' }] })
  )
  await writeFile(
    join(root, 'config/app.json'),
    JSON.stringify({ compilerOptions: { paths: { '@a': ['../a.ts'] } }, include: ['../*.ts'] })
  )
  await writeFile(join(root, 'b.ts'), 'import { value } from "@a"\nvalue\n')
  const result = getDefinition(pool, request())
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.absolutePath).toBe(join(root, 'a.ts'))
  }
})
it('reports malformed configuration instead of successful empty results', async () => {
  await writeFile(join(root, 'tsconfig.json'), '{ "compilerOptions": { "target": "invalid" } }')
  expect(getDefinition(pool, request()).status).toBe('error')
})
it('preserves both unsaved buffers instead of replacing the prior overlay', () => {
  pool.setOverlay(join(root, 'a.ts'), '\n\nexport const value = 2\n', 2)
  const result = getDefinition(pool, {
    ...request(),
    bufferText: 'import { value } from "./a"\nvalue\n'
  })
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.range.start.line).toBe(2)
  }
})
it('reloads configuration changes between queries', async () => {
  await writeFile(join(root, 'b.ts'), 'import { value } from "@a"\nvalue\n')
  getDefinition(pool, request())
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { '@a': ['./a.ts'] } } })
  )
  const result = getDefinition(pool, request())
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.absolutePath).toBe(join(root, 'a.ts'))
  }
})

it('uses unsaved config changes without waiting for a disk save', () => {
  pool.setOverlay(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { '@a': ['./a.ts'] } } }),
    2
  )
  const result = getDefinition(pool, {
    ...request(),
    bufferText: 'import { value } from "@a"\nvalue\n'
  })
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.absolutePath).toBe(join(root, 'a.ts'))
  }
})

it('supports JavaScript projects using jsconfig', async () => {
  await rm(join(root, 'tsconfig.json'))
  await writeFile(join(root, 'jsconfig.json'), '{}')
  await writeFile(join(root, 'function.js'), 'export function value() {}\n')
  await writeFile(join(root, 'consumer.js'), 'import { value } from "./function.js"\nvalue()\n')
  const result = getDefinition(pool, request('consumer.js'))
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.absolutePath).toBe(join(root, 'function.js'))
  }
})
it('supports TSX definitions in JSX elements', async () => {
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { jsx: 'preserve' } })
  )
  await writeFile(join(root, 'component.tsx'), 'export function Component() { return <div/> }\n')
  await writeFile(
    join(root, 'view.tsx'),
    'import { Component } from "./component"\nconst view = <Component/>\n'
  )
  const result = getDefinition(pool, {
    ...request('view.tsx'),
    position: { line: 1, character: 15 }
  })
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.absolutePath).toBe(join(root, 'component.tsx'))
  }
})
it('does not reuse overlays across workspace snapshots', () => {
  getDefinition(pool, {
    ...request(),
    buffers: [{ filePath: join(root, 'a.ts'), text: '\n\nexport const value = 1', version: 2 }]
  })
  const result = getDefinition(pool, { ...request(), buffers: [] })
  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.locations[0]?.range.start.line).toBe(0)
  }
})
