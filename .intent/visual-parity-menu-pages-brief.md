# Visual parity — Pages flow + Menú + Connections + Guide contrast

**Bar:** Oscar rejected incremental polish. Match the **real Hyperion canvas** look (reference: `.intent/attachments/real-canvas-flow-reference.png`), not gray stubs.

NO CODE. LOCAL brief only. No ship/PR from Designer.  
**Out of scope:** Menú IPC updater (#36); inventing AppMenu destinations; claiming live agent execution on Pages.

**Evidence**

| File | Issue |
|---|---|
| `pages-illustrative-plan-bad.png` | GoalExplorer stubs — flat gray cards, thin dead edges, gateway text crushed in diamond |
| `real-canvas-flow-reference.png` | **TARGET** — status pills, mint path glow, gold gateway, dashed skip, start/end rings |
| `connections-header-0820.png` / `connections-cards-0820.png` | Cramped, iconless, gray-on-gray |
| `guide-steps-low-contrast.png` | Guide step titles plomo-con-plomo in dark |

**Supersedes (visual chrome only):** sparse Menú/Connections guidance in earlier overlay/conflict briefs where they conflict — **honesty + AppMenuAction set + Simulation badge stay**.

---

## 1) Pages — GoalExplorer «Plan ilustrativo» → canvas parity

**Surfaces:** `docs/site/.vitepress/components/GoalExplorer.vue`, `theme/goals.css`. Optionally borrow visual language from product canvas (`step-node`, status pills, edge treatment) — **do not** mount live React Flow on the marketing site unless already practical; CSS + SVG parity is enough.

**Honesty (unchanged):** badge `Simulación · no ejecuta` / `Simulation · not running`. No SSE, no “live”, no green “Running” that implies a real agent.

### Target anatomy (per node)

| Part | Spec (dark site / home) | Maps from product |
|---|---|---|
| Card shell | min-width ~200px; radius 14–16px; fill `#232c33` / soft stone; border 1px | `.step-node` |
| Header row | Lucide/role icon (16–18px) + **status pill** | `.status-tag` |
| Title | 13–14px semibold `text-1` / near-white | node title |
| Role line | 11px muted: Agente / Tú / Tú revisas | owner |
| Optional meta | omit I/O counts on Pages (would fake product data) — **or** show static illustrative `I/O · —` only if clearly decorative | skip if honesty risk |
| Active / chosen path card | mint/seafoam border + soft outer glow `0 0 0 1px` + `0 0 20px` mint @ 20% | completed/active glow |
| Alt / unchosen branch card | dashed border, dimmer fill, title opacity ~0.7; pill **Omitido** / **Skipped** | skipped |
| Pending (before choice) | solid quiet border; pill **En espera** / **Waiting** or **Elige** / **Choose** at gateway | waiting |

### Status pills (illustrative vocabulary — ES / EN)

| State | ES | EN | Colors (dark) |
|---|---|---|---|
| On active path (settled demo) | Completado | Completed | bg `#35463e` text `#dce6dd` |
| Human / decision | Tu turno | Your turn | bg `#51452f` text `#f1dab2` |
| Alt branch after choice | Omitido | Skipped | bg `#2d373e` text `#bbbeb7` |
| Before choice (gateway arms) | Pendiente | Pending | dashed card; muted pill |

Pills are **simulation labels**, not live run status.

### Edges

| Kind | Spec |
|---|---|
| Active / chosen | 2.5–3px solid mint `#7dcea0`–`#9fe6c1`; optional soft glow; curved or smooth orthogonal — **not** 1px dead gray |
| Alt / skipped | 1.5px **dashed** `#6a737c`; no glow |
| Before choice | both arms dashed muted; after choice, promote chosen + demote alt |

### Start / End / Gateway

| Node | Spec |
|---|---|
| Start | Filled mint circle + inner dot; label under or beside (ES `Inicio` / EN `Start`) — green like product |
| End | Red double-ring circle; label `Fin` / `End` |
| Exclusive gateway | **Gold diamond** with × or gateway glyph **inside**; **question label OUTSIDE below** the diamond (never crush “Exclusiva…” inside clip-path). Chip under label: `Exclusiva (una rama)` / `Exclusive (one branch)` in readable 11px on soft gold wash |
| Parallel split/join | Same diamond language with distinct glyph; labels outside |

**Kill:** CSS `clip-path` diamond that clips title text. Prefer SVG diamond + HTML label underneath (product pattern).

### Preview stage chrome

- Stage background: deep charcoal like canvas (`#171e23`), not flat `bg-soft` soup.
- Title row: keep Simulation badge (muted pill — never green “live”).
- After user picks a branch: animate path once (optional, &lt;300ms ease-out) or instant under reduced-motion; **never** loop “progress” glow.

### Light mode Pages

Mirror with solar marble: cards `#fffefa`, active edge deep green `#3e6250`, gateway gold `#806127`, skipped dashed gray — same structure.

### Acceptance (Pages)

- [ ] Side-by-side with `real-canvas-flow-reference.png`: pills, glow path, dashed skip, gateway label readable outside diamond, start green / end red
- [ ] Simulation badge present; no live-run claims
- [ ] Dark + light AA on titles, roles, gateway chips
- [ ] Topologies from prior GoalExplorer brief still work (exclusive, asymmetric, parallel)

---

## 2) Desktop Menú — product-grade panel

**Surfaces:** `AppMenu.tsx`, `.app-menu*` in `canvas.css`.  
**Same `AppMenuAction` set** — no new destinations.

| Element | Spec |
|---|---|
| Panel width | **420–480px** (raise from ~320–360) |
| Material | Solid `#fffefa` / dark `#232c33`; shadow `0 18px 48px` @ 16% black; radius 16px; 1px `var(--line)` |
| Trigger | Height 36–38px, weight 600, matches service pill; gold border hover |
| Version | Full-width header, 13px tabular ink, solid separator |
| Sections | Labels always: Este flujo / Aplicación / Ayuda / Más |
| Rows | min-height **44px**; **leading Lucide 18px** muted → ink on hover; 15px label; optional trailing chevron none |
| Motion | 160ms ease-out; reduced-motion instant |

### Icon list (row → lucide name)

| Action | Icon |
|---|---|
| connections | `Plug` |
| settings | `Settings2` |
| guide | `BookOpen` |
| help | `CircleHelp` |
| legend | `Route` |
| window | `ExternalLink` |
| updates | `Download` or `RefreshCw` |
| about | `Info` |
| request | `MessageSquareText` |
| activity | `History` |
| pause | `Pause` |
| resume | `Play` |

### Acceptance (Menú)

- [ ] Feels peer to product topbar — not a sparse browser menu
- [ ] Icons + sections + width; CalVer first; dark AA
- [ ] No new actions

---

## 3) Connections — width, icons, hierarchy

**Surfaces:** `Connections.tsx`, `.connections-popup` / view CSS.

| Element | Spec |
|---|---|
| Popup width | `min(1040px, 100vw - 32px)` — use space; 2–3 column card grid ≥260px cards |
| Header | Opaque sticky (prior overlay brief); Recheck outline + Back primary-ghost; CalVer under title in `var(--ink)` @ 0.9 opacity |
| Client cards | **Brand/mark icon** 28–32px (simple mono marks OK — Codex/Cursor/Claude/Antigravity; SVG in repo or lucide fallbacks: `Bot`, `Code2`, etc. if marks unavailable) |
| Title | `var(--ink)` 16px semibold — not muted gray |
| Badges | AA pills (configured green wash, missing muted, conflict amber) |
| Path | mono 12px muted; ellipsis middle; full `title` |
| Actions | one primary per state (conflict-polish brief); outline/ghost secondary; no equal chip farm |
| Service strip | left status + honesty; optional mint dot when online |

### Acceptance (Connections)

- [ ] Not cramped gray soup; icons present; AA titles/badges/buttons
- [ ] Width uses desktop; hierarchy obvious
- [ ] Overlay rules from `connections-menu-overlay-brief.md` still apply (no X over Recheck)

---

## 4) Guide steps — dark contrast fix

**Surface:** `.usage-guide` in `canvas.css` (+ help modal).

| Element | Light | Dark |
|---|---|---|
| `li strong` (step title) | `var(--ink)` — **remove hardcoded `#303a2d`** | **`var(--ink)` `#f1eee5`** — must NOT share muddy muted; hierarchy = titles brighter than body |
| `li span` (body) | `var(--muted)` | `var(--muted)` `#bbbeb7` |
| Numbers | inherit strong / ink | ink |

**Bug:** `.usage-guide li strong { color: #303a2d }` leaks on dark (plomo-con-plomo). Dark override that paints strong as `--muted` also flattens hierarchy — titles must be `--ink`.

### Acceptance (Guide)

- [ ] Dark: step titles clearly brighter than descriptions (AA on both)
- [ ] Light: still solar-readable
- [ ] Screenshot no longer matches `guide-steps-low-contrast.png` failure

---

## Shared tokens (solar / canvas — no purple glow)

| Token | Light | Dark |
|---|---|---|
| Stage / stone | `#f4f2eb` | `#171e23` |
| Card | `#fffefa` | `#232c33` |
| Ink | `#292d29` | `#f1eee5` |
| Muted | `#62645c` | `#bbbeb7` |
| Gold (gateway / brand) | `#806127` | `#dfc187` |
| Path mint | `#3e6250` | `#9fe6c1` / `#7dcea0` |
| End red | `#a65d55` | `#e8a59c` ring |
| Line | `#dedbd0` | `#49525b` |

---

## ES ↔ EN (chrome deltas)

| ES | EN |
|---|---|
| Simulación · no ejecuta | Simulation · not running |
| Completado | Completed |
| Omitido | Skipped |
| Pendiente | Pending |
| Tu turno | Your turn |
| Exclusiva (una rama) | Exclusive (one branch) |
| *(Menú/Connections strings)* | keep existing catalogs |

---

## Implementation order (suggestion for Developer)

1. Guide contrast (one-line CSS win)  
2. GoalExplorer visual parity (highest Oscar pain on Pages)  
3. Menú width/icons/material  
4. Connections width/icons/hierarchy  

LOCAL verify: dark Desktop guide + Connections; Pages dark home GoalExplorer Operar/Coordinar; reduced-motion.

---

## Do not claim

- Pages simulation is a live run  
- Animation = agent executing  
- New menu destinations  
- Purple/indigo marketing glow
