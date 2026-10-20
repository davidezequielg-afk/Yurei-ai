const { runAgent, transcribe } = require('./gemini');

function buildSystemPrompt(settings, now = new Date()) {
  const abilities = settings.abilities?.length ? `\nHabilidades extra del usuario:\n- ${settings.abilities.join('\n- ')}` : '';
  return [
    `Eres "${settings.soul}", un asistente de voz de escritorio.`,
    `Personalidad: ${settings.personality}`,
    'Tus respuestas se leen en voz alta: sé breve (1-3 frases), sin markdown ni listas largas.',
    'Usa las herramientas para actuar en el PC en vez de explicar cómo hacerlo. Tras actuar, confirma en una frase lo que hiciste.',
    'Antes de bloquear, suspender, reiniciar o apagar el PC pregunta y espera confirmación explícita.',
    `Fecha y hora local: ${now.toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
    abilities
  ].join('\n');
}

function createAssistant({ store, tools, fetchImpl }) {
  let history = [];

  return {
    async ask({ text, audioB64, imageB64 }) {
      const s = store.get('settings');
      const userParts = [];
      if (imageB64) userParts.push({ inlineData: { mimeType: 'image/png', data: imageB64 } });
      if (audioB64) userParts.push({ inlineData: { mimeType: 'audio/wav', data: audioB64 } });
      if (text) userParts.push({ text });
      if (!userParts.length) throw new Error('Nada que procesar');

      const { text: reply, actions } = await runAgent({
        apiKey: s.apiKey,
        model: s.model,
        system: buildSystemPrompt(s),
        userParts,
        history,
        declarations: tools.declarations,
        executeTool: tools.execute,
        fetchImpl
      });

      // El historial conserva solo texto para mantener las peticiones pequeñas (cuota gratuita).
      history = [...history, { role: 'user', parts: [{ text: text || '(mensaje de voz)' }] }, { role: 'model', parts: [{ text: reply || '(listo)' }] }].slice(-12);
      return { reply, actions };
    },

    async dictate(audioB64) {
      const s = store.get('settings');
      return transcribe({ apiKey: s.apiKey, model: s.model, audioB64, fetchImpl });
    },

    reset() { history = []; }
  };
}

module.exports = { createAssistant, buildSystemPrompt };
