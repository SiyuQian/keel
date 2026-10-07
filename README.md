# Keel

Keel is an Agentic Development Environment (ADE) being developed on top of
[Orca](https://github.com/stablyai/orca). It brings AI coding agents, terminals,
code review, and workspace tools into one desktop application.

[简体中文](docs/readme/README.zh-CN.md) · [日本語](docs/readme/README.ja.md) ·
[한국어](docs/readme/README.ko.md) · [Español](docs/readme/README.es.md) ·
[Français](docs/readme/README.fr.md) · [Português](docs/readme/README.pt.md)

## Project status

Keel is the working name of this independent project. The current implementation
inherits Orca's functionality and still uses its application name, CLI commands,
configuration names, and package identifiers. Documentation naming does not
change those runtime interfaces.

Keel currently focuses on the desktop ADE. Mobile source is retained for reference
and possible future development, but is not part of the current supported scope.
The Mobile Checks workflow is disabled in this repository.

Build from source using the instructions below. Orca's downloads, app-store
listings, hosted services, community channels, and signing arrangements belong
to the upstream project; they are not Keel distributions or services.

## Development environment

The inherited codebase includes:

- Multiple coding agents, including Claude Code, Codex, OpenCode, and Pi.
- Git worktrees and folder workspaces, terminals, editors, and diff review.
- An embedded browser and design tools.
- Local, SSH, and self-hosted execution paths.
- A mobile companion and relay source, with separate setup requirements.

See the [documentation index](docs/README.md) for feature guides and engineering
references. These describe inherited behavior, not a promise that upstream
hosted integrations are available for Keel.

## Run from source

Install Node 24, pnpm, and the Bun version pinned in
[config/.bun-version](config/.bun-version). Then:

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

For agent-launched apps and tests, set `ORCA_BACKGROUND_LAUNCH=1` to keep windows
hidden. The CLI is currently named `orca`; do not substitute `keel` in commands.
Before building for another CPU architecture, run `pnpm install:release`.
See the [contributor guide](.github/CONTRIBUTING.md) for checks and packaging notes.

## Contribute

Use [Keel issues](https://github.com/SiyuQian/keel/issues) and
[pull requests](https://github.com/SiyuQian/keel/pulls) for this project.
Read the [contributor guide](.github/CONTRIBUTING.md), [agent instructions](AGENTS.md),
and [architecture](ARCHITECTURE.md) before changing an unfamiliar area.

The [mobile app](mobile/README.md), [relay workspace](cloud/README.md), and
[documentation site](docs/site/README.md) have their own setup instructions.

## Origin and license

Keel is derived from [stablyai/orca](https://github.com/stablyai/orca), licensed
under the [MIT License](LICENSE). The upstream copyright notice,
`Copyright (c) 2026 Lovecast Inc.`, is retained. The existing Git history is also
retained to preserve the development record and support upstream comparisons.

See [project provenance](docs/UPSTREAM.md) for attribution, third-party notices,
and the boundary between Keel and upstream services.
