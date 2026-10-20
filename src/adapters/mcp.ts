#!/usr/bin/env node
import { artifactUrl, artifactName } from '../domain/artifacts.js';
import { suspendSchema } from '../domain/continuation.js';
import { VERSION } from '../version.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { openPresentation } from './desktop.js';
import { HyperionClient } from './client.js';
import { withHandoff } from './handoff.js';
import type { Run } from '../domain/workflow.js';
import { outputValuesSchema, traceSchema } from '../domain/contracts.js';
import { planSchema } from '../domain/workflow.js';
const client = new HyperionClient();
const server = new McpServer(
  { name: 'hyperion', version: VERSION },
  {
    instructions:
      'When the user says Usa Hyperion / Use Hyperion / quiere usar Hyperion (or asks to guide work through Hyperion), call hyperion_create_run (or resume via hyperion_get_run / hyperion_list_runs) before free-text refusals. Put missing scope questions in the Hyperion canvas as human steps; do not claim a missing filesystem, Cowork or other connector instead of Hyperion when hyperion_* tools are loaded in this chat. Turn the request into a specific plan, preserve the original text in plan.request, and show the returned URL. Do not require the human to write JSON or reuse a canned demo. Start only ready agent steps, execute actual work, then report evidence. Human input and approvals must happen in the Hyperion UI. If an installed resumable connector supplies its session reference, use hyperion_suspend and end the turn. Otherwise, after showing the canvas URL in a progress message, use hyperion_wait to receive human decisions during a bounded waiting period of at most ten minutes. Do not end a turn after a human handoff without hyperion_wait (or a verified durable suspension). Do not repeat unchanged waiting announcements or renew an expired period indefinitely; re-read state before a final handoff. On a changed revision, continue ready work in the same turn. If you end your turn, explain that an idle chat needs the canvas continuation message. hyperion_open with presentation split only returns a browser URL; it does not open a native pane inside Claude Desktop. For known choices use string output form.options [{value,label}], never a free-text list. Never impersonate the human or bypass a blocked step. This server does not execute the work for you.',
  },
);
const output = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
const safe = (action: () => Promise<unknown>) =>
  action()
    .then((value) =>
      value &&
      typeof value === 'object' &&
      'steps' in value &&
      'revision' in value
        ? withHandoff(value as Run)
        : value,
    )
    .then(output)
    .catch((error: unknown) => ({
      isError: true,
      ...output({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    }));
server.registerTool(
  'hyperion_create_run',
  {
    description:
      'Create a workflow derived from the user request. Include the original text in plan.request; generate the steps yourself and obtain a URL for the human. Use jobs metadata and step.jobId to group executable steps. Human steps should declare interaction.question/context/next and clear output descriptions. Use typed inputs/outputs on tasks. For process notation set profile=bpmn-lite and use one start/end and structured pairs of parallel, exclusive or inclusive gateways; conditional splits need a defaultTarget. Read the plan schema. Reuse commandId on retries. If the user explicitly continues a completed conversation, supply parentRunId and the NEW request in plan.request. This creates a linked new cycle without reopening the completed parent; read the parent and carry relevant context into the new plan.',
    inputSchema: {
      plan: planSchema,
      commandId: z.string().min(1).max(128),
      parentRunId: z.string().uuid().optional(),
    },
  },
  ({ plan, commandId, parentRunId }) =>
    safe(async () => {
      const run = await client.create(plan, commandId, parentRunId);
      return { ...run, url: client.link(run) };
    }),
);
server.registerTool(
  'hyperion_add_artifact',
  {
    description:
      'Attach a real generated file, text or HTTP(S) link to its agent step. Supply exactly one absolute filePath, text or url. Files up to 10 MiB are copied into local storage so the canvas can preview/download them later. Use the attempt from start and reuse commandId on retries. Can attach to running or completed steps, including completed runs. Never attach secrets or unrelated files. Does not complete the step or execute the artifact.',
    inputSchema: {
      runId: z.string().uuid(),
      stepId: z.string(),
      attempt: z.number().int().positive(),
      commandId: z.string().min(1).max(128),
      filePath: z.string().max(4000).optional(),
      text: z.string().max(64000).optional(),
      url: artifactUrl.optional(),
      name: artifactName.optional(),
      mediaType: z.string().max(120).optional(),
    },
  },
  ({ runId, filePath, text, url, name, ...options }) =>
    safe(async () => {
      if (
        [filePath, text, url].filter((value) => value !== undefined).length !==
        1
      )
        throw new Error('Provide exactly one filePath, text or url');
      if (filePath !== undefined)
        return client.attachFile(runId, filePath, { ...options, name });
      if (!name) throw new Error('An artifact name is required');
      return client.addArtifact(runId, {
        ...options,
        name,
        ...(url !== undefined
          ? { url }
          : {
              contentBase64: Buffer.from(text!, 'utf8').toString('base64'),
              mediaType: options.mediaType || 'text/plain',
            }),
      });
    }),
);
server.registerTool(
  'hyperion_open',
  {
    description:
      'Open an existing run in the presentation explicitly chosen by the user in the chat. split returns its browser URL; desktop launches the registered local Hyperion Desktop. Does not create a run or execute work. If Desktop is absent, keep the browser URL available and explain that the app must be installed/opened once.',
    inputSchema: {
      runId: z.string().uuid(),
      presentation: z.enum(['split', 'desktop']),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  },
  ({ runId, presentation }) =>
    safe(() => openPresentation(client, runId, presentation)),
);
server.registerTool(
  'hyperion_list_runs',
  {
    description: 'List recent local workflow executions.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  () => safe(() => client.list()),
);
server.registerTool(
  'hyperion_get_run',
  {
    description:
      'Read the current workflow, human input, approvals and evidence.',
    inputSchema: { runId: z.string().uuid() },
    annotations: { readOnlyHint: true },
  },
  ({ runId }) => safe(() => client.get(runId)),
);
server.registerTool(
  'hyperion_step',
  {
    description:
      'Start a ready agent step or report real progress/results. complete, fail and log require evidence in message. Supply declared output values when completing tasks. Send the attempt returned by start with every complete/fail/log; required after a retry. Recovery invalidates old attempts but cannot cancel external tools; inspect their effects before repeating work. For log use trace.kind summary (public decision summary), action or observation, optionally trace.tool. Never request private chain-of-thought. Human decisions are deliberately unavailable.',
    inputSchema: {
      runId: z.string().uuid(),
      stepId: z.string(),
      action: z.enum(['start', 'complete', 'fail', 'log', 'retry']),
      message: z.string().max(8000).optional(),
      outputs: outputValuesSchema.optional(),
      trace: traceSchema.optional(),
      attempt: z.number().int().positive().optional(),
      commandId: z.string().min(1).max(128),
    },
  },
  ({ runId, stepId, action, message, commandId, outputs, trace, attempt }) =>
    safe(() =>
      client.command(runId, {
        type: action,
        stepId,
        message,
        commandId,
        outputs,
        trace,
        attempt,
      }),
    ),
);
server.registerTool(
  'hyperion_revise_plan',
  {
    description:
      'Exceptionally revise unstarted future work after the user changes scope. Read the current run first and submit the complete revised plan, preserving original request/context/profile, executed or presented steps and their jobs. No task may be running. Requires the current revision and a clear reason. Archives the change and pauses the run for human review; only the person can resume in the canvas. Never use this to bypass a human decision.',
    inputSchema: {
      runId: z.string().uuid(),
      plan: planSchema,
      reason: z.string().trim().min(1).max(8000),
      expectedRevision: z.number().int().nonnegative(),
      commandId: z.string().min(1).max(128),
    },
  },
  ({ runId, plan, reason, expectedRevision, commandId }) =>
    safe(() =>
      client.command(runId, {
        type: 'revise',
        plan,
        message: reason,
        expectedRevision,
        commandId,
      }),
    ),
);
server.registerTool(
  'hyperion_wait',
  {
    description:
      'Subscribe for up to 55 seconds. A human confirmation or retry delivers the new state immediately without polling. Continue ready work in this turn, without requesting another chat message. A timeout does not mean approval. Resume only according to returned state.',
    inputSchema: {
      runId: z.string().uuid(),
      afterRevision: z.number().int().nonnegative(),
      timeoutSeconds: z.number().min(0).max(55).default(30),
    },
    annotations: { readOnlyHint: true },
  },
  ({ runId, afterRevision, timeoutSeconds }) =>
    safe(() => client.wait(runId, afterRevision, timeoutSeconds)),
);
server.registerTool(
  'hyperion_suspend',
  {
    description:
      'Persist a human-input checkpoint and end this turn ONLY when your installed connector can resume this exact session with idempotent delivery. Supply its real ID, session reference and scope. Never invent a connector or session. A saved answer enqueues one delivery; the connector starts a new turn. Without a connector use hyperion_wait. Does not pause the workflow or approve a decision.',
    inputSchema: { runId: z.string().uuid(), ...suspendSchema.shape },
  },
  ({ runId, ...data }) => safe(() => client.suspend(runId, data)),
);
await server.connect(new StdioServerTransport());
