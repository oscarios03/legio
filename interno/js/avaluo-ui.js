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
  let editFolio = null, editFecha = null;

  // ── Navegación entre pasos ──
  function mostrarPaso(n) {
    pasoActual = n;
    $$('[data-panel]').forEach(p => { p.hidden = (+p.dataset.panel !== n); });
    $$('.int-step').forEach(s => {
      const k = +s.dataset.step;
      s.classList.toggle('active', k === n);
      s.classList.toggle('done', k < n);
    });
    if (n === 6) computeConclusion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-next]').forEach(b => b.addEventListener('click', () => mostrarPaso(Math.min(6, pasoActual + 1))));
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
      opt.value = JSON.stringify({ conMin: col.conMin, conMax: col.conMax, terMin: col.terMin, terMax: col.terMax, nombre: col.nombre });
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

  // ── Override ──
  $('ovr-activo').addEventListener('change', () => { $('ovr-fields').hidden = !$('ovr-activo').checked; computeConclusion(); });
  $('ovr-valor').addEventListener('input', computeConclusion);

  // ── Conclusión ──
  function computeConclusion() {
    const sujeto = getSujeto();
    const estimado = V.estimadoAutomatico(sujeto);
    const valorCmp = V.conciliar(comparables, sujeto);
    const override = { activo: $('ovr-activo').checked, valor: +$('ovr-valor').value || 0 };
    const final = V.valorConcluido(estimado, valorCmp, override);
    $('res-auto').textContent = fmtMXN(estimado.mid);
    $('res-cmp').textContent  = valorCmp.total > 0 ? fmtMXN(valorCmp.total) : 'Sin comparables';
    $('res-final').textContent = fmtMXN(final.concluido);
    $('res-rango').textContent = final.concluido ? `Rango: ${fmtMXN(final.min)} – ${fmtMXN(final.max)}` : '';
    return { estimado, valorCmp, override, final };
  }

  // ── Guardar ──
  function validar() {
    if (!$('c-nombre').value.trim() || !$('c-asesor').value.trim()) { alert('Captura el cliente y el asesor (paso 1).'); mostrarPaso(1); return false; }
    const s = getSujeto();
    if (!s.tipo || !s.coloniaNombre || !s.m2c || !s.antiguedad || !s.conservacion) { alert('Completa los datos de la propiedad (paso 2).'); mostrarPaso(2); return false; }
    if ($('ovr-activo').checked && !$('ovr-justif').value.trim()) { alert('El ajuste manual requiere justificación (paso 6).'); mostrarPaso(6); return false; }
    return true;
  }

  async function guardar(verInforme) {
    if (!validar()) return;
    const { estimado, valorCmp, override, final } = computeConclusion();
    const s = getSujeto();
    const data = COLONIAS_DB[$('p-cp').value.trim()];
    const avaluo = {
      id: editId || undefined,
      folio: editFolio || undefined,
      fecha: editFecha || undefined,
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
      estimadoAutomatico: { min: estimado.min, mid: estimado.mid, max: estimado.max },
      valorComparables: { porM2: valorCmp.porM2, total: valorCmp.total },
      override: { activo: override.activo, valor: override.valor, justificacion: $('ovr-justif').value.trim() },
      resultado: { min: final.min, mid: final.mid, max: final.max, concluido: final.concluido },
    };
    const saved = await Legio.storage.save(avaluo);
    if (verInforme) location.href = 'informe.html?id=' + saved.id;
    else location.href = 'index.html';
  }
  $('btnGuardar').addEventListener('click', () => guardar(false));
  $('btnGuardarInforme').addEventListener('click', () => guardar(true));

  // ── Modo edición ──
  async function cargarEdicion() {
    const a = await Legio.storage.get(editId);
    if (!a) { editId = null; return; }
    editFolio = a.folio; editFecha = a.fecha;
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
    if (a.override?.activo) { $('ovr-activo').checked = true; $('ovr-fields').hidden = false; $('ovr-valor').value = a.override.valor || ''; $('ovr-justif').value = a.override.justificacion || ''; }
    renderComparables();
    renderFotos();
  }

  // Init
  actualizarCamposPorTipo();
  if (editId) cargarEdicion();
})();
