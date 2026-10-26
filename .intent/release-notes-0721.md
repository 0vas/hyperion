## Español

**Hyperion 2026.10.26.0721 UTC · Preview**

- **ADR 0035 — lease orphan-running:** si un paso agent running no tiene wait ni continuation en vuelo y sin progreso por L=180s, GET/SSE lo marca failed con evento de abandono distinto (complementa skill/MCP de 0701).
- Incluye `7641730` (dominio, store, app, docs, tests).

**Distribucion y verificacion:** build [40285306460](https://github.com/0vas/hyperion/actions/runs/40285306460) sobre `6d55aea0a187e73c4ac321509ee15ce594ce4af0` con `notarized=true`. Mac ARM notarizado; Windows x64 sin Authenticode.

**Alcance:** canal preview.

## English

**Hyperion 2026.10.26.0721 UTC · Preview**

- **ADR 0035 — orphan-running lease:** if a running agent step has no wait, no in-flight continuation, and no progress for L=180s, GET/SSE marks it failed with a distinct abandon event (complements 0701 skill/MCP).
- Includes `7641730` (domain, store, app, docs, tests).

**Distribution and verification:** build [40285306460](https://github.com/0vas/hyperion/actions/runs/40285306460) on `6d55aea0a187e73c4ac321509ee15ce594ce4af0` with `notarized=true`. Mac ARM notarized; Windows x64 without Authenticode.

**Scope:** preview channel.