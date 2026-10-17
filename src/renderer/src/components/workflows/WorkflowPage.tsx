import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { WorkflowExplorer } from './WorkflowExplorer'

export function WorkflowPage({
  runtimeTarget,
  hostLabel,
  onBack,
  onClose
}: {
  runtimeTarget: RuntimeClientTarget | null
  hostLabel: string | null
  onBack: () => void
  onClose: () => void
}): React.JSX.Element {
  const project = useActiveProjectSkillRuntime()
  const local = runtimeTarget?.kind === 'local'
  return (
    <WorkflowExplorer
      runtimeTarget={runtimeTarget}
      discoveryTarget={local ? project.discoveryTarget : undefined}
      hostLabel={
        local && project.agentRuntime?.runtime === 'wsl' ? project.agentRuntime.label : hostLabel
      }
      onBack={onBack}
      onClose={onClose}
    />
  )
}
