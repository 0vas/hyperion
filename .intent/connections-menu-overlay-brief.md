# Connections overlay + Menú aesthetic — Designer brief

NO CODE. LOCAL only. No ship / no PR from Designer.
**Related:** conflict content/resolver → `.intent/connections-conflict-polish-brief.md`. Empty-home contrast → `.intent/dark-empty-home-contrast-brief.md`. This brief is **chrome/overlay/bleed + Menú material**.
**Out of scope:** restart `ERR_CONNECTION_REFUSED` / stale `loadURL` port (Developer).

---

## Verified problems (0617)

| Bug | Cause |
|---|---|
| X overlays Recheck | `App.tsx` always renders `.modal-close` on canvas popup; Connections also has **Volver al canvas** + **Volver a comprobar** in `.connections-identity-actions` — same top-right corner (`.canvas-popup .modal-close { z-index: 3 }`) |
| Cards bleed through header | `.connections-identity` sticky with translucent `color-mix(… 92%, transparent)` + `z-index: 1` — scrolling content shows through |
| Menú still “trash” | Panel/trigger still feel sparse vs product bar despite functional AppMenu |
| Stacking risk | Conflict / Replace modals on top of Connections without explicit single-layer rules |

---

## 1) Single close affordance (Connections)

**Decision:** Prefer **identity actions only**. Hide the generic Modal **X** when `popup === 'connections'` (class `connections-popup`).

| Control | Keep? | Role |
|---|---|---|
| **Volver al canvas** | Yes — primary dismiss | Closes Connections (`onClose` / `setPopup(null)`). Place as clear text/ghost in identity header **right cluster**. |
| **Volver a comprobar** | Yes | Recheck only — never looks like close. Sit **left of** Volver al canvas, or as secondary outline. |
| Modal `.modal-close` (X) | **Hide** on `.connections-popup` | Avoid double dismiss + overlap |
| Escape / backdrop | Keep | Same as other modals — still closes |

**Layout (identity header right):**

```
[ Volver a comprobar ]  [ Volver al canvas ]
```

No absolute X floating over buttons. If a close icon is strongly desired later, put a single **X inside the identity header** aligned with the action row — never both X and Volver.

**a11y:** `aria-labelledby="popup-title"` unchanged; dismiss control must remain keyboard-reachable (Volver al canvas + Escape).

---

## 2) Sticky header — opaque, no bleed

| Rule | Spec |
|---|---|
| Background | **Opaque** panel surface: light `#fffefa` or `var(--panel)`; dark `#232c33` / solid `--glass` equivalent — **not** 92% mix over scrolling cards |
| Sticky | Keep sticky top inside scroll container; add solid bottom border `1px solid var(--line)` or 8–12px fade **mask** that is opaque (not see-through cards) |
| z-index | Header ≥ 2 within connections view; below conflict modal layer |
| Padding | Identity band padding 16–20px bottom so title/CalVer never collide with cards |
| Scroll | Only the **body** below identity scrolls; identity does not transparent-composite over cards |

Hierarchy in identity:

1. Eyebrow CONEXIONES  
2. H2 Conexiones (`var(--ink)`, AA)  
3. CalVer (`Hyperion {v} UTC · {channel}`)  
4. Actions row (Recheck + Back)

---

## 3) Menú — stronger Emil polish (same `AppMenuAction` set)

Do **not** invent new destinations. Polish material to match Hyperion product bar.

| Element | Spec |
|---|---|
| Trigger | Match topbar control weight: min-height **36–38px**, padding 0 14px, font-weight **550–600**, border `var(--line)`, hover gold border; sits visually equal to service pill |
| Panel | Width **360px**; padding **10px**; radius **16px**; shadow `0 16px 40px` soft black 14% (light) / deeper on dark; background **solid** `#fffefa` / `#232c33` — not watery glass |
| Version | First row, 13px tabular, full ink, **solid** bottom separator; channel as muted text |
| Sections | Always show labels: Este flujo / Aplicación / Ayuda / Más (from conflict-polish brief) |
| Rows | min-height **44px**, 15px type, 6px vertical rhythm; hover gold 12% wash; `:active` scale 0.97 |
| Motion | 150–180ms ease-out enter; reduced-motion instant; no bounce |
| Brand | Solar/sepia only — **no purple glow**, no neon |

If still “cheap” after density: add subtle 16px leading icons (same actions only) — optional, secondary to type hierarchy.

---

## 4) Conflict modal on top of Connections — stacking

| Rule | Spec |
|---|---|
| Layers | At most: **Connections** (base) → **Resolver/Conflict** → **Replace confirm** (alertdialog). Never Menu + Connections + Conflict together |
| Opening conflict | Keep Connections mounted underneath **or** dim it; conflict is the only interactive layer |
| Close conflict | Returns focus to Connections card / Resolver trigger — does **not** leave a second X over Recheck |
| Replace confirm | Closes only itself on Cancel; success closes confirm (+ conflict) and refreshes list |
| z-index | Conflict/Replace above Connections popup; no translucent sticky header showing through conflict |

---

## Tokens (dark AA)

| Surface | Light | Dark |
|---|---|---|
| Connections panel / sticky header | `#fffefa` | `#232c33` |
| Menú panel | `#fffefa` | `#232c33` |
| Ink / muted / gold / line | existing `--ink` `--muted` `--gold` `--line` | existing dark tokens |

All header titles, CalVer, menu rows, buttons: WCAG AA vs their opaque surfaces.

---

## ES/EN

No new product claims. Existing strings:

| ES | EN |
|---|---|
| Volver al canvas | Back to canvas |
| Volver a comprobar | Recheck |
| Menú / Abrir menú / Cerrar menú | Menu / Open menu / Close menu |
| Cerrar popup | *(unused on connections if X hidden)* |

Optional aria if X removed: ensure Volver al canvas has clear name (already).

---

## Acceptance

- [ ] Connections: no Modal X overlapping Recheck; one clear dismiss (Volver al canvas)
- [ ] Sticky identity opaque — no card text bleeding through
- [ ] Menú denser/solid material; same AppMenuAction set; solar, dark AA
- [ ] Conflict/Replace stacking single-layer rules honored
- [ ] Restart/port race untouched (Developer)
- [ ] LOCAL implement only

---

## Note for Developer

1. Easiest X fix: do not render `.modal-close` when `popup === 'connections'`, **or** `display: none` on `.connections-popup > .modal-close`.
2. Sticky: replace translucent `color-mix` with solid `--panel` / theme surface + border-bottom.
3. Menú: raise material/density per §3; keep actions from `AppMenu.tsx`.
4. Coordinate with conflict-polish brief for Resolver content — this brief owns chrome/overlay only.
