# Core beliefs

- Reuse before reimplementing. Search existing code before adding logic;
  enforcement: review under [development rules](../development-rules.md).
- Keep execution ownership on the execution host, including agent status;
  enforcement: review under the [SSH contract](../reference/ssh-execution-boundary.md).
- Preserve cross-platform, folder-workspace, and mixed-version behavior;
  enforcement: targeted tests and review under [development rules](../development-rules.md).
- Use the existing design system; enforcement: `pnpm run check:code-quality:changed`
  and the [style guide](../STYLEGUIDE.md).
- Document implemented behavior separately from proposals and inherited upstream
  services; enforcement: review against source and [provenance](../UPSTREAM.md).

Update docs with the behavior they describe. Periodic stale-link and claim review
is recommended; no recurring automation or new CI job is enabled by these docs.
