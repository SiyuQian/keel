import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import type { DiscoveredSkill } from '../../../../shared/skills'
import type { WorkflowEntry, WorkflowSkillDocument } from '../../../../shared/workflow-observation'
import { isOrcaCoordinatorWorkflow } from '../../../../shared/workflow-definition'
import { WorkflowAgentBinding } from './WorkflowAgentBinding'
import type { AgentPresetSettingsController } from './use-agent-preset-settings'
import { WorkflowSkillSource } from './WorkflowSkillSource'

export function WorkflowDetail({
  entry,
  owner,
  skills,
  documents,
  controller
}: {
  controller?: AgentPresetSettingsController
  entry: WorkflowEntry
  owner?: DiscoveredSkill
  skills: readonly DiscoveredSkill[]
  documents: readonly WorkflowSkillDocument[]
}): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const definition = entry.definition
  const stages = definition?.stages ?? []
  const selected = stages.find((stage) => stage.id === selectedId) ?? stages[0]
  const index = selected ? stages.indexOf(selected) : -1
  const known = !!definition && isOrcaCoordinatorWorkflow(owner?.name ?? '', definition)
  const references = [...new Set(stages.flatMap((stage) => (stage.skill ? [stage.skill] : [])))]
  const version = documents.find((document) => document.skillId === owner?.id)?.packageVersion
  return (
    <section className="flex min-w-0 flex-col md:min-h-0 md:flex-1">
      <header className="space-y-2 border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-lg font-semibold">{definition?.name ?? owner?.name}</h2>
          <Badge variant="outline">{translate('workflows.installed', 'Installed')}</Badge>
          {version ? <Badge variant="secondary">v{version}</Badge> : null}
          {definition ? (
            <Badge variant="outline">
              {translate('workflows.configVersion', 'Config v{{version}}', {
                version: definition.version
              })}
            </Badge>
          ) : null}
        </div>
        {definition?.description || owner?.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {definition?.description ?? owner?.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {owner?.sourceLabel} · {owner?.sourceKind} · {owner?.providers.join(', ')}
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">{entry.path}</p>
        {definition?.max_plan_revisions !== undefined ? (
          <p className="text-xs text-muted-foreground">
            max_plan_revisions: {definition.max_plan_revisions}
          </p>
        ) : null}
        {definition?.max_fix_rounds !== undefined ? (
          <p className="text-xs text-muted-foreground">
            max_fix_rounds: {definition.max_fix_rounds}
          </p>
        ) : null}
        {entry.error ? (
          <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">
            {entry.error}
          </p>
        ) : null}
        {controller ? (
          <WorkflowAgentBinding workflowId={entry.ownerId} controller={controller} />
        ) : null}
      </header>
      <Tabs defaultValue={definition ? 'flow' : 'yaml'} className="md:min-h-0 md:flex-1">
        <div className="border-b border-border px-5">
          <TabsList variant="line" aria-label={translate('workflows.views', 'Workflow views')}>
            <TabsTrigger value="flow" disabled={!definition}>
              {translate('workflows.flow', 'Flow')}
            </TabsTrigger>
            <TabsTrigger value="skills" disabled={!definition}>
              {translate('workflows.skills', 'Skills')}
            </TabsTrigger>
            <TabsTrigger value="yaml">{translate('workflows.yaml', 'YAML')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="flow" className="md:min-h-0 md:overflow-hidden">
          <div className="scrollbar-sleek md:h-full md:overflow-auto">
            <div className="grid min-w-0 gap-6 p-5 xl:grid-cols-2">
              <section
                aria-label={translate('workflows.orderedStages', 'Ordered stages')}
                className="min-w-0"
              >
                <ol className="space-y-2">
                  {stages.map((stage, stageIndex) => (
                    <li key={stage.id}>
                      {stageIndex > 0 ? (
                        <ArrowDown
                          className="mx-4 mb-2 size-3.5 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                      <Button
                        variant={stage === selected ? 'secondary' : 'outline'}
                        className="h-auto w-full justify-start whitespace-normal text-left"
                        aria-pressed={stage === selected}
                        onClick={() => setSelectedId(stage.id)}
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(stageIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1 py-2">
                          <span className="block break-all font-medium">{stage.id}</span>
                          <span className="block break-all text-xs text-muted-foreground">
                            {stage.session} ·{' '}
                            {stage.skill ?? translate('workflows.promptOnly', 'Prompt only')}
                          </span>
                        </span>
                        {known && stage.id === 'fix' ? (
                          <Badge variant="outline">
                            {translate('workflows.conditional', 'Conditional')}
                          </Badge>
                        ) : null}
                      </Button>
                    </li>
                  ))}
                </ol>
                {known ? (
                  <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <p className="font-medium">
                      {translate('workflows.coordinatorReturns', 'Coordinator return paths')}
                    </p>
                    <p>
                      plan-review → plan
                      {definition?.max_plan_revisions !== undefined
                        ? ` · max_plan_revisions: ${definition.max_plan_revisions}`
                        : ''}
                    </p>
                    <p>
                      fix → review
                      {definition?.max_fix_rounds !== undefined
                        ? ` · max_fix_rounds: ${definition.max_fix_rounds}`
                        : ''}
                    </p>
                    <p>
                      {translate(
                        'workflows.contractNotice',
                        'These return paths and conditional fix belong to the Orca coordinator contract. They are not execution state.'
                      )}
                    </p>
                  </div>
                ) : null}
              </section>
              {selected ? (
                <aside
                  aria-label={translate('workflows.stageDetails', 'Stage details')}
                  className="min-w-0 space-y-4 xl:border-l xl:border-border xl:pl-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="break-all font-mono text-sm font-semibold">{selected.id}</h3>
                    <span className="text-xs text-muted-foreground">
                      {index + 1} / {stages.length}
                    </span>
                  </div>
                  {controller ? (
                    <WorkflowAgentBinding
                      workflowId={entry.ownerId}
                      stepId={selected.id}
                      controller={controller}
                    />
                  ) : null}
                  <dl className="space-y-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {translate('workflows.session', 'Session')}
                      </dt>
                      <dd className="break-all font-mono">{selected.session}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {translate('workflows.output', 'Output artifact')}
                      </dt>
                      <dd className="break-all font-mono">
                        {selected.output ?? translate('workflows.notDeclared', 'Not declared')}
                      </dd>
                    </div>
                  </dl>
                  {selected.skill ? (
                    <WorkflowSkillSource
                      reference={selected.skill}
                      skills={skills}
                      documents={documents}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {translate('workflows.promptOnly', 'Prompt only')}
                    </p>
                  )}
                  <section className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      {translate('workflows.purposePrompt', 'Purpose / prompt')}
                    </h4>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {selected.prompt}
                    </p>
                  </section>
                  <div className="flex justify-between gap-2 border-t border-border pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index <= 0}
                      onClick={() => setSelectedId(stages[index - 1]?.id ?? null)}
                      aria-label={translate('workflows.previous', 'Previous stage')}
                    >
                      <ArrowLeft />
                      {translate('workflows.previous', 'Previous stage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index >= stages.length - 1}
                      onClick={() => setSelectedId(stages[index + 1]?.id ?? null)}
                      aria-label={translate('workflows.next', 'Next stage')}
                    >
                      {translate('workflows.next', 'Next stage')}
                      <ArrowRight />
                    </Button>
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="skills" className="md:min-h-0 md:overflow-hidden">
          <div className="scrollbar-sleek space-y-6 p-5 md:h-full md:overflow-auto">
            {owner ? (
              <WorkflowSkillSource reference={owner.name} skills={[owner]} documents={documents} />
            ) : null}
            {references
              .filter((reference) => reference !== owner?.name)
              .map((reference) => (
                <WorkflowSkillSource
                  key={reference}
                  reference={reference}
                  skills={skills}
                  documents={documents}
                />
              ))}
          </div>
        </TabsContent>
        <TabsContent value="yaml" className="md:min-h-0 md:overflow-hidden">
          <div className="scrollbar-sleek bg-editor-surface p-5 md:h-full md:overflow-auto">
            {entry.source !== null ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {entry.source}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'workflows.yamlUnavailable',
                  'Original YAML is unavailable. Refresh to retry the read.'
                )}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
