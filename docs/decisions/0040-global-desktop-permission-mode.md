# ADR 0040 — Preferencia global Ask/Auto en Desktop

Estado: **fuente en desarrollo, no publicada en Beta 2026.11.26.0203**.
Fecha: 2026-11-26.

## Decisión

Separar la preferencia humana de permisos del ciclo de vida de ACP. El proceso principal es su autoridad y guarda únicamente `ask` o `auto` en `userData/live-chat-permission.json`, mediante reemplazo atómico y permisos privados. Ausencia, corrupción o valores antiguos vuelven a Ask. Un fallo al guardar no debe activar Auto en memoria ni informar éxito.

El renderer consulta `getPermissionMode()` y cambia con `setPermissionMode(mode)`; ambos devuelven `{ mode }`. El evento `permission-mode` es global, sin `runId` ni `threadId`. No requiere una conexión activa. La barra del compositor presenta el selector junto al proveedor y un escudo. Reiniciar Desktop, detener o fallar un turno y cambiar proveedor/contexto no restablecen la preferencia.

La persistencia del modo **no** persiste ni transfiere consentimientos. Cada solicitud conserva identidad de sesión, turno y llamada; sus tokens pendientes se cancelan al terminar o cancelar su ciclo. Volver a Ask cancela pendientes, sin revertir acciones ya autorizadas. Auto revalida pendientes antes de resolverlos.

Auto cubre herramientas delegables verificadas de Codex/Claude, incluidos archivos, shell y MCP, y responde solo `allow_once`. Las opciones persistentes del proveedor sirven como evidencia de delegación, nunca como respuesta seleccionada. Las reglas explícitas de preguntar/denegar, restricciones del sistema y formas de permiso no verificadas conservan su límite. Cursor/Antigravity usan respuesta manual cuando no hay evidencia verificable. No se entrega autoridad humana ni se transfieren derechos de coordinador: formularios, aprobaciones y revisión de planes siguen en el canvas.

Se requiere identidad estructurada o correlacionada de sesión, turno y llamada. Las preguntas, Enter/ExitPlanMode, concesiones de sandbox y solicitudes de revisión estricta no se delegan. Codex puede ofrecer opciones estándar por defecto: su presencia no garantiza detectar una política del host que el protocolo no exponga. No se cambian flags del host para activar Auto.

Las nueve herramientas de agente del MCP privado pueden ser elegibles, incluido `hyperion_step` con `retry`; también deben superar las comprobaciones de delegación. No se incluyen comandos humanos, ni se eluden roles, revisiones, intentos, revisión humana o los requisitos de un conector real para suspender. La lista histórica más estrecha de la Beta 2026.11.26.0203 no describe este nuevo alcance.

## Consecuencias y verificación

- El modo es común a todos los chats de esta instalación; no es una política permanente del proveedor ni un sandbox.
- La persistencia debe probarse al reiniciar la instancia, ante datos inválidos y al fallar la escritura. Los permisos deben probarse por forma de proveedor, cancelación, cambios de modo y tokens antiguos.
- Cada prompt conserva instrucciones workflow-first; son guía best-effort al agente, no garantía de cumplimiento o ejecución.
- La cobertura con fixtures ACP no certifica sesiones nativas autenticadas. Tampoco se cambia el watchdog de unos 180 segundos ni se implementa suspensión por un permiso pendiente.
- La Beta 2026.11.26.0203 mantiene su política histórica por sesión. No se cambia la disponibilidad de instaladores por documentar esta decisión.

Detalle del contrato: [integración](../integration.md#global-askauto-permissions-unpublished-source). Contexto histórico: [ADR 0038](0038-desktop-local-multiharness.md).
