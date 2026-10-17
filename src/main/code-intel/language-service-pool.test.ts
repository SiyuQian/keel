import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageServicePool } from './language-service-pool'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-code-intel-pool-'))
  await mkdir(join(dir, 'src', 'prompts'), { recursive: true })
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, allowJs: true } }),
    'utf8'
  )
  await writeFile(
    join(dir, 'src', 'prompts', 'helpers.ts'),
    'export function composePrompt(): string {\n  return ""\n}\n',
    'utf8'
  )
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('LanguageServicePool', () => {
  it('finds the nearest tsconfig and serves a language service for a file', () => {
    const pool = new LanguageServicePool()
    const entry = pool.acquire(join(dir, 'src', 'prompts', 'helpers.ts'))
    expect(entry).not.toBeNull()
    expect(entry!.projectRoot).toBe(dir)
    const sourceFile = entry!.service
      .getProgram()
      ?.getSourceFile(join(dir, 'src', 'prompts', 'helpers.ts'))
    expect(sourceFile).toBeDefined()
    pool.disposeAll()
  })

  it('returns null when no tsconfig is found', async () => {
    const orphan = await mkdtemp(join(tmpdir(), 'orca-code-intel-orphan-'))
    await writeFile(join(orphan, 'a.ts'), 'export const a = 1\n', 'utf8')
    const pool = new LanguageServicePool()
    expect(pool.acquire(join(orphan, 'a.ts'))).toBeNull()
    pool.disposeAll()
    await rm(orphan, { recursive: true, force: true })
  })

  it('overlays an in-memory buffer for one file over disk content', () => {
    const pool = new LanguageServicePool()
    const filePath = join(dir, 'src', 'prompts', 'helpers.ts')
    pool.setOverlay(filePath, 'export const FROM_BUFFER = 1\n', 2)
    const entry = pool.acquire(filePath)!
    const text = entry.service.getProgram()!.getSourceFile(filePath)!.getFullText()
    expect(text).toContain('FROM_BUFFER')
    pool.disposeAll()
  })

  it('clears the overlay so subsequent reads fall back to disk content', () => {
    const pool = new LanguageServicePool()
    const filePath = join(dir, 'src', 'prompts', 'helpers.ts')
    pool.setOverlay(filePath, 'export const FROM_BUFFER = 1\n', 2)
    pool.acquire(filePath)!.service.getProgram()!.getSourceFile(filePath)
    pool.clearOverlay()
    const text = pool
      .acquire(filePath)!
      .service.getProgram()!
      .getSourceFile(filePath)!
      .getFullText()
    expect(text).toContain('composePrompt')
    expect(text).not.toContain('FROM_BUFFER')
    pool.disposeAll()
  })

  it('reuses parsed source files across queries until their content changes', async () => {
    const pool = new LanguageServicePool()
    const filePath = join(dir, 'src', 'prompts', 'helpers.ts')
    const parse = () => pool.acquire(filePath)!.service.getProgram()!.getSourceFile(filePath)!
    const first = parse()
    expect(parse()).toBe(first)
    await writeFile(filePath, 'export const FROM_DISK = 1\n', 'utf8')
    const changed = parse()
    expect(changed).not.toBe(first)
    expect(changed.getFullText()).toContain('FROM_DISK')
    pool.setOverlay(filePath, 'export const FROM_BUFFER = 1\n', 0)
    expect(parse().getFullText()).toContain('FROM_BUFFER')
    pool.disposeAll()
  })

  it('keeps one service and answers a few hundred files within the ceiling', async () => {
    for (let i = 0; i < 300; i++) {
      await writeFile(join(dir, 'src', `f${i}.ts`), `export const v${i}: number = ${i}\n`, 'utf8')
    }
    const pool = new LanguageServicePool()
    const filePath = join(dir, 'src', 'f0.ts')
    pool.acquire(filePath)!.service.getProgram()
    // Ceiling: a warm per-query rebuild (read + sha1 of 300 files) must stay under 5s.
    const start = performance.now()
    pool.acquire(filePath)!.service.getProgram()
    expect(performance.now() - start).toBeLessThan(5000)
    pool.disposeAll()
  })
})
