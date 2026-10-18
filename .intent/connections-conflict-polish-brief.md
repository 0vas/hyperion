# Connections conflict + Menú polish — Designer brief

NO CODE. LOCAL brief. Developer implements after.
**Empty-home contrast:** use existing [`.intent/dark-empty-home-contrast-brief.md`](dark-empty-home-contrast-brief.md) — do not rewrite; no gap beyond “apply that brief.”
**Out of scope:** restart/port race; shipping/PR/Desktop publish.

---

## Problem (Oscar 1856)

| Issue | Fact |
|---|---|
| Conflict actions equal weight | Card: Ver conflicto / Copiar ruta / Ayuda para resolver all look the same |
| «Ayuda para resolver» useless | `Connections.tsx` → `onHelp` (generic guide), not the replace path |
| Replace buried | App conflict modal → Reemplazar… → confirm → `setupConnection(id, true)` |
| No existing-entry metadata | `connection-status.ts` conflict `detail` is generic only |
| Menú too plain | `AppMenu.tsx` works but sparse visually |
| Dark contrast | Badges/buttons/titles still weak on Connections (plus empty-home brief) |

---

## 1) Conflict resolver (Help resolve → real resolver)

### Rename + behavior

| Control | Behavior |
|---|---|
| Card primary (conflict) | **Resolver conflicto…** (opens resolver modal) — replaces dual equal “Ver conflicto” + “Ayuda para resolver” |
| Card secondary | **Copiar ruta** (ghost/outline) |
| Remove from card | Separate «Ayuda para resolver» that opens generic help |
| Optional tertiary | **Guía** (ghost) → existing connection guide — clearly secondary |

«Ver conflicto…» may remain as alias of Resolver for one release, or map both labels to the same modal — prefer single label **Resolver conflicto…**.

### Resolver modal content (aesthetic, professional)

**Title:** `Conflicto en {clientName}` / `Conflict in {clientName}`

**Lead:** existing no-overwrite honesty (keep).

**Two columns (stack on narrow):**

| Column | ES label | EN | Content |
|---|---|---|---|
| Left | Entrada actual | Current entry | Sanitized metadata of **existing** `hyperion` (see below) |
| Right | Entrada esperada | Expected entry | Sanitized metadata Hyperion would write |

**Sanitized fields to project** (extend API/row — Designer contract for Developer):

Show when present; omit empty. **Never** show token values, API keys, passwords, full `env` secret values.

| Field | Display | Notes |
|---|---|---|
| `command` | command string | Truncate middle if long |
| `args` | joined args or list | Paths OK; no secrets |
| `cwd` / working dir | path if any | |
| `url` / `HYPERION_URL` | URL only | From env **keys** allowlist |
| Env keys present | chip list of **names only** e.g. `HYPERION_AGENT_ID`, `HYPERION_DATA_DIR`, `HYPERION_URL`, `ELECTRON_RUN_AS_NODE` | Values: show non-secret ones (url, agent id, data dir paths); mask anything else as `••••` or omit |
| `type` | `stdio` etc. | If present |
| Skill/manifest (Claude Code) | path + `owner` if any | No file body dump |

**Diff cue:** highlight rows that differ (amber soft bg on the differing field — solar, not red panic).

**Footer honesty:** backup will be created on replace; other MCP servers kept.

### Modal actions (hierarchy)

| Rank | ES | EN | Style |
|---|---|---|---|
| Primary | Reemplazar conexión | Replace connection | `primary` or `danger` → opens **existing** confirm alertdialog (#31 copy) |
| Secondary | Copiar ruta | Copy path | outline/ghost |
| Tertiary | Abrir guía | Open guide | ghost/link |
| Dismiss | Cerrar | Close | ghost |

Flow: Resolver → (optional inline summary) → **Reemplazar conexión** → confirm «¿Reemplazar…?» with backup copy → `setupConnection(id, true)`. Never one-click replace from the card.

---

## 2) Connection cards — action hierarchy + dark AA

### One primary per state

| State | Primary | Secondary | Tertiary |
|---|---|---|---|
| missing | Configurar… (`primary` small) | — | Ayuda (ghost) |
| configured | Copiar ruta (outline) | Volver a comprobar (ghost) | Ayuda (ghost) |
| conflict | **Resolver conflicto…** (`primary` or brand-strong) | Copiar ruta (outline) | Guía (ghost) |
| unknown | Reintentar comprobación (`primary` small) | Copiar ruta if path | Ayuda (ghost) |

Max **one** filled primary button per card. Others outline/ghost. Do not render three equal filled chips.

### Visual / tokens (solar, dark AA)

Reuse canvas tokens (`--ink`, `--muted`, `--stone`, `--gold`, `--line`, `--glass`).

| Element | Light | Dark |
|---|---|---|
| Card surface | `#fffefa` / glass | `#232c33` |
| Card title | `var(--ink)` | `var(--ink)` `#f1eee5` |
| Path caption | `var(--muted)` | `var(--muted)` `#bbbeb7` |
| Badge configured | soft green wash + dark green text | `#35463e` / `#dce6dd` (existing status pattern) |
| Badge conflict | amber wash `#f5e6c8` / `#705623` | `#51452f` / `#f1dab2` |
| Badge missing | muted line + muted text | `#2d373e` / `#bbbeb7` |
| Outline button | ink on transparent, `var(--line)` border | gold text, `var(--line)` border, **glass fill** (not white) |
| Primary on card | brand primary | gold primary `#dfc187` / `#20282c` |

WCAG AA on badge text and button labels. No purple glow, no equal-weight button farm.

---

## 3) Menú polish (same `AppMenuAction` set)

**Do not invent destinations.** Keep actions: connections, settings, guide, help, legend, window, updates, about, request, activity, pause, resume.

### Denser Emil-style panel

| Change | Spec |
|---|---|
| Width | ~340–360px desktop (was 320) |
| Version header | Stronger: 13px tabular, full ink, subtle bottom border; optional “Vista previa” channel as muted chip |
| Section labels | Always label groups: **Aplicación** (Conexiones, Ajustes), **Ayuda** (Guía, Ayuda de conexión), **Más** (Colores, Ventana/Updates), then Acerca de. Keep **Este flujo** when run |
| Row rhythm | min-height 44px; 15px type; 4px gap between rows; separators 8px margin |
| Trigger | Slightly heavier: min-height 36px, font-weight 550, gold border on hover (keep `:active` scale 0.97) |
| Panel chrome | Soft shadow + 1px line; dark uses `--glass`/`#232c33` — not flat sparse list |
| Icons (optional) | 16px muted leading icons on rows — same actions only; if icons add noise, skip and use type hierarchy alone |
| Motion | Keep 150–180ms ease-out; reduced-motion instant |

### Section map (labels only — same actions)

```
Hyperion {calver} UTC · {channel}

[Este flujo]          ← if run
  Petición original / Actividad / Pausar|Reanudar

[Aplicación]
  Conexiones / Ajustes

[Ayuda]
  Guía de uso / Ayuda de conexión

[Más]
  Colores del flujo / Abrir en ventana | Buscar actualizaciones…

────────
Acerca de Hyperion
```

---

## 4) Empty-home

Point Developer to **`.intent/dark-empty-home-contrast-brief.md`** (h1 `var(--ink)`, secondary glass fill, solar symbol). No duplicate token table here.

---

## ES ↔ EN keys (new / changed)

| ES | EN |
|---|---|
| Resolver conflicto… | Resolve conflict… |
| Conflicto en {0} | Conflict in {0} |
| Entrada actual | Current entry |
| Entrada esperada | Expected entry |
| Campos que difieren | Differing fields |
| Reemplazar conexión | Replace connection |
| Se creará un respaldo del archivo antes de escribir la entrada Hyperion esperada. | A backup of the file is created before writing the expected Hyperion entry. |
| Aplicación | Application |
| Ayuda | Help |
| Más | More |
| *(keep)* Copiar ruta / Abrir guía / Cerrar / ¿Reemplazar la conexión Hyperion? / Se sobrescribirá… | existing EN |

Retire as primary card CTA: «Ayuda para resolver» → generic help. Prefer «Resolver conflicto…».

---

## Data contract note (for Developer)

Extend conflict rows (names flexible) e.g.:

```ts
existing?: { command?: string; args?: string[]; cwd?: string; url?: string; envKeys?: string[]; envPreview?: Record<string, string> }
expected?: { /* same shape */ }
```

Populate in `connection-status.ts` when status is `conflict`. Sanitize before JSON to client. Claude Code: path + owner/manifest summary instead of MCP server shape.

---

## Acceptance

- [ ] Conflict card: one primary **Resolver conflicto…**; Help-resolve no longer opens useless generic help as primary
- [ ] Resolver modal shows current vs expected sanitized metadata + Replace → confirm backup
- [ ] Card button hierarchy + dark AA badges/buttons
- [ ] Menú denser with section labels; same AppMenuAction set; CalVer still first
- [ ] Empty-home via existing contrast brief
- [ ] ES↔EN keys above; solar brand; no purple glow
- [ ] Local implement; no ship from this brief alone

---

## Emil notes (taste)

- Expected action: “resolve conflict” does the replace path, not a guide detour.
- Unseen detail: differing fields highlighted; secrets never printed.
- Menu: hierarchy over icon soup; short ease-out only.
