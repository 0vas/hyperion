import { artifactLimit, type ArtifactInput } from '../domain/artifacts.js';
import { open } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import type {
  Suspension,
  Settlement,
  Delivery,
  ContinuationState,
} from '../domain/continuation.js';
import type {
  EnqueueOutboundPrompt,
  OutboundPromptDelivery,
  OutboundPromptState,
} from '../domain/outbound-prompt.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Run, Command } from '../domain/workflow.js';
export class HyperionClient {
  readonly url: string;
  private token: string;
  constructor(
    options: {
      url?: string;
      token?: string;
      directory?: string;
      agentId?: string;
    } = {},
  ) {
    this.url =
      options.url || process.env.HYPERION_URL || 'http://127.0.0.1:4317';
    const target = new URL(this.url);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1')
      throw new Error('This local edition only connects to http://127.0.0.1');
    if (options.token || process.env.HYPERION_TOKEN)
      this.token = options.token || process.env.HYPERION_TOKEN!;
    else {
      try {
        const credentials = JSON.parse(
          readFileSync(
            resolve(
              options.directory || process.env.HYPERION_DATA_DIR || '.hyperion',
              'credentials.json',
            ),
            'utf8',
          ),
        ) as {
          agentToken: string;
          agentId?: string;
          agents?: Record<string, string>;
        };
        const primary = credentials.agentId || 'codex';
        const id = options.agentId || process.env.HYPERION_AGENT_ID || primary;
        const token =
          id === primary
            ? credentials.agentToken
            : credentials.agents && Object.hasOwn(credentials.agents, id)
              ? credentials.agents[id]
              : undefined;
        if (!token)
          throw new Error(
            `Unregistered agent: ${id}. Run npm run hyperion -- connect ${id}`,
          );
        this.token = token;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Unregistered agent')
        )
          throw error;
        throw new Error(
          'Start Hyperion first, or set HYPERION_DATA_DIR / HYPERION_TOKEN.',
        );
      }
    }
  }
  private async request<T>(
    path: string,
    data?: unknown,
    timeoutMs = 10000,
  ): Promise<T> {
    const response = await fetch(this.url + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${body.error}: ${body.message}`);
    return body as T;
  }
  /** Authenticated liveness without projecting workflows (Desktop ensureServer). */
  authCheck(timeoutMs = 10000) {
    return this.request<{ ok: true; role: string; id: string }>(
      '/api/auth/check',
      undefined,
      timeoutMs,
    );
  }
  list() {
    return this.request<Run[]>('/api/runs');
  }
  get(id: string) {
    return this.request<Run>(`/api/runs/${encodeURIComponent(id)}`);
  }
  create(
    plan: unknown,
    commandId: string = crypto.randomUUID(),
    parentRunId?: string,
  ) {
    return this.request<Run>('/api/runs', {
      plan,
      commandId,
      ...(parentRunId ? { parentRunId } : {}),
    });
  }
  addArtifact(id: string, artifact: ArtifactInput) {
    return this.request<Run>(
      `/api/runs/${encodeURIComponent(id)}/artifacts`,
      artifact,
      30000,
    );
  }
  async attachFile(
    id: string,
    filePath: string,
    options: Omit<ArtifactInput, 'contentBase64' | 'url' | 'name'> & {
      name?: string;
    },
  ) {
    if (!isAbsolute(filePath))
      throw new Error('Provide an absolute artifact file path');
    const file = await open(filePath, 'r');
    let bytes: Buffer;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > artifactLimit)
        throw new Error('Artifact must be a file up to 10 MiB');
      const buffer = Buffer.alloc(artifactLimit + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > artifactLimit) throw new Error('Artifact exceeds 10 MiB');
      bytes = buffer.subarray(0, length);
    } finally {
      await file.close();
    }
    const extension = filePath.toLowerCase().split('.').at(-1) || '';
    const media: Record<string, string> = {
      md: 'text/markdown',
      txt: 'text/plain',
      json: 'application/json',
      csv: 'text/csv',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      pdf: 'application/pdf',
      svg: 'image/svg+xml',
      html: 'text/html',
    };
    return this.addArtifact(id, {
      ...options,
      name: options.name || basename(filePath),
      mediaType:
        options.mediaType || media[extension] || 'application/octet-stream',
      contentBase64: bytes.toString('base64'),
    });
  }
  command(id: string, command: Command) {
    return this.request<Run>(`/api/runs/${encodeURIComponent(id)}/commands`, {
      ...command,
      commandId: command.commandId || crypto.randomUUID(),
    });
  }
  suspend(id: string, suspension: Suspension) {
    return this.request<Run>(
      `/api/runs/${encodeURIComponent(id)}/suspend`,
      suspension,
    );
  }
  pendingContinuations(connectorId: string) {
    return this.request<Delivery[]>('/api/continuations/pending', {
      connectorId,
    });
  }
  claimContinuation(connectorId: string) {
    return this.request<Delivery | null>('/api/continuations/claim', {
      connectorId,
    });
  }
  settleContinuation(id: string, settlement: Settlement) {
    return this.request<ContinuationState>(
      `/api/continuations/${encodeURIComponent(id)}/settle`,
      settlement,
    );
  }
  enqueueOutboundPrompt(
    id: string,
    prompt: Omit<EnqueueOutboundPrompt, 'kind' | 'commandId'> & {
      commandId?: string;
      kind?: EnqueueOutboundPrompt['kind'];
    },
  ) {
    return this.request<Run>(
      `/api/runs/${encodeURIComponent(id)}/outbound-prompts`,
      {
        ...prompt,
        commandId: prompt.commandId || crypto.randomUUID(),
      },
    );
  }
  pendingOutboundPrompts(connectorId: string) {
    return this.request<OutboundPromptDelivery[]>(
      '/api/outbound-prompts/pending',
      { connectorId },
    );
  }
  claimOutboundPrompt(connectorId: string) {
    return this.request<OutboundPromptDelivery | null>(
      '/api/outbound-prompts/claim',
      { connectorId },
    );
  }
  settleOutboundPrompt(
    id: string,
    settlement: {
      leaseToken: string;
      outcome: 'accepted' | 'failed';
      reconciled?: boolean;
      message?: string;
    },
  ) {
    return this.request<OutboundPromptState>(
      `/api/outbound-prompts/${encodeURIComponent(id)}/settle`,
      settlement,
    );
  }
  async wait(id: string, afterRevision: number, timeoutSeconds = 30) {
    if (
      !Number.isFinite(timeoutSeconds) ||
      timeoutSeconds < 0 ||
      timeoutSeconds > 55
    )
      throw new Error('timeoutSeconds must be finite and between 0 and 55');
    if (!Number.isInteger(afterRevision) || afterRevision < 0)
      throw new Error('afterRevision must be a nonnegative integer');
    return this.request<Run>(
      `/api/runs/${encodeURIComponent(id)}/wait?afterRevision=${afterRevision}&timeoutSeconds=${timeoutSeconds}`,
      undefined,
      Math.ceil(timeoutSeconds * 1000) + 10000,
    );
  }

  link(run: Run) {
    return `${this.url}/?run=${run.id}`;
  }
}
