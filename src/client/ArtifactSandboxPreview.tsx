import { useEffect, useState } from 'react';
import type { Artifact } from '../domain/artifacts';
import { isSandboxedMarkup, type ArtifactViewMode } from './artifact-preview';
import {
  composeInertHtmlSrcDoc,
  relativeStylesheetBasenames,
  selectCssSiblingArtifacts,
  type ComposeStyleStatus,
} from './inert-html-compose';
import {
  officeKindForArtifact,
  parseDelimitedPreview,
  previewAestheticKind,
  type OfficeKind,
} from './preview-type-aesthetics';
import { t, useLocale } from './i18n';

export const artifactFileUrl = (runId: string, artifact: Artifact) =>
  `/api/runs/${encodeURIComponent(runId)}/artifacts/${artifact.id}`;

/** Exact inert disclaimer — do not reword (UX seal / HTML inert contract). */
export const INERT_PREVIEW_DISCLAIMER_ES =
  'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.';

export const STYLES_INCLUDED_LABEL_ES = 'Estilos incluidos (inerte)';
export const STYLES_PARTIAL_LABEL_ES = 'Estilos parciales · faltan archivos';

function OfficeFileIcon({ kind }: { kind: OfficeKind }) {
  const label =
    kind === 'docx'
      ? 'DOCX'
      : kind === 'xlsx'
        ? 'XLSX'
        : kind === 'pptx'
          ? 'PPTX'
          : 'FILE';
  const accent =
    kind === 'docx'
      ? '#2b579a'
      : kind === 'xlsx'
        ? '#217346'
        : kind === 'pptx'
          ? '#b7472a'
          : '#5c5c5c';
  return (
    <svg
      className="preview-office-icon"
      viewBox="0 0 64 80"
      width="48"
      height="60"
      aria-hidden="true"
    >
      <path
        d="M8 4h34l14 14v54a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
        fill="currentColor"
        opacity="0.08"
      />
      <path
        d="M42 4v12a2 2 0 0 0 2 2h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.35"
      />
      <rect x="14" y="36" width="36" height="22" rx="3" fill={accent} />
      <text
        x="32"
        y="51"
        textAnchor="middle"
        fill="#fff"
        fontSize="10"
        fontFamily="system-ui,sans-serif"
        fontWeight="700"
      >
        {label}
      </text>
    </svg>
  );
}

/**
 * Shared sandboxed artifact preview for Resultado and canvas tiles.
 * One iframe policy: sandbox="", srcDoc, referrerPolicy=no-referrer.
 * Parent auth-fetches sibling text/css and injects <style> into HTML srcDoc.
 * Track J4: notes / CSV table / Office SVG icons (no Office WYSIWYG).
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
  const markup = isSandboxedMarkup(artifact.mediaType);
  const kind = previewAestheticKind(artifact, { isSandboxedMarkup: markup });
  const officeKind = officeKindForArtifact(artifact);
  const image = kind === 'image';
  const htmlPrimary = artifact.mediaType === 'text/html';
  const url = artifactFileUrl(runId, artifact);
  const siblingKey = siblings
    .map((item) => `${item.id}:${item.name}:${item.mediaType}:${item.attempt}`)
    .join('|');

  useEffect(() => {
    if (image || kind === 'office') return;
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
    kind,
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

  if (kind === 'office' && officeKind)
    return (
      <div
        className={
          compact ? 'preview-office-card' : 'preview-office-card is-roomy'
        }
      >
        <OfficeFileIcon kind={officeKind} />
        <div className="preview-office-meta">
          <strong>{artifact.name}</strong>
          <span className="muted">
            {t('Icono de tipo de archivo — sin vista WYSIWYG de Office')}
          </span>
        </div>
      </div>
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

  if (kind === 'csv') {
    const parsed = parseDelimitedPreview(
      text,
      artifact.name.toLowerCase().endsWith('.tsv') ||
        artifact.mediaType === 'text/tab-separated-values'
        ? '\t'
        : undefined,
    );
    return (
      <div className={compact ? 'preview-csv' : 'preview-csv is-roomy'}>
        <div className="preview-csv-scroll">
          <table className="preview-csv-table">
            <tbody>
              {parsed.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parsed.truncated && (
          <p className="muted preview-csv-truncation">
            {t('Tabla truncada para la vista previa')}
          </p>
        )}
      </div>
    );
  }

  if (kind === 'note')
    return (
      <div className={compact ? 'preview-note' : 'preview-note is-roomy'}>
        <div className="preview-note-paper">
          <pre className="preview-note-body">{text}</pre>
        </div>
      </div>
    );

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
