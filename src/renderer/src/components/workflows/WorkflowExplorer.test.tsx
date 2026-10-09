// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowExplorer } from './WorkflowExplorer'
import type { SkillDiscoveryResult } from '../../../../shared/skills'

const discover = vi.hoisted(() => vi.fn())
const runtimeRpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: runtimeRpc }))
vi.mock('@/runtime/runtime-skills-client', () => ({ discoverSkillsForRuntimeTarget: discover }))
afterEach(() => {
  cleanup()
  discover.mockReset()
  runtimeRpc.mockReset()
})
const result: SkillDiscoveryResult = {
  scannedAt: 1,
  sources: [],
  skills: [
    {
      id: 'owner',
      name: 'example',
      description: 'An installed workflow.',
      providers: ['claude'],
      sourceKind: 'home',
      sourceLabel: 'Home',
      rootPath: '/skills',
      directoryPath: '/skills/example',
      skillFilePath: '/skills/example/SKILL.md',
      installed: true,
      updatedAt: null
    }
  ],
  workflows: {
    entries: [
      {
        ownerId: 'owner',
        path: '/skills/example/workflow.yaml',
        source: 'version: 1\nstages: source text',
        definition: {
          version: 1,
          max_fix_rounds: 3,
          stages: [
            { id: 'read', session: 'worker', prompt: 'Read source carefully.', skill: 'example' },
            {
              id: 'check',
              session: 'coordinator',
              prompt: 'Check the evidence.',
              skill: 'missing:review',
              output: 'report.md'
            }
          ]
        }
      }
    ],
    documents: [
      {
        skillId: 'owner',
        source: '# Original Skill\nRead the installed instructions.',
        packageVersion: '0.3.2'
      }
    ],
    issues: []
  }
}
function explorer() {
  return render(
    <WorkflowExplorer
      runtimeTarget={{ kind: 'local' }}
      hostLabel="This machine"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
}
it('supports stage selection, previous/next, original YAML, Skill source and search', async () => {
  discover.mockResolvedValue(result)
  explorer()
  await screen.findByRole('heading', { name: 'example', level: 2 })
  expect(screen.getByText('Read source carefully.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next stage' }))
  expect(screen.getByText('Check the evidence.')).toBeTruthy()
  expect(screen.getByText('report.md')).toBeTruthy()
  expect(screen.getByText(/Skill not found/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Previous stage' }))
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'YAML' }), { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
  await waitFor(() =>
    expect(screen.getByText(/stages: source text/).textContent).toBe(
      'version: 1\nstages: source text'
    )
  )
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Skills' }), { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
  expect(screen.getByText(/Original Skill/)).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search workflows' }), {
    target: { value: 'nothing' }
  })
  expect(screen.getByText('No matching workflows.')).toBeTruthy()
})
it('distinguishes old-host metadata from a successful empty observation', async () => {
  discover.mockResolvedValue({ skills: [], sources: [], scannedAt: 1 })
  explorer()
  expect(await screen.findByText(/Update the owning Orca runtime/)).toBeTruthy()
  cleanup()
  discover.mockResolvedValue({
    skills: [],
    sources: [],
    scannedAt: 1,
    workflows: { entries: [], documents: [], issues: [] }
  })
  explorer()
  expect(await screen.findByText(/No installed workflows/)).toBeTruthy()
})
it('rejects stale responses after a host switch and offers retry on transport failure', async () => {
  let finish!: (value: SkillDiscoveryResult) => void
  discover
    .mockReturnValueOnce(
      new Promise<SkillDiscoveryResult>((resolve) => {
        finish = resolve
      })
    )
    .mockRejectedValueOnce(new Error('Remote offline'))
  const rendered = explorer()
  rendered.rerender(
    <WorkflowExplorer
      runtimeTarget={{ kind: 'environment', environmentId: 'remote' }}
      hostLabel="Server"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  expect(await screen.findByText('Remote offline')).toBeTruthy()
  finish(result)
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'example' })).toBeNull())
  discover.mockResolvedValue({
    skills: [],
    sources: [],
    scannedAt: 2,
    workflows: { entries: [], documents: [], issues: [] }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText(/No installed workflows/)).toBeTruthy()
})
it('shows configuration failures with original text and visible partial-inventory warnings', async () => {
  discover.mockResolvedValue({
    ...result,
    workflows: {
      entries: [
        {
          ownerId: 'owner',
          path: '/skills/example/workflow.yaml',
          source: 'version: 2\nstages: unsupported',
          error: 'Unsupported workflow version'
        }
      ],
      documents: [],
      issues: ['Partial inventory: read limit reached.']
    }
  })
  explorer()
  expect(await screen.findByText('Unsupported workflow version')).toBeTruthy()
  expect(screen.getByText('Partial inventory: read limit reached.')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Flow' }).getAttribute('disabled')).not.toBeNull()
  expect(screen.getByText(/stages: unsupported/).textContent).toBe(
    'version: 2\nstages: unsupported'
  )
})
it('keeps the local WSL discovery target and requests an explicit disk refresh', async () => {
  discover.mockResolvedValue(result)
  const runtimeTarget = { kind: 'local' } as const
  const discoveryTarget = { runtime: 'wsl', wslDistro: 'Ubuntu' } as const
  render(
    <WorkflowExplorer
      runtimeTarget={runtimeTarget}
      discoveryTarget={discoveryTarget}
      hostLabel="WSL Ubuntu"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  await screen.findByRole('heading', { name: 'example', level: 2 })
  expect(discover).toHaveBeenCalledWith(runtimeTarget, {
    runtime: 'wsl',
    wslDistro: 'Ubuntu',
    includeWorkflows: true
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() =>
    expect(discover).toHaveBeenLastCalledWith(runtimeTarget, {
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      includeWorkflows: true,
      refresh: true
    })
  )
})

it('exposes reusable Agent definitions from the workflow viewer', async () => {
  discover.mockResolvedValue(result)
  explorer()
  await screen.findByRole('heading', { name: 'example', level: 2 })
  expect(screen.getByRole('button', { name: 'Manage Agents' })).toBeTruthy()
})

it('saves edited role instructions on the selected runtime and retains missing workflow references after deletion', async () => {
  const target = { kind: 'environment' as const, environmentId: 'host-second' }
  let settings = {
    agentPresets: [
      { id: 'review', name: 'Review', provider: 'codex', systemInstructions: 'Review.' }
    ],
    workflowAgentBindings: { owner: { defaultAgentId: 'review' } }
  }
  runtimeRpc.mockImplementation(async (receivedTarget, method, updates) => {
    expect(receivedTarget).toEqual(target)
    if (method === 'status.get') {
      return { capabilities: ['agent-presets-v1'] }
    }
    if (method === 'settings.update') {
      settings = { ...settings, ...updates }
    }
    return { settings }
  })
  discover.mockResolvedValue(result)
  render(
    <WorkflowExplorer
      runtimeTarget={target}
      hostLabel="Second host"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  await screen.findByRole('heading', { name: 'example', level: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'Manage Agents' }))
  fireEvent.click(await screen.findByRole('button', { name: /Review.*codex/ }))
  fireEvent.change(screen.getByLabelText('System instructions'), {
    target: { value: 'Review security and correctness.' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save Agent' }))
  await waitFor(() =>
    expect(settings.agentPresets[0]?.systemInstructions).toBe('Review security and correctness.')
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Delete Agent' }).hasAttribute('disabled')).toBe(
      false
    )
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete Agent' }))
  await waitFor(() => expect(settings.agentPresets).toEqual([]))
  fireEvent.click(screen.getByRole('button', { name: 'Back to workflow' }))
  expect(screen.getAllByText(/Agent preset review is missing/).length).toBeGreaterThan(0)
  expect(settings.workflowAgentBindings.owner.defaultAgentId).toBe('review')
})

it('refuses client-local Agent settings when the workflow inventory belongs to WSL', async () => {
  runtimeRpc.mockResolvedValue({ capabilities: ['agent-presets-v1'] })
  discover.mockResolvedValue(result)
  render(
    <WorkflowExplorer
      runtimeTarget={{ kind: 'local' }}
      discoveryTarget={{ runtime: 'wsl', wslDistro: 'Ubuntu' }}
      hostLabel="Ubuntu"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  await screen.findByRole('heading', { name: 'example', level: 2 })
  expect(runtimeRpc).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Manage Agents' }))
  expect(screen.getByRole('alert').textContent).toContain('execution runtime')
  expect(screen.getByRole('button', { name: 'Create Agent' }).hasAttribute('disabled')).toBe(true)
})
