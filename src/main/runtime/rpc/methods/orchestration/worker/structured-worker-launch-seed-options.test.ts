/**
 * `--model`/`--effort` used to downgrade a structured-preferring worker to a PTY terminal because
 * "launch preferences apply only to a terminal agent". They no longer do: the same two ids a saved
 * selection seeds a chat with are seeded into the worker's own session here.
 */

import { describe, expect, it, vi } from 'vitest'

const createStructuredWorkerSession = vi.fn(async (_args: Record<string, unknown>) => ({
  identity: { handle: 'structworker_1', sessionId: 'sess_1' },
  host: {}
}))

vi.mock('../../orchestration-structured-worker-session', () => ({
  createStructuredWorkerSession: (args: never) => createStructuredWorkerSession(args)
}))

const { createStructuredWorkerSessionForWorktree } = await import('./worker-topology')
const { prepareStructuredAgentSessionCreateForWorktree } =
  await import('../../structured-agent-session-create')

async function createWith(launchPreferences?: Record<string, string>) {
  createStructuredWorkerSession.mockClear()
  await createStructuredWorkerSessionForWorktree({
    runtime: {} as never,
    worktreeId: 'repo::wt',
    agent: 'codex',
    dispatchId: 'ctx_1',
    ...(launchPreferences ? { launchPreferences } : {}),
    effects: []
  })
  return createStructuredWorkerSession.mock.calls[0]?.[0] ?? {}
}

describe('a structured worker seeds the dispatch launch preferences', () => {
  it('carries --model and --effort into the session create', async () => {
    expect(await createWith({ model: 'gpt-5.6-sol', effort: 'high' })).toMatchObject({
      options: { model: 'gpt-5.6-sol', effort: 'high' }
    })
  })

  it('carries only the model when no --effort was asked for', async () => {
    expect((await createWith({ model: 'gpt-5.6-sol' })).options).toEqual({ model: 'gpt-5.6-sol' })
  })

  it.each([
    ['no preferences at all', undefined],
    ['an option set that narrows to nothing', { model: '  ' }]
  ])('omits options entirely for %s, never sending {}', async (_name, preferences) => {
    // `{}` fails the durable record's bounded-string guard, and `agent_session_options_invalid` is
    // not a wire refusal code — the throw strands the launch with no fallback. Omitted, the host
    // seeds the user's own saved selection instead, which is what a chat would get.
    expect(await createWith(preferences)).not.toHaveProperty('options')
  })
})

describe('the create the seed options land in', () => {
  const settingsResolved = {
    location: { executionHostId: 'local', wslDistro: null, workspaceId: 'repo::wt' },
    provider: 'codex',
    agent: 'codex',
    accountHome: { variable: 'CODEX_HOME', path: '/host/.codex' },
    runtimeKind: 'native',
    options: { model: 'saved-model', effort: 'low' }
  }

  async function prepare(options?: Record<string, string>) {
    const prepared = await prepareStructuredAgentSessionCreateForWorktree({
      runtime: {
        resolveStructuredAgentSessionCreateIntent: async () => settingsResolved
      } as never,
      ensureHost: async () => ({}) as never,
      envelope: {
        sessionId: 'sess_1',
        clientOperationId: 'op_1',
        expectedRuntimeFence: null,
        payloadFingerprint: ''
      },
      worktree: 'id:repo::wt',
      agent: 'codex',
      caller: { callerKey: 'orchestration:dispatch:ctx_1' },
      ...(options ? { options } : {})
    })
    return prepared.attachParams
  }

  it("replaces the saved selection the host resolved with the dispatch's own", async () => {
    expect((await prepare({ model: 'gpt-5.6-sol', effort: 'high' })).options).toEqual({
      model: 'gpt-5.6-sol',
      effort: 'high'
    })
  })

  it('keeps the saved selection when the dispatch named none', async () => {
    expect((await prepare()).options).toEqual({ model: 'saved-model', effort: 'low' })
  })

  it('does not let the seed options move the attach fingerprint', async () => {
    // Options are the session's initial state, not its identity: a retry re-resolves them and must
    // replay rather than conflict.
    const [seeded, unseeded] = await Promise.all([prepare({ model: 'gpt-5.6-sol' }), prepare()])
    expect(seeded.envelope.payloadFingerprint).toBe(unseeded.envelope.payloadFingerprint)
  })
})

it('a default-only preset does not choose the native chat saved model or effort', async () => {
  const prepared = await prepareStructuredAgentSessionCreateForWorktree({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this prepare path calls only the supplied create-intent resolver.
    runtime: {
      resolveStructuredAgentSessionCreateIntent: async () => ({
        location: { executionHostId: 'local', wslDistro: null, workspaceId: 'repo::wt' },
        provider: 'codex',
        agent: 'codex',
        accountHome: { variable: 'CODEX_HOME', path: '/host/.codex' },
        runtimeKind: 'native',
        options: { model: 'saved-unrequested-model', effort: 'high' }
      })
    } as never,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: prepare returns the installed host without using it; commit is not called.
    ensureHost: async () => ({}) as never,
    envelope: {
      sessionId: 'preset_session_1',
      clientOperationId: 'op_1',
      expectedRuntimeFence: null,
      payloadFingerprint: ''
    },
    worktree: 'id:repo::wt',
    agent: 'codex',
    caller: { callerKey: 'dispatch:1' },
    agentPreset: { id: 'role', name: 'Role', provider: 'codex', systemInstructions: 'Review.' }
  })
  expect(prepared.attachParams).not.toHaveProperty('options')
  expect(prepared.attachParams.agentPreset?.systemInstructions).toBe('Review.')
})

it('includes a role snapshot in replay identity while leaving raw launches unchanged', async () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: prepare only reads this resolver; commit is not called.
  const runtime = {
    resolveStructuredAgentSessionCreateIntent: async () => ({
      location: { executionHostId: 'local', wslDistro: null, workspaceId: 'wt' },
      provider: 'codex',
      agent: 'codex',
      accountHome: { variable: 'CODEX_HOME', path: '/host/.codex' },
      runtimeKind: 'native'
    })
  } as never
  async function prepare(instructions?: string) {
    return prepareStructuredAgentSessionCreateForWorktree({
      runtime,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: prepare does not call any host methods.
      ensureHost: async () => ({}) as never,
      envelope: {
        sessionId: 'replay_session',
        clientOperationId: 'op_1',
        expectedRuntimeFence: null,
        payloadFingerprint: ''
      },
      worktree: 'id:wt',
      agent: 'codex',
      caller: { callerKey: 'dispatch:1' },
      ...(instructions === undefined
        ? {}
        : {
            agentPreset: {
              id: 'role',
              name: 'Role',
              provider: 'codex' as const,
              systemInstructions: instructions
            }
          })
    })
  }
  const [raw, sameRaw, first, same, changed] = await Promise.all([
    prepare(),
    prepare(),
    prepare('Review.'),
    prepare('Review.'),
    prepare('Implement.')
  ])
  expect(raw.attachParams).not.toHaveProperty('agentPreset')
  expect(raw.attachParams.envelope.payloadFingerprint).toBe(
    sameRaw.attachParams.envelope.payloadFingerprint
  )
  expect(first.attachParams.envelope.payloadFingerprint).toBe(
    same.attachParams.envelope.payloadFingerprint
  )
  expect(first.attachParams.envelope.payloadFingerprint).not.toBe(
    changed.attachParams.envelope.payloadFingerprint
  )
  expect(first.attachParams.envelope.payloadFingerprint).not.toBe(
    raw.attachParams.envelope.payloadFingerprint
  )
})
