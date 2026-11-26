---
title: El paisaje
description: Por qué Hyperion hace visible el trabajo de tu IA, conserva decisiones y evidencia, y te permite guiar el proceso.
---

<p class="landscape-eyebrow">POR QUÉ HYPERION</p>

# Un paisaje para el trabajo de tu IA

Cuando la IA deja de solo responder y empieza a actuar, necesitas un paisaje — no solo un chat.

Hyperion convierte una petición en un proceso visible: el agente ejecuta lo que está listo; tú decides; la evidencia permanece.

## Por qué existe Hyperion

Pedir una explicación y encargar un trabajo son actividades distintas. Una respuesta puede terminar cuando la lees. Preparar una propuesta, revisar documentos o producir un entregable exige reunir información, tomar decisiones, usar herramientas y comprobar resultados. Si además necesitas aprobar algo antes del siguiente paso, importa tanto el recorrido como la respuesta final.

El chat ayuda a explorar ideas, expresar matices y corregir el rumbo. Pero un hilo mezcla peticiones, posibilidades, resultados y decisiones. Para saber dónde quedó un trabajo, acabas reconstruyendo esa mezcla: ¿esto era una sugerencia o un paso terminado?, ¿qué versión revisé?, ¿falta un dato mío o está trabajando el agente? El problema aparece incluso cuando cada mensaje, por separado, es claro.

Hyperion existe para hacer explícito ese estado compartido. El agente propone un proceso a partir de tu objetivo; Hyperion conserva sus pasos, comprueba los cambios de estado y presenta las decisiones que te corresponden. Así puedes orientar el trabajo y examinar lo registrado sin depender únicamente de un resumen posterior del agente.

## Qué significa «paisaje»

Un paisaje permite ubicarse: ver dónde estás, qué queda por delante y qué caminos dependen de otros. En Hyperion, ese paisaje es el mapa visible del proceso. Los trabajos agrupan pasos; los pasos distinguen acciones del agente, información que debes aportar y aprobaciones. Las conexiones explican qué debe ocurrir antes de continuar.

El mapa responde preguntas prácticas: qué está listo, qué espera, quién debe actuar y qué resultado dejó cada paso. Puedes mirar el conjunto y abrir el detalle cuando lo necesitas. Su valor depende de que los estados representen registros del proceso: un dibujo con movimiento, por sí solo, no demuestra ejecución.

La [página de inicio](/) ilustra el paso de conversación a flujo. En una actividad real, el chat sigue siendo útil para formular el objetivo; el canvas ofrece un lugar estable para seguirlo y participar.

## De los problemas a las decisiones de diseño

### Un mapa visible para entender el orden

Una lista de tareas puede decir qué hacer sin explicar por qué una tarea espera. Hyperion conserva dependencias: preparar una versión final puede depender de revisar un borrador, y esa revisión de recibir el borrador. Esto permite distinguir trabajo pendiente de trabajo que ya puede empezar. El agente solo puede registrar el inicio de un paso elegible; una tarea lista todavía necesita un agente que la ejecute.

Si cambias el alcance durante la actividad, el agente puede proponer una revisión explícita del trabajo futuro. Hyperion conserva el historial y pausa el flujo para que revises el cambio antes de retomarlo. La razón es poder corregir el rumbo sin reescribir lo ocurrido ni convertir una nueva propuesta en permiso implícito.

### Entradas y salidas para no perder lo acordado

«Usa el presupuesto que dijimos» obliga a buscar e interpretar una conversación. Declarar el presupuesto como entrada de una tarea y enlazarlo con tu respuesta deja claro qué dato debe recibir. Las salidas obligatorias indican qué debe entregar un paso para habilitar al siguiente. Hyperion valida su presencia y tipo según el contrato; no determina si el presupuesto es sensato o si el contenido es correcto.

El beneficio es concreto: la siguiente fase recibe datos identificables y puedes revisar qué se usó. El contexto compartido ayuda a comprender la actividad, pero no sustituye las entradas requeridas. La [guía de uso](./usar-el-flujo) muestra cómo consultar esos datos.

### Decisiones explícitas para conservar tu intervención

Un «sigo con ello» del agente no aclara si ya autorizaste el paso siguiente. Una aprobación separada hace visible qué revisas y qué permitirá tu respuesta. Las preguntas humanas incluyen contexto y la acción posterior; cuando las opciones son conocidas, pueden presentarse como opciones concretas. La persona responde en el canvas. El agente no puede aprobar por ella y el silencio no cuenta como consentimiento.

### Evidencia vinculada al paso para poder revisar

«Terminado» aporta poco si no puedes consultar el resultado. Los logs explican acciones y observaciones públicas; las salidas guardan datos; los artefactos permiten abrir entregables registrados y asociarlos con el intento que los produjo. Si se reintenta un paso, el historial anterior permanece. Esto ayuda a examinar qué cambió y evita confundir una intención con un resultado comunicado.

### Estado guardado para retomar con contexto

Una pausa puede durar más que un turno de chat. Hyperion guarda el proceso para que el agente vuelva a leer decisiones, resultados y trabajo elegible desde el enlace o identificador del flujo. No hace falta reconstruir todo desde la memoria del hilo. Guardar ese estado y conseguir que una aplicación de IA vuelva a ejecutar son capacidades diferentes; la conexión disponible determina cómo se retoma.

## Quién hace qué

- **El modelo, dentro del agente**, interpreta el objetivo y propone cómo abordarlo. El agente usa sus herramientas para realizar el trabajo y comunica resultados.
- **Las herramientas** permiten leer, buscar, editar o actuar según los permisos del entorno. Conectar herramientas, por ejemplo mediante MCP, no define por sí mismo el proceso ni sus aprobaciones.
- **Hyperion** valida y conserva el proceso registrado: dependencias, datos, estados, decisiones e historial. No es el modelo que redacta tu propuesta ni el ejecutor de todas las herramientas.
- **Tú** aportas lo que falta, revisas resultados y tomas las decisiones humanas. El proceso debe mostrar qué requiere tu atención y qué ocurrirá después.

Esta separación permite usar un contrato de proceso independiente del proveedor. No significa que todas las aplicaciones tengan las mismas capacidades o permisos: consulta las [integraciones](./integraciones) para elegir una conexión adecuada.

## Tú en el bucle

Participar no debería exigir vigilar cada llamada a una herramienta. El proceso sitúa tu intervención donde hace falta: aportar información, valorar una propuesta o autorizar el siguiente paso. Mientras una aprobación está pendiente, el trabajo que depende de ella permanece bloqueado; otras tareas independientes pueden seguir siendo elegibles.

<LandscapeLoop />

## Un ejemplo: preparar una propuesta para un taller

Imagina que pides: «Usa Hyperion para preparar una propuesta de taller para mi equipo. Quiero revisar el borrador antes de que prepares la versión final». Es un ejemplo de trabajo con documentos; no presupone enviar invitaciones ni reservar nada.

1. **Concretar lo necesario.** El agente crea el flujo con la petición original. Si faltan duración, público o presupuesto, los pide en un paso humano del canvas. Tus respuestas se convierten en entradas del trabajo posterior.
2. **Preparar el borrador.** Con esos datos, el agente realiza el trabajo mediante sus herramientas. Registra las fuentes consultadas, los supuestos pendientes y el borrador como entregable. Hyperion muestra lo que el agente comunica.
3. **Revisar antes de avanzar.** Abres el borrador desde su paso. La aprobación explica que aceptarlo habilitará preparar la versión final. Mientras decides, ese paso final sigue bloqueado. Si rechazas la propuesta, el flujo queda rechazado; no se fabrica una aprobación ni se envía nada.
4. **Volver después de una pausa.** Puedes decidir más tarde. Si el chat ya está inactivo, tu respuesta sigue guardada: vuelves al chat con la continuación del flujo para que el agente lea el estado. No hace falta repetir el presupuesto ni fingir que el agente trabajó durante la espera.
5. **Terminar con un resultado revisable.** Tras tu aprobación y con el agente activo, este prepara y registra la versión final. Puedes comparar el resultado con el borrador aprobado. El objetivo termina con ese documento; enviarlo requeriría una petición y un trabajo explícitos.

La utilidad aparece en cada traspaso: los datos alimentan el borrador, el borrador informa tu decisión y la decisión habilita el trabajo siguiente. No necesitas diseñar ese contrato técnico: el agente lo propone a partir de tu petición.

## Qué garantiza el registro y cuáles son sus límites

Hyperion valida las operaciones que recibe conforme al proceso registrado. No es un sandbox del agente: no puede impedir que un programa actúe fuera del protocolo. Los permisos del entorno y la cooperación del agente siguen siendo necesarios.

La evidencia contiene solo lo que se envía. Hyperion no observa automáticamente todas las herramientas ni verifica la verdad de cada afirmación. Un archivo adjunto permite revisar un resultado, pero su existencia no prueba que sea correcto. Un estado «en curso» o una animación tampoco certifican que el agente siga activo.

MCP no despierta cualquier sesión de chat. Una espera cooperativa puede recibir tu decisión mientras permanece abierta; después de cerrar el turno, retomar automáticamente requiere un conector real y capacidades de la aplicación. Consulta [pausa y reanudación](./reanudacion) y los [límites actuales](../referencia/limites) para distinguir estado conservado de ejecución disponible.

## Cuándo aporta valor

Hyperion ayuda cuando hay varias fases, datos que deben pasar entre tareas, resultados que revisar o decisiones que condicionan lo siguiente. También cuando quieres volver más tarde y entender dónde quedó el trabajo. El mapa merece la pena si reduce el esfuerzo de coordinar y revisar.

Una pregunta breve, una traducción puntual o explorar una idea pueden resolverse en el chat habitual de tu IA, sin invocar Hyperion. No necesitan un flujo solo por usar IA. Hyperion cobra sentido cuando el objetivo requiere un recorrido que quieras ver y guiar.

<div class="landscape-cta">

[Empieza con tu primer flujo](./primeros-pasos){.landscape-cta-primary}
[Descargar Hyperion](/#descarga-hyperion){.landscape-cta-secondary}

</div>
