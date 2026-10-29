/** Client-only preview tile preferences — never written into run snapshots. */

export type PreviewTileUiState = {
  x?: number;
  y?: number;
  collapsed: boolean;
};

export type PreviewTileGlobalState = {
  /** When true, canvas preview tiles are not mounted (≠ delete artifacts). */
  hideAll: boolean;
};

/** v4 removes device presets and free frame resizing for one calm canvas frame. */
export const PREVIEW_TILE_UI_VERSION = 'v4';
export const PREVIEW_TILE_UI_LEGACY_V3 = 'v3';
export const PREVIEW_TILE_UI_LEGACY_V2 = 'v2';
export const PREVIEW_TILE_UI_LEGACY_VERSION = 'v1';
export const PREVIEW_TILE_GLOBAL_VERSION = 'v1';

/** The single readable canvas preview size. Use Ampliar for full screen. */
export const previewTileStandardFrame = {
  width: 480,
  bodyHeight: 300,
} as const;

export const previewTileUiDefaults: PreviewTileUiState = {
  collapsed: false,
};

export const previewTileGlobalDefaults: PreviewTileGlobalState = {
  hideAll: false,
};

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
    state.collapsed === previewTileUiDefaults.collapsed &&
    previewTileStoredPosition(state) === undefined
  );
}

/** Reads v4 prefs, or keeps only placement/collapse from earlier layouts. */
export function parsePreviewTileUiState(raw: unknown): PreviewTileUiState {
  if (!raw || typeof raw !== 'object') return { ...previewTileUiDefaults };
  const value = raw as Record<string, unknown>;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  return {
    collapsed: value.collapsed === true,
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
    for (const legacy of [
      PREVIEW_TILE_UI_LEGACY_V3,
      PREVIEW_TILE_UI_LEGACY_V2,
      PREVIEW_TILE_UI_LEGACY_VERSION,
    ]) {
      const legacyKey = previewTileUiStorageKey(runId, producerStepId, legacy);
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const migrated = parsePreviewTileUiState(JSON.parse(legacyRaw));
      writePreviewTileUiState(runId, producerStepId, migrated, storage);
      try {
        storage.removeItem(legacyKey);
      } catch {
        /* Storage cleanup is optional. */
      }
      return migrated;
    }
  } catch {
    /* Storage is optional. */
  }
  return { ...previewTileUiDefaults };
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
    const payload: PreviewTileUiState = { collapsed: state.collapsed };
    const position = previewTileStoredPosition(state);
    if (position) Object.assign(payload, position);
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

/** Drop preview placement/collapse prefs for a run (layout reset). */
export function clearPreviewTileUiForRun(
  runId: string,
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage,
): void {
  const prefixes = [
    `hyperion.previewTile.${PREVIEW_TILE_UI_VERSION}:${runId}:`,
    `hyperion.previewTile.${PREVIEW_TILE_UI_LEGACY_V3}:${runId}:`,
    `hyperion.previewTile.${PREVIEW_TILE_UI_LEGACY_V2}:${runId}:`,
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

export function previewTileMountsIframe(state: PreviewTileUiState): boolean {
  return !state.collapsed;
}

/** Resolve canvas position: live drag → stored UI coords → satellite default. */
export function resolvePreviewTilePosition(
  state: PreviewTileUiState,
  liveDrag: { x: number; y: number } | undefined,
  satellite: { x: number; y: number },
): { x: number; y: number } {
  if (liveDrag) return liveDrag;
  return previewTileStoredPosition(state) ?? satellite;
}
