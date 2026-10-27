import type { Artifact } from '../domain/artifacts.js';

/** Architect seal caps — client-enforced; no protocol change. */
export const CSS_SIBLING_BYTES = 256 * 1024;
export const COMPOSED_SRCDOC_BYTES = 512 * 1024;
export const MAX_CSS_SIBLINGS = 12;

const utf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

export type CssInline = { name: string; css: string };
export type ComposeStyleStatus = 'none' | 'included' | 'partial';
export type ComposeResult = {
  srcDoc: string;
  styleStatus: ComposeStyleStatus;
};

function isCssArtifact(artifact: Artifact): boolean {
  if (artifact.url) return false;
  if (artifact.mediaType === 'text/css') return true;
  return /\.css$/i.test(artifact.name);
}

/** Relative stylesheet basenames referenced by the HTML (no URLs / path escape). */
export function relativeStylesheetBasenames(html: string): string[] {
  const names: string[] = [];
  const re =
    /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const href = (match[1] || match[2] || '').trim();
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) continue;
    if (href.includes('/') || href.includes('\\') || href.includes('..'))
      continue;
    names.push(href);
  }
  return names;
}

/**
 * CSS siblings for inert HTML preview: same run, prefer same attempt,
 * optional link basenames first. Never includes JS.
 */
export function selectCssSiblingArtifacts(
  primary: Artifact,
  siblings: Artifact[],
  htmlText?: string,
): Artifact[] {
  if (primary.mediaType !== 'text/html') return [];
  const linked = new Set(
    htmlText
      ? relativeStylesheetBasenames(htmlText).map((n) => n.toLowerCase())
      : [],
  );
  const sameAttempt = siblings.filter(
    (item) =>
      item.id !== primary.id &&
      isCssArtifact(item) &&
      item.attempt === primary.attempt,
  );
  const pool =
    sameAttempt.length > 0
      ? sameAttempt
      : siblings.filter(
          (item) => item.id !== primary.id && isCssArtifact(item),
        );
  const ranked = [...pool].sort((a, b) => {
    const aLink = linked.has(a.name.toLowerCase()) ? 0 : 1;
    const bLink = linked.has(b.name.toLowerCase()) ? 0 : 1;
    if (aLink !== bLink) return aLink - bLink;
    return a.name.localeCompare(b.name);
  });
  return ranked.slice(0, MAX_CSS_SIBLINGS);
}

function styleTag(name: string, css: string): string {
  const safeName = name.replace(/"/g, '');
  return `<style data-hyperion-inert-css="${safeName}">${css}</style>`;
}

function stripInlinedRelativeLinks(
  html: string,
  inlinedNames: Set<string>,
): string {
  if (!inlinedNames.size) return html;
  return html.replace(
    /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>|<link\b[^>]*\bhref\s*=\s*["'][^"']+["'][^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi,
    (tag) => {
      const href =
        /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim() || '';
      if (inlinedNames.has(href) || inlinedNames.has(href.toLowerCase()))
        return '';
      return tag;
    },
  );
}

function injectStyles(html: string, styleBlocks: string): string {
  if (/<head\b[^>]*>/i.test(html))
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${styleBlocks}`);
  if (/<html\b[^>]*>/i.test(html))
    return html.replace(
      /<html\b[^>]*>/i,
      (open) => `${open}<head>${styleBlocks}</head>`,
    );
  return `<head>${styleBlocks}</head>${html}`;
}

/** Build inert srcDoc: parent-fetched CSS inlined; sandbox stays empty in the iframe. */
export function composeInertHtmlSrcDoc(
  html: string,
  styles: CssInline[],
): ComposeResult {
  if (!styles.length) return { srcDoc: html, styleStatus: 'none' };
  const inlined: CssInline[] = [];
  let partial = false;
  let budget = COMPOSED_SRCDOC_BYTES - utf8Bytes(html);
  for (const style of styles) {
    if (inlined.length >= MAX_CSS_SIBLINGS) {
      partial = true;
      break;
    }
    const cssBytes = utf8Bytes(style.css);
    if (cssBytes > CSS_SIBLING_BYTES) {
      partial = true;
      continue;
    }
    const tag = styleTag(style.name, style.css);
    const tagBytes = utf8Bytes(tag);
    if (tagBytes > budget) {
      partial = true;
      continue;
    }
    inlined.push(style);
    budget -= tagBytes;
  }
  if (!inlined.length)
    return { srcDoc: html, styleStatus: partial ? 'partial' : 'none' };
  const names = new Set(inlined.map((s) => s.name));
  for (const s of inlined) names.add(s.name.toLowerCase());
  const cleaned = stripInlinedRelativeLinks(html, names);
  const blocks = inlined.map((s) => styleTag(s.name, s.css)).join('');
  return {
    srcDoc: injectStyles(cleaned, blocks),
    styleStatus: partial ? 'partial' : 'included',
  };
}
