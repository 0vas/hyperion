import type { Artifact } from '../domain/artifacts.js';
import { isSandboxedMarkup } from './artifact-preview.js';
import { artifactFileUrl } from './ArtifactSandboxPreview.js';
import {
  composeInertHtmlSrcDoc,
  relativeStylesheetBasenames,
  selectCssSiblingArtifacts,
} from './inert-html-compose.js';

/** Restrictive CSP for blob opens — scripts stay blocked outside canvas sandbox. */
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
  | { ok: true; via: 'remote' | 'blob' | 'image' }
  | { ok: false; reason: 'download' | 'unavailable' };

/**
 * Open artifact outside the inert canvas iframe.
 * Remote → URL tab. Local HTML/SVG → composed blob:+CSP. Image → preview URL.
 * Does not change artifact GET to inline HTML.
 */
export async function openPreviewInBrowser(
  runId: string,
  artifact: Artifact,
  siblings: Artifact[] = [],
  openWindow: (url: string) => Window | null = (url) =>
    window.open(url, '_blank', 'noopener,noreferrer'),
): Promise<OpenPreviewBrowserResult> {
  if (artifact.url) {
    const opened = openWindow(artifact.url);
    return opened
      ? { ok: true, via: 'remote' }
      : { ok: false, reason: 'unavailable' };
  }
  if (
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
      artifact.mediaType,
    )
  ) {
    const opened = openWindow(`${artifactFileUrl(runId, artifact)}?preview=1`);
    return opened
      ? { ok: true, via: 'image' }
      : { ok: false, reason: 'unavailable' };
  }
  if (!isSandboxedMarkup(artifact.mediaType))
    return { ok: false, reason: 'download' };
  try {
    const response = await fetch(artifactFileUrl(runId, artifact));
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const text = await response.text();
    let body = text;
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
          /* Compose may be partial — still open with what we have. */
        }
      }
      void relativeStylesheetBasenames(text);
      body = composeInertHtmlSrcDoc(text, styles).srcDoc;
      body = injectOpenBrowserCsp(body);
    } else if (artifact.mediaType === 'image/svg+xml') {
      body = injectOpenBrowserCsp(
        /<svg\b/i.test(text)
          ? text
          : `<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`,
      );
    }
    const blob = new Blob([body], {
      type:
        artifact.mediaType === 'image/svg+xml' ? 'image/svg+xml' : 'text/html',
    });
    const objectUrl = URL.createObjectURL(blob);
    const opened = openWindow(objectUrl);
    if (!opened) {
      URL.revokeObjectURL(objectUrl);
      return { ok: false, reason: 'unavailable' };
    }
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return { ok: true, via: 'blob' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function canOfferPreviewOpenInBrowser(artifact: Artifact): boolean {
  if (artifact.url) return true;
  if (isSandboxedMarkup(artifact.mediaType)) return true;
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    artifact.mediaType,
  );
}
