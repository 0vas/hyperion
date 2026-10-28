import type { Artifact } from '../domain/artifacts.js';
import { isSandboxedMarkup } from './artifact-preview.js';
import { artifactFileUrl } from './ArtifactSandboxPreview.js';
import {
  composeInertHtmlSrcDoc,
  relativeStylesheetBasenames,
  selectCssSiblingArtifacts,
} from './inert-html-compose.js';

/** Restrictive CSP for any composed document (G/I honesty). */
export const PREVIEW_OPEN_BROWSER_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function injectOpenBrowserCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_OPEN_BROWSER_CSP}">`;
  if (
    /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html)
  )
    return html;
  if (/<head\b[^>]*>/i.test(html))
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${meta}`);
  if (/<html\b[^>]*>/i.test(html))
    return html.replace(
      /<html\b[^>]*>/i,
      (open) => `${open}<head>${meta}</head>`,
    );
  return `<head>${meta}</head>${html}`;
}

export type OpenPreviewBrowserResult =
  | { ok: true; via: 'remote' | 'in-app-shell' }
  | { ok: false; reason: 'download' | 'unavailable' };

/** Local markup/image → in-app Hyperion shell (Track I). Remote URL → OS/tab. */
export function prefersInAppPreviewShell(artifact: Artifact): boolean {
  if (artifact.url) return false;
  if (isSandboxedMarkup(artifact.mediaType)) return true;
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    artifact.mediaType,
  );
}

/**
 * Abrir path after Track I:
 * - Remote https → separate tab / openExternal (caller may use window.open)
 * - Local → { via: 'in-app-shell' } so UI opens PreviewOpenShell (never window.open(blob))
 * Does not change artifact GET to inline HTML.
 */
export async function openPreviewInBrowser(
  _runId: string,
  artifact: Artifact,
  _siblings: Artifact[] = [],
  openWindow: (url: string) => Window | null = (url) =>
    window.open(url, '_blank', 'noopener,noreferrer'),
): Promise<OpenPreviewBrowserResult> {
  if (artifact.url) {
    const opened = openWindow(artifact.url);
    return opened
      ? { ok: true, via: 'remote' }
      : { ok: false, reason: 'unavailable' };
  }
  if (prefersInAppPreviewShell(artifact))
    return { ok: true, via: 'in-app-shell' };
  return { ok: false, reason: 'download' };
}

export function canOfferPreviewOpenInBrowser(artifact: Artifact): boolean {
  if (artifact.url) return true;
  return prefersInAppPreviewShell(artifact);
}

/** Kept for unit tests / optional chromed-shell compose; not used for naked blob tabs. */
export async function composeLocalPreviewHtml(
  runId: string,
  artifact: Artifact,
  siblings: Artifact[] = [],
): Promise<string | null> {
  if (!isSandboxedMarkup(artifact.mediaType) || artifact.url) return null;
  try {
    const response = await fetch(artifactFileUrl(runId, artifact));
    if (!response.ok) return null;
    const text = await response.text();
    if (artifact.mediaType === 'text/html') {
      const cssArtifacts = selectCssSiblingArtifacts(artifact, siblings, text);
      const styles: { name: string; css: string }[] = [];
      for (const cssArtifact of cssArtifacts) {
        try {
          const cssResponse = await fetch(artifactFileUrl(runId, cssArtifact));
          if (!cssResponse.ok) continue;
          styles.push({
            name: cssArtifact.name,
            css: await cssResponse.text(),
          });
        } catch {
          /* partial OK */
        }
      }
      void relativeStylesheetBasenames(text);
      return injectOpenBrowserCsp(composeInertHtmlSrcDoc(text, styles).srcDoc);
    }
    return injectOpenBrowserCsp(
      /<svg\b/i.test(text)
        ? text
        : `<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`,
    );
  } catch {
    return null;
  }
}
