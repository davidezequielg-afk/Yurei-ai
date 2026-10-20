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
  const convSecs = el('input', { type: 'number', min: 5, max: 120, value: s.conversationSeconds || 20 });
  const fillers = el('input', { type: 'checkbox', checked: s.fillers !== false });
  const fillerPhrases = el('textarea', { rows: 3, value: (s.fillerPhrases || []).join('\n'), placeholder: 'Una frase por línea. Vacío = las de por defecto ("A ver…", "Un segundo…")' });
  const abil = el('textarea', { rows: 3, value: (s.abilities || []).join('\n'), placeholder: 'Una instrucción por línea, p. ej. "Cuando diga \'modo cine\' baja el volumen a 20"' });
  const catalog = s.widgetCatalog || [];
  const layout = s.widgets || ['yurei', 'clock', 'todos'];
  const slotSel = ['Izquierda', 'Centro', 'Derecha'].map((_, i) => el('select', {}, ...catalog.map((w) => el('option', { value: w.id, textContent: w.disabled ? `${w.name} — ${w.reason || 'no disponible'}` : w.name, disabled: !!w.disabled, selected: w.id === layout[i] }))));
  const city = el('input', { value: s.city || '', placeholder: 'p. ej. Buenos Aires (para el widget del clima)' });
  const save = el('button', {
    textContent: 'Guardar',
    onclick: async () => {
      const r = await window.yurei.saveSettings({
        apiKey: key.value, model: model.value.trim(), soul: soul.value.trim() || 'Yurei', personality: pers.value,
        voice: voiceSel.value, fillers: fillers.checked, fillerPhrases: fillerPhrases.value.split('\n'), systemVoice: sysVoice.checked, wakeWord: wake.checked,
        conversationSeconds: Number(convSecs.value) || 20,
        widgets: slotSel.map((x) => x.value), city: city.value,
        abilities: abil.value.split('\n').map((x) => x.trim()).filter(Boolean)
      });
      save.textContent = r.ok ? 'Guardado ✓' : `Error: ${r.error}`;
    }
  });
  document.getElementById('form').replaceChildren(
    ...field('API key de Gemini (se guarda solo en este PC)', key),
    ...field('Modelo', model),
    ...field('Alma (nombre y palabra de activación)', soul),
    ...field('Personalidad', pers),
    ...field('Voz (Gemini, natural y expresiva)', voiceSel),
    el('label', { className: 'check' }, sysVoice, 'Usar la voz del sistema (robótica, pero no gasta cuota)'),
    el('label', { className: 'check' }, wake, 'Escuchar siempre mi nombre (manos libres). El micrófono queda abierto y los fragmentos con voz se envían a Google para detectar el nombre.'),
    el('label', { className: 'check' }, fillers, 'Decir frases mientras pienso ("mmm, déjame ver…") para que la charla fluya'),
    ...field('Frases de relleno propias', fillerPhrases),
    ...field('Segundos de conversación abierta', convSecs),
    el('h2', { textContent: 'Widgets del panel' }),
    ...field('Lugar izquierdo', slotSel[0]), ...field('Lugar central', slotSel[1]), ...field('Lugar derecho', slotSel[2]),
    ...field('Ciudad (clima)', city),
    ...field('Habilidades', abil),
    save
  );
})();
