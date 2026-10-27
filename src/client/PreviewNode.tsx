import { ExternalLink } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Artifact } from '../domain/artifacts';
import { ArtifactSandboxPreview } from './ArtifactSandboxPreview';
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
  onSelectProducer: (stepId: string) => void;
};

/** Client-only RF citizen: inert preview satellite of a leaf producer. */
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  useLocale();
  return (
    <div
      className={`preview-tile nodrag nopan${data.emphasized ? ' emphasized' : ''}`}
      role="group"
      aria-label={t('Vista previa del paso {0}', { 0: data.producerTitle })}
    >
      <Handle
        type="target"
        position={data.horizontal ? Position.Left : Position.Top}
        className="preview-tile-handle"
        isConnectable={false}
      />
      <button
        type="button"
        className="preview-tile-chrome"
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
      {data.remoteOnly ? (
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
          className="preview-tile-body"
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
      )}
    </div>
  );
}
