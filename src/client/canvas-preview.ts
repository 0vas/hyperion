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
  /** Chrome + body approximation used only for collision-free initial placement. */
  height: 360,
  maxVisible: 5,
} as const;

/** Shared rendered footprint and clearance for a compact artifact bubble. */
export const previewBubbleLayout = {
  /** Above the 44px minimum interactive target. */
  width: 72,
  height: 72,
  gap: 16,
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

/**
 * Deterministic close-range slots for a compact satellite. The first choice
 * sits on the producer's upper-right chrome corner. When that slot is blocked,
 * the packer tries the remaining local ring
 * before it spills into a distant lane.
 */
export function previewBubblePositions(
  producer: { x: number; y: number },
  producerSize: { width: number; height: number },
  bubbleSize: { width: number; height: number } = previewBubbleLayout,
  gap: number = previewBubbleLayout.gap,
): { x: number; y: number }[] {
  const centeredX = producer.x + (producerSize.width - bubbleSize.width) / 2;
  const centeredY = producer.y + (producerSize.height - bubbleSize.height) / 2;
  const topRight = {
    x: producer.x + producerSize.width - bubbleSize.width / 2,
    y: producer.y - bubbleSize.height / 2,
  };
  const right = {
    x: producer.x + producerSize.width + gap,
    y: centeredY,
  };
  const below = {
    x: centeredX,
    y: producer.y + producerSize.height + gap,
  };
  const above = {
    x: centeredX,
    y: producer.y - bubbleSize.height - gap,
  };
  const left = {
    x: producer.x - bubbleSize.width - gap,
    y: centeredY,
  };
  return [topRight, right, below, left, above];
}

export type PreviewTilePlacementInput = {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  /** Stored or in-progress user placement: seed collision checks, never move it. */
  fixed?: boolean;
  /** Nearby positions considered before the distant collision fallback. */
  localPositions?: { x: number; y: number }[];
  /** Optional tighter collision clearance for compact bubbles. */
  clearance?: number;
  /** Its own producer may host a corner satellite; all other nodes still block. */
  allowOverlapWith?: string[];
};

type PreviewTileRect = PreviewTilePlacementInput & {
  position: { x: number; y: number };
};

function tilesOverlap(
  a: PreviewTileRect,
  b: PreviewTileRect,
  gap: number,
): boolean {
  const clearance = Math.min(a.clearance ?? gap, b.clearance ?? gap);
  return !(
    a.position.x + a.width + clearance <= b.position.x ||
    b.position.x + b.width + clearance <= a.position.x ||
    a.position.y + a.height + clearance <= b.position.y ||
    b.position.y + b.height + clearance <= a.position.y
  );
}

function isAllowedOverlap(
  tile: PreviewTileRect,
  other: PreviewTileRect,
): boolean {
  return !!tile.allowOverlapWith?.includes(other.id);
}

/**
 * Lay out automatically placed preview satellites in stable lanes. Compact
 * bubbles first try their producer-local slots; only the initial client layout
 * is adjusted. Stored and live drag positions are fixed obstacles, never
 * rewritten.
 */
export function placePreviewTiles(
  inputs: PreviewTilePlacementInput[],
  gap: number = previewTileLayout.gap,
): Record<string, { x: number; y: number }> {
  const sorted = [...inputs].sort((a, b) => {
    if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.id.localeCompare(b.id);
  });
  const placed: PreviewTileRect[] = [];
  const positions: Record<string, { x: number; y: number }> = {};

  for (const input of sorted) {
    const tile: PreviewTileRect = {
      ...input,
      position: { ...input.position },
    };
    if (!input.fixed) {
      const localPosition = [
        tile.position,
        ...(input.localPositions || []),
      ].find((position) => {
        const candidate = { ...tile, position };
        return !placed.some(
          (other) =>
            !isAllowedOverlap(candidate, other) &&
            tilesOverlap(candidate, other, gap),
        );
      });
      if (localPosition) tile.position = { ...localPosition };
      for (;;) {
        const blockers = placed.filter(
          (other) =>
            !isAllowedOverlap(tile, other) && tilesOverlap(tile, other, gap),
        );
        if (!blockers.length) break;
        tile.position.y = Math.max(
          ...blockers.map((other) => other.position.y + other.height + gap),
        );
      }
    }
    placed.push(tile);
    positions[tile.id] = tile.position;
  }
  return positions;
}
