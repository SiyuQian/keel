import type { DiscoveredSkill } from './skills'
export function workflowSkillCandidates(
  reference: string,
  skills: readonly DiscoveredSkill[]
): DiscoveredSkill[] {
  const separator = reference.indexOf(':')
  if (separator === -1) {
    return skills.filter((skill) => skill.installed && skill.name === reference)
  }
  const namespace = reference.slice(0, separator)
  const name = reference.slice(separator + 1)
  return skills.filter(
    (skill) =>
      skill.installed &&
      (skill.name === reference ||
        (skill.name === name && skill.pluginNamespaces?.includes(namespace)))
  )
}
