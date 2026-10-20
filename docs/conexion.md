# Instalar y conectar Hyperion

La pausa persistente y el alcance por herramienta se explican en [Reanudación agnóstica](continuacion-agnostica.md). La conexión MCP local y la reanudación de un chat cerrado son capacidades distintas.

## Conectar sin comandos (recomendado)

1. Instala **Hyperion Desktop**: `.dmg` en macOS o `.exe` en Windows. En macOS, arrastra Hyperion a Aplicaciones antes de abrirlo.
2. Al abrirlo, elige **Codex**, **Cursor**, **Claude Desktop**, **Claude Code** o **Antigravity** (desde 0.5.1-preview.1). Si ya lo usabas, entra en **Hyperion → Conectar con mi IA**.
3. Reinicia la aplicación elegida y abre un **chat nuevo** (no regenerues un hilo antiguo de Excel u otra tarea sin Hyperion). Si solicita habilitar Hyperion, acepta para usar sus herramientas.
4. En Claude Desktop, despliega **Loaded tools** / herramientas cargadas y confirma entradas `hyperion_*` (por ejemplo `hyperion_create_run`) antes de pedir el objetivo.
5. Escribe tu objetivo: **«Usa Hyperion para preparar una guía breve de bienvenida a mi proyecto»**.

No necesitas instalar Node, escribir comandos ni editar archivos. Hyperion Desktop incluye el runtime. La conexión sirve para otros proyectos y chats sin contexto previo. La IA pide solo los datos que falten y genera el proceso; no debes explicarle cómo dibujar el canvas ni cómo registrar los pasos.

**[Descargar Hyperion Desktop](https://github.com/0vas/hyperion/releases/tag/v2026.10.20.0234)**: elige el `.dmg` de Apple Silicon o el `.exe` de Windows x64. No necesitas una cuenta de GitHub para descargar la versión preliminar. El instalador de Apple Silicon está firmado con Developer ID y notarizado por Apple; Windows no tiene firma de editor. Intel macOS no se publica en esta release. La release estable sigue pendiente.

| Aplicación     | Qué prepara el asistente                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| Codex          | Conexión MCP de usuario; también respeta `CODEX_HOME` cuando está definido.          |
| Cursor         | Conexión MCP de usuario para los proyectos locales.                                  |
| Claude Desktop | Conexión MCP y skill portable en `~/.claude/skills/hyperion` (macOS o Windows).      |
| Claude Code    | Skill Hyperion en su carpeta de skills de usuario.                                   |
| Antigravity    | Conexión MCP global con respaldo; disponible en Desktop 0.5.1-preview.1 o posterior. |

La conexión usa rutas absolutas al runtime incluido y al almacenamiento local; no escribe tokens en la configuración del cliente. Guarda copia del archivo anterior, conserva otros servidores y rechaza una entrada Hyperion diferente. «Conexión configurada» confirma que se preparó la entrada local; no demuestra que el cliente haya cargado las herramientas. Puedes repetir el asistente para conectar otra aplicación.

Para actualizar Desktop, usa **Hyperion → Buscar actualizaciones…** y **Actualizar y reiniciar** (descarga oficial con comprobación de tamaño y SHA-256, luego aplica y reinicia). Conserva Hyperion en la misma ubicación. Tras ese reinicio, Desktop actualiza automáticamente las conexiones MCP Hyperion de _esta_ instalación cuando el conflicto se debe solo a rutas/argumentos nuevos (con respaldo); no sobrescribe entradas ajenas ni deshabilitadas — esas siguen el Resolver en **Conexiones**. Si mueves Hyperion y aparece un conflicto distinto, retira la antigua entrada Hyperion desde la configuración del cliente y vuelve a conectarlo. Para desconectarlo, elimina solo esa entrada (o la skill Hyperion en Claude Code). Tus flujos se conservan.

La edición actual requiere herramientas en el mismo ordenador. Claude en el navegador y los agentes que ejecutan en la nube no acceden a este servicio local. **ChatGPT Desktop** no usa este MCP stdio local; **Work mode** no es un requisito de Hyperion — usa Cursor, Codex, Claude Desktop o Claude Code. La primera conexión es necesaria: mencionar el nombre en una aplicación sin integración no instala Hyperion por sí solo.

Los formatos se contrastaron con la documentación de [Codex](https://developers.openai.com/codex/mcp), [Cursor](https://prod.cursor.com/docs/mcp) y [MCP para Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers). Las políticas del cliente u organización pueden impedir cargar servidores locales.

## Revisar la configuración y los archivos del adaptador

En las fuentes de desarrollo, **Menú → Conexiones** muestra una lista de aplicaciones compatibles, inicialmente cerradas. Pulsa una aplicación para ver su explicación, las acciones y la ruta completa con **Copiar ruta**. Solo se despliega una aplicación; la selección se conserva al comprobar o cambiar de idioma. «Configurada localmente» y el recuento indican que los archivos coinciden con la conexión esperada; no demuestran que las aplicaciones estén instaladas o que un chat tenga herramientas. **Mensaje de diagnóstico original** permite desplegar literalmente el texto recibido, tanto reconocido como desconocido.

Las explicaciones conocidas de Hyperion sobre conflictos y fallos de configuración, y los avisos de éxito, siguen el idioma de la interfaz incluso después de mostrarse. Se reconocen solo las plantillas de mensajes de conexión de Hyperion: las rutas y los diagnósticos no reconocidos se conservan literalmente. Cambiar de idioma no reintenta la configuración ni modifica el proceso.

Abre **Diagnóstico**, al pie de la lista, para consultar la dirección del servicio, las sugerencias para investigar fallos y **Archivos del adaptador**: el ejecutable de Hyperion y el lanzador MCP esperados de esta instalación. El resultado **Archivo legible** solo indica que Hyperion pudo abrir ese archivo para lectura. No inicia MCP ni ejecuta comandos guardados; tampoco comprueba dependencias ni confirma que Claude haya cargado herramientas. No valida una entrada ajena en conflicto ni la skill de Claude Code. El inicio MCP y la llamada de herramienta permanecen sin comprobar; las herramientas en este chat siguen siendo desconocidas.

Los avisos distinguen **Archivo no encontrado**, **No es un archivo normal**, **Hyperion no pudo leerlo por permisos** y **No se pudo comprobar**. El último es un resultado incompleto, no prueba de un archivo ausente. Un servidor anterior sin estos metadatos muestra **Sin comprobar**, sin hora inventada. **Ver diagnóstico** abre esa información; **Comprobar** actualiza una observación de lectura sin cambiar archivos ni credenciales. No se reparan archivos ni se reemplazan configuraciones automáticamente. Estos cambios todavía no están en un instalador publicado.

Si Claude Desktop sigue sin mostrar herramientas después del reinicio ya realizado, revisa su estado real del servidor Hyperion y la ubicación de su configuración. Claude Code no es un requisito de Claude Desktop; la conexión de Desktop empaquetado tampoco necesita una instalación separada de Node. Un resultado legible no identifica la causa en Windows: hacen falta los datos del cliente. Consulta **Ayuda de conexión** y comparte solo errores revisados y sin credenciales.

## Vista previa de conflictos

Las fuentes de desarrollo limitan los datos enviados a **Resolver conflicto…** antes de recortarlos para la pantalla. Las URL HTTP(S) muestran solo protocolo, host y puerto: se eliminan usuario/contraseña, ruta, parámetros y fragmento. Se conservan rutas locales y opciones de conexión admitidas; desde el primer argumento no admitido o ambiguo, el resto se sustituye por `••••`. Esto incluye opciones de credenciales, cabeceras y scripts. Del entorno solo se muestran valores validados de `HYPERION_AGENT_ID`, `HYPERION_DATA_DIR`, `HYPERION_URL` y `ELECTRON_RUN_AS_NODE`; los demás valores se omiten.

La comparación ámbar usa los valores visibles, no un diff completo del archivo. Los nombres de ejecutables, rutas, hosts e identificadores se consideran metadatos públicos: no pongas credenciales en ellos. La proyección no es un detector universal de secretos. No modifica la configuración ni la confirmación, el respaldo o la conservación de otros servidores al reemplazar. Esta corrección aún no se ha publicado en un instalador. [Política exacta y límites](../SECURITY.md#connection-conflict-previews).

## Alternativas para agentes y desarrolladores

Si ya recibes un canvas al pedir «usa Hyperion», sigue el [manual de uso](manual-uso.md). Los comandos siguientes son alternativas de instalación, no pasos del uso cotidiano.

### Skill portable

En este repositorio ya preparado, instala la skill portable:

```sh
npm run hyperion -- install
```

Recarga las skills o abre una sesión nueva del agente y escribe:

> Usa Hyperion para preparar mi siguiente entrega. Pídeme el alcance, muéstrame los pasos y espera mi aprobación antes de ejecutarla.

La skill enseña al agente a arrancar o reutilizar Hyperion, construir el plan desde esa petición y devolver el enlace al canvas. El agente usa sus propias herramientas para el trabajo y registra sus resultados. La persona participa mediante los popups. No necesitas configurar MCP, escribir JSON ni mantener una terminal de servidor abierta.

Esta vía usa el estándar [Agent Skills](https://agentskills.io/specification) y requiere un agente con shell local y Node.js 22.13+. El instalador coloca la skill en `~/.agents/skills/hyperion`, ubicación compartida por [Codex](https://learn.chatgpt.com/docs/build-skills) y [Cursor](https://cursor.com/docs/skills). Si existe `~/.claude`, también la instala en `~/.claude/skills/hyperion`, ubicación de [Claude Code](https://code.claude.com/docs/en/skills). Para otra ubicación: `hyperion install /ruta/a/skills`; se creará su subcarpeta `hyperion`.

La frase por sí sola no instala capacidades en una herramienta que nunca ha cargado la skill ni conoce Hyperion. Esa primera instalación y la recarga del cliente son necesarias. La selección automática depende del host; si no la selecciona, invoca su skill Hyperion explícitamente. Un agente remoto sin acceso al ordenador local necesita otra modalidad de despliegue, pendiente en esta edición.

### Instalar el paquete sin clonar el repositorio

Con el archivo de distribución `hyperion-workflows-2026.10.12-build.398.tgz`:

```sh
npm install --global ./hyperion-workflows-2026.10.12-build.398.tgz
hyperion install
```

El paquete incluye la web, el servidor y la CLI compilados. No requiere TypeScript, Vite ni el código fuente. Es una instalación inicial de dos comandos; el uso posterior comienza desde el chat. En este incremento el archivo se genera y valida localmente: todavía no está publicado en npm ni en GitHub Releases. No uses un paquete homónimo del registro suponiendo que es este proyecto.

Para generar una distribución desde las fuentes: `npm ci` y `npm pack` (el empaquetado construye el producto). El paquete puede compartirse sin incluir ejecuciones ni credenciales. La validación del incremento comprobó su instalación en un directorio aislado con dependencias de producción.

### Datos, actualizaciones y otras herramientas

La skill incluye rutas absolutas al ejecutable y al almacenamiento, sin tokens. Las instalaciones de paquete usan `~/.hyperion` por defecto; el checkout actual conserva su `.hyperion` existente. `HYPERION_DATA_DIR` permite elegir otra ubicación. Así, cambiar de proyecto no crea otra instancia ni pierde los flujos. `--agent ID` permite registrar cualquier identidad local, sin lista cerrada de marcas.

Si mueves Hyperion o lo actualizas, vuelve a ejecutar `hyperion install` (en las fuentes, construye antes con `npm run build`). Se conservan las skills ajenas; una modificación manual de los archivos administrados provoca un conflicto explícito. En Desktop, la vista **Conexiones** permite **Reemplazar…** solo tras una confirmación explícita (con respaldo del archivo); nunca sobrescribe en silencio. Para retirar la integración, elimina únicamente las carpetas de skill mostradas por el instalador; esto no borra tus flujos. El servicio iniciado sigue disponible al terminar el chat. Desde 2026.10.12.2101, el lanzador respalda SQLite y sustituye automáticamente el servicio antiguo de la misma instalación, conservando credenciales y flujos. Si es otra instalación, otra cuenta del sistema o no puede autenticarla, no la detiene; Desktop elige otro puerto libre en `127.0.0.1` y recuerda esa URL en `~/.hyperion/workspace.json` mientras el servicio propio siga vivo. Si ese puerto alterno ya no responde con tus credenciales, el siguiente arranque vuelve a preferir `4317`. Desktop empaquetado guarda siempre los datos en `~/.hyperion` (no en una carpeta portable temporal junto al instalador).

El reconocimiento nativo en cada producto debe verificarse tras recargar su sesión. Las pruebas automatizadas verifican instalación, ejecución del script, API y MCP; no equivalen a una conversación nativa completa en cada cliente.

## Alternativa: conexión MCP por cliente

Desde el repositorio, ejecuta `npm ci` la primera vez. Después utiliza **solo el comando correspondiente** a tu herramienta:

```sh
npm run hyperion -- setup codex
npm run hyperion -- setup claude
npm run hyperion -- setup cursor
```

`setup` resuelve las rutas de Node y del adaptador, registra la identidad y configura el cliente. Construye el adaptador si todavía no existe. Codex y Claude Code requieren su CLI instalada; Cursor recibe una entrada en su configuración local de usuario. Los demás servidores se conservan; una entrada distinta de Hyperion en Cursor se señala como conflicto.

Recarga las herramientas MCP o abre una sesión nueva del cliente. Al cargar Hyperion, el adaptador inicia el servidor local si hace falta y reutiliza la instancia autenticada si ya existe. El arranque no escribe mensajes en el canal de herramientas; sus logs quedan en `.hyperion/server.log`. La instancia permanece disponible después de cerrar el adaptador. La actualización sustituye el servicio antiguo autenticado de la misma instalación después de respaldar SQLite; un proceso ajeno se conserva. Tras actualizar el repositorio, ejecuta `npm run build`.

Luego basta con escribir en el chat:

> Usa Hyperion para [mi actividad]. Genera un proceso con inicio y fin, compuertas cuando correspondan, entradas y salidas por tarea, y registra tus acciones y observaciones.

La configuración no añade herramientas retroactivamente a una conversación abierta. Esta conversación puede continuar usando la CLI. Las secciones siguientes conservan la configuración manual, Claude Desktop y otros clientes como alternativas.

## Iniciar Hyperion manualmente (opcional)

Requisitos: Node.js 22.13 o superior y npm. Los comandos siguientes utilizan una terminal macOS o Linux.

Desde la carpeta del repositorio:

```sh
npm ci
npm run build
npm start
```

Deja esa terminal abierta. Abre [Hyperion local](http://127.0.0.1:4317). En una segunda terminal, dentro del mismo repositorio, define las rutas para los ejemplos:

```sh
HYPERION_REPO="$PWD"
HYPERION_NODE="$(command -v node)"
```

Usa la ruta local de tu copia de Hyperion. Usa una ruta absoluta al ejecutable Node si la aplicación no hereda el PATH de tu terminal.

Hyperion guarda sus ejecuciones en `.hyperion/`. No requiere una clave de OpenAI ni de Anthropic: el modelo lo proporciona la herramienta en la que haces la petición.

## Conectar la herramienta elegida

### Codex

Genera la identidad y configuración local:

```sh
npm run hyperion -- connect codex
```

La salida indica el archivo `.hyperion/connections/codex.mcp.json`. El comando no cambia la configuración de Codex. Para registrar el servidor:

```sh
codex mcp add hyperion \
  --env HYPERION_AGENT_ID=codex \
  --env HYPERION_DATA_DIR="$HYPERION_REPO/.hyperion" \
  --env HYPERION_URL=http://127.0.0.1:4317 \
  -- "$HYPERION_NODE" "$HYPERION_REPO/dist/adapters/mcp.js"
codex mcp get hyperion
```

Comprueba en Codex que estén disponibles las herramientas `hyperion_create_run`, `hyperion_get_run`, `hyperion_step`, `hyperion_list_runs`, `hyperion_wait` y `hyperion_open`. Si la conversación actual no las carga, inicia una sesión que recoja la configuración actualizada. En esta conversación ya podemos trabajar mediante la CLI, sin esperar a cargar MCP.

La configuración stdio y los comandos de registro se basan en la [documentación oficial de Codex](https://developers.openai.com/codex/mcp).

### Antigravity

En Desktop 0.5.1-preview.1 o posterior, selecciona **Hyperion → Conectar con mi IA → Antigravity**. No requiere Node ni CLI de Google. Los instaladores publicados `0.4.0-preview.1` todavía no contienen esta opción.

Desde un checkout preparado, la alternativa es:

```sh
npm run hyperion -- setup antigravity
```

Ambas vías configuran `mcpServers.hyperion` en `~/.gemini/config/mcp_config.json`, con rutas absolutas y sin claves de proveedor. Conservan otros servidores, respaldan el archivo antes de modificarlo y rechazan una entrada Hyperion distinta o deshabilitada. Repetir la conexión ya configurada no cambia el archivo. El adaptador inicia o reutiliza el servicio local al cargar MCP.

Reinicia Antigravity o recarga MCP y comprueba `hyperion_create_run` y `hyperion_get_run`. Luego pide tu objetivo en el chat. Si tu instalación usa una ubicación distinta, consulta **MCP Servers → Manage MCP Servers → View raw config** y usa la alternativa manual `npm run hyperion -- connect antigravity`, trasladando `command`, `args` y `env` del archivo generado. Esta alternativa manual requiere tener el servicio local iniciado.

La [documentación oficial de MCP de Antigravity](https://antigravity.google/docs/mcp), consultada el 11 de octubre de 2026, describe el formato global. Las pruebas verifican configuración y protocolo MCP con identidad `antigravity`; no equivalen a una conversación real en la aplicación. La reanudación automática de un chat finalizado requiere un conector adicional, aún pendiente.

### Claude Code

Desde el proyecto en el que usarás Claude Code, registra el adaptador. `HYPERION_REPO` debe seguir apuntando al repositorio de Hyperion, aunque estés trabajando en otro proyecto.

Primero, desde Hyperion:

```sh
npm run hyperion -- connect claude
```

Después, en la terminal del proyecto de trabajo:

```sh
claude mcp add hyperion --transport stdio --scope local \
  --env HYPERION_AGENT_ID=claude \
  --env HYPERION_DATA_DIR="$HYPERION_REPO/.hyperion" \
  --env HYPERION_URL=http://127.0.0.1:4317 \
  -- "$HYPERION_NODE" "$HYPERION_REPO/dist/adapters/mcp.js"
claude mcp get hyperion
```

Abre Claude Code y revisa `/mcp`. La conexión local se aplica al proyecto donde ejecutaste el registro. Véase la [configuración MCP oficial de Claude Code](https://code.claude.com/docs/en/mcp).

### Claude Desktop

Para la aplicación de escritorio de Claude, usa el mismo comando `connect claude`. Abre la configuración de servidores MCP locales de la aplicación e incorpora la entrada `mcpServers.hyperion` del archivo generado, conservando las demás entradas que ya tengas. En macOS, la guía oficial sitúa esa configuración en `~/Library/Application Support/Claude/claude_desktop_config.json`.

Reinicia la aplicación y comprueba que muestre las herramientas. La [guía oficial de servidores MCP locales](https://modelcontextprotocol.io/docs/develop/connect-local-servers) describe este mecanismo. Claude en el navegador no puede usar directamente este proceso stdio local; no equivale a Claude Desktop o Claude Code.

Tras una decisión humana en el canvas, el agente debe llamar a `hyperion_wait` (o equivalente CLI) en el mismo turno; si termina sin esperar, Claude Desktop no retoma solo cuando guardas la respuesta. `hyperion_open` con presentación split solo entrega la URL del navegador: Claude Desktop no abre un panel Hyperion nativo. Conectar Claude Desktop también actualiza la skill en `~/.claude/skills/hyperion`; un chat regenerado que ignore las herramientas `hyperion_*` no es un fallo de MCP.

### Cursor

Genera la configuración:

```sh
npm run hyperion -- connect cursor
```

Abre `.hyperion/connections/cursor.mcp.json`. Incorpora su entrada `mcpServers.hyperion` en **una** de estas ubicaciones:

- `.cursor/mcp.json` del proyecto donde usarás Cursor.
- `~/.cursor/mcp.json` para disponer de Hyperion en tus proyectos locales.

Si ya existe el archivo, combina las entradas; no reemplaces otros servidores. El archivo generado incluye `type: stdio`, la ruta de Node, el adaptador y `HYPERION_AGENT_ID=cursor`. No contiene tokens.

Comprueba que el servidor esté habilitado en la configuración MCP de Cursor y úsalo desde su agente. Las ubicaciones y el formato se documentan en la [guía oficial de Cursor](https://prod.cursor.com/docs/mcp).

### Otra herramienta

```sh
npm run hyperion -- connect mi-herramienta
```

El comando registra una identidad y genera `.hyperion/connections/mi-herramienta.mcp.json`. Configura su entrada en un cliente que admita MCP stdio y procesos locales. Si tu herramienta dispone de terminal o HTTP pero no de MCP, puede usar la CLI o el [protocolo HTTP](protocol.md).

Cada cliente recibe una credencial diferente. Pueden coexistir en la misma instancia y cada flujo conserva su coordinador. Esta versión no transfiere automáticamente un flujo de Codex a Claude o Cursor. Para esa situación haría falta un mecanismo explícito de cesión de autoridad.

## Usar la CLI desde una conversación ya abierta

El agente ejecuta estos comandos desde Hyperion. Sustituye `codex` por `claude`, `cursor` u otra identidad registrada cuando corresponda:

```sh
HYPERION_AGENT_ID=codex npm run hyperion -- create PLAN_GENERADO.json
HYPERION_AGENT_ID=codex npm run hyperion -- get RUN_ID
HYPERION_AGENT_ID=codex npm run hyperion -- start RUN_ID STEP_ID
# El agente realiza aquí el trabajo autorizado con sus propias herramientas.
HYPERION_AGENT_ID=codex npm run hyperion -- complete RUN_ID STEP_ID 'Resultado y evidencia'
HYPERION_AGENT_ID=codex npm run hyperion -- wait RUN_ID REVISION 30
```

Las aprobaciones se realizan en la interfaz. Ni CLI ni MCP ofrecen un comando para suplantar la decisión humana.

## Procesos con compuertas y contrato de datos

El [contrato de procesos](process-contract.md) describe inicio/fin, las compuertas `+`, `X`, `○`, el tipado de inputs/outputs y las trazas públicas. El ejemplo [process-review.json](../examples/process-review.json) permite elegir documentación, código o ambos; la compuerta inclusiva activa lo elegido y la unión espera esas ramas. Si no eliges ninguna, se ejecuta una ruta por defecto explícita. Todo se responde desde popups del mismo canvas.

## Resolver problemas

En las fuentes de desarrollo, si otro Hyperion rechaza las credenciales de esta instalación en la dirección solicitada, el lanzador MCP usa el puerto alternativo local elegido durante el arranque. No cambia la configuración guardada del cliente ni detiene la otra instancia. La corrección aún no está incluida en un instalador publicado. Comprueba una llamada de lectura, como `hyperion_list_runs`: que la configuración exista o se muestre la lista de herramientas no demuestra que las llamadas funcionen en ese chat.

| Problema                                         | Comprobación                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| La interfaz no abre                              | Mantén `npm start` activo y usa `127.0.0.1:4317`                                        |
| El cliente no encuentra el adaptador             | Ejecuta `npm run build`; comprueba las rutas absolutas de Node y `dist/adapters/mcp.js` |
| Unregistered agent                               | Ejecuta `connect` para esa identidad y verifica `HYPERION_AGENT_ID`                     |
| Aparece el nombre de otra herramienta            | Revisa la identidad configurada antes de crear un flujo nuevo                           |
| Falta la herramienta MCP en el chat              | Revisa el estado MCP del cliente y recarga o abre una sesión que la incluya             |
| El agente no continúa tras aprobar               | Pídele continuar con el ID; la decisión ya quedó guardada                               |
| Una herramienta intenta continuar un flujo ajeno | Usa el coordinador original; aún no existe transferencia de autoridad                   |
| La herramienta está en la nube                   | Este adaptador es local; `127.0.0.1` no apunta a tu ordenador desde un entorno remoto   |

## Alcance de la verificación

La integración de esta conversación usa Codex mediante CLI. El contrato MCP se prueba automáticamente con un cliente del SDK y las identidades `codex`, `claude` y `cursor`; también se prueba otra identidad mediante HTTP. La configuración está contrastada con documentación oficial. Esa prueba no equivale a haber ejecutado el recorrido en las aplicaciones nativas de Claude y Cursor: su verificación final se realiza al conectarlas y usar la petición anterior.
