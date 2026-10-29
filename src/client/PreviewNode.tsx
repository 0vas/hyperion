import {
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
} from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Artifact } from '../domain/artifacts';
import {
  ArtifactSandboxPreview,
  OfficeFileIcon,
  PreviewArtifactIcon,
  artifactFileUrl,
} from './ArtifactSandboxPreview';
import {
  officeKindForArtifact,
  previewBubbleIconKind,
} from './preview-type-aesthetics';
import {
  previewTileMountsIframe,
  type PreviewTileUiState,
} from './preview-tile-ui';
import { t, useLocale } from './i18n';

export type PreviewNodeData = {
  producerStepId: string;
  /** UI-only storage identity; Office bubbles are independent per artifact. */
  uiKey: string;
  producerTitle: string;
  runId: string;
  artifact: Artifact;
  siblings: Artifact[];
  remoteOnly: boolean;
  extraCount: number;
  downloadOnly: boolean;
  emphasized: boolean;
  horizontal: boolean;
  tileUi: PreviewTileUiState;
  onSelectProducer: (stepId: string) => void;
  onTileUiChange: (next: PreviewTileUiState) => void;
  /** Full-screen Hyperion-owned view. */
  onOpenInAppShell?: () => void;
  onOpenedRemote?: () => void;
};

/** Client-only RF satellite: standard preview or an Office download bubble. */
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  useLocale();
  const { tileUi } = data;
  const officeKind = officeKindForArtifact(data.artifact);
  const bubbleIconKind = previewBubbleIconKind(data.artifact);
  const mountsPreview = previewTileMountsIframe(tileUi);
  const hideLabel = tileUi.collapsed
    ? t('Mostrar artefacto')
    : t('Ocultar artefacto');
  const expandLabel = t('Ampliar vista');

  if (data.downloadOnly && officeKind) {
    const href =
      data.artifact.url || artifactFileUrl(data.runId, data.artifact);
    return (
      <div
        className="artifact-bubble artifact-download-bubble"
        role="group"
        aria-label={t('Artefacto {0}', { 0: data.artifact.name })}
      >
        <Handle
          type="target"
          position={data.horizontal ? Position.Left : Position.Top}
          className="artifact-bubble-handle"
          isConnectable={false}
        />
        <button
          type="button"
          className="artifact-bubble-drag"
          aria-label={t('Arrastrar artefacto')}
          title={t('Arrastrar artefacto')}
        >
          <GripVertical size={13} aria-hidden="true" />
        </button>
        <a
          className="artifact-bubble-action nodrag nopan"
          href={href}
          aria-label={t('Descargar {0}', { 0: data.artifact.name })}
          title={t('Descargar')}
          onClick={(event) => event.stopPropagation()}
          {...(data.artifact.url
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : { download: data.artifact.name })}
        >
          <OfficeFileIcon kind={officeKind} />
          <span>{data.artifact.name}</span>
          <Download size={14} aria-hidden="true" />
        </a>
      </div>
    );
  }

  if (tileUi.collapsed)
    return (
      <div
        className="artifact-bubble artifact-preview-bubble"
        role="group"
        aria-label={t('Vista previa oculta de {0}', { 0: data.artifact.name })}
      >
        <Handle
          type="target"
          position={data.horizontal ? Position.Left : Position.Top}
          className="artifact-bubble-handle"
          isConnectable={false}
        />
        <button
          type="button"
          className="artifact-bubble-drag"
          aria-label={t('Arrastrar artefacto')}
          title={t('Arrastrar artefacto')}
        >
          <GripVertical size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="artifact-bubble-action nodrag nopan"
          aria-label={t('Mostrar artefacto')}
          title={t('Mostrar artefacto')}
          onClick={() => data.onTileUiChange({ ...tileUi, collapsed: false })}
        >
          <PreviewArtifactIcon kind={bubbleIconKind} />
          <span>{data.artifact.name}</span>
        </button>
      </div>
    );

  return (
    <div
      className={`preview-tile${data.emphasized ? ' emphasized' : ''}`}
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
          <button
            type="button"
            className="secondary icon-button preview-tile-action"
            aria-label={hideLabel}
            title={hideLabel}
            onClick={(event) => {
              event.stopPropagation();
              data.onTileUiChange({ ...tileUi, collapsed: !tileUi.collapsed });
            }}
          >
            {tileUi.collapsed ? (
              <Eye size={15} aria-hidden="true" />
            ) : (
              <EyeOff size={15} aria-hidden="true" />
            )}
          </button>
          {!tileUi.collapsed && !data.remoteOnly && data.onOpenInAppShell && (
            <button
              type="button"
              className="secondary icon-button preview-tile-action"
              aria-label={expandLabel}
              title={expandLabel}
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenInAppShell?.();
              }}
            >
              <Maximize2 size={15} aria-hidden="true" />
            </button>
          )}
          {!tileUi.collapsed && data.remoteOnly && (
            <a
              className="secondary icon-button preview-tile-action"
              href={data.artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('Abrir en navegador')}
              title={t('Abrir en navegador')}
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenedRemote?.();
              }}
            >
              <ExternalLink size={15} aria-hidden="true" />
            </a>
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
            className="preview-tile-body nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onSelectProducer(data.producerStepId)}
          >
            <ArtifactSandboxPreview
              runId={data.runId}
              artifact={data.artifact}
              siblings={data.siblings}
              compact
            />
          </div>
        ))}
    </div>
  );
}
