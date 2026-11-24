# 0039 — Canal Beta verificable para Desktop

## Decisión

Hyperion incorpora el canal `beta` entre `preview` y `stable`. La metadata UTC CalVer acepta los tres canales y cada release CalVer debe tener un nombre canónico: `Hyperion AAAA.MM.DD.HHMM Preview`, `Beta` o `Stable`.

La señal de GitHub completa esa clasificación: Preview y Beta deben publicarse como pre-releases, mientras Stable no puede serlo. El actualizador rechaza una etiqueta CalVer sin nombre canónico o con una combinación nombre/pre-release incoherente. Así no infiere un canal de un tag que solo contiene fecha y minuto.

La ruta de actualización es deliberada: una instalación Preview puede avanzar a Preview, Beta o Stable; una Beta solo a Beta o Stable; una Stable solo a Stable. El diálogo nativo muestra el canal de la candidata, no el del instalador actual.

El workflow de publicación verifica antes de subir artefactos que el canal de `src/release.json`, el nombre del borrador y el estado de pre-release de GitHub coincidan. El borrador continúa requiriendo el commit exacto del build, notas revisadas y los dos instaladores probados.

## Consecuencias

La primera Beta es una pre-release, no una release estable ni una afirmación de que macOS esté notarizado. La firma ad-hoc del DMG sigue siendo solo una comprobación de integridad: sin Developer ID y evidencia de notarización, Gatekeeper puede bloquear la aplicación. Windows sigue sin firma de editor.

Las releases CalVer publicadas anteriormente que no cumplan nombre y estado coherentes no se seleccionan como candidatas nuevas por el actualizador actualizado. No se reescriben sus artefactos ni su historia.

## Evidencia

`desktop/release-version.cjs` valida el tercer canal. `desktop/updates.mjs` clasifica y filtra candidatas; `desktop/update-dialog.mjs` presenta su canal real. Las regresiones viven en `tests/release-version.test.ts`, `tests/desktop-updates.mjs` y `tests/desktop-update-dialog.mjs`. `.github/workflows/publish-desktop.yml` valida el borrador antes de aceptar sus artefactos.
