import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dockerCommand, type DockerBinding } from './docker-workspace-connection'

// Official npm installers keep both CLIs available on supported Linux architectures.
const DOCKERFILE = `FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-server curl ca-certificates bash python3 make g++ procps xz-utils && rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_*
RUN npm install -g @anthropic-ai/claude-code @openai/codex && claude --version && codex --version
RUN useradd -m -s /bin/bash agent && passwd -d agent && mkdir -p /run/sshd /home/agent/.ssh && chmod 700 /home/agent/.ssh && chown -R agent:agent /home/agent
RUN printf '%s\\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'AllowUsers agent' 'AllowAgentForwarding no' 'AcceptEnv LANG LC_*' > /etc/ssh/sshd_config.d/orca.conf
COPY entrypoint.sh /usr/local/bin/orca-docker-entrypoint
RUN chmod 755 /usr/local/bin/orca-docker-entrypoint
EXPOSE 22
ENTRYPOINT ["/usr/local/bin/orca-docker-entrypoint"]
`
const ENTRYPOINT = `#!/bin/sh
set -eu
ssh-keygen -A
exec /usr/sbin/sshd -D -e
`
const IMAGE = `orca-workspace:${createHash('sha256').update(DOCKERFILE).update(ENTRYPOINT).digest('hex').slice(0, 16)}`

export async function ensureDockerWorkspaceImage(
  binding: DockerBinding,
  options: { signal?: AbortSignal; onStderr?: (chunk: string) => void }
): Promise<string> {
  const staging = mkdtempSync(join(tmpdir(), 'orca-docker-image-'))
  try {
    writeFileSync(join(staging, 'Dockerfile'), DOCKERFILE)
    writeFileSync(join(staging, 'entrypoint.sh'), ENTRYPOINT)
    options.onStderr?.('Building Docker workspace image (cached after the first build)…\n')
    await dockerCommand(binding, ['build', '--tag', IMAGE, staging], {
      ...options,
      timeoutMs: 20 * 60_000
    })
    return IMAGE
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
