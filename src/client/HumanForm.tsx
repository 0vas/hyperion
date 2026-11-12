import { t, useLocale } from './i18n';
import { Check, LoaderCircle } from 'lucide-react';
import type { ContinuationState } from '../domain/continuation';
import type { Step } from '../domain/workflow';
import { DecisionFields } from './DecisionFields';
import { fieldError } from './decision-form';
export function HumanForm({
  step,
  answer,
  onAnswer,
  values,
  onValues,
  busy,
  online,
  agentWaiting,
  continuation,
  onSubmit,
  onReject,
  mode = 'decide',
  amendBlocked,
  onCancelAmend,
}: {
  step: Step;
  answer: string;
  onAnswer: (answer: string) => void;
  values: Record<string, string>;
  onValues: (values: Record<string, string>) => void;
  busy: boolean;
  online: boolean;
  agentWaiting: boolean;
  continuation?: ContinuationState;
  onSubmit: () => void;
  onReject: () => void;
  mode?: 'decide' | 'amend';
  amendBlocked?: string;
  onCancelAmend?: () => void;
}) {
  useLocale();
  const amending = mode === 'amend';
  const manual = step.kind === 'manual';
  const ports = step.outputs || [];
  const question = amending
    ? t('Corregir la respuesta guardada')
    : step.interaction?.question ||
      (manual
        ? ports.length
          ? t('Completa lo necesario para continuar')
          : t('¿Qué necesitas para este paso?')
        : t('¿Apruebas este resultado?'));
  const context = amending
    ? t(
        'Los valores tipados se actualizarán. El historial conserva la respuesta anterior. Hyperion no deshace efectos externos del agente.',
      )
    : step.interaction?.context || step.description;
  const invalid =
    ports.some((p) => fieldError(p, values[p.name] || '')) ||
    (manual &&
      (ports.length
        ? !Object.values(values).some((v) => v.trim())
        : !answer.trim())) ||
    !!amendBlocked;
  return (
    <form
      className={`human-action${amending ? ' amending' : ''}`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid && !busy && online) onSubmit();
      }}
      aria-label={amending ? t('Corregir respuesta') : t('Tu decisión')}
    >
      <h3 className="action-title">{question}</h3>
      {context &&
        (context.length <= 160 ? (
          <p className="decision-context">{context}</p>
        ) : (
          <details className="decision-help">
            <summary>{t('Ver instrucciones')}</summary>
            <p>{context}</p>
          </details>
        ))}
      {ports.length > 0 && (
        <DecisionFields
          ports={ports}
          values={values}
          onChange={onValues}
          singleQuestion={!!step.interaction?.question}
        />
      )}
      {manual && !ports.length && (
        <div className="free-answer">
          <label htmlFor="human-answer">{t('Tu respuesta')}</label>
          <textarea
            id="human-answer"
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            maxLength={8000}
            rows={3}
            required
            placeholder={t('Describe lo que necesitas para este paso…')}
          />
        </div>
      )}
      {!manual && (
        <details className="optional-fields">
          <summary>
            {t('Añadir comentario')} <small>{t('Opcional')}</small>
          </summary>
          <label htmlFor="human-answer" className="form-sr-only">
            {t('Comentario (opcional al aprobar)')}
          </label>
          <textarea
            id="human-answer"
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            maxLength={8000}
            rows={2}
            placeholder={t('Añade contexto a tu decisión…')}
          />
        </details>
      )}
      <div className="decision-footer">
        <button
          type="submit"
          className="primary full"
          disabled={!!invalid || busy || !online}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {amending
            ? t('Guardar corrección')
            : manual
              ? ports.length
                ? t('Guardar elección')
                : t('Enviar respuesta')
              : t('Aprobar paso')}
        </button>
        {amendBlocked && (
          <p className="field-error" role="status">
            {amendBlocked}
          </p>
        )}
        {!online ? (
          <p className="field-error" role="status">
            {t('Sin conexión. Tus respuestas siguen aquí.')}
          </p>
        ) : amending ? (
          <p className="decision-return">
            {t(
              'Si hay trabajo del agente ya completado, confirmarás la lista de efectos antes de guardar.',
            )}
          </p>
        ) : (
          <p className="decision-return">
            {continuation?.status === 'waiting'
              ? t(
                  'Pausa guardada. Tu respuesta se enviará al conector para continuar.',
                )
              : agentWaiting
                ? t(
                    'Agente conectado. Al confirmar, recibirá tu respuesta para continuar.',
                  )
                : t(
                    'No hay un agente esperando. Tu respuesta se guardará; si el chat terminó su turno, envíale la continuación.',
                  )}
          </p>
        )}
        {amending && onCancelAmend && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onCancelAmend}
          >
            {t('Cancelar corrección')}
          </button>
        )}
        {!manual && !amending && (
          <button
            type="button"
            className="text-button reject"
            disabled={busy || !online}
            onClick={onReject}
          >
            {t('Rechazar y detener este flujo')}
          </button>
        )}
      </div>
      {step.interaction?.next && (
        <details className="decision-help decision-next">
          <summary>{t('Qué sucede después')}</summary>
          <p>{step.interaction.next}</p>
        </details>
      )}
    </form>
  );
}
