# GoalExplorer — horizontal Plan ilustrativo (L→R)

NO CODE. LOCAL brief. Oscar chose: **Plan ilustrativo horizontal** (not changing category tabs).

**Problem (0926):** `.goal-fork` / pending branches use `flex-direction: column` — arms stack vertically and break the real Hyperion canvas L→R reading. Evidence: `.intent/attachments/goal-explorer-0926-categories.png`.

**Surfaces:** `docs/site/.vitepress/components/GoalExplorer.vue`, `theme/goals.css`.

**Keep:** `Simulación · no ejecuta`; visual-parity tokens (pills, mint edges, gateway label outside diamond, start green / end red); all topologies (`linear-decision`, `exclusive-mid`, `exclusive-asymmetric`, `parallel-or-sequence`).

**Out of scope:** ship/PR; category tab one-line (desktop OK).

**Related:** `.intent/visual-parity-menu-pages-brief.md` (look) — this brief owns **layout axis only**.

---

## Decision

**Primary layout: compact dual-lane inside one horizontal stage** (same pattern as product canvas reference).

After an exclusive gateway, both branch arms sit in a **single L→R stage** with a short upper lane and lower lane, then **rejoin** into the next shared node (review / end). Do **not** render the fork as a tall vertical stack of full-width cards that pushes Fin down and reads like a list.

```
[Inicio] → [Definir necesidad] → [◆ ¿Criterio?] → ┬─[Comparar por uso]────┐ → [Revisar evidencia] → [Fin]
                                                   └─[Comparar integraciones]─┘
```

- Main axis: **always left → right** on desktop / tablet landscape.
- Vertical offset between the two arms: **only enough to separate lanes** (~8–14px gap), not a second “page” of stack.
- Shared continuation (Revisar / Fin) stays on the **center spine** after the join — same Y as pre-gateway nodes.

---

## Concrete CSS / structure

### `.goal-flow` (stage rail)

| Prop | Spec |
|---|---|
| display | `flex`; `flex-direction: row`; `flex-wrap: nowrap` on ≥900px |
| align-items | `center` (spine centered) |
| overflow-x | `auto` if needed — prefer scroll horizontal over wrap-to-stack |
| gap | 10–14px between stages |
| padding | keep stage charcoal from visual-parity |

### `.goal-fork` (exclusive arms) — CHANGE

| Before (bug) | After |
|---|---|
| `flex-direction: column` | **CSS grid or flex column of 2 lanes**, but the **fork as a whole is one flex item in the horizontal rail** |
| Tall stack | Fixed dual-lane band |

```
.goal-fork {
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: 1fr;
  align-content: center;
  gap: 10px;
  min-width: 200px;
  max-width: 240px; /* per arm card width budget */
}
```

Each `.goal-fork-lane`:

- One row: edge stub (optional) + **one** branch card (not a wrapped multi-card column unless the branch itself has multiple nodes in sequence).
- Multi-node branch (e.g. Operar long arm: Preparar → Revisar): lane is **horizontal** `display: flex; flex-direction: row; align-items: center; gap: 8px` inside that lane only.
- Pending: dashed lane chrome OK; after choice: active lane mint solid, alt lane dashed dim (visual-parity).

### Join into shared nodes

After `.goal-fork`, next `.goal-flow` children (`review`, `end`) remain siblings on the **same row**. Visually, edges from both lanes converge (CSS: fork has a right-side “join” gutter, or simple mint/dashed lines into the next edge). Perfect Bézier not required — readable L→R convergence is enough.

### `.goal-parallel` (Coordinar B)

Same rule: parallel lanes as **compact dual/triple-lane band** in one horizontal stage between split and join — not three full-width stacked blocks that dominate the viewport height.

```
split → ┬ code ─┐
        ├ tests ─┼ → join → resolve → end
        └ docs ──┘
```

Three lanes stacked with **tight** 8px gap inside one stage width ~220–280px; outer flow still L→R.

### `linear-decision`

Already a single row of nodes — no fork change. Keep L→R; nowrap + horizontal scroll on mid widths if cards overflow.

### `exclusive-asymmetric` (Operar)

Fork stage: short arm (Diagnóstico → Fin₁) on **upper** lane; long arm (Preparar → Revisar → Fin₂) on **lower** lane as a **horizontal mini-sequence**. If asymmetric ends differ, each lane may end with its own Fin in-lane — still L→R within the stage; do not drop a second Fin below the whole diagram as a vertical afterthought.

---

## Breakpoints

| Width | Behavior |
|---|---|
| ≥1100px | Full L→R rail; dual-lane fork; no wrap of main stages |
| 900–1099px | L→R with `overflow-x: auto` on `.goal-flow` (scrollbar subtle); fork stays dual-lane |
| 600–899px | Prefer horizontal scroll of entire plan; **optional** allow fork lanes to stay dual-lane at reduced card min-width (~160px) |
| &lt;600px | Last resort: fork may stack vertically **only here**, with a muted hint ES `Desliza el plan en horizontal` / EN `Scroll the plan horizontally` above the stage if scroll is available — still prefer keeping dual-lane if cards fit at 140px |

Category tabs: unchanged (out of scope).

---

## Interaction (unchanged honesty)

- Before choice: both arms `Pendiente` / `Pending`, dashed.
- After choice: chosen arm Completado/active mint; other Omitido/Skipped dashed.
- Badge: `Simulación · no ejecuta` / `Simulation · not running`.
- Decision UI stays **below** the plan (question + choices) — not inside the fork cards.

---

## Acceptance

- [ ] Investigar (exclusive-mid) pending state reads as **one horizontal sentence** L→R — not a vertical card list after the gateway (compare 0926 screenshot: fixed)
- [ ] Operar asymmetric + Coordinar parallel use the same dual/multi-lane-in-one-stage pattern
- [ ] Shared post-join nodes align on the center spine
- [ ] ≥900px: main `.goal-flow` does not wrap stages into a column
- [ ] Visual-parity tokens preserved; Simulation badge preserved
- [ ] Light + dark; reduced-motion: no reliance on animation for layout
- [ ] Narrow (&lt;600): documented fallback only; desktop/tablet is horizontal-first

---

## ES / EN (optional hint only)

| ES | EN |
|---|---|
| Desliza el plan en horizontal | Scroll the plan horizontally |

No other new copy required.

---

## Note for Developer

1. Primary fix is CSS structure of `.goal-fork` / `.goal-parallel` + ensuring `.goal-flow` is a nowrap row of stages.  
2. Vue `stages` model can stay; change how `type: 'fork' | 'parallel'` renders inside the rail.  
3. Do not “fix” by only shrinking cards while keeping column fork — Oscar’s bar is **axis**, not scale.
