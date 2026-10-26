import type { ContinuationState } from '../domain/continuation';

/**
 * Phase 0 honesty: a linked-cycle “Enviar al chat” action is allowed only when an
 * explicit outbound host-send path is configured. A durable resume binding on the
 * completed parent (human-wait continuation) is not that path — it must not invent
 * Claude/Desktop chat delivery. Phase 1 outbox (ADR 0036) will flip the flag.
 */
export function canSendNewBeginningToChat(
  options: {
    continuation?: ContinuationState | null;
    outboundSendConfigured?: boolean;
  } = {},
): boolean {
  if (!options.outboundSendConfigured) return false;
  // Future: require a real connector id from outbound config; never invent one.
  void options.continuation;
  return true;
}
