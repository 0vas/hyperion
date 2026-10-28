/** Client-only preview tile prefs — never written into run snapshots. */

/** Track J device resolution = CONTENT viewport (not outer frame). */
export type PreviewTileSize = 'mobile' | 'tablet' | 'desktop';

export type PreviewTileUiState = {
  x?: number;
  y?: number;
  size: PreviewTileSize;
  collapsed: boolean;
  /** Outer TILE FRAME width (Track J5) — independent of resolution preset. */
  frameW?: number;
  /** Outer TILE FRAME body height (Track J5) — independent of resolution preset. */
  frameH?: number;
};

export type PreviewTileGlobalState = {
  /** When true, canvas preview tiles are not mounted (≠ delete artifacts). */
  hideAll: boolean;
};

/** Track J bumps storage — migrate mini/medium/stage → mobile/tablet/desktop. */
export const PREVIEW_TILE_UI_VERSION = 'v3';
export const PREVIEW_TILE_UI_LEGACY_V2 = 'v2';
export const PREVIEW_TILE_UI_LEGACY_VERSION = 'v1';
export const PREVIEW_TILE_GLOBAL_VERSION = 'v1';

/** New tiles default to mobile content viewport (Track J). */
export const previewTileUiDefaults: PreviewTileUiState = {
  size: 'mobile',
  collapsed: false,
};

export const previewTileGlobalDefaults: PreviewTileGlobalState = {
  hideAll: false,
};

/** Content viewports (logical) — resolution presets. */
export const previewTileMobileViewport = {
  width: 390,
  bodyHeight: 844,
} as const;

export const previewTileTabletViewport = {
  width: 768,
  bodyHeight: 1024,
} as const;

export const previewTileDesktopViewport = {
  width: 1280,
  bodyHeight: 800,
} as const;

/** Default outer frames (smaller than content → contain letterbox). */
export const previewTileMobileFrame = {
  width: 280,
  bodyHeight: 180,
} as const;

export const previewTileTabletFrame = {
  width: 420,
  bodyHeight: 320,
} as const;

export const previewTileDesktopFrame = {
  width: 560,
  bodyHeight: 360,
} as const;

/** @deprecated Alias — prefer previewTileMobileFrame (Track J). */
export const previewTileCompactLayout = previewTileMobileFrame;
/** @deprecated Alias — prefer previewTileTabletFrame / tablet viewport. */
export const previewTileMediumLayout = {
  width: 480,
  bodyHeight: 320,
} as const;

export function previewTileContentViewport(size: PreviewTileSize): {
  width: number;
  bodyHeight: number;
} {
  if (size === 'tablet') return previewTileTabletViewport;
  if (size === 'desktop') return previewTileDesktopViewport;
  return previewTileMobileViewport;
}

export function previewTileDefaultFrame(size: PreviewTileSize): {
  width: number;
  bodyHeight: number;
} {
  if (size === 'tablet') return previewTileTabletFrame;
  if (size === 'desktop') return previewTileDesktopFrame;
  return previewTileMobileFrame;
}

/**
 * Uniform contain scale: fit content viewport into outer frame (letterbox OK).
 * Frame resize must use this — never mutate `size` when dragging edges (J5).
 */
export function previewTileContainScale(
  frame: { width: number; bodyHeight: number },
  content: { width: number; bodyHeight: number },
): number {
  const sx = frame.width / content.width;
  const sy = frame.bodyHeight / content.bodyHeight;
  return Math.min(sx, sy);
}

/** @deprecated Prefer previewTileContainScale with explicit content viewport. */
export function previewTileMiniContainScale(
  frame: { width: number; bodyHeight: number } = previewTileMobileFrame,
  content: { width: number; bodyHeight: number } = previewTileMediumLayout,
): number {
  return previewTileContainScale(frame, content);
}

export const PREVIEW_TILE_SIZE_OPTIONS: PreviewTileSize[] = [
  'mobile',
  'tablet',
  'desktop',
];

export const PREVIEW_TILE_FRAME_MIN = { width: 200, bodyHeight: 120 } as const;
export const PREVIEW_TILE_FRAME_MAX = { width: 1200, bodyHeight: 900 } as const;

export function clampPreviewTileFrame(
  width: number,
  bodyHeight: number,
): { width: number; bodyHeight: number } {
  return {
    width: Math.min(
      PREVIEW_TILE_FRAME_MAX.width,
      Math.max(PREVIEW_TILE_FRAME_MIN.width, Math.round(width)),
    ),
    bodyHeight: Math.min(
      PREVIEW_TILE_FRAME_MAX.bodyHeight,
      Math.max(PREVIEW_TILE_FRAME_MIN.bodyHeight, Math.round(bodyHeight)),
    ),
  };
}

export function resolvePreviewTileFrame(
  state: PreviewTileUiState,
  pane?: { width: number; height: number },
): { width: number; bodyHeight: number } {
  const defaults = previewTileDefaultFrame(state.size);
  const rawW = finiteNumber(state.frameW) ?? defaults.width;
  const rawH = finiteNumber(state.frameH) ?? defaults.bodyHeight;
  let frame = clampPreviewTileFrame(rawW, rawH);
  if (state.size === 'desktop' && pane) {
    const soft = previewTileStageLayout(pane);
    frame = clampPreviewTileFrame(
      Math.min(frame.width, soft.width),
      Math.min(frame.bodyHeight, soft.bodyHeight),
    );
  }
  return frame;
}

/**
 * Near-full soft-cap for large frames (Arch G4 / J5).
 * Not a resolution preset — only caps oversized frames.
 */
export function previewTileStageLayout(pane: {
  width: number;
  height: number;
}): { width: number; bodyHeight: number } {
  const paneW = Math.max(320, pane.width || 960);
  const paneH = Math.max(240, pane.height || 640);
  const width = Math.min(
    Math.min(1200, paneW - 48),
    Math.max(Math.floor(paneW * 0.85), previewTileTabletFrame.width),
  );
  const bodyHeight = Math.min(
    Math.min(900, paneH - 72),
    Math.max(Math.floor(paneH * 0.75), previewTileTabletFrame.bodyHeight),
  );
  return { width, bodyHeight };
}

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

export function previewTileStoredFrame(
  state: PreviewTileUiState,
): { width: number; bodyHeight: number } | undefined {
  const width = finiteNumber(state.frameW);
  const bodyHeight = finiteNumber(state.frameH);
  if (width === undefined || bodyHeight === undefined) return undefined;
  return clampPreviewTileFrame(width, bodyHeight);
}

export function isPreviewTileUiDefault(state: PreviewTileUiState): boolean {
  return (
    state.size === previewTileUiDefaults.size &&
    state.collapsed === previewTileUiDefaults.collapsed &&
    previewTileStoredPosition(state) === undefined &&
    previewTileStoredFrame(state) === undefined
  );
}

/** v3 sizes + legacy: mini→mobile, medium→tablet, stage→desktop, compact/expanded. */
export function parsePreviewTileSize(value: unknown): PreviewTileSize {
  if (value === 'mobile' || value === 'tablet' || value === 'desktop')
    return value;
  if (value === 'mini' || value === 'compact') return 'mobile';
  if (value === 'medium' || value === 'expanded') return 'tablet';
  if (value === 'stage') return 'desktop';
  return previewTileUiDefaults.size;
}

export function parsePreviewTileUiState(raw: unknown): PreviewTileUiState {
  if (!raw || typeof raw !== 'object') return { ...previewTileUiDefaults };
  const value = raw as Record<string, unknown>;
  const size = parsePreviewTileSize(value.size);
  const collapsed = value.collapsed === true;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const frameW = finiteNumber(value.frameW);
  const frameH = finiteNumber(value.frameH);
  return {
    size,
    collapsed,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(frameW !== undefined ? { frameW } : {}),
    ...(frameH !== undefined ? { frameH } : {}),
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
    for (const legacy of [PREVIEW_TILE_UI_LEGACY_V2, PREVIEW_TILE_UI_LEGACY_VERSION]) {
      const legacyKey = previewTileUiStorageKey(runId, producerStepId, legacy);
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const migrated = parsePreviewTileUiState(JSON.parse(legacyRaw));
      writePreviewTileUiState(runId, producerStepId, migrated, storage);
      try {
        storage.removeItem(legacyKey);
      } catch {
        /* ignore */
      }
      return migrated;
    }
    return { ...previewTileUiDefaults };
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
    const frame = previewTileStoredFrame(state);
    if (frame) {
      payload.frameW = frame.width;
      payload.frameH = frame.bodyHeight;
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

/** Drop size/collapse/position/frame prefs for a run (layout reset). */
export function clearPreviewTileUiForRun(
  runId: string,
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage,
): void {
  const prefixes = [
    `hyperion.previewTile.${PREVIEW_TILE_UI_VERSION}:${runId}:`,
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

/** Live iframe mounts only when the tile is visible and not collapsed. */
export function previewTileMountsIframe(state: PreviewTileUiState): boolean {
  return !state.collapsed;
}

/**
 * Resolve canvas position: live drag → stored UI coords → satellite default.
 */
export function resolvePreviewTilePosition(
  state: PreviewTileUiState,
  liveDrag: { x: number; y: number } | undefined,
  satellite: { x: number; y: number },
): { x: number; y: number } {
  if (liveDrag) return liveDrag;
  return previewTileStoredPosition(state) ?? satellite;
}

/** J5: resize frame only — never touch `size` (resolution). */
export function resizePreviewTileFrame(
  state: PreviewTileUiState,
  next: { width: number; bodyHeight: number },
): PreviewTileUiState {
  const frame = clampPreviewTileFrame(next.width, next.bodyHeight);
  return { ...state, frameW: frame.width, frameH: frame.bodyHeight };
}
