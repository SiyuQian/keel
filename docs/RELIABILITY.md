# Keel reliability

The execution host owns terminals, process liveness, and agent status; desktop,
CLI, and mobile are readers and control surfaces. SSH failures must distinguish
`live`, `unverifiable`, and `exited`, following the
[execution boundary](reference/ssh-execution-boundary.md). A lost connection does
not prove that work stopped. Reconnect behavior also has a
[source-recovery reference](reference/ssh-reconnect-source-recovery.md).

Clients and servers update independently. Read [wire compatibility](reference/remote-wire-compatibility.md)
before changing RPC params or streams. The runtime can operate headlessly;
see [the Linux guide](reference/headless-linux-server.md) and
[daemon operations](reference/orcad-operations.md).

The separate [cloud relay](../cloud/README.md) documents director/cell topology,
optional PostgreSQL tests, push handling, and gated operational workflows. Those
runbooks do not establish a Keel-operated service or authorize deployment.

`pnpm run check:reliability-gates` checks the repository's configured gates;
it does not prove end-to-end availability. No Keel SLO, on-call rotation, or error
budget is established by this documentation update. Ownership and compatibility
checks that still require review are recorded in [tech debt](exec-plans/tech-debt-tracker.md).
