# Pausa y reanudación entre herramientas

Hyperion conserva el proceso, las respuestas y los resultados. El harness —Codex, ChatGPT, Claude, Claude Code, Cursor, Hermes u otra herramienta— ejecuta el trabajo. El protocolo de reanudación no depende de una marca.

## Para quien utiliza el canvas

Una vez conectada la herramienta, la petición sigue siendo:

> Usa Hyperion para preparar una guía de bienvenida a mi proyecto.

La IA crea el plan y pregunta solo lo que falta. Tú respondes en el canvas. Si la integración tiene un conector de reanudación instalado, la IA puede cerrar su turno mientras decides; tu respuesta guardada genera una solicitud para retomarlo. No necesitas explicar el protocolo en el prompt.

El canvas muestra el estado real:

| Estado                        | Qué significa                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Pausa guardada                | El flujo tiene un conector asignado; falta tu respuesta. No confirma que ese conector esté online. |
| Reanudación pendiente         | Tu respuesta está guardada. El conector todavía no ha recogido la solicitud.                       |
| Conector retomando            | El conector recogió la solicitud; falta confirmar su entrega.                                      |
| Solicitud entregada al agente | La herramienta aceptó la solicitud. El trabajo solo avanza cuando el agente registra su ejecución. |
| No se pudo reanudar           | Se verificó que no empezó un turno. Puedes reintentar desde la tarea.                              |
| Comprobar la reanudación      | Se perdió la confirmación; el conector debe verificar si comenzó un turno antes de repetirlo.      |

Sin un conector de reanudación, continúa disponible la espera cooperativa de MCP/CLI: el chat debe mantener su llamada abierta. Instalar MCP por sí solo **no activa la reanudación de un chat cerrado**. Empujar texto al chat del host es un canal distinto ([ADR 0036](decisions/0036-outbound-host-prompts.md)): la cola HTTP `continuation_prompt` y el **Enviar** de continuación del canvas encolan solo si el host aporta un `ResumeConnector` válido (`connectorSchema`, harness coincidente); sin él, **Copiar** sigue siendo el camino primario. No hay conector nativo certificado ni envío de `linked_cycle_prompt`.

## Cobertura actual por aplicación

Esta versión incorpora la cola persistente, API, herramienta MCP `hyperion_suspend`, cliente y worker genérico. Los conectores nativos de reanudación de la tabla son trabajo de integración pendiente; no se incluyen como ejecutores de proveedor listos para usar. Las pruebas usan un conector sintético y las identidades de harness documentadas; no certifican aplicaciones reales.

| Herramienta                  | Conexión disponible con Hyperion                                                                                          | Vía documentada para construir su conector                                                                                                | Envío outbound (`continuation_prompt`) |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Codex                        | MCP local y skill; asistente Desktop                                                                                      | App Server: `thread/resume` y `turn/start`. Requiere acceso a esa sesión; no supone control del chat abierto en Codex Desktop.            | No certificado                         |
| ChatGPT                      | Pendiente el transporte remoto autenticado; no puede usar este MCP stdio local. Work mode no es un requisito de Hyperion. | Plugin MCP Events: suscripción y entrega de eventos. Puede activar tareas; no garantiza continuar el mismo chat visible.                  | No certificado                         |
| Claude Desktop               | MCP local; asistente Desktop                                                                                              | No se ha verificado una API pública para despertar el mismo chat cerrado. No anunciar reanudación automática.                             | No certificado                         |
| Claude Code                  | Skill y MCP local                                                                                                         | Agent SDK con ID explícito de sesión persistida. Una sesión administrada por SDK no es automáticamente la conversación de Claude Desktop. | No certificado                         |
| Cursor                       | MCP local y skill; asistente Desktop                                                                                      | CLI en modo no interactivo, reanudando un ID de chat explícito. Debe conservar sus permisos normales.                                     | No certificado                         |
| Hermes Agent (Nous Research) | MCP stdio mediante configuración de Hermes; identidad `hermes`                                                            | CLI permite reanudar una sesión por ID. Falta el conector que guarde y reconcilie sus recibos de entrega.                                 | No certificado                         |
| Google Antigravity           | MCP local, asistente Desktop y `setup antigravity` en `main`; fuera de la preview 0.4.0                                   | Conector de reanudación pendiente. No se ha validado una sesión real ni el despertar del mismo chat.                                      | No certificado                         |

Fuentes oficiales consultadas el 10 de octubre de 2026: [Codex App Server](https://developers.openai.com/codex/app-server/), [ChatGPT MCP Events](https://developers.openai.com/plugins/build/mcp-events), [Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/sessions), [Cursor CLI](https://cursor.com/docs/cli/reference/parameters), [Hermes CLI](https://hermes-agent.nousresearch.com/docs/user-guide/cli/) y [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

Para Hermes, un integrador puede generar la conexión con `hyperion connect hermes` y trasladar `command`, `args` y `env` del servidor generado a `mcp_servers.hyperion` en su configuración. Es compatible con el transporte documentado; todavía no tiene botón propio en el instalador Desktop. No se debe exponer el puerto local a internet para conectar ChatGPT: hacen falta un despliegue remoto, autenticación y aislamiento que esta edición no implementa.

## Contrato para desarrollar conectores

Estas instrucciones son para quien integra una herramienta. El usuario final solo debería elegir la conexión una vez en su aplicación.

1. El conector dispone de una sesión real y de un registro persistente de entregas. Usa una identidad Hyperion registrada y el token del coordinador, nunca el token humano.
2. Antes de terminar el turno, llama `POST /api/runs/:id/suspend` con la revisión actual y los datos siguientes. Solo se permite cuando hay entrada humana pendiente y ningún trabajo de agente listo o ejecutándose.
3. El envío humano confirma respuesta, revisión, recibo idempotente y solicitud de reanudación en **una transacción SQLite**. La solicitud sobrevive al cierre del servicio.
4. Un worker ligero recoge la solicitud. Durante la pausa no mantiene ninguna llamada de generación al modelo. El worker consulta la cola cada segundo por defecto; no hay latencia cero ni garantía de actividad si el worker está apagado.
5. El conector usa `delivery.id` como identificador idempotente, recupera `sessionId`, inicia el turno y confirma entrega. La siguiente ejecución lee el run actualizado, inicia solo tareas listas y registra resultados reales.
6. Si alcanza otra pregunta, arma un nuevo punto de pausa. Cada suspensión cubre un relevo; no ejecuta todo el proceso por sí sola.

```json
{
  "expectedRevision": 1,
  "connector": {
    "id": "my-installed-bridge",
    "harness": "hermes",
    "sessionId": "real-session-reference",
    "scope": "managed-session",
    "capabilities": { "resume": true, "idempotentDelivery": true }
  }
}
```

`harness` admite cualquier identidad. `scope` distingue `managed-session` de `native-chat`; debe reflejar qué conversación se reanuda realmente. Las capacidades son una declaración contractual del conector, no una detección automática ni una credencial del proveedor. No inventar IDs ni declarar capacidades ausentes. Las referencias de sesión y lease no se exponen al canvas.

Endpoints autenticados del worker:

| Operación                              | Entrada                                        | Resultado                                                                      |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /api/continuations/claim`        | `{ "connectorId": "my-installed-bridge" }`     | Una entrega con ID estable y lease de cinco minutos, o `null`.                 |
| `POST /api/continuations/pending`      | El mismo objeto                                | Entregas inciertas del coordinador/conector para reconciliar tras un reinicio. |
| `POST /api/continuations/:id/settle`   | `{ "leaseToken": "…", "outcome": "accepted" }` | Estado de entrega actualizado.                                                 |
| El mismo `settle`                      | `outcome: "failed"`, `message` opcional        | Solo si se comprobó que ningún turno comenzó.                                  |
| El mismo `settle` tras vencer el lease | Añadir `reconciled: true`                      | Solo después de consultar evidencia externa de esa entrega.                    |

Una entrega aceptada no completa ninguna tarea. Un lease vencido queda incierto: **no se reenvía automáticamente**, porque el turno podría haber empezado. Pausar antes de recoger la solicitud la cancela y permite encolarla al reanudar; si ya se entregaba, exige reconciliación. Cancelar el proceso invalida la entrega, pero no puede deshacer herramientas externas ya iniciadas. Un retry después de un fallo comprobado conserva las respuestas y crea otra solicitud. Si la tarea había quedado `running`, primero hay que recuperar su intento y verificar los efectos externos.

### Ejecutar un conector propio

El módulo instalado exporta `default { id, resume, reconcile? }`, según `ResumeConnector` en `src/adapters/continuation-worker.ts`. `resume(delivery, run)` devuelve `{outcome: 'accepted'}` tras el acuse de inicio, o `{outcome: 'failed'}` cuando sabe que no comenzó. Ante una respuesta perdida debe lanzar un error, dejando el lease pendiente. `reconcile` consulta el recibo externo y devuelve el resultado o `null` si aún no puede determinarlo.

El worker se ejecuta con `hyperion bridge /ruta/al/conector.mjs`; la suspensión también está disponible por MCP o `hyperion suspend RUN_ID suspension.json`. El módulo es código local de confianza instalado por el integrador, nunca una ruta o comando sugerido dentro de un plan generado. No se añaden flags para saltarse permisos ni se incorporan claves del proveedor al workflow. El supervisor del conector es responsable de arrancarlo tras reinicios.

La identidad del coordinador delimita el acceso. Los conectores bajo el mismo token pertenecen al mismo dominio de confianza; `connectorId` no sustituye una credencial. No hay garantía de exactamente una ejecución en sistemas externos: el conector debe hacer deduplicación durable y reconciliación antes de reenviar.

## Prueba reproducible del protocolo

En un checkout preparado, `npx tsx --test tests/continuation-queue.test.ts tests/continuation-http.test.ts` verifica reinicio, aislamiento, respuesta repetida, pausa, retry, vencimiento y entrega ambigua. `npx tsx --test tests/outbound-prompt-queue.test.ts tests/outbound-prompt-http.test.ts` cubre la cola outbound `continuation_prompt` (idempotencia, claim/settle, lease incierto) con conector sintético. `npx playwright test tests/e2e/continuation.spec.ts` comprueba en el canvas que una elección dispara el relevo y el resultado usa ese valor sin otro mensaje de chat.

Es una prueba funcional del protocolo con un conector de prueba. Para certificar cada harness hay que repetirla con su sesión, permisos, recibos y conector reales, incluyendo pérdida de conexión y reinicio. No se han realizado esas certificaciones en esta entrega.

[Decisión de arquitectura](decisions/0022-durable-continuations.md) · [Modelo ArchiMate](architecture/continuation.xml) · [Diagrama](architecture/continuation.svg)

Antigravity: [MCP oficial](https://antigravity.google/docs/mcp), consultado el 11 de octubre de 2026; [configuración de Hyperion](conexion.md#antigravity).
