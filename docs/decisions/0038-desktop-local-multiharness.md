# ADR 0038 — Chat local multiharness en Desktop

Estado: **accepted and published in Preview 2026.11.20.1708; Codex, Cursor y Antigravity verificados con conversación y lectura MCP en Desktop empaquetado; Claude pendiente de autenticación**.
Fecha: 2026-11-18.

## Decisión

Desktop separa la elección de harness de la ruta de su ejecutable y conserva ambas en `userData`, sin secretos. La vista **Chat** ofrece Codex, Claude Code, Cursor Agent y Antigravity. El proceso principal resuelve rutas absolutas conocidas o una selección explícita, incluida `~/.gemini/bin/agy`, sin invocar una shell para buscar ni instalar CLIs.

Desktop usa **Agent Client Protocol (ACP)** como frontera persistente. Codex y Claude usan sidecars empaquetados con `CODEX_PATH` y `CLAUDE_CODE_EXECUTABLE`; Cursor y Antigravity ejecutan directamente su CLI con `acp`. Se normalizan mensajes, herramientas, permisos e interrupciones. La aprobación simple selecciona únicamente `allow_once`, nunca `allow_always`. Los métodos específicos de Cursor para preguntas y planes se cancelan con instrucciones de utilizar el canvas; no se inventan respuestas. Los planes y selectores de modelo no se proyectan todavía. El directorio separado no es un sandbox y los proveedores pueden cargar su configuración local.

`chat-mcp-launcher.ts` registra la identidad elegida y autentica exclusivamente el servicio explícito del canvas. El servidor se denomina `hyperion_active` para evitar colisiones con configuraciones de usuario preexistentes. No usa el bootstrap que puede buscar otro puerto ni hereda un `HYPERION_TOKEN` ajeno. Esta decisión corrige el fallo observado con Cursor: el MCP de sesión no registrado fallaba y otro Hyperion configurado devolvía `NOT_FOUND` para el flujo activo.

Un proceso inactivo puede cerrarse al cambiar de proveedor; solo un turno activo o una conexión en curso bloquean ese cambio. Cada permiso queda vinculado al flujo, sesión y turno que lo originaron. Detener envía `session/cancel` y responde `cancelled` a los permisos pendientes sin esperar el fin del turno; esto libera también al proveedor que espera esa respuesta para terminar. El fin del turno, el cierre y la cancelación de la petición invalidan los permisos restantes y notifican su resolución a la UI. Los clics tardíos se rechazan y no se aceptan permisos mientras se detiene el turno. Si falta una opción `allow_once`, pulsar permitir cancela la petición y nunca informa una autorización inexistente. La UI no declara el turno interrumpido antes de recibir el resultado del proveedor. Un fallo cierra la sesión. Los diagnósticos de autenticación se presentan como avisos de recuperación, no como respuestas del agente. El compositor conserva el borrador y permanece visible; la navegación al canvas conserva la conversación durante la sesión de Desktop.

## Consecuencias y límites

### Evolución en fuentes: burbuja y entrada compartida (2026-11-19)

El chat pasa a una burbuja lateral junto al canvas y admite una selección de flujo explícitamente nula. No se fabrica un ID: desde Inicio, el primer pedido real puede crear un flujo usando el mismo MCP `hyperion_active` autenticado. Abrir o conectar el chat no inicia por sí mismo una actividad.

`desktop/hyperion-entry-prompt.mjs` contiene las instrucciones compartidas para los cuatro proveedores. Se adjuntan al primer mensaje real de cada sesión como un bloque de texto ACP, seguido del contexto de selección y del mensaje del usuario en bloques separados. ACP v1 no se presenta como si ofreciera un rol `system` portable; tampoco se ejecuta un turno oculto de preparación. La personalidad es colaborativa, clara, concisa, proactiva y responde en el idioma de la persona. La operación sigue las herramientas disponibles, la lectura del estado actual, los commandId/revisiones/intentos, evidencia pública y decisiones exclusivamente humanas del canvas. Una nueva petición vinculada a un flujo completado usa parentRunId, nunca reabre al padre.

Cada turno recibe sólo el UUID validado o `null`, no una copia de datos del workflow ni credenciales. Al cambiar la selección se reemplaza una sesión inactiva; un turno o conexión en curso impide cambiar su destino. La nueva sesión vuelve a recibir la entrada y no arrastra el flujo anterior. Los permisos siguen vinculados a selección (también nula), sesión y turno: no se amplía `allow_once`. Las instrucciones son guía del cliente, no una garantía de obediencia del modelo ni aislamiento del sistema operativo. La UI decide qué selección mostrar; el backend rechaza destinos inválidos y operaciones sobre una selección distinta de la sesión.

Por la aclaración del usuario, el chat exclusivo de Desktop recibe las nueve herramientas MCP de agente existentes, retirando el filtro anterior de siete y el rechazo artificial de retry. No cambia el motor: recuperación requiere reconciliar efectos; revisión exige versión vigente, preserva evidencia y pausa para revisión/reanudación humana; suspensión requiere un conector real. No se exportan comandos humanos ni credenciales humanas. La identidad del coordinador limita las escrituras, aunque otros agentes puedan leer el flujo. Los workers de conectores conservan claim/settle y confirmaciones de entrega; no se delegan al modelo. La matriz completa está en [integración](../integration.md#desktop-entry-instructions-and-workflow-selection).

Pruebas: transporte ACP simulado en los cuatro proveedores, entrada única sin turno sintético, contexto nulo, consentimiento/cancelación, reconexión y cambio de selección. El lanzador MCP real contra un servicio HTTP sintético crea y lee flujos para las cuatro identidades y conserva idempotencia y límites humanos. No certifica razonamiento autónomo, autenticación Claude ni ejecución nativa de cada proveedor en Windows. La burbuja y la personalidad compartida se publicaron en Preview `2026.11.20.1708`.

- El canvas sigue siendo autoridad exclusiva para formularios, aprobaciones, correcciones humanas, revisión de cambios y confirmaciones irreversibles.
- Una sesión ACP vive mientras Desktop siga abierto. Un reinicio no reenvía un turno en curso ni simula una reanudación durable; un error de autenticación pide iniciar sesión en el harness local.
- Gemini y ChatGPT no se anuncian como compatibles con este chat. Cursor y Antigravity requieren sus CLI con ACP y autenticación local; la presencia de sus aplicaciones de escritorio no basta.
- En Windows el resolvedor admite ejecutables nativos `.exe`, no wrappers `.cmd` o `.ps1`. Las aserciones de rutas usan separadores nativos; esto no sustituye una prueba real de los cuatro proveedores en Windows, todavía pendiente.
- Las pruebas sintéticas validan selección, recuperación de autenticación, cierre y permisos pendientes. La prueba optativa `tests/desktop-live-chat-native.mjs` verifica una respuesta real desde Electron, el cambio de proveedor y el borrador; con `HYPERION_TEST_MCP=1` verifica también la lectura del título único del flujo activo. Esto no certifica todas las herramientas ni una sesión autenticada de Claude.
- El instalador 2026.11.18.0714 sigue siendo Codex-only; este ADR no es prueba de que un binario publicado incluya el selector.

Relacionada: [ADR 0037](0037-desktop-live-codex-chat.md).

Protocolos nativos contrastados con [Cursor ACP](https://cursor.com/docs/cli/acp) y [Antigravity ACP](https://antigravity.google/docs/ide/extensions/acp/). Las pruebas de protocolo usan procesos simulados; la prueba optativa `HYPERION_TEST_HARNESS=cursor HYPERION_TEST_MCP=1 node --test tests/desktop-live-chat-native.mjs` usa un CLI real y un flujo aislado. Permite solo su lectura `hyperion_get_run` si el proveedor solicita permiso; no aprueba operaciones genéricas.

## Publicación: Preview 2026.11.20.1708

La release publicada contiene los instaladores macOS arm64 y Windows x64 construidos desde el commit de release, con tamaños y SHA-256 verificados por el flujo de publicación. Ambos jobs de Desktop superaron las comprobaciones de fuente y del instalador empaquetado. Esta evidencia publica el selector, la burbuja y la entrada compartida; no cambia los límites anteriores: Claude autenticado sigue sin verificarse, no se promete recuperación durable del transcript y la firma macOS es de integridad ad-hoc, no notarización de Apple ni Developer ID.

## Verificación anterior: preview 2026.11.18.2206

- `npm run check`: 323 pruebas unitarias y 45 de producción aprobadas, además de formato, tipos y build.
- Chat Playwright: cinco pruebas aprobadas; lifecycle multiharness: ocho aprobadas, incluyendo recuperación de autenticación y liberación de permisos pendientes.
- `tests/desktop-live-chat-native.mjs`: conversación con Codex real aprobada tanto en Electron desde fuente como en el ejecutable empaquetado; borrador conservado al volver del canvas y al cambiar proveedor. Se comprobó también el cambio de idioma sin perderlo.
- La preview local 2026.11.18.2206 es arm64, con firma ad-hoc, no notarizada. No equivale a una publicación en el actualizador. Claude sigue pendiente de autenticación válida y de prueba nativa propia.
- Sitio de documentación: build aprobado, 22 pruebas aprobadas y cinco fallidas. Cuatro esperan etiquetas españolas de navegación/tema que la página entrega en inglés; otra detecta contraste insuficiente. No se declara una validación global satisfactoria ni se atribuye su antigüedad sin una comparación con la base.

## Verificación: candidato 2026.11.19.0237

- `npm run check`: 327 pruebas unitarias y 53 de producción aprobadas, además de tipos, formato y build. Incluye 16 pruebas de lifecycle/protocolo ACP y cuatro pruebas nuevas de identidad MCP contra stdio real.
- Chat Playwright: cinco pruebas aprobadas, incluyendo selección de los cuatro proveedores y conservación del borrador.
- En el ejecutable arm64 empaquetado, Codex, Cursor Agent y Antigravity completaron conversación real y lectura MCP del título único de un flujo aislado. La prueba de Antigravity autorizó exclusivamente la lectura `hyperion_get_run`. También se comprobó navegación, cambio de proveedor, borrador e idioma.
- Claude Code está integrado, pero su cuenta local no tiene autenticación válida. No se certifica una conversación autenticada hasta completar `claude auth login` y repetir la prueba nativa.
- El DMG local está en `release/2026.11.19.0237/`; pasó `codesign --verify --deep --strict` y `hdiutil verify`. Firma ad-hoc, sin notarización, sin publicación ni actualización automática. No se reemplazó la aplicación instalada.
- Documentación pública: 22 pruebas aprobadas y cinco fallidas al repetir la suite, en navegación móvil, idioma del selector de tema y contraste. No se declara la suite completa aprobada ni se ocultan esos pendientes de publicación.

### Corrección previa a publicación: permisos y rutas portables

- TDD: ocho regresiones de permisos fallaron antes del cambio y las 24 pruebas de `tests/desktop-live-harness-chat.mjs` pasan después. Incluyen un proveedor ACP que necesita recibir la cancelación del permiso antes de confirmar el fin del turno, tokens caducados, fin normal/fallido/interrumpido, cancelación del proveedor y ausencia de `allow_once`.
- `npm run check`: 327 pruebas unitarias y 61 de producción aprobadas, además de tipos, build y formato. `npx playwright test tests/e2e/chat-bubble.spec.ts`: cinco aprobadas.
- Las comprobaciones de rutas usan `node:path` en lugar de asumir separadores POSIX. El fixture legacy de selección explícita usa `codex.exe` en Windows y `codex` en las demás plataformas, sin relajar la validación del producto. Las suites `desktop-live-codex-chat.mjs` y `desktop-live-harness-chat.mjs` suman 33 pruebas aprobadas. Estas pruebas se ejecutaron en macOS; no certifican ejecución nativa en Windows.
- Este cambio requiere reconstruir los instaladores antes de publicar; no modifica la evidencia previa de autenticación de Claude, notarización ni las pruebas pendientes del sitio de documentación.
