/**
 * Phase 0 wake CTA: Copiar continuación when the chat is disconnected but
 * agent work is ready. Hidden while a coordinator wait is open (case A).
 * Enviar stays separately gated by outboundSendConfigured / ResumeConnector.
 */
export function showWakeContinuationCta(options: {
  live: boolean;
  agentWaiting: boolean;
  readyAgentCount: number;
  /** Human forms still open take the canvas-next slot. */
  humanWaitingCount?: number;
  /** Durable continuation banner owns that case. */
  hasDurableContinuation?: boolean;
}): boolean {
  if (!options.live) return false;
  if (options.agentWaiting) return false;
  if (options.readyAgentCount <= 0) return false;
  if ((options.humanWaitingCount ?? 0) > 0) return false;
  if (options.hasDurableContinuation) return false;
  return true;
}

/** Resultado hosts the same CTA on a ready agent step when wait is closed. */
export function showResultadoWakeContinuationCta(options: {
  live: boolean;
  agentWaiting: boolean;
  stepKind: string;
  stepStatus: string;
}): boolean {
  if (!options.live) return false;
  if (options.agentWaiting) return false;
  return options.stepKind === 'agent' && options.stepStatus === 'ready';
}
