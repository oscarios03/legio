/* ===== LISTA DE PROPIEDADES (CRM) ===== */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;

  let TODAS = [];
  let INTERESADOS = {};   // propiedad_id -> nº de prospectos interesados
  let esAdmin = false;

  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const badge = estatus => `<span class="status-badge status-badge--${estatus}">${cap(estatus)}</span>`;

  // Los días en mercado son la señal más útil para saber qué propiedad está atorada.
  function celdaDias(p) {
    const d = Legio.crm.propiedades.diasEnMercado(p);
    if (d == null) return '—';
    if (p.estatus === 'vendida') return `<span class="td-sub">${d} días</span>`;
    const clase = d > 180 ? 'urgente' : (d > 90 ? 'hoy' : 'futuro');
    return `<span class="pill pill--${clase}">${d} días</span>`;
  }

  function aplicar() {
    const txt = ($('f-buscar').value || '').toLowerCase().trim();
    const est = $('f-estatus').value, ciu = $('f-ciudad').value, tip = $('f-tipo').value, ase = $('f-asesor').value;
    const lista = TODAS.filter(p =>
      (!est || p.estatus === est) &&
      (!ciu || p.ciudad === ciu) &&
      (!tip || p.tipo === tip) &&
      (!ase || p.asesor_captador_id === ase) &&
      (!txt || (p.titulo || '').toLowerCase().includes(txt) || (p.colonia || '').toLowerCase().includes(txt))
    );
    render(lista);
  }

  function render(lista) {
    $('count').textContent = lista.length === 1 ? '1 propiedad' : lista.length + ' propiedades';
    const wrap = $('listWrap');
    if (!lista.length) {
      wrap.innerHTML = '<div class="int-card int-empty">No hay propiedades con esos filtros. Crea una con <strong>+ Nueva propiedad</strong>.</div>';
      return;
    }
    wrap.innerHTML =
      '<div class="tabla-scroll"><table class="int-table"><thead><tr>' +
      '<th></th><th>Título</th><th>Tipo</th><th>Ciudad</th><th>Precio</th><th>Estatus</th>' +
      '<th>En mercado</th><th>Interesados</th><th>Público</th><th>Captador</th><th></th>' +
      '</tr></thead><tbody>' +
      lista.map(p => `<tr>
        <td>${p.foto_principal_url
              ? `<img class="crm-thumb" src="${U.esc(p.foto_principal_url)}" alt="" />`
              : `<span class="crm-thumb crm-thumb--ph">—</span>`}</td>
        <td><strong>${U.esc(p.titulo)}</strong><br><span class="td-sub">${U.esc(p.colonia || '')}</span></td>
        <td>${U.etTipo(p.tipo)} · ${p.operacion === 'renta' ? 'Renta' : 'Venta'}</td>
        <td>${U.esc(p.ciudad || '—')}</td>
        <td>${U.fmtMXN(p.precio)}</td>
        <td>${badge(p.estatus)}</td>
        <td>${celdaDias(p)}</td>
        <td>${INTERESADOS[p.id]
              ? `<a href="propiedad-form.html?id=${p.id}#interesados" title="Ver interesados"><strong>${INTERESADOS[p.id]}</strong></a>`
              : '<span class="td-sub">0</span>'}</td>
        <td>${p.publica ? 'Sí' : 'No'}</td>
        <td>${p.captador ? U.esc(p.captador.nombre) : '—'}</td>
        <td><div class="int-table__actions">
          ${p.publica && p.estatus === 'disponible'
            ? `<button class="btn btn--ghost btn--sm" data-share="${p.id}" data-titulo="${U.esc(p.titulo)}" title="Compartir ficha">🔗</button>`
            : ''}
          <a class="btn btn--ghost btn--sm" href="propiedad-form.html?id=${p.id}">Editar</a>
          ${esAdmin ? `<button class="btn btn--danger btn--sm" data-del="${p.id}">Eliminar</button>` : ''}
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div>';

    wrap.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta propiedad y sus fotos? No se puede deshacer.')) return;
        try {
          await Legio.crm.propiedades.remove(btn.dataset.del);
          TODAS = TODAS.filter(p => p.id !== btn.dataset.del);
          aplicar();
        } catch (e) { alert('No se pudo eliminar: ' + e.message); }
      });
    });

    // Compartir: manda la ficha pública por WhatsApp con un solo clic.
    wrap.querySelectorAll('[data-share]').forEach(btn => {
      btn.addEventListener('click', () => {
        const link = U.linkPropiedad(btn.dataset.share);
        const texto = `Te comparto esta propiedad de Legio Inmobiliaria:\n\n${btn.dataset.titulo}\n${link}`;
        window.open(U.waLink('', texto), '_blank', 'noopener');
        U.copiar(link);
      });
    });
  }

  function poblarFiltros() {
    const ciudades = [...new Set(TODAS.map(p => p.ciudad).filter(Boolean))].sort();
    $('f-ciudad').innerHTML = '<option value="">Todas</option>' + ciudades.map(c => `<option>${U.esc(c)}</option>`).join('');
  }

  // Cuántos prospectos declararon interés en cada propiedad.
  async function contarInteresados() {
    try {
      const leads = await Legio.crm.leads.list({});
      INTERESADOS = {};
      leads.forEach(l => { if (l.propiedad_id) INTERESADOS[l.propiedad_id] = (INTERESADOS[l.propiedad_id] || 0) + 1; });
    } catch (e) { /* la columna se queda en 0: no es crítico */ }
  }

  async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    esAdmin = await Legio.crmAuth.isAdmin();
    try {
      const [props, asesores] = await Promise.all([
        Legio.crm.propiedades.list(),
        Legio.crm.asesores.list(),
      ]);
      TODAS = props;
      await contarInteresados();
      poblarFiltros();
      $('f-asesor').innerHTML = '<option value="">Todos</option>' +
        asesores.map(a => `<option value="${a.id}">${U.esc(a.nombre || a.email)}</option>`).join('');
      ['f-buscar','f-estatus','f-ciudad','f-tipo','f-asesor'].forEach(id => {
        $(id).addEventListener(id === 'f-buscar' ? 'input' : 'change', aplicar);
      });
      aplicar();
    } catch (e) {
      $('listWrap').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron cargar las propiedades: ' + U.esc(e.message) + '</div>';
    }
  }

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

  init();
})();
