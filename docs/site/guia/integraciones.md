# Conectar tu IA

Hyperion mantiene el mismo proceso independientemente de la herramienta que realiza el trabajo. La conexión local aporta las herramientas o instrucciones necesarias para crear y actualizar el flujo.

## Camino recomendado

Instala Desktop y abre **Hyperion → Conectar con mi IA**. El asistente configura:

| Herramienta    | Conexión                                                 |
| -------------- | -------------------------------------------------------- |
| Codex          | Servidor MCP local                                       |
| Cursor         | Servidor MCP local                                       |
| Claude Desktop | Servidor MCP local                                       |
| Claude Code    | Skill administrada con acceso al runtime de Desktop      |
| Antigravity    | Servidor MCP local · Desktop 0.5.1-preview.1 o posterior |

Después reinicia la herramienta y abre un chat nuevo. Las integraciones existentes no se sobreescriben a ciegas: el asistente informa conflictos y respalda los archivos que modifica.

Una conexión instalada no garantiza que un chat ya abierto haya cargado las herramientas. Tampoco basta mencionar «Hyperion» en una aplicación sin integración.

## Revisar un conflicto

En las fuentes de desarrollo, **Menú → Conexiones → Resolver conflicto…** compara una vista previa limitada. Las URL muestran solo protocolo, host y puerto; se eliminan credenciales, rutas, parámetros y fragmentos. Los valores privados del entorno se omiten. Los argumentos se muestran solo mientras sigan los formatos admitidos; desde el primero no admitido o ambiguo, el resto aparece como `••••`. La marca ámbar compara los valores visibles, incluidos los valores permitidos del entorno.

Esta vista previa no es un detector universal de secretos: los nombres de ejecutables, rutas locales, hosts e identificadores se consideran metadatos públicos. No pongas credenciales en ellos ni compartas archivos de configuración sin revisarlos. **Reemplazar conexión** requiere confirmación, crea un respaldo y conserva los demás servidores MCP. Esta corrección aún no está en un instalador publicado. [Política exacta y límites](https://github.com/0vas/hyperion/blob/main/SECURITY.md#connection-conflict-previews).

En las fuentes de desarrollo, **Cancelar**, **Escape** o pulsar fuera de la confirmación vuelve al Resolver y enfoca **Reemplazar conexión**, sin escribir. Cerrar el Resolver devuelve el foco a la tarjeta de origen; **Volver al canvas** o Escape desde Conexiones vuelve a su control de apertura. Solo el diálogo superior recibe teclado y clics. Durante el guardado, no se puede cerrar ni repetir la confirmación. Si falla, puedes leer el error, reintentar o cancelar; si termina, se cierran ambos diálogos y se actualiza la lista. Esta navegación aún no está en un instalador publicado.

## Si no reconoce Hyperion

En las fuentes de desarrollo, si otro Hyperion rechaza las credenciales de esta instalación en la dirección solicitada, el lanzador MCP usa el puerto alternativo local elegido durante el arranque. No cambia la configuración guardada del cliente ni detiene la otra instancia. La corrección aún no está incluida en un instalador publicado. Comprueba una llamada de lectura, como `hyperion_list_runs`: que la configuración exista o se muestre la lista de herramientas no demuestra que las llamadas funcionen en ese chat.

1. Comprueba que elegiste la herramienta correcta en el asistente.
2. Reinicia esa herramienta y abre un chat nuevo.
3. Pide «Usa Hyperion para…» con un objetivo concreto.
4. Si sigue fallando, revisa el error del asistente o del servidor MCP de tu herramienta.

No compartas archivos de credenciales ni tokens al reportar un error.

## Si el flujo no sigue tras guardar

Consulta [Pausa y reanudación](./reanudacion.md) para distinguir conexión MCP de reactivación de sesiones.

Sin un conector de reanudación instalado, tu respuesta se guarda localmente. El agente puede recibirla mientras espera con la integración; un chat que terminó necesita un nuevo mensaje. Usa **Copiar continuación** en el canvas y envíalo en el chat. [Más sobre la continuidad](./usar-el-flujo.md#retomar-el-trabajo).

## Antigravity

En Desktop 0.5.1-preview.1 o posterior, abre **Hyperion → Conectar con mi IA → Antigravity**. El asistente prepara `mcpServers.hyperion` en la configuración global documentada de Antigravity, conserva otros servidores y respalda el archivo anterior. El runtime incluido inicia Hyperion cuando el cliente carga MCP.

Reinicia Antigravity o recarga sus servidores MCP. Comprueba que aparecen las herramientas de Hyperion y pide: **«Usa Hyperion para preparar una guía de bienvenida a mi proyecto»**.

::: warning Versión necesaria
El botón está incluido desde **0.5.1-preview.1**. Si todavía tienes **0.4.0-preview.1**, instala la nueva versión; la [conexión técnica](https://github.com/0vas/hyperion/blob/main/docs/conexion.md#antigravity) ofrece también `setup antigravity` para instalaciones desde fuentes. No necesitas editar JSON con el asistente nuevo.
:::

::: info Alcance verificado
Las pruebas cubren configuración, respaldo, conflictos y el protocolo MCP con identidad Antigravity. Falta validar una conversación en la aplicación de Google. El conector para reactivar automáticamente un chat terminado sigue pendiente.
:::

[Documentación MCP de Antigravity](https://antigravity.google/docs/mcp).

## Otras aplicaciones

Un cliente compatible puede usar el servidor MCP, la CLI o la API local. Debe aportar un agente que planifique y ejecute: Hyperion no incluye un modelo de IA ni interpreta peticiones por sí solo.

La edición actual comunica aplicaciones en el mismo equipo. No expongas el servicio local como un servidor remoto para conectar otros equipos.

Para integradores: [conexión técnica](https://github.com/0vas/hyperion/blob/main/docs/conexion.md), [protocolo](https://github.com/0vas/hyperion/blob/main/docs/protocol.md) y [contrato del proceso](https://github.com/0vas/hyperion/blob/main/docs/process-contract.md).
