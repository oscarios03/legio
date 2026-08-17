/* ===== INFORME / DOCUMENTO IMPRIMIBLE ===== */
(function () {
  if (!Legio.auth.requireAuth('index.html')) return;

  const V = Legio.valuacion;
  const fmtMXN = n => (!n || isNaN(n)) ? '—'
    : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  const fmtPct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const pct = x => (x * 100).toFixed(1) + '%';
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtFecha = iso => { try { return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return iso || '—'; } };

  const TIPO = { casa: 'Casa', departamento: 'Departamento', local: 'Local comercial', terreno: 'Terreno' };
  const ANTIG = { nueva: 'Menos de 5 años', reciente: '5 a 15 años', media: '15 a 30 años', antigua: 'Más de 30 años' };
  const CONSV = { excelente: 'Excelente', buena: 'Buena', regular: 'Regular', reparaciones: 'Necesita reparaciones' };
  const CALIDAD = { lujo: 'Lujo', alta: 'Alta', media: 'Media', economica: 'Económica' };
  const ENFOQUE = { mercado: 'Enfoque de mercado', costo: 'Enfoque de costo', ingresos: 'Enfoque de ingresos' };

  let avaluoActual = null;

  function dl(pairs) {
    return '<div class="doc__dl">' + pairs
      .filter(p => p[1] !== undefined && p[1] !== '' && p[1] !== null)
      .map(p => `<div><span>${esc(p[0])}</span><strong>${esc(p[1])}</strong></div>`).join('') + '</div>';
  }

  // ── Enfoque de mercado: comparables homologados ──
  function seccionMercado(a, p, sujeto) {
    const comps = (a.comparables || []).filter(c => +c.precio > 0 && +c.m2 > 0);
    if (!comps.length) {
      return `<p class="doc__nota">No se registraron comparables. El enfoque de mercado usa el modelo de valor por zona
              calibrado con el precio de la colonia.</p>`;
    }
    const filas = comps.map((c, i) => {
      const adj = V.ajustarComparable(sujeto, c);
      return `<tr>
        <td>${esc(c.direccion || ('Comparable ' + (i + 1)))}</td>
        <td>${fmtMXN(c.precio)}${adj.esLista ? '<small> lista</small>' : '<small> cierre</small>'}</td>
        <td>${esc(c.m2)} m²</td>
        <td>${fmtMXN(adj.precioM2)}</td>
        <td>${fmtPct(adj.netAdj)}</td>
        <td>${fmtMXN(adj.adjustedM2)}</td>
      </tr>`;
    }).join('');

    const stats = (a.valorComparables && a.valorComparables.stats) || null;
    const dispersion = stats && stats.n
      ? `<p class="doc__nota">Dispersión de la muestra homologada: coeficiente de variación
         <strong>${pct(stats.cv)}</strong> sobre ${stats.n} comparables (media ${fmtMXN(stats.media)}/m²).
         Un CV bajo indica que los comparables son homogéneos entre sí.</p>`
      : '';

    return `<div class="tabla-scroll"><table class="doc-table">
        <thead><tr><th>Comparable</th><th>Precio</th><th>Superficie</th><th>$/m²</th><th>Homologación</th><th>$/m² homologado</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
      <p class="doc__nota">Cada comparable se lleva a condiciones equivalentes al inmueble valuado ajustando superficie,
        recámaras, baños, antigüedad, conservación, zona y fecha de publicación. Los precios de lista se descuentan por
        factor de negociación. La conciliación pondera más los comparables que requirieron menos ajuste:
        <strong>${fmtMXN(a.valorComparables?.porM2)}/m²</strong> × ${esc(p.m2c)} m² =
        <strong>${fmtMXN(a.valorComparables?.total)}</strong>.</p>
      ${dispersion}`;
  }

  // ── Enfoque de costo ──
  function seccionCosto(k) {
    if (!k) return '';
    return `<div class="doc__section doc__section--enfoque">
      <h3>Enfoque de costo</h3>
      <p class="doc__nota">Valor de reposición nuevo de la construcción, menos la depreciación acumulada
        (método Ross-Heidecke, que combina edad con estado de conservación), más el valor del terreno.</p>
      ${dl([
        ['Costo de reposición por m²', fmtMXN(k.costoM2)],
        ['Valor de reposición nuevo', fmtMXN(k.vrn)],
        ['Edad / vida útil', (k.edad != null ? k.edad : '—') + ' / ' + (k.vidaUtil || 60) + ' años'],
        ['Depreciación aplicada', pct(k.depreciacion)],
        ['Construcción depreciada', fmtMXN(k.construccionDepreciada)],
        ['Valor del terreno', fmtMXN(k.terreno)],
        ['Valor por enfoque de costo', fmtMXN(k.total)],
      ])}
    </div>`;
  }

  // ── Enfoque de ingresos ──
  function seccionIngresos(g) {
    if (!g) return '';
    return `<div class="doc__section doc__section--enfoque">
      <h3>Enfoque de ingresos</h3>
      <p class="doc__nota">Capitalización de la renta <strong>neta</strong>: a la renta bruta se le descuenta la
        vacancia esperada y los gastos de operación (administración, predial, mantenimiento y seguros). La tasa de
        capitalización empleada es neta, congruente con esa base.</p>
      ${dl([
        ['Renta mensual de mercado', fmtMXN(g.rentaMensual)],
        ['Renta bruta anual', fmtMXN(g.rentaBrutaAnual)],
        ['Vacancia', pct(g.vacancia)],
        ['Gastos de operación', pct(g.gastos)],
        ['Renta neta anual', fmtMXN(g.rentaNetaAnual)],
        ['Tasa de capitalización neta', g.tasaCapAnual + '%'],
        ['Valor por enfoque de ingresos', fmtMXN(g.total)],
      ])}
    </div>`;
  }

  /* ── Conciliación ──
   * Declara el peso APLICADO, no el capturado. Cuando un enfoque no entra (sin datos o sin
   * peso), el resto se reparte su peso proporcionalmente; publicar los capturados haría que
   * el documento declarara porcentajes que no suman 100%. */
  function seccionConciliacion(a) {
    const c = a.conciliacion;
    if (!c || !c.detalle || !Object.keys(c.detalle).length) return '';

    const filas = Object.entries(c.detalle).map(([k, d]) => `<tr>
        <td>${ENFOQUE[k] || k}</td>
        <td>${fmtMXN(d.valor)}</td>
        <td>${pct(d.pesoAplicado)}</td>
        <td>${fmtMXN(d.valor * d.pesoAplicado)}</td>
      </tr>`).join('');

    const omitidos = (c.omitidos || []).filter(o => ENFOQUE[o.enfoque]);
    const notaOmitidos = omitidos.length
      ? `<p class="doc__nota">No participan en la conciliación: ` +
        omitidos.map(o => `<strong>${(ENFOQUE[o.enfoque] || o.enfoque).toLowerCase()}</strong> (${esc(o.motivo)})`).join(', ') +
        `.</p>`
      : '';

    const notaReparto = c.renormalizado
      ? `<p class="doc__nota">Los porcentajes anteriores son los <strong>efectivamente aplicados</strong>: al no
         participar todos los enfoques, sus pesos se redistribuyeron proporcionalmente entre los que sí lo hacen,
         de modo que la ponderación suma 100%.</p>`
      : '';

    return `<div class="doc__section doc__section--enfoque">
      <h3>Conciliación de enfoques</h3>
      <div class="tabla-scroll"><table class="doc-table">
        <thead><tr><th>Enfoque</th><th>Valor indicado</th><th>Peso aplicado</th><th>Aportación</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><th colspan="3">Valor conciliado</th><th>${fmtMXN(c.valor)}</th></tr></tfoot>
      </table></div>
      ${notaReparto}
      ${notaOmitidos}
    </div>`;
  }

  // Presentación de los avalúos anteriores a la unificación, que no traen los tres enfoques.
  function seccionLegado(a) {
    if (a.conciliacion) return '';
    return `<p class="doc__nota">Este avalúo se emitió con la versión anterior del motor, que conciliaba el modelo por
      zona con los comparables sin desglosar los enfoques de costo e ingresos.</p>`;
  }

  function render(a) {
    const doc = document.getElementById('doc');
    const p = a.propiedad || {};
    const at = a.atributos || {};
    const r = a.resultado || {};
    const enf = a.enfoques || {};
    const esBorrador = (a.estado || 'borrador') !== 'emitido';

    const sujeto = {
      m2c: p.m2c, rec: p.recamaras, ban: p.banos,
      antiguedad: p.antiguedad, conservacion: p.conservacion, coloniaNombre: p.colonia,
    };

    const fotos = (a.fotos || []).length
      ? `<div class="doc__section"><h3>Fotografías</h3><div class="doc-fotos">${a.fotos.map(f => `<img src="${f}" alt="" />`).join('')}</div></div>`
      : '';

    const overrideNota = a.override?.activo
      ? `<div class="doc__section"><h3>Ajuste del asesor</h3>
         <p class="doc__nota">El valor concluido no es el resultado directo de la conciliación: el asesor aplicó un
         ajuste profesional. <strong>Justificación:</strong> ${esc(a.override.justificacion)}</p></div>`
      : '';

    const titulo = esBorrador ? 'Borrador de Opinión de Valor' : 'Opinión de Valor Comercial';

    doc.innerHTML = `
      ${esBorrador ? '<div class="doc__marca" aria-hidden="true">BORRADOR</div>' : ''}

      <section class="doc__cover">
        <div class="doc__brand"><span class="logo-legio">LEGIO</span> <span class="logo-sub">Inmobiliaria</span></div>
        <div class="doc__cover-body">
          <p class="doc__cover-kicker">${esc(TIPO[p.tipo] || p.tipo || 'Inmueble')} · ${esc([p.colonia, p.ciudad].filter(Boolean).join(', ') || '—')}</p>
          <h1 class="doc__title">${titulo}</h1>
          <p class="doc__subtitle">Preparado para ${esc(a.cliente?.nombre || 'el cliente')}</p>
          <div class="doc__cover-valor">
            <span>Valor comercial de referencia</span>
            <strong>${fmtMXN(r.concluido)}</strong>
            <span>Rango: ${fmtMXN(r.min)} – ${fmtMXN(r.max)}</span>
          </div>
        </div>
        <div class="doc__meta">
          <div><span>Folio</span><strong>${esc(a.folio || '—')}</strong></div>
          <div><span>Fecha</span><strong>${esc(fmtFecha(a.fecha))}</strong></div>
          <div><span>Estado</span><strong>${esBorrador ? 'Borrador — no emitido' : 'Emitido'}</strong></div>
          <div><span>Asesor</span><strong>${esc(a.asesor || '—')}</strong></div>
        </div>
      </section>

      <section class="doc__cuerpo">
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

        <div class="doc__section doc__section--enfoque">
          <h3>Enfoque de mercado</h3>
          <p class="doc__nota">Comparación con inmuebles similares de la misma zona, homologados al inmueble valuado.</p>
          ${seccionMercado(a, p, sujeto)}
        </div>

        ${seccionCosto(enf.costo)}
        ${seccionIngresos(enf.ingresos)}
        ${seccionConciliacion(a)}
        ${seccionLegado(a)}
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
          ${esBorrador
            ? '<strong>Documento en borrador.</strong> No ha sido emitido y no debe entregarse al cliente ni presentarse ante terceros. '
            : ''}
          Esta opinión de valor es un documento de referencia comercial emitido por Legio Inmobiliaria con fines
          informativos. No constituye un avalúo fiscal, bancario ni pericial, ni sustituye el dictamen de un perito
          valuador certificado. El valor refleja condiciones de mercado a la fecha de emisión y puede variar.
          Documento generado el ${esc(fmtFecha(a.fecha))} · Folio ${esc(a.folio || '—')}.
        </p>
      </section>

      <div class="doc__pie" aria-hidden="true">
        <span>Legio Inmobiliaria · ${esc(a.folio || 's/folio')}</span>
        <span>${esBorrador ? 'BORRADOR — no emitido' : 'Opinión de valor'} · ${esc(fmtFecha(a.fecha))}</span>
      </div>`;

    document.title = (esBorrador ? 'Borrador ' : 'Informe ') + (a.folio || '') + ' — Legio';
    document.body.classList.toggle('doc-borrador', esBorrador);
    pintarEstado(a);
  }

  // ── Estado del documento (borrador / emitido) ──
  function pintarEstado(a) {
    const esBorrador = (a.estado || 'borrador') !== 'emitido';
    const etiqueta = document.getElementById('estadoEtiqueta');
    etiqueta.textContent = esBorrador ? 'Borrador' : 'Emitido';
    etiqueta.className = 'doc-estado doc-estado--' + (esBorrador ? 'borrador' : 'emitido');
    document.getElementById('btnEmitir').hidden = !esBorrador;

    const aviso = document.getElementById('avisoEstado');
    if (esBorrador) {
      aviso.innerHTML = '<div class="crm-msg crm-msg--warn">Este avalúo está en <strong>borrador</strong>: se imprime con marca de agua y la nota legal lo advierte. Púlsalo en «Emitir avalúo» cuando esté listo para entregar.</div>';
      aviso.hidden = false;
    } else {
      aviso.innerHTML = '<div class="crm-msg crm-msg--ok">Avalúo <strong>emitido</strong> el ' + esc(fmtFecha(a.emitidoEn)) + (a.emitidoPor ? ' por ' + esc(a.emitidoPor) : '') + '.</div>';
      aviso.hidden = false;
    }
  }

  async function emitir() {
    if (!avaluoActual) return;
    if (!confirm('Al emitir, el documento deja de marcarse como borrador y queda listo para entregar al cliente. ¿Continuar?')) return;
    const btn = document.getElementById('btnEmitir');
    btn.disabled = true;
    try {
      avaluoActual.estado = 'emitido';
      avaluoActual.emitidoEn = new Date().toISOString();
      avaluoActual.emitidoPor = avaluoActual.asesor || null;
      await Legio.storage.save(avaluoActual);
      render(avaluoActual);
    } catch (err) {
      console.error('No se pudo emitir el avalúo:', err);
      avaluoActual.estado = 'borrador';
      delete avaluoActual.emitidoEn;
      delete avaluoActual.emitidoPor;
      const aviso = document.getElementById('avisoEstado');
      aviso.innerHTML = '<div class="crm-msg crm-msg--err"><strong>No se pudo emitir.</strong> ' + esc(err.message || 'Error desconocido.') + ' El avalúo sigue en borrador.</div>';
      aviso.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function cargar() {
    const id = new URLSearchParams(location.search).get('id');
    const a = id ? await Legio.storage.get(id) : null;
    if (!a) {
      document.getElementById('doc').innerHTML = '<p class="int-empty">Avalúo no encontrado. <a href="index.html">Volver al panel</a>.</p>';
      return;
    }
    avaluoActual = a;
    render(a);
  }

  document.getElementById('btnPDF').addEventListener('click', () => window.print());
  document.getElementById('btnEmitir').addEventListener('click', emitir);
  cargar();
})();
