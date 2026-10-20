# Usar el canvas

El chat define el objetivo y realiza el trabajo con sus herramientas. El canvas te permite seguir el proceso y aportar decisiones.

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

En **I/O** ves las entradas y salidas; en **Logs**, resúmenes, acciones y observaciones públicas. Se actualizan cuando el agente envía eventos. No son una grabación automática de todas sus herramientas ni de su razonamiento privado.

## Retomar el trabajo

**Espera al agente** significa que la tarea está habilitada y aún no se ha iniciado. Guardar tu respuesta no ejecuta por sí mismo acciones en otra aplicación.

Si el chat está esperando mediante la integración, recibe el cambio y puede seguir en el mismo turno. Si terminó su turno, usa **Copiar continuación** en Hyperion y envía el texto en el chat conectado. Incluye el ID del flujo para recuperar la decisión y continuar sin empezar otro proceso.

Si no avanza, comprueba si está pausado, si falta otra respuesta o si el agente informó un error. Consulta la actividad de la tarea; no vuelvas a aprobar lo mismo ni crees otro flujo para eludir el bloqueo.

## Reintentar

Pulsa **Reintentar** en una tarea de IA pendiente o fallida. Si quedó en curso, usa **Recuperar tarea** y confirma. Se conservan tus respuestas y los logs; el agente que esté esperando recibe la solicitud por evento. La recuperación no cancela herramientas externas: el agente debe comprobar qué ocurrió antes de repetir una acción. Los resultados tardíos de un intento anterior se rechazan.

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

En **Artefactos** encontrarás los archivos y enlaces que el agente haya registrado. El icono de paquete del nodo abre la lista directamente. Puedes ver textos pequeños e imágenes compatibles, descargar archivos o abrir el enlace de un documento. Los resultados de intentos anteriores permanecen identificados.

::: tip Entregables a mano
Por ejemplo, el paso «Preparar guía» puede contener `bienvenida.md`, una ilustración y el enlace al documento compartido. **I/O** conserva sus datos y **Logs** explica las acciones; **Artefactos** te permite acceder al resultado.
:::

El agente debe registrar el archivo; Hyperion no recorre tu disco ni publica documentos automáticamente. HTML y SVG se previsualizan como texto. Los archivos subidos tienen un límite de 10 MiB.

## Continúa después del final

Puedes decir en el mismo chat: «Ahora traduce esta guía al inglés». El agente crea otro recorrido enlazado, y el gráfico muestra **Fin anterior → nuevo inicio**. Pulsa la tarjeta del recorrido para navegar entre ambos. El flujo terminado conserva sus decisiones, archivos e historial.

**Continuar desde aquí**, al final del gráfico, te ayuda a preparar esa petición y copiarla al chat conectado. No ejecuta por sí mismo un agente. Si el proceso sigue abierto y necesitas cambiarlo, usa la revisión del plan; si falló una tarea, usa reintentar.

::: info Disponibilidad
Los instaladores **2026.10.12.1722 UTC · Preview** incluyen artefactos y recorridos enlazados. [Descarga la nueva versión](primeros-pasos.md) si conservas una anterior.
:::

## Mueve y ordena los nodos

El canvas abre a una escala legible. En un recorrido largo, usa **Vista general** para encajar todo o **Enfocar paso actual** para revisar una tarea. **Completado** significa que ese paso terminó; abre su icono de paquete para consultar los artefactos.

Arrastra el asa de puntos sobre una tarjeta o símbolo. Con teclado, enfoca el nodo, pulsa Intro y usa las flechas. **Ordenar flujo** restaura la distribución automática de la vista actual.

::: tip Tu distribución, el mismo proceso
Las posiciones se conservan en este navegador por flujo, orientación y vista de pasos/trabajos, incluso al recibir actividad del agente. No cambian las dependencias ni el historial, y no se sincronizan con otros dispositivos.
:::

Disponible en los instaladores **2026.10.20.0234 UTC · Preview**. [Descargar](primeros-pasos.md).
