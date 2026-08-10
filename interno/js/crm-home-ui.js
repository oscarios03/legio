/* ===== PANEL DEL CRM — LEGIO =====
 * Lo primero que ve el equipo al entrar: qué hay que atender hoy, cómo va el
 * mes contra el anterior, de dónde llegan los prospectos, la agenda y los
 * cierres. Todo sale de datos que el CRM ya guarda.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;
  const C = Legio.chart;
  const ico = Legio.ico.svg;

  let ASESOR = null, ADMIN = false;
  let ALCANCE = 'oficina';   // oficina | mio  (el asesor siempre ve lo suyo)
  let DATOS = null, PEND = null, RANGO = null;

  /* ---- Login / panel ------------------------------------------------------ */
  function verLogin() {
    $('loginCard').style.display = '';
    $('app').style.display = 'none';
    if (!window.sb) $('configWarn').style.display = '';
  }

  async function verPanel() {
    $('loginCard').style.display = 'none';
    $('app').style.display = '';

    const info = await Legio.shell.montar({ page: 'panel' });
    ASESOR = info.asesor; ADMIN = info.admin;
    if (!ADMIN) ALCANCE = 'mio';
    $('segAlcance').hidden = !ADMIN;

    const nombre = (ASESOR && ASESOR.nombre) || '';
    $('saludo').textContent = nombre
      ? 'Hola, ' + nombre.split(' ')[0] + '. Esto es lo que hay sobre la mesa.'
      : 'Esto es lo que hay sobre la mesa.';

    generar();
  }

  /* ---- Periodo ------------------------------------------------------------ */
  const isoDe = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

  function rangoDe(valor) {
    const hoy = new Date();
    const mes = (a, b, et) => ({ desde: isoDe(a), hasta: isoDe(b), et });
    if (valor === 'mes') {
      const a = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const b = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return mes(a, b, capital(a.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })));
    }
    if (valor === 'mes-1') {
      const a = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const b = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return mes(a, b, capital(a.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })));
    }
    if (valor === 'anio') {
      return mes(new Date(hoy.getFullYear(), 0, 1), new Date(hoy.getFullYear(), 11, 31), String(hoy.getFullYear()));
    }
    const n = Number(valor) || 30;
    return { desde: U.enDias(-(n - 1)), hasta: U.hoyISO(), et: 'los últimos ' + n + ' días' };
  }

  /* ---- Carga -------------------------------------------------------------- */
  async function generar() {
    $('contenido').innerHTML = '<div class="int-card int-empty">Cargando el panel…</div>';
    RANGO = rangoDe($('f-periodo').value);
    const soloMio = (!ADMIN || ALCANCE === 'mio') && ASESOR ? ASESOR.id : null;

    try {
      const [d, p] = await Promise.all([
        Legio.crm.panel.resumen({
          desde: RANGO.desde, hasta: RANGO.hasta, asesorId: soloMio,
          // La agenda mira hacia adelante aunque el periodo sea hacia atrás.
          agendaDesde: U.hoyISO(),
          agendaHasta: maxISO(RANGO.hasta, U.enDias(30)),
        }),
        Legio.shell.pendientes(ASESOR && ASESOR.id, ADMIN && ALCANCE === 'oficina'),
      ]);
      DATOS = d; PEND = p;
      render(d, p);
    } catch (e) {
      $('contenido').innerHTML =
        '<div class="int-card crm-msg crm-msg--err">No se pudo cargar el panel: ' + U.esc(e.message) + '</div>';
    }
  }

  const maxISO = (a, b) => (a > b ? a : b);

  /* ---- Piezas ------------------------------------------------------------- */
  function tarjetaAccion(o) {
    return `<div class="accion${o.alerta ? ' accion--alerta' : ''}">
      <div class="accion__head">
        <span class="iconsq iconsq--${o.tono}">${ico(o.ico)}</span>
        <b>${U.esc(o.et)}</b>
      </div>
      <div class="accion__cuerpo">
        <span class="accion__num"><span class="num">${o.n}</span><em>${U.esc(o.unidad)}</em></span>
        <a class="btn ${o.n ? 'btn--primary' : 'btn--ghost'} btn--sm" href="${o.href}">${U.esc(o.boton)}</a>
      </div>
      <div class="accion__pie${o.alerta ? ' is-alerta' : ''}">${ico(o.alerta ? 'alerta' : 'reloj')}${U.esc(o.pie)}</div>
    </div>`;
  }

  function kpi(o) {
    return `<div class="kpi">
      <div class="kpi__head"><span class="iconsq iconsq--${o.tono}">${ico(o.ico)}</span><span>${U.esc(o.et)}</span></div>
      <span class="num">${o.valor}</span>
      <div class="kpi__pie">${o.delta || '<span class="delta delta--igual">—</span>'}
        <span class="kpi__vs">${U.esc(o.vs || '')}</span></div>
    </div>`;
  }

  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const pct1 = v => (v * 100).toFixed(v * 100 >= 10 ? 0 : 1) + '%';
  const horas = h => h == null ? '—' : (h < 24 ? Math.round(h) + ' h' : (h / 24).toFixed(1) + ' d');
  const mxnCorto = n => {
    if (!n) return '$0';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + ' K';
    return U.fmtMXN(n);
  };

  /* ---- Render ------------------------------------------------------------- */
  function render(d, p) {
    const urgentes = p.nuevos.length + p.vencidos.length;
    $('puntoAlerta').hidden = !urgentes;

    const viejo = p.vencidos.length
      ? U.diasEntre(new Date(p.vencidos[0].proximo_seguimiento + 'T00:00:00'), new Date())
      : 0;
    const nuevos24 = p.nuevos.filter(l => (Date.now() - new Date(l.created_at)) > 864e5).length;
    const citasHoy = p.citas.filter(l => l.proximo_seguimiento === U.hoyISO()).length;

    $('contenido').innerHTML =
      bloqueAcciones(p, { nuevos24, viejo, citasHoy }) +
      bloqueResultados(d) +
      bloqueGraficas(d) +
      bloqueAgendaCierres(d) +
      bloqueAtencion(p) +
      bloqueInventario(d);

    conectarFilas();
  }

  // --- 1. Lo que exige atención hoy ---
  function bloqueAcciones(p, x) {
    return `<div class="acciones">
      ${tarjetaAccion({
        ico: 'inbox', tono: p.nuevos.length ? 'bad' : 'ok', et: 'Sin contactar',
        n: String(p.nuevos.length).padStart(2, '0'), unidad: 'prospectos',
        boton: 'Abrir lista', href: 'leads.html?urgencia=sin-contactar',
        alerta: !!x.nuevos24,
        pie: x.nuevos24 ? x.nuevos24 + ' llevan más de 24 h esperando'
                        : (p.nuevos.length ? 'Todos entraron hoy' : 'Nadie está esperando respuesta'),
      })}
      ${tarjetaAccion({
        ico: 'reloj', tono: p.vencidos.length ? 'gold' : 'ok', et: 'Seguimiento vencido',
        n: String(p.vencidos.length).padStart(2, '0'), unidad: 'prospectos',
        boton: 'Ponerse al día', href: 'leads.html?urgencia=vencidos',
        alerta: x.viejo > 3,
        pie: p.vencidos.length ? 'El más atrasado lleva ' + plural(x.viejo, 'día', 'días') : 'Sin seguimientos atrasados',
      })}
      ${tarjetaAccion({
        ico: 'calendario', tono: 'navy', et: 'Citas esta semana',
        n: String(p.citas.length).padStart(2, '0'), unidad: p.citas.length === 1 ? 'cita' : 'citas',
        boton: 'Ver agenda', href: 'leads.html?estatus=cita',
        pie: x.citasHoy ? (x.citasHoy === 1 ? 'Una es hoy' : x.citasHoy + ' son hoy') : 'Nada agendado para hoy',
      })}
    </div>`;
  }

  // --- 2. Cómo va el periodo ---
  function bloqueResultados(d) {
    const L = d.leads, R = d.respuesta, K = d.cierres;
    const enteros = v => Math.round(v);

    return `<div class="section-head">
        <h2 class="section-label">Resultados de ${U.esc(RANGO.et)}</h2>
        ${ADMIN ? '<a class="card__link" href="metricas.html">Ver métricas completas ' + ico('flecha') + '</a>' : ''}
      </div>
      <div class="kpis">
        ${kpi({ ico: 'prospectos', tono: 'navy', et: 'Prospectos nuevos', valor: L.total,
                delta: C.delta(L.total, L.totalPrev, { fmt: enteros }),
                vs: 'antes ' + L.totalPrev })}
        ${kpi({ ico: 'chat', tono: 'ok', et: 'Tasa de contacto',
                valor: L.tasaContacto == null ? '—' : pct1(L.tasaContacto),
                delta: C.delta(L.tasaContacto, L.tasaContactoPrev, { fmt: v => (v * 100).toFixed(0) + ' pts', epsilon: 0.005 }),
                vs: L.contactados + ' de ' + L.total })}
        ${kpi({ ico: 'llave', tono: 'gold', et: 'Cierres', valor: K.n,
                delta: C.delta(K.n, K.nPrev, { fmt: enteros }),
                vs: 'antes ' + K.nPrev })}
        ${kpi({ ico: 'tendencia', tono: 'plum', et: 'Monto vendido', valor: mxnCorto(K.monto),
                delta: C.delta(K.monto, K.montoPrev, { fmt: mxnCorto, epsilon: 1 }),
                vs: 'antes ' + mxnCorto(K.montoPrev) })}
      </div>
      <div class="kpis" style="margin-top:14px;">
        ${kpi({ ico: 'reloj', tono: R.horas != null && R.horas > 24 ? 'bad' : 'ok', et: '1ª respuesta',
                valor: horas(R.horas),
                delta: C.delta(R.horas, R.horasPrev, { invertir: true, fmt: horas, epsilon: 0.05 }),
                vs: 'promedio' })}
        ${kpi({ ico: 'calendario', tono: 'navy', et: 'Citas por venir', valor: d.agenda.citas,
                delta: '<span class="delta delta--igual">Agenda</span>',
                vs: plural(d.agenda.filas.length, 'seguimiento', 'seguimientos') })}
        ${kpi({ ico: 'propiedades', tono: 'gris', et: 'Inventario activo', valor: d.inventario.activas,
                delta: '<span class="delta delta--igual">' + d.inventario.publicadas + ' en el sitio</span>',
                vs: d.inventario.diasMercadoProm == null ? '' : Math.round(d.inventario.diasMercadoProm) + ' días prom.' })}
        ${ADMIN
          ? kpi({ ico: 'comisiones', tono: 'gold',
                  et: ALCANCE === 'mio' ? 'Mi comisión' : 'Comisión de la casa', valor: mxnCorto(K.comision),
                  delta: '<span class="delta delta--igual">' + plural(K.n, 'operación', 'operaciones') + '</span>', vs: 'del periodo' })
          : kpi({ ico: 'check', tono: 'ok', et: 'Prospectos ganados', valor: d.leads.ganados,
                  delta: C.delta(d.leads.ganados, d.leads.ganadosPrev, { fmt: enteros }),
                  vs: d.leads.perdidos + ' perdidos' })}
      </div>`;
  }

  // --- 3. Origen y evolución ---
  function bloqueGraficas(d) {
    const total = d.leads.total;
    const partes = d.porOrigen.map((o, i) => ({
      et: U.etOrigen(o.clave), n: o.n, color: C.PALETA[i % C.PALETA.length],
    }));

    const leyenda = partes.length
      ? '<div class="leyenda">' + partes.map(x => `
          <a class="leyenda__fila" href="leads.html?origen=${encodeURIComponent(claveDe(x.et, d))}">
            <span class="leyenda__punto" style="background:${x.color}"></span>
            <span class="leyenda__et">${U.esc(x.et)}</span>
            <span class="leyenda__pct">${Math.round((x.n / total) * 100)}%</span>
            <span class="leyenda__val">${x.n}</span>
          </a>`).join('') + '</div>'
      : '';

    const porDia = d.serie.map(s => s.n);
    const prom = porDia.length ? (porDia.reduce((a, b) => a + b, 0) / porDia.length) : 0;
    const unidad = d.porSemana ? 'semana' : 'día';
    const mejor = d.serie.reduce((a, b) => (b.n > a.n ? b : a), d.serie[0] || { n: 0 });
    const secos = d.serie.filter(s => !s.n).length;

    return `<div class="grid-1-2" style="margin-top:16px;">
      <div class="card">
        <div class="card__head card__head--tight">
          <div><h3 class="card__title">De dónde llegan</h3>
            <p class="card__desc">Reparto de los ${total} prospectos del periodo.</p></div>
        </div>
        ${C.panal(partes)}
        ${leyenda}
      </div>

      <div class="card">
        <div class="card__head card__head--tight">
          <div><h3 class="card__title">Prospectos ${d.porSemana ? 'por semana' : 'por día'}</h3></div>
          <a class="card__link" href="leads.html">Ver todos ${ico('flecha')}</a>
        </div>
        <div class="big">
          <span class="num">${total}</span>
          <em>${prom.toFixed(1)} ${d.porSemana ? 'por semana' : 'al día'} en promedio</em>
        </div>
        ${C.puntos(d.serie, { color: C.PALETA[1] })}
        <div class="mini">
          <div><span>Mejor ${unidad}</span><b>${mejor && mejor.n ? U.fmtFecha(mejor.fecha) + ' · ' + mejor.n : '—'}</b></div>
          <div><span>Promedio</span><b>${prom.toFixed(1)} por ${unidad}</b></div>
          <div><span>${d.porSemana ? 'Semanas' : 'Días'} sin prospectos</span><b>${secos}</b></div>
        </div>
      </div>
    </div>`;
  }

  // El origen viene traducido para mostrarse; para el enlace hace falta la clave.
  function claveDe(etiqueta, d) {
    const o = d.porOrigen.find(x => U.etOrigen(x.clave) === etiqueta);
    return o ? o.clave : '';
  }

  // --- 4. Agenda y cierres ---
  function bloqueAgendaCierres(d) {
    const hoy = U.hoyISO();
    const agenda = d.agenda.filas.slice(0, 7).map(l => {
      const f = new Date(l.proximo_seguimiento + 'T00:00:00');
      const esHoy = l.proximo_seguimiento === hoy;
      const vencida = l.proximo_seguimiento < hoy;
      return `<a class="agenda__fila" href="lead.html?id=${l.id}">
        <span class="agenda__dia ${esHoy ? 'agenda__dia--hoy' : vencida ? 'agenda__dia--vencido' : ''}">
          <b>${f.getDate()}</b><span>${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</span>
        </span>
        <span class="agenda__cuerpo">
          <b>${U.esc(l.nombre || 'Sin nombre')}</b>
          <span>${l.estatus === 'cita' ? 'Cita' : 'Seguimiento'}${l.ciudad ? ' · ' + U.esc(l.ciudad) : ''}
            ${l.asesor ? ' · ' + U.esc(l.asesor.nombre) : ''}</span>
        </span>
        <span class="pill pill--${esHoy ? 'hoy' : vencida ? 'urgente' : 'futuro'}">
          ${esHoy ? 'Hoy' : U.haceCuanto(l.proximo_seguimiento)}</span>
      </a>`;
    }).join('');

    const cierres = d.cierres.filas.slice(0, 6).map(p => `
      <div class="agenda__fila">
        <span class="avatar avatar--gold">${U.esc((p.titulo || '?')[0])}</span>
        <span class="agenda__cuerpo">
          <b>${U.esc(p.titulo || 'Propiedad')}</b>
          <span>${U.fmtFecha(p.fecha_venta)}${p.ciudad ? ' · ' + U.esc(p.ciudad) : ''}
            ${p.vendedor ? ' · ' + U.esc(p.vendedor.nombre) : ''}</span>
        </span>
        <span class="leyenda__val">${U.fmtMXN(p.precio_venta_final || p.precio)}</span>
      </div>`).join('');

    return `<div class="grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="card__head card__head--tight">
          <div><h3 class="card__title">Próximas citas y seguimientos</h3>
            <p class="card__desc">Lo que ya está agendado a partir de hoy.</p></div>
          <a class="card__link" href="leads.html?estatus=cita">Ver todo ${ico('flecha')}</a>
        </div>
        ${agenda ? '<div class="agenda">' + agenda + '</div>'
                 : '<p class="int-empty">No hay nada agendado. Agenda el siguiente paso desde la ficha de cada prospecto.</p>'}
      </div>

      <div class="card">
        <div class="card__head card__head--tight">
          <div><h3 class="card__title">Cierres de ${U.esc(RANGO.et)}</h3>
            <p class="card__desc">${plural(d.cierres.n, 'operación', 'operaciones')} · ${U.fmtMXN(d.cierres.monto)}</p></div>
          <a class="card__link" href="crm.html?estatus=vendida">Ver ventas ${ico('flecha')}</a>
        </div>
        ${cierres ? '<div class="agenda">' + cierres + '</div>'
                  : '<p class="int-empty">Todavía no hay cierres registrados en el periodo.</p>'}
      </div>
    </div>`;
  }

  // --- 5. Tabla de prospectos que necesitan atención ---
  const AVANCE = { nuevo: 20, contactado: 55, cita: 80, cerrado: 100, perdido: 100 };

  function bloqueAtencion(p) {
    const filas = []
      .concat(p.nuevos.map(l => ({ l, motivo: 'Nuevo · ' + U.haceCuanto(l.created_at), clase: 'urgente' })))
      .concat(p.vencidos.map(l => ({ l, motivo: 'Vencido · ' + U.fmtFecha(l.proximo_seguimiento), clase: 'urgente' })))
      .concat(p.citas.map(l => ({ l, motivo: 'Cita · ' + U.fmtFecha(l.proximo_seguimiento), clase: 'futuro' })))
      .slice(0, 8);

    if (!filas.length) {
      return `<h2 class="section-label">Prospectos que te necesitan</h2>
        <div class="card int-empty">Todo al día: nadie está esperando respuesta. ${ico('check')}</div>`;
    }

    return `<div class="section-head">
        <h2 class="section-label">Prospectos que te necesitan</h2>
        <a class="card__link" href="leads.html">Ver los ${filas.length >= 8 ? 'demás' : 'prospectos'} ${ico('flecha')}</a>
      </div>
      <div class="card card--pad0"><div class="tabla-scroll"><table class="int-table">
        <thead><tr>
          <th>Prospecto</th><th>Origen</th><th>Motivo</th><th>Etapa</th><th>Asesor</th><th></th>
        </tr></thead>
        <tbody>${filas.map(({ l, motivo, clase }) => `<tr>
          <td>
            <span class="celda-id">
              <span class="avatar ${tonoAvatar(l)}">${U.esc((l.nombre || '?')[0])}</span>
              <span class="celda-id__txt">
                <b>${U.esc(l.nombre || 'Sin nombre')}</b>
                <span><i class="dot ${l.estatus === 'nuevo' ? 'dot--bad' : l.estatus === 'cita' ? 'dot--warn' : 'dot--ok'}"></i>
                  ${U.esc(U.etEstatus(l.estatus))}${l.ciudad ? ' · ' + U.esc(l.ciudad) : ''}</span>
              </span>
            </span>
          </td>
          <td><span class="badge-origen">${U.esc(U.etOrigen(l.origen))}</span></td>
          <td><span class="pill pill--${clase}">${U.esc(motivo)}</span></td>
          <td style="min-width:130px;">
            <span class="progress">
              <span class="progress__track"><span class="progress__fill${l.estatus === 'cita' ? ' progress__fill--gold' : ''}"
                style="width:${AVANCE[l.estatus] || 20}%"></span></span>
            </span>
          </td>
          <td class="td-sub">${U.esc(l.asesor ? l.asesor.nombre : 'Sin asignar')}</td>
          <td><div class="int-table__actions">
            ${l.telefono ? `<a class="btn btn--wa btn--sm" href="${U.waLink(l.telefono, U.plantillaWA(l))}"
                 target="_blank" rel="noopener" title="WhatsApp">${ico('chat')}</a>` : ''}
            <a class="btn btn--ghost btn--sm" href="lead.html?id=${l.id}">Atender</a>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  // Color estable por inicial: dos prospectos distintos no se confunden de un vistazo.
  function tonoAvatar(l) {
    const tonos = ['', 'avatar--gold', 'avatar--ok', 'avatar--plum'];
    const s = String(l.nombre || l.id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % tonos.length;
    return tonos[h];
  }

  // --- 6. Inventario que se está enfriando ---
  function bloqueInventario(d) {
    const e = d.inventario.estancadas.slice(0, 5);
    if (!e.length) return '';
    return `<h2 class="section-label">Inventario que lleva demasiado en el mercado</h2>
      <div class="card card--pad0"><div class="tabla-scroll"><table class="int-table">
        <thead><tr><th>Propiedad</th><th>Ciudad</th><th>Precio</th><th>En mercado</th><th></th></tr></thead>
        <tbody>${e.map(p => `<tr>
          <td><span class="celda-id">
            <span class="avatar avatar--gris">${U.esc((p.titulo || '?')[0])}</span>
            <span class="celda-id__txt"><b>${U.esc(p.titulo)}</b>
              <span>${U.esc(p.estatus === 'apartada' ? 'Apartada' : 'Disponible')}</span></span>
          </span></td>
          <td class="td-sub">${U.esc(p.ciudad || '—')}</td>
          <td class="td-num">${U.fmtMXN(p.precio)}</td>
          <td><span class="pill pill--urgente">${p.dias} días</span></td>
          <td><div class="int-table__actions">
            <a class="btn btn--ghost btn--sm" href="propiedad-form.html?id=${p.id}">Revisar precio</a>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  // Los marcadores data-ico del HTML recién pintado se cambian por su SVG.
  function conectarFilas() {
    Legio.shell.iconos($('contenido'));
  }

  /* ---- Exportación -------------------------------------------------------- */
  function exportar() {
    if (!DATOS) return;
    const filas = DATOS.leads.filas.map(l => ({
      fecha: U.fmtFecha(l.created_at),
      nombre: l.nombre || '',
      telefono: l.telefono || '',
      email: l.email || '',
      origen: U.etOrigen(l.origen),
      estatus: U.etEstatus(l.estatus),
      asesor: l.asesor ? l.asesor.nombre : 'Sin asignar',
      contactado: l.ultimo_contacto_at ? 'Sí' : 'No',
      seguimiento: l.proximo_seguimiento || '',
    }));
    U.descargarCSV('legio-panel-' + RANGO.desde + '_' + RANGO.hasta + '.csv', [
      ['fecha', 'Fecha'], ['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['email', 'Correo'],
      ['origen', 'Origen'], ['estatus', 'Estatus'], ['asesor', 'Asesor'],
      ['contactado', 'Contactado'], ['seguimiento', 'Próximo seguimiento'],
    ], filas);
  }

  /* ---- Eventos ------------------------------------------------------------ */
  $('f-periodo').addEventListener('change', generar);
  $('btnCSV').addEventListener('click', exportar);

  $('segAlcance').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.alcance === ALCANCE) return;
    ALCANCE = b.dataset.alcance;
    $('segAlcance').querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    generar();
  });

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = '';
    if (!window.sb) { $('loginError').textContent = 'Supabase no está configurado.'; return; }
    const res = await Legio.crmAuth.login($('email').value, $('pwd').value);
    if (res.ok) { $('pwd').value = ''; await verPanel(); }
    else $('loginError').textContent = res.error || 'No se pudo iniciar sesión.';
  });

  (async function init() {
    const user = window.sb ? await Legio.crmAuth.getUser() : null;
    if (user) await verPanel(); else verLogin();
  })();
})();
