# Seguridad y privacidad de Yurei

Yurei controla partes de tu PC con la voz y habla con un servicio externo (Google Gemini). Por eso la seguridad se trata como una función más: abajo está lo que se hace, **cómo se comprueba** y también lo que **no** está resuelto.

## Cómo avisar de una vulnerabilidad

No abras un *issue* público. Usa **Security → Report a vulnerability** en GitHub (aviso privado) con los pasos para reproducirla. Se responde lo antes posible y se publica el arreglo con crédito si lo deseas. (Quien mantiene el repositorio debe tener activado *Private vulnerability reporting* en Settings → Code security.)

## Qué se protege y de qué

| Se protege | Contra |
|---|---|
| Tu PC | Que una página web, una captura de pantalla, el título de una canción o cualquier texto manipule a la IA o a la app para ejecutar comandos |
| Tu API key | Que otra página, proceso o error la filtre; que quede legible en disco |
| Tu voz, pantalla y datos | Que salgan a destinos no previstos |
| La app instalada | Dependencias o instaladores alterados |

**Fuera de alcance:** un programa malicioso que ya corre con los permisos de *tu usuario* de Windows (puede leer la memoria o teclear por ti). Ninguna aplicación de escritorio puede defenderse de eso.

## Medidas y cómo se comprueban

| # | Medida | Comprobación |
|---|---|---|
| 1 | La interfaz va en *sandbox*, con aislamiento de contexto y **sin Node** (`require`/`process` no existen) | e2e |
| 2 | El puente interno (IPC) solo responde a páginas locales de la app: una página ajena con el mismo puente recibe "No autorizado" | e2e + tests |
| 3 | Toda entrada se valida con **lista blanca** (tipos, tamaños, formatos); lo desconocido se descarta. Ejemplos probados: 15 entradas maliciosas por el puente real, todas rechazadas | e2e + tests |
| 4 | Las ventanas **no hacen ninguna petición de red** (CSP + bloqueo a nivel de sesión). Un servidor local de prueba recibe 0 peticiones | e2e |
| 5 | Único permiso concedido: micrófono, solo a páginas de la app. Cámara, ubicación, notificaciones, USB, etc. denegados | e2e |
| 6 | Sin navegación a sitios externos, sin ventanas nuevas, sin `<webview>`, sin herramientas de desarrollo, una sola instancia | e2e |
| 7 | **Abrir apps no pasa texto por un intérprete de comandos.** Se abre un acceso real del menú Inicio o un programa básico de una lista fija. (Una versión anterior permitía `x&calc`: corregido y cubierto por tests) | tests |
| 8 | Apagar, reiniciar o suspender piden confirmación en un **cuadro del sistema** que la IA no puede pulsar | tests |
| 9 | La IA tiene tope de 12 acciones por petición, tiempo límite, y se le indica que el contenido de pantallas/webs/títulos es *dato* y nunca instrucciones | tests |
| 10 | La API key se guarda **cifrada con el almacén de Windows (DPAPI)**, solo viaja en una cabecera hacia Google, nunca vuelve a la ventana y se oculta en los errores | tests + e2e |
| 11 | Archivos guardados de forma atómica y con permisos solo para el usuario; botón **Borrar todos mis datos** | tests |
| 12 | Dictar no pisa tu portapapeles; la IA no puede leerlo; las capturas pendientes se descartan al cerrar la charla | tests |
| 13 | Ejecutable empaquetado con **fusibles**: sin `ELECTRON_RUN_AS_NODE`, sin `NODE_OPTIONS`, sin `--inspect`, solo carga código desde `app.asar` | comprobado en el paquete |
| 14 | **Cero dependencias externas dentro de la app**; herramientas de compilación con versión exacta y `package-lock.json`; instalación con `npm ci --ignore-scripts` | `npm audit --omit=dev` |
| 15 | Acciones de GitHub fijadas por su commit exacto, permisos mínimos por trabajo, CodeQL y Dependabot | flujos en `.github/` |
| 16 | Cada instalador publicado lleva su huella **SHA-256** y una firma de procedencia (de qué repositorio y flujo salió) | ver abajo |

## Verifica el instalador

1. `Get-FileHash .\Yurei-Setup-X.Y.Z.exe -Algorithm SHA256` y compara con `SHA256SUMS.txt` del release.
2. Con la CLI de GitHub: `gh attestation verify .\Yurei-Setup-X.Y.Z.exe --repo OWNER/REPO`.

## Límites conocidos (sin maquillar)

- **El instalador no está firmado con certificado de código.** Windows SmartScreen avisará; verifica la huella SHA-256.
- **La integridad de `app.asar` no está activada** (fusible `EnableEmbeddedAsarIntegrityValidation`): quien ya pueda escribir en la carpeta de instalación del usuario podría alterar el código. Falta comprobar su compatibilidad en Windows real.
- **Sin almacén seguro** (p. ej. Linux sin llavero) la clave se guardaría sin cifrar; Ajustes lo avisa.
- **La IA puede ser engañada.** La inyección de instrucciones no se elimina del todo: se limita el daño (confirmaciones fuera de la IA, tope de acciones, herramientas acotadas). Aun así, un contenido malicioso podría lograr que se abra un *enlace* elegido por él.
- **Vulnerabilidades moderadas en `electron-builder`** (herramienta de compilación, no incluida en la app); el "arreglo" que propone `npm audit` es una versión más antigua, así que se vigila vía Dependabot.
- **Lo propio de Windows** (DPAPI, volumen y reproductores por PowerShell, `reg.exe`, diálogos) no se ha ejecutado en un Windows real en las pruebas automáticas; el resto sí se probó ejecutando Electron.

## Cómo probar la seguridad tú mismo

```bash
npm ci --ignore-scripts && npm test            # 53 tests unitarios y de seguridad
npm i --no-save playwright
xvfb-run -a node e2e/security.e2e.js           # 19 ataques contra la app real (en Windows: sin xvfb-run)
npm run dist && EXEC=dist/win-unpacked/Yurei.exe node e2e/packaged.e2e.js   # contra el paquete
```
