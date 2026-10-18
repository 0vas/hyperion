# Hyperion: del chat al flujo

La pausa persistente y el alcance por herramienta se explican en [Reanudación agnóstica](continuacion-agnostica.md). La conexión MCP local y la reanudación de un chat cerrado son capacidades distintas.

**Tú describes la actividad en el chat. La IA conecta Hyperion, crea el plan y ejecuta sus pasos. Tú sigues el avance y decides en el canvas.**

## Conectarlo una vez

Instala Hyperion Desktop y elige **Codex**, **Cursor**, **Claude Desktop** o **Claude Code** en el asistente inicial. Reinicia esa aplicación y abre una conversación nueva. No necesitas terminal ni instalar Node. Para conectar otra aplicación: **Hyperion → Conectar con mi IA**. [Descarga, instalación y ayuda](conexion.md).

## Idioma y versión

Hyperion incluye **español e inglés** en el canvas y en los menús y diálogos de Desktop. Abre **Ajustes → Idioma** para elegir **Automático (sistema)**, **Español** o **English**. En Desktop también puedes cambiarlo desde **Hyperion → Idioma**.

La versión CalVer (p. ej. `2026.10.18.2241 UTC · preview`) aparece al abrir **Menú** (primera línea), en la vista **Conexiones** y en **Acerca de Hyperion** / **Hyperion → Acerca de** (macOS).

## Conexiones e integraciones

La cabecera muestra el **servicio local** Hyperion y un único **Menú** (sin iconos sueltos de Ajustes/Guía/Ayuda). «Conectado» solo dice que el proceso local responde; no afirma que un chat tenga las herramientas cargadas.

La vista **Conexiones** lista siempre las cinco aplicaciones (Codex, Cursor, Claude Desktop, Claude Code, Antigravity) con estado _Configurada_, _Sin configurar_, _Conflicto · no sobrescrita_ o _No se pudo comprobar_, y muestra la CalVer sin buscarla en Ajustes. Hyperion no sobrescribe una entrada distinta: el conflicto se muestra para que la resuelvas en el cliente (con **Reemplazar…** confirmado si eliges sobrescribir). Tras **Actualizar y reiniciar** en Desktop, Hyperion refresca automáticamente solo las entradas Hyperion de _esta_ instalación que chocan porque el update cambió rutas o argumentos (con respaldo del archivo); las entradas ajenas o desconocidas siguen en conflicto y requieren el Resolver. Un arranque normal sin update no reemplaza nada. Tras configurar, reinicia esa aplicación y abre un chat nuevo.

El modo automático toma el idioma del sistema o del navegador; si no está soportado, usa inglés. La selección manual se conserva al volver a abrir la app. En Desktop, el menú y el canvas comparten la preferencia; en el navegador se guarda por separado.

**Tu contenido conserva su idioma.**
Cambiar la interfaz no traduce nombres de tareas, preguntas del agente, respuestas, resultados ni logs. Tampoco reinicia el flujo ni descarta un formulario sin enviar. Los diagnósticos originales de herramientas y del servicio mantienen su texto para poder investigarlos.

Incluido en el instalador **2026.10.12.1722 UTC · Preview**, junto con los artefactos por paso y los recorridos enlazados.

## Invocarlo desde una conversación

Escribe, por ejemplo:

> Usa Hyperion para preparar una guía de bienvenida a mi proyecto.

Con la conexión preparada, eso es todo: tu agente crea un flujo específico y te entrega su enlace.

Si solo dices «Quiero usar Hyperion», el agente te preguntará qué actividad quieres realizar. El plan nace de tu respuesta.

## Desde un chat nuevo o una aplicación sin contexto

La misma frase sirve aunque el chat esté vacío:

> Usa Hyperion para preparar una guía de bienvenida a mi proyecto.

Si la herramienta no sabe qué proyecto es, el flujo recoge primero esa información: por ejemplo, «¿Qué hace tu proyecto?» y «¿Para quién es la guía?». Tus respuestas alimentan los pasos siguientes. No tienes que traer una conversación previa, un repositorio ni explicar cómo debe funcionar Hyperion. Si el objetivo ya está claro, no añade preguntas de preparación.

Para retomar un flujo desde otro chat, puedes compartir su enlace y decir **«Continúa este flujo»**. La integración recupera los pasos, datos y decisiones guardados. Si hay varios flujos posibles, te pide identificar el correcto.

Esto requiere que la aplicación tenga habilitada su conexión con Hyperion. El contexto de tu actividad puede estar vacío; la conexión técnica es independiente. Una aplicación sin agente de IA necesita un adaptador que genere y ejecute el plan; el servidor actual de Hyperion no incorpora un modelo propio.

## Tu caso de prueba, desde este chat

Copia este mensaje aquí:

> Usa Hyperion para preparar una guía de bienvenida a mi proyecto.

El agente construye el plan desde tu petición y utiliza contexto adicional solo si está disponible. Si falta información relevante —por ejemplo, el público de la guía— te la pide en el canvas. Si ya la conoce, continúa. Organizar fases, conectar entradas y salidas y registrar avances son responsabilidades de la integración: no tienes que pedirlas en cada mensaje.

1. Abre el enlace y observa el plan generado para tu objetivo.
2. Si aparece **Tu turno**, responde la pregunta o decisión concreta. No todos los flujos necesitan una intervención humana.
3. Mientras aparezca **Agente conectado**, confirma en el canvas: la integración devuelve tu respuesta al agente y este continúa en el mismo turno. Si el chat se cerró o la conexión se perdió, usa **Copiar continuación**; no repitas tus respuestas.
4. Consulta el resultado y sus registros. Solo debe pedirse aprobación cuando corresponda a la actividad o tú la hayas solicitado.

**Para probar un cambio de plan:** mientras quede trabajo pendiente, puedes escribir:

> Mejor quiero una checklist de cinco puntos, con lenguaje sencillo.

El agente interpreta el cambio dentro del flujo actual y conserva por sí mismo las respuestas, lo ejecutado y el historial. No necesitas indicarle cómo aplicar una revisión.

Codex aplica la revisión al mismo flujo y lo deja **en pausa**. Pulsa **El plan cambió** para ver lo añadido, modificado o retirado. Si coincide con tu petición, usa **Más opciones → Reanudar** y escribe aquí **«Continúa con el plan actualizado»**. No necesitas instalar nada ni escribir comandos.

Si respondiste preguntas anteriores, comprueba que esas respuestas siguen en I/O. Revisa también los pasos nuevos y el motivo del cambio en Actividad. La revisión es excepcional: no se modifican pasos ya ejecutados o iniciados, compuertas resueltas ni decisiones que el canvas ya te haya presentado. Si hay una tarea ejecutándose, primero debe terminar o registrar su fallo. Si el proceso terminó, se crea otro flujo.

## Qué pasa después

1. **Abre el enlace.** «Petición original» conserva lo que pediste.
2. **Revisa el plan.** «Ver trabajos» resume las fases. Pulsa un trabajo para desplegar los pasos en el canvas. Cada paso conserva su responsable, estado, datos y logs.
3. **Enfoca el trabajo.** Selecciona un paso en «Ir a tarea» y activa «Seguir actividad». La vista acompaña el avance; al arrastrar o cambiar el zoom puedes explorar libremente.
4. **Decide cuando diga «Tu turno».** Abre el paso: verás qué se te pregunta, por qué hace falta y qué sucederá después. Elige los valores y pulsa «Guardar elección», o revisa el resultado y aprueba/rechaza.
5. **Confirma y sigue el avance.** Si ves «Agente conectado», tu respuesta se entrega al agente que está esperando y puede continuar en ese turno. Si el chat terminó, usa «Copiar continuación» para conectarlo de nuevo. No repitas la respuesta.

Si tienes varios flujos, pulsa «Copiar continuación» dentro del que quieres retomar y pega aquí el texto copiado. Ese botón copia la petición; no envía mensajes por ti.

## Un ejemplo completo

**Tú, aquí:** «Usa Hyperion para preparar mi guía de bienvenida».

**Codex:** lee el contexto disponible, genera el plan adecuado y comparte su enlace.

**Si falta el público destinatario**, Hyperion puede preguntarte «¿Para quién es la guía?». Respondes en el canvas. Si el contexto ya lo aclara, no repite la pregunta.

**Tú, en el canvas:** guardas tu respuesta mientras el agente sigue conectado.

**Codex:** recoge tu respuesta, redacta la guía y registra el resultado. Puedes leerlo y pedir ajustes en lenguaje natural.

Los títulos y decisiones se generan para tu actividad; este ejemplo no es una plantilla obligatoria.

## Controles útiles

| Control                    | Uso                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Ver trabajos / Ver pasos   | Alternar resumen y detalle del mismo proceso                                                                        |
| Ir a tarea / Enfocar tarea | Centrar un paso, incluso si ya terminó                                                                              |
| Seguir actividad           | Acompañar la tarea que requiere atención                                                                            |
| Vista general              | Volver al flujo completo                                                                                            |
| I/O                        | Ver lo que recibe y entrega un paso                                                                                 |
| Logs                       | Consultar acciones y resultados que registró el agente                                                              |
| Actividad                  | Revisar el historial del proceso                                                                                    |
| Ajustes                    | Idioma, apariencia, enlace a **Conexiones** y navegación                                                            |
| Cabecera · Servicio local  | «Conectado» / «Sin conexión» del proceso Hyperion en este equipo — no implica que tu IA tenga herramientas cargadas |
| Cabecera · Menú            | Un solo control: CalVer en la primera línea, Conexiones, Ajustes, Guía, Ayuda y Acerca de (sin iconos sueltos)      |
| Pausar                     | Evitar que se inicien nuevas tareas hasta reanudar                                                                  |

Los ajustes se guardan en este navegador. No alteran tus decisiones ni conceden permisos al agente. Escape cierra un popup sin responder.

## Qué significa el estado

**En espera:** falta un paso previo. **Espera al agente:** la IA puede retomarlo desde el chat. **En curso:** la IA registró que empezó. **Tu turno:** necesita tu decisión. **Completado:** hay un resultado. **Omitido:** esa rama no fue elegida. **Falló:** abre los logs y pide al agente que lo revise.

Inicio y fin marcan los límites. Las compuertas indican todas las ramas (`+`), una sola (`X`) o las que cumplen una condición (`○`). El agente las usa solo cuando aportan sentido al proceso.

## Codex, Cursor y Claude

La misma petición funciona en un harness que tenga Hyperion conectado. Hyperion acepta skills, MCP o su API; el flujo no depende de una marca de IA. Esta conversación de Codex ya dispone de la skill.

En otra herramienta puedes pedir: «Conecta Hyperion y úsalo para [actividad]». Si aún no tiene acceso a Hyperion, necesitará que su integración esté habilitada; reconocer el nombre no instala una aplicación por sí solo. La [guía de conexión para integradores](conexion.md) contiene esa configuración, separada del uso diario.

La integración actualizada mantiene la espera mientras respondes. El canvas no despierta conversaciones cerradas ni ejecuta por sí mismo las herramientas de la IA; si la conexión terminó, retoma con **Copiar continuación**.

## Leer los colores y las flechas

- **Inicio verde:** círculo de borde fino. **Compuertas amarillas:** rombos con +, X u ○. **Fin rojo:** círculo de borde grueso. Estos colores identifican el símbolo, no su estado.
- **Verde:** paso completado y ruta recorrida.
- **Azul:** «Espera al agente» indica una tarea habilitada; «En curso» indica que el agente inició la tarea.
- **Ámbar:** el proceso espera tu intervención o está en pausa. La etiqueta distingue ambos casos.
- **Rojo en tareas o conexiones:** error o rechazo que requiere revisión. El círculo rojo de fin no es un error.
- **Gris discontinuo:** ruta pendiente; el punteado más tenue identifica una rama omitida.

Pulsa **Más opciones → Colores del flujo** para abrir la leyenda. Las cajas usan iconos SVG para distinguir agente, persona y aprobación; mantienen datos y logs a un clic. El color siempre va acompañado de texto o símbolos.

Las conexiones SVG muestran una corriente: tres cintas finas con ondas lentas y continuas que avanzan desde lo hecho hasta la tarea disponible o que espera tu respuesta. Las cintas no llevan punta de flecha; las rutas pendientes conservan la flecha para indicar dirección. No circula por ramas pendientes u omitidas. Se detiene al terminar, pausar, cancelar, perder conexión o activar movimiento reducido; no indica que un agente siga vivo fuera de Hyperion. En la vista de trabajos, los pasos internos pueden seguir ejecutándose aunque la conexión de entrada al trabajo ya figure como recorrida.

## Junto al chat o en una ventana independiente

En una ventana dividida, la cabecera muestra el flujo y la fila inferior permite elegir y enfocar una tarea. El canvas ocupa el espacio central; zoom y «Tu turno» quedan abajo. Los iconos muestran su nombre al mantener el cursor encima.

**Más opciones (⋯)** reúne la petición original, actividad, vista de trabajos/pasos, continuación y pausa. **Ajustes** permanece accesible en la cabecera. Al ampliar la ventana, las acciones del flujo también aparecen en la barra inferior.

Para trabajar fuera del panel del chat, pulsa **Más opciones → Abrir en ventana**. Se abre el mismo flujo en una ventana web independiente que puedes colocar junto a Codex, Cursor o Claude. No requiere comandos. Si el navegador bloquea la apertura, permite ventanas para Hyperion y vuelve a pulsar el botón. Esta opción abre otra ventana del navegador. Para el cliente de escritorio, usa la opción siguiente.

## Elegir escritorio o split desde el chat

Puedes decir:

> Usa Hyperion en split para preparar mi guía.

> Abre este mismo flujo de Hyperion en escritorio.

> Vuelve a mostrarlo junto al chat.

El agente mantiene el mismo flujo: decisiones y resultados aparecen en ambas vistas. **Split** usa el enlace web. **Escritorio** abre Hyperion Desktop después de instalarlo y abrirlo una vez. El usuario no tiene que copiar comandos ni configurar puertos. La herramienta de IA sí necesita la integración local de Hyperion, como en el uso web.

Los instaladores son **DMG para macOS** y **EXE para Windows**. Se generaron DMG para Apple Silicon e Intel y EXE x64 para Windows; se probó la aplicación en Apple Silicon. Windows e Intel aún requieren una prueba en su plataforma. El repositorio contiene la compilación reproducible; la distribución pública firmada aún está pendiente. El DMG local es de desarrollo y no está notarizado.

## Orientación, decisiones y reintentos

- **Horizontal / vertical:** pulsa la flecha de dirección junto al selector de tareas, o cambia **Ajustes → Dirección**. Se conserva tu preferencia. «Vista general» muestra el proceso completo; «Enfocar paso actual» vuelve al trabajo pendiente.
- **Compuertas:** los rombos SVG usan **+** (todas las ramas), **X** (una) y **○** (una o más). Abre **Más opciones → Colores del flujo** para ver sus reglas. Solo aparecen las compuertas que el agente incluyó en tu proceso.
- **Animación:** la corriente avanza por las rutas alcanzadas y llega hasta el punto de espera. Las rutas pendientes no se mueven. Funciona en horizontal y vertical, en split y escritorio; respeta el movimiento reducido.
- **Tu respuesta:** responde la pregunta principal y pulsa **Guardar elección**. Si hay varias preguntas obligatorias, verás cuántas faltan. Sí y No son respuestas válidas; ninguna viene seleccionada.
- **Ayuda y comentarios:** abre **Ver instrucciones** si necesitas contexto. Los campos **Opcionales** se despliegan al pulsarlos y conservan lo escrito al cerrarlos. Cada campo puede incluir una ayuda o un ejemplo; los errores se explican junto al dato. **Detalles del paso** reúne responsable, dependencias e historial.
- **Reintentar:** aparece en tareas pendientes o fallidas y avisa al agente que esté esperando. Conserva el historial y habilita otro intento. Para una tarea en curso, usa **Recuperar tarea**. El botón no ejecuta herramientas por su cuenta.

## Si aprobaste y el flujo está esperando

**Espera al agente** significa que tu decisión se guardó y la siguiente tarea está habilitada. Si el agente sigue conectado, debe retomarla en su turno. Si la conexión terminó, pulsa **Copiar continuación**, vuelve al mismo chat y pega la petición. También puedes escribir «Continúa mi flujo de Hyperion». No necesitas comandos. En esta versión el canvas no puede despertar por sí solo un chat inactivo.

**I/O** abre las entradas, salidas y el contexto anterior. Expande solo la fuente que necesitas consultar. **Logs** muestra registros reales del paso; selecciona **Todo el proceso** para ampliar la vista. Los iconos pulsan brevemente al recibir registros o valores nuevos. Si dejan de pulsar, no significa necesariamente un error: no han llegado datos nuevos. La interfaz no puede mostrar acciones que la herramienta de IA no haya registrado.

Las ramas booleanas muestran **✓** para Sí y **×** para No, dibujados en SVG. Al mantener el cursor aparece su significado; también tienen nombre accesible. La cruz indica una respuesta negativa, no un error. Las opciones con etiquetas específicas conservan su texto. El símbolo SVG identifica al agente; su nombre sigue disponible como ayuda y para lectores de pantalla.

## Recuperar una tarea atascada

En una tarea de IA pendiente o fallida, pulsa **Reintentar** (icono de flecha circular). Si sigue marcada en curso, abre **Recuperar tarea** y confirma la recuperación. El historial y tus respuestas se conservan; solo se habilita de nuevo esa tarea.

El botón avisa al agente que esté esperando este flujo. Sin un agente esperando, la solicitud queda en el historial y puedes retomar desde el chat mediante **Copiar continuación**. Recuperar no cancela descargas ni otras herramientas externas: el agente comprueba lo que ya ocurrió antes de repetirlo.

Esta capacidad corresponde al runtime 0.4.1 del repositorio; el instalador preview 0.4.0 publicado anteriormente no la incluye.

## Probar la integración actualizada

Desde un chat nuevo, pide **«Usa Hyperion para [tu actividad]»**. Si falta una decisión, el agente comparte el canvas y mantiene su herramienta esperando. Abre el enlace sin detener la ejecución del chat. Para una elección conocida debe aparecer un desplegable vacío, con opciones concretas y «Otro» o ayuda cuando corresponda. Al guardar, la respuesta se devuelve al agente y continúa la tarea; no necesitas avisarle otra vez.

Esta espera adjunta corresponde al runtime **0.4.2** y a su skill actualizada. La distribución anterior y las integraciones que solo crean un plan por HTTP no incorporan ese ciclo. Una conversación ya cerrada no se reactiva retroactivamente. Los flujos anteriores conservan sus formularios y respuestas, incluso si fueron creados como texto libre.

## Artefactos dentro del paso

Abre el paso y su sección **Artefactos**, o pulsa el icono de paquete del nodo cuando tenga resultados. Allí puedes ver el nombre, fecha y tipo de cada archivo, abrir enlaces y descargar archivos. Los textos pequeños e imágenes compatibles tienen vista previa. HTML y SVG se muestran como texto, y los demás formatos se descargan. La lista se actualiza cuando el agente registra el resultado; no explora automáticamente tu disco.

Si se reintenta una tarea, los artefactos anteriores permanecen identificados por intento. I/O sigue mostrando los datos del contrato y Logs la actividad: un artefacto es el entregable que puedes abrir.

## Un final puede ser otro inicio

Después de completar el flujo puedes continuar la conversación, por ejemplo: «Ahora traduce esta guía al inglés». El agente crea un nuevo recorrido enlazado al anterior, con tu nueva petición y el contexto relevante. El canvas dibuja **Fin anterior → nuevo inicio** y permite navegar entre ambos. El trabajo completado conserva su historial.

También puedes usar **Continuar desde aquí** al final del gráfico para preparar la nueva petición y copiarla al chat conectado. Ese botón no inicia un agente por sí mismo. Una continuación nueva no sirve para saltar una aprobación pendiente ni para recuperar una tarea atascada; esas situaciones usan los controles existentes.

Estas funciones están incluidas en el instalador **2026.10.18.2241 UTC · Preview**. Actualiza desde [la página de descarga](conexion.md) o desde **Hyperion → Buscar actualizaciones…** en Desktop (**Actualizar y reiniciar** aplica el instalador verificado y reinicia; también puedes solo descargarlo).

## Organizar el canvas

La vista inicial mantiene las tarjetas legibles; un flujo largo puede quedar parcialmente fuera del encuadre. Usa **Vista general** para ver todo el recorrido o **Enfocar paso actual** para revisar una tarea. Un paso marcado **Completado** ya terminó: abre su icono de paquete para consultar **Artefactos**, o **Logs** para revisar lo que ocurrió.

Arrastra el asa de puntos de cualquier tarea, evento, compuerta, trabajo o enlace de continuación. También puedes enfocar el nodo, pulsar Intro y moverlo con las flechas. Los botones de la tarjeta siguen abriendo sus detalles. **Ordenar flujo** restaura la distribución automática de la vista actual.

Las posiciones se guardan localmente por flujo, orientación y vista de pasos/trabajos. Las actualizaciones del agente no las borran. Mover un nodo no cambia dependencias, ejecución, decisiones ni historial; tampoco mueve el mismo flujo en otro navegador o dispositivo.

Disponible en los instaladores **2026.10.18.2241 UTC · Preview**.
