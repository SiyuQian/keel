# Quality evidence

This is a documentation inspection, not a release certification. No quality
letter grades are assigned without executed evidence.

| Area                | Evidence available                                                                                | Assessment                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Desktop and runtime | `src/main/`, `src/renderer/`, and `tests/`; root `pnpm test`, `pnpm tc`, and `pnpm build` scripts | Ungraded; suites and build not executed for the documentation rename.                              |
| CLI and SSH         | `src/cli/`, `src/relay/`, and [host ownership contract](reference/ssh-execution-boundary.md)      | Ungraded; runtime and remote checks not executed.                                                  |
| Mobile              | [mobile setup](../mobile/README.md) and separate package manifest                                 | Ungraded; simulator/device checks not executed.                                                    |
| Cloud               | [retained cloud source](../cloud/README.md)                                                       | Ungraded; cloud CI removed. Workflow-contract tests require review before restoring cloud support. |
| Docs                | Root README link checker and `docs/site/tests/`                                                   | Structural/link checks are available; execution results belong in the PR.                          |

Open gaps and proposed checks are in [the debt tracker](exec-plans/tech-debt-tracker.md).
Historical audit output is retained under `audits/`; do not infer current test
results from it.
