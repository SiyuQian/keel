# Keel frontend

The desktop UI is React under [src/renderer/src](../src/renderer/src), starting at
[App.tsx](../src/renderer/src/App.tsx). Host access uses the
[preload bridge](../src/preload/index.ts) and renderer runtime clients. Presentation
state lives in the renderer; execution authority remains on its host.

Use existing [UI primitives](../src/renderer/src/components/ui) and
[canonical tokens](../src/renderer/src/assets/main.css). Follow
[STYLEGUIDE.md](STYLEGUIDE.md), including enforcement and its fallback order.

Run `pnpm tc:web` and `pnpm run check:code-quality:changed` for relevant changes.
Rendered Electron checks use Playwright CDP with `ORCA_BACKGROUND_LAUNCH=1` and
hidden renderers; follow [development rules](development-rules.md#electron-ui-validation).
Do not use computer-use or reveal windows on the user's desktop.

[Mobile](../mobile/README.md) and [the docs site](site/README.md) are separate
frontends with their own installs. Current screenshots and app labels may still
say Orca; see [the naming boundary](UPSTREAM.md#naming-boundary).
