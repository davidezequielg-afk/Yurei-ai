# Yurei

Asistente de voz de escritorio de **código abierto** (MIT), inspirado en la categoría de asistentes como Hitodama AI. Usa tu propia API key de Google Gemini: se guarda solo en tu PC y las peticiones van directo a Google.

> Proyecto independiente: no usa código, arte ni marca de Hitodama ni está afiliado a Google.

## Funciones

| Función | Cómo se usa |
|---|---|
| **Conversación manos libres** | `Ctrl+Shift+Espacio` abre la charla: habla, y al hacer una pausa (~1,3 s) Yurei te entiende y responde. La charla sigue abierta unos segundos (20 por defecto) sin repetir el nombre; vuelve a pulsar el atajo para cerrarla |
| **Palabra de activación** | Opcional (Alma → *Escuchar siempre mi nombre*): di "Yurei, abre YouTube" sin tocar el teclado. El nombre es el de la pestaña *Alma* |
| **Voz natural** | Respuestas con el TTS de Gemini (30 voces expresivas: Kore, Puck, Charon…), por frases para empezar a hablar cuanto antes; si falla, usa la voz del sistema |
| **Charla fluida** | Si la respuesta tarda, Yurei dice una frase corta con su misma voz ("A ver…", "Un segundo…") y otra si se alarga ("Sigo en ello"). Los audios se generan una sola vez y se guardan en disco; las frases se pueden cambiar o desactivar en Ajustes |
| **Dictado** | `Ctrl+Alt+D` para empezar, otra vez para terminar; el texto limpio (sin muletillas, con autocorrecciones) se pega en la ventana activa |
| **Circle to Ask** | `Ctrl+Shift+C`, rodea algo en pantalla y pregunta en voz alta |
| **To-do por voz** | "Añade comprar leche", "marca leche como hecha" (pestaña *Hoy*) |
| **Tareas programadas** | "Mañana a las 9 busca el clima en Google" |
| **Rutinas** | "Todos los días laborales a las 8:30 abre Spotify" |
| **Búsqueda por sitio** | YouTube, Google, Wikipedia, GitHub, Amazon, Spotify, Maps, Reddit |
| **Control del PC** | Abrir apps/URLs, volumen, bloquear/suspender/reiniciar/apagar (con confirmación) |
| **Isla en pantalla** | Notch mínimo que solo se mueve con la voz. Al hacer clic se despliega un panel de 3 widgets fijos: icono de Yurei (tócalo para hablar), hora y pendientes |
| **Widgets intercambiables** | El panel tiene 3 lugares fijos (izquierda, centro, derecha) y cada uno muestra el widget que elijas: Yurei, hora y fecha, pendientes, clima, próximas tareas, estado del PC, calendario o batería. Cámbialos por voz ("pon el clima a la derecha") o en Ajustes. El icono de Yurei no se puede quitar, pero sí mover |
| **Música y video** | Detecta lo que suena en el PC (Spotify, YouTube en el navegador, etc.) y lo controlas por voz ("pausa", "siguiente", "retrocede 10 segundos", "sube el volumen") o desde los widgets *Reproduciendo* y *Volumen*. Solo Windows |
| **Mis apps** | Widget con 4 accesos a apps o webs. Cada lugar vacío tiene un **+** que abre un selector con **179 sugeridas por categorías** (mensajería, redes, navegadores, música, streaming, productividad, IA, desarrollo, juegos, compras, finanzas, viajes, noticias, diseño, aprendizaje, salud, utilidades y tecnología; con su logo oficial) y tus apps instaladas; si una sugerida no está instalada se usa su versión web. También por voz: "pon WhatsApp en mis apps". Los iconos de las webs se piden a Google por el dominio y se guardan en disco |
| **Apariencia** | Tema como el sistema (claro/oscuro, color de acento y transparencia de Windows), claro, oscuro o personalizado con tus colores; transparencia opcional. Se ve al instante en Ajustes |
| **Personalización** | Ventana de Ajustes (⚙️ del panel): API key, nombre (*alma*), personalidad, voz y habilidades extra |
| **Operación desatendida** | Las tareas y rutinas se ejecutan solas y notifican lo que hicieron |

## Requisitos

- Windows 10/11 (la interfaz arranca en otros SO, pero control de energía, volumen, lanzador y pegado solo funcionan en Windows).
- Node.js 18+.
- API key gratuita de [Google AI Studio](https://aistudio.google.com/apikey) (en la UE/Reino Unido/Suiza Google exige una key con facturación; en algunos países la API de Gemini no está disponible).

## Uso

```bash
npm install
npm start
```

### Instalador (.exe)

Descárgalo desde la sección **Releases** del repositorio, o genéralo tú:

```bash
npm run dist   # crea dist/Yurei-Setup-<versión>.exe (hazlo en Windows)
```

El workflow `Build Windows installer` lo compila en GitHub Actions: al subir un tag `v*` (p. ej. `git tag v0.1.0 && git push --tags`) publica el instalador en Releases; también se puede lanzar a mano desde la pestaña *Actions* y bajar el artefacto. El instalador no está firmado, así que Windows SmartScreen mostrará un aviso la primera vez.

1. Al abrir por primera vez se abre la ventana de **Ajustes**: pega tu API key y pulsa Guardar (después, ⚙️ en el panel).
2. Pulsa `Ctrl+Shift+Espacio` y habla.

```bash
npm test   # pruebas de la lógica central (sin Electron ni red)
```

## Cerrar la app

Yurei vive como un notch, sin ventana que cerrar. Usa el **icono de la bandeja del sistema** (junto al reloj): clic para abrir Ajustes, clic derecho → *Salir de Yurei*.

## Arquitectura

```
main.js            proceso principal: isla, atajos globales, overlay de captura, IPC
preload.js         puente seguro (contextIsolation) hacia el renderer
src/gemini.js      cliente REST de Gemini + bucle de function calling + transcripción
src/assistant.js   prompt del sistema (alma/personalidad/habilidades) e historial
src/tools.js       herramientas que Gemini puede invocar
src/scheduler.js   tareas programadas y rutinas
src/system.js      integración con Windows (apps, volumen, energía, pegado, stats)
src/store.js       ajustes y datos en JSON dentro de userData
renderer/          UI de la isla, grabación WAV 16 kHz, overlay de Circle to Ask
```

> Yurei es **solo por voz**: no hay chat de texto. El único teclado que se usa es el de la ventana de Ajustes.

## Modelos

Por defecto usa `gemini-3.5-flash-lite` para entender y actuar, y `gemini-3.8-flash-tts` para la voz (no hay TTS de la serie 3.5). Ambos se cambian en **Alma** (modelo) o en `yurei.json` (`ttsModel`). Para respuestas más finas prueba `gemini-3.8-flash`. Los modelos 2.5 ya solo se sirven a cuentas que los usaron antes, así que las instalaciones antiguas se migran solas. Lista vigente: <https://ai.google.dev/gemini-api/docs/models>.

## Widgets

Catálogo en `src/widgets.js` (reglas de los lugares y lógica de clima/agenda) y `renderer/app.js` (`WIDGETS`). Para añadir uno nuevo: agrégalo al `CATALOG` y define su `build`/`update` en `WIDGETS`. El clima usa [Open-Meteo](https://open-meteo.com/) y no necesita API key; solo se envía el nombre de la ciudad.

## Créditos de los logos

Los logos de las apps sugeridas vienen de [Simple Icons](https://simpleicons.org) (licencia CC0-1.0) y van incluidos en `renderer/brandicons.js`, sin depender de internet. Las marcas y logos pertenecen a sus dueños y se usan solo para identificar cada app. Para regenerarlos o añadir otros: `npm i --no-save simple-icons && node scripts/build-suggestions.js` (la lista de las 179 apps sugeridas está en ese script). Las apps instaladas usan su icono real de Windows.

## Privacidad: qué sale de tu PC

| Destino | Qué se envía | Cuándo |
|---|---|---|
| **Google Gemini** | Tu voz (audio) o texto, la captura que tú recortas con *Circle to Ask*, los resultados de las acciones y el texto a pronunciar | Solo cuando hablas, dictas o preguntas. Con la palabra de activación (desactivada por defecto) también los fragmentos con voz que oye |
| **Open-Meteo** | Solo el nombre de tu ciudad | Si el widget de clima está puesto |
| **Google (iconos)** | El dominio de las webs que añades a *Mis apps* | Solo si activas "descargar iconos" (desactivado por defecto) |

Nada más: **sin telemetría, sin analíticas, sin cuentas, sin actualizaciones automáticas**. Las ventanas de la app ni siquiera pueden hacer peticiones de red; todo sale desde un único proceso y a destinos fijos.

Lo tuyo vive solo en tu equipo (ajustes, pendientes, tareas y rutinas; la API key, cifrada) y puedes borrarlo todo desde Ajustes → *Borrar todos mis datos*.

> Sobre el uso que hace Google de lo que le envías: depende de los términos del API de Gemini y del tipo de clave (gratuita o con facturación). Revisa sus términos vigentes antes de enviar información sensible.

## Seguridad

Resumen: interfaz aislada y sin Node, puente interno solo para páginas locales, entradas validadas con lista blanca, sin red en las ventanas, permisos mínimos, apertura de apps sin intérprete de comandos, confirmación del sistema para apagar/reiniciar/suspender, clave cifrada con Windows, ejecutable con fusibles, cero dependencias dentro de la app y compilación con versiones y acciones fijadas.

El detalle, cómo se comprueba cada medida, los **límites conocidos** y cómo avisar de una vulnerabilidad están en [SECURITY.md](SECURITY.md).

## Limitaciones conocidas

- La palabra de activación no es local: con el micrófono abierto, cada fragmento con voz se envía a Gemini para comprobar si dijiste el nombre. Consume cuota y envía a Google lo que se hable cerca; por eso está desactivada por defecto.
- La detección de fin de frase es por volumen: en un sitio ruidoso puede cortar tarde o pronto.
- Mantener pulsado para hablar (como Hitodama) requeriría un componente nativo; aquí los atajos alternan iniciar/detener.
- Faltan el test de velocidad de red, los fondos de pantalla y los interruptores de Wi-Fi/Bluetooth: contribuciones bienvenidas.
- Las partes propias de Windows (cifrado de la clave, volumen y reproductores) no se han ejecutado en un Windows real en las pruebas automáticas; el resto sí se ha probado ejecutando Electron.

## Licencia

MIT
