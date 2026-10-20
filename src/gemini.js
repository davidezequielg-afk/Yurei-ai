// Cliente mínimo de la API REST de Gemini con bucle de function calling.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generate({ apiKey, model, body, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Falta la API key de Gemini. Agrégala en Ajustes.');
  const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const textOf = (parts) => parts.map((p) => p.text || '').join('').trim();

async function runAgent({ apiKey, model, system, userParts, history = [], declarations, executeTool, maxSteps = 6, fetchImpl }) {
  const contents = [...history, { role: 'user', parts: userParts }];
  const actions = [];

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

const STYLE = 'Di esto con una voz natural, expresiva y cercana, con entonación, énfasis y ritmo humanos, como en una conversación real:';

// Devuelve PCM 16-bit mono a 24 kHz en base64.
async function synthesize({ apiKey, model, text, voiceName, fetchImpl }) {
  const data = await generate({
    apiKey,
    model,
    fetchImpl,
    body: {
      contents: [{ role: 'user', parts: [{ text: `${STYLE}\n${text}` }] }],
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

module.exports = { runAgent, transcribe, askAudio, synthesize, generate };
