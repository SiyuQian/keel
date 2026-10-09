import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition, isOrcaCoordinatorWorkflow } from './workflow-definition'

const source = `version: 1
max_fix_rounds: 2
stages:
  - id: inspect
    session: worker
    skill: null
    output: report.md
    prompt: Read the source.
`

describe('workflow definitions', () => {
  it('preserves ordered generic stages and declared limits', () => {
    const result = parseWorkflowDefinition(source)
    expect(result.stages).toEqual([
      {
        id: 'inspect',
        session: 'worker',
        skill: null,
        output: 'report.md',
        prompt: 'Read the source.'
      }
    ])
    expect(result.max_fix_rounds).toBe(2)
    expect(isOrcaCoordinatorWorkflow('other', result)).toBe(false)
  })
  it.each([
    source.replace('version: 1', 'version: 2'),
    source.replace('Read the source.', '""'),
    `${source}  - id: inspect\n    session: worker\n    prompt: Again\n`,
    source.replace('null', '*missing'),
    `${source.replace('Read the source.', '&prompt Read the source.')}extra: *prompt\n`,
    'x'.repeat(131073),
    'version: 1\nstages: []',
    `version: 1\nstages:\n${Array.from({ length: 65 }, (_, i) => `  - {id: s${i}, session: worker, prompt: Read}`).join('\n')}`
  ])('rejects unsupported, unsafe or incomplete definitions', (input) => {
    expect(() => parseWorkflowDefinition(input)).toThrow()
  })
  it('recognizes the coordinator contract only with its owner, sessions and skill assignments', () => {
    const assignments: Record<string, string> = {
      clarify: 'devpilot:grilling',
      publish: 'devpilot:pr-creator',
      review: 'devpilot:pr-review',
      fix: 'devpilot:handling-code-review'
    }
    const stages = [
      'clarify',
      'plan',
      'plan-review',
      'implement',
      'publish',
      'review',
      'fix',
      'accept'
    ].map((id) => ({
      id,
      session:
        id === 'implement'
          ? 'worker'
          : ['review', 'fix'].includes(id)
            ? 'fresh-terminal'
            : 'coordinator',
      skill: assignments[id] ?? null,
      prompt: 'Read.'
    }))
    const definition = parseWorkflowDefinition(JSON.stringify({ version: 1, stages }))
    expect(isOrcaCoordinatorWorkflow('orca-dev-workflow', definition)).toBe(true)
    expect(isOrcaCoordinatorWorkflow('other', definition)).toBe(false)
    definition.stages[5]!.session = 'worker'
    expect(isOrcaCoordinatorWorkflow('orca-dev-workflow', definition)).toBe(false)
  })
})
