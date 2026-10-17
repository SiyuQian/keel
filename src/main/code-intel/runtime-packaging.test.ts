import { mkdtemp, rm, cp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const {
  createPackagedRuntimeNodeModuleResources,
  prunePackagedRuntimeTypeAndSourceMapArtifacts
} = require('../../../config/packaged-runtime-node-modules.cjs')
it('copies the runtime TS API and retains standard libraries through pruning for navigation', async () => {
  const resources = await mkdtemp(join(tmpdir(), 'code-intel-packaging-'))
  try {
    const entry = createPackagedRuntimeNodeModuleResources('linux').find(
      (entry: { to: string }) => entry.to === join('node_modules', 'typescript-api')
    )
    expect(entry).toBeDefined()
    await cp(entry.from, join(resources, entry.to), { recursive: true })
    prunePackagedRuntimeTypeAndSourceMapArtifacts(resources)
    const isolated = createRequire(join(resources, 'consumer.cjs'))
    const ts = isolated('typescript-api')
    expect(existsSync(ts.getDefaultLibFilePath({}))).toBe(true)
    expect(existsSync(join(dirname(isolated.resolve('typescript-api')), 'typescript.d.ts'))).toBe(
      false
    )
    const source = join(resources, 'a.ts')
    await writeFile(source, 'const values: Array<string> = []\nvalues.map(x => x)\n')
    const program = ts.createProgram([source], { noEmit: true })
    expect(program.getSemanticDiagnostics()).toEqual([])
    const arrayLib = program
      .getSourceFiles()
      .find((file: { fileName: string }) => file.fileName.endsWith('lib.es5.d.ts'))
    expect(arrayLib).toBeDefined()
  } finally {
    await rm(resources, { recursive: true, force: true })
  }
})
