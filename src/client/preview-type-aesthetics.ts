import type { Artifact } from '../domain/artifacts';

/** Row/col caps for CSV/TSV table preview (Track J4 honesty). */
export const PREVIEW_CSV_MAX_ROWS = 40;
export const PREVIEW_CSV_MAX_COLS = 12;

export type PreviewAestheticKind =
  | 'markup'
  | 'image'
  | 'csv'
  | 'note'
  | 'office'
  | 'text';

export type OfficeKind = 'docx' | 'xlsx' | 'pptx' | 'other';

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const OFFICE_MIME: Record<string, OfficeKind> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
};

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function officeKindForArtifact(artifact: Artifact): OfficeKind | null {
  const mime = OFFICE_MIME[artifact.mediaType];
  if (mime) return mime;
  const ext = extensionOf(artifact.name);
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'odt' || ext === 'ods' || ext === 'odp') return 'other';
  return null;
}

export function previewAestheticKind(
  artifact: Artifact,
  options?: { isSandboxedMarkup?: boolean },
): PreviewAestheticKind {
  if (IMAGE_TYPES.has(artifact.mediaType)) return 'image';
  if (options?.isSandboxedMarkup) return 'markup';
  if (officeKindForArtifact(artifact)) return 'office';
  const media = artifact.mediaType.toLowerCase();
  const ext = extensionOf(artifact.name);
  if (
    media === 'text/csv' ||
    media === 'text/tab-separated-values' ||
    ext === 'csv' ||
    ext === 'tsv'
  )
    return 'csv';
  if (
    media === 'text/markdown' ||
    media === 'text/x-markdown' ||
    media.startsWith('text/plain') ||
    ext === 'md' ||
    ext === 'markdown' ||
    ext === 'txt' ||
    ext === 'text'
  )
    return 'note';
  if (media.startsWith('text/')) return 'text';
  return 'text';
}

/** Minimal CSV/TSV split — not a spreadsheet engine (Track J4). */
export function parseDelimitedPreview(
  raw: string,
  delimiterHint?: ',' | '\t',
): { rows: string[][]; truncated: boolean; delimiter: ',' | '\t' } {
  const sample = raw.slice(0, 2048);
  const delimiter =
    delimiterHint ??
    (sample.includes('\t') &&
    sample.split('\t').length > sample.split(',').length
      ? '\t'
      : ',');
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const truncated =
    lines.length > PREVIEW_CSV_MAX_ROWS ||
    lines.some((line) => splitDelimitedLine(line, delimiter).length > PREVIEW_CSV_MAX_COLS);
  const rows = lines.slice(0, PREVIEW_CSV_MAX_ROWS).map((line) =>
    splitDelimitedLine(line, delimiter).slice(0, PREVIEW_CSV_MAX_COLS),
  );
  return { rows, truncated, delimiter };
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') return line.split('\t');
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
