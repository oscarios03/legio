/* ===== LISTA DE PROPIEDADES (CRM) ===== */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;
  const ico = Legio.ico.svg;

  let TODAS = [];
  let INTERESADOS = {};   // propiedad_id -> nº de prospectos interesados
  let esAdmin = false;

  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const badge = estatus => `<span class="status-badge status-badge--${estatus}">${cap(estatus)}</span>`;

  /* Estado de revisión. Es lo que de verdad decide si la propiedad sale al
   * sitio: la política RLS `prop_public_sel` exige `aprobada`, así que una
   * ficha "pública" pero pendiente sigue invisible para el cliente. */
  const REV = {
    pendiente: { et: 'Por revisar', clase: 'hoy' },
    aprobada:  { et: 'Aprobada',    clase: 'neutro' },
    devuelta:  { et: 'Devuelta',    clase: 'urgente' },
    desechada: { et: 'Desechada',   clase: 'neutro' },
  };

  /* Lo que ve el cliente, que no es lo mismo que la casilla del formulario:
   * hacen falta las tres condiciones de `prop_public_sel`. */
  function enElSitio(p) {
    if (!p.publica) return 'Sin publicar';
    if (p.estatus !== 'disponible') return 'No visible (' + p.estatus + ')';
    if (p.revision_estado !== 'aprobada') return '<i class="dot dot--warn"></i>Falta aprobar';
    return '<i class="dot dot--ok"></i>En el sitio';
  }

  function celdaRevision(p) {
    const r = REV[p.revision_estado] || REV.pendiente;
    const obs = p.revision_observaciones
      ? `<span class="td-sub td-nowrap" title="${U.esc(p.revision_observaciones)}">${U.esc(p.revision_observaciones.slice(0, 24))}…</span>`
      : '';
    return `<span class="pill pill--${r.clase}">${r.et}</span>${obs ? '<br>' + obs : ''}`;
  }

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
    const est = $('f-estatus').value, ciu = $('f-ciudad').value, tip = $('f-tipo').value,
          ase = $('f-asesor').value, rev = $('f-revision').value;
    const lista = TODAS.filter(p =>
      (!est || p.estatus === est) &&
      (!ciu || p.ciudad === ciu) &&
      (!tip || p.tipo === tip) &&
      (!ase || p.asesor_captador_id === ase) &&
      (!rev || (p.revision_estado || 'pendiente') === rev) &&
      (!txt || (p.titulo || '').toLowerCase().includes(txt) || (p.colonia || '').toLowerCase().includes(txt))
    );
    render(lista);
    avisoRevision();
  }

  /* Aviso arriba de la lista. Sin esto, una propiedad capturada se queda
   * invisible en el sitio y nadie entiende por qué: la casilla "mostrar en el
   * sitio público" está puesta, pero el dictamen falta. */
  function avisoRevision() {
    const caja = $('avisoRevision');
    if (!caja) return;
    const pend = TODAS.filter(p => (p.revision_estado || 'pendiente') === 'pendiente');
    const devueltas = TODAS.filter(p => p.revision_estado === 'devuelta');

    if (esAdmin && pend.length) {
      caja.innerHTML = `<div class="crm-msg crm-msg--warn">
        Hay <strong>${pend.length}</strong> propiedad(es) esperando tu revisión. Hasta que las apruebes
        no salen al sitio público.
        <button class="btn btn--primary btn--sm" id="verPend" style="margin-left:8px;">Ver solo esas</button>
      </div>`;
      $('verPend').addEventListener('click', () => { $('f-revision').value = 'pendiente'; aplicar(); });
      return;
    }
    if (!esAdmin && devueltas.length) {
      caja.innerHTML = `<div class="crm-msg crm-msg--err">
        <strong>${devueltas.length}</strong> propiedad(es) te fueron devueltas con observaciones.
        Corrígelas y vuelve a guardarlas para que entren otra vez a revisión.
      </div>`;
      return;
    }
    caja.innerHTML = '';
  }

  function render(lista) {
    $('count').textContent = lista.length === 1 ? '1 propiedad' : lista.length + ' propiedades';
    const wrap = $('listWrap');
    if (!lista.length) {
      wrap.innerHTML = '<div class="card int-empty">No hay propiedades con esos filtros. Crea una con <strong>+ Nueva propiedad</strong>.</div>';
      return;
    }
    wrap.innerHTML =
      '<div class="card card--pad0"><div class="tabla-scroll"><table class="int-table int-table--acciones"><thead><tr>' +
      '<th>Propiedad</th><th>Tipo</th><th>Precio</th><th>Estatus</th><th>Revisión</th>' +
      '<th>En mercado</th><th>Interesados</th><th>Captador</th><th></th>' +
      '</tr></thead><tbody>' +
      lista.map(p => `<tr>
        <td>
          <a class="celda-id" href="propiedad-form.html?id=${p.id}">
            ${p.foto_principal_url
              ? `<img class="crm-thumb" src="${U.esc(p.foto_principal_url)}" alt="" />`
              : `<span class="crm-thumb crm-thumb--ph">${ico('casa')}</span>`}
            <span class="celda-id__txt">
              <b>${U.esc(p.titulo)}</b>
              <span>${U.esc([p.colonia, p.ciudad].filter(Boolean).join(' · ') || '—')}</span>
            </span>
          </a>
        </td>
        <td class="td-sub">${U.etTipo(p.tipo)} · ${p.operacion === 'renta' ? 'Renta' : 'Venta'}</td>
        <td class="td-num">${U.fmtMXN(p.precio)}</td>
        <td>${badge(p.estatus)}
          <span class="td-sub td-nowrap" style="display:flex;align-items:center;gap:5px;margin-top:4px;">
            ${enElSitio(p)}</span></td>
        <td>${celdaRevision(p)}</td>
        <td>${celdaDias(p)}</td>
        <td>${INTERESADOS[p.id]
              ? `<a href="propiedad-form.html?id=${p.id}#interesados" title="Ver interesados"><strong>${INTERESADOS[p.id]}</strong></a>`
              : '<span class="td-sub">0</span>'}</td>
        <td class="td-sub">${p.captador ? U.esc(p.captador.nombre) : '—'}</td>
        <td><div class="int-table__actions">
          ${esAdmin && (p.revision_estado || 'pendiente') === 'pendiente'
            ? `<button class="btn btn--primary btn--sm" data-rev="${p.id}">Revisar</button>` : ''}
          ${p.publica && p.estatus === 'disponible' && p.revision_estado === 'aprobada'
            ? `<button class="btn btn--ghost btn--sm" data-share="${p.id}" data-titulo="${U.esc(p.titulo)}" title="Compartir ficha">${ico('sitio')}</button>`
            : ''}
          <a class="btn btn--ghost btn--sm" href="propiedad-form.html?id=${p.id}">Editar</a>
          ${esAdmin ? `<button class="btn btn--danger btn--sm" data-del="${p.id}">Eliminar</button>` : ''}
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div></div>';

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

    wrap.querySelectorAll('[data-rev]').forEach(btn => {
      btn.addEventListener('click', () => abrirRevision(btn.dataset.rev));
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

  // ---- Dictamen -------------------------------------------------------------
  let REVISANDO = null;

  function abrirRevision(id) {
    const p = TODAS.find(x => x.id === id);
    if (!p) return;
    REVISANDO = p;
    $('revTitulo').textContent = p.titulo;
    $('revSub').textContent = [U.etTipo(p.tipo), p.colonia, p.ciudad, U.fmtMXN(p.precio)]
      .filter(Boolean).join(' · ');
    $('rev-obs').value = p.revision_observaciones || '';
    $('revHint').textContent = p.captador
      ? 'Las verá ' + p.captador.nombre + ' en su lista de propiedades.'
      : 'Las verá quien la capturó, en su lista de propiedades.';
    $('modalRev').style.display = 'flex';
    $('rev-obs').focus();
  }

  function cerrarRevision() { $('modalRev').style.display = 'none'; REVISANDO = null; }

  async function dictaminar(estado) {
    if (!REVISANDO) return;
    const obs = $('rev-obs').value.trim();
    // Devolver sin decir qué corregir deja al captador adivinando.
    if ((estado === 'devuelta' || estado === 'desechada') && !obs) {
      alert('Escribe las observaciones: es lo único que el captador va a ver para saber qué corregir.');
      $('rev-obs').focus();
      return;
    }
    const botones = ['revAprobar','revDevolver','revDesechar'];
    botones.forEach(b => $(b).disabled = true);
    try {
      const fila = await Legio.crm.propiedades.revisar(REVISANDO.id, estado, obs);
      Object.assign(REVISANDO, fila);
      cerrarRevision();
      aplicar();
    } catch (e) {
      alert('No se pudo guardar el dictamen: ' + e.message);
    }
    botones.forEach(b => $(b).disabled = false);
  }

  $('revCancel').addEventListener('click', cerrarRevision);
  $('modalRev').addEventListener('click', e => { if (e.target === $('modalRev')) cerrarRevision(); });
  $('revAprobar').addEventListener('click', () => dictaminar('aprobada'));
  $('revDevolver').addEventListener('click', () => dictaminar('devuelta'));
  $('revDesechar').addEventListener('click', () => dictaminar('desechada'));

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
    const info = await Legio.shell.montar({ page: 'propiedades' });
    esAdmin = info.admin;

    // Permite entrar ya filtrado desde el panel: crm.html?estatus=vendida
    const params = new URLSearchParams(location.search);
    if (params.get('estatus'))  $('f-estatus').value  = params.get('estatus');
    if (params.get('revision')) $('f-revision').value = params.get('revision');
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
      ['f-buscar','f-estatus','f-ciudad','f-tipo','f-asesor','f-revision'].forEach(id => {
        $(id).addEventListener(id === 'f-buscar' ? 'input' : 'change', aplicar);
      });
      aplicar();
    } catch (e) {
      $('listWrap').innerHTML = '<div class="card crm-msg crm-msg--err">No se pudieron cargar las propiedades: ' + U.esc(e.message) + '</div>';
    }
  }

  init();
})();
