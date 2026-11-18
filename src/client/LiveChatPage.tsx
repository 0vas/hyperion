import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquareText, Send, Square } from 'lucide-react';
import { t, useLocale } from './i18n';

type ThreadMessage = {
  id: string;
  role: 'you' | 'system' | 'assistant';
  text: string;
  meta?: string;
  approvalToken?: string;
  approvalState?: 'allowed' | 'denied';
};

/**
 * Desktop-only, full-page projection of a single real Codex App Server thread.
 * It deliberately has no workflow-command or generic host API surface.
 */
export function LiveChatPage({
  runId,
  serviceOnline,
  busy = false,
  onBack,
}: {
  runId?: string;
  serviceOnline: boolean;
  busy?: boolean;
  onBack: () => void;
}) {
  useLocale();
  const liveChat = window.hyperionDesktop?.liveChat;
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [turnRunning, setTurnRunning] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const threadId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPrompt('');
    setStatus('disconnected');
    setTurnRunning(false);
    setUncertain(false);
    setSetupMessage(null);
    setNotice(null);
    setThread([]);
    threadId.current = null;
  }, [runId]);

  useEffect(() => {
    if (!liveChat) return;
    return liveChat.onEvent((value) => {
      const event = value as Record<string, unknown>;
      if (event.type === 'connection' && typeof event.status === 'string') {
        setStatus(event.status as typeof status);
        if (event.status === 'connected') {
          setUncertain(false);
          setSetupMessage(null);
        }
        if (event.status === 'disconnected') {
          setTurnRunning(false);
          if (typeof event.message === 'string') setSetupMessage(event.message);
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
          return [...items, { id: itemId, role: 'assistant', text: eventText }];
        });
        return;
      }
      if (event.type === 'turn' && typeof event.status === 'string') {
        if (event.status === 'running') setTurnRunning(true);
        else {
          setTurnRunning(false);
          setThread((items) =>
            items.map((item) =>
              item.role === 'assistant' && !item.meta
                ? { ...item, meta: String(event.status) }
                : item,
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
            text: t(
              'Codex solicita permiso para usar una acción acotada de Hyperion.',
            ),
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
                    event.decision === 'allowed' ? 'allowed' : 'denied',
                  meta:
                    event.decision === 'allowed'
                      ? t('Permitido para esta acción')
                      : t('Denegado'),
                }
              : item,
          ),
        );
      }
    });
  }, [liveChat, runId]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread]);

  const canConnect = Boolean(
    liveChat && runId && serviceOnline && !busy && !requestBusy,
  );
  const canSend = Boolean(
    liveChat &&
    runId &&
    serviceOnline &&
    status === 'connected' &&
    !turnRunning &&
    !requestBusy &&
    prompt.trim(),
  );

  async function connect() {
    if (!canConnect || !liveChat || !runId) return;
    setRequestBusy(true);
    setNotice(null);
    try {
      await liveChat.connect(runId);
    } catch {
      // Main deliberately redacts process errors. Never surface raw spawn output.
      setSetupMessage(
        t(
          'No se pudo iniciar Codex local. Revisa la aplicación seleccionada y reintenta.',
        ),
      );
      setStatus('disconnected');
    } finally {
      setRequestBusy(false);
    }
  }

  async function chooseCodex() {
    if (!liveChat || requestBusy) return;
    setRequestBusy(true);
    try {
      const result = await liveChat.chooseCodex();
      if (result.selected)
        setSetupMessage(
          t('Codex seleccionado. Usa Reintentar para iniciar el hilo local.'),
        );
    } catch {
      setSetupMessage(
        t('No se pudo guardar la aplicación de Codex seleccionada.'),
      );
    } finally {
      setRequestBusy(false);
    }
  }

  async function send() {
    if (!canSend || !liveChat || !runId) return;
    setRequestBusy(true);
    try {
      await liveChat.send(runId, prompt.trim());
      setPrompt('');
    } catch {
      setNotice(t('No se pudo enviar el mensaje a Codex.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function stop() {
    if (!liveChat || !runId || !turnRunning || requestBusy) return;
    setRequestBusy(true);
    try {
      await liveChat.stop(runId);
    } catch {
      setNotice(t('No se pudo detener el turno de Codex.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function decide(token: string, decision: 'allow' | 'deny') {
    if (!liveChat || !runId || requestBusy) return;
    setRequestBusy(true);
    try {
      await liveChat.approve(runId, token, decision);
    } catch {
      setNotice(t('No se pudo registrar el permiso de Codex.'));
    } finally {
      setRequestBusy(false);
    }
  }

  async function resolveUncertain() {
    if (!liveChat || !runId || requestBusy) return;
    setRequestBusy(true);
    try {
      await liveChat.resolveUncertain(runId);
      setUncertain(false);
      setNotice(
        t(
          'El turno incierto se marcó como no reanudable. Conecta Codex para iniciar un turno nuevo.',
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
    : status === 'connected'
      ? t('Codex conectado: hilo local activo para este flujo.')
      : status === 'connecting'
        ? t('Conectando Codex local…')
        : setupMessage ||
          t(
            'Codex no está conectado. Elige Conectar para iniciar un hilo local.',
          );

  return (
    <main className="live-chat-page" data-testid="live-chat-page">
      <section className="live-chat-hero" aria-labelledby="live-chat-title">
        <div>
          <p className="eyebrow">{t('Hyperion Desktop')}</p>
          <h1 id="live-chat-title">{t('Chat local de Codex')}</h1>
          <p>
            {t(
              'El hilo y las respuestas provienen del App Server local. El canvas conserva formularios, aprobaciones, cambios y confirmaciones irreversibles.',
            )}
          </p>
        </div>
        <button type="button" className="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t('Volver al canvas')}
        </button>
      </section>

      <section className="live-chat-runtime" aria-label={t('Estado del chat')}>
        <div>
          <span>{t('Servicio local')}</span>
          <strong>{serviceOnline ? t('Conectado') : t('Sin conexión')}</strong>
        </div>
        <div>
          <span>{t('Codex local')}</span>
          <strong data-testid="live-chat-status">{runtimeLabel}</strong>
        </div>
        <div className="live-chat-runtime-actions">
          <button
            type="button"
            className="secondary"
            data-testid="live-chat-choose-codex"
            disabled={!liveChat || requestBusy}
            onClick={() => void chooseCodex()}
          >
            {t('Elegir aplicación Codex')}
          </button>
          <button
            type="button"
            className="primary"
            data-testid="live-chat-connect"
            disabled={!canConnect}
            onClick={() => void (uncertain ? resolveUncertain() : connect())}
          >
            <MessageSquareText size={16} />
            {t(
              uncertain
                ? 'Resolver turno incierto'
                : setupMessage
                  ? 'Reintentar Codex local'
                  : 'Conectar Codex local',
            )}
          </button>
        </div>
      </section>

      {setupMessage && (
        <p className="live-chat-notice" role="status">
          {setupMessage}
        </p>
      )}
      {!runId && (
        <p className="live-chat-notice" role="status">
          {t('Abre un flujo para conectar un hilo local de Codex.')}
        </p>
      )}

      <section
        ref={threadRef}
        className="live-chat-thread"
        data-testid="live-chat-thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {thread.length === 0 && (
          <p className="live-chat-empty">
            {t(
              'Conecta Codex local para crear un hilo real de este flujo. Un turno sin estado terminal después de reiniciar requiere resolución explícita.',
            )}
          </p>
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
                  ? t('Codex')
                  : t('Hyperion')}
              {message.meta ? ` · ${message.meta}` : ''}
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
      </section>

      <section className="live-chat-composer">
        <label className="form-sr-only" htmlFor="live-chat-prompt">
          {t('Petición para el agente')}
        </label>
        <textarea
          id="live-chat-prompt"
          rows={4}
          maxLength={8000}
          value={prompt}
          disabled={status !== 'connected' || turnRunning || requestBusy}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('Usa Hyperion para…')}
        />
        <p className="field-hint">
          {t(
            'Este chat no responde formularios humanos ni aprueba, modifica o confirma efectos irreversibles. Detener interrumpe el turno real de Codex.',
          )}
        </p>
        {notice && (
          <p className="live-chat-notice" role="status">
            {notice}
          </p>
        )}
        <div className="live-chat-composer-actions">
          {turnRunning && (
            <button
              type="button"
              className="secondary"
              data-testid="live-chat-stop"
              disabled={requestBusy}
              onClick={() => void stop()}
            >
              <Square size={16} />
              {t('Detener')}
            </button>
          )}
          <button
            type="button"
            className="primary"
            data-testid="live-chat-send"
            disabled={!canSend}
            onClick={() => void send()}
          >
            <Send size={16} />
            {t('Enviar a Codex')}
          </button>
        </div>
      </section>
    </main>
  );
}
