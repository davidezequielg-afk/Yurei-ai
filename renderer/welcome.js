// Bienvenida de la primera vez: 5 pasos cortos con la carita. Usa las piezas de settings.js (el, card, row, toggle, choice, save, toast, playPcm).

const WELCOME_VOICES = [['Kore', 'firme'], ['Puck', 'alegre'], ['Aoede', 'fresca'], ['Achird', 'amigable'], ['Sulafat', 'cálida'], ['Leda', 'juvenil'], ['Charon', 'informativa'], ['Vindemiatrix', 'amable']];

function runWelcome(s) {
  document.body.classList.add('welcome');
  $('tabs').hidden = true;
  let step = 0;
  let mic = null; // { stream, ctx, raf }
  const stopMic = () => {
    if (!mic) return;
    cancelAnimationFrame(mic.raf);
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.ctx.close().catch(() => {});
    mic = null;
  };

  const dots = () => el('div', { className: 'dots' }, ...[0, 1, 2, 3, 4].map((i) => el('i', { className: i === step ? 'on' : i < step ? 'done' : '' })));
  const nav = (nextLabel = 'Seguir', { skip = false, onNext = null } = {}) => el('div', { className: 'wnav' },
    step > 0 ? el('button', { className: 'btn', type: 'button', textContent: 'Atrás', onclick: () => go(step - 1) }) : el('span'),
    el('div', {}, skip ? el('button', { className: 'btn link', type: 'button', textContent: 'Lo hago después', onclick: () => go(step + 1) }) : null,
      el('button', { className: 'btn primary', type: 'button', textContent: nextLabel, onclick: async () => { if (!onNext || (await onNext()) !== false) go(step + 1); } })));

  const steps = [
    // 1. Hola
    () => [
      el('h2', { className: 'wt', textContent: '¡Hola! Soy tu fantasmita de escritorio 👻' }),
      el('p', { className: 'wp', textContent: 'Vivo en el notch de arriba de tu pantalla. Me hablas y te respondo con voz.' }),
      el('ul', { className: 'wlist' },
        el('li', { textContent: '🎵 Pauso la música, subo el volumen o abro tus apps' }),
        el('li', { textContent: '⏱️ Pongo temporizadores y pomodoros' }),
        el('li', { textContent: '📋 Resumo, corrijo o traduzco lo que copias' }),
        el('li', { textContent: '🧠 Recuerdo lo que me cuentas de ti (solo en este equipo)' })),
      nav('Empezar')
    ],
    // 2. API key
    () => {
      const key = el('input', { type: 'password', placeholder: s.apiKey ? 'Ya tienes una guardada (pega otra para cambiarla)' : 'Pega aquí tu API key', autocomplete: 'off', spellcheck: false });
      const status = el('div', { className: 'wstatus' });
      const test = async () => {
        if (!key.value.trim()) { status.textContent = 'Pega la clave primero.'; status.className = 'wstatus err'; return false; }
        status.textContent = 'Comprobando…';
        status.className = 'wstatus';
        const r = await window.yurei.testKey(key.value);
        if (r.ok) { status.textContent = '¡Funciona! ✓'; status.className = 'wstatus ok'; s.apiKey = '••••'; $('ready').textContent = 'Lista para charlar'; $('ready').classList.remove('warn'); return true; }
        status.textContent = r.error;
        status.className = 'wstatus err';
        return false;
      };
      return [
        el('h2', { className: 'wt', textContent: 'Tu llave para que pueda pensar' }),
        el('p', { className: 'wp', textContent: 'Uso Gemini de Google. La clave es gratis y se consigue en un minuto: entra con tu cuenta de Google, toca "Create API key" y cópiala.' }),
        el('button', { className: 'btn', type: 'button', textContent: 'Abrir Google AI Studio ↗', onclick: () => window.yurei.openKeyPage() }),
        el('div', { className: 'wfield' }, key, el('button', { className: 'btn small', type: 'button', textContent: 'Comprobar', onclick: test })),
        status,
        el('p', { className: 'wnote', textContent: s.keyEncrypted ? '🔒 Se guarda cifrada en este equipo; solo tu usuario puede leerla.' : 'Se guarda solo en este equipo.' }),
        nav('Seguir', { skip: true, onNext: () => (s.apiKey && !key.value.trim() ? true : test()) })
      ];
    },
    // 3. Micrófono
    () => {
      const bar = el('i');
      const status = el('div', { className: 'wstatus', textContent: 'Toca el botón y di algo.' });
      const start = async () => {
        stopMic();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          const ctx = new AudioContext();
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(an);
          const buf = new Float32Array(an.fftSize);
          mic = { stream, ctx, raf: 0 };
          let heard = 0;
          const tick = () => {
            an.getFloatTimeDomainData(buf);
            const lvl = Math.sqrt(buf.reduce((a, x) => a + x * x, 0) / buf.length);
            bar.style.width = `${Math.min(100, lvl * 900)}%`;
            if (lvl > 0.03 && ++heard > 8) { status.textContent = '¡Te escucho perfecto! ✓'; status.className = 'wstatus ok'; }
            mic.raf = requestAnimationFrame(tick);
          };
          status.textContent = 'Habla un poco…';
          tick();
        } catch (e) {
          status.textContent = `No pude usar el micrófono: ${e.message}`;
          status.className = 'wstatus err';
        }
      };
      return [
        el('h2', { className: 'wt', textContent: '¿Me escuchas? ¿Te escucho?' }),
        el('p', { className: 'wp', textContent: 'Probemos tu micrófono. La barra se mueve cuando hablas.' }),
        el('button', { className: 'btn primary', type: 'button', textContent: '🎙️ Probar micrófono', onclick: start }),
        el('div', { className: 'meter' }, bar),
        status,
        nav('Seguir', { skip: true, onNext: () => { stopMic(); return true; } })
      ];
    },
    // 4. Voz
    () => {
      let voice = s.voice || 'Kore';
      const tryBtn = el('button', { className: 'btn small', type: 'button', textContent: '▶ Probar' });
      tryBtn.onclick = async () => {
        tryBtn.disabled = true;
        tryBtn.textContent = 'Preparando…';
        await flush();
        const r = await window.yurei.tts(t('¡Hola! Así sueno yo. ¿Te gusta?'));
        if (r.ok) { tryBtn.textContent = 'Sonando…'; await playPcm(r.data); } else toast(r.error, true);
        tryBtn.disabled = false;
        tryBtn.textContent = '▶ Probar';
      };
      return [
        el('h2', { className: 'wt', textContent: 'Elige mi voz' }),
        el('p', { className: 'wp', textContent: 'Toca una y pruébala. Después puedes elegir entre 30 en Ajustes.' }),
        choice('chips', WELCOME_VOICES.map(([v, d]) => ({ value: v, node: el('button', { className: 'chip' }, v, el('small', { textContent: d })) })), voice, (v) => { voice = v; save({ voice: v }); }),
        el('div', { className: 'wrow' }, tryBtn),
        nav('Seguir')
      ];
    },
    // 5. Listo
    () => [
      el('h2', { className: 'wt', textContent: '¡Todo listo! 🎉' }),
      el('ul', { className: 'wlist' },
        el('li', { textContent: '👆 Toca la carita de arriba o pulsa Ctrl + Shift + Espacio para hablarme' }),
        el('li', { textContent: '🖱️ Pasa el ratón por el notch para ver tu panel' }),
        el('li', { textContent: '🎮 Di "modo gamer" o "modo estudio" (los editas en Ajustes → Modos)' })),
      card('Manos libres', null, row('Responder cuando digo "hola" o mi nombre', 'El micrófono queda abierto y los fragmentos con voz se envían a Google para detectarlo.', toggle(s.wakeWord, (v) => save({ wakeWord: v })))),
      nav('¡A charlar!', { onNext: async () => { await flush(); await window.yurei.saveSettings({ onboarded: true }); location.reload(); return false; } })
    ]
  ];

  function go(i) {
    stopMic();
    step = Math.max(0, Math.min(steps.length - 1, i));
    $('form').replaceChildren(el('section', { className: 'page wpage' }, dots(), ...steps[step]()));
  }
  go(0);
}
