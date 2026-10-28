# Alcance y límites

## Disponible

Canvas vertical u horizontal, trabajos y pasos, decisiones humanas, entradas y salidas tipadas, logs enviados por el agente, reintentos y revisión del trabajo futuro. Integraciones locales mediante MCP o skill; Desktop incluye su runtime.

El núcleo 0.5 incluye un contrato de pausa persistente y un worker independiente del harness. Los conectores nativos que reactivan conversaciones aún deben implementarse y certificarse; [consulta su alcance](../guia/reanudacion.md).

El perfil `bpmn-lite` admite inicio, fin y compuertas exclusivas, inclusivas y paralelas con divisiones y reuniones estructuradas.

## Lo que aún no hace

- Despertar de forma universal un chat que terminó su turno. La espera cooperativa puede recibir respuestas durante un turno activo.
- Ejecutar herramientas por sí mismo o interceptar todas las llamadas del agente.
- Importar o exportar BPMN XML ni ofrecer BPMN completo: no hay ciclos, temporizadores, compensaciones ni mensajes entre pools.
- Ofrecer un servicio remoto multiusuario, instalación universal desde una frase o conexión entre equipos.
- Publicar cambios o completar decisiones humanas sin la intervención y autorización correspondientes.

## Distribución actual

La preview publicada `2026.10.28.0534` ofrece Mac Apple Silicon (arm64), firmado con Developer ID y notarizado por Apple, y Windows x64, sin firma de editor. Los [enlaces de descarga](../guia/primeros-pasos.md) corresponden a esa release publicada, no a una compilación pendiente.

Las nuevas compilaciones y publicaciones incluyen solo macOS arm64 y Windows x64. Ambos deben superar las pruebas nativas y del instalador empaquetado; ya no se generan paquetes nuevos para Mac Intel. La release histórica `v0.4.0-preview.1` sí incluyó Apple Silicon, Intel y Windows; sus archivos se conservan. Las pruebas nativas no certifican una conversación real en cada cliente de IA.

La documentación sigue `main`, que puede incluir cambios todavía ausentes de los instaladores publicados. Una compilación o un artefacto de CI no equivale a una nueva release disponible para actualizar la aplicación.

## Privacidad

El proceso y sus eventos se guardan en el equipo que ejecuta Hyperion. El proveedor de IA sigue aplicando sus propias condiciones al contenido que recibe. Los logs pueden contener información de tu trabajo: comparte solo lo necesario y nunca credenciales.

GitHub Pages publica esta documentación estática. No recibe ni ejecuta tus flujos, no hospeda SQLite y no sustituye la aplicación local.
