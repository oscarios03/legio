/* ===== REVISIÓN DE PROPIEDADES (solo admin) =====
 * Cola de propiedades que un asesor subió o editó y esperan aprobación.
 * Acciones: aprobar (publica), editar, devolver (con observaciones), desechar.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;

  let PEND = [];

  async function cargar() {
    try {
      PEND = await Legio.crm.propiedades.pendientesRevision();
      render();
    } catch (e) {
      $('listWrap').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron cargar: ' + U.esc(e.message) + '</div>';
    }
  }

  function render() {
    $('count').textContent = PEND.length === 1 ? '1 por revisar' : PEND.length + ' por revisar';
    if (!PEND.length) {
      $('listWrap').innerHTML = '<div class="int-card int-empty">No hay propiedades pendientes de revisión. 🎉</div>';
      return;
    }
    $('listWrap').innerHTML =
      '<div class="tabla-scroll"><table class="int-table"><thead><tr>' +
      '<th></th><th>Título</th><th>Tipo</th><th>Ciudad</th><th>Precio</th><th>Subió</th><th>Actualizada</th><th></th>' +
      '</tr></thead><tbody>' +
      PEND.map(p => `<tr data-row="${p.id}">
        <td>${p.foto_principal_url
              ? `<img class="crm-thumb" src="${U.esc(p.foto_principal_url)}" alt="" />`
              : `<span class="crm-thumb crm-thumb--ph">—</span>`}</td>
        <td><strong>${U.esc(p.titulo)}</strong><br><span class="td-sub">${U.esc(p.colonia || '')}</span></td>
        <td>${U.etTipo(p.tipo)} · ${p.operacion === 'renta' ? 'Renta' : 'Venta'}</td>
        <td>${U.esc(p.ciudad || '—')}</td>
        <td>${U.fmtMXN(p.precio)}</td>
        <td>${p.autor ? U.esc(p.autor.nombre) : (p.captador ? U.esc(p.captador.nombre) : '—')}</td>
        <td style="white-space:nowrap;">${U.fmtFecha(p.updated_at)}</td>
        <td><div class="int-table__actions">
          <a class="btn btn--ghost btn--sm" href="propiedad-form.html?id=${p.id}">Ver / editar</a>
          <button class="btn btn--gold btn--sm" data-aprobar="${p.id}">Aprobar</button>
          <button class="btn btn--ghost btn--sm" data-devolver="${p.id}">Devolver</button>
          <button class="btn btn--danger btn--sm" data-desechar="${p.id}">Desechar</button>
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div>';

    $('listWrap').querySelectorAll('[data-aprobar]').forEach(b => b.addEventListener('click', () => resolver(b.dataset.aprobar, 'aprobar')));
    $('listWrap').querySelectorAll('[data-devolver]').forEach(b => b.addEventListener('click', () => resolver(b.dataset.devolver, 'devolver')));
    $('listWrap').querySelectorAll('[data-desechar]').forEach(b => b.addEventListener('click', () => resolver(b.dataset.desechar, 'desechar')));
  }

  async function resolver(id, accion) {
    let observaciones = null;
    if (accion === 'devolver') {
      observaciones = prompt('¿Qué debe corregir el asesor? (se le mostrará en la ficha)');
      if (observaciones === null) return;                 // canceló
      if (!observaciones.trim()) { alert('Escribe las observaciones para devolverla.'); return; }
    } else if (accion === 'desechar') {
      if (!confirm('¿Desechar esta propiedad? Se conserva el registro pero no se publica.')) return;
      observaciones = prompt('Motivo del descarte (se le mostrará al asesor):');
      if (observaciones === null) return;
      if (!observaciones.trim()) { alert('Escribe el motivo del descarte.'); return; }
    }
    // Evitar doble clic mientras resuelve.
    const fila = $('listWrap').querySelector(`[data-row="${id}"]`);
    if (fila) fila.querySelectorAll('button, a').forEach(el => el.setAttribute('disabled', 'disabled'));
    try {
      await Legio.crm.propiedades.resolverRevision(id, accion, observaciones);
      PEND = PEND.filter(p => p.id !== id);
      render();
    } catch (e) {
      alert('No se pudo completar: ' + e.message);
      if (fila) fila.querySelectorAll('button, a').forEach(el => el.removeAttribute('disabled'));
    }
  }

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

  (async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
    cargar();
  })();
})();
