/** Honest UI for agent steps left `running` after the chat ended. */

export function looksLikePermissionDenial(text: string): boolean {
  return /access denied|permission denied|acceso denegado|eacces|eperm|not authorized|denied access|documents access|permission|permiso/i.test(
    text,
  );
}

export function latestStepEvidence(
  events: { stepId?: string; message?: string }[],
  stepId: string,
): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.stepId === stepId && event.message?.trim()) return event.message;
  }
  return '';
}

export type StuckRunningKind = 'active-wait' | 'stuck' | 'permission';

export function stuckRunningKind(options: {
  agentWaiting: boolean;
  permissionLike: boolean;
}): StuckRunningKind {
  if (options.agentWaiting) return 'active-wait';
  return options.permissionLike ? 'permission' : 'stuck';
}

export function hasOrphanRunning(
  steps: { kind: string; status: string }[],
  agentWaiting: boolean,
): boolean {
  return (
    !agentWaiting &&
    steps.some((step) => step.kind === 'agent' && step.status === 'running')
  );
}
