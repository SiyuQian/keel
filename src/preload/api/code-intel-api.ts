import type { CodeIntelIpcArgs, CodeIntelResult } from '../../shared/code-intel-contract'
export type CodeIntelApi = {
  definition: (args: CodeIntelIpcArgs) => Promise<CodeIntelResult>
  references: (args: CodeIntelIpcArgs) => Promise<CodeIntelResult>
  cancel: (requestId: number) => void
}
