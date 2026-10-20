# Yurei

Asistente de voz de escritorio de **código abierto** (MIT), inspirado en la categoría de asistentes como Hitodama AI. Usa tu propia API key de Google Gemini: se guarda solo en tu PC y las peticiones van directo a Google.

> Proyecto independiente: no usa código, arte ni marca de Hitodama ni está afiliado a Google.

## Funciones

| Función | Cómo se usa |
|---|---|
| **Hablar con el asistente** | `Ctrl+Shift+Espacio` para empezar a grabar, otra vez para enviar |
| **Dictado** | `Ctrl+Alt+D` para empezar, otra vez para terminar; el texto limpio (sin muletillas, con autocorrecciones) se pega en la ventana activa |
| **Circle to Ask** | `Ctrl+Shift+C`, rodea algo en pantalla y pregunta en voz alta |
| **To-do por voz** | "Añade comprar leche", "marca leche como hecha" (pestaña *Hoy*) |
| **Tareas programadas** | "Mañana a las 9 busca el clima en Google" |
| **Rutinas** | "Todos los días laborales a las 8:30 abre Spotify" |
| **Búsqueda por sitio** | YouTube, Google, Wikipedia, GitHub, Amazon, Spotify, Maps, Reddit |
| **Control del PC** | Abrir apps/URLs, volumen, bloquear/suspender/reiniciar/apagar (con confirmación) |
| **Isla en pantalla** | Notch superior que se expande: Chat, Hoy, Stats, Portapapeles, Apps, Alma, Energía |
| **Personalización** | *Alma* (nombre), personalidad, voz y habilidades extra |
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

1. Pulsa la flecha de la isla → pestaña **Alma** → pega tu API key → Guardar.
2. Pulsa `Ctrl+Shift+Espacio` y habla.

```bash
npm test   # pruebas de la lógica central (sin Electron ni red)
```

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

## Seguridad

- La API key nunca sale de tu PC salvo hacia `generativelanguage.googleapis.com`.
- Solo se aceptan URLs `http/https`; los nombres de app se validan antes de lanzarlos.
- Apagar/reiniciar/suspender/bloquear exigen `confirmed=true`, y el modelo tiene instrucción de preguntar antes.
- Las tareas desatendidas se limitan a abrir apps/URLs/búsquedas.

## Limitaciones conocidas

- Mantener pulsado (push-to-talk) requiere hooks nativos; aquí los atajos alternan iniciar/detener.
- El control del volumen usa teclas multimedia (pasos de 2 %).
- Sin pestañas de clima, calendario, velocidad de red, música ni fondos de pantalla todavía: contribuciones bienvenidas.
- No se ha probado el flujo de Electron en una máquina Windows real desde el entorno de desarrollo; se validó la lógica con tests.

## Licencia

MIT
