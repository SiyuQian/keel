import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_PRESET_HANDLERS } from './agents'
import { AGENT_PRESETS_CAPABILITY } from '../../shared/agent-presets'
import { printResult } from '../format'
import { SkillsDiscoverParams } from '../../shared/rpc-contract/skills-params'
vi.mock('../format', () => ({ printResult: vi.fn() }))
afterEach(() => vi.clearAllMocks())
const role = {
  id: 'review',
  name: 'Review',
  provider: 'codex',
  systemInstructions: 'Inspect the change.'
}
async function resolve(
  binding: unknown,
  presets: unknown[] = [role],
  capabilities: string[] = [AGENT_PRESETS_CAPABILITY],
  command = 'agents resolve'
) {
  const call = vi.fn(async (method: string, params?: unknown) => ({
    result:
      method === 'status.get'
        ? { capabilities }
        : method === 'settings.get'
          ? { settings: { agentPresets: presets, workflowAgentBindings: { workflow: binding } } }
          : SkillsDiscoverParams.parse(params).includeWorkflows
            ? {
                workflows: {
                  entries: [
                    {
                      ownerId: 'workflow',
                      path: '/skills/workflow.yaml',
                      definition: { name: 'Workflow', stages: [{ id: 'review' }] }
                    }
                  ]
                }
              }
            : {}
  }))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these handlers use only flags, client.call and json from HandlerContext.
  const ctx = {
    flags: new Map([
      ['workflow', 'workflow'],
      ['step', 'review']
    ]),
    cwd: '/tmp/repo',
    client: { call },
    json: true
  } as never
  await AGENT_PRESET_HANDLERS[command](ctx)
  return call
}
it('exposes the resolved fixed role ID, instructions and launch definition to the coordinator', async () => {
  await resolve({ defaultAgentId: 'review' })
  expect(printResult).toHaveBeenCalledWith(
    expect.objectContaining({
      result: { workflowId: 'workflow', stepId: 'review', agentPresetId: 'review', agent: role }
    }),
    true,
    expect.any(Function)
  )
})
it('refuses deleted overrides even when the workflow default is valid', async () => {
  await expect(
    resolve({ defaultAgentId: 'review', stepAgentIds: { review: 'deleted' } })
  ).rejects.toThrow('missing')
})
it('refuses unconfigured steps and older owning runtimes', async () => {
  await expect(resolve({})).rejects.toThrow('No Agent')
  await expect(resolve({}, [], [])).rejects.toThrow('owning runtime')
})

it('lists installed workflows with saved bindings after opting into discovery', async () => {
  await resolve(
    { defaultAgentId: 'review' },
    [role],
    [AGENT_PRESETS_CAPABILITY],
    'agents workflows'
  )
  expect(printResult).toHaveBeenCalledWith(
    expect.objectContaining({
      result: {
        workflows: [
          {
            id: 'workflow',
            name: 'Workflow',
            path: '/skills/workflow.yaml',
            steps: ['review'],
            binding: { defaultAgentId: 'review' },
            error: undefined
          }
        ]
      }
    }),
    true,
    expect.any(Function)
  )
})
