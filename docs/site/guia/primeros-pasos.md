# Tu primer flujo

Necesitas una herramienta de IA compatible y Hyperion conectado a ella. La conexión se hace una vez; tus siguientes peticiones se escriben en el chat.

<Quickstart />

## Pruébalo antes de instalar

<WorkflowDemo />

## 1. Abre Hyperion

<Downloads />

[Descargar Hyperion Desktop](https://github.com/0vas/hyperion/releases/tag/v2026.10.23.1732).

Elige el instalador para tu equipo: `.dmg` para Mac Apple Silicon y `.exe` para Windows x64. Ábrelo e instala la aplicación. En Mac, mueve Hyperion a **Aplicaciones** antes de conectar tu IA. El instalador de Apple Silicon está firmado con **Developer ID** y **notarizado por Apple**. Windows no tiene firma de editor.

### macOS bloquea la app

Con la distribución notarizada actual, Gatekeeper debería aceptar Hyperion. Si aún aparece «Apple could not verify Hyperion.app is free of malware», no demuestra por sí mismo que la descarga esté dañada; comprueba que descargaste la copia del repositorio oficial y vuelve a intentarlo.

Si macOS sigue bloqueando una copia oficial:

1. Mueve **Hyperion.app** a **Aplicaciones** e intenta abrirla una vez.
2. En el aviso, pulsa **Listo / Done**.
3. Abre **Ajustes del Sistema → Privacidad y seguridad**. En Seguridad, busca Hyperion y pulsa **Abrir igualmente**.
4. Confirma la apertura y autentícate si macOS lo solicita.

Esta excepción corresponde a Hyperion. No desactives Gatekeeper para todo el equipo. Si no aparece el botón, el Mac está administrado o el aviso dice que la app está dañada o contiene malware, no fuerces la apertura: consulta la [guía oficial de Apple](https://support.apple.com/en-us/102445) y reporta el texto exacto.

## 2. Conecta tu IA

Al abrir Hyperion, elige **Codex**, **Cursor**, **Claude Desktop**, **Claude Code** o **Antigravity** en el asistente. También puedes acceder desde **Hyperion → Conectar con mi IA**.

El asistente prepara la conexión local. Reinicia tu herramienta de IA y abre un chat nuevo para que cargue la integración. No necesitas Node.js ni editar archivos de configuración para este recorrido con Desktop.

## 3. Pide lo que necesitas

Por ejemplo, desde un chat nuevo:

> Usa Hyperion para preparar una guía de bienvenida a mi proyecto.

::: tip Solo describe el objetivo
No tienes que diseñar el flujo ni explicar cómo usar Hyperion. El agente organiza los pasos y pide la información que falta **en el canvas**, no como un cuestionario en el chat.
:::

El agente comparte el enlace a tu flujo. Un chat vacío puede empezar con esa petición; la conexión debe estar instalada.

También puedes indicar dónde verlo:

> Usa Hyperion en una ventana de escritorio para organizar mi actividad.

O pedir verlo junto al chat. La disponibilidad de una vista dividida depende de tu herramienta; el enlace abre el mismo flujo en el navegador.

## 4. Participa en el canvas

Abre la tarea marcada **Tu turno**, responde y guarda. Las opciones conocidas aparecen como desplegables en los planes que las declaran; las preguntas abiertas admiten texto.

Si el agente sigue esperando tu respuesta, puede retomar el trabajo en ese mismo turno. Si el chat ya terminó, pulsa **Copiar continuación** y envía ese mensaje en el chat. La decisión ya quedó guardada: no tienes que escribirla otra vez.

## Comprueba tu primera prueba

- El flujo refleja tu petición y muestra el responsable de cada tarea.
- Los datos que introduces aparecen en I/O y llegan a las tareas siguientes.
- El borrador y sus avances reales se registran en el flujo.
- Puedes revisar el resultado y volver al chat para pedir cambios.

Preparar una guía no implica publicarla. La integración debe respetar el alcance de tu petición.

[Aprende a usar el canvas](./usar-el-flujo.md) o consulta [problemas de conexión](./integraciones.md).

## Peticiones listas para probar

<UseCases />

Elige un caso, copia la petición y pégala en tu herramienta de IA conectada. El agente adapta el plan a tu contexto. Son recorridos esperados, no ejecuciones garantizadas.

::: details Probar desde el código fuente
Para desarrollo, como alternativa a Desktop. Requiere Node.js 22.13 o superior.

```sh
git clone https://github.com/0vas/hyperion.git
cd hyperion
npm ci
npm run build
npm start
```

En otra terminal, conecta tu herramienta una vez:

```sh
npm run hyperion -- setup cursor
# Alternativas: setup codex / setup claude
```

Reinicia esa herramienta, abre un chat nuevo y pega una de las peticiones de arriba. Abre `http://127.0.0.1:4317` para ver el canvas. Este recorrido ejecuta el código de `main`, no el instalador preview anterior.
:::

## Idioma, versión y conexiones

Hyperion incluye **español e inglés** en el canvas y en los menús y diálogos de Desktop. Abre **Ajustes → Idioma** para elegir **Automático (sistema)**, **Español** o **English**. En Desktop también puedes cambiarlo desde **Hyperion → Idioma**.

El modo automático toma el idioma del sistema o del navegador; si no está soportado, usa inglés. La selección manual se conserva al volver a abrir la app. En Desktop, el menú y el canvas comparten la preferencia; en el navegador se guarda por separado.

La versión CalVer aparece en la vista **Conexiones** y en **Acerca de** (macOS). La cabecera muestra el **servicio local** y un acceso a **Conexiones** (Codex, Cursor, Claude Desktop, Claude Code, Antigravity). «Conectado» no significa que tu IA ya tenga las herramientas cargadas; tras configurar, reinicia el cliente y abre un chat nuevo. Hyperion no sobrescribe una entrada distinta.

::: tip Tu contenido conserva su idioma
Cambiar la interfaz no traduce nombres de tareas, preguntas del agente, respuestas, resultados ni logs. Tampoco reinicia el flujo ni descarta un formulario sin enviar. Los diagnósticos originales de herramientas y del servicio mantienen su texto para poder investigarlos.
:::

Incluido en el instalador **2026.10.12.1722 UTC · Preview**, junto con los artefactos por paso y los recorridos enlazados.

## Actualizar Desktop

Desde la versión CalVer **2026.10.12.0638 UTC**, abre **Hyperion → Buscar actualizaciones…**. La app consulta GitHub y ofrece el instalador de tu equipo. Con **Actualizar y reiniciar**, descarga el instalador oficial, verifica tamaño y SHA-256 y aplica el cambio reiniciando Hyperion (en macOS reemplaza esta app tras `codesign`; en Windows lanza el instalador NSIS verificado). **Descargar instalador…** guarda el archivo para instalarlo a mano. Puedes cancelar desde **Hyperion → Cancelar descarga**. Tus flujos permanecen en el almacenamiento local.

**La primera migración desde 0.4 o 0.5.1 a CalVer es manual desde esta página**: el actualizador antiguo no reconoce las nuevas etiquetas. La versión pública usa **AAAA.MM.DD.HHMM UTC**, con hora y minuto; el canal Preview se muestra por separado. Las siguientes actualizaciones se comparan cronológicamente.

La versión 0.4.0 necesita una actualización manual. Su bundle macOS tiene una firma incompleta; volver a descargar el mismo instalador no corrige esa firma. El instalador actual de Apple Silicon está firmado con Developer ID y notarizado por Apple. Si macOS bloquea la instalación, consulta la [guía de Apple](https://support.apple.com/102445); no desactives la protección global del equipo.

Desde **2026.10.12.2101**, al abrir la app actualizada, Hyperion respalda y reinicia automáticamente el servicio antiguo de la misma instalación. Conserva flujos, archivos, respuestas e historial; no vuelve a ejecutar tareas. No necesitas reiniciar el ordenador. La copia previa queda en `backups` dentro del almacenamiento local.

Si el puerto predeterminado (`127.0.0.1:4317`) lo ocupa otro Hyperion —por ejemplo de otra cuenta de este Mac u otra instalación— Desktop no lo detiene: arranca este instalador en otro puerto libre de loopback, guarda esa URL en `~/.hyperion/workspace.json` y reabre ahí mientras ese servicio siga vivo y autenticado (así no se abren dos servidores sobre el mismo almacenamiento). Si el puerto alterno ya no responde con tus credenciales, el siguiente arranque vuelve a preferir `4317`. El valor por defecto sigue siendo `4317` cuando no hay URL recordada o cuando abres con ese puerto libre. Los datos del Desktop empaquetado viven en `~/.hyperion`. Si el conflicto no se puede recuperar (otro programa en el puerto, respaldo imposible o un servicio más reciente), conserva el proceso ajeno y muestra un mensaje accionable. Las opciones Reintentar, Ver diagnóstico y Buscar actualizaciones siguen disponibles.
