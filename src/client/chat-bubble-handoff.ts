import type { ConnectionStatusId } from './Connections';
import { outboundSendConfiguredFromResumeConnector } from './next-cycle-send';

/**
 * Slice 3 cooperative handoff gates.
 * Copiar is paste-into-chat only (not delivery). Enviar needs a real host
 * ResumeConnector whose harness matches the selected DESKTOP_CLIENTS id,
 * an honest configured inventory row, and an active run for continuation_prompt.
 */

export function canBubbleCopy(
  prompt: string,
  selectedClientId: string,
): boolean {
  return Boolean(prompt.trim() && selectedClientId);
}

export function canBubbleSend(options: {
  prompt: string;
  selectedClientId: string;
  selectedStatus?: ConnectionStatusId;
  resumeConnector?: unknown;
  runId?: string;
  /** Outbound continuation_prompt requires connector.harness === run.coordinator. */
  runCoordinator?: string;
}): boolean {
  if (!canBubbleCopy(options.prompt, options.selectedClientId)) return false;
  if (!options.runId) return false;
  if (options.selectedStatus !== 'configured') return false;
  if (
    options.runCoordinator &&
    options.runCoordinator !== options.selectedClientId
  )
    return false;
  return outboundSendConfiguredFromResumeConnector(
    options.resumeConnector,
    options.selectedClientId,
  );
}

/**
 * Cooperative clipboard / outbound body. Never claims tools loaded or wake.
 */
export function buildBubbleHandoffText(options: {
  prompt: string;
  runUrl?: string;
  translate: (
    message: string,
    values?: Record<string, string | number>,
  ) => string;
}): string {
  const request = options.prompt.trim();
  const body = options.translate(
    'Usa Hyperion para esta petición. Crea o continúa el flujo y registra resultados reales. Mi petición: {0}',
    { 0: request },
  );
  if (!options.runUrl) return body;
  return `${body}\n\n${options.translate('Canvas de este flujo')}: ${options.runUrl}`;
}

export function bubbleSendBlockedReason(options: {
  prompt: string;
  selectedClientId: string;
  selectedStatus?: ConnectionStatusId;
  resumeConnector?: unknown;
  runId?: string;
  runCoordinator?: string;
}): string {
  if (!options.selectedClientId)
    return 'Elige una conexión para el handoff cooperativo.';
  if (!options.prompt.trim()) return 'Escribe una petición para el agente.';
  if (!options.runId)
    return 'Enviar requiere un flujo abierto en el canvas. Mientras tanto, copia y pega la petición en tu chat.';
  if (options.selectedStatus !== 'configured')
    return 'Solo una conexión configurada localmente puede usar Enviar. Configurado no implica herramientas cargadas en el chat.';
  if (
    options.runCoordinator &&
    options.runCoordinator !== options.selectedClientId
  ) {
    return 'Enviar requiere que la conexión elegida coincida con el coordinador de este flujo. Mientras tanto, copia y pega la petición. Copiar no equivale a entregar.';
  }
  if (
    !outboundSendConfiguredFromResumeConnector(
      options.resumeConnector,
      options.selectedClientId,
    )
  ) {
    return 'Enviar al chat estará disponible cuando haya un conector de reanudación o envío configurado para esta conexión. Mientras tanto, copia y pega la petición. Copiar no equivale a entregar.';
  }
  return '';
}
