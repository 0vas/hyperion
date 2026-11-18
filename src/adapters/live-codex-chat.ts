/**
 * Public, renderer-safe projection for the Desktop-only Codex App Server chat.
 * The Electron main process owns JSON-RPC, child processes and credentials.
 */
export type LiveChatTurnStatus =
  'running' | 'completed' | 'failed' | 'interrupted';
export type LiveChatEvent =
  | {
      type: 'connection';
      status: 'connecting' | 'connected' | 'disconnected';
      message?: string;
    }
  | { type: 'thread'; runId: string; threadId: string }
  | {
      type: 'uncertain';
      runId: string;
      /** Redacted lifecycle status; no thread ID, prompt, or tool input. */
      label: string;
    }
  | { type: 'user-message'; text: string }
  | { type: 'assistant-delta'; threadId: string; itemId: string; text: string }
  | {
      type: 'turn';
      threadId: string;
      turnId: string;
      status: LiveChatTurnStatus;
    }
  | {
      type: 'action';
      threadId: string;
      itemId: string;
      status: 'requested' | 'running' | 'succeeded' | 'failed';
      label: string;
    }
  | {
      type: 'approval';
      threadId: string;
      /** Renderer token, not the App Server JSON-RPC request id. */
      token: string;
      label: string;
    }
  | {
      type: 'approval-resolved';
      threadId: string;
      token: string;
      decision: 'allowed' | 'denied';
    };

export const INTERACTIVE_HYPERION_TOOLS = new Set([
  'hyperion_get_run',
  'hyperion_list_runs',
  'hyperion_open',
  'hyperion_wait',
  'hyperion_create_run',
  'hyperion_step',
  'hyperion_add_artifact',
]);

export function isInteractiveToolCallAllowed(
  name: string,
  input: unknown,
): boolean {
  if (!INTERACTIVE_HYPERION_TOOLS.has(name)) return false;
  if (name !== 'hyperion_step') return true;
  if (!input || typeof input !== 'object') return false;
  const action = (input as { action?: unknown }).action;
  return (
    action === 'start' ||
    action === 'log' ||
    action === 'complete' ||
    action === 'fail'
  );
}

const cleanText = (value: unknown) =>
  typeof value === 'string' ? value.slice(0, 16_000) : '';

/** Never pass raw tool inputs, reasoning, paths, or errors to the renderer. */
export function projectAppServerEvent(message: unknown): LiveChatEvent[] {
  if (!message || typeof message !== 'object') return [];
  const record = message as { method?: unknown; params?: unknown };
  const params =
    record.params && typeof record.params === 'object'
      ? (record.params as Record<string, unknown>)
      : {};
  const threadId = cleanText(params.threadId);
  if (record.method === 'item/agentMessage/delta') {
    const text = cleanText(params.delta);
    const itemId = cleanText(params.itemId) || 'assistant';
    return threadId && text
      ? [{ type: 'assistant-delta', threadId, itemId, text }]
      : [];
  }
  if (record.method === 'turn/started') {
    const turn = params.turn as Record<string, unknown> | undefined;
    const turnId = cleanText(turn?.id);
    return threadId && turnId
      ? [{ type: 'turn', threadId, turnId, status: 'running' }]
      : [];
  }
  if (record.method === 'turn/completed') {
    const turn = params.turn as Record<string, unknown> | undefined;
    const status = cleanText(turn?.status);
    const turnId = cleanText(turn?.id);
    if (
      !threadId ||
      !turnId ||
      !['completed', 'failed', 'interrupted'].includes(status)
    )
      return [];
    return [
      { type: 'turn', threadId, turnId, status: status as LiveChatTurnStatus },
    ];
  }
  if (record.method === 'item/started') {
    const item = params.item as Record<string, unknown> | undefined;
    if (item?.type === 'userMessage') {
      const content = Array.isArray(item.content) ? item.content : [];
      const firstText = content.find(
        (part): part is Record<string, unknown> =>
          Boolean(part) &&
          typeof part === 'object' &&
          typeof part.text === 'string',
      );
      const text = cleanText(firstText?.text);
      if (threadId && text) return [{ type: 'user-message', text }];
    }
  }
  if (record.method === 'item/started' || record.method === 'item/completed') {
    const item = params.item as Record<string, unknown> | undefined;
    const name = cleanText(item?.tool) || cleanText(item?.name);
    const server = cleanText(item?.server);
    const itemId = cleanText(item?.id);
    if (
      !threadId ||
      !itemId ||
      server !== 'hyperion' ||
      !INTERACTIVE_HYPERION_TOOLS.has(name)
    )
      return [];
    const completed = record.method === 'item/completed';
    const failed = item?.status === 'failed' || item?.status === 'error';
    return [
      {
        type: 'action',
        threadId,
        itemId,
        status: completed ? (failed ? 'failed' : 'succeeded') : 'running',
        label: `Hyperion: ${name}`,
      },
    ];
  }
  return [];
}

export type LiveChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  status?: LiveChatTurnStatus;
};
export type LiveChatState = {
  status: 'connecting' | 'connected' | 'disconnected';
  activeTurnId: string | null;
  canSend?: boolean;
  messages: LiveChatMessage[];
};

export function reduceLiveChat(
  state: LiveChatState,
  event: LiveChatEvent,
): LiveChatState {
  if (event.type === 'connection')
    return {
      ...state,
      status: event.status,
      canSend: event.status === 'connected' && !state.activeTurnId,
    };
  if (event.type === 'user-message')
    return {
      ...state,
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: 'user', text: event.text },
      ],
    };
  if (event.type === 'turn') {
    if (event.status === 'running')
      return { ...state, activeTurnId: event.turnId, canSend: false };
    return {
      ...state,
      activeTurnId: null,
      canSend: state.status === 'connected',
      messages: state.messages.map((message) =>
        message.role === 'assistant' && !message.status
          ? { ...message, status: event.status }
          : message,
      ),
    };
  }
  if (event.type === 'assistant-delta') {
    const last = state.messages.at(-1);
    if (last?.role === 'assistant' && !last.status)
      return {
        ...state,
        messages: [
          ...state.messages.slice(0, -1),
          { ...last, text: last.text + event.text },
        ],
      };
    return {
      ...state,
      messages: [
        ...state.messages,
        { id: event.itemId, role: 'assistant', text: event.text },
      ],
    };
  }
  return state;
}
