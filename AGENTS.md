# Keel agent guide

Keel is an independent ADE based on Orca. Read [provenance](docs/UPSTREAM.md)
before renaming identifiers; commands, package names, protocols, and paths still use Orca spelling.

## Repository map

- `src/main/`: Electron host, runtime, integrations, and execution authority.
- `src/preload/`: typed desktop bridges; `src/renderer/`: React UI and presentation state.
- `src/cli/` and `src/relay/`: CLI and SSH-host execution paths; `src/shared/`: contracts and process primitives.
- `mobile/`, `cloud/`, `docs/site/`: separate installs; see their READMEs.
- [Architecture](ARCHITECTURE.md) and [documentation index](docs/README.md) explain the boundaries.

## Commands (repository root)

- Setup: `pnpm install`; use `pnpm install:release` before cross-architecture packaging.
- Develop: `ORCA_BACKGROUND_LAUNCH=1 pnpm dev`; build: `pnpm build`.
- Typecheck: `pnpm tc` (or `tc:node`, `tc:cli`, `tc:web`).
- Tests: `ORCA_BACKGROUND_LAUNCH=1 pnpm test [path/to/file.test.ts]`.
- Lint changed code: `pnpm run check:code-quality:changed`; full lint: `pnpm lint`; format: `pnpm format`.
- Renderer design report: `pnpm run lint:design-system` (report, not a gate).
- README links: `pnpm run check:readme-local-links` (checks tracked targets).

## Rules that apply to every task

The complete rules, rationale, exceptions, and platform recipes are in
[development rules](docs/development-rules.md); read the relevant section before editing.
Checks below are review unless a command is named.

- All UI work must follow [STYLEGUIDE.md](docs/STYLEGUIDE.md), including enforcement and fallback order; use canonical tokens and shadcn primitives, not invented values (`check:code-quality:changed`, `pnpm lint`).
- Always set `ORCA_BACKGROUND_LAUNCH=1` for tests and agent-launched apps; never reveal windows, steal focus, or use `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation.
- Use hidden-renderer CDP screenshots; keep native-focus/visible-window tests on an isolated display or CI and rebuild changed launch-policy code before launching.
- Use the `$electron` skill and Playwright CDP for rendered UI checks; do not use computer-use for Orca/Keel validation.
- Search for existing implementations before writing new logic; extend or generalize before creating parallel versions.
- Comments explain non-obvious reasons briefly, preferably one line; never narrate obvious code.
- Never disable `max-lines` or add a per-file max-lines bump in `mobile/.oxlintrc.json`.
- Never use vague module names such as `helpers`, `utils`, `common`, or `misc`; name concrete domain concepts.
- Prefer `.ts` over `.d.ts`; avoid assertions except `as const`; unavoidable assertions need the line-specific `SAFETY:` explanation specified in development rules.
- Always read and edit this worktree; never follow subagent paths into the main checkout.
- Support macOS, Linux, and Windows behind runtime checks; never hardcode `e.metaKey`; use platform-specific shortcuts/labels and `CmdOrCtrl` menu accelerators.
- Use path utilities; never assume slash direction. Preserve folder workspaces as well as Git worktrees.
- Windows shells use `--shell`, not `--command`; setup runner type follows its shebang, never terminal preference; never run a bare `cmd.exe /c` from Git Bash.
- Windows child processes use `runProcess`/`spawnProcess`, never direct `child_process`; follow the shim-resolution reference before new shim shapes.
- Spawn bundled ripgrep through `spawnBundledRipgrep` or `resolveRelayRipgrepCommand`, never bare `rg`; do not add local Git/readdir fallbacks.
- Enumerate Windows processes via `windows-process-table.ts`, never a new PowerShell process.
- Read the Windows MSYS job, daemon relocation, EDR, and antivirus references before touching those paths; do not add risky interpreter flags/spawning without the EDR review.
- WSL uses `buildWslExecArgs` with `--exec`; fence parsed stdout with `buildWslCapturedLoginShellCommand`.
- Keep Linux native modules compatible with Ubuntu 20.04/glibc 2.31; follow native-install policy before cross-target builds.
- All changes must consider SSH; execution belongs to its host and contact loss is never process death: only `live` / `unverifiable` / `exited`.
- Agent status has one execution-host store, the hook server's; producers write there and readers retain presentation policy only.
- Terminal readiness/idle rules must use captured transcripts; read the Antigravity evidence before changing its readiness logic.
- Mixed client/server versions are normal; read wire compatibility before exchanged content changes; new stream opcodes require capability negotiation.
- Treat Git 2.25 as baseline; check every changed option's introduction, preserve global Git flags, use host-scoped `GitCapabilityCache` with narrow errors, and test first/cached/concurrent fallbacks and host isolation.
- Keep real-binary Git version boundaries in CI current; never do ref × tree scans or start with unqualified `--all`; bound searches and get confirmation after measuring genuinely unbounded scans.
- Generic review behavior must support GitLab and other providers; keep provider-specific behavior behind explicit checks.
- Batch `gh` requests and respect rate limits; commands and scripts must work across supported platforms.
- Claude structured-session changes require the real CLI tests and login described in [verification rules](docs/development-rules.md#verifying-changes).
- PRs must use the [template](.github/pull_request_template.md), describe user-visible before/after, mechanism, and choice of approach in plain language; no padding.

## Knowledge base

- [Design decisions](docs/design-docs/index.md) and [core beliefs](docs/design-docs/core-beliefs.md).
- [Plans](docs/PLANS.md), [tech debt](docs/exec-plans/tech-debt-tracker.md), and [quality evidence](docs/QUALITY_SCORE.md).
- [Security](docs/SECURITY.md) and [reliability](docs/RELIABILITY.md).
- [Frontend](docs/FRONTEND.md), [design](docs/DESIGN.md), and [product scope](docs/PRODUCT_SENSE.md).

Not applicable: `docs/product-specs/` (no separate Keel feature specification supplied),
`docs/generated/` (no new generated reference requested), `docs/references/`
(no new third-party reference material needed; existing contracts stay in `docs/reference/`).
