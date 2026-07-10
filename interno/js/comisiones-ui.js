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
      $('listWrap').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudo generar: ' + esc(e.message) + '</div>';
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

  function renderTotales(rep) {
    $('totales').innerHTML =
      `<div class="com-tile"><span>Ventas cerradas</span><strong>${rep.rows.length}</strong></div>
       <div class="com-tile"><span>Monto vendido</span><strong>${fmtMXN(rep.totalVentas)}</strong></div>
       <div class="com-tile"><span>Comisiones totales</span><strong>${fmtMXN(rep.totalComisiones)}</strong></div>`;
  }

  function renderTabla(rep) {
    let html = '';
    // Por asesor
    if (rep.porAsesor.length) {
      html += '<div class="int-card"><h3 class="int-card__title">Por asesor</h3><div class="tabla-scroll"><table class="int-table"><thead><tr><th>Asesor</th><th style="text-align:right;">Comisión acumulada</th></tr></thead><tbody>' +
        rep.porAsesor.map(a => `<tr><td>${esc(a.nombre)}</td><td style="text-align:right;"><strong>${fmtMXN(a.total)}</strong></td></tr>`).join('') +
        '</tbody></table></div></div>';
    }
    // Detalle por propiedad
    if (!rep.rows.length) {
      html += '<div class="int-card int-empty">No hay ventas cerradas en el periodo seleccionado.</div>';
    } else {
      html += '<div class="int-card"><h3 class="int-card__title">Detalle por propiedad</h3><div class="tabla-scroll"><table class="int-table"><thead><tr>' +
        '<th>Propiedad</th><th>Ciudad</th><th>Venta</th><th>Precio venta</th><th>Captador</th><th>Com. cap.</th><th>Vendedor</th><th>Com. vend.</th><th>Total</th>' +
        '</tr></thead><tbody>' +
        rep.rows.map(r => `<tr>
          <td>${esc(r.titulo)}</td>
          <td>${esc(r.ciudad || '—')}</td>
          <td>${fmtFecha(r.fecha_venta)}</td>
          <td>${fmtMXN(r.base)}</td>
          <td>${esc(r.captador)}</td>
          <td>${fmtMXN(r.comCap)}</td>
          <td>${esc(r.vendedor)}</td>
          <td>${fmtMXN(r.comVen)}</td>
          <td><strong>${fmtMXN(r.totalComision)}</strong></td>
        </tr>`).join('') +
        '</tbody></table></div></div>';
    }
    $('listWrap').innerHTML = html;
  }

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

  async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
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
