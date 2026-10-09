import { expect, it } from 'vitest'
import type { DiscoveredSkill } from './skills'
import { workflowSkillCandidates } from './workflow-skill-reference'

export function fixtureSkill(id: string, name = 'review', sourceLabel = 'Home'): DiscoveredSkill {
  return {
    id,
    name,
    description: 'Review code.',
    providers: ['claude'],
    sourceKind: sourceLabel.startsWith('Claude plugin ') ? 'plugin' : 'home',
    sourceLabel,
    rootPath: '/skills',
    directoryPath: `/skills/${id}`,
    skillFilePath: `/skills/${id}/SKILL.md`,
    installed: true,
    updatedAt: null
  }
}
it('keeps bare-name ambiguity but never substitutes a different plugin for a namespace', () => {
  const skills = [
    fixtureSkill('home'),
    fixtureSkill('plugin-a', 'review', 'Claude plugin alpha'),
    fixtureSkill('plugin-b', 'review', 'Claude plugin beta')
  ]
  expect(workflowSkillCandidates('review', skills).map((s) => s.id)).toEqual([
    'home',
    'plugin-a',
    'plugin-b'
  ])
  expect(workflowSkillCandidates('alpha:review', skills).map((s) => s.id)).toEqual(['plugin-a'])
  expect(workflowSkillCandidates('missing:review', skills)).toEqual([])
})
