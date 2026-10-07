# Keel

[English](../../README.md) · 简体中文

Keel 是在 [Orca](https://github.com/stablyai/orca) 基础上开发的独立智能体开发环境（ADE），将 AI 编程智能体、终端、代码评审和工作区工具放在一起。

## 项目状态

Keel 暂为项目名称。程序目前仍使用 Orca 的应用名、`orca` 命令、`ORCA_*` 环境变量和配置路径；文档改名不会改变这些接口。上游下载、应用商店、托管服务、社区和签名安排不属于 Keel。请从源码运行。

## 从源码运行

安装 Node 24、pnpm 和 [固定版本的 Bun](../../config/.bun-version)。智能体启动应用或测试时设置 `ORCA_BACKGROUND_LAUNCH=1`，避免显示窗口。跨 CPU 架构打包前运行 `pnpm install:release`。

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## 文档与贡献

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## 来源与许可证

Keel 基于 Orca 的 MIT 授权代码，保留原有 Git 历史、版权声明和许可证。

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
