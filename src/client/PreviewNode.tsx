import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ExternalLink, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Artifact } from '../domain/artifacts';
import { ArtifactSandboxPreview } from './ArtifactSandboxPreview';
import {
  canOfferPreviewOpenInBrowser,
  openPreviewInBrowser,
} from './preview-open-browser';
import {
  PREVIEW_TILE_SIZE_OPTIONS,
  previewTileContainScale,
  previewTileContentViewport,
  previewTileMountsIframe,
  resizePreviewTileFrame,
  resolvePreviewTileFrame,
  type PreviewTileSize,
  type PreviewTileUiState,
} from './preview-tile-ui';
import { t, useLocale } from './i18n';

export type PreviewNodeData = {
  producerStepId: string;
  producerTitle: string;
  runId: string;
  artifact: Artifact;
  /** Producer step artifacts for sibling CSS compose into inert srcDoc. */
  siblings: Artifact[];
  remoteOnly: boolean;
  extraCount: number;
  emphasized: boolean;
  horizontal: boolean;
  tileUi: PreviewTileUiState;
  /** React Flow pane size for soft-cap (Arch G4 / J5). */
  paneSize: { width: number; height: number };
  onSelectProducer: (stepId: string) => void;
  onTileUiChange: (next: PreviewTileUiState) => void;
  /** Local Abrir → in-app Hyperion chrome shell (Track I / J1). */
  onOpenInAppShell?: () => void;
  /** After remote Abrir in OS/tab — optional secondary toast. */
  onOpenedRemote?: () => void;
};

function sizeOptionLabel(size: PreviewTileSize): string {
  if (size === 'tablet') return t('Tableta');
  if (size === 'desktop') return t('Escritorio');
  return t('Móvil');
}

type ResizeEdge = 'e' | 's' | 'se';

/** Client-only RF citizen: inert preview satellite of a leaf producer. */
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  useLocale();
  const { tileUi } = data;
  const mountsPreview = previewTileMountsIframe(tileUi);
  const content = previewTileContentViewport(tileUi.size);
  const frame = resolvePreviewTileFrame(tileUi, data.paneSize);
  const containScale = previewTileContainScale(frame, content);
  const desktop = tileUi.size === 'desktop';
  const hideLabel = tileUi.collapsed
    ? t('Mostrar artefacto')
    : t('Ocultar artefacto');
  const openLabel = t('Abrir');
  const openTitle = data.remoteOnly
    ? t('Abrir en navegador')
    : t('Abrir (vista en Hyperion; sin JavaScript de red como en el lienzo)');
  const offerOpen =
    !tileUi.collapsed && canOfferPreviewOpenInBrowser(data.artifact);
  const width = tileUi.collapsed ? undefined : frame.width;
  const bodyMin = frame.bodyHeight;
  const resizeStart = useRef<{
    edge: ResizeEdge;
    x: number;
    y: number;
    width: number;
    bodyHeight: number;
  } | null>(null);

  const onResizePointerDown = useCallback(
    (edge: ResizeEdge) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      resizeStart.current = {
        edge,
        x: event.clientX,
        y: event.clientY,
        width: frame.width,
        bodyHeight: frame.bodyHeight,
      };
    },
    [frame.bodyHeight, frame.width],
  );

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = resizeStart.current;
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      let nextW = start.width;
      let nextH = start.bodyHeight;
      if (start.edge === 'e' || start.edge === 'se') nextW = start.width + dx;
      if (start.edge === 's' || start.edge === 'se')
        nextH = start.bodyHeight + dy;
      // J5: frame only — never mutate resolution `size`.
      data.onTileUiChange(
        resizePreviewTileFrame(tileUi, {
          width: nextW,
          bodyHeight: nextH,
        }),
      );
    },
    [data, tileUi],
  );

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeStart.current) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      resizeStart.current = null;
    },
    [],
  );

  return (
    <div
      className={`preview-tile${data.emphasized ? ' emphasized' : ''}${
        desktop ? ' is-desktop' : ''
      } is-${tileUi.size}${tileUi.collapsed ? ' is-collapsed' : ''}`}
      style={
        width
          ? {
              width,
              ...(desktop ? { zIndex: 8 } : undefined),
            }
          : undefined
      }
      role="group"
      aria-label={
        desktop
          ? t('Vista previa a casi pantalla completa')
          : t('Vista previa del paso {0}', { 0: data.producerTitle })
      }
    >
      <Handle
        type="target"
        position={data.horizontal ? Position.Left : Position.Top}
        className="preview-tile-handle"
        isConnectable={false}
      />
      <div className="preview-tile-chrome">
        <button
          type="button"
          className="preview-tile-drag"
          aria-label={t('Arrastrar vista previa')}
          title={t('Arrastrar vista previa')}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="preview-tile-chrome-main"
          onClick={() => data.onSelectProducer(data.producerStepId)}
        >
          <span className="eyebrow">{t('Vista previa')}</span>
          <strong>{data.artifact.name}</strong>
          {data.extraCount > 0 && (
            <span className="preview-tile-extra">
              {t('+{0} archivos', { 0: data.extraCount })}
            </span>
          )}
        </button>
        <div className="preview-tile-actions">
          {!tileUi.collapsed && (
            <label className="preview-tile-resolution">
              <span className="preview-tile-resolution-label">
                {t('Resolución')}
              </span>
              <select
                className="preview-tile-resolution-select"
                aria-label={t('Resolución')}
                title={t('Resolución')}
                value={tileUi.size}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  data.onTileUiChange({
                    ...tileUi,
                    size: event.target.value as PreviewTileSize,
                  });
                }}
              >
                {PREVIEW_TILE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {sizeOptionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="secondary icon-button preview-tile-action"
            aria-label={hideLabel}
            title={hideLabel}
            onClick={(event) => {
              event.stopPropagation();
              data.onTileUiChange({
                ...tileUi,
                collapsed: !tileUi.collapsed,
              });
            }}
          >
            {tileUi.collapsed ? (
              <Eye size={15} aria-hidden="true" />
            ) : (
              <EyeOff size={15} aria-hidden="true" />
            )}
          </button>
          {offerOpen && (
            <button
              type="button"
              className="secondary preview-tile-action preview-tile-action-text"
              aria-label={openLabel}
              title={openTitle}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelectProducer(data.producerStepId);
                void (async () => {
                  const result = await openPreviewInBrowser(
                    data.runId,
                    data.artifact,
                    data.siblings,
                  );
                  if (!result.ok) return;
                  if (result.via === 'in-app-shell') {
                    data.onOpenInAppShell?.();
                    return;
                  }
                  data.onOpenedRemote?.();
                })();
              }}
            >
              <ExternalLink size={15} aria-hidden="true" />
              <span>{openLabel}</span>
            </button>
          )}
        </div>
      </div>
      {mountsPreview &&
        (data.remoteOnly ? (
          <button
            type="button"
            className="preview-tile-remote-body nodrag nopan"
            onClick={() => data.onSelectProducer(data.producerStepId)}
          >
            <span className="muted">
              {t('Enlace remoto — ábrelo desde el cromo')}
            </span>
          </button>
        ) : (
          <div
            className="preview-tile-body nodrag nopan is-contain"
            style={{ minHeight: bodyMin, maxHeight: bodyMin + 40 }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onSelectProducer(data.producerStepId)}
          >
            <div className="preview-tile-contain-viewport">
              <div
                className="preview-tile-contain-content"
                style={{
                  width: content.width,
                  height: content.bodyHeight,
                  transform: `scale(${containScale})`,
                }}
              >
                <ArtifactSandboxPreview
                  runId={data.runId}
                  artifact={data.artifact}
                  siblings={data.siblings}
                  compact
                />
              </div>
            </div>
          </div>
        ))}
      {!tileUi.collapsed && (
        <>
          <div
            className="preview-tile-resize preview-tile-resize-e nodrag nopan"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('Redimensionar ancho del marco')}
            onPointerDown={onResizePointerDown('e')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
          <div
            className="preview-tile-resize preview-tile-resize-s nodrag nopan"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('Redimensionar alto del marco')}
            onPointerDown={onResizePointerDown('s')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
          <div
            className="preview-tile-resize preview-tile-resize-se nodrag nopan"
            role="separator"
            aria-label={t('Redimensionar marco')}
            onPointerDown={onResizePointerDown('se')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
        </>
      )}
    </div>
  );
}
