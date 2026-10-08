# Contributing to Keel

Keel is an independent ADE based on Orca. Use
[Keel issues](https://github.com/SiyuQian/keel/issues) and
[pull requests](https://github.com/SiyuQian/keel/pulls).
Read the [documentation index](../docs/README.md) and
[project provenance](../docs/UPSTREAM.md) before changing project identity.
The CLI and runtime configuration still use Orca identifiers.

## Before You Start

- Keep changes scoped to a clear user-facing improvement, bug fix, or refactor.
- Keel targets macOS, Linux, and Windows. Every change must stay compatible with all three platforms unless the code is explicitly guarded by a runtime platform check.
- For keyboard shortcuts, use runtime platform checks in renderer code and `CmdOrCtrl` in Electron menu accelerators.
- For shortcut labels, show `⌘` and `⇧` on macOS, and `Ctrl+` and `Shift+` on Linux and Windows.
- For file paths, use Node or Electron path utilities such as `path.join`.
- Keel must work against local repositories, remote servers, and SSH worktrees. Do not assume a process, file, credential, shell, or network path exists only on the local machine.
- Keel supports many CLI agents, integrations, and git providers. Keep generic behavior provider-neutral; guard integration-specific logic behind explicit checks.
- Keep changes well-engineered and performant: follow existing architecture, avoid unnecessary work in hot paths, clean up owned resources, and use concrete module names.
- For UI work, follow [`docs/STYLEGUIDE.md`](../docs/STYLEGUIDE.md), use the tokens and shadcn primitives it specifies, and verify polished behavior across platforms, light/dark mode, and SSH latency.

## Local Setup

Install Node 24, pnpm, and the Bun version in [`config/.bun-version`](../config/.bun-version).
`pnpm test` runs Vitest on Bun, with Node workers for runtime contracts such as SQLite,
native PTYs, socket liveness, and V8 memory behavior. `pnpm test:node` runs the same suites
entirely on Node. Builds and dependency installation still use Node and pnpm.

```bash
pnpm install
ORCA_BACKGROUND_LAUNCH=1 pnpm dev
```

Ordinary installs include native optional dependencies for the current OS and CPU only.
Before a cross-architecture build (including `pnpm build:mac`, which produces both x64 and
arm64 artifacts by default), run `pnpm install:release` to add the other CPU's variants.
See [the install policy](../docs/reference/pnpm-install-policy.md).

## Branch Naming

Use a clear, descriptive branch name that reflects the change.

Good examples:

- `fix/ctrl-backspace-delete-word`
- `feat/shift-enter-newline`
- `chore/update-contributor-guide`

Avoid vague names like `test`, `misc`, or `changes`.

## Syncing upstream

Follow the [Keel upstream checklist](../docs/UPSTREAM.md#upstream-synchronization).
Routine imports must retain Keel attribution and scope decisions, keep removed
cloud workflows absent, and review new workflows and deployment identities.

## Before Opening a PR

Run the same checks that CI runs:

```bash
pnpm lint
pnpm typecheck
ORCA_BACKGROUND_LAUNCH=1 pnpm test
pnpm build
```

Add high-quality tests for behavior changes and bug fixes. Prefer tests that would actually catch a regression, not shallow coverage that only exercises the happy path.

If your change affects UI or interaction behavior, verify it on the platforms it could impact.

## Type Declarations: Prefer `.ts` Over `.d.ts`

Project-owned type declarations belong in `.ts` files. `.d.ts` is reserved for ambient shims (e.g., `env.d.ts`, `vite/client.d.ts`). TypeScript's `skipLibCheck: true` setting applies globally, including to our own `.d.ts` files, which means any unresolved type reference in a `.d.ts` silently becomes `any` at its call sites. Write your types in `.ts` files so the compiler actually checks them.

CI enforces this for `src/preload/` and `src/shared/`.

## Pull Requests

Each pull request should follow [`.github/pull_request_template.md`](./pull_request_template.md). In particular:

- link an existing issue when one applies; do not open an issue just to satisfy the template
- open with an ELI5 of the change (plain language paragraph; the PR title is the one-liner)
- explain what changed and why, and stay focused on a single topic when possible
- for any UI or interaction change, attach **before and after** screenshots (or short videos); if there is no visual or interaction change, write `N/A` and briefly explain why
- include high-quality tests when behavior changes or bug fixes warrant them
- include a brief code review summary from your AI coding agent that explicitly checks cross-platform compatibility, SSH/remote/local compatibility, supported agent and integration compatibility, performance risk, UI quality when applicable, and basic security risk
- mention any platform-specific, remote/SSH-specific, agent-specific, integration-specific, or git-provider-specific behavior and testing notes

## Release Process

Version bumps, tags, and releases are maintainer-managed. Do not include release version changes in a normal contribution unless a maintainer asks for them.

The inherited release workflows, Homebrew casks, app identifiers, updater targets,
and signing configuration still refer to Orca. They are implementation references,
not a Keel release process. Do not publish Keel artifacts using upstream identities
or advertise upstream packages as Keel builds. Separate release configuration is
tracked in the [tech-debt tracker](../docs/exec-plans/tech-debt-tracker.md).
