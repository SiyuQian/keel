# Keel

[English](../../README.md) · Français

Keel est un Agentic Development Environment (ADE) indépendant en cours de développement à partir d’[Orca](https://github.com/stablyai/orca). Il réunit agents de programmation, terminaux, revue de code et espaces de travail.

## État du projet

Keel est le nom provisoire. Le programme conserve le nom Orca, la commande `orca`, les variables `ORCA_*` et les chemins de configuration. Les distributions, services hébergés, communautés et signatures d’Orca ne sont pas ceux de Keel. Exécutez le projet depuis les sources.

## Exécuter depuis les sources

Installez Node 24, pnpm et la [version fixée de Bun](../../config/.bun-version). Pour les applications et tests lancés par un agent, définissez `ORCA_BACKGROUND_LAUNCH=1`. Avant de compiler pour une autre architecture CPU, lancez `pnpm install:release`.

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## Documentation et contributions

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## Origine et licence

Keel dérive d’Orca sous licence MIT. L’historique Git, la mention de copyright et la licence d’origine sont conservés.

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
