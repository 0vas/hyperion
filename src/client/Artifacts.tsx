import { useState } from 'react';
import { Download, ExternalLink, FileText, Package } from 'lucide-react';
import type { Artifact } from '../domain/artifacts';
import type { Step } from '../domain/workflow';
import { isSandboxedMarkup } from './artifact-preview';
import {
  ArtifactSandboxPreview,
  artifactFileUrl,
} from './ArtifactSandboxPreview';
import { t, useLocale } from './i18n';

function ArtifactCard({
  runId,
  artifact,
  attempt,
  autoOpen = false,
}: {
  runId: string;
  artifact: Artifact;
  attempt: number;
  autoOpen?: boolean;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(autoOpen);
  const preview =
    !artifact.url &&
    (/^image\/(png|jpeg|gif|webp)$/.test(artifact.mediaType) ||
      ((/^text\//.test(artifact.mediaType) ||
        ['application/json', 'image/svg+xml'].includes(artifact.mediaType)) &&
        (artifact.size || 0) <= 256 * 1024));
  return (
    <li className="artifact-card">
      <div className="artifact-heading">
        <FileText size={19} />
        <strong>{artifact.name}</strong>
      </div>
      <p className="muted">
        {artifact.url
          ? new URL(artifact.url).hostname
          : `${artifact.mediaType} · ${((artifact.size || 0) / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KiB`}{' '}
        · {new Date(artifact.createdAt).toLocaleString(locale)}
      </p>
      {artifact.attempt !== attempt && (
        <p className="muted">
          {t('Intento anterior: {0}', { 0: artifact.attempt })}
        </p>
      )}
      <div className="artifact-actions">
        {preview && (
          <button
            className="secondary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t('Ocultar vista previa') : t('Ver artefacto')}
          </button>
        )}
        <a
          className="secondary"
          href={artifact.url || artifactFileUrl(runId, artifact)}
          {...(artifact.url
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : { download: artifact.name })}
        >
          {artifact.url ? <ExternalLink size={16} /> : <Download size={16} />}
          {artifact.url ? t('Abrir enlace') : t('Descargar')}
        </a>
      </div>
      {open && <ArtifactSandboxPreview runId={runId} artifact={artifact} />}
    </li>
  );
}
export function Artifacts({
  runId,
  step,
  autoOpenId,
}: {
  runId: string;
  step: Step;
  /** When set, open that artifact's preview on mount (Resultado evidence stage). */
  autoOpenId?: string;
}) {
  useLocale();
  return (
    <section className="step-artifacts" aria-label={t('Artefactos del paso')}>
      <h3>
        <Package size={18} /> {t('Artefactos')}{' '}
        <span>{step.artifacts?.length || 0}</span>
      </h3>
      {step.artifacts?.length ? (
        <ul>
          {step.artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              runId={runId}
              artifact={artifact}
              attempt={step.attempt}
              autoOpen={autoOpenId === artifact.id}
            />
          ))}
        </ul>
      ) : (
        <p className="muted">
          {t(
            'Los archivos y enlaces que genere el agente aparecerán aquí cuando los registre.',
          )}
        </p>
      )}
    </section>
  );
}

// Re-export for callers that previously relied on local helpers.
export { isSandboxedMarkup };
