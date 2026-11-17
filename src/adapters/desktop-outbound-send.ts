import { z } from 'zod';
import { connectorSchema, type Connector } from '../domain/continuation.js';
import type { OutboundPromptDelivery } from '../domain/outbound-prompt.js';
import type { Run } from '../domain/workflow.js';
import type { OutboundSendConnector } from './outbound-prompt-worker.js';

/**
 * Desktop outbound send config (ADR 0036).
 * Trusted local file outside model plans.
 *
 * - W1 `clipboard-open`: copy + optional URL — not native chat injection.
 * - W2 `harness-cli`: spawn an installed local CLI with the prompt (e.g. Cursor
 *   `agent --resume … --print`). Delivery ack ≠ task execution.
 */

const clipboardOpenSchema = connectorSchema
  .extend({
    transport: z.literal('clipboard-open'),
    /** Optional https/http or custom URL opened after copying the prompt. */
    openUrl: z.string().min(1).max(4000).optional(),
  })
  .strict();

const harnessCliSchema = connectorSchema
  .extend({
    transport: z.literal('harness-cli'),
    /** Absolute or PATH-resolved executable configured by the human/integrator. */
    command: z.string().trim().min(1).max(512),
    /**
     * Argv tokens. Placeholders `{{sessionId}}` and `{{text}}` are substituted
     * literally in each token (no shell). If no `{{text}}` appears, the prompt
     * is appended as a final argument when `prompt` is `arg` (default).
     */
    args: z.array(z.string().max(16_000)).max(64).default([]),
    /** How to deliver prompt text when `{{text}}` is absent from args. */
    prompt: z.enum(['arg', 'stdin']).default('arg'),
    cwd: z.string().min(1).max(4000).optional(),
    /** Kill + uncertain if the process outlives this window (default 120s). */
    timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
  })
  .strict();

export const desktopOutboundConfigSchema = z.discriminatedUnion('transport', [
  clipboardOpenSchema,
  harnessCliSchema,
]);

export type DesktopOutboundConfig = z.infer<typeof desktopOutboundConfigSchema>;
export type DesktopClipboardOutboundConfig = z.infer<
  typeof clipboardOpenSchema
>;
export type DesktopHarnessCliOutboundConfig = z.infer<typeof harnessCliSchema>;

export function parseDesktopOutboundConfig(
  raw: unknown,
): DesktopOutboundConfig | null {
  const parsed = desktopOutboundConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Payload exposed to the canvas as window.hyperionDesktop.resumeConnector. */
export function publicResumeConnector(
  config: DesktopOutboundConfig,
): Connector {
  if (config.transport === 'clipboard-open') {
    const { transport: _t, openUrl: _u, ...connector } = config;
    return connector;
  }
  const {
    transport: _t,
    command: _c,
    args: _a,
    prompt: _p,
    cwd: _cwd,
    timeoutMs: _to,
    ...connector
  } = config;
  return connector;
}

export type DesktopOutboundIO = {
  writeText: (text: string) => void;
  openExternal?: (url: string) => Promise<void> | void;
  /** Persist last accepted delivery id for idempotent reconcile. */
  rememberDelivery: (deliveryId: string) => void;
  wasDelivered: (deliveryId: string) => boolean;
};

export type HarnessCliSpawnResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** True when the OS accepted the spawn (process existed). */
  started: boolean;
  error?: Error;
};

export type DesktopHarnessCliIO = DesktopOutboundIO & {
  /**
   * Spawn the configured CLI without a shell. Must not escalate host
   * permissions beyond the inherited Desktop process environment.
   */
  spawn: (request: {
    command: string;
    args: string[];
    cwd?: string;
    stdinText?: string;
    timeoutMs: number;
  }) => Promise<HarnessCliSpawnResult>;
};

const DEFAULT_HARNESS_CLI_TIMEOUT_MS = 120_000;

export function expandHarnessCliArgs(
  tokens: readonly string[],
  values: { sessionId: string; text: string },
): string[] {
  return tokens.map((token) =>
    token
      .replaceAll('{{sessionId}}', values.sessionId)
      .replaceAll('{{text}}', values.text),
  );
}

function alreadyDispatchedMessage() {
  return 'Desktop already dispatched this continuation_prompt';
}

/**
 * W1 clipboard-open connector. Delivery ack ≠ agent step execution.
 */
export function createDesktopClipboardSendConnector(
  config: DesktopClipboardOutboundConfig,
  io: DesktopOutboundIO,
): OutboundSendConnector {
  return {
    id: config.id,
    async reconcileOutbound(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: alreadyDispatchedMessage(),
        };
      return null;
    },
    async send(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: alreadyDispatchedMessage(),
        };
      if (!delivery.text?.trim())
        return {
          outcome: 'failed' as const,
          message: 'Outbound prompt text was empty',
        };
      try {
        io.writeText(delivery.text);
        if (config.openUrl && io.openExternal)
          await io.openExternal(config.openUrl);
        io.rememberDelivery(delivery.id);
        return {
          outcome: 'accepted' as const,
          message:
            'Continuation copied to the clipboard for the configured Desktop send path. Delivery is not task execution.',
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Desktop send failed';
        // Clipboard/open failure before host turn → failed (safe to retry).
        return { outcome: 'failed' as const, message };
      }
    },
  };
}

/**
 * W2 harness-cli connector: spawn installed local CLI with the prompt.
 * Delivery ack ≠ agent step execution. Ambiguous post-start failures throw
 * so the lease stays uncertain until reconcile.
 */
export function createDesktopHarnessCliSendConnector(
  config: DesktopHarnessCliOutboundConfig,
  io: DesktopHarnessCliIO,
): OutboundSendConnector {
  return {
    id: config.id,
    async reconcileOutbound(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: alreadyDispatchedMessage(),
        };
      return null;
    },
    async send(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: alreadyDispatchedMessage(),
        };
      if (!delivery.text?.trim())
        return {
          outcome: 'failed' as const,
          message: 'Outbound prompt text was empty',
        };

      const sessionId = delivery.sessionId || config.sessionId;
      let args = expandHarnessCliArgs(config.args, {
        sessionId,
        text: delivery.text,
      });
      const textInArgs = config.args.some((token) =>
        token.includes('{{text}}'),
      );
      let stdinText: string | undefined;
      if (!textInArgs) {
        if (config.prompt === 'stdin') stdinText = delivery.text;
        else args = [...args, delivery.text];
      }

      const result = await io.spawn({
        command: config.command,
        args,
        cwd: config.cwd,
        stdinText,
        timeoutMs: config.timeoutMs ?? DEFAULT_HARNESS_CLI_TIMEOUT_MS,
      });

      if (!result.started) {
        const message =
          result.error?.message ||
          `Desktop harness-cli could not start ${config.command}`;
        return { outcome: 'failed' as const, message };
      }

      if (result.error) {
        // Process may already be running — do not blind-resend.
        throw result.error;
      }

      if (result.signal) {
        throw new Error(
          `Desktop harness-cli terminated by signal ${result.signal}; reconcile before retry`,
        );
      }

      if (result.exitCode === 0) {
        io.rememberDelivery(delivery.id);
        return {
          outcome: 'accepted' as const,
          message:
            'Continuation dispatched to the installed harness CLI. Delivery is not task execution.',
        };
      }

      // Non-zero after start: turn may have begun — uncertain, not failed.
      throw new Error(
        `Desktop harness-cli exited ${result.exitCode}; reconcile before retry`,
      );
    },
  };
}

/** Build the Desktop send connector for whichever transport the config declares. */
export function createDesktopOutboundSendConnector(
  config: DesktopOutboundConfig,
  io: DesktopOutboundIO | DesktopHarnessCliIO,
): OutboundSendConnector {
  if (config.transport === 'clipboard-open')
    return createDesktopClipboardSendConnector(config, io);
  return createDesktopHarnessCliSendConnector(
    config,
    io as DesktopHarnessCliIO,
  );
}
