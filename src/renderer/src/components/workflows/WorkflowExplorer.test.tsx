// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowExplorer } from './WorkflowExplorer'
import type { SkillDiscoveryResult } from '../../../../shared/skills'

const discover = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-skills-client', () => ({ discoverSkillsForRuntimeTarget: discover }))
afterEach(() => {
  cleanup()
  discover.mockReset()
  vi.useRealTimers()
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
  fireEvent.click(screen.getByRole('button', { name: 'Original SKILL.md' }))
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

it('searches the declared workflow name and description independently of its owner', async () => {
  discover.mockResolvedValue({
    ...result,
    workflows: {
      ...result.workflows,
      entries: result.workflows!.entries.map((entry) => ({
        ...entry,
        definition: {
          ...entry.definition!,
          name: 'Release checklist',
          description: 'Ship the package.'
        }
      }))
    }
  })
  explorer()
  await screen.findByRole('heading', { name: 'Release checklist', level: 2 })
  for (const query of ['Release checklist', 'Ship the package']) {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } })
    expect(screen.queryByText('No matching workflows.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Release checklist', level: 2 })).toBeTruthy()
  }
})
it('marks the current workflow and updates the current stage when navigating', async () => {
  discover.mockResolvedValue(result)
  explorer()
  await screen.findByRole('heading', { name: 'example', level: 2 })
  expect(screen.getByRole('button', { name: 'example Home' }).getAttribute('data-current')).toBe(
    'true'
  )
  const read = screen.getByRole('button', { name: /01 read/ })
  expect(read.getAttribute('data-current')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Next stage' }))
  expect(read.getAttribute('data-current')).toBeNull()
  expect(screen.getByRole('button', { name: /02 check/ }).getAttribute('data-current')).toBe('true')
})
it('defers visible loading and keeps the previous observation during a fast refresh', async () => {
  discover.mockResolvedValueOnce(result)
  const runtimeTarget = { kind: 'local' } as const
  render(
    <WorkflowExplorer
      runtimeTarget={runtimeTarget}
      hostLabel="This machine"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  await screen.findByRole('heading', { name: 'example', level: 2 })
  vi.useFakeTimers()
  let finish!: (value: SkillDiscoveryResult) => void
  discover.mockReturnValueOnce(
    new Promise<SkillDiscoveryResult>((resolve) => {
      finish = resolve
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('heading', { name: 'example', level: 2 })).toBeTruthy()
  expect(screen.queryByText('Reading installed workflows…')).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(199)
  })
  expect(screen.queryByText('Reading installed workflows…')).toBeNull()
  await act(async () => {
    finish(result)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.queryByText('Reading installed workflows…')).toBeNull()
  expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(false)
})
it('shows delayed feedback for a slow request and resets its timer on host switch', async () => {
  vi.useFakeTimers()
  discover.mockReturnValue(new Promise<SkillDiscoveryResult>(() => {}))
  const local = { kind: 'local' } as const
  const rendered = render(
    <WorkflowExplorer
      runtimeTarget={local}
      hostLabel="Local"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  expect(screen.queryByText('Reading installed workflows…')).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(screen.getByText('Reading installed workflows…')).toBeTruthy()
  rendered.rerender(
    <WorkflowExplorer
      runtimeTarget={{ kind: 'environment', environmentId: 'remote' }}
      hostLabel="Remote"
      onBack={() => {}}
      onClose={() => {}}
    />
  )
  expect(screen.queryByText('Reading installed workflows…')).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(screen.getByText('Reading installed workflows…')).toBeTruthy()
})
