# Usar el canvas

El chat define el objetivo, el progreso breve y la continuación cuando haga falta. El alcance, las rutas y las decisiones viven en formularios del canvas—no en un cuestionario paralelo en el chat.

<GuideLens kind="canvas" />

## Encuentra tu siguiente tarea

Selecciona una tarea en la navegación superior y usa **Enfocar tarea**. **Seguir actividad** mantiene cerca el trabajo activo. En Ajustes puedes elegir orientación vertical u horizontal y el tema; los trabajos agrupan pasos que puedes desplegar.

| Señal              | Qué significa                                      |
| ------------------ | -------------------------------------------------- |
| Inicio verde       | Punto de partida                                   |
| Compuerta amarilla | Divide o reúne caminos                             |
| Fin rojo           | Cierre del proceso, no necesariamente un error     |
| Tarea verde        | Completada                                         |
| Tarea azul         | Lista para el agente o en ejecución; lee su estado |
| Tarea ámbar        | Requiere tu intervención                           |
| Tarea roja         | Fallo o rechazo                                    |
| Ruta gris          | Pendiente u omitida, según su trazo                |

Las rutas muestran el avance registrado. La animación no garantiza que el agente siga conectado. El movimiento se reduce si así lo configuras en el sistema.

## Responde lo necesario

Cada formulario debe tener una pregunta concreta. El agente puede usar desplegables, Sí/No, cantidades o texto según el dato. Ninguna elección debe estar aprobada por defecto. La ayuda y los detalles opcionales se despliegan cuando los necesitas.

Al seleccionar un paso se abre **Resultado** a la derecha (≥960px: canvas ~60% / panel ~38%, 320–480px). Bajo 960px, una hoja inferior con **Volver al canvas**. Prioriza la evidencia: artefacto, si no salidas tipadas, si no un resumen público de log; si aún no hay nada, lo dice sin inventar progreso. Si el paso espera tu respuesta, el formulario aparece primero. **Detalle**, **I/O**, **Logs** y **Actividad** del paso se revelan en el mismo panel (la Actividad del flujo sigue en el menú). Escape o el lienzo vacío cierran Resultado y devuelven el foco al nodo. Conexiones y Ajustes siguen en diálogos.

En **I/O** ves las entradas y salidas; en **Logs**, resúmenes, acciones y observaciones públicas. Se actualizan cuando el agente envía eventos. El trabajo largo en el host debe aparecer aquí (incluye latidos); un timeout o permiso denegado debe dejar el paso **Falló**, no **En curso** sin fin. No son una grabación automática de todas sus herramientas ni de su razonamiento privado.

## Retomar el trabajo

**Espera al agente** significa que la tarea está habilitada y aún no se ha iniciado. Guardar tu respuesta no ejecuta por sí mismo acciones en otra aplicación.

Si el chat está esperando mediante la integración (`hyperion_wait` / «Agente conectado»), al confirmar en el canvas recibe el cambio y debe ejecutar **todos** los pasos de agente listos en ese mismo turno—sin pedirte «listo» en el chat; el CTA de continuación permanece oculto mientras la espera está abierta. Si terminó su turno sin espera—frecuente en Claude Desktop—, el canvas / Resultado ofrece **Copiar continuación** (un prompt con el ID del flujo y cada `stepId` listo): pégalo en el chat conectado. **Enviar** requiere un conector de reanudación real; MCP solo no despierta el chat. Pedir «split» solo obtiene la URL: ábrela en Browse / panel lateral (o el navegador); Claude Desktop no abre un panel Hyperion nativo. No regenerues un chat antiguo (por ejemplo un Excel de hace horas) para retomar Hyperion: abre un chat nuevo, confirma herramientas `hyperion_*` y pega la continuación o «Usa Hyperion para…».

Si no avanza, comprueba si está pausado, si falta otra respuesta o si el agente informó un error. Una tarea **En curso** sin espera activa tras un permiso denegado suele necesitar **Recuperar tarea** o **Copiar continuación** cuando ya concediste el acceso. Consulta la actividad de la tarea; no vuelvas a aprobar lo mismo ni crees otro flujo para eludir el bloqueo.

## Reintentar

Pulsa **Reintentar** en una tarea de IA pendiente o fallida —también tras un abandono automático por falta de progreso (~180 s sin espera). Si quedó en curso, usa **Recuperar tarea** y confirma. Se conservan tus respuestas y los logs; el agente que esté esperando recibe la solicitud por evento. La recuperación no cancela herramientas externas: el agente debe comprobar qué ocurrió antes de repetir una acción. Los resultados tardíos de un intento anterior se rechazan.

Con el runtime 0.4.1, el formulario muestra **Agente conectado** cuando hay una espera activa. Al confirmar, la respuesta se entrega sin pedir otro mensaje. Si el chat terminó su turno, todavía necesita una continuación para reconectarse. El instalador preview 0.4.0 aún no incluye estas mejoras.

## Cambiar el plan

Puedes decir en el chat: «Desde esta fase, necesitamos añadir una revisión». El agente puede revisar el trabajo futuro con una explicación. Hyperion conserva lo ya ejecutado y pausa el plan revisado para tu revisión en el canvas. Cambiar el objetivo no debe reescribir el historial.

## Compuertas

- **Exclusiva (×):** elige un camino según la respuesta.
- **Inclusiva (○):** habilita uno o varios caminos que cumplen la condición.
- **Paralela (+):** habilita varios caminos y espera su reunión.

Que dos tareas estén habilitadas no implica que se ejecuten simultáneamente: depende de las capacidades reales del agente.

## Espera conectada desde el chat

La skill del runtime **0.4.2** crea el flujo y mantiene la herramienta esperando mientras respondes. Abre el canvas desde el mensaje de progreso sin detener el chat. Cuando confirmas, el agente recibe tus datos y puede ejecutar el siguiente paso en ese mismo turno. Los desplegables necesitan opciones declaradas; ahora se rechazan nuevas listas de elección escritas como instrucciones de texto libre en el patrón detectado.

Las integraciones MCP reciben la siguiente acción y los argumentos de espera en cada respuesta. Un host que termina su turno todavía necesita reconexión. El instalador preview anterior no incluye este cambio y los formularios ya creados se conservan.

## Abre los artefactos del paso

En **Artefactos** (dentro de **Resultado**) encontrarás los archivos y enlaces que el agente haya registrado. El icono de paquete del nodo abre Resultado centrado en esa lista. Puedes ver textos pequeños e imágenes compatibles, descargar archivos o abrir el enlace de un documento. Los resultados de intentos anteriores permanecen identificados.

::: tip Entregables a mano
Por ejemplo, el paso «Preparar guía» puede contener `bienvenida.md`, una ilustración y el enlace al documento compartido. **I/O** conserva sus datos y **Logs** explica las acciones; **Artefactos** te permite acceder al resultado.
:::

El agente debe registrar el archivo; Hyperion no recorre tu disco ni publica documentos automáticamente. HTML y SVG se muestran en un `iframe` con `sandbox=""` vacío: alterna **Vista previa** y **Código**; bajo Vista previa aparece el aviso de vista previa inerte (sin JavaScript ni red; el aspecto puede diferir del navegador completo). No es un navegador completo ni un escudo antimalware. Los archivos subidos tienen un límite de 10 MiB.

## Continúa después del final

Puedes decir en el mismo chat: «Ahora traduce esta guía al inglés». El agente crea otro recorrido enlazado, y el gráfico muestra **Fin anterior → nuevo inicio**. Pulsa la tarjeta del recorrido para navegar entre ambos. El flujo terminado conserva sus decisiones, archivos e historial.

**Continuar desde aquí**, al final del gráfico, te ayuda a preparar esa petición. **Copiar petición para el chat** es el camino habitual (copiar ≠ entregar). Pega la petición en el chat conectado; el envío automático requiere un conector de envío — MCP solo no despierta el chat (**Enviar** oculto en esta fase). El agente debe crear el recorrido enlazado. Si el proceso sigue abierto y necesitas cambiarlo, usa la revisión del plan; si falló una tarea, usa reintentar.

::: info Disponibilidad
Los instaladores **2026.10.26.2007 UTC · Preview** incluyen artefactos (vista previa HTML/SVG aislada) y recorridos enlazados. [Descarga la nueva versión](primeros-pasos.md) si conservas una anterior.
:::

## Mueve y ordena los nodos

El canvas abre a una escala legible. En un recorrido largo, usa **Vista general** para encajar todo o **Enfocar paso actual** para revisar una tarea. **Completado** significa que ese paso terminó; abre su icono de paquete para consultar los artefactos.

Arrastra el asa de puntos sobre una tarjeta o símbolo. Con teclado, enfoca el nodo, pulsa Intro y usa las flechas. **Ordenar flujo** restaura la distribución automática de la vista actual.

::: tip Tu distribución, el mismo proceso
Las posiciones se conservan en este navegador por flujo, orientación y vista de pasos/trabajos, incluso al recibir actividad del agente. No cambian las dependencias ni el historial, y no se sincronizan con otros dispositivos.
:::

Disponible en los instaladores **2026.10.26.2007 UTC · Preview**. [Descargar](primeros-pasos.md).
