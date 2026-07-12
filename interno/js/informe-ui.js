/* ===== INFORME / DOCUMENTO IMPRIMIBLE ===== */
(function () {
  const V = Legio.valuacion;
  const fmtMXN = n => (!n || isNaN(n)) ? '—'
    : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  const fmtPct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtFecha = iso => { try { return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return iso || '—'; } };

  const TIPO = { casa: 'Casa', departamento: 'Departamento', local: 'Local comercial', terreno: 'Terreno' };
  const ANTIG = { nueva: 'Menos de 5 años', reciente: '5 a 15 años', media: '15 a 30 años', antigua: 'Más de 30 años' };
  const CONSV = { excelente: 'Excelente', buena: 'Buena', regular: 'Regular', reparaciones: 'Necesita reparaciones' };
  const CALIDAD = { lujo: 'Lujo', alta: 'Alta', media: 'Media', economica: 'Económica' };

  function dl(pairs) {
    return '<div class="doc__dl">' + pairs
      .filter(p => p[1] !== undefined && p[1] !== '' && p[1] !== null)
      .map(p => `<div><span>${esc(p[0])}</span><strong>${esc(p[1])}</strong></div>`).join('') + '</div>';
  }

  async function render() {
    const id = new URLSearchParams(location.search).get('id');
    const a = id ? await Legio.storage.get(id) : null;
    const doc = document.getElementById('doc');
    if (!a) { doc.innerHTML = '<p class="int-empty">Avalúo no encontrado. <a href="index.html">Volver al panel</a>.</p>'; return; }

    const p = a.propiedad || {};
    const at = a.atributos || {};
    const r = a.resultado || {};
    const sujeto = { m2c: p.m2c, rec: p.recamaras, ban: p.banos, antiguedad: p.antiguedad, conservacion: p.conservacion };

    // Tabla de comparables (recalcula ajustes para mostrar la metodología)
    let cmpTabla = '<p style="font-size:.85rem;color:#777;">No se registraron comparables; el valor se basa en el modelo de mercado por zona.</p>';
    const comps = (a.comparables || []).filter(c => +c.precio > 0 && +c.m2 > 0);
    if (comps.length) {
      const filas = comps.map((c, i) => {
        const adj = V.ajustarComparable(sujeto, c);
        return `<tr>
          <td>${esc(c.direccion || ('Comparable ' + (i + 1)))}</td>
          <td>${fmtMXN(c.precio)}</td>
          <td>${esc(c.m2)} m²</td>
          <td>${fmtMXN(adj.precioM2)}</td>
          <td>${fmtPct(adj.netAdj)}</td>
          <td>${fmtMXN(adj.adjustedM2)}</td>
        </tr>`;
      }).join('');
      cmpTabla = `<div class="tabla-scroll"><table class="doc-table">
        <thead><tr><th>Comparable</th><th>Precio</th><th>Superficie</th><th>$/m²</th><th>Ajuste</th><th>$/m² ajustado</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
        <p style="font-size:.82rem;color:#555;margin-top:8px;">Conciliación (promedio ponderado): <strong>${fmtMXN(a.valorComparables?.porM2)}/m²</strong> × ${esc(p.m2c)} m² = <strong>${fmtMXN(a.valorComparables?.total)}</strong>.</p>`;
    }

    const fotos = (a.fotos || []).length
      ? `<div class="doc__section"><h3>Fotografías</h3><div class="doc-fotos">${a.fotos.map(f => `<img src="${f}" alt="" />`).join('')}</div></div>`
      : '';

    const overrideNota = a.override?.activo
      ? `<div class="doc__section"><h3>Ajuste del asesor</h3><p style="font-size:.88rem;">Se aplicó un ajuste profesional al valor calculado. <strong>Justificación:</strong> ${esc(a.override.justificacion)}</p></div>`
      : '';

    doc.innerHTML = `
      <div class="doc__cover">
        <div class="doc__brand"><span class="logo-legio">LEGIO</span> <span class="logo-sub">Inmobiliaria</span></div>
        <div class="doc__meta">
          <div><strong>Folio:</strong> ${esc(a.folio)}</div>
          <div><strong>Fecha:</strong> ${esc(fmtFecha(a.fecha))}</div>
          <div><strong>Plaza:</strong> ${esc(p.ciudad || '—')}</div>
        </div>
      </div>

      <h1 class="doc__title">Opinión de Valor Comercial</h1>
      <p class="doc__subtitle">Documento de referencia preparado por Legio Inmobiliaria para ${esc(a.cliente?.nombre || 'el cliente')}.</p>

      <div class="doc__section">
        <h3>Datos del cliente</h3>
        ${dl([['Cliente', a.cliente?.nombre], ['Teléfono', a.cliente?.telefono], ['Correo', a.cliente?.email], ['Asesor', a.asesor]])}
      </div>

      <div class="doc__section">
        <h3>Características del inmueble</h3>
        ${dl([
          ['Tipo', TIPO[p.tipo] || p.tipo],
          ['Ubicación', [p.colonia, p.ciudad].filter(Boolean).join(', ')],
          ['Código postal', p.cp],
          ['Superficie construida', p.m2c ? p.m2c + ' m²' : ''],
          ['Superficie de terreno', p.m2t ? p.m2t + ' m²' : ''],
          ['Recámaras', p.recamaras || ''],
          ['Baños', p.banos || ''],
          ['Estacionamiento', p.cajones ? p.cajones + ' cajón(es)' : 'Sin cajón'],
          ['Antigüedad', ANTIG[p.antiguedad] || ''],
          ['Conservación', CONSV[p.conservacion] || ''],
          ['Calidad de acabados', CALIDAD[at.calidadAcabados] || ''],
          ['Extras', (p.extras || []).join(', ')],
        ])}
      </div>

      ${fotos}

      <div class="doc__section">
        <h3>Metodología y comparables de mercado</h3>
        <p style="font-size:.85rem;color:#555;margin-bottom:6px;">El valor se determina combinando un modelo de mercado por zona con el enfoque de comparables, ajustando cada propiedad similar por sus diferencias frente al inmueble valuado.</p>
        ${cmpTabla}
      </div>

      ${overrideNota}

      <div class="doc__value">
        <div class="rango">Rango estimado: ${fmtMXN(r.min)} – ${fmtMXN(r.max)}</div>
        <div class="final">${fmtMXN(r.concluido)}</div>
        <div class="rango">Valor comercial de referencia</div>
      </div>

      <div class="doc__firma">
        <div class="linea">${esc(a.asesor || '')}<br>Asesor Legio Inmobiliaria</div>
        <div class="linea">Sello / firma</div>
      </div>

      <p class="doc__legal">
        Esta opinión de valor es un documento de referencia comercial emitido por Legio Inmobiliaria con fines
        informativos. No constituye un avalúo fiscal, bancario ni pericial, ni sustituye el dictamen de un perito
        valuador certificado. El valor refleja condiciones de mercado a la fecha de emisión y puede variar.
        Documento generado el ${esc(fmtFecha(a.fecha))} · Folio ${esc(a.folio)}.
      </p>`;

    document.title = 'Informe ' + (a.folio || '') + ' — Legio';
  }

  document.getElementById('btnPDF').addEventListener('click', () => window.print());

  // Exige sesión del CRM (Supabase) antes de mostrar el informe.
  (async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    render();
  })();
})();
