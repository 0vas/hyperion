import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
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
 * In-app Abrir surface: the artifact owns the complete usable pane while a
 * floating, always-available return control preserves the Hyperion exit.
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
      aria-label={t('Vista ampliada de {0}', { 0: artifact.name })}
    >
      <div className="preview-open-shell-body">
        {artifact.url ? (
          <p className="muted">{t('Enlace remoto — ábrelo desde el cromo')}</p>
        ) : (
          <ArtifactSandboxPreview
            runId={runId}
            artifact={artifact}
            siblings={siblings}
            fillAvailable
            immersive
          />
        )}
      </div>
      <button
        type="button"
        className="primary preview-open-shell-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('Volver')}
      </button>
    </div>
  );
}
