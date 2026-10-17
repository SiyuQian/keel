import { ipcRenderer } from 'electron'
import type { CodeIntelApi } from './code-intel-api'
export const codeIntelApi: CodeIntelApi = {
  definition: (args) => ipcRenderer.invoke('codeIntel:definition', args),
  references: (args) => ipcRenderer.invoke('codeIntel:references', args),
  cancel: (requestId) => ipcRenderer.send('codeIntel:cancel', requestId)
}
