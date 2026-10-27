import { t, useLocale, localizedLabels } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Controls,
  ControlButton,
  useReactFlow,
  useStore,
  getNodesBounds,
  getViewportForBounds,
  type Node,
} from '@xyflow/react';
import {
  Focus,
  LayoutGrid,
  ArrowRight,
  ArrowDown,
  Scan,
  ArrowUpRight,
  ArrowRightLeft,
  ListTree,
  LocateFixed,
} from 'lucide-react';
import type { Run, Step } from '../domain/workflow';
import { canvasInsets } from './viewport';
import { motionDuration } from './preferences';
import { attentionStep } from './attention';
const statuses: Record<string, string> = localizedLabels({
  blocked: 'En espera',
  ready: 'Espera al agente',
  running: 'En curso',
  waiting: 'Tu turno',
  completed: 'Completada',
  failed: 'Falló',
  rejected: 'Rechazada',
  skipped: 'Omitida',
});
export type FocusRequest = { id: string; nonce: number } | null;
export function TaskNavigation({
  run,
  onReset,
  canReset,
  orientation,
  onOrientation,
  view,
  following,
  onFollowing,
  suspended,
  available,
  request,
  onSelect,
  onFocused,
}: {
  run: Run;
  onReset: () => void;
  canReset: boolean;
  orientation: 'vertical' | 'horizontal';
  onOrientation: () => void;
  view: string;
  following: boolean;
  onFollowing: (value: boolean) => void;
  suspended: boolean;
  available: boolean;
  request: FocusRequest;
  onSelect: (id: string, view?: 'step' | 'io' | 'trace') => void;
  onFocused: (id: string) => void;
}) {
  useLocale();
  const { getNode, getNodes, getInternalNode, setViewport } =
    useReactFlow<Node<{ step: Step }>>();
  const width = useStore((s) => s.width),
    height = useStore((s) => s.height);
  const initialized = useStore(
    (s) =>
      s.nodeLookup.size > 0 &&
      [...s.nodeLookup.values()].every((n) =>
        Boolean(n.measured?.width && n.measured?.height),
      ),
  );
  const [focused, setFocused] = useState('');
  const current = attentionStep(run.steps, focused);
  const tasks = run.steps.filter((s) =>
    ['agent', 'manual', 'approval'].includes(s.kind),
  );
  const selected =
    tasks.find((s) => s.id === focused) || current || tasks.at(-1);
  const lastFollow = useRef('');
  const lastRequest = useRef(-1);
  const focus = useCallback(
    (id: string) => {
      const producerId = id.startsWith('preview:')
        ? id.slice('preview:'.length)
        : id;
      const child = run.steps.find((s) => s.id === producerId);
      const producer =
        getNode(producerId) ||
        getNode(id) ||
        (child?.jobId ? getNode(`job:${child.jobId}`) : undefined);
      if (!producer) return;
      const preview = getNode(`preview:${producerId}`);
      const targets = preview
        ? [getInternalNode(producer.id)!, getInternalNode(preview.id)!].filter(
            Boolean,
          )
        : [getInternalNode(producer.id)!].filter(Boolean);
      const bounds =
        targets.length > 1
          ? getNodesBounds(targets)
          : {
              x: producer.position.x,
              y: producer.position.y,
              width: producer.measured?.width || 280,
              height: producer.measured?.height || 200,
            };
      const { top, bottom } = canvasInsets;
      const visibleHeight = Math.max(80, height - top - bottom);
      const zoom = Math.min(
        1,
        Math.max(
          0.15,
          Math.min(
            (width - 48) / Math.max(bounds.width, 1),
            visibleHeight / Math.max(bounds.height, 1),
          ),
        ),
      );
      const centerY = top + visibleHeight / 2;
      void setViewport(
        {
          x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
          y: centerY - (bounds.y + bounds.height / 2) * zoom,
          zoom,
        },
        {
          duration: motionDuration(),
        },
      );
      setFocused(producerId);
      onFocused(producerId);
    },
    [
      getNode,
      getInternalNode,
      setViewport,
      width,
      height,
      onFocused,
      run.steps,
    ],
  );
  useEffect(() => {
    if (!following) {
      lastFollow.current = '';
      return;
    }
    if (
      (!current && run.status !== 'paused') ||
      ['completed', 'cancelled', 'rejected'].includes(run.status)
    ) {
      onFollowing(false);
      return;
    }
    if (
      !current ||
      suspended ||
      !available ||
      run.status === 'paused' ||
      !initialized
    )
      return;
    const target = `${view}:${current.id}:${width}:${height}`;
    if (lastFollow.current !== target) {
      lastFollow.current = target;
      focus(current.id);
    }
  }, [
    following,
    view,
    suspended,
    available,
    run.status,
    width,
    height,
    initialized,
    current?.id,
    focus,
    onFollowing,
  ]);
  useEffect(() => {
    if (
      request &&
      initialized &&
      !suspended &&
      lastRequest.current !== request.nonce
    ) {
      lastRequest.current = request.nonce;
      focus(request.id);
    }
  }, [request, initialized, suspended, focus]);
  const overview = () => {
    onFollowing(false);
    onFocused('');
    const bounds = getNodesBounds(
      getNodes().map((n) => getInternalNode(n.id)!),
    );
    const viewport = getViewportForBounds(
      bounds,
      width - canvasInsets.side * 2,
      Math.max(100, height - canvasInsets.top - canvasInsets.bottom),
      0.15,
      1,
      0.12,
    );
    void setViewport(
      {
        ...viewport,
        x: viewport.x + canvasInsets.side,
        y: viewport.y + canvasInsets.top,
      },
      {
        duration: motionDuration(),
      },
    );
  };
  const focusCurrent = () => {
    onFollowing(false);
    if (current || selected) focus((current || selected)!.id);
  };
  return (
    <>
      <Controls
        showInteractive={false}
        showFitView={false}
        onZoomIn={() => onFollowing(false)}
        onZoomOut={() => onFollowing(false)}
      >
        <ControlButton
          onClick={overview}
          aria-label={t('Vista general')}
          title={t('Vista general')}
        >
          <Scan style={{ fill: 'none' }} />
        </ControlButton>
        <ControlButton
          onClick={focusCurrent}
          aria-label={t('Enfocar paso actual')}
          title={t('Tarea actual')}
        >
          <Focus style={{ fill: 'none' }} />
        </ControlButton>
        <ControlButton
          onClick={onReset}
          disabled={!canReset}
          aria-label={t('Ordenar flujo')}
          title={t('Ordenar flujo')}
        >
          <LayoutGrid style={{ fill: 'none' }} />
        </ControlButton>
      </Controls>
      <section
        className="task-navigation"
        aria-label={t('Navegación de tareas')}
      >
        <div className="task-navigation-heading">
          <label htmlFor="focus-task">{t('Ir a tarea')}</label>
          <span aria-live="polite">
            {following
              ? suspended || !available || run.status === 'paused'
                ? t('Seguimiento en pausa')
                : t('Siguiendo actividad')
              : t('Vista libre')}
          </span>
        </div>
        <select
          id="focus-task"
          value={selected?.id || ''}
          disabled={!tasks.length}
          onChange={(e) => {
            onFollowing(false);
            focus(e.target.value);
          }}
        >
          {!tasks.length && <option value="">{t('Sin tareas')}</option>}
          {tasks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.jobId
                ? `${run.jobs?.find((j) => j.id === s.jobId)?.title} / `
                : ''}
              {s.title} · {statuses[s.status]}
            </option>
          ))}
        </select>
        <div className="task-navigation-actions">
          <button
            aria-label={t('Ver flujo {0}', {
              0: orientation === 'vertical' ? 'horizontal' : 'vertical',
            })}
            title={t('Ver flujo {0}', {
              0: orientation === 'vertical' ? 'horizontal' : 'vertical',
            })}
            onClick={onOrientation}
          >
            {orientation === 'vertical' ? (
              <ArrowRight size={17} />
            ) : (
              <ArrowDown size={17} />
            )}
          </button>
          <button
            className="follow-toggle"
            aria-label={t('Seguir actividad')}
            title={t('Seguir actividad')}
            aria-pressed={following}
            disabled={
              (!current && !following) ||
              ['completed', 'cancelled', 'rejected'].includes(run.status)
            }
            onClick={() => onFollowing(!following)}
          >
            <LocateFixed size={15} />
            <span>{t('Seguir actividad')}</span>
          </button>
          <button
            aria-label={t('Abrir tarea enfocada')}
            title={t('Abrir tarea')}
            disabled={!selected}
            onClick={() => selected && onSelect(selected.id)}
          >
            <ArrowUpRight size={17} />
          </button>
          <button
            aria-label={t('Datos de la tarea enfocada')}
            title={t('Datos')}
            disabled={!selected}
            onClick={() => selected && onSelect(selected.id, 'io')}
          >
            <ArrowRightLeft size={17} />
          </button>
          <button
            aria-label={t('Logs de la tarea enfocada')}
            title="Logs"
            disabled={!selected}
            onClick={() => selected && onSelect(selected.id, 'trace')}
          >
            <ListTree size={17} />
          </button>
        </div>
      </section>
    </>
  );
}
