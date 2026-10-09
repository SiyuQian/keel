import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import type { SettingsSearchEntry } from './settings-search'

export function getCodeIntelSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('settings.experimental.codeIntel.title', 'Code intelligence'),
    description: translate(
      'settings.experimental.codeIntel.description',
      'Project-aware definitions and references for local TypeScript and JavaScript files.'
    ),
    keywords: ['typescript', 'javascript', 'definition', 'references', 'semantic', 'experimental']
  }
}
export function CodeIntelExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const entry = getCodeIntelSearchEntry()
  return (
    <SearchableSetting {...entry} className="space-y-3 py-2" id="experimental-code-intelligence">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>{entry.title}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'settings.experimental.codeIntel.copy',
              'Enable Go to Definition and Find References for local TS/JS projects, including TSX/JSX. Requires a tsconfig or jsconfig. Remote and SSH files are not supported.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={settings.experimentalCodeIntelligence === true}
          ariaLabel={entry.title}
          onChange={() =>
            updateSettings({
              experimentalCodeIntelligence: settings.experimentalCodeIntelligence !== true
            })
          }
        />
      </div>
    </SearchableSetting>
  )
}
