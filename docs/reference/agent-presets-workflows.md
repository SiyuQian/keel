# Agent presets and workflow bindings

An Agent preset is a reusable role, separate from its canonical provider. It stores a stable ID, editable system instructions, and optional fixed model and effort. Claude and Codex are the initial supported providers. Unset fields preserve provider defaults. Automatic selection is deferred in [Keel issue #5](https://github.com/SiyuQian/keel/issues/5).

Open **Skills → Workflows → Manage Agents** to create, edit or delete roles. The workflow detail lets you select a default Agent and override individual steps. An unset step inherits the workflow default. A reference to a deleted role stays unresolved and requires an explicit replacement.

Definitions and bindings belong to the selected execution runtime's existing settings store. Missing preset storage supplies Planning, Implementation and Review starters. An explicitly empty list stays empty across restarts. Workflow IDs come from the installed Skills inventory on that host. Bindings do not modify installed workflow files.

## Coordinator use

The existing coordinator supplies each task and preceding results. Each selected stage gets a fresh independent session. This integration does not schedule stages or automate model selection.

```sh
orca agents list --json
orca agents workflows --json
orca agents resolve --workflow '<inventory workflow ID>' --step implement --json
orca agents show --id implementation --json
orca orchestration worker-start --from '<coordinator>' --spec '<task and preceding results>' --agent-preset implementation --worktree current --json
```

Pass the resolver's `agentPresetId` to `worker-start`. Do not combine `--agent-preset` with `--terminal`, `--agent`, `--model` or `--effort`. The execution host selects the configured terminal or native surface. Raw `--agent` launches retain their existing behavior.

For a paired server, use the CLI's existing runtime environment selection for `agents` reads. Use `worker-start --on <server> --worktree <exact remote workspace>` to launch there. The worker host resolves its own definition. Desktop proxy SSH and WSL launches refuse presets. Connect to a native runtime on the execution host instead. Unsupported provider or native-session routes refuse launch without a client-local fallback.

## Startup and compatibility

The session stores a bounded immutable role snapshot separately from short session options. System instructions allow up to 16,384 characters. Edits affect later sessions. Role snapshots participate in attach and replay fingerprints. Absent snapshots preserve old record shapes and fingerprints.

Claude appends instructions to its `claude_code` system preset. Codex receives `developerInstructions` in its thread startup request. Model and effort use existing provider catalogs and startup fields. Provider base instructions, repository instructions, account routing and permission policy remain in their existing channels. Concurrent sessions do not rewrite provider configuration.

The `agent-presets-v1` runtime capability gates settings clients and preset worker starts. Federation checks the execution host before attachment. A ready receipt must confirm the selected role snapshot. Older hosts cannot silently discard selection. Federation observation, transcript reads, stop and release use the existing structured session authority and journal. Loss of host contact remains `unverifiable`.

Terminal launches use Claude `--append-system-prompt` or Codex `-c developer_instructions=...` with existing shell quoting and host script staging. Windows terminals reject control bytes or instruction launch lines longer than the existing 512-byte typed-line budget. Use a native session for those instructions.
