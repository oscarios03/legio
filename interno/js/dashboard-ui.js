/* ===== PANEL (login + lista de avalúos) ===== */
(function () {
  const $ = id => document.getElementById(id);

  function fmtMXN(n) {
    if (!n) return '—';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  }
  function fmtFecha(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return iso; }
  }

  async function mostrarPantalla() {
    const authed = Legio.auth.isAuthed();
    $('loginCard').style.display = authed ? 'none' : '';
    $('app').style.display = authed ? '' : 'none';
    if (!authed) return;
    await Legio.shell.montar({ page: 'avaluos' });
    avisoModo();
    render();
  }

  /* Los avalúos viven en la nube cuando hay sesión del CRM. Si no la hay, o si
   * quedaron avalúos viejos guardados solo en este navegador, hay que decirlo. */
  async function avisoModo() {
    const caja = $('modoAviso');
    if (!caja) return;
    const modo = await Legio.storage.modo();

    if (modo === 'local') {
      caja.innerHTML = '<div class="crm-msg crm-msg--warn">Estos avalúos se están guardando <strong>solo en este navegador</strong>. ' +
        '<a href="index.html">Inicia sesión en el CRM</a> para guardarlos en la nube y que los vea todo el equipo.</div>';
      return;
    }

    const pendientes = Legio.storage.contarLocales();
    if (!pendientes) { caja.innerHTML = ''; return; }
    caja.innerHTML = `<div class="crm-msg crm-msg--warn">
      Hay <strong>${pendientes}</strong> avalúo(s) guardados solo en este navegador.
      <button class="btn btn--primary btn--sm" id="btnSubir" style="margin-left:8px;">Subirlos a la nube</button>
    </div>`;
    $('btnSubir').addEventListener('click', async () => {
      $('btnSubir').disabled = true;
      try {
        const n = await Legio.storage.subirLocales();
        alert(n + ' avalúo(s) subidos. Ya los ve todo el equipo.');
        avisoModo(); render();
      } catch (e) { alert('No se pudieron subir: ' + e.message); $('btnSubir').disabled = false; }
    });
  }

  async function render() {
    const wrap = $('listWrap');
    let items;
    try { items = await Legio.storage.list(); }
    catch (e) {
      wrap.innerHTML = '<div class="card crm-msg crm-msg--err">No se pudieron cargar los avalúos: ' + e.message + '</div>';
      return;
    }
    items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const cuenta = document.getElementById('count');
    if (cuenta) cuenta.textContent = items.length === 1 ? '1 avalúo' : items.length + ' avalúos';
    if (!items.length) {
      wrap.innerHTML = '<div class="card int-empty">Aún no hay avalúos. Crea el primero con <strong>+ Nuevo avalúo</strong>.</div>';
      return;
    }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    wrap.innerHTML =
      '<div class="card card--pad0"><div class="tabla-scroll"><table class="int-table"><thead><tr>' +
      '<th>Cliente</th><th>Folio</th><th>Ciudad</th><th>Fecha</th><th>Valor concluido</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      items.map(a => `<tr>
        <td><span class="celda-id">
          <span class="avatar avatar--gris">${esc((a.cliente || '?')[0])}</span>
          <span class="celda-id__txt"><b>${esc(a.cliente || 'Sin cliente')}</b>
            <span>${esc(a.ciudad || '—')}</span></span>
        </span></td>
        <td class="td-sub">${esc(a.folio || '—')}</td>
        <td class="td-sub">${esc(a.ciudad || '—')}</td>
        <td class="td-sub" style="white-space:nowrap;">${fmtFecha(a.fecha)}</td>
        <td class="td-num"><strong>${fmtMXN(a.concluido)}</strong></td>
        <td>${a.concluido
              ? '<span class="status-badge status-badge--disponible">Concluido</span>'
              : '<span class="status-badge status-badge--borrador">En proceso</span>'}</td>
        <td><div class="int-table__actions">
          <a class="btn btn--ghost btn--sm" href="avaluo.html?id=${a.id}">Editar</a>
          <a class="btn btn--primary btn--sm" href="informe.html?id=${a.id}" target="_blank" rel="noopener">Informe</a>
          <button class="btn btn--danger btn--sm" data-del="${a.id}">Eliminar</button>
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div></div>';

    wrap.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este avalúo? Esta acción no se puede deshacer.')) return;
        await Legio.storage.remove(btn.dataset.del);
        render();
      });
    });
  }

  // ── Login ──
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = '';
    const ok = await Legio.auth.login($('pwd').value);
    if (ok) { $('pwd').value = ''; mostrarPantalla(); }
    else $('loginError').textContent = 'Contraseña incorrecta.';
  });

  // ── Exportar / Importar ──
  $('btnExport').addEventListener('click', async () => {
    const json = await Legio.storage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'legio-avaluos-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const total = await Legio.storage.importAll(await file.text());
      alert('Respaldo importado. Avalúos totales: ' + total);
      render();
    } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
    e.target.value = '';
  });

  mostrarPantalla();
})();
