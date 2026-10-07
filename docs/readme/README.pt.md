# Keel

[English](../../README.md) · Português

Keel é um Agentic Development Environment (ADE) independente em desenvolvimento a partir do [Orca](https://github.com/stablyai/orca). Reúne agentes de programação, terminais, revisão de código e espaços de trabalho.

## Estado do projeto

Keel é o nome provisório. A implementação mantém o nome Orca, o comando `orca`, as variáveis `ORCA_*` e os caminhos de configuração. Downloads, serviços hospedados, comunidades e assinaturas do Orca não pertencem ao Keel. Execute o projeto a partir do código-fonte.

## Executar a partir do código-fonte

Instale Node 24, pnpm e a [versão fixada do Bun](../../config/.bun-version). Para aplicativos e testes iniciados por agentes, defina `ORCA_BACKGROUND_LAUNCH=1`. Antes de empacotar para outra CPU, execute `pnpm install:release`.

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## Documentação e contribuições

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## Origem e licença

Keel deriva do Orca sob a licença MIT. O histórico Git, o aviso de copyright e a licença originais são mantidos.

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
