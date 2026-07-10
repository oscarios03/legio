/* ===== MÉTRICAS DEL NEGOCIO (solo admin) =====
 * Todo se calcula con los datos que el CRM ya guarda. Sin librerías de gráficas:
 * barras en CSS, que es lo que este volumen de datos necesita.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;

  let ULTIMO = null;

  const pct = (n, total) => total ? Math.round((n / total) * 100) : 0;

  function tile(etiqueta, valor, nota) {
    return `<div class="com-tile">
      <span>${U.esc(etiqueta)}</span>
      <strong>${valor}</strong>
      ${nota ? `<em class="com-tile__nota">${U.esc(nota)}</em>` : ''}
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
    return `<div class="tabla-scroll"><table class="int-table"><thead><tr>
      <th>Asesor</th><th>Leads</th><th>Contactados</th><th>Citas</th><th>Cerrados</th><th>Perdidos</th>
      <th>Tasa de contacto</th><th>Tasa de cierre</th>
    </tr></thead><tbody>` +
      porAsesor.map(a => `<tr>
        <td><strong>${U.esc(a.nombre)}</strong></td>
        <td>${a.total}</td>
        <td>${a.contactados}</td>
        <td>${a.citas}</td>
        <td>${a.cerrados}</td>
        <td>${a.perdidos}</td>
        <td>${Math.round(a.tasaContacto * 100)}%</td>
        <td><strong>${Math.round(a.tasaCierre * 100)}%</strong></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  function nombreSemana(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  function render(m) {
    const p = m.propiedades;
    const respuesta = m.horasRespuestaProm == null ? '—'
      : (m.horasRespuestaProm < 24
          ? Math.round(m.horasRespuestaProm) + ' h'
          : (m.horasRespuestaProm / 24).toFixed(1) + ' días');

    // Últimas 12 semanas, en orden cronológico.
    const semanas = Object.entries(m.porSemana).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([k, v]) => [nombreSemana(k), v]);

    const origenes = Object.entries(m.porOrigen)
      .map(([k, v]) => [U.etOrigen(k), v]).sort((a, b) => b[1] - a[1]);

    const motivos = Object.entries(m.motivos).sort((a, b) => b[1] - a[1]);

    const estatusProp = ['borrador','disponible','apartada','vendida']
      .map(e => [e.charAt(0).toUpperCase() + e.slice(1), p.porEstatus[e] || 0]);

    $('contenido').innerHTML = `
      <div class="com-totales">
        ${tile('Leads del periodo', m.totalLeads)}
        ${tile('Sin contactar', m.sinContactar, m.sinContactar ? '¡Requieren atención!' : 'Todo atendido')}
        ${tile('Tiempo de 1ª respuesta', respuesta, 'Promedio')}
        ${tile('Propiedades activas', p.activas)}
      </div>

      <div class="com-totales">
        ${tile('Ventas cerradas', p.vendidas)}
        ${tile('Monto vendido', U.fmtMXN(p.montoVendido))}
        ${tile('Días en mercado', p.diasMercadoProm == null ? '—' : Math.round(p.diasMercadoProm) + ' días', 'Inventario activo')}
        ${tile('Días hasta vender', p.diasVentaProm == null ? '—' : Math.round(p.diasVentaProm) + ' días', 'Promedio histórico')}
      </div>

      <div class="int-grid-2 met-grid">
        <div class="int-card">
          <h3 class="int-card__title">Embudo de conversión</h3>
          <p class="int-card__desc">Cuántos prospectos alcanzaron cada etapa.</p>
          ${embudo(m.embudo)}
        </div>
        <div class="int-card">
          <h3 class="int-card__title">Leads por origen</h3>
          <p class="int-card__desc">Qué canal del sitio está trayendo prospectos.</p>
          ${barras(origenes)}
        </div>
      </div>

      <div class="int-card">
        <h3 class="int-card__title">Leads por semana</h3>
        <p class="int-card__desc">Últimas 12 semanas con actividad.</p>
        ${barras(semanas)}
      </div>

      <div class="int-card">
        <h3 class="int-card__title">Desempeño por asesor</h3>
        ${tablaAsesores(m.porAsesor)}
      </div>

      <div class="int-grid-2 met-grid">
        <div class="int-card">
          <h3 class="int-card__title">Por qué se pierden los prospectos</h3>
          ${barras(motivos)}
        </div>
        <div class="int-card">
          <h3 class="int-card__title">Inventario por estatus</h3>
          ${barras(estatusProp)}
        </div>
      </div>`;
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
    $('contenido').innerHTML = '<div class="int-card int-empty">Calculando…</div>';
    const dias = Number($('f-periodo').value);
    const desde = dias ? U.enDias(-dias) : null;
    try {
      ULTIMO = await Legio.crm.metricas.resumen(desde, U.hoyISO());
      render(ULTIMO);
    } catch (e) {
      $('contenido').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron calcular las métricas: ' + U.esc(e.message) + '</div>';
    }
  }

  $('f-periodo').addEventListener('change', generar);
  $('btnCSV').addEventListener('click', exportarCSV);
  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

  (async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
    generar();
  })();
})();
