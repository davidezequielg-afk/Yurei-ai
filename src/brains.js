// "Cerebros": con qué IA piensa Yurei. Gemini va por src/gemini.js; aquí están Claude (SDK oficial de Anthropic)
// y cualquier servicio compatible con OpenAI (OpenAI, OmniRoute, OpenRouter, Groq, DeepSeek, Mistral, Grok, Ollama,
// LM Studio…). También la transcripción (voz → texto) y la voz (texto → voz) por el formato de OpenAI.

const AnthropicModule = require('@anthropic-ai/sdk');

const Anthropic = AnthropicModule.default || AnthropicModule;

const MAX_CALLS = 12; // mismo tope de acciones por pedido que con Gemini
const MAX_STEPS = 8;

// Atajos para llenar los campos en Ajustes. `local`: corre en tu PC (sin clave).
const PRESETS = {
  gemini: { provider: 'gemini', label: 'Gemini (Google)' },
  claude: { provider: 'anthropic', label: 'Claude (Anthropic)', model: 'claude-opus-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  openai: { provider: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', stt: 'gpt-4o-mini-transcribe', tts: 'gpt-4o-mini-tts' },
  omniroute: { provider: 'openai', label: 'OmniRoute (en tu PC)', baseUrl: 'http://localhost:20128/v1', model: 'auto', stt: 'whisper-1', tts: 'tts-1', local: true },
  openrouter: { provider: 'openai', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  groq: { provider: 'openai', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', stt: 'whisper-large-v3-turbo' },
  deepseek: { provider: 'openai', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  mistral: { provider: 'openai', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  xai: { provider: 'openai', label: 'Grok (xAI)', baseUrl: 'https://api.x.ai/v1', model: 'grok-4-fast' },
  ollama: { provider: 'openai', label: 'Ollama (en tu PC)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', local: true },
  lmstudio: { provider: 'openai', label: 'LM Studio (en tu PC)', baseUrl: 'http://localhost:1234/v1', model: 'local-model', local: true },
  custom: { provider: 'openai', label: 'Otro (compatible con OpenAI)', baseUrl: '', model: '' }
};

// Las herramientas están escritas en el formato de Gemini (tipos en mayúscula); Claude y OpenAI usan JSON Schema.
function toJsonSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (out.type === 'object') { out.properties ||= {}; if (s.required?.length) out.required = s.required; }
  return out;
}

// Historial guardado como en Gemini ({ role: 'user' | 'model', parts: [{ text }] }) → { role, text }.
const plainHistory = (history) => history.map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', text: (h.parts || []).map((p) => p.text || '').join('') })).filter((h) => h.text);

// Ejecuta una herramienta respetando el tope de acciones por pedido.
function toolRunner(executeTool, actions) {
  let calls = 0;
  return async (name, args) => {
    let result;
    if (++calls > MAX_CALLS) result = { error: 'Demasiadas acciones en una sola petición' };
    else {
      try { result = await executeTool(name, args || {}); } catch (e) { result = { error: e.message }; }
    }
    actions.push({ name, args, result });
    return result;
  };
}

/* ---------- Claude (SDK oficial de Anthropic) ---------- */

// Modelos que aceptan la red de seguridad del servidor: si el modelo declina, el mismo pedido se reintenta en otro.
const CLAUDE_FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

async function runClaude({ apiKey, model, system, text, imageB64, history = [], declarations, executeTool, client = null }) {
  if (!apiKey) throw new Error('Falta la API key de Claude. Agrégala en Ajustes → General → Cerebro.');
  const anthropic = client || new Anthropic({ apiKey, timeout: 60000, maxRetries: 2 });
  const tools = declarations.map((d) => ({ name: d.name, description: d.description, input_schema: toJsonSchema(d.parameters) }));
  const content = [];
  if (imageB64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageB64 } });
  content.push({ type: 'text', text: text || '(sin texto)' });
  // Los turnos anteriores van solo como texto (sin bloques de razonamiento); dentro de este pedido el historial
  // solo crece (append-only), así los bloques de razonamiento del bucle de herramientas siguen siendo válidos.
  const messages = [...plainHistory(history).map((h) => ({ role: h.role, content: h.text })), { role: 'user', content }];
  const actions = [];
  const run = toolRunner(executeTool, actions);
  const extra = CLAUDE_FALLBACK.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      tools,
      messages,
      output_config: { effort: 'low' }, // charla por voz: respuestas rápidas
      ...extra
    });
    if (res.stop_reason === 'refusal') return { text: 'Perdón, con eso no puedo ayudarte.', actions };
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(), actions };
    const results = [];
    for (const u of uses) {
      const result = await run(u.name, u.input);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result ?? null), ...(result?.error ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results }); // todos los resultados juntos, en un solo mensaje
  }
  return { text: 'Me quedé sin pasos para terminar la tarea.', actions };
}

/* ---------- compatible con OpenAI (cualquier otra IA) ---------- */

const trimBase = (u) => String(u || '').replace(/\/+$/, '');
const authHeaders = (apiKey) => (apiKey ? { authorization: `Bearer ${apiKey}` } : {});

async function postJson(fetchImpl, url, apiKey, body, timeoutMs = 60000) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(apiKey) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    let msg = '';
    const raw = await res.text();
    try { const j = JSON.parse(raw); msg = j.error?.message || j.message || j.detail || ''; } catch { msg = raw; }
    msg = String(msg || '').replace(apiKey || '\u0000', '***').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw Object.assign(new Error(res.status === 401 || res.status === 403 ? `La IA rechazó la clave (${res.status}). Revísala en Ajustes.` : `La IA respondió ${res.status}${msg ? `: ${msg}` : ''}`), { status: res.status });
  }
  return res;
}

async function runOpenAI({ baseUrl, apiKey, model, system, text, imageB64, history = [], declarations, executeTool, fetchImpl = fetch }) {
  if (!baseUrl) throw new Error('Falta la dirección de la IA. Configúrala en Ajustes → General → Cerebro.');
  const tools = declarations.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: toJsonSchema(d.parameters) } }));
  const userContent = imageB64
    ? [{ type: 'text', text: text || '' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } }]
    : text || '';
  const messages = [{ role: 'system', content: system }, ...plainHistory(history).map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: userContent }];
  const actions = [];
  const run = toolRunner(executeTool, actions);
  const url = `${trimBase(baseUrl)}/chat/completions`;

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await (await postJson(fetchImpl, url, apiKey, { model, messages, tools, tool_choice: 'auto' })).json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('La IA no devolvió respuesta');
    const calls = msg.tool_calls || [];
    messages.push({ role: 'assistant', content: msg.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) return { text: String(msg.content || '').trim(), actions };
    for (const c of calls) {
      let args = {};
      try { args = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { args = {}; }
      const result = await run(c.function?.name, args);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result ?? null) });
    }
  }
  return { text: 'Me quedé sin pasos para terminar la tarea.', actions };
}

// Voz → texto con /audio/transcriptions (Whisper y compatibles).
async function transcribeOpenAI({ baseUrl, apiKey, model = 'whisper-1', audioB64, fetchImpl = fetch, language }) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(audioB64, 'base64')], { type: 'audio/wav' }), 'voz.wav');
  form.append('model', model);
  if (language) form.append('language', language);
  const res = await fetchImpl(`${trimBase(baseUrl)}/audio/transcriptions`, { method: 'POST', headers: authHeaders(apiKey), body: form, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`La transcripción falló (${res.status}). Revisa el modelo de transcripción en Ajustes.`);
  const data = await res.json();
  return String(data.text || '').trim();
}

// Texto → voz con /audio/speech en PCM 16 bits 24 kHz (el mismo formato que la voz de Gemini).
async function speakOpenAI({ baseUrl, apiKey, model = 'tts-1', voice = 'alloy', text, fetchImpl = fetch }) {
  const res = await postJson(fetchImpl, `${trimBase(baseUrl)}/audio/speech`, apiKey, { model, voice, input: text, response_format: 'pcm' }, 30000);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

// "Probar conexión" en Ajustes: un pedido mínimo con la IA elegida.
async function testBrain({ provider, baseUrl, apiKey, model, fetchImpl = fetch, client = null }) {
  if (provider === 'anthropic') {
    if (!apiKey) throw new Error('Falta la API key de Claude');
    const anthropic = client || new Anthropic({ apiKey, timeout: 30000, maxRetries: 1 });
    const res = await anthropic.messages.create({ model, max_tokens: 1024, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Responde solo: ok' }] });
    return { ok: true, model: res.model };
  }
  if (!baseUrl) throw new Error('Falta la dirección de la IA');
  const data = await (await postJson(fetchImpl, `${trimBase(baseUrl)}/chat/completions`, apiKey, { model, messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 20 }, 30000)).json();
  return { ok: true, model: data.model || model };
}

module.exports = { testBrain, PRESETS, toJsonSchema, runClaude, runOpenAI, transcribeOpenAI, speakOpenAI, plainHistory };
