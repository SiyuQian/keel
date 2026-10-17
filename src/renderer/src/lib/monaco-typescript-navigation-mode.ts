import { typescript as monacoTS } from 'monaco-editor'

let nativeModes: { ts: monacoTS.ModeConfiguration; js: monacoTS.ModeConfiguration } | null = null
export function setTypeScriptNavigationMode(codeIntelEnabled: boolean): void {
  if (codeIntelEnabled) {
    nativeModes ??= {
      ts: monacoTS.typescriptDefaults.modeConfiguration,
      js: monacoTS.javascriptDefaults.modeConfiguration
    }
    monacoTS.typescriptDefaults.setModeConfiguration({
      ...nativeModes.ts,
      definitions: false,
      references: false
    })
    monacoTS.javascriptDefaults.setModeConfiguration({
      ...nativeModes.js,
      definitions: false,
      references: false
    })
  } else if (nativeModes) {
    monacoTS.typescriptDefaults.setModeConfiguration(nativeModes.ts)
    monacoTS.javascriptDefaults.setModeConfiguration(nativeModes.js)
    nativeModes = null
  }
}
