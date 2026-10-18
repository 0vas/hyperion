# Dark empty-home contrast — Designer brief

NO CODE. Short token fix for empty canvas home (no run). Keep solar / Noche del Egeo brand — **no purple glow**.
Out of scope: topbar Menú chrome (1811 vs 1856); Connections inventory features.

**Bug (facts):** `.empty-state h1 { color: #30372d }` is hardcoded — invisible on dark `--stone: #171e23`. Secondary CTA «Conectar otra» / «Connect another» can render light text on a light/white button face in dark theme. Body/kicker also underspecified for dark.

---

## Goal

WCAG **2.1 AA** on empty-state in **light and dark**:

| Text | Min contrast |
|---|---|
| Body, kicker, button labels (normal) | **4.5:1** vs immediate background |
| H1 (large ≥24px / 18px bold — here ~46px) | **3:1** (target **4.5:1** for comfort) |
| Focus ring | Visible 3:1 vs adjacent |

---

## Token mapping (use CSS variables — no hardcoded ink on empty-state)

Existing canvas tokens (`canvas.css` `:root` / `[data-theme='dark']`):

| Token | Light | Dark |
|---|---|---|
| `--stone` (page bg) | `#f4f2eb` | `#171e23` |
| `--ink` | `#292d29` | `#f1eee5` |
| `--muted` | `#62645c` | `#bbbeb7` |
| `--gold` | `#806127` | `#dfc187` |
| `--line` | `#dedbd0` | `#49525b` |
| `--glass` | `rgba(255,254,250,0.92)` | `#232c33f5` |

### Empty-state roles → tokens

| Element | Light | Dark | Notes |
|---|---|---|---|
| `.empty-state` bg | `var(--stone)` | `var(--stone)` | Already |
| `.empty-state h1` | `var(--ink)` | `var(--ink)` | **Remove `#30372d`** |
| `.empty-state p` (body) | `var(--muted)` | `var(--muted)` | Override `style.css` `#5d6371` in canvas scope |
| `.empty-state .eyebrow` | `var(--gold)` | `var(--gold)` | Ensure dark gold on stone ≥4.5:1 (dark `#dfc187` on `#171e23` is fine) |
| `.empty-symbol` bg | `#e9e3d0` (solar wash) | `#2a3228` or `#232c33` | **Do not** keep `style.css` purple `#ece8ff` / `#635495` on canvas empty-state |
| `.empty-symbol` icon | `#7f6535` | `var(--gold)` | Solar only |
| `.primary` | existing green/ink light | existing `#dfc187` / `#20282c` | Keep; verify AA (already intended) |
| `.secondary` (empty-actions) | ink text, `var(--line)` border, transparent/`var(--glass)` fill | **`color: var(--gold)`** + **`background: var(--glass)`** (or `#232c33`) + **`border-color: var(--line)`** | Fix: dark secondary must not sit on white; gold-on-white fails |
| Alert `role="alert"` | semantic danger on stone | lightened danger text on stone | Keep readable; not purple |

### Contrast targets (approx — Developer verify with contrast checker)

| Pair (dark) | Expect |
|---|---|
| `#f1eee5` on `#171e23` (h1) | ≫ 4.5:1 |
| `#bbbeb7` on `#171e23` (body) | ≥ 4.5:1 |
| `#dfc187` on `#171e23` (eyebrow / secondary label on stone) | ≥ 4.5:1 |
| `#dfc187` on `#232c33` (secondary on glass) | ≥ 4.5:1 |
| `#20282c` on `#dfc187` (primary label) | ≥ 4.5:1 |

| Pair (light) | Expect |
|---|---|
| `#292d29` on `#f4f2eb` (h1) | ≫ 4.5:1 |
| `#62645c` on `#f4f2eb` (body) | ≥ 4.5:1 |
| `#806127` on `#f4f2eb` (eyebrow) | ≥ 4.5:1 |

---

## Implementation notes (for Developer — still no Designer code)

1. In `canvas.css`, set `.empty-state h1 { color: var(--ink); }` — delete `#30372d`.
2. Scope empty-state type: `.canvas-app .empty-state p { color: var(--muted); }` so it wins over `style.css`.
3. Dark secondary: extend `[data-theme='dark'] .secondary` (or `.empty-actions .secondary`) with **background + border**, not color-only.
4. Canvas `.empty-symbol` solar override must win over `style.css` purple in both themes.
5. Do not introduce new brand hues; no purple-on-white / glow.
6. Smoke: theme light/dark + system; empty home with 0 connections and with ≥1 (primary + secondary CTAs); focus-visible on both buttons.

---

## ES/EN

No new copy required. Existing strings stay (`Tu trabajo, paso a paso.` / `Your work, step by step.`, CTAs, etc.).

---

## Acceptance

- [ ] Dark empty h1 clearly readable (ink on stone)
- [ ] Body + eyebrow AA on stone
- [ ] Primary + secondary CTAs AA in light and dark (secondary not light-on-white)
- [ ] Empty symbol solar, not purple
- [ ] No purple glow / no new marketing palette
- [ ] Light theme unchanged in spirit (tokenized, not washed out)
