# Keel

[English](../../README.md) · 한국어

Keel은 [Orca](https://github.com/stablyai/orca)를 기반으로 개발 중인 독립 Agentic Development Environment(ADE)입니다. AI 코딩 에이전트, 터미널, 코드 리뷰, 작업 공간 도구를 한곳에 모읍니다.

## 프로젝트 상태

Keel은 임시 프로젝트 이름입니다. 구현은 아직 Orca 앱 이름, `orca` 명령, `ORCA_*` 환경 변수와 설정 경로를 사용합니다. 업스트림 배포, 호스팅 서비스, 커뮤니티와 서명은 Keel의 것이 아닙니다. 소스에서 실행하세요.

## 소스에서 실행

Node 24, pnpm, [고정 버전 Bun](../../config/.bun-version)을 설치하세요. 에이전트가 앱이나 테스트를 실행할 때 `ORCA_BACKGROUND_LAUNCH=1`을 설정하세요. 다른 CPU용 패키징 전에는 `pnpm install:release`를 실행하세요.

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## 문서와 기여

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## 출처와 라이선스

Keel은 MIT 라이선스의 Orca를 기반으로 합니다. 기존 Git 기록, 저작권 표시와 라이선스를 유지합니다.

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
