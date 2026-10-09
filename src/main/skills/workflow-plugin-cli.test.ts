import * as os from 'node:os'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
const handlersPath = '../../cli/handlers/agents'
const { AGENT_PRESET_HANDLERS } = await import(handlersPath)
import { AGENT_PRESETS_CAPABILITY } from '../../shared/agent-presets'
import { SkillsDiscoverParams } from '../../shared/rpc-contract/skills-params'
import { clearSkillDiscoveryCaches, discoverSkillsOnTarget } from './skill-discovery-target'
const formatPath = '../../cli/format'
const { printResult } = await import(formatPath)

vi.mock('node:os', { spy: true })
vi.mock('../../cli/format', () => ({ printResult: vi.fn() }))

it('lists and resolves a real user-plugin workflow without sending a client cwd to its host', async () => {
  const home = await mkdtemp(join(os.tmpdir(), 'agents-plugin-'))
  const packageRoot = join(home, '.claude', 'plugins', 'cache', 'market', 'package', '1')
  const skill = join(packageRoot, 'skills', 'review')
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: review\n---\nReview.')
  await writeFile(
    join(skill, 'workflow.yaml'),
    'version: 1\nname: Plugin workflow\nstages: [{id: review, session: worker, prompt: Review.}]'
  )
  await writeFile(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      plugins: { 'devpilot@market': [{ scope: 'user', installPath: packageRoot }] }
    })
  )
  await writeFile(
    join(home, '.claude', 'settings.json'),
    '{"enabledPlugins":{"devpilot@market":true}}'
  )
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  const role = { id: 'review', name: 'Review', provider: 'codex', systemInstructions: 'Review.' }
  try {
    const inventory = await discoverSkillsOnTarget({ kind: 'native-host', cwd: undefined }, [], {
      includeWorkflows: true
    })
    const workflow = inventory.workflows?.entries.find(
      (entry) => entry.path === join(skill, 'workflow.yaml')
    )
    expect(workflow?.definition?.name).toBe('Plugin workflow')
    if (!workflow) {
      throw new Error('Plugin workflow missing')
    }
    const call = async (method: string, params?: unknown) => {
      if (method === 'status.get') {
        return { result: { capabilities: [AGENT_PRESETS_CAPABILITY] } }
      }
      if (method === 'settings.get') {
        return {
          result: {
            settings: {
              agentPresets: [role],
              workflowAgentBindings: { [workflow.ownerId]: { defaultAgentId: 'review' } }
            }
          }
        }
      }
      const target = SkillsDiscoverParams.parse(params)
      expect(target.cwd).toBeUndefined()
      expect(target.worktreeId).toBeUndefined()
      return {
        result: await discoverSkillsOnTarget({ kind: 'native-host', cwd: undefined }, [], target)
      }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these handlers consume only flags, cwd, client.call and json.
    const ctx = {
      flags: new Map([
        ['workflow', workflow.ownerId],
        ['step', 'review']
      ]),
      cwd: '/client-only/path',
      client: { call },
      json: true
    } as never
    await AGENT_PRESET_HANDLERS['agents workflows'](ctx)
    expect(printResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        result: {
          workflows: [
            expect.objectContaining({
              name: 'Plugin workflow',
              path: join(skill, 'workflow.yaml'),
              steps: ['review']
            })
          ]
        }
      }),
      true,
      expect.any(Function)
    )
    await AGENT_PRESET_HANDLERS['agents resolve'](ctx)
    expect(printResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        result: {
          workflowId: workflow.ownerId,
          stepId: 'review',
          agentPresetId: 'review',
          agent: role
        }
      }),
      true,
      expect.any(Function)
    )
  } finally {
    clearSkillDiscoveryCaches()
    vi.restoreAllMocks()
    await rm(home, { recursive: true, force: true })
  }
})
