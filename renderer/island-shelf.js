// Bandeja: arrastra archivos, carpetas o texto a la isla; quedan como referencias y se pueden volver a arrastrar afuera.

(() => {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
  const island = document.getElementById('island');
  let host = null;
  let items = [];
  let overflow = false;
  let toastTimer = null;
  let collapseTimer = null;
  const thumbs = new Map();
  const ui = {};

  const kindIcon = (it) => (it.kind === 'folder' ? 'folder' : it.kind === 'text' ? 'file' : 'file');

  function tile(it) {
    const prev = mk('div', { className: `sprev${it.kind === 'text' ? ' text' : ''}` });
    if (it.kind === 'text') prev.append(mk('span', { textContent: it.text.slice(0, 120) }));
    else {
      prev.append(window.icon(kindIcon(it), 26));
      const apply = (url) => { if (url) { prev.replaceChildren(mk('img', { src: url, alt: '' })); } };
      if (thumbs.has(it.id)) apply(thumbs.get(it.id));
      else window.yurei.shelfThumb(it.id).then((r) => { if (r.ok && r.data) { thumbs.set(it.id, r.data); apply(r.data); } });
    }
    const rm = mk('button', { className: 'sx', type: 'button', title: t('Quitar') }, window.icon('close', 10));
    rm.onclick = (e) => { e.stopPropagation(); window.yurei.shelfRemove(it.id).then((r) => { if (r.ok) set(r.data); }); };
    const el = mk('div', { className: 'stile', draggable: it.kind !== 'text', title: it.kind === 'text' ? t('Clic para copiar') : it.path }, prev, mk('div', { className: 'sname', textContent: it.name }), rm);
    el.onclick = async () => {
      const r = await window.yurei.shelfOpen(it.id);
      if (r.ok && r.data.copied) toast(t('Texto copiado'));
      else if (!r.ok) toast(r.error);
    };
    el.ondragstart = (e) => { e.preventDefault(); window.yurei.shelfDrag(it.id); }; // lo arrastra el sistema (proceso principal)
    return el;
  }

  function draw() {
    if (!host) return;
    if (!items.length) { ui.row.replaceChildren(mk('div', { className: 'sempty', textContent: t('Suelta archivos o texto aquí') })); }
    else ui.row.replaceChildren(...items.map(tile));
    requestAnimationFrame(() => { const o = ui.row.scrollWidth > ui.row.clientWidth + 2; ui.row.classList.toggle('over', o); overflow = o; });
  }

  function set(list) {
    items = list || [];
    Island.setShelfCount(items.length);
    draw();
    Island.refresh();
  }

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('on'), 2600);
  }

  function build(el) {
    host = el;
    ui.row = mk('div', { className: 'srow2' });
    ui.toast = mk('div', { className: 'stoast' });
    ui.row.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { ui.row.scrollLeft += e.deltaY; e.preventDefault(); e.stopPropagation(); } }, { passive: false });
    el.append(ui.row, ui.toast);
    draw();
  }

  Island.register('shelf', {
    build,
    size: () => ({ w: 380, h: items.length ? 128 : 94, r: 22 }),
    enter() { window.yurei.shelfList().then((r) => { if (r.ok) set(r.data); }); },
    leave() { clearTimeout(collapseTimer); }
  });

  /* ---------- soltar desde el sistema ---------- */
  let depth = 0;
  const isOsDrag = (e) => [...(e.dataTransfer?.types || [])].some((x) => x === 'Files' || x === 'text/plain');
  island.addEventListener('dragenter', (e) => {
    if (!isOsDrag(e)) return;
    e.preventDefault();
    depth++;
    island.classList.add('dropping');
    if (Island.view !== 'shelf') Island.open('shelf');
  });
  island.addEventListener('dragover', (e) => { if (isOsDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  island.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) island.classList.remove('dropping'); });
  island.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    island.classList.remove('dropping');
    let r;
    const paths = window.yurei.pathsFor(e.dataTransfer.files);
    if (paths.length) r = await window.yurei.shelfAdd(paths);
    else { const text = e.dataTransfer.getData('text/plain'); if (text) r = await window.yurei.shelfText(text); }
    if (!r?.ok) return;
    set(r.data.items);
    if (r.data.full) toast(t('La bandeja está llena (10): quita un elemento primero'));
    // Después de soltar, la bandeja se cierra sola a los 1,8 s si no la estás usando.
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => { if (!Island.state.hot && Island.view === 'shelf') Island.close(); }, 1800);
  });
  window.yurei.on('shelf', (list) => set(list));
  window.yurei.shelfList().then((r) => { if (r.ok) Island.setShelfCount(r.data.length); });
})();
