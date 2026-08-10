/* ===== PROSPECTOS / LEADS (CRM) — lista =====
 * Filtros, búsqueda, contacto en un clic y exportación.
 * El seguimiento a fondo de cada prospecto vive en lead.html.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;
  const ico = Legio.ico.svg;

  let ASESORES = [];
  let LEADS = [];              // resultado del último query (sin filtro de texto)
  const ESTADOS = ['nuevo','contactado','cita','cerrado','perdido'];

  // ---- Carga y filtrado ------------------------------------------------------
  async function cargar() {
    const filtros = {
      estatus: $('f-estatus').value,
      origen:  $('f-origen').value,
      asesorId: $('f-asesor').value,
    };
    Object.keys(filtros).forEach(k => { if (!filtros[k]) delete filtros[k]; });
    try {
      LEADS = await Legio.crm.leads.list(filtros);
      aplicarFiltrosLocales();
    } catch (e) {
      $('listWrap').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron cargar los leads: ' + U.esc(e.message) + '</div>';
    }
  }

  function aplicarFiltrosLocales() {
    const txt = ($('f-buscar').value || '').toLowerCase().trim();
    const urg = $('f-urgencia').value;
    const hoy = U.hoyISO();

    const lista = LEADS.filter(l => {
      if (txt) {
        const heno = [l.nombre, l.telefono, l.email, l.ciudad].map(v => String(v || '').toLowerCase()).join(' ');
        if (!heno.includes(txt)) return false;
      }
      if (urg === 'sin-contactar') return !l.ultimo_contacto_at && l.estatus === 'nuevo';
      if (urg === 'vencidos')      return l.proximo_seguimiento && l.proximo_seguimiento < hoy && !['cerrado','perdido'].includes(l.estatus);
      if (urg === 'hoy')           return l.proximo_seguimiento === hoy;
      return true;
    });
    render(lista);
  }

  // ---- Render ----------------------------------------------------------------
  function selectAsesor(lead) {
    return `<select data-asignar="${lead.id}">
      <option value="">Sin asignar</option>
      ${ASESORES.map(a => `<option value="${a.id}" ${a.id === lead.asesor_id ? 'selected' : ''}>${U.esc(a.nombre || a.email)}</option>`).join('')}
    </select>`;
  }

  function selectEstatus(lead) {
    return `<select data-estatus="${lead.id}" class="sel-estatus sel-estatus--${lead.estatus}">
      ${ESTADOS.map(s => `<option value="${s}" ${s === lead.estatus ? 'selected' : ''}>${U.etEstatus(s)}</option>`).join('')}
    </select>`;
  }

  // Celda de seguimiento: lo que le dice al asesor si este lead está urgido.
  function celdaSeguimiento(l) {
    if (['cerrado','perdido'].includes(l.estatus)) return '<span class="td-sub">—</span>';
    const hoy = U.hoyISO();
    if (!l.proximo_seguimiento) {
      return !l.ultimo_contacto_at
        ? '<span class="pill pill--urgente">Sin contactar</span>'
        : '<span class="td-sub">Sin agendar</span>';
    }
    if (l.proximo_seguimiento < hoy)  return `<span class="pill pill--urgente">Vencido · ${U.fmtFecha(l.proximo_seguimiento)}</span>`;
    if (l.proximo_seguimiento === hoy) return '<span class="pill pill--hoy">Hoy</span>';
    return `<span class="pill pill--futuro">${U.fmtFecha(l.proximo_seguimiento)}</span>`;
  }

  function acciones(l) {
    const wa = l.telefono
      ? `<a class="btn btn--wa btn--sm" href="${U.waLink(l.telefono, U.plantillaWA(l))}" target="_blank" rel="noopener" data-wa="${l.id}" title="WhatsApp">${ico('chat')}</a>`
      : '';
    const tel = l.telefono
      ? `<a class="btn btn--ghost btn--sm" href="${U.telLink(l.telefono)}" title="Llamar">${ico('telefono')}</a>`
      : '';
    return `<div class="int-table__actions">
      ${wa}${tel}
      <a class="btn btn--ghost btn--sm" href="lead.html?id=${l.id}">Ver ficha</a>
    </div>`;
  }

  // Color estable por nombre: la lista se distingue de un vistazo.
  const TONOS = ['', 'avatar--gold', 'avatar--ok', 'avatar--plum'];
  function tono(l) {
    const s = String(l.nombre || l.id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % TONOS.length;
    return TONOS[h];
  }

  const DOT = { nuevo: 'dot--bad', contactado: 'dot--info', cita: 'dot--warn', cerrado: 'dot--ok', perdido: '' };

  function render(leads) {
    $('count').textContent = leads.length === 1 ? '1 prospecto' : leads.length + ' prospectos';
    const wrap = $('listWrap');
    if (!leads.length) {
      wrap.innerHTML = '<div class="card int-empty">No hay prospectos con esos filtros.</div>';
      return;
    }
    wrap.innerHTML =
      '<div class="card card--pad0"><div class="tabla-scroll"><table class="int-table int-table--acciones"><thead><tr>' +
      '<th>Prospecto</th><th>Contacto</th><th>Origen</th><th>Seguimiento</th><th>Asesor</th><th>Estatus</th><th></th>' +
      '</tr></thead><tbody>' +
      leads.map(l => `<tr>
        <td>
          <a class="celda-id" href="lead.html?id=${l.id}">
            <span class="avatar ${tono(l)}">${U.esc((l.nombre || '?')[0])}</span>
            <span class="celda-id__txt">
              <b>${U.esc(l.nombre || 'Sin nombre')}</b>
              <span><i class="dot ${DOT[l.estatus] || ''}"></i>${l.ciudad ? U.esc(l.ciudad) + ' · ' : ''}${U.esc(U.haceCuanto(l.created_at))}</span>
            </span>
          </a>
          ${l.propiedad ? '<span class="td-sub">Interés: ' + U.esc(l.propiedad.titulo) + '</span>' : ''}
        </td>
        <td>${l.telefono ? U.esc(l.telefono) : ''}${l.telefono && l.email ? '<br>' : ''}${l.email ? '<span class="td-sub">' + U.esc(l.email) + '</span>' : ''}</td>
        <td><span class="badge-origen">${U.etOrigen(l.origen)}</span></td>
        <td>${celdaSeguimiento(l)}</td>
        <td>${selectAsesor(l)}</td>
        <td>${selectEstatus(l)}</td>
        <td>${acciones(l)}</td>
      </tr>`).join('') +
      '</tbody></table></div></div>';

    wrap.querySelectorAll('[data-asignar]').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await Legio.crm.leads.asignar(sel.dataset.asignar, sel.value || null);
        await Legio.crm.actividades.add(sel.dataset.asignar, 'sistema', 'Asignado a: ' + sel.selectedOptions[0].textContent);
      } catch (e) { alert('Error: ' + e.message); }
    }));

    // Marcar "perdido" desde la lista exige el motivo: se manda a la ficha.
    wrap.querySelectorAll('[data-estatus]').forEach(sel => sel.addEventListener('change', async () => {
      const id = sel.dataset.estatus;
      if (sel.value === 'perdido') { location.href = 'lead.html?id=' + id; return; }
      try {
        await Legio.crm.leads.setEstatus(id, sel.value);
        await Legio.crm.actividades.add(id, 'sistema', 'Estatus cambiado a: ' + U.etEstatus(sel.value));
        sel.className = 'sel-estatus sel-estatus--' + sel.value;
      } catch (e) { alert('Error: ' + e.message); }
    }));

    // Abrir WhatsApp cuenta como contacto: queda en la bitácora.
    wrap.querySelectorAll('[data-wa]').forEach(a => a.addEventListener('click', () => {
      Legio.crm.actividades.add(a.dataset.wa, 'whatsapp', 'Le escribí por WhatsApp desde la lista.').catch(() => {});
    }));
  }

  // ---- Exportar --------------------------------------------------------------
  function exportar() {
    const txt = ($('f-buscar').value || '').toLowerCase().trim();
    const filas = LEADS.filter(l => !txt || [l.nombre, l.telefono, l.email].join(' ').toLowerCase().includes(txt))
      .map(l => ({
        fecha: U.fmtFecha(l.created_at),
        nombre: l.nombre || '',
        telefono: l.telefono || '',
        email: l.email || '',
        ciudad: l.ciudad || '',
        origen: U.etOrigen(l.origen),
        estatus: U.etEstatus(l.estatus),
        asesor: l.asesor ? l.asesor.nombre : 'Sin asignar',
        seguimiento: l.proximo_seguimiento || '',
        ultimo_contacto: l.ultimo_contacto_at ? U.fmtFecha(l.ultimo_contacto_at) : 'Nunca',
        motivo_perdida: l.motivo_perdida || '',
        propiedad: l.propiedad ? l.propiedad.titulo : '',
        mensaje: l.mensaje || '',
      }));
    U.descargarCSV('legio-prospectos-' + U.hoyISO() + '.csv', [
      ['fecha','Fecha'], ['nombre','Nombre'], ['telefono','Teléfono'], ['email','Correo'],
      ['ciudad','Ciudad'], ['origen','Origen'], ['estatus','Estatus'], ['asesor','Asesor'],
      ['seguimiento','Próximo seguimiento'], ['ultimo_contacto','Último contacto'],
      ['motivo_perdida','Motivo de pérdida'], ['propiedad','Propiedad de interés'], ['mensaje','Mensaje'],
    ], filas);
  }

  // ---- Modal de lead manual --------------------------------------------------
  const campos = ['m-nombre','m-tel','m-email','m-msg','m-ciudad'];

  $('btnNuevo').addEventListener('click', () => { $('modal').style.display = 'flex'; $('m-nombre').focus(); });
  $('mCancel').addEventListener('click', cerrarModal);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) cerrarModal(); });

  function cerrarModal() {
    $('modal').style.display = 'none';
    campos.forEach(id => $(id).value = '');
    $('m-dup').innerHTML = '';
  }

  // Avisa de duplicados mientras el usuario teclea el contacto.
  let dupTimer;
  ['m-tel','m-email'].forEach(id => $(id).addEventListener('input', () => {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      const tel = $('m-tel').value.trim(), email = $('m-email').value.trim();
      if (tel.replace(/\D/g,'').length < 10 && !email.includes('@')) { $('m-dup').innerHTML = ''; return; }
      try {
        const dups = await Legio.crm.leads.duplicados({ telefono: tel, email });
        $('m-dup').innerHTML = dups.length
          ? `<div class="crm-msg crm-msg--warn">Ya existe un prospecto con estos datos:
              ${dups.map(d => `<a href="lead.html?id=${d.id}">${U.esc(d.nombre || 'Sin nombre')}</a>`).join(', ')}.</div>`
          : '';
      } catch (e) { /* el aviso es un extra */ }
    }, 400);
  }));

  $('mSave').addEventListener('click', async () => {
    const nombre = $('m-nombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio.'); return; }
    $('mSave').disabled = true;
    try {
      const yo = await Legio.crmAuth.currentAsesor();
      const lead = await Legio.crm.leads.save({
        nombre,
        telefono: $('m-tel').value.trim() || null,
        email: $('m-email').value.trim() || null,
        ciudad: $('m-ciudad').value.trim() || null,
        mensaje: $('m-msg').value.trim() || null,
        origen: $('m-origen').value,
        estatus: 'nuevo',
        asesor_id: yo ? yo.id : null,   // el que lo captura se queda con él
      });
      cerrarModal();
      location.href = 'lead.html?id=' + lead.id;
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
    $('mSave').disabled = false;
  });

  $('btnCSV').addEventListener('click', exportar);

  // ---- Init ------------------------------------------------------------------
  async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    await Legio.shell.montar({ page: 'leads' });

    // Permite entrar ya filtrado desde el panel: leads.html?urgencia=vencidos
    const params = new URLSearchParams(location.search);
    if (params.get('urgencia')) $('f-urgencia').value = params.get('urgencia');
    if (params.get('estatus'))  $('f-estatus').value  = params.get('estatus');
    if (params.get('origen'))   $('f-origen').value   = params.get('origen');
    if (params.get('nuevo'))    $('btnNuevo').click();

    try {
      ASESORES = await Legio.crm.asesores.list();
      $('f-asesor').innerHTML = '<option value="">Todos</option><option value="sin">Sin asignar</option>' +
        ASESORES.map(a => `<option value="${a.id}">${U.esc(a.nombre || a.email)}</option>`).join('');
    } catch (e) { /* si falla, seguimos sin dropdown de asesores */ }

    ['f-estatus','f-origen','f-asesor'].forEach(id => $(id).addEventListener('change', cargar));
    ['f-buscar'].forEach(id => $(id).addEventListener('input', aplicarFiltrosLocales));
    $('f-urgencia').addEventListener('change', aplicarFiltrosLocales);
    cargar();
  }

  init();
})();
