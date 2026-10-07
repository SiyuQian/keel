# Keel provenance and upstream boundary

Keel is an independent Agentic Development Environment (ADE) developed from
[stablyai/orca](https://github.com/stablyai/orca). Keel is the working project name;
this repository is [SiyuQian/keel](https://github.com/SiyuQian/keel).

## Copyright and attribution

The root [LICENSE](../LICENSE) retains the upstream MIT text and
`Copyright (c) 2026 Lovecast Inc.`. Do not replace that notice with a Keel-only
notice. MIT requires the copyright and permission notices in copies or substantial
portions of the software; it does not require preserving Git commits.
See the [MIT license published by OSI](https://opensource.org/license/mit).

Keel retains the existing Git history for provenance, debugging, and upstream
comparisons. A separate release snapshot would still need the same license
notices. Add a copyright notice for new contributions only when the actual
rights holder is established; a project rename does not transfer copyright.

Third-party notices remain in [resources/licenses](../resources/licenses) and
[the documentation site's notices](site/THIRD_PARTY_NOTICES.md). Historical audit
records, captured output, and upstream screenshots retain their original names.
A root MIT license does not replace dependency or asset license requirements.

## Naming boundary

Documentation calls the project Keel. Executable interfaces remain unchanged:

- `orca` and `orca-dev` are the CLI names in [package.json](../package.json).
- `ORCA_*` environment variables, `.orca` paths, `orca.yaml`, package names,
  protocol fields, and source filenames retain their implemented spelling.
- [Electron packaging](../config/electron-builder.config.cjs) still names the app
  Orca and retains upstream bundle, publisher, and updater identities.
- The [documentation site](site/README.md) retains its upstream shell, assets,
  canonical metadata, and deployment configuration.

Do not replace those strings in instructions until the corresponding code and
compatibility behavior change. Existing screens and exact UI messages can still
say Orca. This documentation update does not migrate user data or rename binaries.

## Services and distribution

Orca downloads, Homebrew casks, app-store entries, websites, social channels,
signing sponsorship, accounts, relays, and telemetry destinations belong to
upstream. Links to them are upstream references, not Keel offerings. Do not assume
upstream credentials or hosted services are available to Keel users.

For now, use the [source setup](../README.md#run-from-source). Before a Keel
release, independently review distribution, updates, signing, service endpoints,
privacy disclosures, and asset/brand rights. Work is recorded as proposals in
[the tech-debt tracker](exec-plans/tech-debt-tracker.md); no release readiness or
trademark clearance is claimed here.
