import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_PRESET_HANDLERS } from './agents'
import { AGENT_PRESETS_CAPABILITY } from '../../shared/agent-presets'
import { printResult } from '../format'
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
  capabilities: string[] = [AGENT_PRESETS_CAPABILITY]
) {
  const call = vi.fn(async (method: string) => ({
    result:
      method === 'status.get'
        ? { capabilities }
        : method === 'settings.get'
          ? { settings: { agentPresets: presets, workflowAgentBindings: { workflow: binding } } }
          : {
              workflows: {
                entries: [{ ownerId: 'workflow', definition: { stages: [{ id: 'review' }] } }]
              }
            }
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
  await AGENT_PRESET_HANDLERS['agents resolve'](ctx)
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
