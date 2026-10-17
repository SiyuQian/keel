import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import ts from 'typescript-api'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'

export type LanguageServiceEntry = { projectRoot: string; service: ts.LanguageService }
type Overlay = { text: string; version: number }

export class LanguageServicePool {
  private current: ts.LanguageService | null = null
  private readonly overlays = new Map<string, Overlay>()
  // Why: unchanged files (lib and dependency .d.ts) keep their parse across per-query services.
  private readonly registry = ts.createDocumentRegistry()

  setOverlay(filePath: string, text: string, version: number): void {
    this.overlays.set(resolve(filePath), { text, version })
  }

  setOverlays(buffers: readonly { filePath: string; text: string; version: number }[]): void {
    this.clearOverlay()
    for (const buffer of buffers) {
      this.setOverlay(buffer.filePath, buffer.text, buffer.version)
    }
  }

  clearOverlay(): void {
    this.overlays.clear()
  }

  acquire(filePath: string, workspaceRoot?: string): LanguageServiceEntry | null {
    // shortcut: new program per query keeps config and resolution fresh; parses are shared via
    // the content-hashed registry. Each query reads and hashes every project file (a few hundred
    // files take well under a second); keep a watched service per config if repos outgrow that.
    const config = this.findConfig(filePath, workspaceRoot)
    if (!config) {
      return null
    }
    const parsed = this.selectProject(config, resolve(filePath), new Set())
    if (!parsed) {
      return null
    }
    const projectRoot = dirname(parsed.options.configFilePath?.toString() ?? config)
    // One read per file per query keeps each version and snapshot consistent during disk writes.
    const scripts = new Map<string, { text: string; version: string } | null>()
    const script = (fileName: string): { text: string; version: string } | null => {
      const path = resolve(fileName)
      let entry = scripts.get(path)
      if (entry === undefined) {
        const text = this.overlays.get(path)?.text ?? ts.sys.readFile(fileName)
        entry =
          text === undefined
            ? null
            : { text, version: createHash('sha1').update(text).digest('base64') }
        scripts.set(path, entry)
      }
      return entry
    }
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [...new Set([...parsed.fileNames, filePath])],
      getScriptVersion: (fileName) => script(fileName)?.version ?? '',
      getScriptSnapshot: (fileName) => {
        const entry = script(fileName)
        return entry ? ts.ScriptSnapshot.fromString(entry.text) : undefined
      },
      getCurrentDirectory: () => projectRoot,
      getCompilationSettings: () => parsed.options,
      getProjectReferences: () => parsed.projectReferences,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => this.overlays.has(resolve(fileName)) || ts.sys.fileExists(fileName),
      readFile: (fileName) =>
        this.overlays.get(resolve(fileName))?.text ?? ts.sys.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath
    }
    const service = ts.createLanguageService(host, this.registry)
    // Build before releasing the previous service, or the registry drops every shared parse.
    service.getProgram()
    this.disposeAll()
    this.current = service
    return { projectRoot, service }
  }

  disposeAll(): void {
    this.current?.dispose()
    this.current = null
  }

  private findConfig(filePath: string, workspaceRoot?: string): string | null {
    let directory = dirname(resolve(filePath))
    while (!workspaceRoot || isPathInsideOrEqual(workspaceRoot, directory)) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const candidate = resolve(directory, name)
        if (this.overlays.has(candidate) || ts.sys.fileExists(candidate)) {
          return candidate
        }
      }
      const parent = dirname(directory)
      if (parent === directory) {
        break
      }
      directory = parent
    }
    return null
  }

  private selectProject(
    config: string,
    filePath: string,
    visited: Set<string>
  ): ts.ParsedCommandLine | null {
    if (visited.has(config)) {
      return null
    }
    if (visited.size >= 64) {
      throw new Error('Too many referenced TypeScript projects.')
    }
    visited.add(config)
    const errors: ts.Diagnostic[] = []
    const parsed = ts.getParsedCommandLineOfConfigFile(
      config,
      {},
      {
        ...ts.sys,
        readFile: (fileName) =>
          this.overlays.get(resolve(fileName))?.text ?? ts.sys.readFile(fileName),
        fileExists: (fileName) =>
          this.overlays.has(resolve(fileName)) || ts.sys.fileExists(fileName),
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => errors.push(diagnostic)
      }
    )
    // Empty solution configs are valid, but malformed options and missing references are errors.
    errors.push(...(parsed?.errors.filter((error) => error.code !== 18003) ?? []))
    if (!parsed || errors.length) {
      throw new Error(
        errors
          .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
          .join('\n') || 'Invalid TypeScript configuration.'
      )
    }
    if (parsed.fileNames.some((name) => resolve(name) === filePath)) {
      return parsed
    }
    for (const reference of parsed.projectReferences ?? []) {
      const candidate = this.selectProject(
        ts.resolveProjectReferencePath(reference),
        filePath,
        visited
      )
      if (candidate) {
        return candidate
      }
    }
    // An unsaved new file may not exist in the config's directory listing yet.
    return parsed.fileNames.length &&
      this.overlays.has(filePath) &&
      isPathInsideOrEqual(dirname(config), filePath)
      ? parsed
      : null
  }
}
