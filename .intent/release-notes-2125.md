## Español

**Hyperion 2026.10.23.2125 UTC · Preview**

- **Browse / permisos:** instruccion para abrir URLs de split en Browse; fallar el paso con hyperion_step fail si el SO deniega permisos (no dejar pasos running huerfanos).
- Incluye `4bb9517` ya en main.

**Distribucion y verificacion:** el build [40026639854](https://github.com/0vas/hyperion/actions/runs/40026639854) se ejecuto sobre `ffde9cb762e378a7ee8d7b4322875f9cc0d52126` con `notarized=true`. Ambos destinos (Mac Apple Silicon y Windows x64) pasaron check, pruebas Desktop y empaquetado. Mac ARM: Developer ID y notorizacion Apple. Windows x64 sin firma Authenticode. La publicacion comprobara digests remotos antes de hacer publica esta release.

**Alcance:** canal preview. Intel Mac no se publica.

## English

**Hyperion 2026.10.23.2125 UTC · Preview**

- **Browse / permissions:** instruct hosts to open split URLs in Browse; fail the step with hyperion_step fail when the OS denies permission (do not leave orphaned running steps).
- Includes `4bb9517` already on main.

**Distribution and verification:** build [40026639854](https://github.com/0vas/hyperion/actions/runs/40026639854) on `ffde9cb762e378a7ee8d7b4322875f9cc0d52126` with `notarized=true`. Both Apple Silicon and Windows x64 passed check, Desktop tests, and packaging. Mac ARM: Developer ID and Apple notarization. Windows x64 has no Authenticode signature. Publication will verify remote digests before making this release public.

**Scope:** preview channel. Intel Mac is not published.