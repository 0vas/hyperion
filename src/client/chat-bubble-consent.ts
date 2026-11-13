/**
 * Slice 1 consent wall: the Desktop chat bubble may only request agent-side
 * Hyperion work. Human commits (including amend / irreversible ack) stay on
 * the canvas with the human session — never from the bubble.
 */
export const BUBBLE_FORBIDDEN_COMMANDS = [
  'submit',
  'approve',
  'reject',
  'pause',
  'resume',
  'cancel',
  'amend',
  'acknowledgeIrreversible',
] as const;

export type BubbleForbiddenCommand = (typeof BUBBLE_FORBIDDEN_COMMANDS)[number];

/** Agent-orchestration commands the bubble may eventually request (not human). */
export const BUBBLE_ALLOWED_AGENT_ACTIONS = [
  'create_run',
  'list_runs',
  'get_run',
  'step',
  'wait',
  'revise_plan',
  'add_artifact',
  'open',
  'copy_continuation',
] as const;

export type BubbleAgentAction = (typeof BUBBLE_ALLOWED_AGENT_ACTIONS)[number];

export function isBubbleForbiddenCommand(value: string): boolean {
  return (BUBBLE_FORBIDDEN_COMMANDS as readonly string[]).includes(value);
}

/**
 * Guard for any bubble→API payload. Rejects human command types and the
 * acknowledgeIrreversible flag even if buried on an otherwise agent payload.
 */
export function assertBubblePayloadAllowed(payload: {
  type?: string;
  action?: string;
  acknowledgeIrreversible?: boolean;
}): void {
  const kind = payload.type || payload.action || '';
  if (isBubbleForbiddenCommand(kind)) {
    throw new Error(
      `Chat bubble cannot issue human command: ${kind}. Use the canvas.`,
    );
  }
  if (payload.acknowledgeIrreversible === true) {
    throw new Error(
      'Chat bubble cannot acknowledge irreversible amend effects. Use the canvas.',
    );
  }
}

export function isBubbleAgentAction(value: string): boolean {
  return (BUBBLE_ALLOWED_AGENT_ACTIONS as readonly string[]).includes(value);
}
