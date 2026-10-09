import { AgentPresetSchema, type AgentPreset } from './agent-presets'
import type { TuiAgent } from './tui-agent'
import { hasControlByte, TYPED_STARTUP_LINE_PROMPT_BUDGET_BYTES } from './startup-line-prompt-carry'

export function agentPresetInstructionArgs(
  agent: TuiAgent,
  preset: AgentPreset | undefined
): string[] {
  if (!preset) {
    return []
  }
  AgentPresetSchema.parse(preset)
  if (preset.provider !== agent) {
    throw new Error('Agent preset provider does not match the session provider.')
  }
  return agent === 'claude'
    ? ['--append-system-prompt', preset.systemInstructions]
    : ['-c', `developer_instructions=${JSON.stringify(preset.systemInstructions)}`]
}

export function assertAgentPresetTerminalLine(platform: NodeJS.Platform, command: string): void {
  // Windows does not stage launch scripts; reject lines that can truncate or submit control keys.
  if (
    platform === 'win32' &&
    (new TextEncoder().encode(command).byteLength > TYPED_STARTUP_LINE_PROMPT_BUDGET_BYTES ||
      hasControlByte(command))
  ) {
    throw new Error(
      'This Windows terminal cannot safely carry the Agent instructions. Use a native session or shorten the instructions.'
    )
  }
}
