import { setTimeout } from 'node:timers/promises';
import type { OutboundPromptDelivery } from '../domain/outbound-prompt.js';
import type { Run } from '../domain/workflow.js';
import type { HyperionClient } from './client.js';

/**
 * Trusted local send connector for ADR 0036 continuation_prompt jobs.
 * Configured outside model-generated plans. Delivery ack ≠ task execution.
 */
export type OutboundSendConnector = {
  id: string;
  reconcileOutbound?(
    delivery: OutboundPromptDelivery,
    run: Run,
  ): Promise<{ outcome: 'accepted' | 'failed'; message?: string } | null>;
  /**
   * Start a host turn with delivery.text. Return after dispatch acknowledgement,
   * not after generation. failed ONLY if no remote turn was started.
   * Throw on ambiguous failures so the lease stays uncertain.
   */
  send(
    delivery: OutboundPromptDelivery,
    run: Run,
  ): Promise<{ outcome: 'accepted' | 'failed'; message?: string }>;
};

export async function dispatchOutboundOnce(
  client: HyperionClient,
  connector: OutboundSendConnector,
): Promise<boolean> {
  if (connector.reconcileOutbound) {
    for (const pending of await client.pendingOutboundPrompts(connector.id)) {
      const result = await connector.reconcileOutbound(
        pending,
        await client.get(pending.runId),
      );
      if (result)
        await client.settleOutboundPrompt(pending.id, {
          leaseToken: pending.leaseToken,
          ...result,
          reconciled: true,
        });
    }
  }
  const delivery = await client.claimOutboundPrompt(connector.id);
  if (!delivery) return false;
  const run = await client.get(delivery.runId);
  if (run.status !== 'active') return true;
  const result = await connector.send(delivery, run);
  await client.settleOutboundPrompt(delivery.id, {
    leaseToken: delivery.leaseToken,
    ...result,
  });
  return true;
}

/** Poll outbound continuation_prompt jobs; no LLM while idle. */
export async function runOutboundPromptWorker(
  client: HyperionClient,
  connector: OutboundSendConnector,
  options: {
    signal: AbortSignal;
    onError: (error: unknown) => void;
    intervalMs?: number;
  },
) {
  const interval = options.intervalMs ?? 1000;
  if (!Number.isFinite(interval) || interval < 100 || interval > 60000)
    throw new Error('Invalid worker interval');
  while (!options.signal.aborted) {
    try {
      await dispatchOutboundOnce(client, connector);
    } catch (error) {
      options.onError(error);
    }
    try {
      await setTimeout(interval, undefined, { signal: options.signal });
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}
