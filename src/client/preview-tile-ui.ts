/** Client-only preview tile prefs — never written into run snapshots. */

export type PreviewTileSize = 'expanded' | 'compact';

export type PreviewTileUiState = {
  x?: number;
  y?: number;
  size: PreviewTileSize;
  collapsed: boolean;
};

export const PREVIEW_TILE_UI_VERSION = 'v1';

export const previewTileUiDefaults: PreviewTileUiState = {
  size: 'expanded',
  collapsed: false,
};

/** Compact body target (~280×180) — Architect match seal. */
export const previewTileCompactLayout = {
  width: 280,
  bodyHeight: 180,
  scale: 0.8,
} as const;

export function previewTileUiStorageKey(
  runId: string,
  producerStepId: string,
): string {
  return `hyperion.previewTile.${PREVIEW_TILE_UI_VERSION}:${runId}:${producerStepId}`;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function previewTileStoredPosition(
  state: PreviewTileUiState,
): { x: number; y: number } | undefined {
  const x = finiteNumber(state.x);
  const y = finiteNumber(state.y);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

export function isPreviewTileUiDefault(state: PreviewTileUiState): boolean {
  return (
    state.size === previewTileUiDefaults.size &&
    state.collapsed === previewTileUiDefaults.collapsed &&
    previewTileStoredPosition(state) === undefined
  );
}

export function parsePreviewTileUiState(raw: unknown): PreviewTileUiState {
  if (!raw || typeof raw !== 'object') return { ...previewTileUiDefaults };
  const value = raw as Record<string, unknown>;
  const size = value.size === 'compact' ? 'compact' : 'expanded';
  const collapsed = value.collapsed === true;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  return {
    size,
    collapsed,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
  };
}

export function readPreviewTileUiState(
  runId: string,
  producerStepId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): PreviewTileUiState {
  try {
    const raw = storage.getItem(previewTileUiStorageKey(runId, producerStepId));
    if (!raw) return { ...previewTileUiDefaults };
    return parsePreviewTileUiState(JSON.parse(raw));
  } catch {
    return { ...previewTileUiDefaults };
  }
}

export function writePreviewTileUiState(
  runId: string,
  producerStepId: string,
  state: PreviewTileUiState,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  const key = previewTileUiStorageKey(runId, producerStepId);
  try {
    if (isPreviewTileUiDefault(state)) {
      storage.removeItem(key);
      return;
    }
    const payload: PreviewTileUiState = {
      size: state.size,
      collapsed: state.collapsed,
    };
    const position = previewTileStoredPosition(state);
    if (position) {
      payload.x = position.x;
      payload.y = position.y;
    }
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    /* Prefer usable UI when storage is unavailable. */
  }
}

/** Drop all Track E size/collapse/position prefs for a run (layout reset). */
export function clearPreviewTileUiForRun(
  runId: string,
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage,
): void {
  const prefix = `hyperion.previewTile.${PREVIEW_TILE_UI_VERSION}:${runId}:`;
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) toRemove.push(key);
  }
  for (const key of toRemove) storage.removeItem(key);
}

export function togglePreviewTileSize(
  state: PreviewTileUiState,
): PreviewTileUiState {
  if (state.collapsed) return { ...state, collapsed: false, size: 'expanded' };
  return {
    ...state,
    size: state.size === 'expanded' ? 'compact' : 'expanded',
  };
}

export function collapsePreviewTile(
  state: PreviewTileUiState,
): PreviewTileUiState {
  return { ...state, collapsed: true };
}

export function expandPreviewTile(
  state: PreviewTileUiState,
): PreviewTileUiState {
  return { ...state, collapsed: false };
}

/** Live iframe mounts only when the tile is visible and not collapsed. */
export function previewTileMountsIframe(state: PreviewTileUiState): boolean {
  return !state.collapsed;
}

/**
 * Resolve canvas position: live drag → stored UI coords → satellite default.
 * Compact/collapse must not fall back to satellite when x/y were stored (E1).
 */
export function resolvePreviewTilePosition(
  state: PreviewTileUiState,
  liveDrag: { x: number; y: number } | undefined,
  satellite: { x: number; y: number },
): { x: number; y: number } {
  if (liveDrag) return liveDrag;
  return previewTileStoredPosition(state) ?? satellite;
}
