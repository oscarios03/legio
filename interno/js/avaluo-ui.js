/* ===== ASISTENTE DE CAPTURA DE AVALÚO ===== */
(function () {
  if (!Legio.auth.requireAuth('index.html')) return;
  Legio.shell.montar({ page: 'avaluos' });

  const $  = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const V  = Legio.valuacion;

  const fmtMXN = n => (!n || isNaN(n)) ? '—'
    : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  const fmtPct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';

  const ANTIG_OPTS  = { nueva: 'Menos de 5 años', reciente: '5 a 15 años', media: '15 a 30 años', antigua: 'Más de 30 años' };
  const CONSV_OPTS  = { excelente: 'Excelente', buena: 'Buena', regular: 'Regular', reparaciones: 'Necesita reparaciones' };

  let pasoActual = 1;
  let fotos = [];
  let comparables = [];
  let editId = new URLSearchParams(location.search).get('id');
  let editFolio = null, editFecha = null, editEstado = null;

  const PASOS = 7;   // 1 Cliente · 2 Propiedad · 3 Atributos · 4 Comparables · 5 Fotos · 6 Enfoques · 7 Conclusión

  // ── Navegación entre pasos ──
  function mostrarPaso(n) {
    pasoActual = n;
    $$('[data-panel]').forEach(p => { p.hidden = (+p.dataset.panel !== n); });
    $$('.int-step').forEach(s => {
      const k = +s.dataset.step;
      s.classList.toggle('active', k === n);
      s.classList.toggle('done', k < n);
    });
    if (n === 6) actualizarEnfoques();
    if (n === PASOS) computeConclusion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-next]').forEach(b => b.addEventListener('click', () => mostrarPaso(Math.min(PASOS, pasoActual + 1))));
  $$('[data-prev]').forEach(b => b.addEventListener('click', () => mostrarPaso(Math.max(1, pasoActual - 1))));
  $$('.int-step').forEach(s => s.addEventListener('click', () => mostrarPaso(+s.dataset.step)));

  // ── CP → colonia (reusa COLONIAS_DB de ../colonias.js) ──
  function buscarColonias(preseleccion) {
    const cp = $('p-cp').value.trim();
    const sel = $('p-colonia');
    const info = $('p-cp-ciudad');
    info.textContent = '';
    if (cp.length < 5) { sel.disabled = true; sel.innerHTML = '<option value="">Ingresa el código postal primero</option>'; return; }
    const data = COLONIAS_DB[cp];
    if (!data) { sel.disabled = true; sel.innerHTML = '<option value="">CP no encontrado</option>'; return; }
    info.textContent = '📍 ' + data.ciudad;
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecciona tu colonia</option>';
    data.colonias.forEach(col => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({
        conMin: col.conMin, conMax: col.conMax, terMin: col.terMin, terMax: col.terMax, nombre: col.nombre,
        // Si la colonia tiene precio propio, el motor no vuelve a aplicar el multiplicador
        // de zona: ya está dentro del precio (ver calibracion-base.js).
        esGenerico: Legio.calibracionBase.esPrecioGenerico(data.ciudad, col),
      });
      opt.textContent = col.nombre;
      if (preseleccion && col.nombre === preseleccion) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  $('p-cp').addEventListener('input', () => buscarColonias());

  // ── Campos según tipo ──
  function actualizarCamposPorTipo() {
    const t = $('p-tipo').value;
    $('row-rec').style.display = t === 'terreno' ? 'none' : '';
    $('g-m2t').style.display   = (t === 'casa' || t === 'local') ? '' : 'none';
    $('g-nivel').style.display = t === 'departamento' ? '' : 'none';
  }
  $('p-tipo').addEventListener('change', actualizarCamposPorTipo);

  // ── Estado del sujeto ──
  function getColoniaVal() {
    try { return JSON.parse($('p-colonia').value); } catch (e) { return null; }
  }
  function getSujeto() {
    const col = getColoniaVal() || {};
    return {
      tipo: $('p-tipo').value,
      conMin: col.conMin, conMax: col.conMax, terMin: col.terMin, terMax: col.terMax,
      coloniaNombre: col.nombre,
      precioEsGenerico: col.esGenerico,
      m2c: +$('p-m2c').value || 0,
      m2t: +$('p-m2t').value || 0,
      rec: +$('p-rec').value || 0,
      ban: +$('p-ban').value || 0,
      caj: +$('p-caj').value || 0,
      nivel: $('p-nivel').value,
      antiguedad: $('p-antig').value,
      conservacion: $('p-conserv').value,
      extras: $$('.p-extra:checked').map(c => c.value),
      atributos: {
        calidadAcabados: $('a-calidad').value,
        ubicacionEnColonia: $('a-ubic').value,
        servicios: $$('.a-serv:checked').map(c => c.value),
      },
    };
  }

  // ── Comparables ──
  function nuevoComparable() {
    comparables.push({ direccion: '', precio: '', m2: '', recamaras: 0, banos: 0, antiguedad: 'reciente', conservacion: 'buena' });
    renderComparables();
  }
  function optionsHtml(map, val) {
    return Object.entries(map).map(([k, t]) => `<option value="${k}"${k === val ? ' selected' : ''}>${t}</option>`).join('');
  }
  function renderComparables() {
    const cont = $('cmpList');
    cont.innerHTML = comparables.map((c, i) => `
      <div class="cmp-item" data-idx="${i}">
        <div class="cmp-item__head"><strong>Comparable ${i + 1}</strong>
          <button class="btn btn--danger btn--sm" data-rm="${i}">Quitar</button></div>
        <div class="form-group"><label>Dirección / referencia</label><input type="text" data-f="direccion" value="${c.direccion || ''}" placeholder="Colonia, calle..." /></div>
        <div class="int-grid-3">
          <div class="form-group"><label>Precio (MXN)</label><input type="number" data-f="precio" value="${c.precio}" min="0" /></div>
          <div class="form-group"><label>M² construidos</label><input type="number" data-f="m2" value="${c.m2}" min="1" /></div>
          <div class="form-group"><label>Recámaras</label><input type="number" data-f="recamaras" value="${c.recamaras}" min="0" /></div>
        </div>
        <div class="int-grid-3">
          <div class="form-group"><label>Baños</label><input type="number" data-f="banos" value="${c.banos}" min="0" /></div>
          <div class="form-group"><label>Antigüedad</label><select data-f="antiguedad">${optionsHtml(ANTIG_OPTS, c.antiguedad)}</select></div>
          <div class="form-group"><label>Conservación</label><select data-f="conservacion">${optionsHtml(CONSV_OPTS, c.conservacion)}</select></div>
        </div>
        <div class="cmp-calc" data-calc="${i}"></div>
      </div>`).join('');

    cont.querySelectorAll('.cmp-item').forEach(card => {
      const i = +card.dataset.idx;
      card.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => {
          const f = inp.dataset.f;
          comparables[i][f] = (inp.type === 'number') ? (+inp.value || 0) : inp.value;
          actualizarCalc();
        });
      });
      card.querySelector('[data-rm]').addEventListener('click', () => { comparables.splice(i, 1); renderComparables(); });
    });
    actualizarCalc();
  }
  function actualizarCalc() {
    const sujeto = getSujeto();
    comparables.forEach((c, i) => {
      const box = document.querySelector(`[data-calc="${i}"]`);
      if (!box) return;
      if (!(+c.precio > 0 && +c.m2 > 0)) { box.innerHTML = '<em>Captura precio y m² para calcular.</em>'; return; }
      const r = V.ajustarComparable(sujeto, c);
      box.innerHTML = `$/m²: <b>${fmtMXN(r.precioM2)}</b> · Ajuste neto: <b>${fmtPct(r.netAdj)}</b> · $/m² ajustado: <b>${fmtMXN(r.adjustedM2)}</b>`;
    });
    const conc = V.conciliar(comparables, sujeto);
    $('cmpConcl').innerHTML = conc.total > 0
      ? `Valor por comparables: <span>${fmtMXN(conc.porM2)}/m²</span> × ${sujeto.m2c} m² = <span>${fmtMXN(conc.total)}</span>`
      : 'Agrega comparables (con precio y m²) para ver la conciliación.';
  }
  $('btnAddCmp').addEventListener('click', nuevoComparable);

  // ── Biblioteca de comparables ──
  // Un comparable capturado una vez debe servir muchas veces. Aquí se recuperan los
  // que el equipo ya investigó en la zona, en vez de volver a teclearlos.
  let bibEncontrados = [];

  function hayNube() { return !!(window.sb && Legio.crm && Legio.crm.comparables); }

  async function buscarEnBiblioteca() {
    if (!hayNube()) {
      $('bibEstado').textContent = 'Disponible al iniciar sesión en el CRM: la biblioteca vive en la nube compartida.';
      return;
    }
    const cp = $('p-cp').value.trim();
    const data = COLONIAS_DB[cp];
    if (!data) { $('bibEstado').textContent = 'Captura el código postal en el paso 2 para buscar.'; return; }

    const btn = $('btnBuscarBib');
    btn.disabled = true;
    $('bibEstado').textContent = 'Buscando…';
    try {
      const col = getColoniaVal();
      bibEncontrados = await Legio.crm.comparables.buscar({
        cp, ciudad: data.ciudad, colonia: col && col.nombre, tipo: $('p-tipo').value || null,
      });
      renderBiblioteca(col && col.nombre);
      await mostrarPrecioObservado(data.ciudad, col && col.nombre);
    } catch (err) {
      console.error('Biblioteca de comparables:', err);
      $('bibEstado').textContent = 'No se pudo consultar la biblioteca: ' + (err.message || 'error desconocido') +
        (/relation .*comparables/i.test(err.message || '') ? ' — falta correr supabase-migracion-v3-comparables.sql.' : '');
    } finally {
      btn.disabled = false;
    }
  }

  function renderBiblioteca(coloniaActual) {
    if (!bibEncontrados.length) {
      $('bibEstado').textContent = 'Sin comparables guardados en esta zona todavía. Los que captures abajo quedarán disponibles para el equipo.';
      $('bibResultados').innerHTML = '';
      return;
    }
    $('bibEstado').textContent = bibEncontrados.length + ' comparable(s) en la zona.';
    $('bibResultados').innerHTML = bibEncontrados.map((c, i) => `
      <div class="bib-item">
        <div class="bib-item__datos">
          <strong>${esc(c.direccion || 'Sin dirección')}</strong>
          <span>${esc(c.colonia || '—')}${c.colonia === coloniaActual ? ' · misma colonia' : ''}
            · ${fmtMXN(c.precio)} · ${esc(c.m2)} m² · <b>${fmtMXN(c.precio_m2)}/m²</b>
            · ${c.tipo_precio === 'cierre' ? 'cierre' : 'lista'}${c.fecha ? ' · ' + esc(c.fecha) : ''}</span>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-usar="${i}">Usar</button>
      </div>`).join('');

    $$('[data-usar]').forEach(b => b.addEventListener('click', () => {
      const c = bibEncontrados[+b.dataset.usar];
      comparables.push({
        direccion: c.direccion || '', precio: c.precio, m2: c.m2,
        recamaras: c.recamaras || 0, banos: c.banos || 0,
        antiguedad: c.antiguedad || 'reciente', conservacion: c.conservacion || 'buena',
        tipoPrecio: c.tipo_precio || 'lista', fecha: c.fecha || null, zonaTier: c.zona_tier || null,
        bibliotecaId: c.id,
      });
      renderComparables();
      b.disabled = true;
      b.textContent = 'Agregado';
    }));
  }

  // El precio que Legio observa en la colonia, frente al de la tabla de referencia.
  async function mostrarPrecioObservado(ciudad, colonia) {
    const caja = $('bibObservado');
    caja.innerHTML = '';
    if (!colonia) return;
    try {
      const filas = await Legio.crm.comparables.precioObservado({ ciudad, colonia, tipo: $('p-tipo').value || null });
      const f = filas[0];
      if (!f) return;
      const col = getColoniaVal() || {};
      const tabla = ((+col.conMin || 0) + (+col.conMax || 0)) / 2;
      caja.innerHTML = `<div class="crm-msg ${f.suficiente ? 'crm-msg--ok' : 'crm-msg--warn'}">
        Precio observado por Legio en ${esc(colonia)}: <strong>${fmtMXN(f.precio_m2_mediana)}/m²</strong>
        (mediana de ${f.n} comparable(s); rango intercuartil ${fmtMXN(f.precio_m2_q1)}–${fmtMXN(f.precio_m2_q3)}).
        La tabla de referencia usa ${fmtMXN(tabla)}/m².
        ${f.suficiente ? '' : ' Con menos de 5 observaciones la cifra es indicativa: sigue capturando.'}
      </div>`;
    } catch (err) {
      // La vista puede no existir todavía; no es motivo para estorbar la captura.
      console.warn('Precio observado no disponible:', err.message);
    }
  }

  $('btnBuscarBib').addEventListener('click', buscarEnBiblioteca);

  // ── Fotos (compresion en canvas) ──
  function comprimir(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        let { width, height } = img;
        if (width > height && width > max) { height = height * max / width; width = max; }
        else if (height > max) { width = width * max / height; height = max; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      const fr = new FileReader();
      fr.onload = e => { img.src = e.target.result; };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  $('fotoInput').addEventListener('change', async e => {
    for (const file of e.target.files) {
      if (fotos.length >= 6) { alert('Máximo 6 fotos.'); break; }
      try { fotos.push(await comprimir(file)); } catch (err) { /* ignora archivo inválido */ }
    }
    e.target.value = '';
    renderFotos();
  });
  function renderFotos() {
    $('fotosGrid').innerHTML = fotos.map((src, i) =>
      `<div class="foto-item"><img src="${src}" alt="Foto ${i + 1}" /><button data-rmf="${i}">×</button></div>`).join('');
    $$('[data-rmf]').forEach(b => b.addEventListener('click', () => { fotos.splice(+b.dataset.rmf, 1); renderFotos(); }));
  }

  // ── Enfoques de costo e ingresos ──
  const CAL = Legio.calibracion;

  /* Campos con valor sugerido según el tipo de inmueble. Se re-sugieren al cambiar el
   * tipo, pero nunca pisan lo que el asesor ya escribió: en cuanto toca uno, ese campo
   * queda bajo su control. */
  const SUGERIDOS = ['i-tasa', 'i-vacancia', 'i-gastos', 'w-mercado', 'w-costo', 'w-ingresos'];
  const tocados = new Set();
  SUGERIDOS.forEach(id => $(id).addEventListener('input', () => tocados.add(id)));

  function sugerirPorTipo() {
    const tipo = $('p-tipo').value || 'casa';
    const pesos = CAL.pesosSugeridos(tipo);
    const fijar = (id, valor) => { if (!tocados.has(id)) $(id).value = valor; };
    fijar('i-tasa', V.tasaCapSugerida(tipo));
    fijar('i-vacancia', Math.round(CAL.DEDUCCIONES_INGRESOS.vacancia * 100));
    fijar('i-gastos', Math.round(CAL.DEDUCCIONES_INGRESOS.gastos * 100));
    fijar('w-mercado', Math.round(pesos.mercado * 100));
    fijar('w-costo', Math.round(pesos.costo * 100));
    fijar('w-ingresos', Math.round(pesos.ingresos * 100));
  }

  function getCosto() {
    const s = getSujeto();
    if (s.tipo === 'terreno' || !s.m2c) return null;   // sin construcción no hay costo que reponer
    return V.enfoqueCosto({
      calidadAcabados: s.atributos.calidadAcabados,
      m2c: s.m2c, m2t: s.m2t,
      edad: +$('k-edad').value || 0,
      vidaUtil: +$('k-vidautil').value || CAL.VIDA_UTIL_DEFAULT,
      conservacion: s.conservacion,
      terMin: s.terMin, terMax: s.terMax,
      coloniaNombre: s.coloniaNombre,
    });
  }

  function getIngresos() {
    const renta = +$('i-renta').value || 0;
    if (renta <= 0) return null;                        // sin renta capturada no hay enfoque
    return V.enfoqueIngresos({
      rentaMensual: renta,
      tasaCapAnual: +$('i-tasa').value || 0,
      vacancia: ($('i-vacancia').value === '') ? null : (+$('i-vacancia').value / 100),
      gastos: ($('i-gastos').value === '') ? null : (+$('i-gastos').value / 100),
    });
  }

  function getPesos() {
    return {
      mercado: (+$('w-mercado').value || 0) / 100,
      costo: (+$('w-costo').value || 0) / 100,
      ingresos: (+$('w-ingresos').value || 0) / 100,
    };
  }

  // Lecturas en vivo del paso 6, para que el asesor vea el efecto de lo que captura.
  function actualizarEnfoques() {
    sugerirPorTipo();
    const s = getSujeto();

    const costo = getCosto();
    $('k-detalle').innerHTML = costo
      ? `Reposición nueva: <b>${fmtMXN(costo.vrn)}</b> (${fmtMXN(costo.costoM2)}/m² × ${s.m2c} m²) · `
        + `depreciación <b>${(costo.depreciacion * 100).toFixed(1)}%</b> · `
        + `construcción <b>${fmtMXN(costo.construccionDepreciada)}</b> + terreno <b>${fmtMXN(costo.terreno)}</b> `
        + `= <b>${fmtMXN(costo.total)}</b>`
      : (s.tipo === 'terreno'
          ? 'No aplica a un terreno: no hay construcción que reponer.'
          : 'Captura los m² construidos en el paso 2 para calcular el costo.');

    const ing = getIngresos();
    $('i-detalle').innerHTML = ing
      ? `Renta bruta anual <b>${fmtMXN(ing.rentaBrutaAnual)}</b> − vacancia ${(ing.vacancia * 100).toFixed(0)}% `
        + `− gastos ${(ing.gastos * 100).toFixed(0)}% = renta neta <b>${fmtMXN(ing.rentaNetaAnual)}</b> ÷ `
        + `${ing.tasaCapAnual}% = <b>${fmtMXN(ing.total)}</b>`
      : 'Sin renta capturada, este enfoque no entra en la conciliación.';

    // Qué pesos se aplicarán de verdad, con los datos que hay ahora mismo.
    const valorCmp = V.conciliar(comparables, s);
    const mercado = V.valorMercado(V.estimadoAutomatico(s), valorCmp);
    const c = V.conciliarEnfoques(
      { mercado: mercado.valor, costo: (costo && costo.total) || 0, ingresos: (ing && ing.total) || 0 },
      getPesos()
    );
    const filas = Object.entries(c.detalle).map(([k, d]) =>
      `${ETIQUETA_ENFOQUE[k]}: ${fmtMXN(d.valor)} × <b>${(d.pesoAplicado * 100).toFixed(1)}%</b>`
      + (Math.abs(d.pesoAplicado - d.peso) > 1e-9 ? ` <span style="opacity:.7">(capturaste ${(d.peso * 100).toFixed(0)}%)</span>` : '')
    );
    $('w-detalle').innerHTML = filas.length
      ? filas.join('<br>')
        + (c.renormalizado
            ? '<br><em>Los enfoques sin datos no entran; su peso se reparte entre los demás. El informe declara el peso aplicado, no el capturado.</em>'
            : '')
      : 'Ningún enfoque tiene datos y peso a la vez: asigna al menos uno.';
  }

  const ETIQUETA_ENFOQUE = { mercado: 'Mercado', costo: 'Costo', ingresos: 'Ingresos' };

  ['k-edad', 'k-vidautil', 'i-renta', 'i-tasa', 'i-vacancia', 'i-gastos', 'w-mercado', 'w-costo', 'w-ingresos']
    .forEach(id => $(id).addEventListener('input', actualizarEnfoques));

  // ── Override ──
  $('ovr-activo').addEventListener('change', () => { $('ovr-fields').hidden = !$('ovr-activo').checked; computeConclusion(); });
  $('ovr-valor').addEventListener('input', computeConclusion);

  // ── Conclusión ──
  function computeConclusion() {
    const sujeto = getSujeto();
    const estimado = V.estimadoAutomatico(sujeto);
    const valorCmp = V.conciliar(comparables, sujeto);
    const costo = getCosto();
    const ingresos = getIngresos();
    const pesos = getPesos();
    const override = { activo: $('ovr-activo').checked, valor: +$('ovr-valor').value || 0 };
    const final = V.valorFinal({ estimado, valorComparables: valorCmp, costo, ingresos, pesos, override });

    $('res-cmp').textContent = valorCmp.total > 0 ? fmtMXN(valorCmp.total) : 'Sin comparables';
    $('res-costo').textContent = costo ? fmtMXN(costo.total) : 'No aplica';
    $('res-ingresos').textContent = ingresos ? fmtMXN(ingresos.total) : 'Sin renta';
    $('res-auto').textContent = fmtMXN(estimado.mid);

    const c = final.conciliacion;
    const partes = Object.entries(c.detalle).map(([k, d]) =>
      `${ETIQUETA_ENFOQUE[k]} ${(d.pesoAplicado * 100).toFixed(1)}%`);
    $('res-conciliacion').innerHTML = final.usaOverride
      ? 'Valor fijado por el asesor; la conciliación queda como referencia: ' + (partes.join(' · ') || '—')
      : (partes.length
          ? 'Pesos aplicados: <b>' + partes.join(' · ') + '</b>'
            + (mercadoDesdeModelo(final) ? ' · el enfoque de mercado usa el modelo por zona (sin comparables válidos)' : '')
          : 'Sin enfoques con datos: revisa el paso 6.');

    // Alertas de calidad de la muestra de comparables.
    const alertas = (valorCmp.alertas || []);
    $('res-alertas').innerHTML = alertas.length
      ? alertas.map(a => `<div class="crm-msg crm-msg--warn">${esc(a)}</div>`).join('')
      : '';

    $('res-final').textContent = fmtMXN(final.concluido);
    $('res-rango').textContent = final.concluido ? `Rango: ${fmtMXN(final.min)} – ${fmtMXN(final.max)}` : '';
    return { estimado, valorCmp, costo, ingresos, pesos, override, final };
  }

  function mercadoDesdeModelo(final) { return final.mercado && final.mercado.fuente === 'modelo-zona'; }

  // ── Guardar ──
  function validar() {
    if (!$('c-nombre').value.trim() || !$('c-asesor').value.trim()) { alert('Captura el cliente y el asesor (paso 1).'); mostrarPaso(1); return false; }
    const s = getSujeto();
    if (!s.tipo || !s.coloniaNombre || !s.m2c || !s.antiguedad || !s.conservacion) { alert('Completa los datos de la propiedad (paso 2).'); mostrarPaso(2); return false; }
    if ($('ovr-activo').checked && !$('ovr-justif').value.trim()) { alert('El ajuste manual requiere justificación (paso 7).'); mostrarPaso(7); return false; }
    const p = getPesos();
    if (!(p.mercado > 0 || p.costo > 0 || p.ingresos > 0)) { alert('Asigna peso a al menos un enfoque (paso 6).'); mostrarPaso(6); return false; }
    return true;
  }

  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Descarga la captura completa como archivo. Es la red de seguridad cuando el
   * guardado falla: seis pasos de trabajo no pueden depender de que haya espacio.
   * Se recupera con «Importar» desde el panel (dashboard-ui.js). */
  function descargarRespaldo(avaluo) {
    const marca = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
    const blob = new Blob([JSON.stringify({ version: 1, exportado: new Date().toISOString(), avaluos: [avaluo] }, null, 2)],
                          { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avaluo-respaldo-' + marca + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function avisoGuardado(html, tipo) {
    const caja = $('avisoGuardado');
    caja.className = 'crm-msg crm-msg--' + tipo;
    caja.innerHTML = html;
    caja.hidden = false;
    caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Publica en la biblioteca los comparables capturados en este avalúo, para que el
   * siguiente asesor no los vuelva a teclear. Los que se tomaron de la biblioteca no
   * se reinsertan. Nunca lanza: un fallo aquí no puede tumbar un avalúo ya guardado. */
  async function publicarEnBiblioteca(avaluoId, ciudad, sujeto) {
    if (!hayNube()) return;
    const nuevos = comparables
      .filter(c => !c.bibliotecaId && +c.precio > 0 && +c.m2 > 0)
      .map(c => ({
        direccion: (c.direccion || '').trim() || null,
        cp: $('p-cp').value.trim() || null,
        ciudad: ciudad || null,
        colonia: sujeto.coloniaNombre || null,
        zona_tier: c.zonaTier || V.clasificarTier(sujeto.coloniaNombre) || null,
        tipo: sujeto.tipo || null,
        m2: +c.m2, recamaras: +c.recamaras || null, banos: +c.banos || null,
        antiguedad: c.antiguedad || null, conservacion: c.conservacion || null,
        precio: +c.precio,
        tipo_precio: c.tipoPrecio || 'lista',
        fecha: c.fecha || null,
      }));
    if (!nuevos.length) return;
    try {
      const r = await Legio.crm.comparables.guardarLote(nuevos, avaluoId);
      console.info(`Biblioteca: ${r.guardados} nuevo(s), ${r.duplicados} ya existía(n), ${r.fallidos} con error.`);
    } catch (err) {
      console.warn('No se pudo publicar en la biblioteca de comparables:', err.message);
    }
  }

  let guardando = false;

  async function guardar(verInforme) {
    if (guardando) return;
    if (!validar()) return;
    const { estimado, valorCmp, costo, ingresos, pesos, override, final } = computeConclusion();
    const s = getSujeto();
    const data = COLONIAS_DB[$('p-cp').value.trim()];
    const avaluo = {
      id: editId || undefined,
      folio: editFolio || undefined,
      fecha: editFecha || undefined,
      // Nace en borrador. Se emite desde el informe, no aquí: emitir es una decisión
      // aparte de capturar, y un borrador impreso no debe parecer un documento entregable.
      estado: editEstado || 'borrador',
      asesor: $('c-asesor').value.trim(),
      cliente: { nombre: $('c-nombre').value.trim(), telefono: $('c-tel').value.trim(), email: $('c-email').value.trim() },
      propiedad: {
        tipo: s.tipo, cp: $('p-cp').value.trim(), ciudad: data ? data.ciudad : '', colonia: s.coloniaNombre,
        m2c: s.m2c, m2t: s.m2t, recamaras: s.rec, banos: s.ban, cajones: s.caj, nivel: s.nivel,
        antiguedad: s.antiguedad, conservacion: s.conservacion, extras: s.extras,
      },
      atributos: s.atributos,
      comparables: comparables,
      fotos: fotos,
      estimadoAutomatico: { min: estimado.min, mid: estimado.mid, max: estimado.max,
                            tier: estimado.tier, precioEsGenerico: estimado.precioEsGenerico },
      valorComparables: { porM2: valorCmp.porM2, total: valorCmp.total, stats: valorCmp.stats, alertas: valorCmp.alertas },
      // Captura de los enfoques, para poder reconstruir y auditar el avalúo tal cual se emitió.
      enfoques: {
        costo: costo ? {
          costoM2: costo.costoM2, vrn: costo.vrn, depreciacion: costo.depreciacion,
          construccionDepreciada: costo.construccionDepreciada, terreno: costo.terreno, total: costo.total,
          edad: +$('k-edad').value || 0, vidaUtil: +$('k-vidautil').value || CAL.VIDA_UTIL_DEFAULT,
        } : null,
        ingresos: ingresos ? {
          rentaMensual: +$('i-renta').value || 0,
          rentaBrutaAnual: ingresos.rentaBrutaAnual, rentaNetaAnual: ingresos.rentaNetaAnual,
          vacancia: ingresos.vacancia, gastos: ingresos.gastos,
          tasaCapAnual: ingresos.tasaCapAnual, total: ingresos.total,
        } : null,
      },
      pesos,
      // Los pesos APLICADOS (renormalizados) viven aquí: son los que debe declarar el informe.
      conciliacion: final.conciliacion,
      fuenteMercado: final.mercado.fuente,
      override: { activo: override.activo, valor: override.valor, justificacion: $('ovr-justif').value.trim() },
      resultado: { min: final.min, mid: final.mid, max: final.max, concluido: final.concluido },
    };
    const botones = [$('btnGuardar'), $('btnGuardarInforme')];
    guardando = true;
    botones.forEach(b => { b.disabled = true; });
    $('avisoGuardado').hidden = true;

    try {
      const saved = await Legio.storage.save(avaluo);
      // La biblioteca es un extra: si falla, el avalúo ya quedó guardado y no se
      // interrumpe al asesor. Solo los comparables nuevos, no los que salieron de ahí.
      await publicarEnBiblioteca(saved.id, data ? data.ciudad : '', s);
      location.href = verInforme ? ('informe.html?id=' + saved.id) : 'index.html';
    } catch (err) {
      console.error('Fallo al guardar el avalúo:', err);
      avisoGuardado(
        '<strong>El avalúo no se guardó.</strong> ' + esc((err && err.message) || 'Error desconocido.') +
        '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn--sm" id="btnRespaldo">Descargar respaldo</button>' +
          '<span style="font-size:.82rem;">Guarda toda la captura en un archivo; se recupera con «Importar» desde el panel.</span>' +
        '</div>', 'err');
      $('btnRespaldo').addEventListener('click', () => descargarRespaldo(avaluo));
    } finally {
      guardando = false;
      botones.forEach(b => { b.disabled = false; });
    }
  }
  $('btnGuardar').addEventListener('click', () => guardar(false));
  $('btnGuardarInforme').addEventListener('click', () => guardar(true));

  // ── Modo edición ──
  async function cargarEdicion() {
    const a = await Legio.storage.get(editId);
    if (!a) { editId = null; return; }
    editFolio = a.folio; editFecha = a.fecha; editEstado = a.estado || null;
    $('c-nombre').value = a.cliente?.nombre || '';
    $('c-asesor').value = a.asesor || '';
    $('c-tel').value = a.cliente?.telefono || '';
    $('c-email').value = a.cliente?.email || '';
    const p = a.propiedad || {};
    $('p-tipo').value = p.tipo || '';
    actualizarCamposPorTipo();
    $('p-cp').value = p.cp || '';
    buscarColonias(p.colonia);
    $('p-m2c').value = p.m2c || '';
    $('p-m2t').value = p.m2t || '';
    $('p-rec').value = p.recamaras || 0;
    $('p-ban').value = p.banos || 0;
    $('p-caj').value = p.cajones || 0;
    $('p-nivel').value = p.nivel || 'medio';
    $('p-antig').value = p.antiguedad || '';
    $('p-conserv').value = p.conservacion || '';
    (p.extras || []).forEach(v => { const el = document.querySelector(`.p-extra[value="${v}"]`); if (el) el.checked = true; });
    const at = a.atributos || {};
    $('a-calidad').value = at.calidadAcabados || 'media';
    $('a-ubic').value = at.ubicacionEnColonia || 'interior';
    (at.servicios || []).forEach(v => { const el = document.querySelector(`.a-serv[value="${v}"]`); if (el) el.checked = true; });
    comparables = a.comparables || [];
    fotos = a.fotos || [];

    // Enfoques. Los avalúos anteriores a la unificación no los traen: se quedan en blanco
    // y sugerirPorTipo() rellena lo que corresponda al tipo.
    const enf = a.enfoques || {};
    if (enf.costo) { $('k-edad').value = enf.costo.edad ?? ''; $('k-vidautil').value = enf.costo.vidaUtil ?? 60; }
    if (enf.ingresos) {
      $('i-renta').value = enf.ingresos.rentaMensual || '';
      $('i-tasa').value = enf.ingresos.tasaCapAnual ?? '';
      $('i-vacancia').value = enf.ingresos.vacancia != null ? Math.round(enf.ingresos.vacancia * 100) : '';
      $('i-gastos').value = enf.ingresos.gastos != null ? Math.round(enf.ingresos.gastos * 100) : '';
    }
    if (a.pesos) {
      $('w-mercado').value = Math.round((a.pesos.mercado || 0) * 100);
      $('w-costo').value = Math.round((a.pesos.costo || 0) * 100);
      $('w-ingresos').value = Math.round((a.pesos.ingresos || 0) * 100);
    }
    // Lo recuperado del avalúo guardado manda sobre cualquier sugerencia por tipo.
    SUGERIDOS.forEach(id => { if ($(id).value !== '') tocados.add(id); });

    if (a.override?.activo) { $('ovr-activo').checked = true; $('ovr-fields').hidden = false; $('ovr-valor').value = a.override.valor || ''; $('ovr-justif').value = a.override.justificacion || ''; }
    renderComparables();
    renderFotos();
    sugerirPorTipo();
  }

  // Init
  actualizarCamposPorTipo();
  $('p-tipo').addEventListener('change', sugerirPorTipo);
  if (editId) cargarEdicion(); else sugerirPorTipo();
})();
