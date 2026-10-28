import { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { Artifact } from '../domain/artifacts';
import { ArtifactSandboxPreview } from './ArtifactSandboxPreview';
import { t, useLocale } from './i18n';

export type PreviewOpenShellProps = {
  runId: string;
  artifact: Artifact;
  siblings: Artifact[];
  onBack: () => void;
};

/**
 * In-app Abrir surface (Track I): Hyperion chrome + inert body.
 * Never replaces the SPA document with raw blob HTML.
 */
export function PreviewOpenShell({
  runId,
  artifact,
  siblings,
  onBack,
}: PreviewOpenShellProps) {
  useLocale();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <div
      className="preview-open-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-open-shell-title"
    >
      <header className="preview-open-shell-chrome">
        <div className="preview-open-shell-brand">
          <span className="eyebrow">{t('Vista en Hyperion')}</span>
          <h2 id="preview-open-shell-title">{artifact.name}</h2>
        </div>
        <div className="preview-open-shell-actions">
          <button type="button" className="primary" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t('Volver al canvas')}
          </button>
          <button
            type="button"
            className="secondary icon-button"
            aria-label={t('Cerrar vista')}
            title={t('Cerrar vista')}
            onClick={onBack}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="preview-open-shell-body">
        {artifact.url ? (
          <p className="muted">{t('Enlace remoto — ábrelo desde el cromo')}</p>
        ) : (
          <ArtifactSandboxPreview
            runId={runId}
            artifact={artifact}
            siblings={siblings}
          />
        )}
      </div>
    </div>
  );
}
