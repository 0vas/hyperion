import type { Artifact } from '../domain/artifacts.js';
import type { Step } from '../domain/workflow.js';
import { isSandboxedMarkup } from './artifact-preview.js';
import { officeKindForArtifact } from './preview-type-aesthetics.js';
import { pickPreferredArtifact } from './resultado-evidence.js';

/** Hide on-canvas preview tiles below this viewport width (Architect R2.4). */
export const PREVIEW_TILE_BREAKPOINT = 900;

/** Default outer frame hint; Track J device/frame prefs live in preview-tile-ui. */
export const previewTileLayout = {
  gap: 28,
  width: 480,
  bodyHeight: 300,
  maxVisible: 5,
} as const;

const previewBytes = 256 * 1024;

/** Stored bytes eligible for on-canvas / Resultado inert preview (no remote url). */
export function isStoredPreviewableArtifact(artifact: Artifact): boolean {
  if (artifact.url) return false;
  if (isSandboxedMarkup(artifact.mediaType))
    return (artifact.size || 0) <= previewBytes;
  if (/^image\/(png|jpeg|gif|webp)$/.test(artifact.mediaType)) return true;
  // Office is a click-to-download SVG bubble, not a rendered preview.
  if (officeKindForArtifact(artifact)) return true;
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
  /** Office documents are compact download bubbles instead of preview panels. */
  downloadOnly: boolean;
  bubbleIndex: number;
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
 * One normal preview per leaf producer plus compact Office download bubbles.
 * Soft-cap prefers selected, attention, then recently completed. Never attaches
 * to job packages.
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
    const normalArtifacts = (step.artifacts || []).filter(
      (artifact) => !officeKindForArtifact(artifact),
    );
    const preferred = pickPreferredArtifact(normalArtifacts, step.attempt);
    const selected = options.selectedStepId === step.id ? 0 : 1;
    if (preferred) {
      const stored = isStoredPreviewableArtifact(preferred);
      const remote = isRemotePreviewLink(preferred);
      if (stored || remote)
        candidates.push({
          producerStepId: step.id,
          artifact: preferred,
          remoteOnly: remote && !stored,
          extraCount: Math.max(0, (step.artifacts?.length || 0) - 1),
          downloadOnly: false,
          bubbleIndex: 0,
          rank: selected * 10 + attentionRank(step),
          createdAt: preferred.createdAt,
        });
    }
    for (const [bubbleIndex, artifact] of (step.artifacts || [])
      .filter((item) => !!officeKindForArtifact(item))
      .entries()) {
      candidates.push({
        producerStepId: step.id,
        artifact,
        remoteOnly: !!artifact.url,
        extraCount: 0,
        downloadOnly: true,
        bubbleIndex,
        rank: selected * 10 + attentionRank(step) + 1,
        createdAt: artifact.createdAt,
      });
    }
  }
  return candidates
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, max)
    .map(({ rank: _r, createdAt: _c, ...rest }) => rest);
}

export function previewNodeId(
  producerStepId: string,
  artifactId?: string,
): string {
  return artifactId
    ? `preview:${producerStepId}:${artifactId}`
    : `preview:${producerStepId}`;
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
