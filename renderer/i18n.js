// Interfaz en inglés. El código escribe los textos en español; si el idioma es inglés, este traductor reemplaza
// los textos de la pantalla (y los que aparecen después) por su versión del diccionario. Lo que no está en el
// diccionario, como lo que escribes tú o los títulos de canciones, queda tal cual.

const I18N_EN = {
  // notch y panel
  Yurei: 'Yurei', 'Toca para hablar': 'Tap to talk', 'Te escucho': 'Listening', 'Pensando…': 'Thinking…', Hablando: 'Speaking',
  'Transcribiendo…': 'Transcribing…', Dictado: 'Dictation', '…': '…', 'Hablar con Yurei': 'Talk to Yurei', Ajustes: 'Settings',
  'Pasa el ratón para abrir · clic para cerrar': 'Hover to open · click to close', Pendientes: 'To-dos', 'Sin pendientes': 'Nothing to do',
  Próximo: 'Up next', 'Nada programado. Pídeselo a Yurei.': 'Nothing scheduled. Ask Yurei.', 'Tu PC': 'Your PC',
  'Nada reproduciéndose': 'Nothing playing', Reproduciendo: 'Playing', 'Pausar / reanudar': 'Pause / resume', Anterior: 'Previous', Siguiente: 'Next',
  'Retroceder 10 s': 'Back 10 s', 'Adelantar 10 s': 'Forward 10 s', 'Silenciar / reactivar': 'Mute / unmute', 'Modo teclas (aprox.)': 'Key mode (approx.)',
  'Sin batería': 'No battery', 'En batería': 'On battery', Cargando: 'Charging', Añadir: 'Add', 'Añadir una app': 'Add an app', Quitar: 'Remove',
  Despejado: 'Clear', 'Casi despejado': 'Mostly clear', 'Parcialmente nublado': 'Partly cloudy', Nublado: 'Cloudy', Niebla: 'Fog', Llovizna: 'Drizzle',
  Lluvia: 'Rain', Nieve: 'Snow', Chubascos: 'Showers', Tormenta: 'Storm', 'Instalando…': 'Installing…', Descanso: 'Break',
  // ajustes: general
  'Lista para charlar': 'Ready to chat', 'Falta tu API key de Gemini para empezar': 'Add your Gemini API key to start', General: 'General',
  Voz: 'Voice', Apariencia: 'Appearance', Panel: 'Panel', Modos: 'Modes', Privacidad: 'Privacy', Conexión: 'Connection',
  'Tu clave se guarda cifrada con el almacén seguro de Windows: solo tu usuario, en este equipo, puede leerla.': 'Your key is encrypted with Windows secure storage: only your user, on this PC, can read it.',
  'Este sistema no ofrece almacén seguro: la clave se guarda en un archivo sin cifrar.': 'This system has no secure storage: the key is saved in an unencrypted file.',
  'API key de Gemini': 'Gemini API key', 'Se consigue gratis en Google AI Studio.': 'Get one free at Google AI Studio.',
  'Pega tu API key de Google AI Studio': 'Paste your Google AI Studio API key', Ver: 'Show', Ocultar: 'Hide', 'Opciones avanzadas': 'Advanced options',
  Modelo: 'Model', 'Solo cámbialo si sabes cuál usar.': 'Only change it if you know which one to use.', Personalidad: 'Personality',
  'Cómo se llama y cómo te habla.': 'Its name and how it talks to you.', Nombre: 'Name', 'También es la palabra para llamarla por voz.': 'It is also the word to call it by voice.',
  'Forma de ser': 'Personality', 'Habilidades extra': 'Extra skills',
  'Una instrucción por línea, p. ej. "cuando diga modo cine, baja el volumen a 20".': 'One instruction per line, e.g. "when I say movie mode, set the volume to 20".',
  Idioma: 'Language', 'Idioma de la interfaz y de las frases de Yurei.': 'Language of the interface and Yurei\'s phrases.', Automático: 'Automatic',
  // voz y charla
  'Toca una voz y pruébala.': 'Tap a voice and try it.', '▶ Probar voz': '▶ Try voice', '▶ Probar': '▶ Try', 'Preparando…': 'Preparing…', 'Sonando…': 'Playing…',
  'Voz del sistema': 'System voice', 'Más robótica, pero no gasta cuota de Gemini.': 'More robotic, but uses no Gemini quota.', Charla: 'Conversation',
  'Cómo se da la conversación.': 'How the conversation flows.', 'Responder al saludo o a mi nombre': 'Answer when I say hi or its name',
  'Manos libres: di "hola" o su nombre y empieza a charlar. El micrófono queda abierto y los fragmentos con voz se envían a Google para detectarlo.': 'Hands-free: say "hi" or its name to start chatting. The mic stays open and voice snippets are sent to Google to detect it.',
  'Interrumpirla hablando': 'Interrupt by talking',
  'Si le hablas encima mientras responde, se calla y te escucha. Si se corta sola por el eco de los parlantes, apágalo o usa auriculares.': 'If you talk while it answers, it stops and listens. If speaker echo makes it cut itself off, turn this off or use headphones.',
  'Frases mientras piensa': 'Phrases while thinking', '"Mmm, déjame ver…" para que la charla fluya. Nunca en la respuesta a tu saludo.': '"Hmm, let me see…" so the chat flows. Never when answering your greeting.',
  'Frases propias': 'Your own phrases', 'Una por línea. Vacío = las de siempre ("A ver…", "Un segundo…").': 'One per line. Empty = the default ones ("Let\'s see…", "One second…").',
  'Tiempo de charla abierta': 'Open conversation time', 'Cuánto espera tu siguiente frase antes de dormirse.': 'How long it waits for your next sentence before going to sleep.',
  firme: 'firm', alegre: 'upbeat', informativa: 'informative', luminosa: 'bright', animada: 'excitable', juvenil: 'youthful', fresca: 'breezy', tranquila: 'easy-going',
  susurrante: 'breathy', clara: 'clear', suave: 'smooth', ronca: 'gravelly', dulce: 'soft', pareja: 'even', madura: 'mature', directa: 'forward', amigable: 'friendly',
  casual: 'casual', amable: 'gentle', vivaz: 'lively', sabia: 'knowledgeable', cálida: 'warm',
  // apariencia
  'Tu Yurei': 'Your Yurei', 'Ponle algo a la carita (mírala arriba).': 'Dress up the little face (see it above).', Nada: 'Nothing', '🎉 Gorrito': '🎉 Party hat',
  '👓 Lentes': '👓 Glasses', '🎀 Moño': '🎀 Bow', '👑 Corona': '👑 Crown', '🌸 Flor': '🌸 Flower', Tema: 'Theme', Sistema: 'System', Claro: 'Light', Oscuro: 'Dark',
  'A tu gusto': 'Custom', 'Color de acento': 'Accent color', 'Color de fondo': 'Background color', 'Otro color': 'Other color', Transparencia: 'Transparency',
  Opaco: 'Opaque', Translúcido: 'Translucent', 'Como Windows': 'Like Windows', Opacidad: 'Opacity',
  // panel
  'Lo que ves al abrir el notch': 'What you see when the notch opens', 'Elige qué va en cada uno de los tres lugares.': 'Choose what goes in each of the three spots.',
  Izquierda: 'Left', Centro: 'Center', Derecha: 'Right', Clima: 'Weather', Ciudad: 'City', 'Se actualiza cada media hora.': 'Updates every half hour.',
  'p. ej. Buenos Aires': 'e.g. London', 'Mis apps': 'My apps', 'Iconos de las webs': 'Website icons',
  'Descarga el icono de las webs que añades (consulta a Google el nombre del sitio).': 'Downloads the icon of websites you add (asks Google for the site name).',
  'Yurei (icono, toca para hablar)': 'Yurei (icon, tap to talk)', 'Hora y fecha': 'Time and date', 'Próximas tareas y rutinas': 'Upcoming tasks and routines',
  'Estado del PC (CPU y RAM)': 'PC status (CPU and RAM)', 'Calendario del mes': 'Monthly calendar', Batería: 'Battery', 'Reproduciendo (música y video)': 'Now playing (music and video)',
  Volumen: 'Volume', 'Mis apps (4 accesos)': 'My apps (4 shortcuts)', Notas: 'Notes', 'Concentración (pomodoros)': 'Focus (pomodoros)', 'Di "anota que…"': 'Say "note that…"',
  // modos
  'Abrir estas apps': 'Open these apps', 'Separadas por comas.': 'Comma separated.', 'Cambiar el volumen': 'Change the volume', Música: 'Music',
  'No tocar': 'Leave as is', Reproducir: 'Play', Pausar: 'Pause', Pomodoro: 'Pomodoro', 'Bloques de concentración con descansos.': 'Focus blocks with breaks.',
  No: 'No', 'No molestar': 'Do not disturb', '+ Nuevo modo': '+ New mode', 'p. ej. gamer': 'e.g. gaming',
  // privacidad
  'Lo que recuerda de ti': 'What it remembers about you', 'Para charlar mejor, guarda lo que le cuentas de ti. Vive solo en este equipo.': 'To chat better, it keeps what you tell it about yourself. It stays on this PC only.',
  'Todavía no recuerda nada. Cuéntale algo, p. ej. "me llamo…" o "me gusta…".': 'It doesn\'t remember anything yet. Tell it something, e.g. "my name is…" or "I like…".',
  'Olvidar todo': 'Forget everything', Olvidar: 'Forget', Olvidado: 'Forgotten', 'Olvidé todo': 'Forgot everything', 'Uso de hoy': 'Today\'s usage',
  'Pedidos que Yurei hizo a Gemini con tu clave.': 'Requests Yurei made to Gemini with your key.', preguntas: 'questions', 'respuestas habladas': 'spoken answers',
  'escuchas y dictados': 'listens and dictations', 'El plan gratis de Gemini tiene un tope diario que depende del modelo. Si se llega, Yurei te avisa y se renueva solo.': 'Gemini\'s free plan has a daily cap that depends on the model. If you hit it, Yurei tells you and it resets on its own.',
  Actualizaciones: 'Updates', 'Las versiones nuevas se bajan de GitHub y se verifica su huella antes de instalarlas.': 'New versions are downloaded from GitHub and their fingerprint is checked before installing.',
  'Buscar ahora': 'Check now', 'Buscando…': 'Checking…', 'Buscar actualizaciones solo': 'Check for updates automatically', 'Una consulta a GitHub al abrir y cada 6 horas.': 'One request to GitHub at startup and every 6 hours.',
  'Abriendo el instalador…': 'Opening the installer…', 'Volumen y música': 'Volume and music', 'Si el volumen o los controles de música no responden, esto muestra qué falla.': 'If volume or music controls don\'t respond, this shows what fails.',
  Diagnóstico: 'Diagnostics', 'Probar audio': 'Test audio', 'Probando…': 'Testing…', 'Tus datos': 'Your data', 'Todo lo tuyo vive solo en este equipo.': 'Everything of yours stays on this PC only.',
  'Borrar todo': 'Delete everything', 'Ajustes, API key, pendientes y cachés. Yurei se reinicia.': 'Settings, API key, to-dos and caches. Yurei restarts.', 'Borrar…': 'Delete…',
  'Guardado ✓': 'Saved ✓',
  // bienvenida
  Atrás: 'Back', Seguir: 'Next', Empezar: 'Start', 'Lo hago después': 'Later', '¡A charlar!': 'Let\'s chat!',
  '¡Hola! Soy tu fantasmita de escritorio 👻': 'Hi! I\'m your desktop ghost 👻', 'Vivo en el notch de arriba de tu pantalla. Me hablas y te respondo con voz.': 'I live in the notch at the top of your screen. You talk to me and I answer out loud.',
  '🎵 Pauso la música, subo el volumen o abro tus apps': '🎵 I pause music, turn up the volume or open your apps', '⏱️ Pongo temporizadores y pomodoros': '⏱️ I set timers and pomodoros',
  '📋 Resumo, corrijo o traduzco lo que copias': '📋 I summarize, fix or translate what you copy', '🧠 Recuerdo lo que me cuentas de ti (solo en este equipo)': '🧠 I remember what you tell me about yourself (on this PC only)',
  'Tu llave para que pueda pensar': 'Your key so I can think', 'Uso Gemini de Google. La clave es gratis y se consigue en un minuto: entra con tu cuenta de Google, toca "Create API key" y cópiala.': 'I use Google\'s Gemini. The key is free and takes a minute: sign in with your Google account, tap "Create API key" and copy it.',
  'Abrir Google AI Studio ↗': 'Open Google AI Studio ↗', 'Pega aquí tu API key': 'Paste your API key here', 'Ya tienes una guardada (pega otra para cambiarla)': 'You already have one saved (paste another to change it)',
  Comprobar: 'Check', 'Comprobando…': 'Checking…', '¡Funciona! ✓': 'It works! ✓', 'Pega la clave primero.': 'Paste the key first.',
  '🔒 Se guarda cifrada en este equipo; solo tu usuario puede leerla.': '🔒 It\'s stored encrypted on this PC; only your user can read it.', 'Se guarda solo en este equipo.': 'It\'s stored on this PC only.',
  '¿Me escuchas? ¿Te escucho?': 'Can you hear me? Can I hear you?', 'Probemos tu micrófono. La barra se mueve cuando hablas.': 'Let\'s test your mic. The bar moves when you talk.',
  '🎙️ Probar micrófono': '🎙️ Test microphone', 'Toca el botón y di algo.': 'Tap the button and say something.', 'Habla un poco…': 'Say something…', '¡Te escucho perfecto! ✓': 'I hear you perfectly! ✓',
  'Elige mi voz': 'Pick my voice', 'Toca una y pruébala. Después puedes elegir entre 30 en Ajustes.': 'Tap one and try it. Later you can choose from 30 in Settings.',
  '¡Todo listo! 🎉': 'All set! 🎉', '👆 Toca la carita de arriba o pulsa Ctrl + Shift + Espacio para hablarme': '👆 Tap the face at the top or press Ctrl + Shift + Space to talk to me',
  '🖱️ Pasa el ratón por el notch para ver tu panel': '🖱️ Hover over the notch to see your panel', '🎮 Di "modo gamer" o "modo estudio" (los editas en Ajustes → Modos)': '🎮 Say "gaming mode" or "study mode" (edit them in Settings → Modes)',
  'Manos libres': 'Hands-free', 'Responder cuando digo "hola" o mi nombre': 'Answer when I say "hi" or its name',
  'El micrófono queda abierto y los fragmentos con voz se envían a Google para detectarlo.': 'The mic stays open and voice snippets are sent to Google to detect it.',
  // inicio, bienestar, teclas, vida
  Inicio: 'Startup', 'Abrir con Windows': 'Open with Windows', 'Yurei arranca sola al prender la PC.': 'Yurei starts automatically when you turn on the PC.',
  'Resumen de la mañana': 'Morning summary', 'La primera vez que abres la PC entre las 5 y las 12, te cuenta el clima, tus pendientes y lo programado.': 'The first time you open the PC between 5 and 12, it tells you the weather, your to-dos and what\'s scheduled.',
  Bienestar: 'Wellbeing', 'Cada tanto te sugiere una pausa: estirarte, tomar agua o mirar lejos. Cuenta solo el tiempo que de verdad usas la PC.': 'Every so often it suggests a break: stretch, drink water or look far away. It only counts time you actually use the PC.',
  Nunca: 'Never', '1 h': '1 h', '1 h 30': '1 h 30', '2 h': '2 h', Teclas: 'Keys', 'Mantener apretado para hablar': 'Hold to talk',
  'Mientras tengas apretada la tecla, te escucha; al soltarla, responde. Solo mira esa tecla.': 'While you hold the key it listens; when you release it, it answers. It only watches that key.',
  Apagado: 'Off', 'Ctrl der.': 'Right Ctrl', 'Alt der.': 'Right Alt', Hablar: 'Talk', 'Abre o cierra la charla.': 'Opens or closes the conversation.',
  'Escribe lo que dices en la ventana activa.': 'Types what you say in the active window.', 'Rodear y preguntar': 'Circle and ask', 'Rodea algo de la pantalla y pregunta.': 'Circle something on screen and ask.',
  'Aprieta la combinación…': 'Press the combination…', 'Vida de la carita': 'The face\'s life',
  'Tu equipo: PC de escritorio. Sin batería, así que no hay avisos de cargador ni de batería baja.': 'Your device: desktop PC. No battery, so no charger or low-battery alerts.',
  'Tu equipo: notebook. Reacciona al cargador y a la batería baja.': 'Your device: laptop. It reacts to the charger and low battery.', Reacciones: 'Reactions',
  'Se sorprende si la CPU está al máximo.': 'It gets surprised if the CPU is maxed out.', 'Se alegra al enchufar el cargador, se preocupa con poca batería y se sorprende si la CPU está al máximo.': 'It cheers when you plug in the charger, worries when the battery is low and gets surprised if the CPU is maxed out.',
  'Disfraces de temporada': 'Seasonal costumes', 'Calabaza en Halloween, gorro navideño en diciembre y gorrito de fiesta en tu cumpleaños.': 'A pumpkin on Halloween, a Santa hat in December and a party hat on your birthday.',
  'Tu cumpleaños': 'Your birthday', 'Para festejarlo ese día.': 'To celebrate that day.', Mes: 'Month', Día: 'Day', enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December',
  // cerebro
  Cerebro: 'Brain', 'Con qué IA piensa Yurei. Funciona con Gemini, Claude o cualquier servicio compatible con OpenAI (incluidos OmniRoute, Ollama y LM Studio en tu PC).': 'Which AI Yurei thinks with. Works with Gemini, Claude or any OpenAI-compatible service (including OmniRoute, Ollama and LM Studio on your PC).',
  'Usa tu API key de Gemini (arriba). Es gratis y también te escucha y te habla con voz natural.': 'Uses your Gemini API key (above). It\'s free and also listens and talks with a natural voice.',
  'Elige uno de la lista o escribe otro.': 'Pick one from the list or type another.', 'El nombre exacto del modelo en ese servicio. Puedes cambiarlo.': 'The exact model name on that service. You can change it.',
  Dirección: 'Address', 'Corre en tu PC: tiene que estar abierto mientras uses Yurei.': 'Runs on your PC: it must be open while you use Yurei.', 'La dirección del servicio (termina en /v1).': 'The service address (ends in /v1).',
  Clave: 'Key', Opcional: 'Optional', 'Pega la clave': 'Paste the key', '•••••••• (guardada; pega otra para cambiarla)': '•••••••• (saved; paste another to change it)',
  'Se guarda cifrada en este equipo, igual que la de Gemini.': 'Stored encrypted on this PC, like the Gemini key.', 'Probar conexión': 'Test connection', 'Probando…': 'Testing…',
  'Oírte con': 'Hear you with', 'Claude no entiende audio: usa la clave de Gemini (gratis) para pasar tu voz a texto.': 'Claude doesn\'t understand audio: it uses the (free) Gemini key to turn your voice into text.',
  'Para pasar tu voz a texto.': 'To turn your voice into text.', 'Este servicio': 'This service', 'Hablar con': 'Speak with', Windows: 'Windows',
  'La voz de las respuestas. Si no hay voz natural disponible, usa la de Windows.': 'The voice of the answers. If no natural voice is available, it uses the Windows one.',
  'Modelos de voz (opcional)': 'Voice models (optional)', Transcripción: 'Transcription', 'Modelo para pasar tu voz a texto en este servicio.': 'Model to turn your voice into text on this service.',
  'Modelo de texto a voz en este servicio.': 'Text-to-speech model on this service.', 'nombre del modelo': 'model name', 'Otro (compatible con OpenAI)': 'Other (OpenAI-compatible)',
  'OmniRoute (en tu PC)': 'OmniRoute (on your PC)', 'Ollama (en tu PC)': 'Ollama (on your PC)', 'LM Studio (en tu PC)': 'LM Studio (on your PC)',
  // elegir app
  'Elegir app': 'Choose app', 'Yurei · Elegir app': 'Yurei · Choose app', 'Yurei · Ajustes': 'Yurei · Settings', Sugeridas: 'Suggested', Instaladas: 'Installed',
  'Buscar…': 'Search…', 'No encontré nada con ese nombre.': 'Nothing found with that name.', 'No hay apps instaladas para listar (esto solo funciona en Windows).': 'No installed apps to list (this only works on Windows).',
  instalada: 'installed', web: 'web', 'Este PC no tiene batería': 'This PC has no battery', 'Solo funciona en Windows': 'Only works on Windows',
  // voz de Yurei (frases que dice el notch)
  '¡Pomodoro completo! Muy buen trabajo.': 'Pomodoro complete! Great work.', '¡Listo! Terminó el temporizador.': 'Done! The timer is over.',
  '¡Hola! Así sueno yo. ¿Te gusta?': 'Hi! This is how I sound. Do you like it?',
  'Llevas un buen rato con la pantalla. ¿Te estiras un poquito y tomas agua?': 'You\'ve been at the screen for a while. How about a stretch and some water?',
  'Hora de una pausa: mira algo lejos por veinte segundos, tus ojos te lo agradecen.': 'Break time: look at something far away for twenty seconds. Your eyes will thank you.',
  '¿Una pausa corta? Párate, mueve los hombros y respira hondo.': 'A short break? Stand up, roll your shoulders and take a deep breath.',
  'Te propongo un descanso de dos minutos. Yo te espero acá.': 'How about a two-minute break? I\'ll wait right here.',
  'Buen día. Dame el resumen de hoy en pocas frases.': 'Good morning. Give me today\'s summary in a few sentences.',
  'Te escucho… suelta para enviar': 'Listening… release to send', '🎂 ¡Feliz cumpleaños!': '🎂 Happy birthday!'
};

// Textos con partes que cambian (números, nombres…).
// Ajustes de la isla, indicadores en los bordes y apariencia adaptativa
Object.assign(I18N_EN, {
  Isla: 'Island', Superposiciones: 'Overlays', Adaptativo: 'Adaptive', Visibilidad: 'Visibility', Comportamiento: 'Behavior',
  'Fija se ve siempre. Inteligente se esconde con una ventana maximizada. Asomar solo aparece al tocar el borde de arriba.': 'Fixed is always visible. Smart hides while a window is maximized. Peek only appears when you touch the top edge.',
  Fija: 'Fixed', Inteligente: 'Smart', Asomar: 'Peek', 'Retardo al tocar el borde': 'Edge delay', 'Cuánto espera antes de mostrarse.': 'How long it waits before showing.',
  'Abrir al pasar el mouse': 'Open on hover', 'Si lo apagas, solo se abre con clic.': 'If off, it only opens with a click.',
  'Recordar el último panel': 'Remember the last panel', 'Al abrir, vuelve donde lo dejaste.': 'When opened, it goes back to where you left it.',
  'Panel de inicio': 'Start panel', Calendario: 'Calendar', Control: 'Control', 'Punto de actualización': 'Update dot', 'Muestra un punto cuando hay una versión nueva.': 'Shows a dot when a new version is available.',
  'Widgets de estado': 'Status widgets', 'Hasta 4 datos pequeños a los lados de la isla.': 'Up to 4 small readouts on the sides of the island.',
  Clima: 'Weather', Disco: 'Disk', Red: 'Network', Izquierda: 'Left', Derecha: 'Right', No: 'No',
  'Como mucho 4 en la isla: quita uno primero.': 'At most 4 on the island: remove one first.',
  'Aviso de batería baja': 'Low battery warning', 'A partir de qué nivel se pone en rojo.': 'The level at which it turns red.',
  'Calendario y temporizador': 'Calendar and timer', 'Mostrar el calendario': 'Show the calendar', 'Sonido al terminar el temporizador': 'Sound when the timer ends',
  Música: 'Music', 'Lo que suena en Windows (Spotify, el navegador…).': 'What is playing on Windows (Spotify, the browser…).',
  'Mostrar la música': 'Show music', Diseño: 'Layout', Clásico: 'Classic', Compacto: 'Compact',
  'Visualizador y portada en la isla cerrada': 'Visualizer and cover on the closed island',
  'Visualizador de ondas': 'Wave visualizer', 'Escucha el audio del sistema solo para dibujar las barras. No lo guarda ni lo envía.': 'Listens to system audio only to draw the bars. It never stores or sends it.',
  'Portada del álbum': 'Album cover', 'Colores de la portada': 'Cover colors', 'Tiñe la isla con los colores de la canción.': 'Tints the island with the song colors.', 'Brillo de la isla cerrada': 'Closed island glow',
  Bandeja: 'Shelf', 'Suelta archivos o texto sobre la isla para tenerlos a mano. Son referencias: no se copian.': 'Drop files or text on the island to keep them handy. They are references: nothing is copied.',
  'Mantener al reiniciar': 'Keep after restart', 'Si lo apagas, la bandeja empieza vacía.': 'If off, the shelf starts empty.',
  Volumen: 'Volume', 'Un indicador en el borde izquierdo de la pantalla.': 'An indicator on the left edge of the screen.',
  'Mostrar al cambiar el volumen': 'Show when the volume changes', 'Con las teclas del teclado o desde otra app.': 'With the keyboard keys or from another app.',
  'Mostrar al tocar el borde izquierdo': 'Show when touching the left edge', 'Arrástralo o usa la rueda. Toca el porcentaje para ver el volumen de cada app.': 'Drag it or use the wheel. Tap the percentage to see each app volume.',
  Brillo: 'Brightness', 'Un indicador en el borde derecho de la pantalla.': 'An indicator on the right edge of the screen.',
  'Mostrar al cambiar el brillo': 'Show when the brightness changes', 'Mostrar al tocar el borde derecho': 'Show when touching the right edge',
  'Usa el color de acento de Windows': 'Uses the Windows accent color', 'Elige cuánto color y cuánta luz tiene el fondo.': 'Choose how much color and light the background has.',
  Saturación: 'Saturation', 'Brillo del fondo': 'Background brightness', 'Tamaño y hora': 'Size and time', 'Tamaño de la isla': 'Island size',
  'Escala toda la interfaz de la isla.': 'Scales the whole island interface.', 'Reloj de 24 horas': '24-hour clock', 'Nada suena ahora': 'Nothing is playing right now'
});

// Voz propia de Yurei
Object.assign(I18N_EN, {
  Velocidad: 'Speed', Tono: 'Pitch', 'Más alta, habla más rápido. También se aplica a la voz de Windows.': 'Higher means faster speech. It also applies to the Windows voice.',
  'Negativo, más grave; positivo, más agudo. Sirve para acercar una voz femenina o masculina a como la querés.': 'Negative is deeper; positive is higher. Use it to bring a female or male voice closer to how you want it.',
  'Probar con estos valores': 'Try with these values', Restablecer: 'Reset', Normal: 'Normal',
  'Voz de Yurei': 'Yurei voice', 'Voz de Gemini': 'Gemini voice', 'Con qué voz habla': 'Which voice it speaks with',
  'La voz de Yurei es la que se queda fija. Gemini o la de Windows solo si lo eliges aquí.': 'The Yurei voice is the one that stays fixed. Gemini or the Windows voice only if you choose it here.',
  'Solo se usa si eliges Gemini arriba. Toca una voz y pruébala.': 'Only used if you pick Gemini above. Tap a voice to try it.',
  'Las voces propias de Yurei funcionan en Windows.': 'Yurei\'s own voices work on Windows.',
  'Vienen dentro de Yurei y hablan en tu PC: sin internet, sin cuota y siempre con la misma voz.': 'They come with Yurei and speak on your PC: no internet, no quota, and always the same voice.',
  'Se descargan una vez (con verificación de huella) y hablan en tu PC: sin internet, sin cuota y siempre con la misma voz.': 'They download once (with fingerprint verification) and speak on your PC: no internet, no quota, and always the same voice.',
  Femenina: 'Female', Masculina: 'Male', 'En uso ✓': 'In use ✓', Usar: 'Use', Probar: 'Try', Quitar: 'Remove', Argentina: 'Argentina', México: 'Mexico', España: 'Spain', Windows: 'Windows'
});

const I18N_EN_PATTERNS = [
  [/^Hola, soy (.+)$/, 'Hi, I\'m $1'], [/^Hola, soy (.+)\. ¿En qué te ayudo\?$/, 'Hi, I\'m $1. How can I help?'],
  [/^(\d+) pendientes?$/, (_, n) => `${n} to-do${n === '1' ? '' : 's'}`], [/^(.+) · hace (\d+) min$/, '$1 · $2 min ago'],
  [/^Traduciendo → (.+)$/, 'Translating → $1'], [/^No pude acceder al micrófono: (.+)$/, 'Couldn\'t access the microphone: $1'],
  [/^Abrir (.+)$/, 'Open $1'], [/^Modo (.+)$/, '$1 mode'], [/^Di "modo (.+)" y Yurei lo activa\. "Modo normal" lo deshace\.$/, 'Say "$1 mode" and Yurei turns it on. "Normal mode" undoes it.'],
  [/^Tienes la versión (.+)\.$/, 'You have version $1.'], [/^Tienes la última versión \((.+)\)\.$/, 'You have the latest version ($1).'],
  [/^Hay una versión nueva: (.+)\.$/, 'A new version is available: $1.'], [/^Bajando (.+)… (\d+)%$/, 'Downloading $1… $2%'], [/^Bajando… (\d+)%$/, 'Downloading… $1%'],
  [/^No se pudo comprobar: (.+)$/, 'Couldn\'t check: $1'], [/^Instalar (.+)$/, 'Install $1'], [/^Actualizar a (.+)$/, 'Update to $1'],
  [/^✨ Hay una versión nueva \((.+)\)\. Abre el panel para instalarla\.$/, '✨ A new version ($1) is available. Open the panel to install it.'],
  [/^Hoy llegaste al límite gratis de Gemini a las (.+)\. Se renueva solo\.$/, 'Today you hit Gemini\'s free limit at $1. It resets on its own.'],
  [/^No se pudo guardar: (.+)$/, 'Couldn\'t save: $1'], [/^No pude usar el micrófono: (.+)$/, 'Couldn\'t use the microphone: $1'],
  [/^Elegir app para el lugar (\d+)$/, 'Choose an app for spot $1'], [/^Pomodoro (\d+)\/(\d+)$/, 'Pomodoro $1/$2'],
  [/^(.+) · faltan (.+)$/, '$1 · $2 left'], [/^Pomodoro (\d+)\/(\d+) · faltan (.+)$/, 'Pomodoro $1/$2 · $3 left'],
  [/^¡Bien hecho! Descansa (\d+) minutos\.$/, 'Well done! Take a $1-minute break.'],
  [/^Se terminó el descanso\. Vamos con el bloque (\d+) de (\d+)\.$/, 'Break\'s over. On to block $1 of $2.'],
  [/^¡Listo! Terminó el tiempo de (.+)\.$/, 'Done! Time\'s up for $1.'], [/^(.+) \(no disponible\)$/, (_, name) => `${t(name)} (unavailable)`], [/^(\d+) min$/, '$1 min'],
  [/^(\d+) s$/, '$1 s'], [/^¡Funciona! ✓ \((.+)\)$/, 'It works! ✓ ($1)'], [/^(\d+) min$/, '$1 min'], [/^Uf, la CPU está al (\d+)%$/, 'Whoa, the CPU is at $1%'], [/^⚡ ¡Gracias! Cargando · (\d+)%$/, '⚡ Thanks! Charging · $1%'], [/^🔋 En batería · (\d+)%$/, '🔋 On battery · $1%'],
  [/^Me queda poca batería, (\d+) por ciento\. ¿Enchufamos el cargador\?$/, 'My battery is low, $1 percent. Shall we plug in the charger?'], [/^🪫 Batería baja: (\d+)%\. ¿Enchufamos el cargador\?$/, '🪫 Low battery: $1%. Plug in the charger?'], [/^¡Te recuerdo! (.+)$/, 'Reminder! $1'], [/^Perdón, te lo tenía que recordar hace (\d+) minutos: (.+)$/, 'Sorry, I was supposed to remind you $1 minutes ago: $2'], [/^(\d+) min hoy$/, '$1 min today']
];

let LANG = 'es';
let observer = null;

function t(s) {
  if (LANG !== 'en' || typeof s !== 'string') return s;
  const key = s.trim();
  if (!key) return s;
  if (Object.hasOwn(I18N_EN, key)) return s.replace(key, I18N_EN[key]);
  for (const [re, rep] of I18N_EN_PATTERNS) if (re.test(key)) return s.replace(key, key.replace(re, rep));
  return s;
}

const ATTRS = ['title', 'placeholder', 'aria-label'];
function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const out = t(root.nodeValue);
    if (out !== root.nodeValue) root.nodeValue = out;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches?.('input, textarea')) { /* lo que escribe el usuario no se toca */ } else {
    for (const n of root.childNodes) translateTree(n);
  }
  for (const a of ATTRS) {
    const v = root.getAttribute?.(a);
    if (v) { const out = t(v); if (out !== v) root.setAttribute(a, out); }
  }
}

// 'auto' | 'es' | 'en' ya resuelto por el proceso principal (lang). Volver al español recarga la página.
function setLang(lang) {
  const next = lang === 'en' ? 'en' : 'es';
  if (next === LANG) return;
  if (LANG === 'en' && next === 'es') { location.reload(); return; }
  LANG = next;
  document.documentElement.lang = next;
  document.title = t(document.title);
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes') translateTree(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
