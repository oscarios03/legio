/* ===== HOME DEL CRM (login + pendientes + búsqueda global) ===== */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;

  function verLogin() {
    $('loginCard').style.display = '';
    $('topBar').style.display = 'none';
    $('home').style.display = 'none';
    if (!window.sb) $('configWarn').style.display = '';
  }

  async function verHome() {
    const asesor = await Legio.crmAuth.currentAsesor();
    const admin  = await Legio.crmAuth.isAdmin();
    $('loginCard').style.display = 'none';
    $('topBar').style.display = '';
    $('home').style.display = '';

    const nombre = (asesor && asesor.nombre) || (asesor && asesor.email) || '';
    $('userLabel').textContent = nombre ? (nombre + (admin ? ' · admin' : '')) : '';
    $('welcome').textContent = nombre ? ('Hola, ' + nombre.split(' ')[0] + '.') : '';

    ['cardComisiones','cardAsesores','cardMetricas'].forEach(id => {
      $(id).style.display = admin ? '' : 'none';
    });

    cargarPendientes(asesor, admin);
    conectarBuscador();
  }

  // ---- Pendientes del día ----------------------------------------------------
  /* El admin ve los de toda la oficina; el asesor, los suyos y los que aún
   * no tienen dueño. Es lo primero que debe ver al abrir el CRM. */
  async function cargarPendientes(asesor, admin) {
    if (!asesor) return;
    let p;
    try { p = await Legio.crm.leads.pendientes(admin ? null : asesor.id); }
    catch (e) { console.warn('[Legio] No se pudieron cargar los pendientes:', e.message); return; }

    const total = p.nuevos.length + p.vencidos.length + p.citas.length;
    $('pendientes').style.display = '';

    $('pendTiles').innerHTML =
      tilePend('Sin contactar', p.nuevos.length, 'urgencia=sin-contactar', p.nuevos.length ? 'urgente' : '') +
      tilePend('Seguimiento vencido', p.vencidos.length, 'urgencia=vencidos', p.vencidos.length ? 'urgente' : '') +
      tilePend('Citas esta semana', p.citas.length, 'estatus=cita', '');

    if (!total) {
      $('pendLista').innerHTML = '<div class="int-card int-empty">Todo al día. No tienes prospectos esperando respuesta. 🎉</div>';
      return;
    }

    // Los más urgentes primero: sin contactar, luego seguimientos vencidos, luego citas.
    const filas = []
      .concat(p.nuevos.map(l => ({ l, motivo: 'Nuevo · ' + U.haceCuanto(l.created_at), clase: 'urgente' })))
      .concat(p.vencidos.map(l => ({ l, motivo: 'Seguimiento vencido · ' + U.fmtFecha(l.proximo_seguimiento), clase: 'urgente' })))
      .concat(p.citas.map(l => ({ l, motivo: 'Cita · ' + U.fmtFecha(l.proximo_seguimiento), clase: 'futuro' })))
      .slice(0, 12);

    $('pendLista').innerHTML = '<div class="int-card" style="padding:0;overflow:hidden;"><div class="tabla-scroll"><table class="int-table"><tbody>' +
      filas.map(({ l, motivo, clase }) => `<tr>
        <td><a href="lead.html?id=${l.id}"><strong>${U.esc(l.nombre || 'Sin nombre')}</strong></a>
          ${l.ciudad ? '<br><span class="td-sub">' + U.esc(l.ciudad) + '</span>' : ''}</td>
        <td><span class="badge-origen">${U.etOrigen(l.origen)}</span></td>
        <td><span class="pill pill--${clase}">${U.esc(motivo)}</span></td>
        <td><div class="int-table__actions">
          ${l.telefono ? `<a class="btn btn--gold btn--sm" href="${U.waLink(l.telefono, U.plantillaWA(l))}" target="_blank" rel="noopener" title="WhatsApp">💬</a>` : ''}
          <a class="btn btn--ghost btn--sm" href="lead.html?id=${l.id}">Ver ficha</a>
        </div></td>
      </tr>`).join('') +
      '</tbody></table></div></div>';
  }

  function tilePend(etiqueta, n, query, clase) {
    return `<a class="pend__tile ${clase ? 'pend__tile--' + clase : ''}" href="leads.html?${query}">
      <strong>${n}</strong><span>${etiqueta}</span>
    </a>`;
  }

  // ---- Búsqueda global -------------------------------------------------------
  function conectarBuscador() {
    const input = $('buscarGlobal');
    const caja  = $('buscarRes');
    if (!input || input.dataset.listo) return;
    input.dataset.listo = '1';

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const t = input.value.trim();
      if (t.length < 2) { caja.hidden = true; return; }
      timer = setTimeout(() => buscar(t, caja), 300);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.buscador')) caja.hidden = true;
    });
  }

  // El inventario se trae una sola vez: filtrar en memoria evita una consulta por tecla.
  let _props = null;
  async function propiedadesCache() {
    if (!_props) _props = await Legio.crm.propiedades.list();
    return _props;
  }

  async function buscar(texto, caja) {
    try {
      const [leads, props] = await Promise.all([
        Legio.crm.leads.buscar(texto),
        propiedadesCache(),
      ]);
      const t = texto.toLowerCase();
      const propsFiltradas = props.filter(p =>
        (p.titulo || '').toLowerCase().includes(t) || (p.colonia || '').toLowerCase().includes(t)
      ).slice(0, 5);

      if (!leads.length && !propsFiltradas.length) {
        caja.innerHTML = '<div class="buscador__vacio">Sin resultados para “' + U.esc(texto) + '”.</div>';
        caja.hidden = false;
        return;
      }

      caja.innerHTML =
        (leads.length ? '<div class="buscador__grupo">Prospectos</div>' + leads.map(l => `
          <a class="buscador__item" href="lead.html?id=${l.id}">
            <strong>${U.esc(l.nombre || 'Sin nombre')}</strong>
            <span>${U.esc(l.telefono || l.email || '')} · ${U.etEstatus(l.estatus)}</span>
          </a>`).join('') : '') +
        (propsFiltradas.length ? '<div class="buscador__grupo">Propiedades</div>' + propsFiltradas.map(p => `
          <a class="buscador__item" href="propiedad-form.html?id=${p.id}">
            <strong>${U.esc(p.titulo)}</strong>
            <span>${U.esc(p.colonia || p.ciudad || '')} · ${U.fmtMXN(p.precio)}</span>
          </a>`).join('') : '');
      caja.hidden = false;
    } catch (e) {
      caja.innerHTML = '<div class="buscador__vacio">No se pudo buscar.</div>';
      caja.hidden = false;
    }
  }

  // ---- Init ------------------------------------------------------------------
  async function init() {
    const user = window.sb ? await Legio.crmAuth.getUser() : null;
    if (user) await verHome(); else verLogin();
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = '';
    if (!window.sb) { $('loginError').textContent = 'Supabase no está configurado.'; return; }
    const res = await Legio.crmAuth.login($('email').value, $('pwd').value);
    if (res.ok) { $('pwd').value = ''; await verHome(); }
    else $('loginError').textContent = res.error || 'No se pudo iniciar sesión.';
  });

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); verLogin(); });

  init();
})();
