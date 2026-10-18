# Connections sticky + card actions + Menú spacing — chrome brief

NO CODE. LOCAL. Solar tokens.  
**Still applies:** hide Modal X on Connections (`.intent/connections-menu-overlay-brief.md`).  
**Out of scope:** ship/PR; restart/port race; new menu destinations.

**Evidence**

| File | Bug |
|---|---|
| `connections-sticky-bleed-0926.png` | Scrolled card actions (Set up / Help) paint over CONNECTIONS eyebrow; sticky/content gap feels broken |
| `connections-help-size-mismatch.png` | Help (and action row) height/spacing inconsistent; buttons overlap path text on some cards |
| `menu-overlaps-connected.png` | Menú hover/focus thick gold border eats into “Connected” |

**Surfaces:** `Connections.tsx`, `canvas.css` (`.connections-identity`, `.connection-card`, `.connection-path`, `.connection-row-actions`), `AppMenu` trigger + `.topbar-right` / `.connection`.

---

## 1) Sticky identity — no bleed, sealed band

### Required behavior

- While scrolling Connections body, **no card pixels** (text, badges, buttons) appear above or through the identity band.
- Eyebrow / title / CalVer / Recheck / Back stay fully readable on an **opaque** surface.
- No “floating gap” where content shows between sticky bottom edge and first visible card.

### Spec

| Rule | Value |
|---|---|
| Background | Solid always: light `#fffefa`; dark `#232c33` — **no** translucency / color-mix |
| Stacking | `.connections-identity { isolation: isolate; z-index: 5; }` — cards / grid `z-index: 0` (or auto) |
| Scrollport | Sticky must stick inside the **same element that scrolls** (prefer `.connections-view { overflow: auto; }` with identity as first child; avoid sticky inside a non-scrolling padded modal while siblings scroll underneath) |
| Negative margins | Remove `margin: 0 -4px` (or equivalent) that lets siblings paint into the band; use full-bleed padding instead |
| Seal | `border-bottom: 1px solid var(--line)` **plus** optional `box-shadow: 0 8px 12px -8px` same as panel bg (opaque soft seal — not a hole) |
| Padding | `padding: 16px 0 20px` (or match popup horizontal padding); keep ≥16px below CalVer before border |
| Top | `top: 0` relative to scrollport; if modal has padding-top, sticky top accounts for it so band doesn’t sit under clipped chrome |

### Acceptance

- [ ] Scroll cards hard: Set up / Help / paths never overlay CONNECTIONS / title / CalVer / header actions
- [ ] No visible “broken gap” stripe between sticky bottom and content
- [ ] Light + dark both opaque

---

## 2) Card action row — equal height, no overlap with path

### Required behavior

- Every action button (Set up, Copy path, Recheck, Help, Resolver…) shares **one control height**.
- Path text never intersects buttons.
- Configured vs missing cards use the **same** action-row geometry (only which buttons differ).

### Spec

| Rule | Value |
|---|---|
| Path block | `.connection-path { margin: 0; padding: 0; min-height: …; }` — block formatting context; no absolute children |
| Actions | `.connection-row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }` — **never** negative margin |
| Button box | All row buttons: `box-sizing: border-box; min-height: 36px; height: 36px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; line-height: 1;` |
| Primary vs ghost | Same height; only fill/border/color differ (primary filled, secondary/ghost outline) |
| Help | Same class metrics as other ghosts — no square “icon-only” height that differs from text buttons unless icon+label both centered in 36px |
| Card layout | Prefer `display: flex; flex-direction: column` on `.connection-card` with `margin-top: auto` on actions **or** normal flow with clear path→actions gap — **no** overlapping grid areas |
| Long paths | Truncate/ellipsis in path; wrapping must not invade action row (reserve actions outside path’s box) |

### Acceptance

- [ ] Cursor/missing cards: Help clears path by ≥8px
- [ ] Configured vs missing: button heights match (36px)
- [ ] No overlap at light/dark, narrow card width

---

## 3) Menú vs Connected — no border collision

### Required behavior

- Hover/focus on Menú never covers or touches the “Connected” / service-state label.
- Emphasis without growing into the neighbor.

### Spec

| Rule | Value |
|---|---|
| Gap | `.topbar-right` gap between `.connection` and `.app-menu` ≥ **16px** (prefer 18–20px). If gap is shared, add `.app-menu { margin-inline-start: 4px; }` as needed so **hover ring still clears** Connected |
| Border width | Trigger keeps **1px border always** (transparent or `--line` at rest). Hover/focus: **do not** increase border-width |
| Hover emphasis | Prefer `border-color: var(--gold)` at 1px **or** `box-shadow: 0 0 0 1px var(--gold)` **outside** without layout shift — if using focus-visible outline, `outline-offset: 2px` must still clear Connected (increase gap, don’t thicken into left) |
| Focus-visible | Same: no 3–4px “thick border” that eats left neighbor; use outline + offset into empty gap toward the right/outside |
| Hit target | Keep min-height ~36–38px |

### Acceptance

- [ ] Hover + keyboard focus Menú: Connected glyphs fully visible, no overlap
- [ ] No layout jump when hovering
- [ ] Light + dark

---

## Tokens

Reuse existing `--ink`, `--muted`, `--line`, `--gold`, panel `#fffefa` / `#232c33`. No purple glow. No new copy required (chrome-only).

---

## Implementation order (Developer)

1. Sticky scrollport + opaque seal (P0 bleed)  
2. Action row metrics + path clearance  
3. Topbar gap + 1px hover (Menú / Connected)

---

## Acceptance (all)

- [ ] Three Oscar screenshots’ failure modes gone on current Desktop light/dark  
- [ ] Overlay “no X on Connections” still true  
- [ ] LOCAL only
