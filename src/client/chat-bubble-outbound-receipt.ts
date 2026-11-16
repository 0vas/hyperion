import type { OutboundPromptState } from '../domain/outbound-prompt';

/** Terminal outbound statuses that become durable thread receipts (delivery ≠ execution). */
export const OUTBOUND_RECEIPT_STATUSES = [
  'delivered',
  'failed',
  'uncertain',
] as const;

export type OutboundReceiptStatus = (typeof OUTBOUND_RECEIPT_STATUSES)[number];

export function isOutboundReceiptStatus(
  status: string,
): status is OutboundReceiptStatus {
  return (OUTBOUND_RECEIPT_STATUSES as readonly string[]).includes(status);
}

export function outboundReceiptKey(prompt: OutboundPromptState): string {
  return `${prompt.jobId || prompt.updatedAt}:${prompt.status}`;
}

/**
 * Spanish source strings for i18n catalog — delivery ack only, never step done / chat woken.
 */
export function outboundReceiptMessage(
  prompt: Pick<OutboundPromptState, 'status' | 'harness'>,
): string {
  if (prompt.status === 'delivered') {
    return 'Entrega aceptada por el conector {0}. Eso no prueba que el agente haya ejecutado el trabajo ni que MCP haya despertado el chat.';
  }
  if (prompt.status === 'failed') {
    return 'La entrega al conector {0} falló. Hyperion no inventa una respuesta del agente; revisa el conector o usa Copiar.';
  }
  if (prompt.status === 'uncertain') {
    return 'Entrega ambigua al conector {0}. Hay que reconciliar antes de reintentar; no se reenvía a ciegas ni se marca el paso como hecho.';
  }
  return 'Outbound conocido: {0} · {1}';
}
