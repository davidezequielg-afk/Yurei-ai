// Cliente mínimo de la API REST de Gemini con bucle de function calling.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const TIMEOUT_MS = 45000;
const MAX_CALLS = 12; // tope de acciones por petición: una orden maliciosa no puede abrir 50 pestañas

async function generate({ apiKey, model, body, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (!apiKey) throw new Error('Falta la API key de Gemini. Agrégala en Ajustes.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, // la clave va en la cabecera, nunca en la URL
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    if (!res.ok) throw new Error(friendlyError(res.status, (await res.text()).replace(apiKey, '***')));
    return await res.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Gemini tardó demasiado en responder' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Convierte la respuesta de error de Google en un mensaje legible (el código queda para diagnosticar).
function friendlyError(status, body) {
  let msg = '';
  try { msg = JSON.parse(body)?.error?.message || ''; } catch { msg = ''; }
  msg = (msg || body).replace(/\s+/g, ' ').trim().slice(0, 220);
  if (status === 429) return `Gemini 429: llegaste al límite gratis por ahora (${msg})`;
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return 'Gemini 400: la API key no es válida. Revísala en Ajustes.';
  if (status === 403) return `Gemini 403: la clave no tiene permiso para este modelo (${msg})`;
  if (status >= 500) return `Gemini ${status}: el servicio de Google falló, prueba de nuevo en un momento`;
  return `Gemini ${status}: ${msg}`;
}

const textOf = (parts) => parts.map((p) => p.text || '').join('').trim();

async function runAgent({ apiKey, model, system, userParts, history = [], declarations, executeTool, maxSteps = 6, fetchImpl }) {
  const contents = [...history, { role: 'user', parts: userParts }];
  const actions = [];
  let totalCalls = 0;

  for (let step = 0; step < maxSteps; step++) {
    const data = await generate({
      apiKey,
      model,
      fetchImpl,
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: declarations?.length ? [{ functionDeclarations: declarations }] : undefined
      }
    });

    const content = data.candidates?.[0]?.content;
    if (!content) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'sin respuesta';
      throw new Error(`Gemini no devolvió contenido (${reason})`);
    }
    const parts = content.parts || [];
    contents.push({ role: 'model', parts });

    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return { text: textOf(parts), actions };

    const responses = [];
    for (const { functionCall: { name, args } } of calls) {
      let result;
      if (++totalCalls > MAX_CALLS) {
        result = { error: 'Demasiadas acciones en una sola petición' };
        actions.push({ name, args, result });
        responses.push({ functionResponse: { name, response: { result } } });
        continue;
      }
      try {
        result = await executeTool(name, args || {});
      } catch (e) {
        result = { error: e.message };
      }
      actions.push({ name, args, result });
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { text: 'Me quedé sin pasos para terminar la tarea.', actions };
}

async function askAudio({ apiKey, model, audioB64, prompt, mimeType = 'audio/wav', fetchImpl }) {
  const data = await generate({
    apiKey,
    model,
    fetchImpl,
    body: { contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: audioB64 } }] }] }
  });
  return textOf(data.candidates?.[0]?.content?.parts || []);
}

const TRANSCRIBE_PROMPT = 'Transcribe este audio a texto limpio. Elimina muletillas y arranques en falso, y aplica las autocorrecciones del hablante (si dice "no, quise decir X", deja solo X). Devuelve únicamente el texto final, sin comillas ni comentarios. Si no hay voz, devuelve una cadena vacía.';

const transcribe = (opts) => askAudio({ ...opts, prompt: TRANSCRIBE_PROMPT });

// Devuelve PCM 16-bit mono a 24 kHz en base64. Solo se envía el texto a decir: cualquier instrucción añadida
// ("di esto con voz...") el modelo la lee en voz alta.
async function synthesize({ apiKey, model, text, voiceName, fetchImpl }) {
  const data = await generate({
    apiKey,
    model,
    fetchImpl,
    body: {
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      }
    }
  });
  const audio = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!audio) throw new Error('Gemini no devolvió audio');
  return audio;
}

module.exports = { runAgent, transcribe, askAudio, synthesize, generate, friendlyError };
