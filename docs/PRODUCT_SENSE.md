# Keel product scope

Keel is the working name for an independent ADE built from Orca. The intended
users are developers working with AI coding agents who need terminals, workspace
isolation, and code review in one environment.

The inherited implementation includes local and remote workflows, folder
workspaces as well as Git worktrees, multiple agents and Git providers, an
embedded browser, and mobile companion source. See the
[product guides](README.md#product-guides) for existing behavior. These are not
new Keel features or a guarantee of upstream hosted-service access.

Changes must preserve cross-platform and SSH behavior and follow the
[design system](DESIGN.md). Review the user-visible before and after, and validate
behavior where it actually executes; see [development rules](development-rules.md).

The current scope is the desktop ADE. Mobile source is retained for possible
future development, but mobile is not currently supported and the Mobile Checks
workflow is disabled in the Keel repository settings. Cloud services are also
outside current scope: their workflows are removed while shared source and
protocols remain. See [upstream synchronization](UPSTREAM.md#upstream-synchronization).

Other Keel-specific feature priorities, commercial plans, and launch dates have not
been specified. Do not infer them from upstream marketing or release cadence.
