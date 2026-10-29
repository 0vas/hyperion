# Hyperion Desktop

Electron aloja el mismo canvas del navegador y usa el mismo servicio HTTP local autenticado. El proceso del chat conserva la ejecución: Desktop presenta decisiones y resultados. El usuario elige split/escritorio en la conversación; el adaptador `open RUN_ID desktop` lanza la instalación registrada en su primer arranque.

La [preview descargable](https://github.com/0vas/hyperion/releases/tag/v2026.10.29.0417) incluye instaladores para macOS Apple Silicon (notarizado) y Windows x64.

## Desarrollo y distribución

- `npm ci` y `npm run desktop` abren el cliente de desarrollo.
- `npm run test:desktop` prueba un servicio aislado: decisión en split, reflejo en Desktop, ejecución del agente y resultado en ambos.
- `npm run desktop:dist -- --mac --arm64` genera DMG para Apple Silicon; `npm run desktop:dist -- --win --x64` genera instaladores NSIS EXE para Windows x64. Son los únicos destinos predeterminados; no se generan nuevas compilaciones Intel.
- `HYPERION_DESKTOP_EXECUTABLE=/ruta/al/ejecutable npm run test:desktop` ejecuta la prueba sobre una aplicación empaquetada.
- El workflow **Desktop installers**, manual y automático ante cambios de Desktop, adaptadores o dependencias, compila y prueba macOS arm64 y Windows x64. Ambos trabajos son obligatorios: cualquier fallo impide que el run sea publicable. Guarda artefactos descargables, pero no publica automáticamente. Los artefactos de releases históricas, incluidos los de Intel, se conservan.

Los binarios pertenecen a GitHub Releases, no al historial Git. `release/` está ignorado. Para distribución pública, configurar firma/notarización macOS y firma Windows. No se incorporan certificados al repositorio. El build local sin esas identidades es un artefacto de desarrollo.

## Límites

El renderizador tiene sandbox, aislamiento de contexto y Node deshabilitado; navegación y ventanas se limitan al origen local autenticado. Los enlaces HTTP(S) de artefactos se abren en el navegador del sistema; el renderizador sigue limitado al origen local. La aplicación empaqueta archivos sin ASAR para que su proceso Node independiente pueda servir los assets y sobrevivir al cierre de la ventana. No hay bridge IPC de filesystem expuesto al renderizador.

Si otro Hyperion (otra cuenta o instalación) ocupa el puerto predeterminado, Desktop no lo detiene: arranca este instalador en otro puerto libre de loopback, persiste esa URL en `workspace.json` y abre ahí. Si el puerto pertenece a otro programa no Hyperion o no puede recuperarse, informa con un mensaje accionable; no toma control de esa instancia. Tras una actualización, Desktop detiene solo servidores **propios** de la misma instalación que aún tienen abierta la misma carpeta de datos (zombies en otros puertos); nunca mata procesos de otra cuenta ni borra `hyperion.sqlite`. Si la carpeta sigue bloqueada, el diálogo muestra un mensaje claro en lugar de `INTERNAL`. Un `workspace.json` portable recordado se ignora al sticky-remap a `~/.hyperion` (también su puerto alterno). Para apuntar a otro servicio hay que cerrar la ventana actual. El servidor continúa al cerrar Desktop para que split y el chat conserven acceso.

Referencias de implementación: [aislamiento en Electron](https://www.electronjs.org/docs/latest/tutorial/security), [runtime Node integrado](https://www.electronjs.org/docs/latest/api/environment-variables), [DMG](https://www.electron.build/v26/docs/dmg/) y [NSIS](https://www.electron.build/docs/nsis/).

El servicio en uso (incluido un puerto alternativo de loopback) publica su ubicación local (sin tokens) en `~/.hyperion/workspace.json`, de modo que abrir Desktop desde su icono reutiliza esa instancia mientras siga viva y autenticada. Si el alterno recordado ya no responde con tus credenciales, el siguiente arranque vuelve a preferir `4317` (y solo entonces puede elegir otro puerto libre si `4317` sigue ocupado por otro Hyperion). Sin URL recordada, el valor por defecto es `4317`. Los datos del Desktop empaquetado viven en `~/.hyperion`, no en un directorio portable temporal. Los puertos personalizados también se pueden forzar mediante el adaptador, pasando URL y directorio explícitos. **Hyperion → Conectar con mi IA** abre el mismo asistente del primer arranque: Codex, Cursor y Claude Desktop reciben configuración MCP; Claude Code recibe su skill. Se usa el runtime empaquetado con `ELECTRON_RUN_AS_NODE`, sin instalar Node ni depender de CLI de proveedor. Los archivos existentes tienen respaldo y las conexiones ajenas se conservan. La configuración no equivale a una sesión MCP ya conectada: el usuario reinicia su aplicación.

Antigravity está disponible desde 0.5.1-preview.1: configura `~/.gemini/config/mcp_config.json` con el runtime incluido, respaldo y rechazo de conflictos. Esta opción no está en los instaladores publicados 0.4.0-preview.1. La prueba del runtime empaquetado incluye su identidad MCP; eso no certifica una conversación en el cliente Google.

En las fuentes de desarrollo, el inventario humano de conexiones comprueba por separado los archivos del ejecutable y del lanzador generados por esta instalación. «Configurada» solo indica coincidencia del archivo de configuración; archivos legibles no demuestran inicio MCP, una llamada correcta ni herramientas cargadas en Claude. Los archivos ausentes y los permisos insuficientes tienen resultados propios; un resultado desconocido no demuestra un fallo. La inspección no ejecuta comandos guardados, lee logs, registra credenciales ni modifica archivos. No repara la instalación automáticamente y aún no está incluida en un instalador publicado. Claude Desktop no requiere Claude Code ni instalar Node por separado. Si ya reiniciaste Claude y faltan herramientas, consulta su estado real del servidor y la ubicación que abre Edit Config; no repitas reinicios sin nueva evidencia ni compartas credenciales o logs completos.

## Firma y arranque (0.5.1-preview.1)

La preview 0.4.0 tiene una firma macOS incompleta: `codesign --verify --deep --strict` falla incluso en el DMG original. La suma SHA-256 del archivo descargado sí coincide. No debe describirse como una simple advertencia de descarga ni recomendarse desactivar Gatekeeper.

`desktop/builder.config.cjs` sella ahora las previews macOS con firma ad-hoc. CI verifica el bundle antes de probarlo y subir artefactos. Eso comprueba integridad; **no acredita un desarrollador ni sustituye la notarización de Apple**. Para distribución identificada, configurar secretos `CSC_LINK` (Developer ID Application), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID` en GitHub. Nunca incluirlos en el repositorio o en el chat. Con certificado configurado se activa hardened runtime y notarización, y CI exige `stapler validate` y `spctl --assess`. Sin esas credenciales solo se genera una preview ad-hoc; no se afirma que Gatekeeper la acepte.

Si el servicio no inicia, Desktop mantiene un diálogo con Reintentar, Ver diagnóstico, Buscar actualizaciones y Salir. El diagnóstico se guarda en la carpeta de logs de la aplicación. No borra ejecuciones ni detiene procesos ajenos; un puerto ocupado o una versión incompatible se informa explícitamente.

**Ver → Recargar** / **Forzar recarga** (y ⌘R / Ctrl+R) no usan el `role: reload` de Electron: vuelven a entrar por `ensureServer` + `openRun` + la misma recuperación del arranque en frío, para no dejar la ventana en el fondo mate sin canvas cuando el servicio está en un puerto alterno sticky. Un fallo de carga del frame principal dispara esa recuperación; no se deja una pantalla en negro silenciosa.

## Actualizaciones desde la aplicación

**Hyperion → Buscar actualizaciones…** consulta las últimas 30 releases públicas de `0vas/hyperion`, excluye borradores y elige una versión superior con instalador para el sistema y arquitectura actuales. Las versiones preview también reciben previews; una versión estable solo recibe estables. Al abrir Desktop empaquetado se hace una comprobación después del asistente inicial. Fallos de red en esa comprobación automática no interrumpen el trabajo; una comprobación manual muestra el error.

El diálogo ofrece **Actualizar y reiniciar** (opción principal), **Ahora no** y **Descargar instalador…**. Con consentimiento, **Actualizar y reiniciar** descarga el asset oficial a `userData/updates` (sin diálogo de guardado), muestra progreso, permite **Cancelar descarga** y valida tamaño y SHA-256 de GitHub antes de aplicar. Antes de aplicar marca un indicador de un solo uso para que el siguiente arranque refresque las conexiones Hyperion de _esta_ instalación (MCP stdio con `mcp-launcher`/`mcp.js` y el mismo `HYPERION_DATA_DIR`), con respaldo; no toca entradas ajenas. En macOS monta el DMG en solo lectura, comprueba `codesign --verify --deep --strict`, reemplaza este `Hyperion.app` (restaura si falla), programa `app.relaunch()` y cierra el proceso para liberar el bloqueo de instancia única antes de arrancar el binario nuevo — no se usa `open -n` mientras el proceso antiguo sigue vivo. En Windows lanza el EXE NSIS verificado con `/S --updated` y cierra la app para que los archivos puedan sustituirse. Si la aplicación falla, muestra error y ofrece **Mostrar instalador** sin corromper la app en ejecución. **Descargar instalador…** conserva el flujo de guardar en Disco y revelar el archivo. Solo se aceptan assets del repositorio oficial. El digest comprueba integridad, no notarización. La versión 0.4.0 no dispone de este menú y necesita la primera actualización manual.

La marca canónica es `docs/site/public/brand/hyperion-titan.png`; Desktop y el canvas usan copias idénticas comprobadas por `tests/desktop-brand.test.ts`. Después de cambiar la marca hay que regenerar instaladores; modificar Pages no modifica una release anterior.

## Versiones CalVer y bloqueo de macOS

Desde `2026.10.12.0638`, la identidad pública es **AAAA.MM.DD.HHMM UTC**: el minuto queda fijado al preparar la release en `src/release.json`. El canal (`preview` o `stable`) es independiente. No se renombra una release antigua ni se reutiliza su versión para binarios distintos. `npm run release:sync` actualiza la codificación de compatibilidad de npm; `desktop/release-version.cjs` genera números nativos para Apple/Windows. Esos campos técnicos no representan incrementos SemVer. Runtime, etiquetas, instaladores, menú Acerca de y web muestran CalVer.

**La 0.5.1 no entiende etiquetas CalVer: la primera migración es manual desde la web.** Las siguientes actualizaciones usan el comparador CalVer. Un canal estable no recibe previews; un fallo de red no significa estar actualizado.

El aviso «Apple could not verify Hyperion.app is free of malware» bloquea esta preview por falta de notarización; sellar con firma ad-hoc no lo elimina. Si el usuario decide confiar en su copia oficial, después de intentar abrirla puede elegir **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**, confirmar y volver a abrir. Es una excepción para esa app; no debe desactivarse Gatekeeper globalmente. [Procedimiento de Apple](https://support.apple.com/en-us/102445). No confundirlo con avisos de malware detectado o de app dañada: requieren diagnóstico.

Para generar una distribución macOS notarizada, ejecutar **Desktop installers** con `notarized=true`. El build falla si faltan credenciales Developer ID/notarización; nunca degrada silenciosamente esa solicitud a ad-hoc. Las compilaciones preview siguen disponibles, pero CI las identifica como **NOT Apple-notarized**. Sin certificado Developer ID y cuenta Apple Developer, la distribución sin este bloqueo continúa pendiente.

Para publicar archivos ya probados sin volver a compilarlos, crear primero una release **draft** con notas revisadas y `target_commitish` igual al commit del build. Ejecutar **Publish verified Desktop artifacts** con el ID de un run exitoso de **Desktop installers** en `main`. El workflow verifica procedencia y selecciona solo el DMG arm64 de `Hyperion-macos-latest` y el EXE x64 de `Hyperion-windows-latest`, ambos con la versión del commit probado. La ausencia de cualquiera impide la publicación. No incorpora instaladores Intel aunque aparezcan entre los artefactos del run; rechaza un borrador con archivos adicionales a los dos instaladores probados y su manifiesto SHA-256, sin borrar esos archivos. Sube los dos instaladores a la release draft y compara tamaño y SHA-256 remotos antes de publicarla. Rechaza releases ya públicas; no sobrescribe sus binarios. No añade notarización a los artefactos.

La web usa `docs/site/.vitepress/release.json` como registro de la última release **publicada**. Actualizarlo solo después de subir y verificar los instaladores; no anunciar un enlace antes de que exista su asset. El campo `macNotarized` solo puede ser verdadero con evidencia de notarización y validación de Gatekeeper.

## Entregables, Trabajos y recorridos enlazados (2026.10.29.0417)

Esta preview incluye español e inglés, artefactos por paso (vista previa HTML/SVG en `iframe` con `sandbox=""`, aviso inerte y toggle a código; descarga autenticada), el interruptor visible **Trabajos** en el canvas y vínculos entre un flujo completado y un nuevo recorrido. Usa un marco estándar, **Ampliar** a pantalla completa con **Volver**, notas como papel, CSV/TSV como tabla sencilla y burbujas SVG descargables para Office. No renderiza Office ni afirma WYSIWYG. **Copiar petición para el chat** es el camino de Phase 0; **Enviar** permanece oculto sin conector de envío. Los archivos permanecen asociados a su intento; la continuación conserva el historial anterior. La publicación no añade notarización.

## Interface language

`desktop/language.mjs` persists `system`, `es` or `en` in `language.json` under Electron's `userData` directory. `system` follows `app.getPreferredSystemLanguages()` with English fallback. Native menus, onboarding, recovery and update dialogs use the same catalog as the canvas (`src/i18n/en.json`; Spanish source strings).

The sandboxed preload exposes only language get/set and change notifications. Main-process handlers validate the owning window, local origin, main frame and allowed preference before writing. Browser-only use persists a separate `hyperion.language.v1` localStorage preference. No translation service receives workflow content. Raw service/tool diagnostics retain their original language.

When adding interface copy, use the translation helpers and update the English catalog. Avoid translating plan titles, field labels supplied by agents, answers, receipts or other evidence. Run the language unit/native-dialog tests and `tests/e2e/i18n.spec.ts`; the Desktop smoke test also switches languages while a human decision is unsaved.

## Sustitución del servicio al actualizar (2026.10.12.2101)

Al abrir la nueva app, el lanzador compara la versión del servicio y autentica sus credenciales. Para una versión anterior verifica el PID que escucha en loopback, su propietario y la línea de comando exacta del runtime/servidor de esta instalación. Un proceso ajeno, una instalación movida o una versión más reciente no se detienen.

Antes de reemplazar el servicio crea una copia consistente mediante SQLite `VACUUM INTO` en `<datos>/backups/before-upgrade-*.sqlite` y comprueba su integridad. Mantiene la misma base de datos y credenciales: no restaura un snapshot antiguo, reinicia tareas ni cambia decisiones. Dos lanzadores simultáneos se coordinan con un bloqueo local. Un fallo del respaldo impide detener el servicio.

En macOS/Linux usa SIGTERM para el cierre del servidor; Windows termina solo el proceso identificado y SQLite recupera las transacciones confirmadas del WAL. Los clientes pueden reconectar después del breve corte. Una tarea externa en curso permanece en su estado registrado; sus efectos no se reejecutan. La copia previa queda guardada para recuperación y no se elimina automáticamente. La sustitución del binario de Desktop es independiente: **Actualizar y reiniciar** aplica el instalador verificado tras el consentimiento.

Validación: `tests/runtime-upgrade.test.ts` cubre rechazos y bloqueo; `tests/desktop-upgrade.mjs` conserva estados, artefactos, vínculos y recibos entre procesos con versiones distintas, también con el runtime empaquetado de cada plataforma.
