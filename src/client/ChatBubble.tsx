import { useEffect, useId, useRef, useState } from 'react';
import { Copy, MessageSquareText, Send, X } from 'lucide-react';
import { t, useLocale } from './i18n';
import { connectionStatusLabel, type ConnectionInventory } from './Connections';
import {
  bubbleConnectionOptionLabel,
  bubbleConnectionOptions,
} from './chat-bubble-picker';
import {
  bubbleSendBlockedReason,
  buildBubbleHandoffText,
  canBubbleCopy,
  canBubbleSend,
} from './chat-bubble-handoff';
import { readHostResumeConnector } from './host-resume-connector';
import type { OutboundPromptState } from '../domain/outbound-prompt';
import {
  isOutboundReceiptStatus,
  outboundReceiptKey,
  outboundReceiptMessage,
} from './chat-bubble-outbound-receipt';

type ThreadMessage = {
  id: string;
  role: 'you' | 'system' | 'assistant';
  text: string;
  meta?: string;
  approvalToken?: string;
  approvalState?: 'allowed' | 'denied';
};

/**
 * Desktop-only floating chat bubble (thread + composer cut).
 * Shows either honest cooperative handoffs or a Desktop-owned live Codex thread.
 * Human commands always remain on the canvas.
 */
export function ChatBubble({
  reduceMotion = false,
  runUrl,
  runId,
  runCoordinator,
  disabled = false,
  inventory = null,
  resumeConnector,
  outboundPrompt,
  busy = false,
  onEnqueueOutbound,
  onNotice,
  onError,
}: {
  reduceMotion?: boolean;
  runUrl?: string;
  runId?: string;
  runCoordinator?: string;
  disabled?: boolean;
  inventory?: ConnectionInventory | null;
  /** Host ResumeConnector; defaults to Desktop bridge when omitted. */
  resumeConnector?: unknown;
  /** Public outbound projection from the open run — never invents assistant text. */
  outboundPrompt?: OutboundPromptState | null;
  busy?: boolean;
  onEnqueueOutbound?: (text: string) => Promise<void>;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [liveTurn, setLiveTurn] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveUncertain, setLiveUncertain] = useState(false);
  const [liveSetupMessage, setLiveSetupMessage] = useState<string | null>(null);
  const liveThreadId = useRef<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const panelId = useId();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const lastReceiptKey = useRef<string | null>(null);
  const options = bubbleConnectionOptions(inventory);
  const pickerReady = options.length > 0;
  const hostConnector =
    resumeConnector !== undefined ? resumeConnector : readHostResumeConnector();
  const liveChat = window.hyperionDesktop?.liveChat;
  const liveMode = Boolean(liveChat && runId);

  useEffect(() => {
    setThread([]);
    lastReceiptKey.current = null;
    setLiveStatus('disconnected');
    setLiveTurn(false);
    setLiveUncertain(false);
    setLiveSetupMessage(null);
    liveThreadId.current = null;
  }, [runId]);

  useEffect(() => {
    if (!liveChat) return;
    return liveChat.onEvent((value) => {
      const event = value as Record<string, unknown>;
      if (event.type === 'connection' && typeof event.status === 'string') {
        setLiveStatus(event.status as typeof liveStatus);
        if (event.status === 'disconnected') setLiveTurn(false);
        if (event.status === 'connected') setLiveUncertain(false);
        if (event.status === 'connected') setLiveSetupMessage(null);
        if (
          event.status === 'disconnected' &&
          typeof event.message === 'string'
        )
          setLiveSetupMessage(event.message);
        return;
      }
      if (event.type === 'uncertain' && event.runId === runId) {
        setLiveUncertain(true);
        setThread((previous) => [
          ...previous,
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
        liveThreadId.current = event.threadId;
        return;
      }
      const eventThreadId =
        typeof event.threadId === 'string' ? event.threadId : null;
      if (!eventThreadId || eventThreadId !== liveThreadId.current) return;
      const eventText = event.text;
      if (event.type === 'user-message' && typeof eventText === 'string') {
        setThread((previous) => [
          ...previous,
          { id: crypto.randomUUID(), role: 'you', text: eventText },
        ]);
        return;
      }
      if (event.type === 'assistant-delta' && typeof event.text === 'string') {
        const itemId =
          typeof event.itemId === 'string' ? event.itemId : 'assistant';
        const text = event.text;
        setThread((previous) => {
          const last = previous.at(-1);
          if (last?.role === 'assistant' && last.id === itemId)
            return [
              ...previous.slice(0, -1),
              { ...last, text: last.text + text },
            ];
          return [...previous, { id: itemId, role: 'assistant', text }];
        });
        return;
      }
      if (event.type === 'turn' && typeof event.status === 'string') {
        if (event.status === 'running') setLiveTurn(true);
        else {
          setLiveTurn(false);
          setThread((previous) =>
            previous.map((message) =>
              message.role === 'assistant' && !message.meta
                ? { ...message, meta: String(event.status) }
                : message,
            ),
          );
        }
        return;
      }
      if (event.type === 'action' && typeof event.label === 'string') {
        const label = event.label;
        setThread((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: 'system',
            text: label,
            meta: String(event.status || 'running'),
          },
        ]);
        return;
      }
      if (event.type === 'approval' && typeof event.token === 'string') {
        const approvalToken = event.token;
        setThread((previous) => [
          ...previous,
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
        setThread((previous) =>
          previous.map((message) =>
            message.approvalToken === event.token
              ? {
                  ...message,
                  approvalState:
                    event.decision === 'allowed' ? 'allowed' : 'denied',
                  meta:
                    event.decision === 'allowed'
                      ? t('Permitido para esta acción')
                      : t('Denegado'),
                }
              : message,
          ),
        );
      }
    });
  }, [liveChat, runId]);

  useEffect(() => {
    if (!selected) return;
    if (!options.some((row) => row.id === selected)) setSelected('');
  }, [options, selected]);

  useEffect(() => {
    if (!outboundPrompt || !isOutboundReceiptStatus(outboundPrompt.status))
      return;
    const key = outboundReceiptKey(outboundPrompt);
    if (lastReceiptKey.current === key) return;
    lastReceiptKey.current = key;
    const text = t(outboundReceiptMessage(outboundPrompt), {
      0: outboundPrompt.harness,
      1: outboundPrompt.status,
    });
    setThread((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'system',
        text,
        meta: t('Recibo de entrega'),
      },
    ]);
  }, [outboundPrompt]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || !open) return;
    node.scrollTop = node.scrollHeight;
  }, [thread, outboundPrompt, open]);

  const selectedRow = options.find((row) => row.id === selected);
  const copyEnabled = canBubbleCopy(prompt, selected);
  const sendEnabled = canBubbleSend({
    prompt,
    selectedClientId: selected,
    selectedStatus: selectedRow?.status,
    resumeConnector: hostConnector,
    runId,
    runCoordinator,
  });
  const blockedReason = bubbleSendBlockedReason({
    prompt,
    selectedClientId: selected,
    selectedStatus: selectedRow?.status,
    resumeConnector: hostConnector,
    runId,
    runCoordinator,
  });

  function pushThread(entries: Omit<ThreadMessage, 'id'>[]) {
    setThread((prev) => [
      ...prev,
      ...entries.map((entry) => ({
        ...entry,
        id: crypto.randomUUID(),
      })),
    ]);
  }

  async function copyHandoff() {
    if (!copyEnabled || handoffBusy) return;
    const text = buildBubbleHandoffText({ prompt, runUrl, translate: t });
    try {
      await navigator.clipboard.writeText(text);
      const notice = t(
        'Petición copiada al portapapeles. Pégala en tu chat; Hyperion no avisó al agente.',
      );
      pushThread([
        {
          role: 'you',
          text: prompt.trim(),
          meta: t('Copiado al portapapeles'),
        },
        {
          role: 'system',
          text: notice,
        },
      ]);
      setPrompt('');
      onNotice?.(notice);
    } catch {
      onError?.(t('No se pudo copiar.'));
    }
  }

  async function sendHandoff() {
    if (!sendEnabled || !onEnqueueOutbound || handoffBusy || busy) return;
    const text = buildBubbleHandoffText({ prompt, runUrl, translate: t });
    const request = prompt.trim();
    setHandoffBusy(true);
    try {
      await onEnqueueOutbound(text);
      const notice = t(
        'Continuación encolada para el conector. Eso no significa que el agente haya ejecutado el trabajo.',
      );
      pushThread([
        {
          role: 'you',
          text: request,
          meta: t('Enviado al conector'),
        },
        {
          role: 'system',
          text: notice,
        },
      ]);
      setPrompt('');
      onNotice?.(notice);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo encolar el envío al chat.'),
      );
    } finally {
      setHandoffBusy(false);
    }
  }

  async function connectLiveChat() {
    if (!liveChat || !runId || liveBusy) return;
    setLiveBusy(true);
    try {
      await liveChat.connect(runId);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo conectar Codex.'),
      );
    } finally {
      setLiveBusy(false);
    }
  }

  async function chooseLiveCodex() {
    if (!liveChat || liveBusy) return;
    setLiveBusy(true);
    try {
      const result = await liveChat.chooseCodex();
      if (result.selected)
        setLiveSetupMessage(
          t('Codex seleccionado. Usa Reintentar para iniciar el hilo local.'),
        );
    } catch {
      onError?.(t('No se pudo guardar la aplicación de Codex seleccionada.'));
    } finally {
      setLiveBusy(false);
    }
  }

  async function sendLiveChat() {
    if (!liveChat || !runId || !prompt.trim() || liveTurn || liveBusy) return;
    setLiveBusy(true);
    try {
      const text = prompt.trim();
      await liveChat.send(runId, text);
      setPrompt('');
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo enviar el mensaje a Codex.'),
      );
    } finally {
      setLiveBusy(false);
    }
  }

  async function stopLiveChat() {
    if (!liveChat || !runId || !liveTurn || liveBusy) return;
    setLiveBusy(true);
    try {
      await liveChat.stop(runId);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo detener el turno de Codex.'),
      );
    } finally {
      setLiveBusy(false);
    }
  }

  async function decideProviderApproval(
    token: string,
    decision: 'allow' | 'deny',
  ) {
    if (!liveChat || !runId || liveBusy) return;
    setLiveBusy(true);
    try {
      await liveChat.approve(runId, token, decision);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo registrar el permiso de Codex.'),
      );
    } finally {
      setLiveBusy(false);
    }
  }

  async function resolveUncertainLiveTurn() {
    if (!liveChat || !runId || liveBusy) return;
    setLiveBusy(true);
    try {
      await liveChat.resolveUncertain(runId);
      setLiveUncertain(false);
      pushThread([
        {
          role: 'system',
          text: t(
            'El turno incierto se marcó como no reanudable. Conecta Codex para iniciar un turno nuevo.',
          ),
          meta: t('Resuelto localmente'),
        },
      ]);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t('No se pudo resolver el turno incierto de Codex.'),
      );
    } finally {
      setLiveBusy(false);
    }
  }

  const outboundStatusLabel = outboundPrompt
    ? outboundPrompt.status === 'queued'
      ? t('Outbound conocido: en cola para {0}', { 0: outboundPrompt.harness })
      : outboundPrompt.status === 'delivered'
        ? t(
            'Outbound conocido: entregado al conector {0} (no prueba ejecución)',
            {
              0: outboundPrompt.harness,
            },
          )
        : outboundPrompt.status === 'leased'
          ? t('Outbound conocido: reclamado por el conector {0}', {
              0: outboundPrompt.harness,
            })
          : outboundPrompt.status === 'failed'
            ? t('Outbound conocido: falló el envío al conector {0}', {
                0: outboundPrompt.harness,
              })
            : outboundPrompt.status === 'uncertain'
              ? t('Outbound conocido: entrega ambigua para {0}', {
                  0: outboundPrompt.harness,
                })
              : t('Outbound conocido: {0} · {1}', {
                  0: outboundPrompt.harness,
                  1: outboundPrompt.status,
                })
    : null;

  return (
    <div
      className={`chat-bubble${reduceMotion ? ' reduce-motion' : ''}${open ? ' open' : ''}`}
      data-testid="chat-bubble"
    >
      {open && (
        <section
          id={panelId}
          className="chat-bubble-panel chat-thread-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <header className="chat-bubble-header">
            <h2 id={titleId}>{t('Chat con tu IA')}</h2>
            <button
              ref={closeRef}
              type="button"
              className="icon-button"
              aria-label={t('Cerrar chat')}
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </header>

          <div
            ref={threadRef}
            className="chat-bubble-thread"
            data-testid="chat-bubble-thread"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            <p className="chat-bubble-honesty chat-bubble-thread-note">
              {liveMode
                ? t(
                    'Chat local en vivo con Codex. Las respuestas y acciones vienen del protocolo local; los permisos del proveedor se confirman aquí y el canvas conserva formularios, aprobaciones, cambios y confirmaciones irreversibles.',
                  )
                : t(
                    'Hyperion no despierta un chat cerrado al terminar el turno. Las decisiones tipadas se toman en el canvas. Aquí solo aparecen handoffs que Hyperion conoce — sin fabricar respuestas del agente.',
                  )}
            </p>

            {thread.length === 0 && (liveMode || !outboundStatusLabel) && (
              <p className="chat-bubble-empty" data-testid="chat-bubble-empty">
                {liveMode
                  ? liveStatus === 'connected'
                    ? t(
                        'Codex está conectado a este flujo. Envía un mensaje para iniciar un turno real.',
                      )
                    : t(
                        'Conecta Codex local para crear un hilo real de este flujo. Tras reiniciar Desktop, un turno sin estado terminal requiere resolución explícita.',
                      )
                  : t(
                      'Todavía no hay handoffs registrados en este panel. Escribe abajo: Copiar pega en tu chat; Enviar solo con conector real (Desktop: outbound-send.json, W1 clipboard-open o W2 harness-cli). Configurado no implica herramientas cargadas; MCP solo no despierta el chat.',
                    )}
              </p>
            )}

            {thread.map((message) => (
              <article
                key={message.id}
                className={`chat-bubble-msg ${message.role}`}
                data-testid={`chat-bubble-msg-${message.role}`}
              >
                <p className="chat-bubble-msg-role">
                  {message.role === 'you'
                    ? t('Tú')
                    : message.role === 'assistant'
                      ? t('Codex')
                      : t('Hyperion')}
                  {message.meta ? ` · ${message.meta}` : ''}
                </p>
                <p className="chat-bubble-msg-body">{message.text}</p>
                {message.approvalToken && !message.approvalState && (
                  <div className="chat-bubble-actions">
                    <button
                      type="button"
                      className="primary"
                      data-testid="live-chat-approval-allow"
                      disabled={liveBusy}
                      onClick={() =>
                        void decideProviderApproval(
                          message.approvalToken!,
                          'allow',
                        )
                      }
                    >
                      {t('Permitir para esta acción')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      data-testid="live-chat-approval-deny"
                      disabled={liveBusy}
                      onClick={() =>
                        void decideProviderApproval(
                          message.approvalToken!,
                          'deny',
                        )
                      }
                    >
                      {t('Denegar')}
                    </button>
                  </div>
                )}
              </article>
            ))}

            {!liveMode && outboundStatusLabel && (
              <article
                className="chat-bubble-msg system"
                data-testid="chat-bubble-outbound-status"
              >
                <p className="chat-bubble-msg-role">{t('Hyperion')}</p>
                <p className="chat-bubble-msg-body">{outboundStatusLabel}</p>
              </article>
            )}

            {runUrl && (
              <p className="chat-bubble-run thread-run">
                <span>{t('Canvas de este flujo')}</span>
                <a href={runUrl}>{runUrl}</a>
              </p>
            )}
          </div>

          <div
            className="chat-bubble-composer"
            data-testid="chat-bubble-composer"
          >
            {liveMode ? (
              <p
                className="field-hint"
                data-testid="live-chat-status"
                role="status"
              >
                {liveStatus === 'connected'
                  ? liveTurn
                    ? t(
                        'Codex está trabajando. Espera el estado terminal o usa Detener.',
                      )
                    : t('Codex conectado: hilo local activo para este flujo.')
                  : t(
                      liveUncertain
                        ? 'Un turno previo quedó incierto. Resuélvelo antes de iniciar un turno nuevo.'
                        : liveSetupMessage ||
                            'Codex no está conectado. Elige Conectar para iniciar un hilo local.',
                    )}
              </p>
            ) : (
              <div className="chat-bubble-composer-harness">
                <label className="form-sr-only" htmlFor={`${panelId}-harness`}>
                  {t('Conexión')}
                </label>
                <select
                  id={`${panelId}-harness`}
                  data-testid="chat-bubble-harness"
                  disabled={!pickerReady}
                  aria-describedby={`${panelId}-harness-hint`}
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">
                    {pickerReady
                      ? t('Elige una conexión')
                      : t('Cargando conexiones…')}
                  </option>
                  {options.map((row) => (
                    <option
                      key={row.id}
                      value={row.id}
                      data-status={row.status}
                    >
                      {bubbleConnectionOptionLabel(row, t)}
                    </option>
                  ))}
                </select>
                <p id={`${panelId}-harness-hint`} className="field-hint">
                  {selectedRow
                    ? t(
                        'Estado en Conexiones: {0}. Configurado localmente no implica herramientas cargadas en el chat.',
                        { 0: t(connectionStatusLabel(selectedRow.status)) },
                      )
                    : t(
                        'Configurado en Conexiones no implica herramientas cargadas en el chat. Ninguna fila se lista como conectada.',
                      )}
                </p>
              </div>
            )}

            <label className="form-sr-only" htmlFor={`${panelId}-prompt`}>
              {t('Petición para el agente')}
            </label>
            <textarea
              id={`${panelId}-prompt`}
              rows={3}
              maxLength={8000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('Usa Hyperion para…')}
            />

            <p className="chat-bubble-defer" role="status">
              {liveMode
                ? t(
                    'Este chat no responde formularios humanos ni aprueba, modifica o confirma efectos irreversibles. Detener interrumpe el turno real de Codex.',
                  )
                : t(
                    'Copiar no equivale a entregar. Enviar solo con conector de envío que coincida y un flujo abierto; MCP solo no despierta el chat. Este panel no aprueba, corrige ni confirma efectos irreversibles.',
                  )}
            </p>

            <div className="chat-bubble-actions">
              {liveMode ? (
                liveStatus === 'connected' ? (
                  <>
                    <button
                      type="button"
                      className="secondary full"
                      data-testid="live-chat-stop"
                      disabled={!liveTurn || liveBusy}
                      onClick={() => void stopLiveChat()}
                    >
                      <X size={16} />
                      {t('Detener')}
                    </button>
                    <button
                      type="button"
                      className="primary full"
                      data-testid="live-chat-send"
                      disabled={!prompt.trim() || liveTurn || liveBusy}
                      onClick={() => void sendLiveChat()}
                    >
                      <Send size={16} />
                      {t('Enviar a Codex')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="primary full"
                      data-testid="live-chat-connect"
                      disabled={!runId || busy || liveBusy}
                      onClick={() =>
                        void (liveUncertain
                          ? resolveUncertainLiveTurn()
                          : connectLiveChat())
                      }
                    >
                      <MessageSquareText size={16} />
                      {t(
                        liveUncertain
                          ? 'Resolver turno incierto'
                          : liveSetupMessage
                            ? 'Reintentar Codex local'
                            : 'Conectar Codex local',
                      )}
                    </button>
                    {!liveUncertain && (
                      <button
                        type="button"
                        className="secondary full"
                        data-testid="live-chat-choose-codex"
                        disabled={liveBusy}
                        onClick={() => void chooseLiveCodex()}
                      >
                        {t('Elegir aplicación Codex')}
                      </button>
                    )}
                  </>
                )
              ) : (
                <button
                  type="button"
                  className="secondary full"
                  data-testid="chat-bubble-copy"
                  disabled={!copyEnabled || handoffBusy}
                  onClick={() => void copyHandoff()}
                >
                  <Copy size={16} />
                  {t('Copiar petición para el chat')}
                </button>
              )}
              {!liveMode &&
                (sendEnabled ? (
                  <button
                    type="button"
                    className="primary full"
                    data-testid="chat-bubble-send"
                    disabled={busy || handoffBusy}
                    onClick={() => void sendHandoff()}
                  >
                    <Send size={16} />
                    {t('Enviar')}
                  </button>
                ) : (
                  <p
                    className="field-hint"
                    data-testid="chat-bubble-send-hint"
                    role="status"
                  >
                    {t(
                      blockedReason ||
                        'Elige una conexión para el handoff cooperativo.',
                    )}
                  </p>
                ))}
            </div>
          </div>
        </section>
      )}

      <button
        ref={fabRef}
        type="button"
        className="chat-bubble-fab"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? t('Cerrar chat') : t('Abrir chat con tu IA')}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} /> : <MessageSquareText size={22} />}
      </button>
    </div>
  );
}
