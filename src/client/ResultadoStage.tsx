import { type ReactNode, useEffect, useId, useState } from 'react';
import { ArrowRightLeft, Layers3, ListTree, Package, X } from 'lucide-react';
import type { Run, Step, StepStatus } from '../domain/workflow';
import { Artifacts } from './Artifacts';
import { t, useLocale } from './i18n';
import { resolveStepEvidence } from './resultado-evidence';

export type ResultadoSection =
  'evidence' | 'detalle' | 'io' | 'logs' | 'artifacts';

type Props = {
  run: Run;
  step: Step;
  live: boolean;
  statusLabel: string;
  StatusIcon: (props: { status: StepStatus; size?: number }) => ReactNode;
  section: ResultadoSection;
  onSection: (section: ResultadoSection) => void;
  onClose: () => void;
  waitingForm?: ReactNode;
  guidance?: ReactNode;
  detalle?: ReactNode;
  io?: ReactNode;
  logs?: ReactNode;
  reduceMotion?: boolean;
};

function EvidenceBody({
  runId,
  step,
  events,
  failed,
  running,
}: {
  runId: string;
  step: Step;
  events: Run['events'];
  failed: boolean;
  running: boolean;
}) {
  const evidence = resolveStepEvidence(step, events);
  if (evidence.kind === 'artifact' && evidence.artifact) {
    return (
      <div className="resultado-evidence">
        {evidence.extraArtifactCount > 0 && (
          <p className="muted resultado-extra">
            {t('+{0} archivos', { 0: evidence.extraArtifactCount })}
          </p>
        )}
        <Artifacts
          runId={runId}
          step={step}
          autoOpenId={evidence.artifact.id}
        />
      </div>
    );
  }
  if (evidence.kind === 'outputs' && evidence.outputs) {
    return (
      <div className="resultado-evidence">
        <h3>{t('Outputs · Salidas')}</h3>
        <pre className="resultado-outputs">
          {JSON.stringify(evidence.outputs, null, 2)}
        </pre>
      </div>
    );
  }
  if (evidence.kind === 'log' && evidence.logSummary) {
    return (
      <div className="resultado-evidence">
        <h3>{failed ? t('Error registrado') : t('Resultado registrado')}</h3>
        <p>{evidence.logSummary}</p>
      </div>
    );
  }
  if (failed) {
    return (
      <p className="muted resultado-empty">
        {t('Este paso falló. Revisa Logs o recupera la tarea.')}
      </p>
    );
  }
  if (running) {
    return (
      <p className="muted resultado-empty">
        {t('En curso · espera evidencia pública')}
      </p>
    );
  }
  return (
    <p className="muted resultado-empty">
      {t('Todavía no hay un resultado registrado para este paso.')}
    </p>
  );
}

export function ResultadoStage({
  run,
  step,
  live,
  statusLabel,
  StatusIcon,
  section,
  onSection,
  onClose,
  waitingForm,
  guidance,
  detalle,
  io,
  logs,
  reduceMotion = false,
}: Props) {
  useLocale();
  const titleId = useId();
  const waiting = step.status === 'waiting' && live;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  useEffect(() => {
    setSheetExpanded(waiting);
  }, [step.id, waiting]);

  const secondaryOpen =
    section === 'detalle' ||
    section === 'io' ||
    section === 'logs' ||
    section === 'artifacts';

  return (
    <aside
      className={`resultado-stage${reduceMotion ? ' reduce-motion' : ''}${sheetExpanded ? ' sheet-expanded' : ''}`}
      aria-labelledby={titleId}
      data-testid="resultado-stage"
    >
      <header className="resultado-header">
        <div className="resultado-heading">
          <p className="resultado-eyebrow">{t('Resultado')}</p>
          <h2 id={titleId}>{step.title}</h2>
          <span className={`status-tag ${step.status}`}>
            <StatusIcon status={step.status} />
            {statusLabel}
          </span>
        </div>
        <div className="resultado-header-actions">
          <button
            type="button"
            className="ghost-button resultado-sheet-toggle"
            onClick={() => setSheetExpanded((open) => !open)}
            aria-expanded={sheetExpanded}
          >
            {sheetExpanded ? t('Reducir panel') : t('Ampliar panel')}
          </button>
          <button
            type="button"
            className="modal-close icon-button"
            aria-label={t('Cerrar resultado')}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="resultado-body">
        {waiting && waitingForm && (
          <section
            className="resultado-waiting"
            aria-label={t('Tu turno en este paso')}
          >
            <p className="resultado-lead-in">{t('Tu turno en este paso')}</p>
            {waitingForm}
          </section>
        )}

        {guidance}
        {section === 'evidence' && (
          <EvidenceBody
            runId={run.id}
            step={step}
            events={run.events}
            failed={step.status === 'failed'}
            running={step.status === 'running'}
          />
        )}
        {section === 'artifacts' && <Artifacts runId={run.id} step={step} />}
        {section === 'io' && io}
        {section === 'logs' && logs}
        {section === 'detalle' && detalle}
      </div>

      <nav
        className="resultado-secondary"
        aria-label={t('Detalle del resultado')}
      >
        <button
          type="button"
          className={section === 'evidence' ? 'active' : ''}
          onClick={() => onSection('evidence')}
        >
          <Package size={15} />
          {t('Evidencia')}
        </button>
        <button
          type="button"
          className={section === 'detalle' ? 'active' : ''}
          aria-expanded={secondaryOpen && section === 'detalle'}
          onClick={() => onSection('detalle')}
        >
          <Layers3 size={15} />
          {t('Detalle')}
        </button>
        <button
          type="button"
          className={section === 'io' ? 'active' : ''}
          onClick={() => onSection('io')}
        >
          <ArrowRightLeft size={15} />
          I/O
        </button>
        <button
          type="button"
          className={section === 'logs' ? 'active' : ''}
          onClick={() => onSection('logs')}
        >
          <ListTree size={15} />
          Logs
        </button>
        {step.kind === 'agent' && (
          <button
            type="button"
            className={section === 'artifacts' ? 'active' : ''}
            onClick={() => onSection('artifacts')}
          >
            <Package size={15} />
            {t('Artefactos')}
          </button>
        )}
      </nav>
    </aside>
  );
}
