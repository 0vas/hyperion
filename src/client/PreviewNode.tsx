import { ExternalLink, GripVertical } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Artifact } from '../domain/artifacts';
import { ArtifactSandboxPreview } from './ArtifactSandboxPreview';
import {
  previewTileCompactLayout,
  previewTileMountsIframe,
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
  onSelectProducer: (stepId: string) => void;
  onTileUiChange: (next: PreviewTileUiState) => void;
};

/** Client-only RF citizen: inert preview satellite of a leaf producer. */
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  useLocale();
  const { tileUi } = data;
  const mountsPreview = previewTileMountsIframe(tileUi);
  const compact = tileUi.size === 'compact';
  const sizeLabel = tileUi.size === 'expanded' ? t('Compactar') : t('Ampliar');
  return (
    <div
      className={`preview-tile${data.emphasized ? ' emphasized' : ''}${
        compact ? ' is-compact' : ''
      }${tileUi.collapsed ? ' is-collapsed' : ''}`}
      role="group"
      aria-label={t('Vista previa del paso {0}', { 0: data.producerTitle })}
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
            <button
              type="button"
              className="secondary preview-tile-action"
              onClick={(event) => {
                event.stopPropagation();
                data.onTileUiChange({
                  ...tileUi,
                  size: tileUi.size === 'expanded' ? 'compact' : 'expanded',
                });
              }}
            >
              {sizeLabel}
            </button>
          )}
          <button
            type="button"
            className="secondary preview-tile-action"
            onClick={(event) => {
              event.stopPropagation();
              data.onTileUiChange({
                ...tileUi,
                collapsed: !tileUi.collapsed,
              });
            }}
          >
            {tileUi.collapsed ? t('Mostrar vista') : t('Ocultar vista')}
          </button>
        </div>
      </div>
      {mountsPreview &&
        (data.remoteOnly ? (
          <a
            className="secondary preview-tile-remote"
            href={data.artifact.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectProducer(data.producerStepId);
            }}
          >
            <ExternalLink size={15} />
            {t('Abrir enlace')}
          </a>
        ) : (
          <div
            className="preview-tile-body nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onSelectProducer(data.producerStepId)}
          >
            <div
              className={
                compact
                  ? 'preview-tile-scale-wrap is-scaled'
                  : 'preview-tile-scale-wrap'
              }
              style={
                compact
                  ? {
                      transform: `scale(${previewTileCompactLayout.scale})`,
                      transformOrigin: 'top left',
                      width: `${100 / previewTileCompactLayout.scale}%`,
                    }
                  : undefined
              }
            >
              <ArtifactSandboxPreview
                runId={data.runId}
                artifact={data.artifact}
                siblings={data.siblings}
                compact
              />
            </div>
          </div>
        ))}
    </div>
  );
}
