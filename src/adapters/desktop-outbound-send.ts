import { z } from 'zod';
import { connectorSchema, type Connector } from '../domain/continuation.js';
import type { OutboundPromptDelivery } from '../domain/outbound-prompt.js';
import type { Run } from '../domain/workflow.js';
import type { OutboundSendConnector } from './outbound-prompt-worker.js';

/**
 * Desktop W1 outbound send config (ADR 0036).
 * Trusted local file outside model plans. Transport is honest clipboard+open —
 * not a claim that the host chat pane received a native message injection.
 */
export const desktopOutboundConfigSchema = connectorSchema
  .extend({
    transport: z.literal('clipboard-open'),
    /** Optional https/http or custom URL opened after copying the prompt. */
    openUrl: z.string().min(1).max(4000).optional(),
  })
  .strict();

export type DesktopOutboundConfig = z.infer<typeof desktopOutboundConfigSchema>;

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
  const { transport: _t, openUrl: _u, ...connector } = config;
  return connector;
}

export type DesktopOutboundIO = {
  writeText: (text: string) => void;
  openExternal?: (url: string) => Promise<void> | void;
  /** Persist last accepted delivery id for idempotent reconcile. */
  rememberDelivery: (deliveryId: string) => void;
  wasDelivered: (deliveryId: string) => boolean;
};

/**
 * Build the Desktop send connector. Delivery ack ≠ agent step execution.
 */
export function createDesktopClipboardSendConnector(
  config: DesktopOutboundConfig,
  io: DesktopOutboundIO,
): OutboundSendConnector {
  return {
    id: config.id,
    async reconcileOutbound(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: 'Desktop already dispatched this continuation_prompt',
        };
      return null;
    },
    async send(delivery: OutboundPromptDelivery, _run: Run) {
      if (io.wasDelivered(delivery.id))
        return {
          outcome: 'accepted' as const,
          message: 'Desktop already dispatched this continuation_prompt',
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
