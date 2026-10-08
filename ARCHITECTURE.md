# Keel architecture

Keel inherits Orca's Electron desktop application, CLI, remote relay, mobile
companion, and cloud relay workspace. The working product name is Keel; runtime
identifiers retain their original spelling. See [provenance](docs/UPSTREAM.md).

## Domains and layers

| Domain            | Entry or location                                    | Responsibility                                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Desktop host      | [src/main/index.ts](src/main/index.ts)               | Electron startup and host lifecycle; loads main-process boot code.  |
| Execution runtime | [src/main/runtime](src/main/runtime)                 | Runtime services, RPC, pairing, terminals, and execution authority. |
| Preload bridge    | [src/preload/index.ts](src/preload/index.ts)         | Exposes typed host APIs to the renderer through Electron bridges.   |
| Desktop UI        | [src/renderer/src/App.tsx](src/renderer/src/App.tsx) | React application, workspace views, and presentation state.         |
| CLI               | [src/cli/index.ts](src/cli/index.ts)                 | Parses commands and dispatches requests through the runtime client. |
| SSH relay         | [src/relay](src/relay)                               | Host-side operations reached over remote transport.                 |
| Contracts         | [src/shared](src/shared)                             | Types, protocols, and cross-platform process primitives.            |
| Mobile            | [mobile/README.md](mobile/README.md)                 | React Native companion, installed and built separately.             |
| Cloud             | [cloud/README.md](cloud/README.md)                   | Independent relay/push workspace and infrastructure.                |
| Docs site         | [docs/site/README.md](docs/site/README.md)           | Independent Next.js documentation package.                          |

The renderer consumes preload and runtime APIs rather than owning host execution.
The CLI also routes work through the runtime. Shared contracts serve both sides
of those boundaries. Cloud, mobile, and docs have separate dependency installs;
[root workspace configuration](pnpm-workspace.yaml) does not absorb them into the
desktop install. These are observed boundaries, not a claim of complete import
lint enforcement.

## Invariants

1. The execution host owns process and agent status. Contact loss means
   `unverifiable`, not `exited`. Read the [SSH boundary](docs/reference/ssh-execution-boundary.md)
   and [status store](docs/reference/agent-status-store.md). Enforcement: review;
   no single mechanical check covers every producer and reader.
2. Mixed client/server versions are normal. Follow [wire compatibility](docs/reference/remote-wire-compatibility.md)
   for optional fields and stream capabilities. Enforcement: review; protocol
   catalog verification covers generated definitions, not all compatibility.
3. UI work follows [STYLEGUIDE.md](docs/STYLEGUIDE.md). Enforcement:
   `pnpm run check:code-quality:changed`; full design report: `pnpm run lint:design-system`.
4. Git commands support Git 2.25 or degrade safely. Use host-scoped capabilities
   under the [Git contract](docs/reference/git-compatibility.md). Enforcement:
   compatibility tests described there plus review for new commands.
5. Tests and agent-launched apps use `ORCA_BACKGROUND_LAUNCH=1`, without focus or
   visible-window activation. Enforcement: review under [development rules](docs/development-rules.md).

Uncovered cross-cutting checks are recorded in [tech debt](docs/exec-plans/tech-debt-tracker.md).

## Extension points

Reuse existing runtime methods and preload APIs before adding another channel.
Add execution behavior on the host that owns it, then expose it through existing
contracts; keep UI-specific presentation in the renderer. Match existing provider
boundaries for GitHub, GitLab, SSH, WSL, and native hosts. New UI uses existing
primitives and tokens rather than restyling base components.

## Decisions

[Core beliefs](docs/design-docs/core-beliefs.md) records existing development
principles. [Provenance](docs/UPSTREAM.md) explains why documentation branding and
runtime identifiers have separate lifecycles.
