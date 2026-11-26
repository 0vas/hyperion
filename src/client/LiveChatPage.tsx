import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  MessageSquareText,
  Send,
  Shield,
  Square,
  X,
} from 'lucide-react';
import antigravityMark from './brands/antigravity.svg';
import claudeMark from './brands/claude.svg';
import codexMark from './brands/codex.svg';
import cursorMark from './brands/cursor.svg';
import { t, useLocale } from './i18n';
import {
  activityNeedsAttention,
  activityStatusLabel,
  appendAssistant,
  groupTranscript,
  localizePublicActionLabel,
  settleActivities,
  updateActivity,
  type ThreadMessage,
} from './live-chat-transcript';

function ActivityGroup({ items }: { items: ThreadMessage[] }) {
  const attention = items.filter(activityNeedsAttention);
  const active = items.some((item) =>
    ['pending', 'running', 'in_progress'].includes(item.activity!.status),
  );
  return (
    <div className="live-chat-activity-group">
      <details className="live-chat-activity" data-testid="live-chat-activity">
        <summary>
          <span>
            {t('Actividad')} ·{' '}
            {items.length === 1
              ? t('1 acción')
              : t('{0} acciones', { 0: items.length })}
          </span>
          <span className="live-chat-activity-state">
            {attention.length
              ? t('Requiere atención')
              : active
                ? t('En curso')
                : t('Ver detalles')}
          </span>
        </summary>
        <ul>
          {items.map((item) => (
            <li key={item.id} data-testid="live-chat-activity-row">
              <span>
                {localizePublicActionLabel(item.text, t) ||
                  t('Acción del proveedor')}
                {item.activity?.summary && (
                  <span className="live-chat-activity-summary">
                    {item.activity.summary}
                  </span>
                )}
              </span>
              <span className="live-chat-activity-state">
                {t(activityStatusLabel(item.activity!.status))}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {attention.map((item) => (
        <p
          className="live-chat-activity-error"
          data-testid="live-chat-activity-error"
          key={item.id}
        >
          <strong>{t(activityStatusLabel(item.activity!.status))}</strong> ·{' '}
          {localizePublicActionLabel(item.text, t) || t('Acción del proveedor')}
          {(item.activity?.error || item.activity?.summary) && (
            <span>{item.activity.error || item.activity.summary}</span>
          )}
        </p>
      ))}
    </div>
  );
}

type Harness = { id: string; label: string; status: string };
const PROVIDER_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  cursor: 'Cursor Agent',
  antigravity: 'Antigravity',
};
const LOGIN_COMMANDS: Record<string, string> = {
  codex: 'codex login',
  claude: 'claude auth login',
  cursor: 'cursor-agent login',
  antigravity: 'agy acp --login',
};

function permissionLabel(message: ThreadMessage): string {
  const labels: Record<string, string> = {
    hyperion_list_runs: 'Consultar flujos',
    hyperion_get_run: 'Consultar el flujo',
    hyperion_wait: 'Esperar un cambio del flujo',
    hyperion_create_run: 'Crear un flujo',
    hyperion_revise_plan: 'Proponer una revisión del plan',
    hyperion_step: 'Actualizar un paso del flujo',
  };
  const generic =
    !message.text ||
    [
      'The local harness requests permission.',
      'Codex requests permission to use the bounded Hyperion action.',
      `Hyperion: ${message.toolName}`,
    ].includes(message.text);
  if (!generic) return localizePublicActionLabel(message.text, t);
  return t(
    (message.toolName && labels[message.toolName]) ||
      'El proveedor solicita permiso para esta acción.',
  );
}

const HARNESS_MARKS: Record<string, string> = {
  codex: codexMark,
  claude: claudeMark,
  cursor: cursorMark,
  antigravity: antigravityMark,
};

function HarnessMark({ id }: { id: string }) {
  const src = HARNESS_MARKS[id];
  return (
    <span className={`live-chat-harness-mark ${id}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span>{id.slice(0, 1)}</span>}
    </span>
  );
}

function harnessStatusLabel(status: string) {
  if (status === 'ready') return t('Disponible localmente');
  if (status === 'missing') return t('No instalado');
  if (status === 'invalid-selection') return t('Requiere configuración');
  return t('Comprobando disponibilidad');
}

function HarnessStatus({ status }: { status: string }) {
  return (
    <span className={`live-chat-harness-availability ${status}`}>
      <span className="live-chat-harness-status-dot" aria-hidden="true" />
      {harnessStatusLabel(status)}
    </span>
  );
}

function HarnessStatusDot({ status }: { status: string }) {
  return (
    <span
      className={`live-chat-harness-status-dot ${status}`}
      aria-hidden="true"
    />
  );
}

type ChatContext = { runId: string | null; title?: string };
type Conversation = { prompt: string; thread: ThreadMessage[] };

function PermissionModePicker({
  mode,
  busy,
  onChange,
}: {
  mode: 'ask' | 'auto' | null;
  busy: boolean;
  onChange: (mode: 'ask' | 'auto') => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!open) return;
    options.current[mode === 'auto' ? 1 : 0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div
      ref={root}
      className="live-chat-mode-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="live-chat-mode-trigger"
        data-testid="live-chat-mode-trigger"
        aria-label={`${t('Modo de permisos')}: ${mode === 'auto' ? 'Auto' : mode === 'ask' ? 'Ask' : t('Sin confirmar')}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'live-chat-mode-menu' : undefined}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Shield size={15} aria-hidden="true" />
        <span>{mode === 'auto' ? 'Auto' : mode === 'ask' ? 'Ask' : '…'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="live-chat-mode-popover"
          data-testid="live-chat-mode-popover"
        >
          <div
            id="live-chat-mode-menu"
            role="menu"
            aria-label={t('Modo de permisos')}
            aria-describedby="live-chat-mode-scope"
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                setOpen(false);
                trigger.current?.focus();
                return;
              }
              const index = options.current.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 1
                    : event.key === 'ArrowDown'
                      ? (index + 1) % 2
                      : event.key === 'ArrowUp'
                        ? (index + 1) % 2
                        : null;
              if (next !== null) {
                event.preventDefault();
                options.current[next]?.focus();
              }
            }}
          >
            {(['ask', 'auto'] as const).map((value, index) => (
              <button
                key={value}
                ref={(node) => {
                  options.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={mode === value}
                aria-label={value === 'ask' ? 'Ask' : 'Auto'}
                aria-describedby={`live-chat-mode-${value}-description`}
                aria-disabled={busy}
                className="live-chat-mode-option"
                onClick={() => {
                  if (busy) return;
                  setOpen(false);
                  trigger.current?.focus();
                  void onChange(value);
                }}
              >
                <span>
                  <strong>{value === 'ask' ? 'Ask' : 'Auto'}</strong>
                  <span id={`live-chat-mode-${value}-description`}>
                    {t(
                      value === 'ask'
                        ? 'Pregunta antes de autorizar acciones del proveedor.'
                        : 'Autoriza automáticamente las acciones del proveedor.',
                    )}
                  </span>
                </span>
                {mode === value && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <p id="live-chat-mode-scope">
            {t(
              'Se guarda para todos los chats. Las decisiones humanas y los permisos obligatorios del proveedor siguen requiriendo tu respuesta.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function expirePermission(message: ThreadMessage): ThreadMessage {
  return message.approvalToken && !message.approvalState
    ? { ...message, approvalState: 'expired', meta: 'Permiso ya no disponible' }
    : message;
}

/** Persistent, non-modal Desktop chat. The chosen context is independent of canvas navigation. */
export function LiveChatPage({
  runId: canvasRunId,
  runTitle,
  open,
  serviceOnline,
  busy = false,
  onClose,
  onOpenConnections,
  onActivityChange,
}: {
  runId?: string;
  runTitle?: string;
  open: boolean;
  serviceOnline: boolean;
  busy?: boolean;
  onClose: () => void;
  onOpenConnections: () => void;
  onActivityChange: (activity: 'idle' | 'working' | 'approval') => void;
}) {
  useLocale();
  const liveChat = window.hyperionDesktop?.liveChat;
  const [context, setContext] = useState<ChatContext>({
    runId: canvasRunId ?? null,
    title: runTitle,
  });
  const contextChosen = useRef(false);
  const conversations = useRef(new Map<string | null, Conversation>());
  const runId = context.runId;
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [turnRunning, setTurnRunning] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [permissionMode, setPermissionMode] = useState<'ask' | 'auto' | null>(
    null,
  );
  const [modeBusy, setModeBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [harnessMenuOpen, setHarnessMenuOpen] = useState(false);
  const [harnesses, setHarnesses] = useState<Harness[]>([
    { id: 'codex', label: 'Codex', status: 'unknown' },
  ]);
  const [selectedHarness, setSelectedHarness] = useState('codex');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const threadId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const harnessPickerRef = useRef<HTMLDivElement>(null);
  const harnessTriggerRef = useRef<HTMLButtonElement>(null);
  const lastSubmitted = useRef('');
  const assistantTurn = useRef(0);
  const currentAssistantIds = useRef(new Set<string>());
  const permissionFocus = useRef<string | null>(null);
  const modeVersion = useRef(0);

  useEffect(() => {
    if (!contextChosen.current) {
      setContext({ runId: canvasRunId ?? null, title: runTitle });
      if (open) contextChosen.current = true;
    }
  }, [canvasRunId, runTitle, open]);

  useEffect(() => {
    if (open) promptRef.current?.focus();
  }, [open]);

  const pendingApproval = thread.some(
    (item) => item.approvalToken && !item.approvalState,
  );
  const contextLocked =
    requestBusy ||
    modeBusy ||
    turnRunning ||
    pendingApproval ||
    uncertain ||
    status === 'connecting';

  useEffect(() => {
    if (contextLocked) setHarnessMenuOpen(false);
  }, [contextLocked]);

  useEffect(() => {
    if (!harnessMenuOpen) return;
    const closeWhenLeaving = (event: PointerEvent) => {
      if (!harnessPickerRef.current?.contains(event.target as Node))
        setHarnessMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenLeaving);
    return () => document.removeEventListener('pointerdown', closeWhenLeaving);
  }, [harnessMenuOpen]);
  useEffect(() => {
    onActivityChange(
      pendingApproval ? 'approval' : turnRunning ? 'working' : 'idle',
    );
  }, [pendingApproval, turnRunning, onActivityChange]);

  function changeContext(nextRunId: string | null) {
    if (contextLocked || nextRunId === runId) return;
    conversations.current.set(runId, { prompt, thread });
    const saved = conversations.current.get(nextRunId);
    contextChosen.current = true;
    setContext({
      runId: nextRunId,
      title: nextRunId === canvasRunId ? runTitle : undefined,
    });
    setPrompt(saved?.prompt ?? '');
    setThread(saved?.thread ?? []);
    setStatus('disconnected');
    setSetupMessage(null);
    setNotice(null);
    setAuthRequired(false);
    threadId.current = null;
    lastSubmitted.current = '';
    followBottom.current = true;
  }

  useEffect(() => {
    if (!liveChat?.harnesses) return;
    void liveChat
      .harnesses()
      .then((snapshot) => {
        setHarnesses(snapshot.harnesses);
        setSelectedHarness(snapshot.selected);
      })
      .catch(() => undefined);
  }, [liveChat]);

  useEffect(() => {
    if (!liveChat?.getPermissionMode) return;
    let disposed = false;
    const version = modeVersion.current;
    void liveChat
      .getPermissionMode()
      .then((result) => {
        if (!disposed && modeVersion.current === version)
          setPermissionMode(result.mode);
      })
      .catch(() => {
        if (!disposed && modeVersion.current === version)
          setNotice(
            t(
              'No se pudo leer el modo de permisos. Vuelve a elegir Ask o Auto.',
            ),
          );
      });
    return () => {
      disposed = true;
    };
  }, [liveChat]);

  useEffect(() => {
    if (!liveChat) return;
    return liveChat.onEvent((value) => {
      const event = value as Record<string, unknown>;
      // Permission preference belongs to Desktop, not the current conversation.
      if (
        event.type === 'permission-mode' &&
        (event.mode === 'ask' || event.mode === 'auto')
      ) {
        setPermissionMode(event.mode);
        modeVersion.current += 1;
        return;
      }
      // A disposed session may finish emitting after the user changes context.
      if ('runId' in event && event.runId !== runId) return;
      if (event.type === 'connection' && typeof event.status === 'string') {
        setStatus(event.status as typeof status);
        if (event.status === 'connected') {
          setUncertain(false);
          setSetupMessage(null);
          setAuthRequired(false);
        }
        if (event.status === 'disconnected') {
          threadId.current = null;
          setTurnRunning(false);
          setThread((items) =>
            settleActivities(items, 'unconfirmed').map(expirePermission),
          );
          if (event.message || event.code)
            setPrompt((current) => current || lastSubmitted.current);
          const needsLogin = event.code === 'auth-required';
          setAuthRequired(needsLogin);
          if (needsLogin)
            setSetupMessage(
              t(
                'Tu sesión de {0} caducó. Inicia sesión en su CLI y reintenta, o elige otro proveedor.',
                { 0: PROVIDER_LABELS[selectedHarness] || selectedHarness },
              ),
            );
          else if (typeof event.message === 'string')
            setSetupMessage(event.message);
        }
        return;
      }
      if (event.type === 'uncertain' && event.runId === runId) {
        setUncertain(true);
        setThread((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: 'system',
            text:
              typeof event.label === 'string'
                ? event.label
                : t(
                    'Un turno anterior de Codex quedó sin confirmar después de reiniciar Desktop.',
                  ),
            meta: t('Requiere resolución'),
          },
        ]);
        return;
      }
      if (
        event.type === 'thread' &&
        event.runId === runId &&
        typeof event.threadId === 'string'
      ) {
        threadId.current = event.threadId;
        return;
      }
      const eventThreadId =
        typeof event.threadId === 'string' ? event.threadId : null;
      if (!eventThreadId || eventThreadId !== threadId.current) return;
      const eventText = typeof event.text === 'string' ? event.text : null;
      if (event.type === 'user-message' && eventText !== null) {
        assistantTurn.current += 1;
        currentAssistantIds.current.clear();
        setThread((items) => [
          ...items,
          { id: crypto.randomUUID(), role: 'you', text: eventText },
        ]);
        return;
      }
      if (event.type === 'assistant-delta' && eventText !== null) {
        const itemId =
          typeof event.itemId === 'string'
            ? event.itemId
            : `assistant-${assistantTurn.current}`;
        const id = `${eventThreadId}:${assistantTurn.current}:${itemId}`;
        currentAssistantIds.current.add(id);
        setThread((items) =>
          appendAssistant(
            items,
            id,
            eventText,
            PROVIDER_LABELS[selectedHarness] || selectedHarness,
          ),
        );
        return;
      }
      if (event.type === 'turn' && typeof event.status === 'string') {
        if (event.status === 'running') setTurnRunning(true);
        else {
          setTurnRunning(false);
          if (event.status === 'completed') lastSubmitted.current = '';
          setThread((items) =>
            settleActivities(items, String(event.status)).map((item) =>
              item.role === 'assistant' &&
              currentAssistantIds.current.has(item.id) &&
              !item.meta &&
              event.status !== 'completed'
                ? { ...item, meta: activityStatusLabel(String(event.status)) }
                : expirePermission(item),
            ),
          );
        }
        return;
      }
      const eventLabel = typeof event.label === 'string' ? event.label : null;
      if (event.type === 'action') {
        setThread((items) =>
          updateActivity(items, event, eventThreadId, crypto.randomUUID()),
        );
        return;
      }
      const approvalToken =
        typeof event.token === 'string' ? event.token : null;
      if (event.type === 'approval' && approvalToken !== null) {
        setThread((items) =>
          items.some((item) => item.approvalToken === approvalToken)
            ? items
            : [
                ...items,
                {
                  id: crypto.randomUUID(),
                  role: 'system',
                  text: eventLabel || '',
                  meta: 'Permiso del proveedor',
                  toolName:
                    typeof event.toolName === 'string'
                      ? event.toolName
                      : undefined,
                  approvalToken,
                },
              ],
        );
        return;
      }
      if (
        event.type === 'approval-resolved' &&
        typeof event.token === 'string'
      ) {
        setThread((items) =>
          items.map((item) =>
            item.approvalToken === event.token
              ? {
                  ...item,
                  approvalState:
                    event.decision === 'allowed'
                      ? 'allowed'
                      : event.decision === 'denied'
                        ? 'denied'
                        : 'expired',
                  meta:
                    event.decision === 'allowed'
                      ? 'Permitido para esta acción'
                      : event.decision === 'denied'
                        ? 'Denegado'
                        : 'Permiso ya no disponible',
                }
              : item,
          ),
        );
      }
    });
  }, [liveChat, runId, selectedHarness]);

  useEffect(() => {
    const node = threadRef.current;
    if (permissionFocus.current) {
      const summary = Array.from(
        node?.querySelectorAll<HTMLElement>('[data-permission-token]') ?? [],
      ).find(
        (element) =>
          element.dataset.permissionToken === permissionFocus.current,
      );
      if (summary) {
        if (document.activeElement === document.body)
          summary.focus({ preventScroll: true });
        permissionFocus.current = null;
      }
    }
    if (node && followBottom.current) node.scrollTop = node.scrollHeight;
  }, [thread, open]);

  useEffect(() => {
    const node = promptRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [prompt, open]);

  const canConnect = Boolean(
    liveChat &&
    serviceOnline &&
    !busy &&
    !requestBusy &&
    !turnRunning &&
    !pendingApproval,
  );
  const canSend = Boolean(
    liveChat &&
    serviceOnline &&
    status !== 'connecting' &&
    !authRequired &&
    !uncertain &&
    !busy &&
    !turnRunning &&
    !pendingApproval &&
    !requestBusy &&
    prompt.trim(),
  );
  const selectedHarnessDetail = harnesses.find(
    (harness) => harness.id === selectedHarness,
  );
  const harnessLabel = selectedHarnessDetail?.label || 'Codex';
  const harnessStatus = selectedHarnessDetail?.status || 'unknown';

  async function connect() {
    if (!canConnect || !liveChat) return;
    setRequestBusy(true);
    setNotice(null);
    try {
      await liveChat.connect(runId);
    } catch {
      // Main deliberately redacts process errors. Never surface raw spawn output.
      setSetupMessage(
        t(
          'No se pudo iniciar el harness local. Revisa la aplicación seleccionada y reintenta.',
        ),
      );
      setStatus('disconnected');
    } finally {
      setRequestBusy(false);
    }
  }

  async function selectHarness(id: string) {
    if (!liveChat?.selectHarness || contextLocked) return;
    setHarnessMenuOpen(false);
    setRequestBusy(true);
    setSetupMessage(null);
    setNotice(null);
    try {
      const snapshot = await liveChat.selectHarness(id);
      setSelectedHarness(snapshot.selected);
      setHarnesses(snapshot.harnesses);
      setStatus('disconnected');
      setAuthRequired(false);
      setUncertain(false);
      threadId.current = null;
      promptRef.current?.focus();
    } catch {
      setNotice(t('No se pudo cambiar el harness local.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function send() {
    if (!canSend || !liveChat) return;
    const submitted = prompt;
    setRequestBusy(true);
    setNotice(null);
    try {
      if (status !== 'connected') {
        const result = await liveChat.connect(runId);
        if (!result.connected) return;
      }
      followBottom.current = true;
      lastSubmitted.current = submitted.trim();
      await liveChat.send(runId, submitted.trim());
      setPrompt((current) => (current === submitted ? '' : current));
    } catch {
      setNotice(t('No se pudo enviar el mensaje al harness local.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function stop() {
    if (!liveChat || !turnRunning || requestBusy) return;
    setRequestBusy(true);
    try {
      await liveChat.stop(runId);
    } catch {
      setNotice(t('No se pudo detener el turno del harness local.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function changePermissionMode(mode: 'ask' | 'auto') {
    if (!liveChat?.setPermissionMode || modeBusy) return;
    setModeBusy(true);
    const version = ++modeVersion.current;
    setNotice(null);
    try {
      const result = await liveChat.setPermissionMode(mode);
      if (modeVersion.current === version) setPermissionMode(result.mode);
    } catch {
      setNotice(t('No se pudo cambiar el modo de permisos.'));
    } finally {
      setModeBusy(false);
    }
  }

  async function decide(token: string, decision: 'allow' | 'deny') {
    if (!liveChat || requestBusy) return;
    if (document.activeElement?.closest('.live-chat-message-actions'))
      permissionFocus.current = token;
    setRequestBusy(true);
    try {
      await liveChat.approve(runId, token, decision);
    } catch {
      setNotice(t('No se pudo registrar el permiso del harness local.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function resolveUncertain() {
    if (!liveChat || requestBusy) return;
    setRequestBusy(true);
    try {
      await liveChat.resolveUncertain(runId);
      setUncertain(false);
      setNotice(
        t(
          'El turno incierto se marcó como no reanudable. Conecta un harness para iniciar un turno nuevo.',
        ),
      );
    } catch {
      setNotice(t('No se pudo resolver el turno incierto de Codex.'));
    } finally {
      setRequestBusy(false);
    }
  }

  const runtimeLabel = !serviceOnline
    ? t('Servicio local sin conexión')
    : status === 'connecting'
      ? t('Conectando')
      : pendingApproval
        ? t('Esperando permiso')
        : turnRunning
          ? t('Turno en curso')
          : authRequired
            ? t('Inicia sesión para continuar')
            : status === 'connected'
              ? t('Sesión lista')
              : t('Se conectará al enviar');

  return (
    <aside
      id="hyperion-chat-panel"
      className="live-chat-page"
      data-testid="live-chat-page"
      aria-labelledby="live-chat-title"
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="live-chat-toolbar">
        <div className="live-chat-heading">
          <MessageSquareText size={18} aria-hidden="true" />
          <h2 id="live-chat-title">{t('Chat con Hyperion')}</h2>
          <span
            className="live-chat-status"
            data-testid="live-chat-status"
            role="status"
          >
            {runtimeLabel}
          </span>
        </div>
        <div className="live-chat-toolbar-actions">
          <button
            type="button"
            className="live-chat-icon-button"
            aria-label={t('Cerrar chat')}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <section
        className="live-chat-context"
        aria-label={t('Contexto del chat')}
      >
        <label htmlFor="live-chat-context">{t('Trabajar en')}</label>
        <select
          id="live-chat-context"
          data-testid="live-chat-context"
          value={runId ?? ''}
          disabled={contextLocked}
          aria-describedby="live-chat-context-help"
          onChange={(event) => changeContext(event.target.value || null)}
        >
          {runId && runId !== canvasRunId && (
            <option value={runId}>{context.title || runId}</option>
          )}
          {canvasRunId && (
            <option value={canvasRunId}>
              {t('Flujo actual')}: {runTitle || canvasRunId}
            </option>
          )}
          <option value="">{t('Nuevo workflow')}</option>
        </select>
        <p
          id="live-chat-context-help"
          className={
            contextLocked || runId !== canvasRunId
              ? 'live-chat-context-notice'
              : undefined
          }
        >
          {contextLocked
            ? t(
                'El contexto permanece fijo hasta terminar el turno y resolver sus permisos.',
              )
            : runId
              ? runId !== canvasRunId
                ? t(
                    'Este chat sigue vinculado a otro flujo. Cambia el contexto para trabajar en el canvas actual.',
                  )
                : t('Los mensajes se envían al flujo seleccionado.')
              : t(
                  'Describe lo que quieres crear. Hyperion puede iniciar un workflow nuevo.',
                )}
        </p>
      </section>
      <section
        ref={threadRef}
        className="live-chat-thread"
        data-testid="live-chat-thread"
        role="log"
        tabIndex={0}
        aria-label={t('Conversación')}
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const node = threadRef.current;
          if (node)
            followBottom.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        <div className="live-chat-transcript">
          {thread.length === 0 && (
            <div className="live-chat-empty">
              <p>
                {t(
                  'Conversa con tu IA local y lleva el trabajo al canvas de Hyperion.',
                )}
              </p>
              <div className="live-chat-suggestions">
                {(runId
                  ? ['Resume este flujo', '¿Cuál es el siguiente paso?']
                  : ['Ayúdame a crear un workflow']
                ).map((text) => (
                  <button
                    className="live-chat-suggestion"
                    type="button"
                    key={text}
                    onClick={() => {
                      setPrompt(t(text));
                      promptRef.current?.focus();
                    }}
                  >
                    {t(text)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {groupTranscript(thread).map((group) => {
            if (group.kind === 'activity')
              return <ActivityGroup key={group.id} items={group.items} />;
            const message = group.message;
            if (message.approvalToken && message.approvalState)
              return (
                <details
                  key={message.id}
                  className="live-chat-permission-history"
                  data-testid="live-chat-permission-history"
                >
                  <summary data-permission-token={message.approvalToken}>
                    {t(message.meta || 'Permiso del proveedor')}
                  </summary>
                  <p>{permissionLabel(message)}</p>
                  {message.toolName && <code>{message.toolName}</code>}
                </details>
              );
            return (
              <article
                key={message.id}
                className={`live-chat-message ${message.role}`}
                data-testid={`live-chat-message-${message.role}`}
              >
                <p className="live-chat-message-role">
                  {message.role === 'you'
                    ? t('Tú')
                    : message.role === 'assistant'
                      ? message.provider || harnessLabel
                      : t('Hyperion')}
                  {message.meta ? ` · ${t(message.meta)}` : ''}
                </p>
                <p>
                  {message.approvalToken
                    ? permissionLabel(message)
                    : message.text}
                </p>
                {message.approvalToken && message.toolName && (
                  <code className="live-chat-permission-tool">
                    {message.toolName}
                  </code>
                )}
                {message.approvalToken && !message.approvalState && (
                  <>
                    {permissionMode === 'auto' && (
                      <p className="live-chat-permission-hint">
                        {t('Esta acción todavía requiere tu permiso.')}
                      </p>
                    )}
                    <div className="live-chat-message-actions">
                      <button
                        type="button"
                        className="primary"
                        data-testid="live-chat-approval-allow"
                        disabled={requestBusy}
                        onClick={() =>
                          void decide(message.approvalToken!, 'allow')
                        }
                      >
                        {t('Permitir para esta acción')}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        data-testid="live-chat-approval-deny"
                        disabled={requestBusy}
                        onClick={() =>
                          void decide(message.approvalToken!, 'deny')
                        }
                      >
                        {t('Denegar')}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <div className="live-chat-bottom">
        {(setupMessage || notice || !serviceOnline) && (
          <div className="live-chat-notice" role="status">
            <p>{setupMessage || notice || t('Servicio local sin conexión')}</p>
            {authRequired && <code>{LOGIN_COMMANDS[selectedHarness]}</code>}
            {setupMessage && (
              <button
                type="button"
                className="secondary"
                disabled={!canConnect}
                onClick={() => void connect()}
              >
                {t('Reintentar')}
              </button>
            )}
            {(setupMessage || !serviceOnline) && (
              <button
                type="button"
                className="secondary"
                data-testid="live-chat-open-connections"
                onClick={onOpenConnections}
              >
                {t('Abrir conexiones')}
              </button>
            )}
            {uncertain && (
              <button
                type="button"
                className="secondary"
                data-testid="live-chat-resolve-uncertain"
                disabled={requestBusy}
                onClick={() => void resolveUncertain()}
              >
                {t('Resolver turno incierto')}
              </button>
            )}
          </div>
        )}
        <section
          className="live-chat-composer"
          aria-label={t('Escribir mensaje')}
        >
          <label className="form-sr-only" htmlFor="live-chat-prompt">
            {t('Petición para el agente')}
          </label>
          <textarea
            ref={promptRef}
            id="live-chat-prompt"
            rows={2}
            maxLength={8000}
            value={prompt}
            disabled={!liveChat}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (canSend) void send();
              }
            }}
            placeholder={t('Escribe tu mensaje…')}
          />
          <div className="live-chat-composer-actions">
            <div
              ref={harnessPickerRef}
              className="live-chat-harness-picker"
              data-testid="live-chat-harness"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && harnessMenuOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setHarnessMenuOpen(false);
                  harnessTriggerRef.current?.focus();
                }
              }}
            >
              <button
                ref={harnessTriggerRef}
                type="button"
                className="live-chat-harness-trigger"
                data-testid="live-chat-harness-trigger"
                aria-haspopup="menu"
                aria-expanded={harnessMenuOpen}
                aria-controls="live-chat-harness-menu"
                aria-label={`${t('Elige la IA local')}: ${harnessLabel} (${harnessStatusLabel(harnessStatus)})`}
                disabled={!liveChat?.selectHarness || contextLocked}
                onClick={() => setHarnessMenuOpen((isOpen) => !isOpen)}
              >
                <HarnessMark id={selectedHarness} />
                <span className="live-chat-harness-trigger-label">
                  {harnessLabel}
                </span>
                <HarnessStatusDot status={harnessStatus} />
                <ChevronDown
                  className="live-chat-harness-trigger-chevron"
                  size={15}
                  aria-hidden="true"
                />
              </button>
              {harnessMenuOpen && (
                <div
                  id="live-chat-harness-menu"
                  className="live-chat-harness-menu"
                  data-testid="live-chat-harness-menu"
                  role="menu"
                  aria-label={t('Elige la IA local')}
                >
                  {harnesses.map((harness) => {
                    const selected = harness.id === selectedHarness;
                    return (
                      <button
                        key={harness.id}
                        type="button"
                        className={`live-chat-harness-option ${selected ? 'selected' : ''}`}
                        data-testid={`live-chat-harness-${harness.id}`}
                        role="menuitemradio"
                        aria-checked={selected}
                        disabled={!liveChat?.selectHarness || contextLocked}
                        onClick={() => void selectHarness(harness.id)}
                      >
                        <HarnessMark id={harness.id} />
                        <span className="live-chat-harness-option-copy">
                          <span>{harness.label}</span>
                        </span>
                        <HarnessStatus status={harness.status} />
                        {selected && <Check size={15} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {liveChat?.getPermissionMode && liveChat?.setPermissionMode && (
              <PermissionModePicker
                mode={permissionMode}
                busy={modeBusy}
                onChange={changePermissionMode}
              />
            )}
            <span className="live-chat-shortcut">
              {t('Enter para enviar · Shift+Enter para nueva línea')}
            </span>
            {turnRunning ? (
              <button
                type="button"
                className="primary live-chat-send"
                aria-label={t('Detener')}
                data-testid="live-chat-stop"
                disabled={requestBusy}
                onClick={() => void stop()}
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="primary live-chat-send"
                aria-label={t('Enviar mensaje')}
                data-testid="live-chat-send"
                disabled={!canSend}
                onClick={() => void send()}
              >
                <Send size={17} />
              </button>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
