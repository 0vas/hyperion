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

/**
 * Desktop-only floating chat bubble (slice 3: cooperative Copiar/Enviar).
 * No harness magic, no human commands, no LLM, no wake claims.
 */
export function ChatBubble({
  reduceMotion = false,
  runUrl,
  runId,
  runCoordinator,
  disabled = false,
  inventory = null,
  resumeConnector,
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
  const panelId = useId();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
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

  async function copyHandoff() {
    if (!copyEnabled || handoffBusy) return;
    const text = buildBubbleHandoffText({ prompt, runUrl, translate: t });
    try {
      await navigator.clipboard.writeText(text);
      onNotice?.(
        t(
          'Petición copiada al portapapeles. Pégala en tu chat; Hyperion no avisó al agente.',
        ),
      );
    } catch {
      onError?.(t('No se pudo copiar.'));
    }
  }

  async function sendHandoff() {
    if (!sendEnabled || !onEnqueueOutbound || handoffBusy || busy) return;
    const text = buildBubbleHandoffText({ prompt, runUrl, translate: t });
    setHandoffBusy(true);
    try {
      await onEnqueueOutbound(text);
      onNotice?.(
        t(
          'Continuación encolada para el conector. Eso no significa que el agente haya ejecutado el trabajo.',
        ),
      );
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

  return (
    <div
      className={`chat-bubble${reduceMotion ? ' reduce-motion' : ''}${open ? ' open' : ''}`}
      data-testid="chat-bubble"
    >
      {open && (
        <section
          id={panelId}
          className="chat-bubble-panel"
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

          <p className="chat-bubble-honesty">
            {t(
              'Hyperion no despierta un chat cerrado al terminar el turno. Las decisiones tipadas se toman en el canvas.',
            )}
          </p>

          <div className="chat-bubble-field">
            <label htmlFor={`${panelId}-harness`}>{t('Conexión')}</label>
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

          <div className="chat-bubble-field">
            <label htmlFor={`${panelId}-prompt`}>
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
          </div>

          {runUrl && (
            <p className="chat-bubble-run">
              <span>{t('Canvas de este flujo')}</span>
              <a href={runUrl}>{runUrl}</a>
            </p>
          )}

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
