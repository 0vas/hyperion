import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  History,
  Layers3,
  ListTree,
  Package,
  X,
} from 'lucide-react';
import type { Run, Step, StepStatus } from '../domain/workflow';
import { Artifacts } from './Artifacts';
import { HarnessIcon } from './HarnessIcon';
import { t, useLocale } from './i18n';
import { resolveStepEvidence } from './resultado-evidence';
import {
  gatewayEvidenceForStep,
  gatewayRouteDisplayTitle,
} from './gateway-evidence';

export type ResultadoSection =
  'evidence' | 'detalle' | 'io' | 'logs' | 'artifacts' | 'actividad';

export type JobRollup = {
  id: string;
  title: string;
  completed: number;
  total: number;
  skipped: number;
  status: StepStatus;
  statusLabel: string;
  steps: Step[];
};

type Props = {
  run: Run;
  step?: Step;
  job?: JobRollup;
  live: boolean;
  statusLabel: string;
  StatusIcon: (props: { status: StepStatus; size?: number }) => ReactNode;
  section: ResultadoSection;
  onSection: (section: ResultadoSection) => void;
  onClose: () => void;
  onSelectStep?: (id: string) => void;
  waitingForm?: ReactNode;
  guidance?: ReactNode;
  detalle?: ReactNode;
  io?: ReactNode;
  logs?: ReactNode;
  eventLabels?: Record<string, string>;
  reduceMotion?: boolean;
};

function EvidenceBody({
  runId,
  step,
  steps,
  events,
  failed,
  running,
  statusLabel,
  onSelectStep,
}: {
  runId: string;
  step: Step;
  steps: Step[];
  events: Run['events'];
  failed: boolean;
  running: boolean;
  statusLabel: string;
  onSelectStep?: (id: string) => void;
}) {
  if (step.kind === 'gateway') {
    const gateway = gatewayEvidenceForStep(step, steps);
    if (gateway) {
      const typeLabel = t(
        gateway.type === 'parallel'
          ? 'Paralela'
          : gateway.type === 'exclusive'
            ? 'Exclusiva'
            : 'Inclusiva',
      );
      const routeLabel =
        gateway.direction === 'join'
          ? t('Rutas recibidas')
          : t('Rutas activadas');
      return (
        <section
          className="gateway-evidence resultado-evidence"
          data-testid="gateway-evidence"
        >
          <header>
            <p className="eyebrow">{t('Compuerta')}</p>
            <h3>{typeLabel}</h3>
          </header>
          <dl className="gateway-evidence-meta">
            <div>
              <dt>{t('Operación')}</dt>
              <dd>
                {gateway.direction === 'split'
                  ? t('División de rutas')
                  : t('Unión de rutas')}
              </dd>
            </div>
            <div>
              <dt>{t('Estado')}</dt>
              <dd>{statusLabel}</dd>
            </div>
          </dl>
          {gateway.decisionKnown ? (
            <p className="gateway-evidence-outcome">
              {t('Decisión registrada')}
            </p>
          ) : (
            <p className="muted gateway-evidence-outcome">
              {t(
                gateway.direction === 'join'
                  ? 'Sin decisión de ruta registrada'
                  : 'La decisión todavía no está registrada.',
              )}
            </p>
          )}
          {!!gateway.activeRoutes.length && (
            <GatewayRouteList
              heading={routeLabel}
              routes={gateway.activeRoutes}
              onSelectStep={onSelectStep}
            />
          )}
          {!!gateway.inactiveRoutes.length && (
            <GatewayRouteList
              heading={t('Rutas no tomadas')}
              routes={gateway.inactiveRoutes}
              onSelectStep={onSelectStep}
              muted
            />
          )}
          {!!gateway.observedValues.length && (
            <section className="gateway-evidence-observed">
              <h4>{t('Datos observados')}</h4>
              <ul>
                {gateway.observedValues.map((value, index) => (
                  <li key={`${value.stepTitle}:${index}`}>
                    <strong>{value.stepTitle}</strong>
                    <span>{t('Salida registrada')}</span>
                    {value.value !== undefined && (
                      <pre>{formatGatewayObservedValue(value.value)}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {step.result && (
            <details className="gateway-evidence-record">
              <summary>{t('Registro del motor')}</summary>
              <code>{step.result}</code>
            </details>
          )}
        </section>
      );
    }
  }
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

function formatGatewayObservedValue(value: boolean | number | null): string {
  if (value === true) return t('Sí');
  if (value === false) return t('No');
  return value === null ? '—' : String(value);
}

function GatewayRouteList({
  heading,
  routes,
  onSelectStep,
  muted = false,
}: {
  heading: string;
  routes: { id: string; title?: string }[];
  onSelectStep?: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <section className={`gateway-route-list${muted ? ' is-muted' : ''}`}>
      <h4>{heading}</h4>
      <ul>
        {routes.map((route) => (
          <li key={route.id}>
            {onSelectStep && route.title ? (
              <button type="button" onClick={() => onSelectStep(route.id)}>
                {route.title}
              </button>
            ) : (
              <span>
                {gatewayRouteDisplayTitle(route, t('Destino no disponible'))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepActividad({
  run,
  step,
  eventLabels,
}: {
  run: Run;
  step: Step;
  eventLabels: Record<string, string>;
}) {
  const events = run.events.filter((event) => event.stepId === step.id);
  return (
    <div className="resultado-actividad step-history">
      <h3>{t('Actividad de este paso')}</h3>
      {[...events].reverse().map((event) => (
        <div key={event.sequence}>
          <span className="history-dot" />
          <p>
            <strong>{eventLabels[event.type] || event.type}</strong>
            <small>
              <HarnessIcon name={event.actor} /> ·{' '}
              {new Date(event.at).toLocaleString()}
            </small>
            {event.message && <span>{event.message}</span>}
          </p>
        </div>
      ))}
      {!events.length && (
        <p className="muted">{t('Todavía no hay actividad registrada.')}</p>
      )}
    </div>
  );
}

export function ResultadoStage({
  run,
  step,
  job,
  live,
  statusLabel,
  StatusIcon,
  section,
  onSection,
  onClose,
  onSelectStep,
  waitingForm,
  guidance,
  detalle,
  io,
  logs,
  eventLabels = {},
  reduceMotion = false,
}: Props) {
  useLocale();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const waiting = !!step && step.status === 'waiting' && live;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  useEffect(() => {
    setSheetExpanded(waiting);
  }, [step?.id, job?.id, waiting]);
  useEffect(() => {
    closeRef.current?.focus();
  }, [step?.id, job?.id]);

  const title = step?.title || job?.title || t('Resultado');
  const status = step?.status || job?.status || 'ready';

  return (
    <aside
      className={`resultado-stage${reduceMotion ? ' reduce-motion' : ''}${sheetExpanded ? ' sheet-expanded' : ''}`}
      aria-labelledby={titleId}
      data-testid="resultado-stage"
    >
      <header className="resultado-header">
        <div className="resultado-heading">
          <p className="resultado-eyebrow">{t('Resultado')}</p>
          <h2 id={titleId}>{title}</h2>
          <span className={`status-tag ${status}`}>
            <StatusIcon status={status} />
            {statusLabel}
          </span>
        </div>
        <div className="resultado-header-actions">
          <button
            type="button"
            className="ghost-button resultado-back-canvas"
            onClick={onClose}
          >
            <ArrowLeft size={15} />
            {t('Volver al canvas')}
          </button>
          <button
            type="button"
            className="ghost-button resultado-sheet-toggle"
            onClick={() => setSheetExpanded((open) => !open)}
            aria-expanded={sheetExpanded}
          >
            {sheetExpanded ? t('Reducir panel') : t('Ampliar panel')}
          </button>
          <button
            ref={closeRef}
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

        {job && !step && (
          <div className="resultado-job-rollup">
            <p className="muted">
              {job.completed} {t('de')} {job.total} {t('pasos completados')}
              {job.skipped > 0 ? t(' · {0} omitidos', { 0: job.skipped }) : ''}
            </p>
            <progress
              aria-label={t('Progreso: {0}', { 0: job.title })}
              max={job.total}
              value={job.completed + job.skipped}
            />
            <ul className="resultado-job-children">
              {job.steps.map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onSelectStep?.(child.id)}
                  >
                    <span>{child.title}</span>
                    <span className={`status-tag ${child.status}`}>
                      <StatusIcon status={child.status} size={13} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step && section === 'evidence' && (
          <EvidenceBody
            runId={run.id}
            step={step}
            steps={run.steps}
            events={run.events}
            failed={step.status === 'failed'}
            running={step.status === 'running'}
            statusLabel={statusLabel}
            onSelectStep={onSelectStep}
          />
        )}
        {step && section === 'artifacts' && (
          <Artifacts runId={run.id} step={step} />
        )}
        {step && section === 'io' && io}
        {step && section === 'logs' && logs}
        {step && section === 'detalle' && detalle}
        {step && section === 'actividad' && (
          <StepActividad run={run} step={step} eventLabels={eventLabels} />
        )}
      </div>

      {step && (
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
          <button
            type="button"
            className={section === 'actividad' ? 'active' : ''}
            onClick={() => onSection('actividad')}
          >
            <History size={15} />
            {t('Actividad')}
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
      )}
    </aside>
  );
}
