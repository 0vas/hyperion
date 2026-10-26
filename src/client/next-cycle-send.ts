import { connectorSchema, type Connector } from '../domain/continuation';

/**
 * Host-configured ResumeConnector that satisfies durable resume
 * (id + resume + idempotentDelivery). Never invent a connector in the UI.
 * Connections «Configurada», run.continuation alone, or provider name are not enough.
 */
export function outboundSendConfiguredFromResumeConnector(
  connector: unknown,
  runHarness?: string,
): boolean {
  const parsed = connectorSchema.safeParse(connector);
  if (!parsed.success) return false;
  if (runHarness && parsed.data.harness !== runHarness) return false;
  return true;
}

/**
 * Phase 0: Enviar only when outboundSendConfigured is true (from a real
 * ResumeConnector). Today no certified native resume connectors ship → false.
 */
export function canSendNewBeginningToChat(
  options: {
    outboundSendConfigured?: boolean;
    resumeConnector?: unknown;
    runHarness?: string;
  } = {},
): boolean {
  if (options.outboundSendConfigured === true) return true;
  if (options.resumeConnector !== undefined)
    return outboundSendConfiguredFromResumeConnector(
      options.resumeConnector,
      options.runHarness,
    );
  return false;
}

export type { Connector };
