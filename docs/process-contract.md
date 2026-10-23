# Contrato de procesos Hyperion v1

Hyperion 0.2 incorpora un perfil **basado en BPMN 2.0.2**: `profile: "bpmn-lite"`. La arquitectura del producto se sigue describiendo con ArchiMate; los símbolos BPMN describen el flujo que ejecuta el motor.

## Elementos y comportamiento

| Elemento  | Símbolo                 | Ejecución                                                                                                                  |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Inicio    | Círculo de borde fino   | Activa el proceso automáticamente                                                                                          |
| Fin       | Círculo de borde grueso | Finaliza cuando llega su ruta y todo el proceso está resuelto                                                              |
| Tarea     | Caja                    | Trabajo de agente, respuesta manual o aprobación                                                                           |
| Paralela  | Rombo `+`               | Activa todas las ramas; su unión espera todas                                                                              |
| Exclusiva | Rombo `X`               | Elige la primera condición verdadera en el orden declarado; si ninguna coincide, usa la ruta por defecto                   |
| Inclusiva | Rombo `○`               | Activa todas las condiciones verdaderas; si ninguna coincide, usa la ruta por defecto. Su unión espera las ramas activadas |

Las rutas no seleccionadas pasan a `skipped` (Omitido). No pueden iniciarse mediante CLI, HTTP ni MCP. Los nodos estructurales son responsabilidad del motor: el agente no puede iniciarlos o completarlos manualmente. El estado y la selección de rutas persisten en SQLite.

Este perfil se inspira en las compuertas y eventos de [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF). No afirma conformidad con BPMN completo. Solo admite grafos acíclicos estructurados: un inicio, un fin y bloques split/join emparejados del mismo tipo. Los bloques pueden anidarse, pero no cruzarse. Cada tarea tiene una entrada y una salida de control. No hay bucles, temporizadores, mensajes entre pools, compensación, actividades multiinstancia ni importación/exportación BPMN XML. Las fases se indican mediante `phase` en las tareas; no son subprocesos BPMN independientes.

## Definir un bloque

El plan usa `dependencies` como flujos de secuencia. Una división declara sus rutas y la unión declara `splitId`:

```json
{
  "id": "decide",
  "title": "Elegir revisiones",
  "kind": "gateway",
  "dependencies": ["scope"],
  "gateway": {
    "type": "inclusive",
    "direction": "split",
    "routes": [
      {
        "target": "docs",
        "when": { "stepId": "scope", "output": "docs", "equals": true }
      },
      {
        "target": "code",
        "when": { "stepId": "scope", "output": "code", "equals": true }
      },
      { "target": "fallback" }
    ],
    "defaultTarget": "fallback"
  }
}
```

Cada ruta debe corresponder a una tarea o bloque sucesor real. La ruta por defecto no tiene condición. La compuerta paralela no tiene condiciones ni ruta por defecto. Se evalúa igualdad de un booleano, número o texto con una salida declarada de un predecesor. No se evalúa JavaScript, expresiones arbitrarias ni texto del modelo como código.

```json
{
  "id": "join",
  "title": "Reunir revisiones",
  "kind": "gateway",
  "dependencies": ["docs", "code", "fallback"],
  "gateway": { "type": "inclusive", "direction": "join", "splitId": "decide" }
}
```

El ejemplo completo está en [examples/process-review.json](../examples/process-review.json). El ejemplo [process-gateways.json](../examples/process-gateways.json) combina las tres compuertas con bloques anidados. En uso normal, el agente genera ese contrato desde la petición del usuario. Los planes anteriores, sin `profile`, conservan su semántica DAG de dependencias obligatorias.

## Entradas y salidas

Todas las tareas utilizan el mismo contrato, independientemente de su herramienta ejecutora:

| Campo         | Significado                                                        |
| ------------- | ------------------------------------------------------------------ |
| `name`        | Identificador estable del dato                                     |
| `type`        | `string`, `number`, `boolean`, `object` o `array`                  |
| `required`    | Obligatoriedad, por defecto `false`                                |
| `description` | Explicación para usuario y agente                                  |
| `source`      | Solo entradas: referencia `{stepId, output}` a una salida anterior |
| `value`       | Solo entradas: valor literal JSON, excluyente con `source`         |

Las tareas pueden añadir `phase` como etiqueta de fase. Los objetos y arrays se validan por su tipo externo; el perfil actual no valida propiedades internas mediante un JSON Schema arbitrario.

```json
{
  "id": "review",
  "title": "Revisar el proyecto",
  "kind": "agent",
  "phase": "Revisión",
  "dependencies": ["scope"],
  "inputs": [
    {
      "name": "project",
      "type": "string",
      "required": true,
      "value": "Hyperion"
    }
  ],
  "outputs": [
    {
      "name": "report",
      "type": "string",
      "required": true,
      "description": "Resumen verificable de la revisión"
    }
  ]
}
```

Los valores resueltos aparecen en `inputValues`; los resultados estructurados en `outputValues`. El motor rechaza campos de salida no declarados, tipos incorrectos y salidas obligatorias ausentes. No habilita el sucesor hasta que la tarea entregue un resultado válido. Una entrada obligatoria debe tener un origen garantizado: una salida de una rama condicional que podría omitirse debe ser opcional fuera de esa rama.

Al crear (o revisar) un plan, Hyperion normaliza el acoplamiento de datos: si una entrada `required: true` declara `source: { stepId, output }` y esa salida productora existe con `required` ausente o `false`, la promoción a `required: true` ocurre antes de `validateProcess`. No inventa puertos ni relaja la regla de ramas omitibles. Si la validación sigue fallando, el mensaje nombra consumidor y productor: `Required input consumer.input needs required source output producer.output`.

Al completar, el agente envía el resultado público y los datos:

```json
{
  "type": "complete",
  "stepId": "review",
  "message": "README y CONTRIBUTING revisados",
  "outputs": {
    "report": "Las instrucciones de contribución están documentadas."
  },
  "commandId": "review-complete-1"
}
```

En la CLI: `npm run hyperion -- command RUN_ID COMMAND.json`. En MCP: `hyperion_step` con `action: "complete"` y `outputs`. Para tareas manuales, la persona rellena los campos tipados del popup. Los booleanos se presentan como Sí/No; objetos y arrays como JSON. Las aprobaciones siguen siendo exclusivamente humanas.

## Logs y trazas públicas

Cada tarea tiene dos accesos independientes: **I/O** para contratos/valores y **Logs** para actividad. El icono de Logs abre un popup del nodo; el botón Actividad abre el historial del proceso completo.

El agente puede anotar un `log` mediante:

```json
{
  "type": "log",
  "stepId": "review",
  "message": "Leí CONTRIBUTING.md para comprobar los comandos de validación.",
  "trace": { "kind": "action", "tool": "read_file" },
  "commandId": "review-read-contributing"
}
```

`trace.kind` admite `summary` (resumen público de decisión), `action` u `observation`. Esta secuencia permite inspeccionar una traza al estilo ReAct. No extrae ni solicita el razonamiento privado del LLM. Solo presenta información que el agente comparte expresamente; Hyperion no intercepta automáticamente todas sus llamadas a herramientas. La secuencia de eventos registra causalidad y no debe confundirse con `run.revision`, que aumenta una vez por comando aceptado.

No registres credenciales ni datos privados innecesarios en las trazas. El contenido queda guardado como parte del flujo local.

## Trabajos y decisiones (0.4)

`jobs` es un array opcional de `{id, title, description?}`. Un paso puede declarar `jobId`. Los identificadores de trabajos son únicos, deben tener miembros y no pueden referenciarse trabajos inexistentes. El grafo contraído de trabajos debe ser acíclico: si una fase aparece otra vez después de salir de ella, divídela en dos trabajos. Los nodos estructurales también pueden pertenecer a un trabajo.

Los pasos conservan toda la semántica de ejecución e I/O. Un trabajo no acepta comandos: muestra progreso y estado derivados de sus pasos. Fallos/rechazos y decisiones pendientes tienen prioridad sobre ejecución; después vienen tareas listas y bloqueadas. Los pasos omitidos se contabilizan aparte. «Ver trabajos» contrae rutas internas; «Ver pasos» recupera los nodos y compuertas originales. Al abrir un trabajo se muestra el detalle del flujo y se centra uno de sus pasos que requiere atención.

Las tareas humanas pueden añadir:

```json
{
  "interaction": {
    "question": "¿Incluimos ejemplos de peticiones?",
    "context": "La guía se adaptará a tu elección.",
    "next": "Codex redactará la guía con el formato elegido."
  },
  "outputs": [
    {
      "name": "examples",
      "type": "boolean",
      "required": true,
      "description": "Incluir ejemplos de peticiones"
    }
  ]
}
```

`question`, `context` y `next` son obligatorios dentro de `interaction`. Se admiten solo en pasos manuales/de aprobación. `description` de cada salida se usa como etiqueta humana; su nombre/tipo se conserva en I/O. Un `submit` con salidas tipadas válidas y al menos un valor no requiere `message` redundante; el motor registra «Decisión guardada en los datos del paso». Las respuestas sin puertos siguen requiriendo texto. La validación de tipos, campos obligatorios y roles no cambia. Usa campos simples para usuarios no técnicos; no conviertas una decisión cotidiana en un formulario JSON.

Los campos nuevos son opcionales, sin valores predeterminados añadidos a planes anteriores, para preservar los recibos de idempotencia existentes.

### Ayuda para formularios humanos

Cada puerto admite metadatos opcionales `form`: `label` (etiqueta breve, hasta 160 caracteres), `hint` (ayuda, hasta 240), `placeholder` (ejemplo sin valor predeterminado, hasta 160), `trueLabel` y `falseLabel` (etiquetas de decisiones booleanas, hasta 80). No cambian el tipo ni el nombre del dato. `description` sigue siendo la etiqueta alternativa para planes anteriores.

```json
{
  "name": "count",
  "type": "number",
  "required": true,
  "description": "Número de ejemplos de la guía",
  "form": {
    "label": "¿Cuántos ejemplos necesitas?",
    "hint": "Usa 0 si prefieres una guía sin ejemplos.",
    "placeholder": "Ej. 3"
  }
}
```

Genera cada formulario desde la conversación: una pregunta principal en `interaction.question`, etiquetas concretas y ayuda solo si aclara qué escribir. No repitas instrucciones en el título, la etiqueta y el placeholder. Los ejemplos orientan; nunca son respuestas preseleccionadas. Usa `required` solo para datos necesarios; los opcionales se abren bajo demanda y no cuentan en el progreso obligatorio. El comentario de aprobación también es opcional.

## Contexto entre fases y etiquetas de rutas

`plan.context` admite un objeto JSON con claves de identificador y valores compartidos. Una entrada puede usar `contextKey: "audience"` para tomar `plan.context.audience`; el motor valida su tipo y obligatoriedad. Cada entrada elige una sola fuente: `source`, `contextKey` o `value`.

Todas las respuestas HTTP/MCP/CLI incluyen `step.availableContext`: `request`, `general` y `previous` (ID, título, resultado y salidas de antecesores completados). Es una proyección de lectura, no se envía dentro del plan ni reemplaza un contrato obligatorio. Excluye tareas futuras, ajenas y omitidas. Los trabajos agrupan tareas; cada tarea conserva su contexto y entradas. El agente debe leer este contexto antes de ejecutar, declarar las salidas que necesita la siguiente fase y pasar sus valores al completar. No copie información sensible que la actividad no necesite.

Una ruta admite `label`, por ejemplo `"Continuar con el informe"`. Sin etiqueta, una condición booleana usa `form.trueLabel` / `form.falseLabel` del campo o «Sí» / «No». La alternativa de una exclusión binaria usa el valor opuesto. Otras alternativas muestran «Otra opción». Las condiciones de ejecución permanecen sin cambios; sus identificadores técnicos no son instrucciones para la persona.

## Revisión excepcional durante una conversación

Un cambio explícito de alcance puede modificar el trabajo futuro dentro del mismo flujo mediante `revise`. Se valida el plan completo, se conserva lo ya ejecutado y se archivan ambas versiones. No se cambian compuertas resueltas ni decisiones ya presentadas; no puede haber trabajo en ejecución. El flujo queda pausado para revisión humana. Las reglas y campos están en [el protocolo](protocol.md#exceptional-plan-revision).

En el canvas, las etiquetas booleanas genéricas se dibujan como check/cruz SVG. Mantienen «Sí» y «No» como nombres accesibles y ayudas; una cruz de decisión no representa un fallo. Las etiquetas específicas conservan su texto.

### Opciones conocidas

En una salida de tipo `string`, `form.options` define un desplegable sin respuesta preseleccionada. El dominio rechaza valores fuera de la lista, también por API. Admite de 1 a 100 opciones con valores únicos y etiquetas de hasta 160 caracteres. En campos opcionales puede quitarse la elección.

```json
{
  "name": "product",
  "type": "string",
  "required": true,
  "form": {
    "label": "Producto",
    "options": [
      { "value": "idea", "label": "IntelliJ IDEA" },
      { "value": "pycharm", "label": "PyCharm" }
    ]
  }
}
```

Usa opciones cuando el conjunto es conocido, booleanos para Sí/No y texto para respuestas abiertas. Si hace falta «Otro», decláralo y añade un campo de detalle opcional. Los planes existentes conservan sus campos originales; no se infieren opciones interpretando descripciones.

## Artifacts and conversation cycles

Artifacts are immutable evidence attached to the producing agent step and attempt. Register actual files or HTTP(S) links through the artifact endpoint; do not report a local path as if it were a downloadable file. The next step's available context includes artifact metadata from completed ancestors. Required inputs/outputs still govern readiness. Retry preserves earlier artifacts, identified by attempt. Binary content stays in a separate SQLite table and does not inflate the plan or context.

A completed process remains terminal. When the user makes a new request continuing it, create a new plan with `parentRunId` outside `plan` and preserve the new text in `plan.request`. `origin` identifies the previous run and its revision; carry relevant inputs explicitly. The canvas shows a navigable end → new beginning connection. It is a conversation relationship, not a BPMN sequence edge or a loop inside the DAG. Work still in progress uses the existing guarded plan revision mechanism. See [protocol](protocol.md) for payloads, limits and authentication.
