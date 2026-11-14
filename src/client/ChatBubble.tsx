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

type ThreadMessage = {
  id: string;
  role: 'you' | 'system';
  text: string;
  meta?: string;
};

/**
 * Desktop-only floating chat bubble (thread + composer cut).
 * Hyperion-known handoffs only — no harness streaming, no LLM, no human commands.
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
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const panelId = useId();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const options = bubbleConnectionOptions(inventory);
  const pickerReady = options.length > 0;
  const hostConnector =
    resumeConnector !== undefined ? resumeConnector : readHostResumeConnector();

  useEffect(() => {
    if (!selected) return;
    if (!options.some((row) => row.id === selected)) setSelected('');
  }, [options, selected]);

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
              {t(
                'Hyperion no despierta un chat cerrado al terminar el turno. Las decisiones tipadas se toman en el canvas. Aquí solo aparecen handoffs que Hyperion conoce — sin fabricar respuestas del agente.',
              )}
            </p>

            {thread.length === 0 && !outboundStatusLabel && (
              <p className="chat-bubble-empty" data-testid="chat-bubble-empty">
                {t(
                  'Todavía no hay handoffs registrados en este panel. Escribe abajo: Copiar pega en tu chat; Enviar solo con conector real. Configurado no implica herramientas cargadas.',
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
                  {message.role === 'you' ? t('Tú') : t('Hyperion')}
                  {message.meta ? ` · ${message.meta}` : ''}
                </p>
                <p className="chat-bubble-msg-body">{message.text}</p>
              </article>
            ))}

            {outboundStatusLabel && (
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
                  <option key={row.id} value={row.id} data-status={row.status}>
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
              {t(
                'Copiar no equivale a entregar. Enviar solo con conector de envío que coincida y un flujo abierto; MCP solo no despierta el chat. Este panel no aprueba, corrige ni confirma efectos irreversibles.',
              )}
            </p>

            <div className="chat-bubble-actions">
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
              {sendEnabled ? (
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
              )}
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
