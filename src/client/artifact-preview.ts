/** Markup types rendered in a sandboxed iframe (scripts stay inert). */
export function isSandboxedMarkup(mediaType: string): boolean {
  return mediaType === 'text/html' || mediaType === 'image/svg+xml';
}

export type ArtifactViewMode = 'preview' | 'source';
