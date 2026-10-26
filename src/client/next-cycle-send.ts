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
 * Enviar only when a real host ResumeConnector is configured
 * (`outboundSendConfigured` or a `resumeConnector` that parses as connectorSchema
 * and matches the run harness). Connections inventory alone is not enough.
 * Linked-cycle / new-beginning may keep the flag false until that path ships.
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
