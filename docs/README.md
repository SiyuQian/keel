# Keel documentation

Keel is an ADE developed from Orca. Start with the [project README](../README.md),
[contributor guide](../.github/CONTRIBUTING.md), and
[provenance and naming boundary](UPSTREAM.md). For Orca imports, use the
[upstream synchronization checklist](UPSTREAM.md#upstream-synchronization).

## Engineering map

- [Architecture](../ARCHITECTURE.md): runtime domains and ownership boundaries.
- [Agent instructions](../AGENTS.md) and [development rules](development-rules.md).
- [Frontend](FRONTEND.md) and [design](DESIGN.md): UI implementation and style guide.
- [Security](SECURITY.md), [reliability](RELIABILITY.md), and [quality evidence](QUALITY_SCORE.md).
- [Design decisions](design-docs/index.md), [plans](PLANS.md), and [product scope](PRODUCT_SENSE.md).
- [Mobile development](../mobile/README.md) and [relay development](../cloud/README.md).

## Product guides

The [product overview](site/content/docs/index.mdx) and other MDX guides live in
`site/content/docs/`. Use the [site setup](site/README.md) to browse them locally.
The [CLI reference](site/content/docs/cli/reference.mdx),
[workspace model](site/content/docs/model/worktrees.mdx),
[SSH guide](site/content/docs/ssh.mdx), and
[self-hosted server guide](site/content/docs/remote-servers.mdx) describe inherited
functionality. Commands, config keys, paths, and exact UI strings still use the
implemented Orca identifiers. Upstream hosted integrations require separate review.

## Existing technical evidence

`reference/` contains platform and runtime contracts; open the relevant document
before changing those paths. `audits/` and `bug-reproductions/` contain historical
measurements and transcripts. They remain evidence, not a current Keel quality
certification. Original names and output in captured records are intentional.

[Agent presets and workflow bindings](reference/agent-presets-workflows.md) describes reusable roles, CLI launch selection and execution-host ownership.
