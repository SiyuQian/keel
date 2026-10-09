import { createBrowserUuid } from '@/lib/browser-uuid'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  AgentPresetSchema,
  MAX_AGENT_SYSTEM_INSTRUCTIONS,
  type AgentPreset
} from '../../../../shared/agent-presets'
import { getAgentSessionOptionLaunchCatalog } from '../../../../shared/agent-session-option-launch'
import {
  findCatalogModel,
  findCatalogOption
} from '../../../../shared/agent-session-option-catalog'
import type { AgentPresetSettingsController } from './use-agent-preset-settings'

export function AgentPresetEditor({
  controller
}: {
  controller: AgentPresetSettingsController
}): React.JSX.Element {
  const { presets, settings, saving, error, save } = controller
  const [draft, setDraft] = useState<AgentPreset | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const catalog = draft ? getAgentSessionOptionLaunchCatalog(draft.provider) : null
  const model = draft?.model && catalog ? findCatalogModel(catalog, draft.model) : undefined
  const effort =
    findCatalogOption(model || undefined, 'effort') ??
    (!model ? catalog?.unknownModelOptions?.find((option) => option.id === 'effort') : undefined)
  const defaults = translate('agentPresets.providerDefault', 'Provider default')
  function choose(preset: AgentPreset) {
    setDraft({ ...preset })
    setValidation(null)
  }
  return (
    <section className="scrollbar-sleek min-h-0 min-w-0 flex-1 overflow-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{translate('agentPresets.title', 'Agents')}</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={!settings || saving}
          onClick={() =>
            choose({
              id: `agent_${createBrowserUuid()}`,
              name: '',
              provider: 'codex',
              systemInstructions: ''
            })
          }
        >
          {translate('agentPresets.create', 'Create Agent')}
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {translate(
          'agentPresets.hostNotice',
          'Saved on this runtime. Each configured step starts a fresh independent session; the coordinator supplies its task and preceding results.'
        )}
      </p>
      {error || validation ? (
        <p role="alert" className="mb-4 break-words text-sm text-destructive">
          {validation ?? error}
        </p>
      ) : null}
      {!settings && !error ? (
        <p role="status">{translate('agentPresets.loading', 'Loading Agents…')}</p>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <nav aria-label={translate('agentPresets.title', 'Agents')} className="space-y-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              variant={draft?.id === preset.id ? 'secondary' : 'ghost'}
              className="h-auto w-full justify-start whitespace-normal text-left"
              aria-pressed={draft?.id === preset.id}
              disabled={saving}
              onClick={() => choose(preset)}
            >
              <span className="min-w-0 py-2">
                <span className="block break-words">{preset.name}</span>
                <span className="block break-words text-xs text-muted-foreground">
                  {preset.provider} · {preset.model ?? defaults} · {preset.effort ?? defaults}
                </span>
              </span>
            </Button>
          ))}
          {settings && !presets.length ? (
            <p className="text-sm text-muted-foreground">
              {translate(
                'agentPresets.empty',
                'No Agents saved. Create an Agent to bind workflow steps.'
              )}
            </p>
          ) : null}
        </nav>
        {draft ? (
          <form
            className="min-w-0 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const parsed = AgentPresetSchema.safeParse(draft)
              if (!parsed.success) {
                setValidation(parsed.error.issues.map((issue) => issue.message).join(' '))
                return
              }
              setValidation(null)
              void save({
                agentPresets: [...presets.filter((preset) => preset.id !== draft.id), parsed.data]
              }).then((saved) => {
                if (saved) {
                  setDraft(parsed.data)
                }
              })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="agent-name">{translate('agentPresets.name', 'Name')}</Label>
              <Input
                id="agent-name"
                value={draft.name}
                maxLength={128}
                disabled={saving}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">ID: {draft.id}</p>
            <div className="space-y-2">
              <Label>{translate('agentPresets.provider', 'Provider')}</Label>
              <Select
                value={draft.provider}
                disabled={saving}
                onValueChange={(provider) => {
                  if (provider === 'claude' || provider === 'codex') {
                    setDraft({
                      id: draft.id,
                      name: draft.name,
                      provider,
                      systemInstructions: draft.systemInstructions
                    })
                  }
                }}
              >
                <SelectTrigger aria-label={translate('agentPresets.provider', 'Provider')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="codex">Codex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{translate('agentPresets.model', 'Model')}</Label>
              <Select
                value={draft.model ?? '__default__'}
                disabled={saving}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    model: value === '__default__' ? undefined : value,
                    effort: undefined
                  })
                }
              >
                <SelectTrigger aria-label={translate('agentPresets.model', 'Model')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">{defaults}</SelectItem>
                  {draft.model && !catalog?.models.some((entry) => entry.id === draft.model) ? (
                    <SelectItem value={draft.model}>{draft.model}</SelectItem>
                  ) : null}
                  {catalog?.models.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{translate('agentPresets.effort', 'Effort')}</Label>
              <Select
                value={draft.effort ?? '__default__'}
                disabled={saving || !draft.model}
                onValueChange={(value) =>
                  setDraft({ ...draft, effort: value === '__default__' ? undefined : value })
                }
              >
                <SelectTrigger aria-label={translate('agentPresets.effort', 'Effort')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">{defaults}</SelectItem>
                  {effort?.kind.type === 'select'
                    ? effort.kind.choices.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-instructions">
                {translate('agentPresets.instructions', 'System instructions')}
              </Label>
              <Textarea
                id="agent-instructions"
                value={draft.systemInstructions}
                rows={8}
                maxLength={MAX_AGENT_SYSTEM_INSTRUCTIONS}
                disabled={saving}
                onChange={(event) => setDraft({ ...draft, systemInstructions: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {draft.systemInstructions.length} / {MAX_AGENT_SYSTEM_INSTRUCTIONS}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? translate('agentPresets.saving', 'Saving…')
                  : translate('agentPresets.save', 'Save Agent')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                {translate('agentPresets.cancel', 'Cancel')}
              </Button>
              {presets.some((preset) => preset.id === draft.id) ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => {
                    void save({
                      agentPresets: presets.filter((preset) => preset.id !== draft.id)
                    }).then((saved) => {
                      if (saved) {
                        setDraft(null)
                      }
                    })
                  }}
                >
                  {translate('agentPresets.delete', 'Delete Agent')}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {translate(
                'agentPresets.deleteNotice',
                'Deleting an Agent leaves its workflow references unresolved. Select another Agent explicitly before launching those steps.'
              )}
            </p>
          </form>
        ) : null}
      </div>
    </section>
  )
}
