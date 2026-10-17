# Keel security notes

Keel inherits network, terminal, browser, and agent execution surfaces from Orca.
These notes locate existing controls; they do not certify release security.

- Runtime pairing uses a device registry in
  [device-registry.ts](../src/main/runtime/device-registry.ts).
  [Request authorization tests](../src/main/runtime/runtime-rpc-request-authorization.test.ts)
  cover mismatched authenticated-channel/request tokens and replay isolation.
- SSH host-key handling follows the [host-key reference](reference/ssh-host-key-verification.md).
  Execution and status authority follow the [SSH boundary](reference/ssh-execution-boundary.md).
- Use the [shared child-process primitives](../src/shared/child-process) and
  [Windows posture](reference/windows-edr-posture.md); do not bypass their shell
  and argument handling with ad hoc interpreter spawning.
- The [cloud guide](../cloud/README.md) describes environment-provided signing
  and push credentials and aggregate-only logging. Never commit credentials,
  paired-device tokens, or unredacted account identifiers to docs or evidence.
- Dependency versions are recorded in lockfiles. The separate docs package uses
  its own lockfile and [publication boundary](site/README.md#updating-content).

Review upstream telemetry and service endpoints before distributing Keel. This
change does not disable telemetry or configure Keel-owned services. See
[provenance](UPSTREAM.md) and the [debt tracker](exec-plans/tech-debt-tracker.md).

No Keel-specific private vulnerability-reporting address is documented here.
Do not put secrets or exploit credentials in public issues; a confirmed private
channel remains follow-up work.
