## Español

**Hyperion 2026.10.26.0701 UTC · Preview**

- **Progreso del host → logs Hyperion:** los harnesses deben registrar progreso en vivo con hyperion_step (antes/despues de trabajo material y heartbeats en corridas largas) y fallar ante timeout o denegacion de permisos del SO, sin dejar pasos running huerfanos.
- Incluye `5894444` (skill/MCP + contrato/docs/tests).

**Distribucion y verificacion:** build [40283249697](https://github.com/0vas/hyperion/actions/runs/40283249697) sobre `3b97f705bdfd363eb4d42108106336bb75286e48` con `notarized=true`. Mac ARM notarizado; Windows x64 sin Authenticode.

**Alcance:** canal preview.

## English

**Hyperion 2026.10.26.0701 UTC · Preview**

- **Host progress → Hyperion logs:** harnesses must mirror live progress with hyperion_step (before/after material host work and heartbeats on long runs) and fail on host timeout or OS permission deny instead of leaving orphaned running steps.
- Includes `5894444` (skill/MCP + contract/docs/tests).

**Distribution and verification:** build [40283249697](https://github.com/0vas/hyperion/actions/runs/40283249697) on `3b97f705bdfd363eb4d42108106336bb75286e48` with `notarized=true`. Mac ARM notarized; Windows x64 without Authenticode.

**Scope:** preview channel.