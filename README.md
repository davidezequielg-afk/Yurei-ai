# Yurei

Asistente de voz de escritorio de **código abierto** (MIT), inspirado en la categoría de asistentes como Hitodama AI. Usa tu propia API key de Google Gemini: se guarda solo en tu PC y las peticiones van directo a Google.

> Proyecto independiente: no usa código, arte ni marca de Hitodama ni está afiliado a Google.

## Funciones

| Función | Cómo se usa |
|---|---|
| **Conversación manos libres** | `Ctrl+Shift+Espacio` abre la charla: habla, y al hacer una pausa (~1,3 s) Yurei te entiende y responde. La charla sigue abierta unos segundos (20 por defecto) sin repetir el nombre; vuelve a pulsar el atajo para cerrarla |
| **Palabra de activación** | Opcional (Ajustes → Voz → *Responder al saludo o a mi nombre*): di "hola, ¿cómo estás?" o "Yurei, abre YouTube" sin tocar el teclado. Si la charla arranca con un saludo, esa respuesta va sin frases de relleno y después la charla sigue sola |
| **Interrumpirla** | Si le hablas encima mientras responde, se calla y te escucha (se puede apagar si el eco de los parlantes la corta) |
| **Memoria** | Recuerda lo que le cuentas de ti ("me llamo…", "me gusta…") y lo usa en otras charlas. Se ve y se borra en Ajustes → Privacidad; vive solo en tu equipo |
| **Saludo según la hora** | "Buen día", "buenas tardes" o "buenas noches", con tu nombre si lo sabe (y un bostezo de madrugada) |
| **Portapapeles** | "Resume lo que copié", "corrige este texto", "tradúcelo": lee el portapapeles solo cuando se lo pides y puede copiar el resultado |
| **Traductor en vivo** | "Traduce al inglés lo que diga": repite traducida cada frase hasta que digas "basta" |
| **Temporizador y pomodoro** | "Pon un temporizador de 10 minutos para los fideos", "empecemos un pomodoro": un anillo alrededor de la carita muestra el tiempo y al terminar suena una campanita y avisa en voz alta |
| **No molestar** | Por voz o desde la bandeja: deja de escuchar el saludo y calla los avisos; la carita se pone auriculares |
| **Modos** | "Modo gamer", "modo estudio", "modo cine": abren sus apps y ajustan volumen, música, pomodoro y no molestar. Se crean y editan en Ajustes → Modos; "modo normal" lo deshace |
| **Carita con vida** | Un fantasmita que respira, parpadea, cambia de gesto al escuchar, pensar y hablar, muestra emociones (feliz, tierna, sorprendida, triste), se duerme si no la usas y se le pueden poner accesorios (gorrito, lentes, moño, corona, flor) |
| **Voz natural** | Respuestas con el TTS de Gemini (30 voces expresivas: Kore, Puck, Charon…), por frases para empezar a hablar cuanto antes; si falla, usa la voz del sistema |
| **Charla fluida** | Si la respuesta tarda, Yurei dice una frase corta con su misma voz ("A ver…", "Un segundo…") y otra si se alarga ("Sigo en ello"). Los audios se generan una sola vez y se guardan en disco; las frases se pueden cambiar o desactivar en Ajustes |
| **Dictado** | `Ctrl+Alt+D` para empezar, otra vez para terminar; el texto limpio (sin muletillas, con autocorrecciones) se pega en la ventana activa |
| **Circle to Ask** | `Ctrl+Shift+C`, rodea algo en pantalla y pregunta en voz alta |
| **To-do por voz** | "Añade comprar leche", "marca leche como hecha" (pestaña *Hoy*) |
| **Tareas programadas** | "Mañana a las 9 busca el clima en Google" |
| **Rutinas** | "Todos los días laborales a las 8:30 abre Spotify" |
| **Búsqueda por sitio** | YouTube, Google, Wikipedia, GitHub, Amazon, Spotify, Maps, Reddit |
| **Control del PC** | Abrir apps/URLs, volumen, bloquear/suspender/reiniciar/apagar (con confirmación) |
| **Isla en pantalla** | Notch mínimo que solo se mueve con la voz. Al **pasar el ratón por encima** (sin clic) se despliega un panel de 3 widgets fijos: icono de Yurei (tócalo para hablar), hora y pendientes |
| **Widgets intercambiables** | El panel tiene 3 lugares fijos (izquierda, centro, derecha) y cada uno muestra el widget que elijas: Yurei, hora y fecha, pendientes, clima, próximas tareas, estado del PC, calendario o batería. Cámbialos por voz ("pon el clima a la derecha") o en Ajustes. El icono de Yurei no se puede quitar, pero sí mover |
| **Música y video** | Detecta lo que suena en el PC (Spotify, YouTube en el navegador, etc.) y lo controlas por voz ("pausa", "siguiente", "retrocede 10 segundos", "sube el volumen") o desde los widgets *Reproduciendo* y *Volumen*. Solo Windows |
| **Mis apps** | Widget con 4 accesos a apps o webs. Cada lugar vacío tiene un **+** que abre un selector con **179 sugeridas por categorías** (mensajería, redes, navegadores, música, streaming, productividad, IA, desarrollo, juegos, compras, finanzas, viajes, noticias, diseño, aprendizaje, salud, utilidades y tecnología; con su logo oficial) y tus apps instaladas; si una sugerida no está instalada se usa su versión web. También por voz: "pon WhatsApp en mis apps". Los iconos de las webs se piden a Google por el dominio y se guardan en disco |
| **Apariencia** | Tema como el sistema (claro/oscuro, color de acento y transparencia de Windows), claro, oscuro o personalizado con tus colores; transparencia opcional. Se ve al instante en Ajustes |
| **Cualquier IA** | Ajustes → General → *Cerebro*: Gemini (gratis, por defecto), Claude (SDK oficial de Anthropic) o cualquier servicio compatible con OpenAI: OpenAI, OmniRoute, OpenRouter, Groq, DeepSeek, Mistral, Grok, Ollama, LM Studio u otro. Botón para probar la conexión. Para oír y hablar usa Gemini si tienes su clave, la transcripción y la voz del propio servicio, o la voz de Windows |
| **Abrir con Windows** | Arranca sola al prender la PC (se puede apagar) |
| **Recordatorios hablados** | "Recuérdame en 20 minutos sacar la ropa", "mañana a las 9 llamar al médico": a la hora suena una campanita y te lo dice. Si la PC estaba apagada, avisa al volver |
| **¿Qué tengo hoy?** | Resumen hablado: clima, pendientes, lo programado, recordatorios, concentración y, solo en notebooks, la batería. Opcional: que te lo cuente sola la primera vez que abres la PC a la mañana |
| **Léeme esto** | Lee en voz alta, completo, el texto que copiaste |
| **Notas rápidas** | "Anota que el código del wifi es…"; widget *Notas* en el panel |
| **Brillo y luz nocturna** | "Baja el brillo" en notebooks; en una PC de escritorio explica que se usa el monitor. Abre la configuración de luz nocturna |
| **Buscar archivos** | "Abre el PDF del contrato", "¿dónde guardé la foto de ayer?": busca en Escritorio, Documentos, Descargas, Imágenes, Videos y Música |
| **Velocidad de internet** | "¿Qué tal anda internet?": bajada y latencia (servidor de prueba de Cloudflare, solo al pedirlo) |
| **Juegos por voz** | Trivia, adivinanzas, piedra papel o tijera, dados… con sorteos realmente al azar |
| **Pausas activas** | Cada 30 min a 2 h de uso real sugiere estirarte, tomar agua o mirar lejos (se puede apagar) |
| **Concentración** | Pomodoros y minutos de cada día; widget con la semana |
| **Ojitos que siguen al mouse** | Cuando el mouse pasa cerca del notch, la carita lo mira |
| **Disfraces y reacciones** | Calabaza en Halloween, gorro navideño en diciembre y gorrito en tu cumpleaños. En notebooks se alegra al enchufar el cargador y se preocupa con poca batería; en PC y notebook se sorprende si la CPU está al máximo |
| **Mantener apretado para hablar** | Elige una tecla (Ctrl o Alt derechos, F8, F9): mientras la aprietas te escucha. Solo mira esa tecla |
| **Atajos configurables** | Cambia los atajos de hablar, dictado y rodear en Ajustes → Voz |
| **Personalización** | Ventana de Ajustes (⚙️ del panel) con pestañas y guardado automático: API key, nombre, personalidad, voz (con botón para probarla), habilidades extra, idioma (español o inglés) |
| **Bienvenida** | La primera vez, una guía de 5 pasos: qué hace, API key con comprobación, prueba de micrófono y elegir voz |
| **Actualizaciones** | Busca versiones nuevas en GitHub (se puede apagar), baja el instalador, verifica su SHA-256 y lo instala con un toque |
| **Uso de hoy** | Cuántos pedidos se hicieron hoy a Gemini y, si se llegó al límite gratis, a qué hora |
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
| **Google Gemini** | Tu voz (audio) o texto, la captura que tú recortas con *Circle to Ask*, los resultados de las acciones y el texto a pronunciar | Solo cuando hablas, dictas o preguntas. Con la palabra de activación (desactivada por defecto) también los fragmentos con voz que oye. Si eliges otro cerebro, Gemini solo se usa para oír o hablar si así lo configuras |
| **La IA que elijas como cerebro** (Anthropic, OpenAI, OmniRoute, OpenRouter, Groq, Ollama…) | Lo mismo que a Gemini: tu pedido en texto (o tu voz, si también transcribe), la captura y los resultados de las acciones | Solo si la eliges en Ajustes → Cerebro. Con OmniRoute, Ollama o LM Studio la petición va a un programa en tu propia PC, que a su vez puede reenviarla a los proveedores que conectes ahí |
| **Open-Meteo** | Solo el nombre de tu ciudad | Si el widget de clima está puesto |
| **Google (iconos)** | El dominio de las webs que añades a *Mis apps* | Solo si activas "descargar iconos" (desactivado por defecto) |
| **Cloudflare** | Nada tuyo: se baja un archivo de prueba para medir la velocidad | Solo cuando pides la prueba de velocidad |
| **GitHub** | Nada tuyo: solo se pide la información del último release (y el instalador si decides actualizar) | Al abrir y cada 6 horas, si "buscar actualizaciones" está activado |

Nada más: **sin telemetría, sin analíticas, sin cuentas**. Las ventanas de la app ni siquiera pueden hacer peticiones de red; todo sale desde un único proceso y a destinos fijos.

Lo tuyo vive solo en tu equipo (ajustes, pendientes, tareas y rutinas; la API key, cifrada) y puedes borrarlo todo desde Ajustes → *Borrar todos mis datos*.

> Sobre el uso que hace Google de lo que le envías: depende de los términos del API de Gemini y del tipo de clave (gratuita o con facturación). Revisa sus términos vigentes antes de enviar información sensible.

## Usar otra IA (Claude, OmniRoute, Ollama…)

1. Ajustes → General → **Cerebro**: elige la IA. Se completan solos la dirección y un modelo sugerido (puedes cambiarlo).
2. Pega la clave del servicio (no hace falta para OmniRoute, Ollama o LM Studio en tu PC) y toca **Probar conexión**.
3. **Oír y hablar:** Claude no entiende audio ni genera voz, así que con Claude Yurei usa tu clave de Gemini (gratis) para oírte y hablarte; sin ella, habla con la voz de Windows. Los servicios compatibles con OpenAI pueden oír con su transcripción (Whisper) y hablar con su voz si los tienen.
4. **OmniRoute:** instálalo y ábrelo en tu PC (queda en `http://localhost:20128/v1`). Cambia la contraseña del panel (por defecto `CHANGEME`), haz que solo escuche en tu PC (`OMNIROUTE_SERVER_HOST=127.0.0.1`) y conecta ahí tus proveedores. Usar suscripciones mediante inicio de sesión puede ir contra los términos de esos servicios.

La clave del cerebro se guarda cifrada como la de Gemini y nunca llega a las ventanas. Las direcciones tienen que ser `https`, salvo las de tu propia PC.

## Seguridad

Resumen: interfaz aislada y sin Node, puente interno solo para páginas locales, entradas validadas con lista blanca, sin red en las ventanas, permisos mínimos, apertura de apps sin intérprete de comandos, confirmación del sistema para apagar/reiniciar/suspender, clave cifrada con Windows, ejecutable con fusibles, cero dependencias dentro de la app y compilación con versiones y acciones fijadas.

El detalle, cómo se comprueba cada medida, los **límites conocidos** y cómo avisar de una vulnerabilidad están en [SECURITY.md](SECURITY.md).

## Limitaciones conocidas

- La palabra de activación no es local: con el micrófono abierto, cada fragmento con voz se envía a Gemini para comprobar si dijiste el nombre. Consume cuota y envía a Google lo que se hable cerca; por eso está desactivada por defecto.
- La detección de fin de frase es por volumen: en un sitio ruidoso puede cortar tarde o pronto.
- Faltan los fondos de pantalla y los interruptores de Wi-Fi/Bluetooth: contribuciones bienvenidas.
- La luz nocturna de Windows no se puede encender desde otra app: Yurei abre su configuración.
- Las partes propias de Windows (cifrado de la clave, volumen y reproductores) no se han ejecutado en un Windows real en las pruebas automáticas; el resto sí se ha probado ejecutando Electron.

## Licencia

MIT
