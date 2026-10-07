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

## Upstream synchronization

Keel's current supported scope is the desktop ADE. Preserve these deliberate
fork differences when importing changes from Orca:

| Area                                        | Keel policy                                                                                                                                                     | Revisit when                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Root `ARCHITECTURE.md`                      | Keep the canonical architecture document and its reviewed-root-entry exception.                                                                                 | Architecture documentation is deliberately reorganized.         |
| `mobile/`                                   | Retain source; Mobile Checks is disabled in Keel's GitHub settings.                                                                                             | Mobile development and support resume.                          |
| `.github/workflows/cloud-*.yml`             | All 26 inherited workflows, including Cloud Verify, are removed. Do not reintroduce them during routine sync. Cloud Verify is also disabled in GitHub settings. | Keel explicitly takes ownership of cloud operation or cloud CI. |
| `cloud/` and cloud support actions          | Retain source, shared contracts, fixtures, and runbooks; this is not an active Keel service.                                                                    | A separately reviewed dependency or service change requires it. |
| Licenses and attribution                    | Retain original copyright, license texts, and third-party notices.                                                                                              | Actual incorporated material or rights change.                  |
| Branding, endpoints, and release identities | Preserve Keel prose and independently review runtime identity, upstream service URLs, signing, updates, and documentation deployment.                           | A verified Keel replacement is available.                       |

Before merging, inspect the incoming changes from a named upstream branch. With
`upstream` configured for Orca and its `main` branch:

```sh
git fetch upstream main
git diff --name-status HEAD upstream/main -- .github/workflows cloud/packages src/shared
```

After preparing the merge and resolving conflicts, review both the staged diff
and the actual workflow directory. A modified/deleted cloud workflow should stay
deleted unless cloud scope is explicitly restored; a newly added upstream workflow
can arrive without a conflict and still needs review. Check triggers, reusable
workflow calls, required-check settings, secrets, repository restrictions, and
service-account identities. Do not copy upstream GitHub settings or credentials.

```sh
git diff --cached --name-status -- .github/workflows
```

Repository settings are separate from Git: a clone or another repository does not
inherit the disabled Mobile Checks / Cloud Verify state. Check those settings
explicitly after a move or re-creation. Before re-enabling either workflow, verify
its retained source tests and establish Keel-owned service and release configuration.

Run the README link check, repository guard, and checks relevant to imported
source. Protocol changes still follow the remote-wire compatibility contract;
removing CI does not make a protocol or Terraform change safe. Documentation is
a review checklist, not an automatic merge filter or a guarantee that Git cannot
restore a file.
