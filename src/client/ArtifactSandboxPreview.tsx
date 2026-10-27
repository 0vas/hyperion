import { useEffect, useState } from 'react';
import type { Artifact } from '../domain/artifacts';
import { isSandboxedMarkup, type ArtifactViewMode } from './artifact-preview';
import { t, useLocale } from './i18n';

export const artifactFileUrl = (runId: string, artifact: Artifact) =>
  `/api/runs/${encodeURIComponent(runId)}/artifacts/${artifact.id}`;

/** Exact inert disclaimer — do not reword (UX seal / HTML inert contract). */
export const INERT_PREVIEW_DISCLAIMER_ES =
  'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.';

/**
 * Shared sandboxed artifact preview for Resultado and canvas tiles.
 * One iframe policy: sandbox="", srcDoc, referrerPolicy=no-referrer.
 */
export function ArtifactSandboxPreview({
  runId,
  artifact,
  compact = false,
}: {
  runId: string;
  artifact: Artifact;
  /** Tile chrome: smaller frame, still full disclaimer when Preview is shown. */
  compact?: boolean;
}) {
  useLocale();
  const [text, setText] = useState<string>();
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<ArtifactViewMode>('preview');
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    artifact.mediaType,
  );
  const markup = isSandboxedMarkup(artifact.mediaType);
  const url = artifactFileUrl(runId, artifact);
  useEffect(() => {
    if (image) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unavailable');
        return response.text();
      })
      .then(setText)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [url, image]);
  if (error)
    return (
      <p role="alert">
        {t('No se pudo abrir el artefacto. Puedes intentar descargarlo.')}
      </p>
    );
  if (image)
    return (
      <img
        className={compact ? 'preview-tile-image' : 'artifact-image'}
        src={`${url}?preview=1`}
        alt={artifact.name}
        onError={() => setError(true)}
      />
    );
  if (text === undefined)
    return <p className="muted">{t('Cargando artefacto…')}</p>;
  if (markup)
    return (
      <div className={compact ? 'preview-tile-markup' : 'artifact-markup'}>
        <div
          className="artifact-view-toggle"
          role="group"
          aria-label={t('Modo de visualización')}
        >
          <button
            type="button"
            className={mode === 'preview' ? 'secondary active' : 'secondary'}
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            {t('Vista previa')}
          </button>
          <button
            type="button"
            className={mode === 'source' ? 'secondary active' : 'secondary'}
            aria-pressed={mode === 'source'}
            onClick={() => setMode('source')}
          >
            {t('Código fuente')}
          </button>
        </div>
        {mode === 'preview' && (
          <p className="artifact-preview-disclaimer">
            {t(INERT_PREVIEW_DISCLAIMER_ES)}
          </p>
        )}
        {mode === 'preview' ? (
          <div
            className={
              compact
                ? 'artifact-preview-stage preview-tile-stage'
                : 'artifact-preview-stage'
            }
          >
            <iframe
              className={
                compact ? 'preview-tile-html-frame' : 'artifact-html-frame'
              }
              title={t('Vista previa de {0}', { 0: artifact.name })}
              srcDoc={text}
              sandbox=""
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <pre className="artifact-text">{text}</pre>
        )}
      </div>
    );
  return <pre className="artifact-text">{text}</pre>;
}
