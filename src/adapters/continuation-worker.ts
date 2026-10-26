import { setTimeout } from 'node:timers/promises';
import type { Delivery } from '../domain/continuation.js';
import type { Run } from '../domain/workflow.js';
import type { HyperionClient } from './client.js';
import {
  dispatchOutboundOnce,
  type OutboundSendConnector,
} from './outbound-prompt-worker.js';

/** Trusted host integration, configured outside model-generated plans. */
export type ResumeConnector = {
  id: string;
  /** Query the provider's durable dispatch receipt. null means still unknown. */
  reconcile?(
    delivery: Delivery,
    run: Run,
  ): Promise<{ outcome: 'accepted' | 'failed'; message?: string } | null>;
  /** Use delivery.id for durable deduplication. Return after dispatch acknowledgement,
   * not after generation. Return failed ONLY if no remote turn was started.
   * Throw on ambiguous network failures: these require reconciliation. */
  resume(
    delivery: Delivery,
    run: Run,
  ): Promise<{ outcome: 'accepted' | 'failed'; message?: string }>;
};

/**
 * Bridge connector: ADR 0022 resume and/or ADR 0036 outbound send.
 * At least one of `resume` or `send` must be implemented.
 */
export type BridgeConnector = {
  id: string;
  reconcile?: ResumeConnector['reconcile'];
  resume?: ResumeConnector['resume'];
  reconcileOutbound?: OutboundSendConnector['reconcileOutbound'];
  send?: OutboundSendConnector['send'];
};
export async function dispatchOnce(
  client: HyperionClient,
  connector: ResumeConnector,
): Promise<boolean> {
  if (connector.reconcile) {
    for (const pending of await client.pendingContinuations(connector.id)) {
      const result = await connector.reconcile(
        pending,
        await client.get(pending.runId),
      );
      if (result)
        await client.settleContinuation(pending.id, {
          leaseToken: pending.leaseToken,
          ...result,
          reconciled: true,
        });
    }
  }
  const delivery = await client.claimContinuation(connector.id);
  if (!delivery) return false;
  const run = await client.get(delivery.runId);
  // A human may have paused or cancelled between claiming and fetching.
  if (
    run.status !== 'active' ||
    !run.steps.some((s) => s.kind === 'agent' && s.status === 'ready')
  )
    return true;
  const result = await connector.resume(delivery, run);
  await client.settleContinuation(delivery.id, {
    leaseToken: delivery.leaseToken,
    ...result,
  });
  return true;
}

/**
 * One poll tick: ADR 0022 human-answer resume, then ADR 0036 outbound prompt
 * when the connector implements `send`.
 */
export async function dispatchBridgeOnce(
  client: HyperionClient,
  connector: BridgeConnector,
): Promise<boolean> {
  let worked = false;
  if (typeof connector.resume === 'function')
    worked =
      (await dispatchOnce(client, connector as ResumeConnector)) || worked;
  if (typeof connector.send === 'function')
    worked =
      (await dispatchOutboundOnce(
        client,
        connector as OutboundSendConnector,
      )) || worked;
  return worked;
}

/** Only this small IO worker stays alive; no LLM request runs while awaiting input. */
export async function runContinuationWorker(
  client: HyperionClient,
  connector: BridgeConnector,
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
      await dispatchBridgeOnce(client, connector);
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
