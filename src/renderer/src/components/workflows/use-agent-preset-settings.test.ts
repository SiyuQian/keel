// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import { useAgentPresetSettings, type AgentPresetSettings } from './use-agent-preset-settings'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))
afterEach(() => {
  cleanup()
  rpc.mockReset()
  replaceRuntimeEnvironmentRevisions([])
})
const target: RuntimeClientTarget = { kind: 'environment', environmentId: 'server' }
function settings(name: string): AgentPresetSettings {
  return {
    agentPresets: [{ id: 'review', name, provider: 'codex', systemInstructions: name }],
    workflowAgentBindings: { workflow: { defaultAgentId: 'review' } }
  }
}
function revision(value: number) {
  replaceRuntimeEnvironmentRevisions([{ id: 'server', createdAt: 1, pairingRevision: value }])
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
function hook() {
  return renderHook(({ owner }) => useAgentPresetSettings(owner), {
    initialProps: { owner: target }
  })
}

it('re-reads settings and capabilities for a replacement peer with the same ID', async () => {
  revision(1)
  let peer = 'A'
  rpc.mockImplementation(async (_owner, method, updates) =>
    method === 'status.get'
      ? { capabilities: ['agent-presets-v1'] }
      : { settings: updates ?? settings(peer) }
  )
  const view = hook()
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('A'))
  const oldSave = view.result.current.save
  peer = 'B'
  revision(2)
  view.rerender({ owner: { ...target } })
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('B'))
  await act(async () => {
    expect(await oldSave(settings('A'))).toBe(false)
  })
  expect(rpc.mock.calls.filter(([, method]) => method === 'settings.update')).toHaveLength(0)
  expect(rpc.mock.calls.filter(([, method]) => method === 'status.get')).toHaveLength(2)
  expect(rpc.mock.calls.filter(([, method]) => method === 'settings.get')).toHaveLength(2)
})

it('refuses a replacement peer that lacks the Agent capability', async () => {
  let supported = true
  rpc.mockImplementation(async (_owner, method) =>
    method === 'status.get'
      ? { capabilities: supported ? ['agent-presets-v1'] : [] }
      : { settings: settings('A') }
  )
  const view = hook()
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('A'))
  supported = false
  view.rerender({ owner: { ...target } })
  await waitFor(() => expect(view.result.current.error).toMatch(/owning runtime/))
  expect(view.result.current.settings).toBeNull()
  await act(async () => {
    expect(await view.result.current.save(settings('A'))).toBe(false)
  })
  expect(rpc.mock.calls.filter(([, method]) => method === 'settings.update')).toHaveLength(0)
})

it('refuses saving after the pairing revision changes before the target rerenders', async () => {
  revision(1)
  rpc.mockImplementation(async (_owner, method) =>
    method === 'status.get' ? { capabilities: ['agent-presets-v1'] } : { settings: settings('A') }
  )
  const view = hook()
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('A'))
  revision(2)
  await act(async () => {
    expect(await view.result.current.save(settings('A'))).toBe(false)
  })
  expect(rpc.mock.calls.filter(([, method]) => method === 'settings.update')).toHaveLength(0)
})

it('does not continue a retired capability read onto a replacement peer', async () => {
  const status = deferred<{ capabilities: string[] }>()
  rpc.mockImplementation(async (_owner, method) =>
    method === 'status.get' ? { capabilities: ['agent-presets-v1'] } : { settings: settings('B') }
  )
  rpc.mockReturnValueOnce(status.promise)
  const view = hook()
  view.rerender({ owner: { ...target } })
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('B'))
  await act(async () => {
    status.resolve({ capabilities: ['agent-presets-v1'] })
  })
  expect(rpc.mock.calls.filter(([, method]) => method === 'settings.get')).toHaveLength(1)
  expect(view.result.current.presets[0]?.name).toBe('B')
})

it('ignores a retired settings read and save completion across an owner boundary', async () => {
  revision(1)
  const read = deferred<{ settings: AgentPresetSettings }>()
  const write = deferred<{ settings: AgentPresetSettings }>()
  let peer = 'A'
  rpc.mockImplementation(async (_owner, method) => {
    if (method === 'status.get') {
      return { capabilities: ['agent-presets-v1'] }
    }
    if (method === 'settings.update') {
      return write.promise
    }
    return peer === 'A' ? read.promise : { settings: settings(peer) }
  })
  const view = hook()
  await waitFor(() =>
    expect(rpc.mock.calls.some(([, method]) => method === 'settings.get')).toBe(true)
  )
  peer = 'B'
  revision(2)
  view.rerender({ owner: { ...target } })
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('B'))
  await act(async () => {
    read.resolve({ settings: settings('A') })
  })
  expect(view.result.current.presets[0]?.name).toBe('B')
  let saved!: Promise<boolean>
  act(() => {
    saved = view.result.current.save(settings('B edited'))
  })
  const writeCall = rpc.mock.calls.find(([, method]) => method === 'settings.update')
  expect(writeCall?.[3]).toEqual(expect.objectContaining({ expectedEnvironmentPairingRevision: 2 }))
  peer = 'C'
  revision(3)
  view.rerender({ owner: { ...target } })
  await waitFor(() => expect(view.result.current.presets[0]?.name).toBe('C'))
  await act(async () => {
    write.resolve({ settings: settings('B edited') })
    expect(await saved).toBe(false)
  })
  expect(view.result.current.presets[0]?.name).toBe('C')
  expect(view.result.current.saving).toBe(false)
})
