// Herramientas que Gemini puede invocar. `system` abstrae todo lo que toca el SO.

const { CATALOG, setWidget, DEFAULT_LAYOUT } = require('./widgets');

const SITES = {
  youtube: 'https://www.youtube.com/results?search_query=%s',
  google: 'https://www.google.com/search?q=%s',
  wikipedia: 'https://wikipedia.org/w/index.php?search=%s',
  github: 'https://github.com/search?q=%s',
  amazon: 'https://www.amazon.com/s?k=%s',
  spotify: 'https://open.spotify.com/search/%s',
  maps: 'https://www.google.com/maps/search/%s',
  reddit: 'https://www.reddit.com/search/?q=%s'
};

// Acciones que se pueden programar o meter en rutinas sin supervisión.
const SCHEDULABLE = ['open_url', 'web_search', 'site_search', 'open_app'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const POWER_ACTIONS = ['lock', 'sleep', 'restart', 'shutdown'];

const str = (description) => ({ type: 'STRING', description });

const declarations = [
  { name: 'open_app', description: 'Abre una aplicación instalada en el PC.', parameters: { type: 'OBJECT', properties: { name: str('Nombre de la app, p. ej. "notepad" o "Spotify"') }, required: ['name'] } },
  { name: 'open_url', description: 'Abre una página web (http/https) en el navegador.', parameters: { type: 'OBJECT', properties: { url: str('URL completa') }, required: ['url'] } },
  { name: 'web_search', description: 'Busca en Google.', parameters: { type: 'OBJECT', properties: { query: str('Consulta') }, required: ['query'] } },
  { name: 'site_search', description: `Busca dentro de un sitio concreto: ${Object.keys(SITES).join(', ')}.`, parameters: { type: 'OBJECT', properties: { site: str('Sitio'), query: str('Consulta') }, required: ['site', 'query'] } },
  { name: 'add_todo', description: 'Agrega una tarea a la lista de pendientes.', parameters: { type: 'OBJECT', properties: { text: str('Texto de la tarea') }, required: ['text'] } },
  { name: 'list_todos', description: 'Lista las tareas pendientes y completadas.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'complete_todo', description: 'Marca una tarea como completada (por id o por texto parcial).', parameters: { type: 'OBJECT', properties: { ref: str('Id numérico o parte del texto') }, required: ['ref'] } },
  { name: 'remove_todo', description: 'Elimina una tarea (por id o por texto parcial).', parameters: { type: 'OBJECT', properties: { ref: str('Id numérico o parte del texto') }, required: ['ref'] } },
  { name: 'schedule_task', description: 'Programa una acción única para una fecha y hora futuras. Se ejecuta sola y reporta.', parameters: { type: 'OBJECT', properties: { label: str('Descripción corta'), at: str('Fecha y hora local, formato YYYY-MM-DDTHH:mm'), action: { type: 'STRING', enum: SCHEDULABLE, description: 'Acción a ejecutar' }, target: str('URL, app o consulta según la acción'), site: str('Solo para site_search') }, required: ['label', 'at', 'action', 'target'] } },
  { name: 'create_routine', description: 'Crea una rutina recurrente. Si ya existe una con la misma etiqueta, añade la acción a esa rutina.', parameters: { type: 'OBJECT', properties: { label: str('Nombre de la rutina'), time: str('Hora local HH:mm'), days: str('"daily", "weekdays", "weekends" o lista como "mon,wed,fri"'), action: { type: 'STRING', enum: SCHEDULABLE, description: 'Acción a ejecutar' }, target: str('URL, app o consulta según la acción'), site: str('Solo para site_search') }, required: ['label', 'time', 'action', 'target'] } },
  { name: 'list_schedule', description: 'Lista las tareas programadas y las rutinas.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'cancel_schedule', description: 'Cancela una tarea programada o rutina por id o etiqueta.', parameters: { type: 'OBJECT', properties: { ref: str('Id o etiqueta') }, required: ['ref'] } },
  { name: 'set_volume', description: 'Ajusta el volumen del sistema de 0 a 100.', parameters: { type: 'OBJECT', properties: { level: { type: 'NUMBER', description: 'Nivel 0-100' } }, required: ['level'] } },
  { name: 'power_action', description: 'Bloquea, suspende, reinicia o apaga el PC. Pide confirmación verbal al usuario ANTES de llamar con confirmed=true.', parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: POWER_ACTIONS, description: 'Acción' }, confirmed: { type: 'BOOLEAN', description: 'true solo si el usuario ya confirmó' } }, required: ['action', 'confirmed'] } },
  { name: 'set_widget', description: `Cambia el widget de uno de los 3 lugares fijos del panel (izquierda, centro, derecha). Widgets: ${CATALOG.map((w) => `${w.id} (${w.name})`).join(', ')}. Si el widget ya estaba en otro lugar, intercambian lugares.`, parameters: { type: 'OBJECT', properties: { slot: { type: 'STRING', enum: ['izquierda', 'centro', 'derecha'], description: 'Lugar' }, widget: { type: 'STRING', enum: CATALOG.map((w) => w.id), description: 'Widget a mostrar' } }, required: ['slot', 'widget'] } },
  { name: 'set_city', description: 'Guarda la ciudad para el widget del clima.', parameters: { type: 'OBJECT', properties: { city: str('Nombre de la ciudad') }, required: ['city'] } },
  { name: 'read_clipboard', description: 'Lee el texto actual del portapapeles.', parameters: { type: 'OBJECT', properties: {} } }
];

function parseDays(spec = 'daily') {
  const s = String(spec).toLowerCase().trim();
  if (s === 'daily' || s === '') return [0, 1, 2, 3, 4, 5, 6];
  if (s === 'weekdays') return [1, 2, 3, 4, 5];
  if (s === 'weekends') return [0, 6];
  const days = s.split(/[,\s]+/).map((d) => DAY_NAMES.indexOf(d.slice(0, 3))).filter((i) => i >= 0);
  if (!days.length) throw new Error(`Días no válidos: ${spec}`);
  return [...new Set(days)];
}

function toAction({ action, target, site }) {
  if (!SCHEDULABLE.includes(action)) throw new Error(`Acción no programable: ${action}`);
  if (!target) throw new Error('Falta el destino de la acción');
  if (action === 'open_url') return { tool: action, args: { url: target } };
  if (action === 'open_app') return { tool: action, args: { name: target } };
  if (action === 'web_search') return { tool: action, args: { query: target } };
  return { tool: action, args: { site: site || 'google', query: target } };
}

function findByRef(list, ref, textKey) {
  const r = String(ref).trim().toLowerCase();
  return list.find((x) => String(x.id) === r) || list.find((x) => String(x[textKey]).toLowerCase().includes(r));
}

function createTools({ store, system, now = () => new Date() }) {
  const impl = {
    open_app: async ({ name }) => { await system.launchApp(name); return { opened: name }; },
    open_url: async ({ url }) => {
      let u;
      try { u = new URL(url); } catch { throw new Error('URL no válida'); }
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Solo se permiten URLs http/https');
      await system.openUrl(u.href);
      return { opened: u.href };
    },
    web_search: ({ query }) => impl.site_search({ site: 'google', query }),
    site_search: async ({ site, query }) => {
      const tpl = SITES[String(site).toLowerCase()];
      if (!tpl) throw new Error(`Sitio no soportado: ${site}`);
      const url = tpl.replace('%s', encodeURIComponent(query));
      await system.openUrl(url);
      return { opened: url };
    },
    add_todo: ({ text }) => {
      const todos = store.get('todos');
      const todo = { id: store.nextId('todos'), text: String(text), done: false };
      todos.push(todo);
      store.save();
      return todo;
    },
    list_todos: () => {
      const todos = store.get('todos');
      return { todos, completed: todos.filter((t) => t.done).length, total: todos.length };
    },
    complete_todo: ({ ref }) => {
      const t = findByRef(store.get('todos'), ref, 'text');
      if (!t) throw new Error('Tarea no encontrada');
      t.done = true;
      store.save();
      return t;
    },
    remove_todo: ({ ref }) => {
      const todos = store.get('todos');
      const t = findByRef(todos, ref, 'text');
      if (!t) throw new Error('Tarea no encontrada');
      todos.splice(todos.indexOf(t), 1);
      store.save();
      return { removed: t };
    },
    schedule_task: ({ label, at, ...rest }) => {
      const when = new Date(at);
      if (Number.isNaN(when.getTime())) throw new Error('Fecha no válida, usa YYYY-MM-DDTHH:mm');
      if (when <= now()) throw new Error('La fecha ya pasó');
      const task = { id: store.nextId('tasks'), label, at: when.toISOString(), action: toAction(rest), done: false };
      store.get('tasks').push(task);
      store.save();
      return task;
    },
    create_routine: ({ label, time, days, ...rest }) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Hora no válida, usa HH:mm');
      const action = toAction(rest);
      const routines = store.get('routines');
      const existing = routines.find((r) => r.label.toLowerCase() === String(label).toLowerCase());
      if (existing) {
        existing.actions.push(action);
        store.save();
        return existing;
      }
      const routine = { id: store.nextId('routines'), label, time, days: parseDays(days), actions: [action], lastRun: null };
      routines.push(routine);
      store.save();
      return routine;
    },
    list_schedule: () => ({
      tasks: store.get('tasks').filter((t) => !t.done),
      routines: store.get('routines')
    }),
    cancel_schedule: ({ ref }) => {
      for (const key of ['tasks', 'routines']) {
        const list = store.get(key);
        const item = findByRef(list, ref, 'label');
        if (item) {
          list.splice(list.indexOf(item), 1);
          store.save();
          return { cancelled: item };
        }
      }
      throw new Error('No encontré esa tarea o rutina');
    },
    set_volume: async ({ level }) => {
      const n = Math.max(0, Math.min(100, Math.round(Number(level))));
      if (Number.isNaN(n)) throw new Error('Nivel no válido');
      await system.setVolume(n);
      return { volume: n };
    },
    power_action: async ({ action, confirmed }) => {
      if (!POWER_ACTIONS.includes(action)) throw new Error('Acción no válida');
      if (confirmed !== true) return { executed: false, message: 'Pide confirmación al usuario y vuelve a llamar con confirmed=true.' };
      await system.power(action);
      return { executed: true, action };
    },
    set_widget: ({ slot, widget }) => {
      const current = store.get('settings').widgets || DEFAULT_LAYOUT;
      const widgets = setWidget(current, slot, widget);
      store.updateSettings({ widgets });
      return { widgets };
    },
    set_city: ({ city }) => {
      const c = String(city || '').trim().slice(0, 80);
      if (!c) throw new Error('Falta la ciudad');
      store.updateSettings({ city: c });
      return { city: c };
    },
    read_clipboard: () => ({ text: system.readClipboard() })
  };

  return {
    declarations,
    async execute(name, args = {}) {
      if (!Object.hasOwn(impl, name)) throw new Error(`Herramienta desconocida: ${name}`);
      return impl[name](args);
    }
  };
}

module.exports = { createTools, declarations, SITES, SCHEDULABLE, parseDays };
