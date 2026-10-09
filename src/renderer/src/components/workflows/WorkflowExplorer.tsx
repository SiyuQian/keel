import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { SkillDiscoveryTarget } from '../../../../shared/skills'
import { useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, Workflow, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useWorkflowInventory } from './use-workflow-inventory'
import { useAgentPresetSettings } from './use-agent-preset-settings'
import { AgentPresetEditor } from './AgentPresetEditor'
import { WorkflowDetail } from './WorkflowDetail'
export type WorkflowExplorerProps = {
  runtimeTarget: RuntimeClientTarget | null
  discoveryTarget?: SkillDiscoveryTarget
  hostLabel: string | null
  onBack: () => void
  onClose: () => void
}
export function WorkflowExplorer({
  runtimeTarget,
  discoveryTarget,
  hostLabel,
  onBack,
  onClose
}: WorkflowExplorerProps): React.JSX.Element {
  const targetsWsl =
    discoveryTarget?.runtime === 'wsl' ||
    discoveryTarget?.projectRuntime?.status === 'repair-required' ||
    (discoveryTarget?.projectRuntime?.status === 'resolved' &&
      discoveryTarget.projectRuntime.runtime.kind === 'wsl')
  const controller = useAgentPresetSettings(
    runtimeTarget,
    targetsWsl
      ? translate(
          'agentPresets.executionRuntimeRequired',
          'Connect to the execution runtime to configure Agents. Client-local WSL fallback is unsupported.'
        )
      : undefined
  )
  const [agentsVisible, setAgentsVisible] = useState(false)
  const inventory = useWorkflowInventory(runtimeTarget, discoveryTarget)
  const [query, setQuery] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const skills = inventory.result?.skills ?? []
  const observation = inventory.result?.workflows
  const visible =
    observation?.entries.filter((entry) => {
      const owner = skills.find((skill) => skill.id === entry.ownerId)
      return `${owner?.name} ${owner?.description} ${owner?.sourceLabel} ${entry.path}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    }) ?? []
  const selected = visible.find((entry) => entry.ownerId === ownerId) ?? visible[0]
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          {translate('workflows.back', 'Back to Skills')}
        </Button>
        <Workflow className="size-4 text-muted-foreground" aria-hidden />
        <h1 className="flex-1 text-sm font-semibold">
          {translate('workflows.title', 'Workflows')}
        </h1>
        <Button variant="outline" size="sm" onClick={() => setAgentsVisible(!agentsVisible)}>
          {agentsVisible
            ? translate('agentPresets.back', 'Back to workflow')
            : translate('agentPresets.manage', 'Manage Agents')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={inventory.loading}
          onClick={inventory.refresh}
        >
          <RefreshCw />
          {translate('workflows.refresh', 'Refresh')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X />
          {translate('workflows.close', 'Close')}
        </Button>
      </header>
      {agentsVisible ? (
        <AgentPresetEditor controller={controller} />
      ) : (
        <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden">
          <aside className="flex shrink-0 flex-col border-b border-border md:w-60 md:border-r md:border-b-0">
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                {hostLabel ?? translate('workflows.resolvingHost', 'Resolving owning runtime…')}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate('workflows.scope', 'Installed Skills inventory on this runtime')}
              </p>
              <Input
                type="search"
                autoFocus
                aria-label={translate('workflows.search', 'Search workflows')}
                placeholder={translate('workflows.search', 'Search workflows')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <nav
              aria-label={translate('workflows.inventory', 'Workflow inventory')}
              className="scrollbar-sleek max-h-60 space-y-1 overflow-auto px-3 pb-4 md:max-h-none md:flex-1"
            >
              {visible.map((entry) => {
                const owner = skills.find((skill) => skill.id === entry.ownerId)
                return (
                  <Button
                    key={entry.ownerId}
                    variant={entry === selected ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    aria-pressed={entry === selected}
                    onClick={() => setOwnerId(entry.ownerId)}
                  >
                    <span className="min-w-0 py-2">
                      <span className="block break-all text-sm">
                        {entry.definition?.name ?? owner?.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {owner?.sourceLabel}
                      </span>
                      {entry.error ? (
                        <span className="block text-xs text-destructive">
                          {translate('workflows.configError', 'Configuration error')}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                )
              })}
            </nav>
          </aside>
          <div className="flex min-w-0 shrink-0 flex-col md:min-h-0 md:flex-1">
            {inventory.loading ? (
              <p
                role="status"
                className="flex items-center gap-2 p-5 text-sm text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" />
                {translate('workflows.loading', 'Reading installed workflows…')}
              </p>
            ) : null}
            {inventory.error ? (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words p-5 text-sm text-destructive"
              >
                {inventory.error}
              </p>
            ) : null}
            {observation?.issues.map((issue) => (
              <p
                key={issue}
                role="status"
                className="border-b border-border px-5 py-3 text-sm text-muted-foreground"
              >
                {issue}
              </p>
            ))}
            {inventory.result && !observation ? (
              <p role="status" className="p-5 text-sm text-muted-foreground">
                {translate(
                  'workflows.updateRequired',
                  'Update the owning Orca runtime to view installed workflows, then refresh.'
                )}
              </p>
            ) : null}
            {observation && !observation.entries.length ? (
              <p className="p-5 text-sm text-muted-foreground">
                {translate(
                  'workflows.empty',
                  'No installed workflows were found. Install a Skill package with a sibling workflow.yaml on this runtime, then refresh.'
                )}
              </p>
            ) : null}
            {observation && observation.entries.length > 0 && visible.length === 0 ? (
              <div className="space-y-3 p-5">
                <p className="text-sm text-muted-foreground">
                  {translate('workflows.noMatches', 'No matching workflows.')}
                </p>
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                  {translate('workflows.clearSearch', 'Clear search')}
                </Button>
              </div>
            ) : null}
            {selected && observation ? (
              <WorkflowDetail
                key={`${selected.ownerId}:${inventory.result?.scannedAt}`}
                controller={controller}
                entry={selected}
                owner={skills.find((skill) => skill.id === selected.ownerId)}
                skills={skills}
                documents={observation.documents}
              />
            ) : null}
          </div>
        </div>
      )}
    </main>
  )
}
