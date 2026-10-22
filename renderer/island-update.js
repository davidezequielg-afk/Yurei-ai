// Vista "Actualización": aparece sola (una vez por versión) cuando hay una versión nueva, y también con el aviso de Windows.
// Instalar siempre lo decide la persona: "Instalar ahora" o "Más tarde".

(() => {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
  let u = { status: 'idle' };
  const ui = {};
  let closeTimer = null;

  const mb = (b) => (b ? `${Math.round(b / 1048576)} MB` : '');

  function draw() {
    if (!ui.title) return;
    const busy = u.status === 'downloading' || u.status === 'installing';
    if (u.status === 'downloading') {
      ui.title.textContent = t('Bajando la actualización…');
      ui.sub.textContent = `${Math.round((u.progress || 0) * 100)} %`;
      ui.bar.style.width = `${Math.round((u.progress || 0) * 100)}%`;
    } else if (u.status === 'installing') {
      ui.title.textContent = t('Instalando…');
      ui.sub.textContent = t('Yurei se va a cerrar y volver a abrir solo.');
      ui.bar.style.width = '100%';
    } else {
      ui.title.textContent = u.version ? `${t('Yurei')} ${u.version} ${t('está disponible')}` : t('Hay una versión nueva');
      ui.sub.textContent = u.error ? `⚠ ${u.error}` : `${t('Se baja de GitHub y se verifica su huella antes de instalar.')}${u.size ? ` · ${mb(u.size)}` : ''}`;
      ui.bar.style.width = '0%';
    }
    ui.bar.parentElement.hidden = !busy;
    ui.install.disabled = busy;
    ui.later.hidden = busy;
    Island.refresh();
  }

  function build(host) {
    ui.title = mk('div', { className: 'utitle' });
    ui.sub = mk('div', { className: 'usub' });
    ui.bar = mk('i');
    ui.install = mk('button', { className: 'pillbtn', type: 'button', textContent: t('Instalar ahora') });
    ui.later = mk('button', { className: 'ulater', type: 'button', textContent: t('Más tarde') });
    ui.install.onclick = async () => { clearTimeout(closeTimer); const r = await window.yurei.updateInstall(); if (!r.ok) { u = { ...u, error: r.error }; draw(); } };
    ui.later.onclick = () => { clearTimeout(closeTimer); Island.close(); };
    host.append(mk('div', { className: 'ubox' }, ui.title, ui.sub, mk('div', { className: 'ubar' }, ui.bar), mk('div', { className: 'uact' }, ui.later, ui.install)));
    draw();
  }

  Island.register('update', {
    build,
    size: () => ({ w: 360, h: 132, r: 22 }),
    enter() { draw(); },
    leave() { clearTimeout(closeTimer); }
  });

  // Al detectarla se abre sola un rato (se cierra si no la tocas); si estás en medio de otra cosa, solo queda el aviso de siempre.
  Island.announceUpdate = () => {
    Island.open('update');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (Island.view === 'update' && !Island.state.hot && u.status === 'available') Island.close(); }, 25000);
  };
  Island.setUpdate = (x) => { u = x || { status: 'idle' }; draw(); };
  window.yurei.on('open-update', () => { if (['available', 'downloading', 'installing'].includes(u.status)) Island.open('update'); });
})();
