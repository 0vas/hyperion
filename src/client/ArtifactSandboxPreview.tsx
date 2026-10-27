import { useEffect, useState } from 'react';
import type { Artifact } from '../domain/artifacts';
import { isSandboxedMarkup, type ArtifactViewMode } from './artifact-preview';
import {
  composeInertHtmlSrcDoc,
  relativeStylesheetBasenames,
  selectCssSiblingArtifacts,
  type ComposeStyleStatus,
} from './inert-html-compose';
import { t, useLocale } from './i18n';

export const artifactFileUrl = (runId: string, artifact: Artifact) =>
  `/api/runs/${encodeURIComponent(runId)}/artifacts/${artifact.id}`;

/** Exact inert disclaimer — do not reword (UX seal / HTML inert contract). */
export const INERT_PREVIEW_DISCLAIMER_ES =
  'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.';

export const STYLES_INCLUDED_LABEL_ES = 'Estilos incluidos (inerte)';
export const STYLES_PARTIAL_LABEL_ES = 'Estilos parciales · faltan archivos';

/**
 * Shared sandboxed artifact preview for Resultado and canvas tiles.
 * One iframe policy: sandbox="", srcDoc, referrerPolicy=no-referrer.
 * Parent auth-fetches sibling text/css and injects <style> into HTML srcDoc.
 */
export function ArtifactSandboxPreview({
  runId,
  artifact,
  siblings = [],
  compact = false,
}: {
  runId: string;
  artifact: Artifact;
  /** Same-run artifacts (usually the producing step) for CSS sibling compose. */
  siblings?: Artifact[];
  /** Tile chrome: smaller frame, still full disclaimer when Preview is shown. */
  compact?: boolean;
}) {
  useLocale();
  const [text, setText] = useState<string>();
  const [srcDoc, setSrcDoc] = useState<string>();
  const [styleStatus, setStyleStatus] = useState<ComposeStyleStatus>('none');
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<ArtifactViewMode>('preview');
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    artifact.mediaType,
  );
  const markup = isSandboxedMarkup(artifact.mediaType);
  const htmlPrimary = artifact.mediaType === 'text/html';
  const url = artifactFileUrl(runId, artifact);
  const siblingKey = siblings
    .map((item) => `${item.id}:${item.name}:${item.mediaType}:${item.attempt}`)
    .join('|');
  useEffect(() => {
    if (image) return;
    const controller = new AbortController();
    setError(false);
    setText(undefined);
    setSrcDoc(undefined);
    setStyleStatus('none');
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const htmlOrText = await response.text();
        if (controller.signal.aborted) return;
        setText(htmlOrText);
        if (!htmlPrimary || !markup) {
          setSrcDoc(htmlOrText);
          setStyleStatus('none');
          return;
        }
        const cssArtifacts = selectCssSiblingArtifacts(
          artifact,
          siblings,
          htmlOrText,
        );
        const linkedNames = relativeStylesheetBasenames(htmlOrText);
        const styles: { name: string; css: string }[] = [];
        let fetchPartial = false;
        for (const cssArtifact of cssArtifacts) {
          try {
            const cssResponse = await fetch(
              artifactFileUrl(runId, cssArtifact),
              { signal: controller.signal },
            );
            if (!cssResponse.ok) {
              fetchPartial = true;
              continue;
            }
            styles.push({
              name: cssArtifact.name,
              css: await cssResponse.text(),
            });
          } catch {
            if (controller.signal.aborted) return;
            fetchPartial = true;
          }
        }
        if (controller.signal.aborted) return;
        const composed = composeInertHtmlSrcDoc(htmlOrText, styles);
        const inlinedNames = new Set(
          styles.map((style) => style.name.toLowerCase()),
        );
        const missingLinked = linkedNames.some(
          (name) => !inlinedNames.has(name.toLowerCase()),
        );
        let status = composed.styleStatus;
        if (fetchPartial || missingLinked) {
          if (status === 'included' || styles.length || linkedNames.length)
            status = 'partial';
        }
        setSrcDoc(composed.srcDoc);
        setStyleStatus(status);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [
    url,
    image,
    htmlPrimary,
    markup,
    siblingKey,
    runId,
    artifact.id,
    artifact.name,
    artifact.mediaType,
    artifact.attempt,
  ]);
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
  if (text === undefined || (markup && srcDoc === undefined))
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
        {mode === 'preview' && styleStatus === 'included' && (
          <p className="artifact-preview-style-status muted">
            {t(STYLES_INCLUDED_LABEL_ES)}
          </p>
        )}
        {mode === 'preview' && styleStatus === 'partial' && (
          <p className="artifact-preview-style-status muted">
            {t(STYLES_PARTIAL_LABEL_ES)}
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
              srcDoc={srcDoc}
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
