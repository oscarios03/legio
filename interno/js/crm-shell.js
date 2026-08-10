/* ===== SHELL DEL CRM — LEGIO =====
 * Barra lateral, buscador global y cabecera. Vive en un solo archivo para que
 * todas las pantallas compartan la misma navegación: si se agrega una sección,
 * se agrega aquí y aparece en todas.
 *
 * Uso desde cada pantalla (después de validar la sesión):
 *     await Legio.shell.montar({ page: 'leads' });
 *
 * El HTML de la página solo necesita:
 *     <div class="app" id="app">
 *       <div class="main">
 *         <header class="topbar"> … </header>
 *         <div class="page"> … </div>
 *       </div>
 *     </div>
 *
 * API: Legio.shell.montar(), Legio.shell.pendientes(), Legio.ico
 */
(function () {
  window.Legio = window.Legio || {};

  /* ---- Iconografía (trazo, 24×24, hereda color) --------------------------- */
  const p = d => `<path d="${d}"/>`;
  const ico = {
    panel:      p('M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'),
    prospectos: p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
    propiedades:p('M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6'),
    avaluos:    p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6'),
    metricas:   p('M3 21h18M7 21V11M12 21V4M17 21v-7'),
    comisiones: p('M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'),
    asesores:   p('M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 11l2 2 4-4'),
    sitio:      p('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3'),
    buscar:     p('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.35-4.35'),
    plegar:     p('M3 3h18v18H3zM9 3v18'),
    menu:       p('M3 6h18M3 12h18M3 18h18'),
    salir:      p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
    campana:    p('M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'),
    calendario: p('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'),
    reloj:      p('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2'),
    mas:        p('M12 5v14M5 12h14'),
    descargar:  p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'),
    flecha:     p('M5 12h14M12 5l7 7-7 7'),
    sube:       p('M12 19V5M5 12l7-7 7 7'),
    baja:       p('M12 5v14M19 12l-7 7-7-7'),
    igual:      p('M5 12h14'),
    telefono:   p('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2'),
    chat:       p('M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20.6l1.6-5.2A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4'),
    inbox:      p('M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1'),
    tendencia:  p('M22 7 13.5 15.5l-4-4L2 19M16 7h6v6'),
    llave:      p('M21 2 19 4M15.5 8.5 19 5l-2-2-3.5 3.5M10.5 13.5a5 5 0 1 0-3 3l6-6'),
    check:      p('M20 6 9 17l-5-5'),
    alerta:     p('M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0'),
    fuego:      p('M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7'),
    casa:       p('M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5'),
    correo:     p('M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M22 8l-10 6L2 8'),
    nota:       p('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'),
    sistema:    p('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'),
  };

  // Tipo de actividad de la bitácora -> icono.
  const ICO_ACTIVIDAD = {
    llamada: 'telefono', whatsapp: 'chat', email: 'correo',
    cita: 'calendario', visita: 'casa', nota: 'nota', sistema: 'sistema',
  };

  // <svg> listo para insertar. `cls` opcional para tamaños puntuales.
  function svg(nombre, cls) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
           'stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : '') +
           ' aria-hidden="true">' + (ico[nombre] || '') + '</svg>';
  }

  /* Sustituye los marcadores <span data-ico="…"></span> por su SVG. Así el HTML
   * de cada pantalla queda legible y los iconos viven en un solo sitio. */
  function iconos(raiz) {
    (raiz || document).querySelectorAll('[data-ico]').forEach(el => {
      el.outerHTML = svg(el.dataset.ico, el.className || '');
    });
  }

  /* ---- Menú ---------------------------------------------------------------
   * `admin: true` = solo lo ve el administrador. `badge` = clave del contador. */
  const MENU = [
    { grupo: 'Esenciales', items: [
      { id: 'panel',       href: 'index.html',      et: 'Panel',       ico: 'panel' },
      { id: 'leads',       href: 'leads.html',      et: 'Prospectos',  ico: 'prospectos', badge: 'pendientes' },
      { id: 'propiedades', href: 'crm.html',        et: 'Propiedades', ico: 'propiedades' },
    ]},
    { grupo: 'Herramientas', items: [
      { id: 'avaluos',     href: 'avaluos.html',    et: 'Avalúos',     ico: 'avaluos' },
    ]},
    { grupo: 'Dirección', items: [
      { id: 'metricas',    href: 'metricas.html',   et: 'Métricas',    ico: 'metricas',   admin: true },
      { id: 'comisiones',  href: 'comisiones.html', et: 'Comisiones',  ico: 'comisiones', admin: true },
      { id: 'asesores',    href: 'asesores.html',   et: 'Asesores',    ico: 'asesores',   admin: true },
    ]},
    { grupo: 'Sitio', items: [
      { id: 'publico',     href: '../index.html',   et: 'Sitio público', ico: 'sitio', externo: true },
    ]},
  ];

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2)
    .map(x => x[0]).join('').toUpperCase() || '?';

  /* ---- Pendientes: una sola consulta compartida por toda la pantalla ------
   * Se memoriza por alcance (oficina / asesor) para que la lateral y el panel
   * no pidan lo mismo dos veces, pero cambiar de alcance sí vuelva a consultar. */
  const _pend = {};
  function pendientes(asesorId, admin) {
    const clave = admin ? 'oficina' : String(asesorId || '-');
    if (!_pend[clave]) {
      _pend[clave] = (async () => {
        try { return await Legio.crm.leads.pendientes(admin ? null : asesorId); }
        catch (e) { return { nuevos: [], vencidos: [], citas: [], error: e.message }; }
      })();
    }
    return _pend[clave];
  }

  /* ---- Montaje ------------------------------------------------------------ */
  // Quién es el usuario y si es admin: lo devuelve montar() y lo reusan las
  // pantallas, incluso si alguna llama dos veces (no se vuelve a montar nada).
  let _sesion = {};

  async function montar(opts) {
    opts = opts || {};
    const app = document.getElementById('app') || document.querySelector('.app');
    if (!app) return _sesion;
    if (app.dataset.montado) return _sesion;
    app.dataset.montado = '1';

    let asesor = null, admin = false;
    if (window.Legio.crmAuth && window.sb) {
      try {
        asesor = await Legio.crmAuth.currentAsesor();
        admin  = await Legio.crmAuth.isAdmin();
      } catch (e) { /* sin sesión: la lateral se muestra sin datos de usuario */ }
    }

    iconos(document);

    const activo = opts.page || document.body.dataset.page || '';
    const aside = document.createElement('aside');
    aside.className = 'side';
    aside.innerHTML = plantillaLateral(activo, asesor, admin);
    app.insertBefore(aside, app.firstChild);

    // Botón de cajón en móvil, a la izquierda del título.
    const titulo = document.querySelector('.topbar__title');
    if (titulo) {
      const burger = document.createElement('button');
      burger.className = 'topbar__burger';
      burger.type = 'button';
      burger.setAttribute('aria-label', 'Abrir menú');
      burger.innerHTML = svg('menu');
      burger.addEventListener('click', () => app.classList.toggle('is-open'));
      titulo.insertBefore(burger, titulo.firstChild);
    }
    app.addEventListener('click', e => {
      // Toque fuera de la lateral en móvil: cerrar.
      if (app.classList.contains('is-open') && !e.target.closest('.side') && !e.target.closest('.topbar__burger')) {
        app.classList.remove('is-open');
      }
    });

    // Plegado (se recuerda entre pantallas).
    if (localStorage.getItem('legio_side_min') === '1') app.classList.add('app--min');
    const btnPlegar = aside.querySelector('#sidePlegar');
    if (btnPlegar) btnPlegar.addEventListener('click', () => {
      app.classList.toggle('app--min');
      localStorage.setItem('legio_side_min', app.classList.contains('app--min') ? '1' : '0');
    });

    const btnSalir = aside.querySelector('#sideSalir');
    if (btnSalir) btnSalir.addEventListener('click', async () => {
      if (window.Legio.crmAuth) await Legio.crmAuth.logout();
      if (window.Legio.auth && Legio.auth.logout) Legio.auth.logout();
      location.replace('index.html');
    });

    conectarBuscador(aside);
    if (asesor) pintarBadges(aside, asesor, admin);
    _sesion = { asesor, admin };

    // Sombra de la cabecera al hacer scroll.
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const onScroll = () => topbar.classList.toggle('is-stuck', window.scrollY > 6);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    return _sesion;
  }

  function plantillaLateral(activo, asesor, admin) {
    const grupos = MENU.map(g => {
      const items = g.items.filter(it => !it.admin || admin);
      if (!items.length) return '';
      return `<div class="side__group">
        <div class="side__label">${esc(g.grupo)}</div>
        ${items.map(it => `
          <a class="side__link${it.id === activo ? ' is-active' : ''}" href="${it.href}"
             ${it.externo ? 'target="_blank" rel="noopener"' : ''} title="${esc(it.et)}">
            ${svg(it.ico)}<span>${esc(it.et)}</span>
            ${it.badge ? `<span class="side__n" data-badge="${it.badge}" hidden></span>` : ''}
          </a>`).join('')}
      </div>`;
    }).join('');

    const nombre = (asesor && asesor.nombre) || (asesor && asesor.email) || 'Equipo Legio';

    return `
      <div class="side__head">
        <div class="side__mark">L</div>
        <div class="side__id">
          <b>Legio Inmobiliaria</b>
          <span>CRM interno</span>
        </div>
        <button class="side__collapse" id="sidePlegar" type="button" aria-label="Plegar menú">${svg('plegar')}</button>
      </div>

      <div class="side__search buscador">
        ${svg('buscar')}
        <input type="search" id="sideBuscar" placeholder="Buscar…" autocomplete="off" aria-label="Buscar prospecto o propiedad" />
        <span class="side__kbd">/</span>
        <div class="buscador__res" id="sideBuscarRes" hidden></div>
      </div>

      <nav class="side__scroll">${grupos}</nav>

      <div class="side__foot">
        <div class="side__user">
          <span class="avatar avatar--gris">${esc(iniciales(nombre))}</span>
          <div>
            <b>${esc(nombre)}</b>
            <span>${admin ? 'Administrador' : 'Asesor'}</span>
          </div>
        </div>
        <button class="btn btn--ghost btn--sm btn--full" id="sideSalir" type="button">${svg('salir')} Cerrar sesión</button>
      </div>`;
  }

  // Contador de pendientes junto a “Prospectos”.
  async function pintarBadges(aside, asesor, admin) {
    const el = aside.querySelector('[data-badge="pendientes"]');
    if (!el) return;
    const p = await pendientes(asesor.id, admin);
    const n = p.nuevos.length + p.vencidos.length;
    if (!n) return;
    el.textContent = n > 99 ? '99+' : n;
    el.classList.add('side__n--alerta');
    el.hidden = false;
  }

  /* ---- Buscador global ---------------------------------------------------- */
  function conectarBuscador(aside) {
    const input = aside.querySelector('#sideBuscar');
    const caja  = aside.querySelector('#sideBuscarRes');
    if (!input) return;

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const t = input.value.trim();
      if (t.length < 2) { caja.hidden = true; return; }
      timer = setTimeout(() => buscar(t, caja), 280);
    });
    document.addEventListener('click', e => { if (!e.target.closest('.buscador')) caja.hidden = true; });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); input.focus();
      }
      if (e.key === 'Escape') { caja.hidden = true; input.blur(); }
    });
  }

  // El inventario se trae una sola vez: filtrar en memoria evita una consulta por tecla.
  let _props = null;
  async function propsCache() {
    if (!_props) _props = Legio.crm.propiedades.list();
    return _props;
  }

  async function buscar(texto, caja) {
    const U = Legio.util;
    try {
      const [leads, props] = await Promise.all([Legio.crm.leads.buscar(texto), propsCache()]);
      const t = texto.toLowerCase();
      const pf = props.filter(x =>
        (x.titulo || '').toLowerCase().includes(t) || (x.colonia || '').toLowerCase().includes(t)
      ).slice(0, 5);

      if (!leads.length && !pf.length) {
        caja.innerHTML = '<div class="buscador__vacio">Sin resultados para “' + esc(texto) + '”.</div>';
        caja.hidden = false; return;
      }

      caja.innerHTML =
        (leads.length ? '<div class="buscador__grupo">Prospectos</div>' + leads.map(l => `
          <a class="buscador__item" href="lead.html?id=${l.id}">
            <strong>${esc(l.nombre || 'Sin nombre')}</strong>
            <span>${esc(l.telefono || l.email || '')} · ${esc(U.etEstatus(l.estatus))}</span>
          </a>`).join('') : '') +
        (pf.length ? '<div class="buscador__grupo">Propiedades</div>' + pf.map(x => `
          <a class="buscador__item" href="propiedad-form.html?id=${x.id}">
            <strong>${esc(x.titulo)}</strong>
            <span>${esc(x.colonia || x.ciudad || '')} · ${U.fmtMXN(x.precio)}</span>
          </a>`).join('') : '');
      caja.hidden = false;
    } catch (e) {
      caja.innerHTML = '<div class="buscador__vacio">No se pudo buscar.</div>';
      caja.hidden = false;
    }
  }

  window.Legio.ico = { svg, set: ico, aplicar: iconos, actividad: t => svg(ICO_ACTIVIDAD[t] || 'nota') };
  window.Legio.shell = { montar, pendientes, iconos };
})();
