/** Client-only preview tile prefs — never written into run snapshots. */

export type PreviewTileSize = 'mini' | 'medium' | 'stage';

export type PreviewTileUiState = {
  x?: number;
  y?: number;
  size: PreviewTileSize;
  collapsed: boolean;
};

export type PreviewTileGlobalState = {
  /** When true, canvas preview tiles are not mounted (≠ delete artifacts). */
  hideAll: boolean;
};

export const PREVIEW_TILE_UI_VERSION = 'v2';
/** Track E/F keys — read once for migration, cleared on layout reset. */
export const PREVIEW_TILE_UI_LEGACY_VERSION = 'v1';
export const PREVIEW_TILE_GLOBAL_VERSION = 'v1';

/** New tiles default to mini (Track G / Arch). */
export const previewTileUiDefaults: PreviewTileUiState = {
  size: 'mini',
  collapsed: false,
};

export const previewTileGlobalDefaults: PreviewTileGlobalState = {
  hideAll: false,
};

/** Mini outer frame (~280×180). Contain scale is computed — not a fixed 0.8 crop. */
export const previewTileCompactLayout = {
  width: 280,
  bodyHeight: 180,
} as const;

/** Medium band (~480×320) — also the design content box for mini contain. */
export const previewTileMediumLayout = {
  width: 480,
  bodyHeight: 320,
} as const;

/**
 * Uniform contain scale: fit medium content box into mini frame (letterbox OK).
 * Hardcoded 0.8 top-left crop is FAIL (Track H / Arch).
 */
export function previewTileMiniContainScale(
  frame: { width: number; bodyHeight: number } = previewTileCompactLayout,
  content: { width: number; bodyHeight: number } = previewTileMediumLayout,
): number {
  const sx = frame.width / content.width;
  const sy = frame.bodyHeight / content.bodyHeight;
  return Math.min(sx, sy);
}

export const PREVIEW_TILE_SIZE_OPTIONS: PreviewTileSize[] = [
  'mini',
  'medium',
  'stage',
];

export function previewTileUiStorageKey(
  runId: string,
  producerStepId: string,
  version: string = PREVIEW_TILE_UI_VERSION,
): string {
  return `hyperion.previewTile.${version}:${runId}:${producerStepId}`;
}

export function previewTileGlobalStorageKey(runId: string): string {
  return `hyperion.previewTileGlobal.${PREVIEW_TILE_GLOBAL_VERSION}:${runId}`;
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

/** v2 sizes + honest F/E migration: compact→mini, expanded→medium. */
export function parsePreviewTileSize(value: unknown): PreviewTileSize {
  if (value === 'mini' || value === 'medium' || value === 'stage') return value;
  if (value === 'compact') return 'mini';
  if (value === 'expanded') return 'medium';
  return previewTileUiDefaults.size;
}

export function parsePreviewTileUiState(raw: unknown): PreviewTileUiState {
  if (!raw || typeof raw !== 'object') return { ...previewTileUiDefaults };
  const value = raw as Record<string, unknown>;
  const size = parsePreviewTileSize(value.size);
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

export function parsePreviewTileGlobalState(
  raw: unknown,
): PreviewTileGlobalState {
  if (!raw || typeof raw !== 'object') return { ...previewTileGlobalDefaults };
  const value = raw as Record<string, unknown>;
  return { hideAll: value.hideAll === true };
}

export function readPreviewTileUiState(
  runId: string,
  producerStepId: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): PreviewTileUiState {
  try {
    const key = previewTileUiStorageKey(runId, producerStepId);
    const raw = storage.getItem(key);
    if (raw) return parsePreviewTileUiState(JSON.parse(raw));
    const legacyKey = previewTileUiStorageKey(
      runId,
      producerStepId,
      PREVIEW_TILE_UI_LEGACY_VERSION,
    );
    const legacyRaw = storage.getItem(legacyKey);
    if (!legacyRaw) return { ...previewTileUiDefaults };
    const migrated = parsePreviewTileUiState(JSON.parse(legacyRaw));
    writePreviewTileUiState(runId, producerStepId, migrated, storage);
    try {
      storage.removeItem(legacyKey);
    } catch {
      /* ignore */
    }
    return migrated;
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

export function readPreviewTileGlobalState(
  runId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): PreviewTileGlobalState {
  try {
    const raw = storage.getItem(previewTileGlobalStorageKey(runId));
    if (!raw) return { ...previewTileGlobalDefaults };
    return parsePreviewTileGlobalState(JSON.parse(raw));
  } catch {
    return { ...previewTileGlobalDefaults };
  }
}

export function writePreviewTileGlobalState(
  runId: string,
  state: PreviewTileGlobalState,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  const key = previewTileGlobalStorageKey(runId);
  try {
    if (!state.hideAll) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify({ hideAll: true }));
  } catch {
    /* Prefer usable UI when storage is unavailable. */
  }
}

/** Drop Track E/F/G size/collapse/position prefs for a run (layout reset). */
export function clearPreviewTileUiForRun(
  runId: string,
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage,
): void {
  const prefixes = [
    `hyperion.previewTile.${PREVIEW_TILE_UI_VERSION}:${runId}:`,
    `hyperion.previewTile.${PREVIEW_TILE_UI_LEGACY_VERSION}:${runId}:`,
  ];
  const globalKey = previewTileGlobalStorageKey(runId);
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    if (key === globalKey || prefixes.some((prefix) => key.startsWith(prefix)))
      toRemove.push(key);
  }
  for (const key of toRemove) storage.removeItem(key);
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
 * Near-full stage: ≥~85%×≥~75% of RF pane, clamped (Arch G4).
 * Not free-resize; not an OS window.
 */
export function previewTileStageLayout(pane: {
  width: number;
  height: number;
}): { width: number; bodyHeight: number } {
  const paneW = Math.max(320, pane.width || 960);
  const paneH = Math.max(240, pane.height || 640);
  const width = Math.min(
    Math.min(1200, paneW - 48),
    Math.max(Math.floor(paneW * 0.85), previewTileMediumLayout.width),
  );
  const bodyHeight = Math.min(
    Math.min(900, paneH - 72),
    Math.max(Math.floor(paneH * 0.75), previewTileMediumLayout.bodyHeight),
  );
  return { width, bodyHeight };
}

/**
 * Resolve canvas position: live drag → stored UI coords → satellite default.
 * Mini/collapse must not fall back to satellite when x/y were stored (E1).
 */
export function resolvePreviewTilePosition(
  state: PreviewTileUiState,
  liveDrag: { x: number; y: number } | undefined,
  satellite: { x: number; y: number },
): { x: number; y: number } {
  if (liveDrag) return liveDrag;
  return previewTileStoredPosition(state) ?? satellite;
}
