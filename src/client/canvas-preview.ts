import type { Artifact } from '../domain/artifacts.js';
import type { Step } from '../domain/workflow.js';
import { isSandboxedMarkup } from './artifact-preview.js';
import { pickPreferredArtifact } from './resultado-evidence.js';

/** Hide on-canvas preview tiles below this viewport width (Architect R2.4). */
export const PREVIEW_TILE_BREAKPOINT = 900;

/** Large/expanded stage ~480×320. Mini/compact default + collapse are Track E/F UI-only. */
export const previewTileLayout = {
  gap: 28,
  width: 480,
  bodyHeight: 320,
  maxVisible: 5,
} as const;

const previewBytes = 256 * 1024;

/** Stored bytes eligible for on-canvas / Resultado inert preview (no remote url). */
export function isStoredPreviewableArtifact(artifact: Artifact): boolean {
  if (artifact.url) return false;
  if (isSandboxedMarkup(artifact.mediaType))
    return (artifact.size || 0) <= previewBytes;
  if (/^image\/(png|jpeg|gif|webp)$/.test(artifact.mediaType)) return true;
  if (
    /^text\//.test(artifact.mediaType) ||
    artifact.mediaType === 'application/json'
  )
    return (artifact.size || 0) <= previewBytes;
  return false;
}

export function isRemotePreviewLink(artifact: Artifact): boolean {
  return !!artifact.url;
}

export type CanvasPreviewCandidate = {
  producerStepId: string;
  artifact: Artifact;
  remoteOnly: boolean;
  extraCount: number;
};

function attentionRank(step: Step): number {
  if (step.status === 'waiting') return 0;
  if (step.status === 'ready') return 1;
  if (step.status === 'running') return 2;
  if (step.status === 'completed') return 3;
  if (step.status === 'failed') return 4;
  return 5;
}

/**
 * Primary previewable artifact per leaf producer. Soft-cap prefers selected,
 * attention, then recently completed. Never attaches to job packages.
 */
export function selectCanvasPreviewCandidates(
  steps: Step[],
  options: {
    selectedStepId?: string;
    maxVisible?: number;
  } = {},
): CanvasPreviewCandidate[] {
  const max = options.maxVisible ?? previewTileLayout.maxVisible;
  const candidates: (CanvasPreviewCandidate & {
    rank: number;
    createdAt: string;
  })[] = [];
  for (const step of steps) {
    if (!['agent', 'manual', 'approval'].includes(step.kind)) continue;
    const preferred = pickPreferredArtifact(step.artifacts, step.attempt);
    if (!preferred) continue;
    const stored = isStoredPreviewableArtifact(preferred);
    const remote = isRemotePreviewLink(preferred);
    if (!stored && !remote) continue;
    const selected = options.selectedStepId === step.id ? 0 : 1;
    candidates.push({
      producerStepId: step.id,
      artifact: preferred,
      remoteOnly: remote && !stored,
      extraCount: Math.max(0, (step.artifacts?.length || 0) - 1),
      rank: selected * 10 + attentionRank(step),
      createdAt: preferred.createdAt,
    });
  }
  return candidates
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, max)
    .map(({ rank: _r, createdAt: _c, ...rest }) => rest);
}

export function previewNodeId(producerStepId: string): string {
  return `preview:${producerStepId}`;
}

export function previewTilePosition(
  producer: { x: number; y: number },
  producerSize: { width: number; height: number },
  horizontal: boolean,
): { x: number; y: number } {
  if (horizontal) {
    return {
      x: producer.x + producerSize.width + previewTileLayout.gap,
      y:
        producer.y +
        Math.max(0, (producerSize.height - previewTileLayout.bodyHeight) / 2),
    };
  }
  return {
    x: producer.x + producerSize.width + previewTileLayout.gap,
    y: producer.y,
  };
}
