/* ===== MÉTRICAS DEL NEGOCIO (solo admin) =====
 * Todo se calcula con los datos que el CRM ya guarda. Sin librerías de gráficas:
 * barras en CSS, que es lo que este volumen de datos necesita.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;
  const C = Legio.chart;
  const ico = Legio.ico.svg;

  let ULTIMO = null;

  const pct = (n, total) => total ? Math.round((n / total) * 100) : 0;

  // Tarjeta de dato con icono, igual que en el panel.
  function kpi(icono, tono, etiqueta, valor, nota) {
    return `<div class="kpi">
      <div class="kpi__head"><span class="iconsq iconsq--${tono}">${ico(icono)}</span><span>${U.esc(etiqueta)}</span></div>
      <span class="num">${valor}</span>
      <div class="kpi__pie"><span class="kpi__vs">${U.esc(nota || '')}</span></div>
    </div>`;
  }

  // Barras horizontales: [[etiqueta, valor], ...]
  function barras(datos, opts) {
    opts = opts || {};
    if (!datos.length) return '<p class="int-empty" style="padding:16px 0;">Sin datos en el periodo.</p>';
    const max = Math.max(...datos.map(d => d[1])) || 1;
    return '<div class="barras">' + datos.map(([et, val]) => `
      <div class="barra">
        <span class="barra__et">${U.esc(et)}</span>
        <span class="barra__track"><span class="barra__fill" style="width:${Math.max(2, (val / max) * 100)}%;"></span></span>
        <span class="barra__val">${opts.fmt ? opts.fmt(val) : val}</span>
      </div>`).join('') + '</div>';
  }

  function embudo(etapas) {
    const base = etapas[0] ? etapas[0].total : 0;
    return '<div class="embudo">' + etapas.map(e => `
      <div class="embudo__paso">
        <div class="embudo__barra" style="width:${Math.max(8, pct(e.total, base))}%;">
          <strong>${e.total}</strong>
        </div>
        <div class="embudo__et">
          ${U.etEstatus(e.etapa)}
          <span>${pct(e.total, base)}% del total</span>
        </div>
      </div>`).join('') + '</div>';
  }

  function tablaAsesores(porAsesor) {
    if (!porAsesor.length) return '<p class="int-empty" style="padding:16px 0;">Sin leads en el periodo.</p>';
    const tope = Math.max(...porAsesor.map(a => a.tasaCierre), 0.0001);
    return `<div class="tabla-scroll"><table class="int-table"><thead><tr>
      <th>Asesor</th><th>Leads</th><th>Contactados</th><th>Citas</th><th>Cerrados</th><th>Perdidos</th>
      <th>Tasa de contacto</th><th>Tasa de cierre</th>
    </tr></thead><tbody>` +
      porAsesor.map(a => `<tr>
        <td><span class="celda-id">
          <span class="avatar">${U.esc((a.nombre || '?')[0])}</span>
          <span class="celda-id__txt"><b>${U.esc(a.nombre)}</b>
            <span>${a.total} lead(s) en el periodo</span></span>
        </span></td>
        <td class="td-num">${a.total}</td>
        <td class="td-num">${a.contactados}</td>
        <td class="td-num">${a.citas}</td>
        <td class="td-num">${a.cerrados}</td>
        <td class="td-num">${a.perdidos}</td>
        <td><span class="progress">
          <span class="progress__track"><span class="progress__fill" style="width:${Math.round(a.tasaContacto * 100)}%"></span></span>
          <span class="td-num">${Math.round(a.tasaContacto * 100)}%</span>
        </span></td>
        <td><span class="progress">
          <span class="progress__track"><span class="progress__fill progress__fill--gold"
            style="width:${Math.round((a.tasaCierre / tope) * 100)}%"></span></span>
          <span class="td-num"><strong>${Math.round(a.tasaCierre * 100)}%</strong></span>
        </span></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  function render(m) {
    const p = m.propiedades;
    const respuesta = m.horasRespuestaProm == null ? '—'
      : (m.horasRespuestaProm < 24
          ? Math.round(m.horasRespuestaProm) + ' h'
          : (m.horasRespuestaProm / 24).toFixed(1) + ' días');

    const origenes = Object.entries(m.porOrigen)
      .map(([k, v]) => [U.etOrigen(k), v]).sort((a, b) => b[1] - a[1]);

    const motivos = Object.entries(m.motivos).sort((a, b) => b[1] - a[1]);

    const estatusProp = ['borrador','disponible','apartada','vendida']
      .map(e => [e.charAt(0).toUpperCase() + e.slice(1), p.porEstatus[e] || 0]);

    // Serie para la gráfica de puntos: el lunes de cada semana con actividad.
    const serie = Object.entries(m.porSemana).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([fecha, n]) => ({ fecha, n }));

    const partes = origenes.map(([et, n], i) => ({ et, n, color: C.PALETA[i % C.PALETA.length] }));

    $('contenido').innerHTML = `
      <h2 class="section-label">Prospectos</h2>
      <div class="kpis">
        ${kpi('prospectos', 'navy', 'Leads del periodo', m.totalLeads, 'Entradas nuevas')}
        ${kpi('inbox', m.sinContactar ? 'bad' : 'ok', 'Sin contactar', m.sinContactar,
              m.sinContactar ? 'Requieren atención' : 'Todo atendido')}
        ${kpi('reloj', m.horasRespuestaProm != null && m.horasRespuestaProm > 24 ? 'bad' : 'ok',
              '1ª respuesta', respuesta, 'Promedio del periodo')}
        ${kpi('propiedades', 'gris', 'Propiedades activas', p.activas,
              p.diasMercadoProm == null ? '' : Math.round(p.diasMercadoProm) + ' días en mercado')}
      </div>

      <h2 class="section-label">Ventas</h2>
      <div class="kpis">
        ${kpi('llave', 'gold', 'Ventas cerradas', p.vendidas, 'En el periodo')}
        ${kpi('tendencia', 'plum', 'Monto vendido', U.fmtMXN(p.montoVendido), 'Precio de cierre')}
        ${kpi('calendario', 'navy', 'Días hasta vender',
              p.diasVentaProm == null ? '—' : Math.round(p.diasVentaProm), 'Promedio histórico')}
        ${kpi('casa', 'gris', 'Inventario publicado', p.porEstatus.disponible || 0, 'Disponibles')}
      </div>

      <div class="grid-1-2" style="margin-top:16px;">
        <div class="card">
          <div class="card__head card__head--tight">
            <div><h3 class="card__title">Leads por origen</h3>
              <p class="card__desc">Qué canal del sitio está trayendo prospectos.</p></div>
          </div>
          ${C.panal(partes)}
          ${partes.length ? '<div class="leyenda">' + partes.map(x => `
            <div class="leyenda__fila">
              <span class="leyenda__punto" style="background:${x.color}"></span>
              <span class="leyenda__et">${U.esc(x.et)}</span>
              <span class="leyenda__pct">${pct(x.n, m.totalLeads)}%</span>
              <span class="leyenda__val">${x.n}</span>
            </div>`).join('') + '</div>' : ''}
        </div>

        <div class="card">
          <div class="card__head card__head--tight">
            <div><h3 class="card__title">Leads por semana</h3>
              <p class="card__desc">Últimas 12 semanas con actividad.</p></div>
          </div>
          <div class="big"><span class="num">${m.totalLeads}</span><em>en el periodo</em></div>
          ${C.puntos(serie, { color: C.PALETA[1] })}
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px;">
        <div class="card">
          <h3 class="card__title">Embudo de conversión</h3>
          <p class="card__desc">Cuántos prospectos alcanzaron cada etapa.</p>
          ${embudo(m.embudo)}
        </div>
        <div class="card">
          <h3 class="card__title">Por qué se pierden los prospectos</h3>
          <p class="card__desc">Lo que dice el motivo de pérdida al cerrar un lead.</p>
          ${barras(motivos)}
        </div>
      </div>

      <h2 class="section-label">Desempeño por asesor</h2>
      <div class="card card--pad0">${tablaAsesores(m.porAsesor)}</div>

      <div class="card">
        <h3 class="card__title">Inventario por estatus</h3>
        ${barras(estatusProp)}
      </div>`;

    Legio.shell.iconos($('contenido'));
  }

  function exportarCSV() {
    if (!ULTIMO) return;
    const filas = ULTIMO.leadsRows.map(l => ({
      fecha: U.fmtFecha(l.created_at),
      origen: U.etOrigen(l.origen),
      estatus: U.etEstatus(l.estatus),
      asesor: l.asesor ? l.asesor.nombre : 'Sin asignar',
      contactado: l.ultimo_contacto_at ? 'Sí' : 'No',
      motivo_perdida: l.motivo_perdida || '',
    }));
    U.descargarCSV('legio-metricas-leads-' + U.hoyISO() + '.csv', [
      ['fecha','Fecha'], ['origen','Origen'], ['estatus','Estatus'],
      ['asesor','Asesor'], ['contactado','Contactado'], ['motivo_perdida','Motivo de pérdida'],
    ], filas);
  }

  async function generar() {
    $('contenido').innerHTML = '<div class="card int-empty">Calculando…</div>';
    const dias = Number($('f-periodo').value);
    const desde = dias ? U.enDias(-dias) : null;
    try {
      ULTIMO = await Legio.crm.metricas.resumen(desde, U.hoyISO());
      render(ULTIMO);
    } catch (e) {
      $('contenido').innerHTML = '<div class="card crm-msg crm-msg--err">No se pudieron calcular las métricas: ' + U.esc(e.message) + '</div>';
    }
  }

  $('f-periodo').addEventListener('change', generar);
  $('btnCSV').addEventListener('click', exportarCSV);
  (async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
    await Legio.shell.montar({ page: 'metricas' });
    generar();
  })();
})();
