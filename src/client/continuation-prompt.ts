type PromptStep = { id: string; title?: string; kind: string; status: string };

/** Ready agent steps for continuation clipboard (Phase 0 Copiar). */
export function readyAgentSteps(run: { steps: PromptStep[] }): PromptStep[] {
  return run.steps.filter(
    (step) => step.kind === 'agent' && step.status === 'ready',
  );
}

export function readyAgentStepIds(run: { steps: PromptStep[] }): string[] {
  return readyAgentSteps(run).map((step) => step.id);
}

/** Designer sealed label: "{title} ({id})" per ready agent step. */
export function formatReadyAgentStepLabel(step: PromptStep): string {
  const title = (step.title || step.id).trim() || step.id;
  return `${title} (${step.id})`;
}

/**
 * Clipboard body for Copiar continuación when the chat is disconnected.
 * Lists every ready agent step as "{title} ({id})" so the host executes all
 * of them in one turn. Does not claim delivery or MCP wake.
 */
export function continuationClipboardBody(
  translate: (
    message: string,
    values?: Record<string, string | number>,
  ) => string,
  run: {
    id: string;
    steps: PromptStep[];
  },
): string {
  const ready = readyAgentSteps(run);
  if (!ready.length) {
    return translate(
      'Continúa el flujo de Hyperion {0}. Lee su estado y mi respuesta; ejecuta solo los pasos habilitados y registra resultados reales.',
      { 0: run.id },
    );
  }
  return translate(
    'Continúa el flujo de Hyperion {0}. Lee su estado y mi respuesta guardada. Ejecuta YA todos estos pasos de agente listos: {1}. Registra resultados reales. No me pidas escribir listo ni repetir la respuesta en el chat.',
    {
      0: run.id,
      1: ready.map(formatReadyAgentStepLabel).join(', '),
    },
  );
}
