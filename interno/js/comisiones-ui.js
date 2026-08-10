/* ===== REPORTE DE COMISIONES (solo admin) ===== */
(function () {
  const $ = id => document.getElementById(id);
  function fmtMXN(n){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n||0); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function fmtFecha(iso){ if(!iso) return '—'; try{ return new Date(iso+'T00:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}); }catch(e){ return iso; } }

  let ULTIMO = null;

  async function generar() {
    const opts = { desde: $('f-desde').value || null, hasta: $('f-hasta').value || null, asesorId: $('f-asesor').value || null };
    Object.keys(opts).forEach(k => { if (!opts[k]) delete opts[k]; });
    try {
      const rep = await Legio.crm.comisiones.reporte(opts);
      ULTIMO = rep;
      renderTotales(rep);
      renderTabla(rep);
    } catch (e) {
      $('listWrap').innerHTML = '<div class="card crm-msg crm-msg--err">No se pudo generar: ' + esc(e.message) + '</div>';
    }
  }

  // Para pasarle el reporte al contador sin capturarlo a mano.
  function exportar() {
    if (!ULTIMO || !ULTIMO.rows.length) { alert('Genera primero un reporte con resultados.'); return; }
    const filas = ULTIMO.rows.map(r => ({
      propiedad: r.titulo, ciudad: r.ciudad || '', fecha_venta: r.fecha_venta || '',
      precio_venta: Math.round(r.base),
      captador: r.captador, comision_captador: Math.round(r.comCap),
      vendedor: r.vendedor, comision_vendedor: Math.round(r.comVen),
      comision_total: Math.round(r.totalComision),
    }));
    Legio.util.descargarCSV('legio-comisiones-' + Legio.util.hoyISO() + '.csv', [
      ['propiedad','Propiedad'], ['ciudad','Ciudad'], ['fecha_venta','Fecha de venta'],
      ['precio_venta','Precio de venta'], ['captador','Captador'], ['comision_captador','Comisión captador'],
      ['vendedor','Vendedor'], ['comision_vendedor','Comisión vendedor'], ['comision_total','Comisión total'],
    ], filas);
  }

  const ico = Legio.ico.svg;

  function kpi(icono, tono, etiqueta, valor, nota) {
    return `<div class="kpi">
      <div class="kpi__head"><span class="iconsq iconsq--${tono}">${ico(icono)}</span><span>${esc(etiqueta)}</span></div>
      <span class="num">${valor}</span>
      <div class="kpi__pie"><span class="kpi__vs">${esc(nota || '')}</span></div>
    </div>`;
  }

  function renderTotales(rep) {
    // La comisión media por operación es la cifra que de verdad se negocia.
    const media = rep.rows.length ? rep.totalComisiones / rep.rows.length : 0;
    $('totales').innerHTML =
      kpi('llave', 'gold', 'Ventas cerradas', rep.rows.length, 'En el periodo') +
      kpi('tendencia', 'plum', 'Monto vendido', fmtMXN(rep.totalVentas), 'Precio de cierre') +
      kpi('comisiones', 'navy', 'Comisiones totales', fmtMXN(rep.totalComisiones), 'Captador + vendedor') +
      kpi('check', 'ok', 'Comisión promedio', fmtMXN(media), 'Por operación');
    Legio.shell.iconos($('totales'));
  }

  function renderTabla(rep) {
    let html = '';
    // Por asesor
    if (rep.porAsesor.length) {
      const tope = Math.max(...rep.porAsesor.map(a => a.total), 1);
      html += '<h2 class="section-label">Por asesor</h2><div class="card card--pad0"><div class="tabla-scroll">' +
        '<table class="int-table"><thead><tr><th>Asesor</th><th>Reparto</th>' +
        '<th style="text-align:right;">Comisión acumulada</th></tr></thead><tbody>' +
        rep.porAsesor.map(a => `<tr>
          <td><span class="celda-id"><span class="avatar">${esc((a.nombre || '?')[0])}</span>
            <span class="celda-id__txt"><b>${esc(a.nombre)}</b></span></span></td>
          <td style="min-width:150px;"><span class="progress"><span class="progress__track">
            <span class="progress__fill progress__fill--gold" style="width:${Math.round((a.total / tope) * 100)}%"></span>
          </span></span></td>
          <td style="text-align:right;"><strong>${fmtMXN(a.total)}</strong></td>
        </tr>`).join('') +
        '</tbody></table></div></div>';
    }
    // Detalle por propiedad
    if (!rep.rows.length) {
      html += '<div class="card int-empty">No hay ventas cerradas en el periodo seleccionado.</div>';
    } else {
      html += '<h2 class="section-label">Detalle por propiedad</h2><div class="card card--pad0"><div class="tabla-scroll"><table class="int-table"><thead><tr>' +
        '<th>Propiedad</th><th>Ciudad</th><th>Venta</th><th>Precio venta</th><th>Captador</th><th>Com. cap.</th><th>Vendedor</th><th>Com. vend.</th><th>Total</th>' +
        '</tr></thead><tbody>' +
        rep.rows.map(r => `<tr>
          <td><span class="celda-id"><span class="avatar avatar--gris">${esc((r.titulo || '?')[0])}</span>
            <span class="celda-id__txt"><b>${esc(r.titulo)}</b>
              <span>${esc(r.ciudad || '—')}</span></span></span></td>
          <td class="td-sub">${esc(r.ciudad || '—')}</td>
          <td class="td-sub" style="white-space:nowrap;">${fmtFecha(r.fecha_venta)}</td>
          <td class="td-num">${fmtMXN(r.base)}</td>
          <td class="td-sub">${esc(r.captador)}</td>
          <td class="td-num">${fmtMXN(r.comCap)}</td>
          <td class="td-sub">${esc(r.vendedor)}</td>
          <td class="td-num">${fmtMXN(r.comVen)}</td>
          <td class="td-num"><strong>${fmtMXN(r.totalComision)}</strong></td>
        </tr>`).join('') +
        '</tbody></table></div></div>';
    }
    $('listWrap').innerHTML = html;
  }

  async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
    await Legio.shell.montar({ page: 'comisiones' });
    try {
      const asesores = await Legio.crm.asesores.list();
      $('f-asesor').innerHTML = '<option value="">Todos</option>' + asesores.map(a => `<option value="${a.id}">${esc(a.nombre||a.email)}</option>`).join('');
    } catch (e) { /* seguimos sin dropdown */ }
    $('btnFiltrar').addEventListener('click', generar);
    $('btnCSV').addEventListener('click', exportar);
    generar();
  }

  init();
})();
