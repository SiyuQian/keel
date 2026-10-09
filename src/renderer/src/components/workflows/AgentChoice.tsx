import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { AgentPreset } from '../../../../shared/agent-presets'

export function AgentChoice({
  label,
  value,
  presets,
  emptyLabel,
  disabled,
  onChange
}: {
  label: string
  value?: string
  presets: readonly AgentPreset[]
  emptyLabel: string
  disabled?: boolean
  onChange: (value: string | undefined) => void
}): React.JSX.Element {
  const missing = value && !presets.some((preset) => preset.id === value)
  return (
    <Select
      value={value ?? '__inherit__'}
      onValueChange={(next) => onChange(next === '__inherit__' ? undefined : next)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__inherit__">{emptyLabel}</SelectItem>
        {missing ? (
          <SelectItem value={value}>
            {translate('agentPresets.missing', 'Missing Agent')}: {value}
          </SelectItem>
        ) : null}
        {presets.map((preset) => (
          <SelectItem key={preset.id} value={preset.id}>
            {preset.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
