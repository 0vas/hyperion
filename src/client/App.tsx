import { NodeDragHandle } from './NodeDragHandle';
import { useNodePositions } from './node-positions';
import {
  ResultadoStage,
  type JobRollup,
  type ResultadoSection,
} from './ResultadoStage';
import { RunLinkNode } from './RunLinkNode';
import { t, useLocale, localizedLabels, getLocale } from './i18n';
import hyperionLogo from './brands/hyperion.png';
import { continuationLabel } from './continuation-label';
import { PlanChanges } from './PlanChanges';
import { contextForStep, routeLabel } from '../domain/context';
import { HarnessIcon } from './HarnessIcon';
import { useReceiptActivity, mergeRuns } from './receipt-activity';
import {
  hasPermissionStall,
  latestStepEvidence,
  looksLikePermissionDenial,
  stuckRunningKind,
} from './stuck-running';
import { canSendNewBeginningToChat } from './next-cycle-send';
import { continuationClipboardBody } from './continuation-prompt';
import {
  showResultadoWakeContinuationCta,
  showWakeContinuationCta,
} from './wake-continuation-cta';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  useStore,
  getNodesBounds,
  getViewportForBounds,
  type NodeProps,
  type NodeChange,
  type Node,
  type Edge,
} from '@xyflow/react';
import {
  Package,
  RotateCcw,
  ArrowUpRight,
  Focus,
  ArrowRightLeft,
  ListTree,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Send,
  History,
  Info,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Pause,
  Play,
  ShieldCheck,
  Square,
  UserRound,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { TaskNavigation, type FocusRequest } from './TaskNavigation';
import { jobProgress, projectJobs } from '../domain/jobs';
import {
  carriesCurrent,
  nodeState,
  routeState,
  flowLabels,
  type FlowState,
} from './flow-visuals';
import { CurrentEdge } from './CurrentEdge';
import { BpmnSymbol } from './BpmnSymbol';
import { HumanForm } from './HumanForm';
import { parseField } from './decision-form';
import { canvasInsets, resultadoDock } from './viewport';
import { FlowLegend } from './FlowLegend';
import { JobNode } from './JobNode';
import { Settings } from './Settings';
import {
  ConflictResolverBody,
  ConnectionsView,
  connectionsSummaryLine,
  useConnectionInventory,
  type ConnectionRow,
} from './Connections';
import {
  connectionMessage,
  describeConnectionMessage,
  formatConnectionMessage,
  type ConnectionMessage,
} from './connection-messages';
import { AppMenu, type AppMenuAction } from './AppMenu';
import { requestDesktopUpdateCheck } from './desktop-updates';
import { usePreferences } from './preferences';
import { RELEASE_CHANNEL, VERSION } from '../version';
import { layoutSteps } from './layout';
import type { Run, Step, StepStatus } from '../domain/workflow';

const labels: Record<StepStatus, string> = localizedLabels({
  blocked: 'En espera',
  ready: 'Espera al agente',
  running: 'En curso',
  waiting: 'Tu turno',
  completed: 'Completado',
  failed: 'Falló',
  rejected: 'Rechazado',
  skipped: 'Omitido',
});
const runLabels: Record<Run['status'], string> = localizedLabels({
  active: 'En progreso',
  paused: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
});
const kindLabels = localizedLabels({
  agent: 'Agente',
  manual: 'Intervención manual',
  approval: 'Aprobación',
  start: 'Inicio',
  end: 'Fin',
  gateway: 'Compuerta',
});
const eventLabels: Record<string, string> = localizedLabels({
  created: 'Plan registrado',
  revise: 'Plan actualizado',
  artifact: 'Registró un artefacto',
  route: 'Motor de proceso',
  start: 'Comenzó un paso',
  complete: 'Completó un paso',
  fail: 'Reportó un error',
  log: 'Registró actividad',
  approve: 'Aprobó un paso',
  reject: 'Rechazó un paso',
  submit: 'Envió una respuesta',
  retry: 'Solicitó un reintento',
  pause: 'Pausó el flujo',
  resume: 'Reanudó el flujo',
  cancel: 'Canceló el flujo',
});
const time = (value: string) =>
  new Date(value).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
const clientLabels = new Map([
  ['codex', 'Codex'],
  ['claude', 'Claude'],
  ['cursor', 'Cursor'],
]);
const titleCase = (value: string) => clientLabels.get(value) || value;
function StatusIcon({
  status,
  size = 15,
}: {
  status: StepStatus;
  size?: number;
}) {
  useLocale();
  if (status === 'completed') return <Check size={size} />;
  if (status === 'running')
    return <LoaderCircle size={size} className="spin" />;
  if (status === 'waiting') return <UserRound size={size} />;
  if (status === 'failed' || status === 'rejected')
    return <XCircle size={size} />;
  if (status === 'blocked') return <LockKeyhole size={size} />;
  return <Play size={size} />;
}
type StepView = 'step' | 'io' | 'trace' | 'artifacts';
const stepViewToResultado = (view: StepView): ResultadoSection =>
  view === 'io'
    ? 'io'
    : view === 'trace'
      ? 'logs'
      : view === 'artifacts'
        ? 'artifacts'
        : 'evidence';
const isControl = (step: Step) =>
  ['start', 'end', 'gateway'].includes(step.kind);
const gatewayLabels = localizedLabels({
  parallel: 'Paralela',
  exclusive: 'Exclusiva',
  inclusive: 'Inclusiva',
});
const traceLabels = localizedLabels({
  summary: 'Resumen de decisión',
  action: 'Acción',
  observation: 'Observación',
});
type StepNodeData = {
  step: Step;
  index: number;
  coordinator: string;
  jobTitle?: string;
  logActivity: number;
  ioActivity: number;
  logCount: number;
  contextCount: number;
  selected: boolean;
  horizontal: boolean;
  canRetry: boolean;
  lineageIn: boolean;
  lineageOut: boolean;
  onRetry: (id: string) => void;
  flowState: FlowState;
  onSelect: (id: string, view?: StepView) => void;
};
function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  useLocale();
  const { step } = data;
  const tools = (
    <div className="node-tools">
      {!!step.artifacts?.length && (
        <button
          aria-label={t('Ver artefactos: {0}', { 0: step.title })}
          title={t('Artefactos')}
          onClick={() => data.onSelect(step.id, 'artifacts')}
        >
          <Package size={14} />
          <span>{step.artifacts.length}</span>
        </button>
      )}
      {step.kind === 'agent' &&
        ['failed', 'ready', 'running'].includes(step.status) && (
          <button
            aria-label={`${step.status === 'running' ? t('Recuperar') : t('Reintentar')}: ${step.title}`}
            title={
              step.status === 'running'
                ? t('Recuperar tarea atascada')
                : t('Reintentar paso')
            }
            disabled={!data.canRetry}
            onClick={() => data.onRetry(step.id)}
          >
            <RotateCcw size={14} />
            {step.status === 'failed' && <span>{t('Reintentar')}</span>}
          </button>
        )}

      <button
        aria-label={t('Ver datos: {0}', { 0: step.title })}
        title={t('Entradas, contexto y salidas')}
        data-receiving={!!data.ioActivity}
        onClick={() => data.onSelect(step.id, 'io')}
      >
        <ArrowRightLeft size={13} />
        <span>
          I/O {(step.inputs?.length || 0) + data.contextCount}/
          {step.outputs?.length || 0}
        </span>
      </button>
      <button
        aria-label={t('Ver trazas: {0}', { 0: step.title })}
        title={t('Logs y trazas públicas')}
        data-receiving={!!data.logActivity}
        onClick={() => data.onSelect(step.id, 'trace')}
      >
        <ListTree size={14} />
        <span>Logs {data.logCount || ''}</span>
      </button>
    </div>
  );
  return (
    <>
      <NodeDragHandle />
      <Handle
        type="target"
        position={data.horizontal ? Position.Left : Position.Top}
        style={{ opacity: step.kind === 'start' && !data.lineageIn ? 0 : 1 }}
      />
      {isControl(step) ? (
        <div
          className={`control-node flow-node ${step.status}`}
          data-flow-state={data.flowState}
        >
          <button
            className="control-main"
            aria-label={t('Ver paso: {0}', { 0: step.title })}
            onClick={() => data.onSelect(step.id)}
          >
            {step.kind !== 'gateway' && (
              <span className="event-label">
                {step.kind === 'start' ? t('INICIO') : t('FIN')}
              </span>
            )}
            <BpmnSymbol
              kind={
                step.gateway?.type || (step.kind === 'start' ? 'start' : 'end')
              }
            />
            <strong>{step.title}</strong>
            <small>
              {step.gateway
                ? `${gatewayLabels[step.gateway.type]} · ${step.gateway.direction === 'split' ? t('dividir') : t('unir')}`
                : flowLabels[data.flowState]}
            </small>
          </button>
          {tools}
        </div>
      ) : (
        <div
          className={`step-node flow-node ${step.status} ${data.selected ? 'selected' : ''}`}
          data-flow-state={data.flowState}
        >
          <button
            className="node-main"
            aria-label={t('Ver paso: {0}', { 0: step.title })}
            onClick={() => data.onSelect(step.id)}
          >
            <div className="node-top">
              <span className="node-identity">
                <span className="node-kind-icon">
                  {step.kind === 'agent' ? (
                    <HarnessIcon name={data.coordinator} />
                  ) : step.kind === 'approval' ? (
                    <ShieldCheck size={17} />
                  ) : (
                    <UserRound size={17} />
                  )}
                </span>
                <span className="node-number">
                  {String(data.index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className={`status-tag ${step.status}`}>
                {data.flowState === 'paused' ? (
                  <Pause size={13} />
                ) : data.flowState === 'stopped' ? (
                  <Square size={13} />
                ) : (
                  <StatusIcon status={step.status} />
                )}
                {data.flowState === 'error'
                  ? labels[step.status]
                  : flowLabels[data.flowState]}
              </span>
            </div>
            {(data.jobTitle || step.phase) && (
              <span className="node-phase">{data.jobTitle || step.phase}</span>
            )}
            <strong>{step.title}</strong>
            <div className="node-owner">
              {step.kind === 'agent' ? (
                <span className="muted">{t('Agente')}</span>
              ) : (
                t('Tú')
              )}
              <ArrowUpRight size={13} />
            </div>
          </button>
          {tools}
        </div>
      )}
      <Handle
        type="source"
        position={data.horizontal ? Position.Right : Position.Bottom}
        style={{ opacity: step.kind === 'end' && !data.lineageOut ? 0 : 1 }}
      />
    </>
  );
}
function ContractView({ step, run }: { step: Step; run: Run }) {
  useLocale();
  const context = contextForStep(run, step);
  return (
    <div className="step-detail contract-view">
      <h2 id="popup-title">{t('Entradas y salidas')}</h2>
      <p className="muted">{step.title}</p>
      <section className="context-sources">
        <h3>{t('Contexto disponible')}</h3>
        {context.request && (
          <details>
            <summary>{t('Petición original')}</summary>
            <p>{context.request}</p>
          </details>
        )}
        {!!Object.keys(context.general).length && (
          <details>
            <summary>{t('Contexto del proceso')}</summary>
            <pre>{JSON.stringify(context.general, null, 2)}</pre>
          </details>
        )}
        {context.origin && (
          <p>
            <a href={`/?run=${context.origin.runId}`}>
              {t('Recorrido anterior')}: {context.origin.title}
            </a>
          </p>
        )}
        {context.previous.map((previous) => (
          <details key={previous.stepId}>
            <summary>{previous.title}</summary>
            {previous.result && <p>{previous.result}</p>}
            {!!previous.artifacts?.length && (
              <p>
                {t('Artefactos')}:{' '}
                {previous.artifacts.map((artifact) => artifact.name).join(', ')}
              </p>
            )}
            {!!Object.keys(previous.outputs).length && (
              <pre>{JSON.stringify(previous.outputs, null, 2)}</pre>
            )}
          </details>
        ))}
        {!context.request &&
          !Object.keys(context.general).length &&
          !context.previous.length && (
            <p className="muted">{t('Aún no hay resultados anteriores.')}</p>
          )}
      </section>
      {(['inputs', 'outputs'] as const).map((direction) => (
        <section key={direction}>
          <h3>
            {direction === 'inputs'
              ? t('Inputs · Entradas')
              : t('Outputs · Salidas')}
          </h3>
          {!(step[direction] || []).length ? (
            <p className="muted">{t('Sin campos declarados.')}</p>
          ) : (
            (step[direction] || []).map((port) => {
              const source =
                direction === 'inputs'
                  ? step.inputs?.find((input) => input.name === port.name)
                      ?.source
                  : undefined;
              const values =
                direction === 'inputs' ? step.inputValues : step.outputValues;
              const present = values && Object.hasOwn(values, port.name);
              return (
                <article key={port.name} className="port">
                  <div>
                    <strong>
                      {port.form?.label || port.description || port.name}
                    </strong>
                    <code>
                      {port.name} · {port.type}
                    </code>
                    <span>
                      {port.required ? t('Obligatorio') : t('Opcional')}
                    </span>
                  </div>
                  {port.description && port.form?.label && (
                    <p>{port.description}</p>
                  )}
                  <small>
                    {source
                      ? t('Origen: {0}.{1}', {
                          0: source.stepId,
                          1: source.output,
                        })
                      : direction === 'inputs'
                        ? step.inputs?.find((input) => input.name === port.name)
                            ?.contextKey
                          ? t('Origen: contexto del proceso · {0}', {
                              0:
                                step.inputs?.find(
                                  (input) => input.name === port.name,
                                )?.contextKey || '',
                            })
                          : t('Origen: valor del plan')
                        : t('Origen: resultado de la tarea')}
                  </small>
                  <pre>
                    {present
                      ? JSON.stringify(values[port.name], null, 2)
                      : t('Sin valor registrado')}
                  </pre>
                </article>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}
function TraceView({ step, run }: { step: Step; run: Run }) {
  useLocale();
  const [scope, setScope] = useState('step');
  const events = [...run.events]
    .filter((e) => scope === 'all' || e.stepId === step.id)
    .reverse();
  return (
    <div className="step-detail trace-view">
      <h2 id="popup-title">{t('Trazas del paso')}</h2>
      <p>{step.title}</p>
      <label className="trace-scope">
        {t('Mostrar')}{' '}
        <select
          aria-label={t('Alcance de logs')}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="step">{t('Este paso')}</option>
          <option value="all">{t('Todo el proceso')}</option>
        </select>
      </label>
      <p className="muted">
        {t(
          'Resumen público → acción → observación. Se muestra lo que el agente o el motor registra.',
        )}
      </p>
      {step.result && isControl(step) && (
        <div className="result">
          <p>{step.result}</p>
        </div>
      )}
      {events.length ? (
        events.map((event) => (
          <article className="trace-event" key={event.sequence}>
            <div>
              <strong>
                {event.trace
                  ? traceLabels[event.trace.kind]
                  : eventLabels[event.type] || event.type}
              </strong>
              <small>
                <HarnessIcon name={event.actor} /> · {time(event.at)}
              </small>
            </div>
            {event.trace?.tool && <code>{event.trace.tool}</code>}
            <p>{event.message || t('Cambio de estado registrado')}</p>
          </article>
        ))
      ) : (
        <p className="muted">{t('Todavía no hay trazas registradas.')}</p>
      )}
    </div>
  );
}
const edgeTypes = { current: CurrentEdge };
const nodeTypes = { step: StepNode, job: JobNode, lineage: RunLinkNode };
function FitCanvas({ view }: { view: string }) {
  useLocale();
  const { getNodes, getInternalNode, setViewport } = useReactFlow();
  const initialized = useStore(
    (state) =>
      state.nodeLookup.size > 0 &&
      Array.from(state.nodeLookup.values()).every((node) =>
        Boolean(node.measured?.width && node.measured?.height),
      ),
  );
  const fittedSize = useRef('');
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  useEffect(() => {
    const size = `${view}:${width}:${height}`;
    if (initialized && fittedSize.current !== size) {
      fittedSize.current = size;
      const bounds = getNodesBounds(
        getNodes().map((node) => getInternalNode(node.id)!),
      );
      const viewport = getViewportForBounds(
        bounds,
        width - canvasInsets.side * 2,
        Math.max(100, height - canvasInsets.top - canvasInsets.bottom),
        0.9,
        1,
        0.12,
      );
      void setViewport({
        ...viewport,
        x:
          bounds.width * viewport.zoom > width - canvasInsets.side * 2
            ? canvasInsets.side - bounds.x * viewport.zoom
            : viewport.x + canvasInsets.side,
        y:
          bounds.height * viewport.zoom >
          height - canvasInsets.top - canvasInsets.bottom
            ? canvasInsets.top - bounds.y * viewport.zoom
            : viewport.y + canvasInsets.top,
      });
    }
  }, [
    getNodes,
    getInternalNode,
    setViewport,
    initialized,
    width,
    height,
    view,
  ]);
  return null;
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(path, {
    ...(data
      ? {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { 'content-type': 'application/json' },
        }
      : {}),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json();
  if (!res.ok) {
    const messages: Record<string, string> = {
      REVISION_CONFLICT: t(
        'El flujo cambió mientras decidías. Revisa el estado actualizado y vuelve a intentarlo.',
      ),
      PAUSED: t('El flujo está en pausa.'),
      TERMINAL: t('Este flujo ya terminó.'),
      FORBIDDEN: t('Esta acción corresponde a otro participante.'),
      EVIDENCE_REQUIRED: t('Escribe una respuesta antes de continuar.'),
    };
    throw new Error(
      messages[body.error] ||
        body.message ||
        t('No se pudo completar la solicitud.'),
    );
  }
  return body as T;
}
function Modal({
  children,
  onClose,
  returnFocus,
  active = true,
}: {
  returnFocus?: HTMLElement | null | (() => HTMLElement | null);
  active?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  useLocale();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      returnFocus || (document.activeElement as HTMLElement | null);
    return () => {
      // React Flow remeasures changed nodes on the next frame. Restore focus
      // after those nodes become visible again, and after inert is removed.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const target = typeof previous === 'function' ? previous() : previous;
          const top = Array.from(
            document.querySelectorAll('.modal-backdrop:not([inert])'),
          ).at(-1);
          if (
            target?.isConnected &&
            !target.closest('[inert]') &&
            !target.matches(':disabled') &&
            (!top || top.contains(target))
          ) {
            target.focus({ preventScroll: true });
          }
        }),
      );
    };
  }, []);
  useLayoutEffect(() => {
    const container = root.current;
    if (!active || !container) return;
    const focused = document.activeElement;
    // Disabling the focused submit can blur to BODY. Recover on render, while
    // retaining a user's valid focus through polling and async error updates.
    if (
      focused &&
      focused !== container &&
      container.contains(focused) &&
      !focused.matches(':disabled')
    )
      return;
    (
      container.querySelector<HTMLElement>(
        'button:not(:disabled),textarea:not(:disabled)',
      ) || container
    ).focus();
  });
  return (
    <div
      ref={root}
      className="modal-backdrop"
      tabIndex={-1}
      inert={!active}
      aria-hidden={!active || undefined}
      onClick={(event) => {
        if (active && event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (!active) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key !== 'Tab') return;
        const items = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),textarea,select,input,a[href],[tabindex="0"]',
          ) || [],
        );
        const first = items[0];
        const last = items.at(-1);
        if (!first) {
          event.preventDefault();
          root.current?.focus();
        } else if (document.activeElement === root.current) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      {children}
    </div>
  );
}
type CanvasNoticeMessage =
  string | { kind: 'desktop-update'; outcome: 'unavailable' | 'failed' };
const UPDATE_NOTICES = {
  unavailable:
    'Para buscar actualizaciones usa Hyperion → Buscar actualizaciones… en el menú de la aplicación.',
  failed:
    'No se pudo buscar actualizaciones. Inténtalo de nuevo desde Hyperion → Buscar actualizaciones…',
} as const;

export function App() {
  const locale = useLocale();
  const [preferences, setPreferences] = usePreferences();
  const [notice, setNotice] = useState<CanvasNoticeMessage>('');
  const popupTrigger = useRef<HTMLElement | null>(null);
  const connectionTrigger = useRef<HTMLElement | null>(null);
  const replaceTrigger = useRef<HTMLElement | null>(null);
  const connectionSetupPending = useRef(false);
  const connectionReturnFocus = () => {
    const target =
      connectionTrigger.current?.isConnected &&
      !connectionTrigger.current.matches(':disabled')
        ? connectionTrigger.current
        : document.querySelector<HTMLElement>(
            '.connections-identity-actions button',
          );
    // Reactivating Connections may focus its header before the Resolver's
    // return-focus callback runs. Reveal the original card below that header.
    target?.scrollIntoView({ block: 'nearest' });
    return target;
  };
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState(
    new URLSearchParams(location.search).get('run') || '',
  );
  const [stepId, setStepId] = useState('');
  const [jobId, setJobId] = useState('');
  const [resultadoOpen, setResultadoOpen] = useState(false);
  const [resultadoSection, setResultadoSection] =
    useState<ResultadoSection>('evidence');
  const [following, setFollowing] = useState(false);
  const [focusedStepId, setFocusedStepId] = useState('');
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const focusNonce = useRef(0);
  const [popup, setPopup] = useState<
    | 'activity'
    | 'request'
    | 'runs'
    | 'guide'
    | 'next-cycle'
    | 'settings'
    | 'connections'
    | 'legend'
    | 'about'
    | null
  >(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isElectron = navigator.userAgent.includes('Electron/');
  useEffect(() => {
    document.documentElement.classList.toggle('electron', isElectron);
  }, [isElectron]);
  useLayoutEffect(() => {
    if (!popup || document.activeElement !== document.body) return;
    const focus =
      popup === 'connections'
        ? document.querySelector<HTMLButtonElement>(
            '.connections-identity-actions .ghost-button',
          )
        : document.querySelector<HTMLButtonElement>('.modal-close');
    focus?.focus();
  }, [popup]);
  const [online, setOnline] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamConnected = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [nextRequest, setNextRequest] = useState('');
  const [outputDraft, setOutputDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [retryTarget, setRetryTarget] = useState<string>();
  const [confirmation, setConfirmation] = useState<
    'cancel' | 'reject' | 'retry' | null
  >(null);
  useEffect(() => {
    if (popup || help || confirmation) setMenuOpen(false);
  }, [popup, help, confirmation]);
  const [conflictRow, setConflictRow] = useState<ConnectionRow | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<ConnectionRow | null>(
    null,
  );
  const [setupNotice, setSetupNotice] = useState<ConnectionMessage | null>(
    null,
  );
  const [setupError, setSetupError] = useState<ConnectionMessage | null>(null);
  const connections = useConnectionInventory(loaded && online);
  const openConnections = () => {
    setMenuOpen(false);
    setHelp(false);
    setPopup('connections');
  };
  const openFromMenu = (action: AppMenuAction) => {
    setMenuOpen(false);
    setHelp(false);
    const menuTrigger =
      document.querySelector<HTMLElement>('.app-menu-trigger');
    if (menuTrigger) popupTrigger.current = menuTrigger;
    if (action === 'connections') {
      setPopup('connections');
      return;
    }
    if (action === 'settings') {
      setPopup('settings');
      return;
    }
    if (action === 'guide') {
      setPopup('guide');
      return;
    }
    if (action === 'help') {
      setPopup(null);
      setHelp(true);
      return;
    }
    if (action === 'legend') {
      setPopup('legend');
      return;
    }
    if (action === 'request') {
      setPopup('request');
      return;
    }
    if (action === 'activity') {
      setPopup('activity');
      return;
    }
    if (action === 'pause') {
      void act('pause');
      return;
    }
    if (action === 'resume') {
      void act('resume');
      return;
    }
    if (action === 'window') {
      openWindow();
      return;
    }
    if (action === 'updates') {
      void requestDesktopUpdateCheck(window.hyperionDesktop).then(
        (result) => {
          if (result === 'unavailable')
            setNotice({ kind: 'desktop-update', outcome: 'unavailable' });
        },
        () => setNotice({ kind: 'desktop-update', outcome: 'failed' }),
      );
      return;
    }
    if (action === 'about') {
      setPopup('about');
    }
  };
  const setupConnection = async (clientId: string, replace = false) => {
    if (busy || connectionSetupPending.current) return;
    connectionSetupPending.current = true;
    setSetupNotice(null);
    setSetupError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/connections/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: clientId,
          ...(replace ? { replace: true } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === 'CONNECTION_CONFLICT') {
          const row = connections.inventory?.integrations.find(
            (item) => item.id === clientId,
          );
          setConflictRow(
            row || {
              id: clientId,
              name: clientId,
              status: 'conflict',
              detail: body.message,
            },
          );
          await connections.refresh();
          return;
        }
        throw new Error(body.message || 'No se pudo completar la solicitud.');
      }
      setConflictRow(null);
      setReplaceConfirm(null);
      if (body.inventory) connections.setInventory(body.inventory);
      else await connections.refresh();
      setSetupNotice(connectionMessage(replace ? 'replaced' : 'configured'));
    } catch (err) {
      setSetupError(
        err instanceof Error
          ? describeConnectionMessage(err.message)
          : connectionMessage('requestFailed'),
      );
    } finally {
      connectionSetupPending.current = false;
      setBusy(false);
    }
  };
  const run = runId ? runs.find((r) => r.id === runId) : runs[0];
  const activity = useReceiptActivity(run);
  useEffect(() => {
    setFollowing(preferences.follow);
    setNotice('');
    setFocusedStepId('');
    setFocusRequest(null);
  }, [run?.id, preferences.follow]);
  // Resultado binds to one primary selection — never invent a step when none is selected.
  const step = stepId
    ? run?.steps.find((item) => item.id === stepId)
    : undefined;
  const selectedJob: JobRollup | undefined =
    jobId && run
      ? (() => {
          const progress = jobProgress(run, jobId);
          const job = run.jobs?.find((item) => item.id === jobId);
          if (!job) return undefined;
          return {
            id: jobId,
            title: job.title,
            completed: progress.completed,
            total: progress.total,
            skipped: progress.skipped,
            status: progress.status,
            statusLabel: flowLabels[nodeState(progress, run.status)],
            steps: progress.steps,
          };
        })()
      : undefined;
  const refresh = useCallback(async () => {
    try {
      const data = await api<Run[]>('/api/runs');
      if (runId && !data.some((item) => item.id === runId)) {
        const requested = await fetch(
          `/api/runs/${encodeURIComponent(runId)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (requested.ok) data.unshift((await requested.json()) as Run);
        else if (requested.status !== 404)
          throw new Error('Unable to read selected run');
      }
      setRuns((previous) => mergeRuns(previous, data));
      setOnline(true);
      setLoaded(true);
    } catch {
      setOnline(streamConnected.current);
      setLoaded(true);
    }
  }, [runId]);
  useEffect(() => {
    let active = true;
    let events: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (active) timer = setTimeout(tick, 1000);
    };
    const connect = () => {
      events?.close();
      if (!active) return;
      events = new EventSource('/api/events');
      events.onopen = () => {
        streamConnected.current = true;
      };
      const receive = (event: MessageEvent, snapshot: boolean) => {
        if (!active) return;
        try {
          const value = JSON.parse(event.data);
          setRuns((previous) =>
            mergeRuns(previous, snapshot ? value : [value]),
          );
          setOnline(true);
          setStreaming(true);
          setLoaded(true);
        } catch {
          setStreaming(false);
        }
      };
      events.addEventListener('snapshot', (e) =>
        receive(e as MessageEvent, true),
      );
      events.addEventListener('run', (e) => receive(e as MessageEvent, false));
      events.onerror = () => {
        if (active) {
          streamConnected.current = false;
          setStreaming(false);
        }
      };
    };
    const disconnect = () => {
      events?.close();
      streamConnected.current = false;
      setOnline(false);
      setStreaming(false);
    };
    window.addEventListener('offline', disconnect);
    window.addEventListener('online', connect);
    void api('/api/session')
      .then(() => {
        if (!active) return;
        connect();
        void tick();
      })
      .catch(() => {
        setLoaded(true);
        setOnline(false);
      });
    return () => {
      active = false;
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('online', connect);
      events?.close();
      streamConnected.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const draftStepRef = useRef('');
  useEffect(() => {
    draftStepRef.current = '';
    setAnswer('');
    setOutputDraft({});
    setError('');
    setConfirmation(null);
  }, [run?.id]);
  useEffect(() => {
    // Keep drafts across Resultado close/reopen of the same step; reset only on a different step.
    if (!stepId || draftStepRef.current === stepId) return;
    draftStepRef.current = stepId;
    setAnswer('');
    setOutputDraft({});
    setError('');
    setConfirmation(null);
  }, [stepId]);
  const selectRun = (id: string) => {
    setRunId(id);
    setStepId('');
    setJobId('');
    setResultadoOpen(false);
    setResultadoSection('evidence');
    setPopup(null);
    history.replaceState(null, '', id ? `/?run=${id}` : '/');
  };
  const clearResultado = useCallback(() => {
    const restoreId = stepId || (jobId ? `job:${jobId}` : '');
    setStepId('');
    setJobId('');
    setResultadoOpen(false);
    setResultadoSection('evidence');
    if (!restoreId) return;
    queueMicrotask(() => {
      const node = document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(restoreId)}"]`,
      );
      node
        ?.querySelector<HTMLElement>('button.node-main, button.control-main')
        ?.focus();
    });
  }, [stepId, jobId]);
  const selectStep = useCallback((id: string, view: StepView = 'step') => {
    setJobId('');
    setStepId(id);
    setResultadoSection(stepViewToResultado(view));
    setResultadoOpen(true);
  }, []);
  const selectJobRollup = useCallback((id: string) => {
    setStepId('');
    setJobId(id);
    setResultadoSection('evidence');
    setResultadoOpen(true);
  }, []);
  // Controlled nodes must retain React Flow's measurements between snapshots.
  // Dropping them invalidates handles and unmounts every connected edge.
  const measurementKey = `${run?.id}:${preferences.view}:${preferences.orientation}`;
  const {
    positions: manualPositions,
    change: moveNodes,
    reset: resetPositions,
  } = useNodePositions(measurementKey);
  const [selection, setSelection] = useState<{
    key: string;
    ids: Record<string, boolean>;
  }>({ key: '', ids: {} });
  const [layoutReset, setLayoutReset] = useState(0);
  const [measurements, setMeasurements] = useState<{
    key: string;
    nodes: Record<string, { width: number; height: number }>;
  }>({ key: '', nodes: {} });
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      moveNodes(changes);
      if (changes.some((change) => change.type === 'position'))
        setFollowing(false);
      if (changes.some((change) => change.type === 'select'))
        setSelection((previous) => {
          const ids =
            previous.key === measurementKey ? { ...previous.ids } : {};
          for (const change of changes)
            if (change.type === 'select') ids[change.id] = change.selected;
          return { key: measurementKey, ids };
        });
      setMeasurements((previous) => {
        let next = previous.key === measurementKey ? previous.nodes : {};
        for (const change of changes) {
          if (change.type !== 'dimensions' || !change.dimensions) continue;
          const measured = next[change.id];
          if (
            measured?.width === change.dimensions.width &&
            measured?.height === change.dimensions.height
          )
            continue;
          next = { ...next, [change.id]: change.dimensions };
        }
        return next === previous.nodes
          ? previous
          : { key: measurementKey, nodes: next };
      });
    },
    [measurementKey, moveNodes],
  );
  const graph = useMemo(() => {
    if (!run) return { nodes: [], edges: [] };
    const collapsed = preferences.view === 'jobs' && !!run.jobs?.length;
    const displayed = collapsed ? projectJobs(run) : run.steps;
    const positions = layoutSteps(
      displayed,
      !collapsed,
      preferences.orientation,
    );
    const nodes: Node[] = displayed.map((item, index) => {
      const measured =
        measurements.key === measurementKey
          ? measurements.nodes[item.id]
          : undefined;
      if (item.id.startsWith('job:')) {
        const id = item.id.slice(4);
        const progress = jobProgress(run, id);
        return {
          id: item.id,
          type: 'job',
          measured,
          position: positions[item.id]!,
          draggable: true,
          dragHandle: '.node-drag-handle',
          focusable: true,
          data: {
            title: item.title,
            horizontal: preferences.orientation === 'horizontal',
            ...progress,
            flowState: nodeState(progress, run.status),
            statusLabel: flowLabels[nodeState(progress, run.status)],
            onExpand: () => {
              setFollowing(false);
              const child =
                progress.steps.find((s) => s.status === 'waiting') ||
                progress.steps.find((s) => s.status === 'ready') ||
                progress.steps.find((s) => s.status === 'running');
              if (child) {
                setPreferences((p) => ({ ...p, view: 'steps' }));
                selectStep(child.id);
                setFocusRequest({
                  id: child.id,
                  nonce: ++focusNonce.current,
                });
                return;
              }
              selectJobRollup(id);
              setFocusRequest({
                id: item.id,
                nonce: ++focusNonce.current,
              });
            },
          },
        };
      }
      return {
        id: item.id,
        type: 'step',
        measured,
        position: positions[item.id]!,
        data: {
          step: item,
          logActivity:
            online && !preferences.reduceMotion
              ? activity.logs[item.id] || 0
              : 0,
          ioActivity:
            online && !preferences.reduceMotion ? activity.io[item.id] || 0 : 0,
          logCount: run.events.filter((e) => e.stepId === item.id).length,
          contextCount: (() => {
            const c = contextForStep(run, item);
            return (
              Number(!!c.request) +
              Object.keys(c.general).length +
              c.previous.length
            );
          })(),
          horizontal: preferences.orientation === 'horizontal',
          lineageIn: !!run.origin,
          lineageOut: run.status === 'completed' || !!run.links?.next.length,
          canRetry: online && run.status === 'active' && !busy,
          onRetry: requestRetry,
          flowState: nodeState(item, run.status),
          index,
          coordinator: run.coordinator,
          jobTitle: run.jobs?.find((j) => j.id === item.jobId)?.title,
          selected:
            focusedStepId === item.id ||
            (resultadoOpen && step?.id === item.id) ||
            (resultadoOpen && !!jobId && item.jobId === jobId),
          onSelect: selectStep,
        },
        draggable: true,
        dragHandle: '.node-drag-handle',
        focusable: true,
      };
    });
    const edges: Edge[] = displayed.flatMap((item) =>
      item.dependencies.map((id) => {
        const state = routeState(run, id, item.id);
        const color = `var(--route-${state})`;
        return {
          id: `${id}-${item.id}`,
          source: id,
          target: item.id,
          type: 'current',
          data: {
            decision: (() => {
              const label = routeLabel(
                run,
                run.steps.find((s) => s.id === id),
                item.id,
              );
              return label === 'Sí' ? true : label === 'No' ? false : undefined;
            })(),
            state,
            current: carriesCurrent(
              state,
              run.status,
              online,
              preferences.reduceMotion,
            ),
          },
          className: `route-${state}`,
          ariaLabel: `${displayed.find((s) => s.id === id)?.title} → ${item.title}: ${flowLabels[state]}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color,
          },
          label: routeLabel(
            run,
            run.steps.find((s) => s.id === id),
            item.id,
            {
              yes: t('Sí'),
              no: 'No',
              other: t('Otra opción'),
              next: t('Continuar'),
            },
          ),
          labelStyle: { fontSize: 11, fill: '#655e50' },
          labelBgStyle: { fill: '#f7f5ef', fillOpacity: 0.95 },
          animated: carriesCurrent(
            state,
            run.status,
            online,
            preferences.reduceMotion,
          ),
          style: {
            stroke: color,
            strokeWidth: state === 'pending' || state === 'skipped' ? 1.5 : 2.2,
          },
        };
      }),
    );
    const horizontal = preferences.orientation === 'horizontal';
    const addLink = (
      id: string,
      title: string,
      direction: 'previous' | 'next' | 'new',
      index: number,
      total: number,
      onOpen: () => void,
    ) => {
      const upstream = direction === 'previous';
      const anchors = displayed.filter((item) =>
        upstream
          ? !item.dependencies.length
          : !displayed.some((other) => other.dependencies.includes(item.id)),
      );
      const axis = horizontal ? 'x' : 'y';
      const cross = horizontal ? 'y' : 'x';
      const depth = upstream
        ? Math.min(...anchors.map((item) => positions[item.id]![axis])) -
          (horizontal ? 360 : 150)
        : Math.max(
            ...anchors.map(
              (item) =>
                positions[item.id]![axis] +
                (measurements.nodes[item.id]?.[
                  horizontal ? 'width' : 'height'
                ] || 220),
            ),
          ) + 80;
      const center =
        anchors.reduce(
          (sum, item) =>
            sum +
            positions[item.id]![cross] +
            (measurements.nodes[item.id]?.[horizontal ? 'height' : 'width'] ||
              (horizontal ? 140 : isControl(item) ? 180 : 280)) /
              2,
          0,
        ) /
          anchors.length -
        (measurements.nodes[id]?.[horizontal ? 'height' : 'width'] ||
          (horizontal ? 100 : 280)) /
          2;
      const position = horizontal
        ? { x: depth, y: center + (index - (total - 1) / 2) * 210 }
        : { x: center + (index - (total - 1) / 2) * 330, y: depth };
      nodes.push({
        id,
        type: 'lineage',
        position,
        measured:
          measurements.key === measurementKey
            ? measurements.nodes[id]
            : undefined,
        data: { title, direction, horizontal, onOpen },
        draggable: true,
        dragHandle: '.node-drag-handle',
        focusable: true,
      });
      anchors.forEach((item) =>
        edges.push({
          id: `${id}:${item.id}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--muted)' },
          source: upstream ? id : item.id,
          target: upstream ? item.id : id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--muted)', strokeDasharray: '5 5' },
        }),
      );
    };
    if (run.links?.previous) {
      const previous = run.links.previous;
      addLink(`lineage:${previous.id}`, previous.title, 'previous', 0, 1, () =>
        selectRun(previous.id),
      );
    }
    for (const [index, next] of (run.links?.next || []).entries())
      addLink(
        `lineage:${next.id}`,
        next.title,
        'next',
        index,
        run.links!.next.length,
        () => selectRun(next.id),
      );
    if (run.status === 'completed' && !run.links?.next.length)
      addLink('lineage:new', t('Continuar desde aquí'), 'new', 0, 1, () => {
        setNextRequest('');
        setPopup('next-cycle');
      });
    return {
      nodes: nodes.map((node) => ({
        ...node,
        position: Object.hasOwn(manualPositions, node.id)
          ? manualPositions[node.id]!
          : node.position,
        selected:
          selection.key === measurementKey && selection.ids[node.id] === true,
      })),
      edges,
    };
  }, [
    locale,
    run,
    activity,
    measurements,
    measurementKey,
    manualPositions,
    selection,
    step?.id,
    jobId,
    selectStep,
    selectJobRollup,
    resultadoOpen,
    focusedStepId,
    preferences.view,
    preferences.orientation,
    busy,
    preferences.reduceMotion,
    online,
  ]);
  function requestRetry(id: string) {
    const target = run?.steps.find((item) => item.id === id);
    if (target?.status === 'running') {
      setRetryTarget(id);
      setConfirmation('retry');
    } else void act('retry', id);
  }
  async function act(type: string, target?: string) {
    if (!run || busy) return;
    setBusy(true);
    setError('');
    try {
      const outputs =
        step && ['submit', 'approve'].includes(type) && step.outputs?.length
          ? Object.fromEntries(
              step.outputs
                .filter((port) => !!outputDraft[port.name]?.trim())
                .map((port) => {
                  const raw = outputDraft[port.name]!;
                  return [port.name, parseField(port, raw)];
                }),
            )
          : undefined;
      const updated = await api<Run>(`/api/runs/${run.id}/commands`, {
        type,
        ...(outputs ? { outputs } : {}),
        ...(target ? { stepId: target } : {}),
        ...(answer.trim() ? { message: answer.trim() } : {}),
        commandId: crypto.randomUUID(),
        expectedRevision: run.revision,
      });
      setAnswer('');
      if (['submit', 'approve'].includes(type))
        setNotice(
          updated.status === 'completed'
            ? t('Elección guardada. El proceso terminó.')
            : updated.steps.some((s) => s.status === 'ready')
              ? updated.continuation
                ? t('Elección guardada. Sigue la reanudación en el canvas.')
                : run.agentWaiting
                  ? t(
                      'Elección guardada. El siguiente paso ya está habilitado.',
                    )
                  : t(
                      'Elección guardada. Este flujo continúa desde el chat; no tiene reanudación automática.',
                    )
              : t(
                  'Elección guardada. Sigue el estado de la siguiente tarea en el canvas.',
                ),
        );
      if (type === 'retry')
        setNotice(
          t(
            'Solicitud de reintento enviada. Se conserva el historial y tus respuestas.',
          ),
        );
      setConfirmation(null);
      if (['submit', 'approve', 'reject', 'cancel', 'retry'].includes(type)) {
        setPopup(null);
        clearResultado();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('No se pudo guardar.'));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(
        run
          ? continuationClipboardBody(t, run)
          : t(
              'Quiero usar Hyperion. Pregúntame qué actividad quiero realizar y crea el flujo desde mi respuesta.',
            ),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        t('No se pudo copiar. Puedes seleccionar y copiar el ID del flujo.'),
      );
    }
  }
  async function copyCanvasLink() {
    if (!run) return;
    try {
      const url = `${location.origin}/?run=${run.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError(
        t('No se pudo copiar. Puedes seleccionar y copiar el ID del flujo.'),
      );
    }
  }
  const waiting = run?.steps.filter((s) => s.status === 'waiting').length || 0;
  const ready = run?.steps.filter((s) => s.status === 'ready').length || 0;
  const live = run?.status === 'active';
  const wakeContinuationOpen =
    !!run &&
    showWakeContinuationCta({
      live,
      agentWaiting: !!run.agentWaiting,
      readyAgentCount: ready,
      humanWaitingCount: waiting,
      hasDurableContinuation: !!run.continuation,
    });
  const canSendWakeContinuation = canSendNewBeginningToChat({
    // Phase 0: no certified ResumeConnector → Enviar hidden.
    // Outbound host-prompt enqueue flips this gate when a real connector exists.
    outboundSendConfigured: false,
  });
  const permissionStall =
    !!run && hasPermissionStall(run.steps, run.events, !!run.agentWaiting);
  const blockedReason = step?.dependencies
    .filter((id) => run?.steps.find((s) => s.id === id)?.status !== 'completed')
    .map((id) => run?.steps.find((s) => s.id === id)?.title)
    .join(', ');

  const openPanel = (panel: typeof popup) => {
    setPopup(panel);
  };
  const openWindow = () => {
    const detached = window.open(
      location.href,
      'hyperion-workspace',
      'popup=yes,width=1200,height=820',
    );
    if (!detached) {
      setError(
        t(
          'El navegador bloqueó la ventana. Permite abrir ventanas para Hyperion y vuelve a intentarlo.',
        ),
      );
      return;
    }
    detached.opener = null;
    setPopup(null);
  };
  const runTools = run && (
    <div className="canvas-tools">
      <div className="canvas-tools-group">
        <button
          className="secondary"
          aria-haspopup="dialog"
          onClick={() => openPanel('request')}
        >
          <MessageSquareText size={15} />
          {t('Petición original')}
        </button>
        <button
          className="secondary"
          data-receiving={
            online && !preferences.reduceMotion && !!activity.process
          }
          aria-haspopup="dialog"
          onClick={() => openPanel('activity')}
        >
          <History size={15} />
          {t('Actividad')}
        </button>
      </div>
      <div className="canvas-tools-group">
        {!!run.jobs?.length && (
          <button
            className="secondary"
            onClick={() =>
              setPreferences((p) => ({
                ...p,
                view: p.view === 'steps' ? 'jobs' : 'steps',
              }))
            }
          >
            <Layers3 size={15} />
            {preferences.view === 'steps' ? t('Ver trabajos') : t('Ver pasos')}
          </button>
        )}
        <button className="secondary continue-button" onClick={copyPrompt}>
          <Copy size={15} />
          {copied ? t('Pega la petición en tu chat') : t('Copiar continuación')}
        </button>
        {run && (
          <button
            className="secondary"
            onClick={() => void copyCanvasLink()}
            title={t('Pégalo en Browse de Claude (o ábrelo en el navegador).')}
          >
            <Copy size={15} />
            {copiedLink
              ? t('Enlace copiado · ábrelo en Browse')
              : t('Copiar enlace del canvas')}
          </button>
        )}
        {(live || run.status === 'paused') && (
          <>
            <button
              className="secondary"
              disabled={busy || !online}
              onClick={() => void act(live ? 'pause' : 'resume')}
            >
              {live ? <Pause size={14} /> : <Play size={14} />}
              {live ? t('Pausar') : t('Reanudar')}
            </button>
            <button
              className="secondary icon-button"
              aria-label={t('Cancelar flujo')}
              aria-haspopup="dialog"
              disabled={busy || !online}
              onClick={() => setConfirmation('cancel')}
            >
              <Square size={14} />
              <span className="options-only">{t('Cancelar flujo')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
  const dialogOpen = Boolean(popup || help || confirmation);
  useEffect(() => {
    if (!resultadoOpen || dialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      clearResultado();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resultadoOpen, dialogOpen, clearResultado]);
  // Only native Menu update outcomes use descriptors here. Workflow notices and
  // recorded content remain literal; this is not a general notice translation.
  const noticeView =
    notice && !dialogOpen ? (
      <div className="canvas-notice" role="status">
        {typeof notice === 'string' ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Info size={16} aria-hidden="true" />
        )}
        <span>
          {typeof notice === 'string'
            ? notice
            : t(UPDATE_NOTICES[notice.outcome])}
        </span>
        <button aria-label={t('Cerrar aviso')} onClick={() => setNotice('')}>
          <X size={16} />
        </button>
      </div>
    ) : null;
  return (
    <div className="app-shell canvas-app" data-connected={online}>
      <div
        className="canvas-shell"
        inert={dialogOpen}
        onClickCapture={(event) => {
          const button = (event.target as HTMLElement).closest('button');
          if (button) popupTrigger.current = button;
        }}
      >
        <header className="topbar canvas-topbar">
          <div className="canvas-identity">
            <a className="brand" href="/" aria-label={t('Hyperion, inicio')}>
              <span className="brand-mark">
                <img src={hyperionLogo} alt="" width="32" height="32" />
              </span>
              <span className="brand-word">hyperion</span>
            </a>
            <button
              className="secondary flows-button"
              aria-label={t('Mis flujos')}
              title={t('Mis flujos')}
              aria-haspopup="dialog"
              onClick={() => setPopup('runs')}
            >
              <Workflow size={15} />
              <span className="flows-label">{t('Mis flujos')}</span>
            </button>
            {run && (
              <div className="canvas-title">
                <h1 title={run.title}>{run.title}</h1>
                <span
                  className={`run-status ${run.status}`}
                  data-testid="run-status"
                >
                  <span className="tiny-dot" />
                  {runLabels[run.status]}
                </span>
              </div>
            )}
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${online ? 'online' : ''}`}
              title={t(
                'El servicio local de Hyperion responde en este equipo. No indica que tu aplicación de IA tenga herramientas cargadas.',
              )}
              aria-label={`${t('Servicio local')}: ${
                online
                  ? t('Conectado')
                  : loaded
                    ? t('Sin conexión')
                    : t('Conectando')
              }`}
            >
              <span className="connection-dot" aria-hidden="true" />
              <small>{t('Servicio local')}</small>
              <span className="connection-state">
                {online
                  ? t('Conectado')
                  : loaded
                    ? t('Sin conexión')
                    : t('Conectando')}
              </span>
            </span>
            <AppMenu
              open={menuOpen}
              onOpenChange={(next) => {
                if (next) {
                  setPopup(null);
                  setHelp(false);
                }
                setMenuOpen(next);
              }}
              inventory={connections.inventory}
              reduceMotion={preferences.reduceMotion}
              isElectron={isElectron}
              run={
                run
                  ? {
                      live,
                      paused: run.status === 'paused',
                      canPauseResume: live || run.status === 'paused',
                    }
                  : null
              }
              onAction={openFromMenu}
            />
          </div>
        </header>
        <main className="canvas-main">
          {!loaded ? (
            <div className="empty-state">
              <LoaderCircle className="spin" />
              <h1>{t('Cargando tu espacio…')}</h1>
            </div>
          ) : !run ? (
            <div className="empty-state">
              <span className="empty-symbol">
                <Workflow size={34} />
              </span>
              <span className="eyebrow">
                {t('DE LA INTENCIÓN A LA ACCIÓN')}
              </span>
              <h1>
                {runId
                  ? t('No encontramos ese flujo')
                  : t('Tu trabajo, paso a paso.')}
              </h1>
              <p>
                {runId
                  ? t('Comprueba el enlace o vuelve a tus flujos recientes.')
                  : t(
                      'Conecta tu herramienta de IA y transforma una petición en un proceso que puedes ver, guiar y aprobar.',
                    )}
              </p>
              <div className="empty-actions">
                <button
                  className="primary"
                  onClick={() => {
                    if (runId) selectRun('');
                    else openConnections();
                  }}
                >
                  {runId
                    ? t('Ver mis flujos')
                    : (connections.inventory?.summary.configured || 0) > 0 ||
                        (connections.inventory?.summary.conflicts || 0) > 0
                      ? t('Ver conexiones')
                      : t('Conectar mi agente')}{' '}
                  <ArrowUpRight size={16} />
                </button>
                {!runId &&
                  ((connections.inventory?.summary.configured || 0) > 0 ||
                    (connections.inventory?.summary.conflicts || 0) > 0) && (
                    <button className="secondary" onClick={() => setHelp(true)}>
                      {t('Conectar otra')}
                    </button>
                  )}
              </div>
              {typeof notice !== 'string' && noticeView}
              {!online && (
                <p role="alert">
                  {t(
                    'No pudimos conectar con Hyperion. Comprueba que el servidor está activo.',
                  )}
                </p>
              )}
            </div>
          ) : (
            <section
              className={`canvas-workspace${resultadoOpen && (step || selectedJob) ? ' has-resultado' : ''}`}
              aria-label={t('Canvas del workflow')}
              data-resultado-breakpoint={resultadoDock.breakpoint}
            >
              {runTools}
              <div className="graph">
                <ReactFlow
                  key={run.id}
                  nodes={graph.nodes}
                  onNodesChange={onNodesChange}
                  edges={graph.edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  ariaLabelConfig={{
                    'node.a11yDescription.default': t(
                      'Pulsa Intro para seleccionar y usa las flechas para mover. Escape cancela la selección.',
                    ),
                    'node.a11yDescription.keyboardDisabled': t(
                      'Pulsa Intro para seleccionar y usa las flechas para mover. Escape cancela la selección.',
                    ),
                    'node.a11yDescription.ariaLiveMessage': ({ x, y }) =>
                      t('Nodo movido a {0}, {1}', { 0: x, 1: y }),
                    'controls.zoomIn.ariaLabel': t('Acercar'),
                    'controls.zoomOut.ariaLabel': t('Alejar'),
                  }}
                  fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
                  minZoom={0.15}
                  maxZoom={1.5}
                  deleteKeyCode={null}
                  nodesConnectable={false}
                  nodesDraggable
                  onNodeDragStart={() => setFollowing(false)}
                  elementsSelectable
                  zoomOnDoubleClick={false}
                  onPaneClick={() => clearResultado()}
                  onMoveStart={(event) => {
                    if (event) setFollowing(false);
                  }}
                >
                  <FitCanvas
                    view={`${preferences.view}:${preferences.orientation}:${layoutReset}:${resultadoOpen ? 'resultado' : 'full'}`}
                  />
                  <Background color="#c6c0b2" gap={28} size={0.8} />
                  <TaskNavigation
                    canReset={Object.keys(manualPositions).length > 0}
                    onReset={() => {
                      resetPositions();
                      setFollowing(false);
                      setLayoutReset((n) => n + 1);
                    }}
                    orientation={preferences.orientation}
                    onOrientation={() =>
                      setPreferences((p) => ({
                        ...p,
                        orientation:
                          p.orientation === 'vertical'
                            ? 'horizontal'
                            : 'vertical',
                      }))
                    }
                    run={run}
                    view={`${preferences.view}:${preferences.orientation}:${run.status}:${run.links?.next.map((link) => link.id).join()}`}
                    following={following}
                    onFollowing={setFollowing}
                    suspended={dialogOpen}
                    available={online}
                    request={focusRequest}
                    onSelect={selectStep}
                    onFocused={setFocusedStepId}
                  />
                </ReactFlow>
                {noticeView}
                {error && !dialogOpen && (
                  <div role="alert" className="canvas-alert popup-error">
                    {error}
                    <button
                      aria-label={t('Cerrar error')}
                      onClick={() => setError('')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {run.status === 'paused' &&
                  run.events.at(-1)?.type === 'revise' && (
                    <button
                      className="canvas-next"
                      onClick={() => openPanel('activity')}
                    >
                      <History size={17} />
                      <span>
                        <strong>{t('El plan cambió')}</strong>
                        {t('Revisa los cambios antes de reanudar')}
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                {live && waiting > 0 && (
                  <button
                    className="canvas-next human"
                    onClick={() =>
                      selectStep(
                        run.steps.find((s) => s.status === 'waiting')!.id,
                      )
                    }
                  >
                    <UserRound size={17} />
                    <span>
                      <strong>
                        {t('Tu turno ·')} {waiting}{' '}
                        {waiting === 1 ? t('paso') : t('pasos')}
                      </strong>
                      {t('Responder en el canvas')}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                )}
                {live && permissionStall && waiting === 0 && (
                  <button
                    className="canvas-next"
                    onClick={() => {
                      const stalled = run.steps.find(
                        (s) =>
                          s.kind === 'agent' &&
                          s.status === 'running' &&
                          looksLikePermissionDenial(
                            latestStepEvidence(run.events, s.id) ||
                              s.result ||
                              '',
                          ),
                      );
                      if (stalled) selectStep(stalled.id);
                    }}
                  >
                    <Bot size={17} />
                    <span>
                      <strong>{t('Posible atasco')}</strong>
                      {t(
                        'El agente se detuvo sin fallar este paso (p. ej. acceso denegado). No hay chat esperando. Usa Recuperar tarea o pega Copiar continuación en el chat conectado.',
                      )}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                )}
                {live && !waiting && ready > 0 && run.continuation && (
                  <button
                    className="canvas-next"
                    onClick={() =>
                      selectStep(
                        run.steps.find(
                          (s) => s.kind === 'agent' && s.status === 'ready',
                        )!.id,
                      )
                    }
                  >
                    <HarnessIcon name={run.coordinator} />
                    <span>
                      <strong>{continuationLabel(run.continuation)}</strong>
                      {run.continuation.status === 'uncertain'
                        ? t('El conector debe verificar si inició el turno')
                        : run.continuation.status === 'failed'
                          ? t('Abre la tarea para reintentar')
                          : t('Ver estado de la tarea')}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                )}
                {wakeContinuationOpen && (
                  <button
                    type="button"
                    className="canvas-next"
                    onClick={copyPrompt}
                  >
                    <HarnessIcon name={run.coordinator} />
                    <span>
                      <strong>{t('Continuar desde el chat')}</strong>
                      {copied
                        ? t('Pégala en tu chat para continuar')
                        : t(
                            'Respuesta guardada · Copiar continuación (todos los pasos listos)',
                          )}
                    </span>
                    <Copy size={15} />
                  </button>
                )}
                {wakeContinuationOpen && canSendWakeContinuation && (
                  <button
                    type="button"
                    className="canvas-next"
                    onClick={() => {
                      // Phase 1 outbound outbox enqueue; never invent a connector.
                    }}
                  >
                    <Send size={15} />
                    <span>
                      <strong>{t('Enviar')}</strong>
                      {t(
                        'Requiere un conector de reanudación; MCP solo no despierta el chat.',
                      )}
                    </span>
                  </button>
                )}
              </div>
              {resultadoOpen && (step || selectedJob) && (
                <ResultadoStage
                  run={run}
                  step={step}
                  job={step ? undefined : selectedJob}
                  live={!!live}
                  statusLabel={
                    step
                      ? step.status === 'running' && !run.agentWaiting
                        ? `${labels.running} · ${t('chat desconectado')}`
                        : labels[step.status]
                      : selectedJob!.statusLabel
                  }
                  StatusIcon={StatusIcon}
                  section={resultadoSection}
                  onSection={setResultadoSection}
                  onClose={clearResultado}
                  onSelectStep={selectStep}
                  eventLabels={eventLabels}
                  reduceMotion={preferences.reduceMotion}
                  waitingForm={
                    step && step.status === 'waiting' && live ? (
                      <div className="answering-step">
                        <HumanForm
                          key={step.id}
                          step={step}
                          answer={answer}
                          onAnswer={setAnswer}
                          values={outputDraft}
                          onValues={setOutputDraft}
                          busy={busy}
                          online={online}
                          agentWaiting={!!run.agentWaiting}
                          continuation={run.continuation}
                          onSubmit={() =>
                            void act(
                              step.kind === 'manual' ? 'submit' : 'approve',
                              step.id,
                            )
                          }
                          onReject={() => setConfirmation('reject')}
                        />
                      </div>
                    ) : undefined
                  }
                  guidance={
                    step ? (
                      <>
                        {step.status === 'running' &&
                          (() => {
                            const permissionLike = looksLikePermissionDenial(
                              latestStepEvidence(run.events, step.id) ||
                                step.result ||
                                '',
                            );
                            const kind = stuckRunningKind({
                              agentWaiting: !!run.agentWaiting,
                              permissionLike,
                            });
                            return (
                              <div className="step-hint">
                                {kind === 'active-wait' ? (
                                  <LoaderCircle className="spin" size={17} />
                                ) : kind === 'permission' ? (
                                  <LockKeyhole size={17} />
                                ) : (
                                  <Pause size={17} />
                                )}
                                <p>
                                  {kind === 'active-wait'
                                    ? t(
                                        'El agente tiene este paso en curso. Revisa Actividad para ver lo que ya registró.',
                                      )
                                    : kind === 'permission'
                                      ? t(
                                          'Este paso sigue en curso, pero el chat se detuvo tras un acceso denegado. No hay agente esperando.',
                                        )
                                      : t(
                                          'Este paso sigue marcado en curso, pero no hay un chat esperando. El agente no está avanzando solo.',
                                        )}
                                  {kind !== 'active-wait' && live && (
                                    <>
                                      <button
                                        className="secondary"
                                        disabled={busy || !online}
                                        onClick={() => requestRetry(step.id)}
                                      >
                                        {t('Recuperar tarea')}
                                      </button>
                                      <button
                                        className="secondary"
                                        onClick={copyPrompt}
                                      >
                                        {copied
                                          ? t('Pega la petición en tu chat')
                                          : t('Copiar continuación')}
                                      </button>
                                    </>
                                  )}
                                </p>
                              </div>
                            );
                          })()}
                        {showResultadoWakeContinuationCta({
                          live,
                          agentWaiting: !!run.agentWaiting,
                          stepKind: step.kind,
                          stepStatus: step.status,
                        }) && (
                          <div className="step-hint wake-continuation-cta">
                            <Bot size={17} />
                            <p>
                              {t(
                                'Hay trabajo de agente listo y el chat no está en espera. Copia la continuación (incluye todos los pasos listos) y pégala en el chat conectado. MCP solo no despierta el chat.',
                              )}
                              <button
                                className="secondary"
                                onClick={copyPrompt}
                              >
                                {copied
                                  ? t('Pega la petición en tu chat')
                                  : t('Copiar continuación')}
                              </button>
                              {canSendWakeContinuation ? (
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => {
                                    /* Phase 1 Enviar enqueue */
                                  }}
                                >
                                  <Send size={15} />
                                  {t('Enviar')}
                                </button>
                              ) : null}
                            </p>
                          </div>
                        )}
                        {step.status === 'ready' &&
                          live &&
                          !!run.agentWaiting &&
                          step.kind === 'agent' && (
                            <div className="step-hint">
                              <Bot size={17} />
                              <p>
                                {t(
                                  'Este paso está listo. El agente sigue en espera activa y lo retomará al confirmar en el canvas—sin escribir listo en el chat.',
                                )}
                              </p>
                            </div>
                          )}
                      </>
                    ) : undefined
                  }
                  detalle={
                    step ? (
                      <div className="step-detail resultado-detalle">
                        <button
                          className="text-button focus-detail"
                          onClick={() => {
                            setFollowing(false);
                            setFocusRequest({
                              id: step.id,
                              nonce: ++focusNonce.current,
                            });
                          }}
                        >
                          <Focus size={15} />
                          {t('Enfocar tarea')}
                        </button>
                        <p className="step-description">
                          {step.description ||
                            (isControl(step)
                              ? t(
                                  'El motor aplica este nodo automáticamente al cumplirse sus condiciones y dependencias.',
                                )
                              : step.kind === 'manual'
                                ? t(
                                    'Comparte la información que necesita el agente para avanzar.',
                                  )
                                : step.kind === 'approval'
                                  ? t(
                                      'Revisa los resultados anteriores y decide si el proceso puede continuar.',
                                    )
                                  : t(
                                      'El agente ejecutará este paso y registrará su resultado aquí.',
                                    ))}
                        </p>
                        {step.kind === 'agent' &&
                          ['failed', 'ready', 'running'].includes(
                            step.status,
                          ) &&
                          live && (
                            <button
                              className="secondary full recovery-button"
                              disabled={busy || !online}
                              onClick={() => requestRetry(step.id)}
                            >
                              <RotateCcw size={16} />{' '}
                              {step.status === 'running'
                                ? t('Recuperar tarea')
                                : t('Reintentar paso')}
                            </button>
                          )}
                        <dl className="step-meta">
                          <div>
                            <dt>{t('Responsable')}</dt>
                            <dd>
                              {step.kind === 'agent' ? (
                                <HarnessIcon name={run.coordinator} />
                              ) : (
                                <UserRound size={14} />
                              )}{' '}
                              {isControl(step)
                                ? 'Hyperion'
                                : step.kind === 'agent'
                                  ? null
                                  : t('Tú')}
                            </dd>
                          </div>
                          <div>
                            <dt>{t('Tipo de paso')}</dt>
                            <dd>{kindLabels[step.kind]}</dd>
                          </div>
                          {step.attempt > 0 && (
                            <div>
                              <dt>{t('Intento')}</dt>
                              <dd>#{step.attempt}</dd>
                            </div>
                          )}
                        </dl>
                        {step.dependencies.length > 0 && (
                          <div className="dependencies">
                            <h3>{t('Depende de')}</h3>
                            {step.dependencies.map((id) => {
                              const dependency = run.steps.find(
                                (s) => s.id === id,
                              )!;
                              return (
                                <button key={id} onClick={() => selectStep(id)}>
                                  <span
                                    className={`dependency-icon ${dependency.status}`}
                                  >
                                    <StatusIcon
                                      status={dependency.status}
                                      size={13}
                                    />
                                  </span>
                                  <span>{dependency.title}</span>
                                  <ChevronRight size={13} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {step.status === 'blocked' && (
                          <div className="step-hint">
                            <LockKeyhole size={16} />
                            <p>
                              {t('Este paso se habilitará cuando termine:')}{' '}
                              {blockedReason}.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : undefined
                  }
                  io={step ? <ContractView step={step} run={run} /> : undefined}
                  logs={step ? <TraceView step={step} run={run} /> : undefined}
                />
              )}
            </section>
          )}
        </main>
      </div>
      {popup && !confirmation && !help && (
        <Modal
          active={!conflictRow && !replaceConfirm}
          returnFocus={popupTrigger.current}
          onClose={() => setPopup(null)}
        >
          <section
            className={`modal canvas-popup${popup === 'activity' ? ' step-popup' : ''}${popup === 'connections' ? ' connections-popup' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title"
            onClickCapture={
              popup === 'connections'
                ? (event) => {
                    const button = (event.target as HTMLElement).closest(
                      'button',
                    );
                    if (button) connectionTrigger.current = button;
                  }
                : undefined
            }
          >
            {popup !== 'connections' && (
              <button
                className="modal-close icon-button"
                aria-label={t('Cerrar popup')}
                onClick={() => setPopup(null)}
              >
                <X size={19} />
              </button>
            )}
            {error && (
              <p role="alert" className="popup-error">
                {error}
              </p>
            )}
            {popup === 'activity' && run && (
              <div className="activity-list">
                <h2 id="popup-title">{t('Historial del flujo')}</h2>
                <p className="muted">
                  {streaming
                    ? t('En directo · acciones y decisiones registradas')
                    : t('Actualización periódica · reconectando eventos')}
                </p>
                {!!run.planChanges?.length && (
                  <PlanChanges
                    changes={run.planChanges}
                    revision={run.revision}
                  />
                )}
                {[...run.events].reverse().map((e) => (
                  <article key={e.sequence}>
                    <span
                      className={`activity-symbol ${e.type === 'submit' || e.type === 'approve' ? 'human' : ''}`}
                    >
                      {['submit', 'approve', 'reject'].includes(e.type) ? (
                        <UserRound size={14} />
                      ) : (
                        <Bot size={14} />
                      )}
                    </span>
                    <div>
                      <strong>{eventLabels[e.type] || e.type}</strong>
                      <small>
                        <HarnessIcon name={e.actor} /> · {time(e.at)}
                      </small>
                      {e.stepId && (
                        <button
                          onClick={() => {
                            setPopup(null);
                            selectStep(e.stepId!);
                          }}
                        >
                          {run.steps.find((s) => s.id === e.stepId)?.title}
                        </button>
                      )}
                      {e.message && <p>{e.message}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {popup === 'next-cycle' && run && (
              <div className="next-cycle-form">
                <h2 id="popup-title">{t('Un nuevo inicio')}</h2>
                <p>
                  {t(
                    'El recorrido completado se conserva. Describe lo siguiente y copia la petición para pegarla en tu chat. El agente debe crear el recorrido enlazado; copiar no notifica al chat.',
                  )}
                </p>
                <label htmlFor="next-request">
                  {t('¿Qué quieres hacer ahora?')}
                </label>
                <textarea
                  id="next-request"
                  value={nextRequest}
                  onChange={(event) => setNextRequest(event.target.value)}
                  maxLength={8000}
                  rows={4}
                />
                <div className="next-cycle-actions">
                  <button
                    className="primary full"
                    disabled={!nextRequest.trim()}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          t(
                            'Usa Hyperion para continuar desde el flujo completado {0}. Crea un nuevo recorrido enlazado a ese flujo y conserva su historial. Mi nueva petición: {1}',
                            { 0: run.id, 1: nextRequest.trim() },
                          ),
                        )
                        .then(() => setNotice(t('Pega la petición en tu chat')))
                        .catch(() => setError(t('No se pudo copiar.')));
                    }}
                  >
                    <Copy size={16} />
                    {t('Copiar petición para el chat')}
                  </button>
                  {canSendNewBeginningToChat({
                    // Phase 0: no host ResumeConnector is certified → hide Enviar.
                    // Phase 1+: pass outboundSendConfiguredFromResumeConnector(hostConnector, harness).
                    outboundSendConfigured: false,
                  }) ? (
                    <button
                      type="button"
                      className="secondary full"
                      disabled={!nextRequest.trim()}
                      onClick={() => {
                        // Phase 1 outbound outbox will perform delivery; never invent a connector here.
                      }}
                    >
                      <Send size={16} />
                      {t('Enviar')}
                    </button>
                  ) : (
                    <p className="muted next-cycle-send-hint">
                      {t(
                        'Pega la petición en el chat conectado. El envío automático al chat requiere un conector de envío; MCP solo no despierta el chat.',
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
            {popup === 'legend' && <FlowLegend />}
            {popup === 'about' && (
              <div className="about-panel">
                <span className="eyebrow">{t('HYPERION')}</span>
                <h2 id="popup-title">{t('Acerca de Hyperion')}</h2>
                <p
                  className="connections-calver"
                  title={t('Versión de Hyperion')}
                >
                  {t('Hyperion {0} UTC · {1}', {
                    0: connections.inventory?.version || VERSION,
                    1:
                      connections.inventory?.channel ||
                      RELEASE_CHANNEL ||
                      'preview',
                  })}
                </p>
                <p className="muted">
                  {t(
                    'El servicio local de Hyperion responde en este equipo. No indica que tu aplicación de IA tenga herramientas cargadas.',
                  )}
                </p>
                {isElectron && (
                  <p className="muted">
                    {t(
                      'Para buscar actualizaciones usa Hyperion → Buscar actualizaciones… en el menú de la aplicación.',
                    )}
                  </p>
                )}
              </div>
            )}
            {popup === 'settings' && (
              <Settings
                value={preferences}
                onChange={setPreferences}
                onOpenConnections={openConnections}
              />
            )}
            {popup === 'connections' && (
              <ConnectionsView
                online={online}
                inventory={connections.inventory}
                error={connections.error || setupError}
                inventoryError={connections.error}
                notice={setupNotice}
                busy={connections.busy || busy}
                onClose={() => setPopup(null)}
                onRefresh={() => void connections.refresh()}
                onSetup={(id) => void setupConnection(id)}
                onConflict={(row) => {
                  setSetupError(null);
                  setConflictRow(row);
                }}
                onHelp={() => {
                  setPopup(null);
                  setHelp(true);
                }}
              />
            )}
            {popup === 'guide' && (
              <div className="usage-guide">
                <span className="eyebrow">{t('GUÍA DE USO')}</span>
                <h2 id="popup-title">{t('De la conversación al flujo')}</h2>
                <ol>
                  <li>
                    <strong>{t('Pide en tu chat')}</strong>
                    <span>
                      {t(
                        '«Usa Hyperion para [actividad]». Tu agente crea el plan y comparte el enlace.',
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t('Explora trabajos y pasos')}</strong>
                    <span>
                      {t(
                        'En «Más opciones», «Ver trabajos» resume el plan. Pulsa un trabajo para desplegar el detalle. «Ajustes» permite elegir tema y navegación.',
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t('Enfoca una tarea')}</strong>
                    <span>
                      {t(
                        'Elige en «Ir a tarea». Abre detalles, datos o logs desde sus botones. «Vista general» muestra todo el flujo.',
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t('Sigue el avance')}</strong>
                    <span>
                      {t(
                        'Activa «Seguir actividad». La vista avanza a la tarea que requiere atención. Mover o ampliar el canvas vuelve a vista libre.',
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t('Participa')}</strong>
                    <span>
                      {t(
                        'En «Tu turno», lee la pregunta y guarda tu elección. I/O muestra entradas y salidas; Logs muestra acciones y resultados.',
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t('Continúa en tu chat')}</strong>
                    <span>
                      {t(
                        '«Continuar en…» copia una petición. Pégala en el mismo chat para que el agente retome el flujo.',
                      )}
                    </span>
                  </li>
                </ol>
                <p className="guide-note">
                  {t(
                    'El seguimiento mueve la vista. La ejecución continúa en tu herramienta de IA.',
                  )}
                </p>
              </div>
            )}
            {popup === 'request' && run && (
              <div className="request-popup">
                <span className="eyebrow">
                  <Bot size={16} />
                  {t('Creado desde')} {titleCase(run.coordinator)}
                </span>
                <h2 id="popup-title">{t('Petición original')}</h2>
                <p>
                  {run.request ||
                    t('Este flujo anterior no conserva la petición original.')}
                </p>
                {run.description && (
                  <p className="request-description">{run.description}</p>
                )}
                <div className="code-note">
                  {t('ID del flujo:')} {run.id}
                </div>
                <p className="muted">
                  {t(
                    'El agente registra los pasos desde tu petición. Cada nodo mantiene sus instrucciones, resultados y acciones en este canvas.',
                  )}
                </p>
              </div>
            )}
            {popup === 'runs' && (
              <>
                <h2 id="popup-title">{t('Mis flujos')}</h2>
                <p>{t('Elige el workflow que quieres abrir en el canvas.')}</p>
                <div className="popup-run-list">
                  {runs.map((item) => (
                    <button
                      className={run?.id === item.id ? 'selected' : ''}
                      key={item.id}
                      onClick={() => selectRun(item.id)}
                    >
                      <span className={`tiny-dot ${item.status}`} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {titleCase(item.coordinator)} ·{' '}
                          {runLabels[item.status]}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!runs.length && (
                    <p>
                      {t(
                        'Tus flujos aparecerán aquí cuando tu agente los registre.',
                      )}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </Modal>
      )}
      {help && (
        <Modal
          returnFocus={popupTrigger.current}
          onClose={() => setHelp(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label={t('Cerrar ayuda')}
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="empty-symbol">
              <Bot size={27} />
            </span>
            {connections.inventory && (
              <div className="help-integrations-strip">
                <strong>{t('Estado de tus integraciones')}</strong>
                <p>
                  {connectionsSummaryLine(connections.inventory.summary)}
                  {' · '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={openConnections}
                  >
                    {t('Abrir conexiones')}
                  </button>
                </p>
              </div>
            )}
            <h2 id="help-title">{t('Tu agente, conectado a Hyperion.')}</h2>
            <p>
              {t(
                'Haz la petición en Codex, Claude, Cursor o tu herramienta conectada. El agente registra un plan y ejecuta sus tareas; tú respondes y apruebas aquí.',
              )}
            </p>
            <p className="muted">
              {t(
                'ChatGPT Desktop no usa el MCP stdio de este equipo. Work mode no es un requisito de Hyperion. Para Hyperion en local usa Cursor, Codex, Claude Desktop o Claude Code.',
              )}
            </p>
            <ol>
              <li>
                <strong>{t('Plantea tu objetivo')}</strong>
                <span>{t('«Usa Hyperion para guiarme paso a paso…»')}</span>
              </li>
              <li>
                <strong>{t('Participa desde el flujo')}</strong>
                <span>
                  {t('Selecciona los pasos que indiquen «Tu turno».')}
                </span>
              </li>
              <li>
                <strong>{t('Continúa en el chat')}</strong>
                <span>
                  {t(
                    'Tras responder, pide al agente que lea el estado y continúe.',
                  )}
                </span>
              </li>
            </ol>
            <div className="code-note">
              {t(
                'Escribe en tu chat: «Usa Hyperion para [tu actividad]». El agente conecta el canvas y crea el plan. Aquí no necesitas escribir comandos.',
              )}
            </div>
            <p className="muted">
              {t(
                'Esta versión coordina a un agente externo. No inicia agentes ni conversaciones automáticamente.',
              )}
            </p>
            <button className="primary full" onClick={copyPrompt}>
              <Copy size={16} />
              {copied
                ? t('Petición copiada')
                : t('Copiar petición para mi agente')}
            </button>
          </section>
        </Modal>
      )}
      {conflictRow && (
        <Modal
          active={!replaceConfirm}
          returnFocus={connectionReturnFocus}
          onClose={() => setConflictRow(null)}
        >
          <section
            className="modal conflict-resolver conflict-layer"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="conflict-title"
            onClick={(e) => e.stopPropagation()}
          >
            <ConflictResolverBody
              row={conflictRow}
              onReplace={() => {
                replaceTrigger.current = document.querySelector<HTMLElement>(
                  '.conflict-resolver .primary',
                );
                setSetupError(null);
                setReplaceConfirm(conflictRow);
              }}
              onCopyPath={() =>
                void navigator.clipboard.writeText(conflictRow.path || '')
              }
              onGuide={() => {
                setConflictRow(null);
                setHelp(true);
              }}
              onClose={() => setConflictRow(null)}
            />
          </section>
        </Modal>
      )}
      {replaceConfirm && (
        <Modal
          returnFocus={() =>
            replaceTrigger.current?.isConnected
              ? replaceTrigger.current
              : connectionReturnFocus()
          }
          onClose={() => {
            if (!connectionSetupPending.current) setReplaceConfirm(null);
          }}
        >
          <section
            className="modal compact conflict-layer"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="replace-title"
            aria-busy={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="replace-title">{t('¿Reemplazar la conexión Hyperion?')}</h2>
            <p>
              {t(
                'Se sobrescribirá la entrada «hyperion» en {0}. Se crea un respaldo del archivo. Esta acción no se puede deshacer desde Hyperion.',
                { 0: replaceConfirm.name },
              )}
            </p>
            {setupError && (
              <p role="alert" className="popup-error">
                {formatConnectionMessage(setupError)}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setReplaceConfirm(null)}
              >
                {t('Cancelar')}
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void setupConnection(replaceConfirm.id, true)}
              >
                {t('Reemplazar conexión')}
              </button>
            </div>
          </section>
        </Modal>
      )}
      {confirmation && (
        <Modal
          returnFocus={popupTrigger.current}
          onClose={() => setConfirmation(null)}
        >
          <section
            className={`modal compact ${confirmation === 'retry' ? 'recovery-confirm' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirmation === 'cancel'
                ? t('Cancelar este flujo')
                : confirmation === 'retry'
                  ? t('Recuperar tarea atascada')
                  : t('Rechazar este paso')}
            </h2>
            <p>
              {confirmation === 'retry'
                ? t(
                    'Se habilitará un nuevo intento conservando tus respuestas y el historial. Esto no cancela herramientas externas: el agente debe comprobar qué terminó antes de repetir acciones.',
                  )
                : t(
                    'El flujo quedará cerrado. Esta decisión no deshace acciones que el agente ya haya ejecutado.',
                  )}
            </p>
            {confirmation === 'reject' && (
              <>
                <label htmlFor="rejection-reason">
                  {t('Motivo del rechazo')}
                </label>
                <textarea
                  id="rejection-reason"
                  rows={3}
                  maxLength={8000}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </>
            )}
            {error && (
              <p role="alert" className="popup-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                {t('Volver')}
              </button>
              <button
                className="danger"
                disabled={
                  busy ||
                  !online ||
                  (confirmation === 'reject' && !answer.trim())
                }
                onClick={() =>
                  void act(
                    confirmation,
                    confirmation === 'retry'
                      ? retryTarget
                      : confirmation === 'reject'
                        ? step?.id
                        : undefined,
                  )
                }
              >
                {t('Confirmar')}{' '}
                {confirmation === 'cancel'
                  ? t('cancelación')
                  : confirmation === 'retry'
                    ? t('recuperación')
                    : t('rechazo')}
              </button>
            </div>
          </section>
        </Modal>
      )}
    </div>
  );
}
