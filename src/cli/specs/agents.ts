import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const AGENT_PRESET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agents', 'list'],
    summary: 'List saved Agent roles on this runtime',
    usage: 'orca agents list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agents', 'show'],
    summary: 'Read a saved Agent role by stable ID',
    usage: 'orca agents show --id <preset-id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id']
  },
  {
    path: ['agents', 'workflows'],
    summary: 'List installed workflow IDs and saved Agent bindings',
    usage: 'orca agents workflows [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agents', 'resolve'],
    summary: 'Resolve the Agent for an installed workflow step',
    usage: 'orca agents resolve --workflow <workflow-id> --step <stage-id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'workflow', 'step'],
    notes: [
      'Pass the returned agentPresetId to orchestration worker-start --agent-preset. The coordinator supplies task and preceding results; this command does not schedule steps.'
    ]
  }
]
