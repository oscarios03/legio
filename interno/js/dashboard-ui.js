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

  function mostrarPantalla() {
    $('topBar').style.display = '';
    $('dashboard').style.display = '';
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
      <button class="btn btn--gold btn--sm" id="btnSubir" style="margin-left:8px;">Subirlos a la nube</button>
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
      wrap.innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron cargar los avalúos: ' + e.message + '</div>';
      return;
    }
    items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (!items.length) {
      wrap.innerHTML = '<div class="int-card int-empty">Aún no hay avalúos. Crea el primero con <strong>+ Nuevo avalúo</strong>.</div>';
      return;
    }
    wrap.innerHTML =
      '<div class="tabla-scroll"><table class="int-table"><thead><tr>' +
      '<th>Folio</th><th>Cliente</th><th>Ciudad</th><th>Fecha</th><th>Valor concluido</th><th></th>' +
      '</tr></thead><tbody>' +
      items.map(a => `<tr>
        <td>${a.folio || '—'}</td>
        <td>${a.cliente || '—'}</td>
        <td>${a.ciudad || '—'}</td>
        <td>${fmtFecha(a.fecha)}</td>
        <td>${fmtMXN(a.concluido)}</td>
        <td><div class="int-table__actions">
          <a class="btn btn--ghost btn--sm" href="avaluo.html?id=${a.id}">Editar</a>
          <a class="btn btn--gold btn--sm" href="informe.html?id=${a.id}" target="_blank" rel="noopener">Informe</a>
          <button class="btn btn--danger btn--sm" data-del="${a.id}">Eliminar</button>
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div>';

    wrap.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este avalúo? Esta acción no se puede deshacer.')) return;
        await Legio.storage.remove(btn.dataset.del);
        render();
      });
    });
  }

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

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

  // Requiere sesión del CRM (Supabase). Sin ella, al login del panel.
  (async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    mostrarPantalla();
  })();
})();
