# Keel

[English](../../README.md) · 日本語

Keel は [Orca](https://github.com/stablyai/orca) を基に開発している独立した Agentic Development Environment（ADE）です。AI コーディングエージェント、ターミナル、コードレビュー、ワークスペースをまとめます。

## 開発状況

Keel は仮のプロジェクト名です。実装では引き続き Orca のアプリ名、`orca` コマンド、`ORCA_*` 環境変数と設定パスを使用します。上流の配布物、ホストサービス、コミュニティ、署名は Keel のものではありません。ソースから実行してください。

## ソースから実行

Node 24、pnpm、[指定バージョンの Bun](../../config/.bun-version) を用意してください。エージェントによるアプリ起動とテストでは `ORCA_BACKGROUND_LAUNCH=1` を設定します。別 CPU 向けのビルド前には `pnpm install:release` を実行します。

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## ドキュメントと貢献

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## 由来とライセンス

Keel は MIT ライセンスの Orca を基にしています。元の Git 履歴、著作権表示、ライセンスを保持しています。

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
