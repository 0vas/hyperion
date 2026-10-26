/** Ready agent step ids for continuation clipboard (Phase 0 Copiar). */
export function readyAgentStepIds(run: {
  steps: Array<{ id: string; kind: string; status: string }>;
}): string[] {
  return run.steps
    .filter((step) => step.kind === 'agent' && step.status === 'ready')
    .map((step) => step.id);
}

/**
 * Clipboard body for Copiar continuación when the chat is disconnected.
 * Lists every ready agent stepId so the host executes all of them in one turn.
 * Does not claim delivery or MCP wake.
 */
export function continuationClipboardBody(
  translate: (
    message: string,
    values?: Record<string, string | number>,
  ) => string,
  run: {
    id: string;
    steps: Array<{ id: string; kind: string; status: string }>;
  },
): string {
  const stepIds = readyAgentStepIds(run);
  if (!stepIds.length) {
    return translate(
      'Continúa el flujo de Hyperion {0}. Lee su estado y mi respuesta; ejecuta solo los pasos habilitados y registra resultados reales.',
      { 0: run.id },
    );
  }
  return translate(
    'Continúa el flujo de Hyperion {0}. Lee su estado y mi respuesta guardada. Ejecuta YA todos estos pasos de agente listos: {1}. Registra resultados reales. No me pidas escribir listo ni repetir la respuesta en el chat.',
    { 0: run.id, 1: stepIds.join(', ') },
  );
}
