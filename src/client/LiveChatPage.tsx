import { useEffect, useRef, useState } from 'react';
import { X, MessageSquareText, Send, Square, Settings2 } from 'lucide-react';
import { t, useLocale } from './i18n';

type ThreadMessage = {
  id: string;
  role: 'you' | 'system' | 'assistant';
  text: string;
  meta?: string;
  approvalToken?: string;
  approvalState?: 'allowed' | 'denied' | 'expired';
  provider?: string;
};

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

type ChatContext = { runId: string | null; title?: string };
type Conversation = { prompt: string; thread: ThreadMessage[] };

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
  onActivityChange,
}: {
  runId?: string;
  runTitle?: string;
  open: boolean;
  serviceOnline: boolean;
  busy?: boolean;
  onClose: () => void;
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
  const [uncertain, setUncertain] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [harnesses, setHarnesses] = useState<Harness[]>([
    { id: 'codex', label: 'Codex', status: 'unknown' },
  ]);
  const [selectedHarness, setSelectedHarness] = useState('codex');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const threadId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmitted = useRef('');

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
    turnRunning ||
    pendingApproval ||
    uncertain ||
    status === 'connecting';
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
    if (!liveChat) return;
    return liveChat.onEvent((value) => {
      const event = value as Record<string, unknown>;
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
          setTurnRunning(false);
          setThread((items) => items.map(expirePermission));
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
        setThread((items) => [
          ...items,
          { id: crypto.randomUUID(), role: 'you', text: eventText },
        ]);
        return;
      }
      if (event.type === 'assistant-delta' && eventText !== null) {
        const itemId =
          typeof event.itemId === 'string' ? event.itemId : 'assistant';
        setThread((items) => {
          const last = items.at(-1);
          if (last?.role === 'assistant' && last.id === itemId)
            return [
              ...items.slice(0, -1),
              { ...last, text: last.text + eventText },
            ];
          return [
            ...items,
            {
              id: itemId,
              role: 'assistant',
              text: eventText,
              provider: PROVIDER_LABELS[selectedHarness] || selectedHarness,
            },
          ];
        });
        return;
      }
      if (event.type === 'turn' && typeof event.status === 'string') {
        if (event.status === 'running') setTurnRunning(true);
        else {
          setTurnRunning(false);
          if (event.status === 'completed') lastSubmitted.current = '';
          setThread((items) =>
            items.map((item) =>
              item.role === 'assistant' &&
              !item.meta &&
              event.status !== 'completed'
                ? { ...item, meta: String(event.status) }
                : expirePermission(item),
            ),
          );
        }
        return;
      }
      const eventLabel = typeof event.label === 'string' ? event.label : null;
      if (event.type === 'action' && eventLabel !== null) {
        setThread((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: 'system',
            text: eventLabel,
            meta: String(event.status || 'running'),
          },
        ]);
        return;
      }
      const approvalToken =
        typeof event.token === 'string' ? event.token : null;
      if (event.type === 'approval' && approvalToken !== null) {
        setThread((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: 'system',
            text:
              eventLabel ||
              t('El proveedor solicita permiso para esta acción.'),
            meta: t('Permiso del proveedor'),
            approvalToken,
          },
        ]);
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
  const harnessLabel =
    harnesses.find((harness) => harness.id === selectedHarness)?.label ||
    'Codex';

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

  async function chooseExecutable() {
    if (!liveChat || contextLocked) return;
    const choose = liveChat.chooseExecutable || liveChat.chooseCodex;
    if (!choose) return;
    setRequestBusy(true);
    try {
      const result = await choose();
      if (result.selected)
        setSetupMessage(
          t('{0} seleccionado. Usa Reintentar para iniciar el hilo local.', {
            0: harnessLabel,
          }),
        );
    } catch {
      setSetupMessage(
        t('No se pudo guardar la aplicación del harness seleccionada.'),
      );
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

  async function decide(token: string, decision: 'allow' | 'deny') {
    if (!liveChat || requestBusy) return;
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
      : turnRunning
        ? t('Trabajando…')
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
            className="secondary live-chat-icon-button"
            aria-label={t('Opciones de conexión')}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={17} />
          </button>
          <button
            type="button"
            className="secondary live-chat-icon-button"
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
        <p id="live-chat-context-help">
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
      {settingsOpen && (
        <section
          className="live-chat-settings"
          aria-label={t('Opciones de conexión')}
        >
          <span>{t('Usa el proveedor instalado en tu equipo.')}</span>
          <button
            type="button"
            className="secondary"
            data-testid="live-chat-choose-executable"
            disabled={!liveChat || contextLocked}
            onClick={() => void chooseExecutable()}
          >
            {t('Elegir ejecutable')}
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="live-chat-connect"
            disabled={!canConnect || turnRunning}
            onClick={() => void (uncertain ? resolveUncertain() : connect())}
          >
            {uncertain ? t('Resolver turno incierto') : t('Reconectar')}
          </button>
        </section>
      )}
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
              <span className="live-chat-empty-symbol">
                <MessageSquareText size={25} />
              </span>
              <h2>{t('¿Qué quieres hacer?')}</h2>
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
                    className="secondary"
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
          {thread.map((message) => (
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
              <p>{message.text}</p>
              {message.approvalToken && !message.approvalState && (
                <div className="live-chat-message-actions">
                  <button
                    type="button"
                    className="primary"
                    data-testid="live-chat-approval-allow"
                    disabled={requestBusy}
                    onClick={() => void decide(message.approvalToken!, 'allow')}
                  >
                    {t('Permitir para esta acción')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    data-testid="live-chat-approval-deny"
                    disabled={requestBusy}
                    onClick={() => void decide(message.approvalToken!, 'deny')}
                  >
                    {t('Denegar')}
                  </button>
                </div>
              )}
            </article>
          ))}
          {turnRunning && (
            <p className="live-chat-working" role="status">
              {harnessLabel} · {t('Trabajando…')}
            </p>
          )}
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
            <label className="form-sr-only" htmlFor="live-chat-harness">
              {t('Proveedor')}
            </label>
            <select
              id="live-chat-harness"
              data-testid="live-chat-harness"
              value={selectedHarness}
              disabled={!liveChat?.selectHarness || contextLocked}
              onChange={(event) => void selectHarness(event.target.value)}
            >
              {harnesses.map((harness) => (
                <option key={harness.id} value={harness.id}>
                  {harness.label}
                  {harness.status === 'missing'
                    ? ` · ${t('No instalado')}`
                    : ''}
                </option>
              ))}
            </select>
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
        <p className="live-chat-footnote">
          {t(
            'Las decisiones y aprobaciones del flujo se realizan en el canvas.',
          )}
        </p>
      </div>
    </aside>
  );
}
