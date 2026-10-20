const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Zephyr', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

(async () => {
  const s = (await window.yurei.getSettings()).data || {};
  const field = (label, node) => [el('label', { textContent: label }), node];
  const key = el('input', { type: 'password', value: s.apiKey || '', placeholder: 'Pega tu API key de Google AI Studio' });
  const model = el('input', { value: s.model });
  const soul = el('input', { value: s.soul });
  const pers = el('textarea', { rows: 2, value: s.personality });
  const voiceSel = el('select', {}, ...GEMINI_VOICES.map((v) => el('option', { value: v, textContent: v, selected: v === (s.voice || 'Kore') })));
  const sysVoice = el('input', { type: 'checkbox', checked: !!s.systemVoice });
  const wake = el('input', { type: 'checkbox', checked: !!s.wakeWord });
  const favicons = el('input', { type: 'checkbox', checked: !!s.fetchFavicons });
  const convSecs = el('input', { type: 'number', min: 5, max: 120, value: s.conversationSeconds || 20 });
  const fillers = el('input', { type: 'checkbox', checked: s.fillers !== false });
  const fillerPhrases = el('textarea', { rows: 3, value: (s.fillerPhrases || []).join('\n'), placeholder: 'Una frase por línea. Vacío = las de por defecto ("A ver…", "Un segundo…")' });
  const abil = el('textarea', { rows: 3, value: (s.abilities || []).join('\n'), placeholder: 'Una instrucción por línea, p. ej. "Cuando diga \'modo cine\' baja el volumen a 20"' });
  const catalog = s.widgetCatalog || [];
  const layout = s.widgets || ['yurei', 'clock', 'todos'];
  const slotSel = ['Izquierda', 'Centro', 'Derecha'].map((_, i) => el('select', {}, ...catalog.map((w) => el('option', { value: w.id, textContent: w.disabled ? `${w.name} — ${w.reason || 'no disponible'}` : w.name, disabled: !!w.disabled, selected: w.id === layout[i] }))));
  const city = el('input', { value: s.city || '', placeholder: 'p. ej. Buenos Aires (para el widget del clima)' });
  // --- apariencia (se aplica al instante) ---
  const opt = (pairs, current) => pairs.map(([v, t]) => el('option', { value: v, textContent: t, selected: v === current }));
  const theme = el('select', {}, ...opt([['system', 'Como el sistema'], ['light', 'Claro'], ['dark', 'Oscuro'], ['custom', 'Personalizado']], s.theme || 'dark'));
  const customBg = el('input', { type: 'color', value: s.customBg || '#101114' });
  const customAccent = el('input', { type: 'color', value: s.customAccent || '#6cb8f0' });
  const colors = el('div', { className: 'colors' },
    el('label', { className: 'swatch' }, customBg, 'Color de fondo'),
    el('label', { className: 'swatch' }, customAccent, 'Color de acento'));
  const transp = el('select', {}, ...opt([['off', 'Opaco'], ['on', 'Translúcido'], ['system', 'Como el sistema (efectos de transparencia de Windows)']], s.transparency || 'off'));
  const opacity = el('input', { type: 'range', min: 30, max: 100, value: s.opacity || 78 });
  const opacityBox = el('div', {}, el('label', { textContent: 'Opacidad cuando es translúcido' }), opacity);
  const syncVisibility = () => { colors.hidden = theme.value !== 'custom'; opacityBox.hidden = transp.value === 'off'; };
  let timer = null;
  const applyLive = () => {
    syncVisibility();
    clearTimeout(timer);
    timer = setTimeout(() => window.yurei.saveSettings({ theme: theme.value, customBg: customBg.value, customAccent: customAccent.value, transparency: transp.value, opacity: Number(opacity.value) }), 120);
  };
  [theme, customBg, customAccent, transp, opacity].forEach((n) => { n.oninput = applyLive; });
  syncVisibility();
  const save = el('button', {
    textContent: 'Guardar',
    onclick: async () => {
      const r = await window.yurei.saveSettings({
        apiKey: key.value, model: model.value.trim(), soul: soul.value.trim() || 'Yurei', personality: pers.value,
        voice: voiceSel.value, fetchFavicons: favicons.checked, fillers: fillers.checked, fillerPhrases: fillerPhrases.value.split('\n'), systemVoice: sysVoice.checked, wakeWord: wake.checked,
        conversationSeconds: Number(convSecs.value) || 20,
        theme: theme.value, customBg: customBg.value, customAccent: customAccent.value, transparency: transp.value, opacity: Number(opacity.value),
        widgets: slotSel.map((x) => x.value), city: city.value,
        abilities: abil.value.split('\n').map((x) => x.trim()).filter(Boolean)
      });
      save.textContent = r.ok ? 'Guardado ✓' : `Error: ${r.error}`;
    }
  });
  document.getElementById('form').replaceChildren(
    el('h2', { textContent: 'Apariencia' }),
    ...field('Tema', theme), colors,
    ...field('Transparencia', transp), opacityBox,
    ...field('API key de Gemini', key),
    el('div', { className: 'note', textContent: s.keyEncrypted ? 'Se guarda cifrada con el almacén seguro de Windows: solo tu usuario, en este equipo, puede leerla.' : 'Aviso: este sistema no ofrece almacén seguro, así que la clave se guarda en un archivo sin cifrar.' }),
    ...field('Modelo', model),
    ...field('Alma (nombre y palabra de activación)', soul),
    ...field('Personalidad', pers),
    ...field('Voz (Gemini, natural y expresiva)', voiceSel),
    el('label', { className: 'check' }, sysVoice, 'Usar la voz del sistema (robótica, pero no gasta cuota)'),
    el('label', { className: 'check' }, wake, 'Escuchar siempre mi nombre (manos libres). El micrófono queda abierto y los fragmentos con voz se envían a Google para detectar el nombre.'),
    el('label', { className: 'check' }, fillers, 'Decir frases mientras pienso ("mmm, déjame ver…") para que la charla fluya'),
    ...field('Frases de relleno propias', fillerPhrases),
    el('label', { className: 'check' }, favicons, 'Descargar el icono de las webs que añado a Mis apps (se consulta a Google el nombre del sitio; por defecto no)'),
    ...field('Segundos de conversación abierta', convSecs),
    el('h2', { textContent: 'Widgets del panel' }),
    ...field('Lugar izquierdo', slotSel[0]), ...field('Lugar central', slotSel[1]), ...field('Lugar derecho', slotSel[2]),
    ...field('Ciudad (clima)', city),
    ...field('Habilidades', abil),
    save,
    el('h2', { textContent: 'Audio y reproductores' }),
    el('div', { className: 'note', textContent: 'Si el volumen o los controles de música no responden, esto muestra qué falla para poder arreglarlo.' }),
    (() => {
      const outBox = el('pre', { className: 'diag', hidden: true });
      const btn = el('button', {
        textContent: 'Probar audio',
        onclick: async () => {
          btn.textContent = 'Probando…';
          const r = await window.yurei.diagnoseAudio();
          btn.textContent = 'Probar audio';
          outBox.hidden = false;
          outBox.textContent = r.ok ? JSON.stringify(r.data, null, 2) : `Error: ${r.error}`;
        }
      });
      return el('div', {}, btn, outBox);
    })(),
    el('h2', { textContent: 'Tus datos' }),
    el('div', { className: 'note', textContent: 'Todo lo tuyo vive solo en este equipo. Puedes borrarlo por completo en cualquier momento.' }),
    el('button', { className: 'danger', textContent: 'Borrar todos mis datos…', onclick: () => window.yurei.wipeData() })
  );
})();
