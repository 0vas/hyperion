export type ThreadMessage = {
  id: string;
  role: 'you' | 'system' | 'assistant';
  text: string;
  meta?: string;
  approvalToken?: string;
  approvalState?: 'allowed' | 'denied' | 'expired';
  toolName?: string;
  provider?: string;
  activity?: { key?: string; status: string; error?: string; summary?: string };
};

const genericLabels = new Set(['Harness action', 'Harness action updated']);

// Exact public labels projected by Desktop. Never translate arbitrary titles,
// assistant prose, or evidence using this allowlist.
const publicActionLabels: Record<string, string> = {
  'List workflows': 'Listar flujos',
  'Read workflow': 'Consultar el flujo',
  'Wait for workflow': 'Esperar un cambio del flujo',
  'Create workflow': 'Crear un flujo',
  'Revise workflow plan': 'Proponer una revisión del plan',
  'Update workflow step': 'Actualizar un paso del flujo',
  'Read content': 'Leer contenido',
  'Edit content': 'Editar contenido',
  'Delete content': 'Eliminar contenido',
  'Move content': 'Mover contenido',
  'Search content': 'Buscar contenido',
  'Run command': 'Ejecutar comando',
  'Process request': 'Procesar solicitud',
  'Fetch content': 'Obtener contenido',
  'Change mode': 'Cambiar modo',
  'Harness action': 'Acción del proveedor',
};

export function localizePublicActionLabel(
  label: string,
  translate: (key: string) => string,
): string {
  return Object.hasOwn(publicActionLabels, label)
    ? translate(publicActionLabels[label]!)
    : label;
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined;

/** Correlate only explicit IDs. Identical labels can describe different calls. */
export function updateActivity(
  items: ThreadMessage[],
  event: Record<string, unknown>,
  threadId: string,
  fallbackId: string,
): ThreadMessage[] {
  const callId = text(event.toolCallId) ?? text(event.itemId);
  const key = callId
    ? JSON.stringify([threadId, text(event.turnId) ?? '', callId])
    : undefined;
  const index = key
    ? items.findIndex((item) => item.activity?.key === key)
    : -1;
  const previous = index >= 0 ? items[index] : undefined;
  const label = text(event.label);
  const message: ThreadMessage = {
    id: previous?.id ?? fallbackId,
    role: 'system',
    text: label && !genericLabels.has(label) ? label : (previous?.text ?? ''),
    activity: {
      key,
      status: text(event.status) ?? previous?.activity?.status ?? 'unknown',
      error: text(event.error) ?? previous?.activity?.error,
      summary: text(event.summary) ?? previous?.activity?.summary,
    },
  };
  return index < 0
    ? [...items, message]
    : items.map((item, i) => (i === index ? message : item));
}

export function appendAssistant(
  items: ThreadMessage[],
  id: string,
  delta: string,
  provider: string,
): ThreadMessage[] {
  const index = items.findIndex(
    (item) => item.role === 'assistant' && item.id === id,
  );
  return index < 0
    ? [...items, { id, role: 'assistant', text: delta, provider }]
    : items.map((item, i) =>
        i === index ? { ...item, text: item.text + delta } : item,
      );
}

export function settleActivities(
  items: ThreadMessage[],
  status: string,
): ThreadMessage[] {
  return items.map((item) =>
    item.activity &&
    ['pending', 'running', 'in_progress', 'unknown'].includes(
      item.activity.status,
    )
      ? {
          ...item,
          activity: {
            ...item.activity,
            status: status === 'completed' ? 'unconfirmed' : status,
          },
        }
      : item,
  );
}

type TranscriptGroup =
  | { kind: 'activity'; id: string; items: ThreadMessage[] }
  | { kind: 'message'; id: string; message: ThreadMessage };
export function groupTranscript(items: ThreadMessage[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  for (const message of items) {
    if (message.activity) {
      const last = groups.at(-1);
      if (last?.kind === 'activity') last.items.push(message);
      else groups.push({ kind: 'activity', id: message.id, items: [message] });
    } else groups.push({ kind: 'message', id: message.id, message });
  }
  return groups;
}

export function activityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: 'Pendiente',
    succeeded: 'Completado',
    pending: 'Pendiente',
    running: 'En curso',
    in_progress: 'En curso',
    completed: 'Completado',
    failed: 'Falló',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
    interrupted: 'Interrumpido',
    abandoned: 'Abandonado',
    unconfirmed: 'Sin confirmar',
    unknown: 'Estado no disponible',
  };
  return labels[status] ?? 'Estado no disponible';
}

export function activityNeedsAttention(message: ThreadMessage): boolean {
  return (
    Boolean(message.activity?.error) ||
    ['failed', 'abandoned', 'unconfirmed'].includes(
      message.activity?.status ?? '',
    )
  );
}
