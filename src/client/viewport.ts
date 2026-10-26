/** Keep camera calculations aligned with the two compact bars and bottom actions. */
export const canvasInsets = { top: 108, bottom: 64, side: 12 };

/** Resultado dock widths (≥960px split). Sheet overlays use bottom inset instead. */
export const resultadoDock = {
  breakpoint: 960,
  minWidth: 320,
  maxWidth: 480,
  /** ~38% of viewport, clamped — canvas keeps ~58–65%. */
  preferredFraction: 0.38,
  sheetHeightVh: 55,
  sheetExpandedVh: 90,
} as const;

export function resultadoDockWidth(viewportWidth: number): number {
  return Math.min(
    resultadoDock.maxWidth,
    Math.max(
      resultadoDock.minWidth,
      Math.round(viewportWidth * resultadoDock.preferredFraction),
    ),
  );
}

export function canvasInsetsWithResultado(options: {
  open: boolean;
  narrow: boolean;
  sheetExpanded?: boolean;
}): typeof canvasInsets {
  if (!options.open) return canvasInsets;
  if (!options.narrow) {
    // Wide split: React Flow lives in the left pane, so side insets stay local.
    return canvasInsets;
  }
  const vh = options.sheetExpanded
    ? resultadoDock.sheetExpandedVh
    : resultadoDock.sheetHeightVh;
  return {
    ...canvasInsets,
    bottom: Math.round((vh / 100) * (globalThis.innerHeight || 800)) + 12,
  };
}
