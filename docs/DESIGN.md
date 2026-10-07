# Keel design

The inherited [style guide](STYLEGUIDE.md) is authoritative for layout, color,
typography, spacing, components, and interaction. This document is a pointer,
not a second design system.

Tokens live in [main.css](../src/renderer/src/assets/main.css); reuse
[components/ui](../src/renderer/src/components/ui). Do not invent palette values,
font sizes, or shadows where an existing role applies. Accessibility and
cross-platform shortcut conventions remain part of review.

`pnpm run check:code-quality:changed` checks new design-system violations;
`pnpm run lint:design-system` produces the full renderer report. Follow the
style guide's enforcement section before considering suppressions.

The Keel name does not establish a new logo or asset license. Inherited visual
assets and screenshots require review before independent publication; see
[provenance](UPSTREAM.md).
