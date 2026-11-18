# ADR 0037 — Chat literal local de Codex en Desktop

Estado: **accepted in source; certificación local realizada, sin instalador publicado todavía**.
Fecha: 2026-11-17.

## Decisión

Hyperion Desktop puede iniciar un único `codex app-server --listen stdio://` local para el flujo activo. El proceso principal de Electron conserva el hijo, la autenticación y el mapeo efímero `runId → threadId`; el renderer recibe únicamente eventos tipados: mensaje humano, delta del asistente, estado terminal del turno y tarjeta de acción redactada.

Electron no depende del PATH de un terminal de desarrollo: resuelve directamente el ejecutable fijo de Codex. Una ruta absoluta elegida por la persona se persiste en `userData` y se valida como archivo ejecutable; si queda obsoleta falla cerrada, sin elegir otro binario en silencio. Sin selección, Desktop explora únicamente el PATH de su propio proceso y ubicaciones locales conocidas. Si no hay un binario válido, queda desconectado, ofrece el selector y una guía de instalación/reintento; no abre un shell ni instala Codex. Solo después de `initialize`, MCP listo y `thread/start` se declara conectado.

El perfil privado de Codex contiene solo el MCP de Hyperion. Electron genera ese `CODEX_HOME` con `web_search = "disabled"` y `[features]` con `shell_tool`, `apps`, `browser_use`, `browser_use_external`, `computer_use`, `image_generation`, `multi_agent`, `plugins`, `skill_search`, `unified_exec` y `view_image` en `false`; además inicia `codex app-server` con `--strict-config`. Una clave no admitida hace que el arranque falle cerrado, en vez de ignorar la política. Cada turno usa sandbox `readOnly` y red desactivada. Es la barrera de producto que evita shell, navegador, archivos editables, red y plugins; la denegación de solicitudes de aprobación en Electron queda como defensa adicional, no como la única barrera.

El adaptador expone lectura, crear flujo, artefactos y `hyperion_step` limitado a `start`, `log`, `complete` y `fail`. No expone formularios humanos, aprobación, amend, acknowledgement irreversible, retry ni herramientas dinámicas. Cada llamada MCP que el proveedor eleva se detiene en una tarjeta Desktop redactada: la persona permite o deniega **solo esa llamada**, sin mostrar argumentos ni convertirla en una aprobación del canvas. El canvas sigue siendo la única autoridad de formularios y aprobaciones del proceso.

## Límites

- Esto no reutiliza la cola de entrega de ADR 0036: una respuesta de W1/W2 no es un mensaje de chat ni una respuesta del agente.
- Una línea de salida, SSE, MCP configurado o el fin de un proceso no es evidencia de chat. Solo los eventos App Server proyectados se muestran.
- `Stop` envía `turn/interrupt`; `completed`, `failed` e `interrupted` se muestran por separado.
- Antes de escribir `turn/start`, Desktop guarda un marcador local opaco por flujo. Si Desktop se cierra antes del estado terminal, el siguiente arranque lo muestra como **incierto**, bloquea un nuevo envío y exige que la persona lo resuelva explícitamente; no hay reanudación ni reenvío automático. Sin `thread/resume` con reconciliación probada, no se restaura el hilo.
- Codex es el único harness de este corte. Cursor, Claude y ChatGPT no obtienen chat literal por identidad o por W1/W2.
- La contención depende de las claves estables del Codex App Server instalado. La prueba de certificación se ejecuta contra esa versión autenticada y `--strict-config`; si una versión futura cambia o rechaza esas claves, el chat queda desconectado. No se presume paridad para otro proveedor ni se convierte esta configuración en una sandbox del sistema operativo para procesos ajenos a Codex.

## Validación realizada y requerida antes de publicar

La regresión de producción verifica el perfil generado: el único MCP es Hyperion, búsqueda web está desactivada y cada feature genérico anterior permanece explícitamente en `false`. La certificación local usa `codex app-server` instalado y autenticado con el puente de Desktop: solicita el shell inocuo `printf HYPERION_SHELL_BOUNDARY_TEST` y prueba que no hay evento/proceso/resultado de comando; en el mismo turno una llamada MCP de Hyperion permitida inicia un paso y eleva una revisión real. También recibe un delta y estado `completed`, prueba una llamada MCP permitida y otra denegada, deja un formulario humano requerido en espera sin valor, recibe un estado real `interrupted` tras `turn/interrupt` y comprueba que un marcador de turno incierto sobrevive reinicio sin duplicar `turn/start`. Las pruebas sintéticas no sustituyen esa evidencia. Antes de publicar, se repite contra el instalador firmado/notarizado de esa versión; no se afirma que el binario Preview 2026.11.17.1919 ya contenga este corte.
