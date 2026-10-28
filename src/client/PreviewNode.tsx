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
  previewTileCompactLayout,
  previewTileMediumLayout,
  previewTileMiniContainScale,
  previewTileMountsIframe,
  previewTileStageLayout,
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
  /** React Flow pane size for stage geometry (Arch G4). */
  paneSize: { width: number; height: number };
  onSelectProducer: (stepId: string) => void;
  onTileUiChange: (next: PreviewTileUiState) => void;
  /** After Abrir opens a separate tab — shell/run stay; show return cue. */
  onOpenedInBrowser?: () => void;
};

function sizeOptionLabel(size: PreviewTileSize): string {
  if (size === 'medium') return t('Media');
  if (size === 'stage') return t('Escenario');
  return t('Mini');
}

/** Client-only RF citizen: inert preview satellite of a leaf producer. */
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  useLocale();
  const { tileUi } = data;
  const mountsPreview = previewTileMountsIframe(tileUi);
  const mini = tileUi.size === 'mini';
  const stage = tileUi.size === 'stage';
  const medium = tileUi.size === 'medium';
  const stageLayout = previewTileStageLayout(data.paneSize);
  const miniScale = previewTileMiniContainScale();
  const hideLabel = tileUi.collapsed
    ? t('Mostrar artefacto')
    : t('Ocultar artefacto');
  const openLabel = t('Abrir en navegador');
  const openTitle = data.remoteOnly
    ? openLabel
    : t(
        'Abrir en navegador (instantánea local; sin JavaScript de red como en el lienzo)',
      );
  const offerOpen =
    !tileUi.collapsed && canOfferPreviewOpenInBrowser(data.artifact);
  const width = tileUi.collapsed
    ? undefined
    : stage
      ? stageLayout.width
      : medium
        ? previewTileMediumLayout.width
        : previewTileCompactLayout.width;
  const bodyMin = stage
    ? stageLayout.bodyHeight
    : medium
      ? previewTileMediumLayout.bodyHeight
      : previewTileCompactLayout.bodyHeight;

  return (
    <div
      className={`preview-tile${data.emphasized ? ' emphasized' : ''}${
        mini ? ' is-mini' : ''
      }${medium ? ' is-medium' : ''}${stage ? ' is-stage' : ''}${
        tileUi.collapsed ? ' is-collapsed' : ''
      }`}
      style={
        width
          ? {
              width,
              ...(stage ? { zIndex: 8 } : undefined),
            }
          : undefined
      }
      role="group"
      aria-label={
        stage
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
                  if (result.ok) data.onOpenedInBrowser?.();
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
            className={`preview-tile-body nodrag nopan${
              mini ? ' is-mini-contain' : ''
            }`}
            style={{ minHeight: bodyMin, maxHeight: bodyMin + 40 }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onSelectProducer(data.producerStepId)}
          >
            {mini ? (
              <div className="preview-tile-contain-viewport">
                <div
                  className="preview-tile-contain-content"
                  style={{
                    width: previewTileMediumLayout.width,
                    height: previewTileMediumLayout.bodyHeight,
                    transform: `scale(${miniScale})`,
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
            ) : (
              <div className="preview-tile-scale-wrap">
                <ArtifactSandboxPreview
                  runId={data.runId}
                  artifact={data.artifact}
                  siblings={data.siblings}
                  compact={medium}
                />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
