// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowExplorer } from './WorkflowExplorer'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))
vi.mock('@/runtime/runtime-skills-client', () => ({
  discoverSkillsForRuntimeTarget: async () => ({
    skills: [],
    sources: [],
    scannedAt: 1,
    workflows: { entries: [], documents: [], issues: [] }
  })
}))
afterEach(() => {
  cleanup()
  rpc.mockReset()
})

it.each(['different ID', 'same ID'])(
  'clears drafts and validation when switching to a peer with %s',
  async (mode) => {
    let peer = 'Host A'
    rpc.mockImplementation(async (_target, method, updates) =>
      method === 'status.get'
        ? { capabilities: ['agent-presets-v1'] }
        : {
            settings: updates ?? {
              agentPresets: [
                { id: 'review', name: peer, provider: 'codex', systemInstructions: peer }
              ]
            }
          }
    )
    const a = { kind: 'environment', environmentId: 'host-A' } as const
    const b = {
      kind: 'environment',
      environmentId: mode === 'same ID' ? 'host-A' : 'host-B'
    } as const
    const props = { hostLabel: 'Host', onBack: () => {}, onClose: () => {} }
    const view = render(<WorkflowExplorer {...props} runtimeTarget={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage Agents' }))
    fireEvent.click(await screen.findByRole('button', { name: /Host A.*codex/ }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    peer = 'Host B'
    view.rerender(<WorkflowExplorer {...props} runtimeTarget={b} />)
    await screen.findByRole('button', { name: /Host B.*codex/ })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByLabelText('System instructions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save Agent' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Host B.*codex/ }))
    const instructions = screen.getByLabelText('System instructions')
    if (!(instructions instanceof HTMLTextAreaElement)) {
      throw new Error('Expected instruction field')
    }
    expect(instructions.value).toBe('Host B')
    fireEvent.change(instructions, { target: { value: 'Host B edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        b,
        'settings.update',
        {
          agentPresets: [
            { id: 'review', name: 'Host B', provider: 'codex', systemInstructions: 'Host B edited' }
          ]
        },
        expect.any(Object)
      )
    )
  }
)
