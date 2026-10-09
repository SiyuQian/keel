import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { workflowSkillCandidates } from '../../../../shared/workflow-skill-reference'
import type { DiscoveredSkill } from '../../../../shared/skills'
import type { WorkflowSkillDocument } from '../../../../shared/workflow-observation'

export function WorkflowSkillSource({
  reference,
  skills,
  documents
}: {
  reference: string
  skills: readonly DiscoveredSkill[]
  documents: readonly WorkflowSkillDocument[]
}): React.JSX.Element {
  const candidates = workflowSkillCandidates(reference, skills)
  return (
    <section className="space-y-3">
      <h3 className="break-all font-mono text-sm font-medium">{reference}</h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'workflows.missingSkill',
            'Skill not found in this inventory. Refresh after installing it on the owning runtime.'
          )}
        </p>
      ) : null}
      {candidates.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'workflows.ambiguousSkill',
            'Multiple installed Skills match. Each source is shown below.'
          )}
        </p>
      ) : null}
      {candidates.map((skill) => {
        const document = documents.find((item) => item.skillId === skill.id)
        return (
          <div key={skill.id} className="space-y-2 border-t border-border pt-3">
            <p className="text-sm">
              {skill.description ??
                translate('workflows.noDescription', 'No description declared.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {skill.sourceLabel} · {skill.providers.join(', ')}
              {document?.packageVersion
                ? translate('workflows.skillVersion', ' · v{{version}}', {
                    version: document.packageVersion
                  })
                : ''}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {skill.skillFilePath}
            </p>
            {document?.error ? (
              <p role="alert" className="break-words text-sm text-destructive">
                {document.error}
              </p>
            ) : null}
            {document?.source ? (
              <Collapsible>
                <CollapsibleTrigger variant="row">
                  {translate('workflows.rawSkill', 'Original SKILL.md')}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="scrollbar-sleek mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                    {document.source}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : !document ? (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'workflows.sourceUnavailable',
                  'Skill source is unavailable in this observation.'
                )}
              </p>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
