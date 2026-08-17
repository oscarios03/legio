/* ===== FORMULARIO DE PROPIEDAD (alta/edición) ===== */
(function () {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const editId = params.get('id');

  let esAdmin = false;
  let propiedadId = editId || null;   // se define al primer guardado si es alta
  let fotosPendientes = [];           // {blob, url(objectURL)} aún no subidas (alta nueva)

  const etTipo = t => ({ casa:'Casa', departamento:'Departamento', local:'Local comercial', terreno:'Terreno' }[t] || t);

  // ---- Ubicación por CP (reutiliza COLONIAS_DB de colonias.js) ----
  function buscarCP() {
    const cp = $('p-cp').value.trim();
    $('cp-info').textContent = '';
    if (cp.length !== 5 || typeof COLONIAS_DB === 'undefined' || !COLONIAS_DB[cp]) {
      $('p-colonia').innerHTML = '<option value="">—</option>';
      return;
    }
    const data = COLONIAS_DB[cp];
    $('cp-info').textContent = '📍 ' + data.ciudad;
    if (!$('p-ciudad').value) $('p-ciudad').value = data.ciudad;
    $('p-colonia').innerHTML = '<option value="">Selecciona colonia</option>' +
      data.colonias.map(c => `<option>${c.nombre}</option>`).join('');
  }

  function mostrarCamposPorTipo() {
    const t = $('p-tipo').value;
    $('row-hab').style.display = (t === 'terreno') ? 'none' : '';
  }

  // ---- Compresión a Blob (reutiliza la lógica de avaluo-ui, con toBlob) ----
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
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.7);
      };
      img.onerror = reject;
      const fr = new FileReader();
      fr.onload = e => { img.src = e.target.result; };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // Galería: mezcla fotos ya guardadas (con id) y pendientes (sin id).
  let fotosGuardadas = []; // filas de propiedad_fotos
  function renderFotos() {
    const items = [];
    fotosGuardadas.forEach(f => items.push({ id: f.id, url: f.url, principal: f.principal }));
    fotosPendientes.forEach((f, i) => items.push({ pendIdx: i, url: f.url, principal: false }));
    $('fotosGrid').innerHTML = items.map(it => `
      <div class="foto-item ${it.principal ? 'is-principal' : ''}">
        <img src="${it.url}" alt="" />
        <button type="button" data-rm="${it.id != null ? 'g:' + it.id : 'p:' + it.pendIdx}">×</button>
        ${it.id != null ? `<button type="button" class="foto-item__star" data-star="${it.id}">${it.principal ? '★ principal' : 'Hacer principal'}</button>` : '<span class="foto-item__star">Se sube al guardar</span>'}
      </div>`).join('');

    $('fotosGrid').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const v = b.dataset.rm;
      if (v.startsWith('p:')) { fotosPendientes.splice(+v.slice(2), 1); renderFotos(); }
      else {
        const id = v.slice(2);
        if (!confirm('¿Eliminar esta foto?')) return;
        try { await Legio.crm.fotos.remove(id); fotosGuardadas = fotosGuardadas.filter(f => f.id !== id); renderFotos(); }
        catch (e) { alert('No se pudo eliminar: ' + e.message); }
      }
    }));
    $('fotosGrid').querySelectorAll('[data-star]').forEach(b => b.addEventListener('click', async () => {
      try {
        await Legio.crm.fotos.setPrincipal(b.dataset.star, propiedadId);
        fotosGuardadas.forEach(f => f.principal = (f.id === b.dataset.star));
        renderFotos();
      } catch (e) { alert('No se pudo marcar principal: ' + e.message); }
    }));
  }

  $('fotoInput').addEventListener('change', async e => {
    for (const file of e.target.files) {
      try {
        const blob = await comprimir(file);
        if (propiedadId) {
          // Edición: subir de una vez.
          const row = await Legio.crm.fotos.upload(propiedadId, blob, { principal: fotosGuardadas.length === 0 });
          fotosGuardadas.push(row);
          if (fotosGuardadas.length === 1) await Legio.crm.fotos.setPrincipal(row.id, propiedadId);
        } else {
          fotosPendientes.push({ blob, url: URL.createObjectURL(blob) });
        }
      } catch (err) { console.warn('Foto inválida:', err.message); }
    }
    e.target.value = '';
    renderFotos();
  });

  // ---- Sugerir precio con el motor de valuación ----
  $('btnSugerir').addEventListener('click', () => {
    if (typeof Legio.valuacion === 'undefined') { alert('Motor de valuación no disponible.'); return; }
    const cp = $('p-cp').value.trim();
    const colonia = $('p-colonia').value;
    if (!cp || typeof COLONIAS_DB === 'undefined' || !COLONIAS_DB[cp]) { alert('Captura un CP válido y la colonia primero.'); return; }
    const colData = (COLONIAS_DB[cp].colonias || []).find(c => c.nombre === colonia) || COLONIAS_DB[cp].colonias[0];
    if (!colData) { alert('Selecciona una colonia.'); return; }
    const est = Legio.valuacion.estimadoAutomatico({
      tipo: $('p-tipo').value,
      conMin: colData.conMin, conMax: colData.conMax, terMin: colData.terMin, terMax: colData.terMax,
      coloniaNombre: colData.nombre,
      // Si la colonia tiene precio propio, la zona ya está dentro del precio.
      precioEsGenerico: Legio.calibracionBase.esPrecioGenerico(COLONIAS_DB[cp].ciudad, colData),
      m2c: +$('p-m2').value || 0, m2t: +$('p-m2t').value || 0,
      rec: +$('p-rec').value || 0, ban: +$('p-ban').value || 0, caj: +$('p-caj').value || 0,
      nivel: 'medio', antiguedad: $('p-antig').value || 'media', conservacion: $('p-conserv').value || 'buena',
      extras: [], atributos: { calidadAcabados: 'media', ubicacionEnColonia: 'interior', servicios: [] },
    });
    if (est && est.mid) { $('p-precio').value = Math.round(est.mid); $('cp-info').textContent = '💡 Sugerido: ' + new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(est.mid); }
  });

  // ---- Cargar selects de asesores ----
  async function cargarAsesores() {
    const asesores = await Legio.crm.asesores.list(true);
    const opts = '<option value="">—</option>' + asesores.map(a => `<option value="${a.id}">${esc(a.nombre || a.email)}</option>`).join('');
    $('p-captador').innerHTML = opts;
    $('p-vendedor').innerHTML = opts;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function msg(texto, tipo) { $('msg').innerHTML = `<div class="crm-msg crm-msg--${tipo}">${esc(texto)}</div>`; }

  // ---- Cargar propiedad existente ----
  async function cargarPropiedad(id) {
    const p = await Legio.crm.propiedades.get(id);
    if (!p) { msg('Propiedad no encontrada.', 'err'); return; }
    $('p-titulo').value = p.titulo || '';
    $('p-tipo').value = p.tipo || 'casa';
    $('p-operacion').value = p.operacion || 'venta';
    $('p-estatus').value = p.estatus || 'borrador';
    $('p-cp').value = p.cp || '';
    buscarCP();
    $('p-ciudad').value = p.ciudad || '';
    if (p.colonia) { if (![...$('p-colonia').options].some(o => o.value === p.colonia)) $('p-colonia').innerHTML += `<option>${esc(p.colonia)}</option>`; $('p-colonia').value = p.colonia; }
    $('p-direccion').value = p.direccion || '';
    $('p-precio').value = p.precio ?? '';
    $('p-m2').value = p.m2 ?? '';
    $('p-m2t').value = p.m2_terreno ?? '';
    $('p-rec').value = p.recamaras ?? '';
    $('p-ban').value = p.banos ?? '';
    $('p-caj').value = p.cajones ?? '';
    $('p-antig').value = p.antiguedad || '';
    $('p-conserv').value = p.conservacion || '';
    $('p-desc').value = p.descripcion || '';
    $('p-captador').value = p.asesor_captador_id || '';
    $('p-vendedor').value = p.asesor_vendedor_id || '';
    $('p-publica').checked = !!p.publica;
    $('p-destacada').checked = !!p.destacada;
    $('p-precio-final').value = p.precio_venta_final ?? '';
    $('p-fecha-venta').value = p.fecha_venta || '';
    $('p-com-pct').value = p.comision_pct ?? '';
    $('p-com-cap').value = p.comision_captador_pct ?? '';
    $('p-com-ven').value = p.comision_vendedor_pct ?? '';
    mostrarCamposPorTipo();
    pintarRevision(p);
    fotosGuardadas = await Legio.crm.fotos.listByPropiedad(id);
    renderFotos();
    pintarCompartir(p);
    cargarInteresados(id);
  }

  /* Estado de la revisión, arriba del formulario.
   * El captador tiene que enterarse aquí de por qué su propiedad no aparece en
   * el sitio: la casilla "mostrar en el sitio público" puede estar marcada y
   * aun así no salir, porque la política RLS exige el dictamen del admin. */
  function pintarRevision(p) {
    const caja = $('revisionBox');
    if (!caja) return;
    const esc = Legio.util.esc;
    const estado = p.revision_estado || 'pendiente';
    const obs = p.revision_observaciones;

    const cajas = {
      pendiente: ['warn', 'Esta propiedad está <strong>esperando revisión</strong>. No sale al sitio público hasta que un administrador la apruebe.'],
      aprobada:  ['ok',   'Propiedad <strong>aprobada</strong>. Si está disponible y marcada como pública, ya se ve en el sitio.'],
      devuelta:  ['err',  'Un administrador <strong>devolvió</strong> esta propiedad. Corrige lo señalado y guarda: vuelve a entrar a revisión automáticamente.'],
      desechada: ['err',  'Esta propiedad fue <strong>desechada</strong> por un administrador y no se publicará.'],
    };
    const [tono, texto] = cajas[estado] || cajas.pendiente;
    caja.innerHTML = `<div class="crm-msg crm-msg--${tono}">${texto}` +
      (obs ? `<br><br><strong>Observaciones:</strong> ${esc(obs)}` : '') + '</div>';

    $('hintPublicar').textContent = esAdmin
      ? 'Como administrador, al aprobar la propiedad se marca como pública automáticamente.'
      : 'Marcar esta casilla no publica la propiedad por sí sola: primero tiene que aprobarla un administrador.';
  }

  // ---- Compartir la ficha pública -------------------------------------------
  function pintarCompartir(p) {
    const U = Legio.util;
    const link = U.linkPropiedad(p.id);
    $('compartirBox').style.display = '';
    $('linkPublico').value = link;
    $('btnVerFicha').href = link;

    const texto = `Te comparto esta propiedad de Legio Inmobiliaria:\n\n${p.titulo}\n` +
                  `${U.etTipo(p.tipo)} en ${[p.colonia, p.ciudad].filter(Boolean).join(', ')}\n` +
                  `${U.fmtMXN(p.precio)}\n\n${link}`;
    $('btnCompartirWA').href = U.waLink('', texto);

    const visible = p.publica && p.estatus === 'disponible';
    $('compartirAviso').textContent = visible
      ? '✅ La ficha está visible para cualquiera con el enlace.'
      : '⚠️ Hoy el cliente vería un aviso de "no disponible": marca "Mostrar en el sitio público" y pon el estatus en "Disponible".';

    $('btnCopiarLink').onclick = async () => {
      const ok = await U.copiar(link);
      $('btnCopiarLink').textContent = ok ? '¡Copiado!' : 'No se pudo';
      setTimeout(() => { $('btnCopiarLink').textContent = 'Copiar'; }, 1800);
    };
  }

  // ---- Prospectos que preguntaron por esta propiedad -------------------------
  async function cargarInteresados(id) {
    const U = Legio.util;
    let leads = [];
    try { leads = await Legio.crm.propiedades.interesados(id); }
    catch (e) { return; }

    $('interesados').style.display = '';
    if (!leads.length) {
      $('interesadosWrap').innerHTML = '<p class="int-empty" style="padding:24px 0;">Todavía nadie ha preguntado por esta propiedad.</p>';
      return;
    }
    $('interesadosWrap').innerHTML =
      '<div class="tabla-scroll"><table class="int-table"><thead><tr>' +
      '<th>Prospecto</th><th>Contacto</th><th>Estatus</th><th>Asesor</th><th>Desde</th><th></th>' +
      '</tr></thead><tbody>' +
      leads.map(l => `<tr>
        <td><strong>${U.esc(l.nombre || 'Sin nombre')}</strong></td>
        <td>${U.esc(l.telefono || l.email || '—')}</td>
        <td>${U.etEstatus(l.estatus)}</td>
        <td>${l.asesor ? U.esc(l.asesor.nombre) : 'Sin asignar'}</td>
        <td>${U.fmtFecha(l.created_at)}</td>
        <td><a class="btn btn--ghost btn--sm" href="lead.html?id=${l.id}">Ver ficha</a></td>
      </tr>`).join('') +
      '</tbody></table></div>';
  }

  function recolectar() {
    const obj = {
      titulo: $('p-titulo').value.trim(),
      tipo: $('p-tipo').value,
      operacion: $('p-operacion').value,
      estatus: $('p-estatus').value,
      cp: $('p-cp').value.trim() || null,
      ciudad: $('p-ciudad').value.trim() || null,
      colonia: $('p-colonia').value || null,
      direccion: $('p-direccion').value.trim() || null,
      precio: num($('p-precio').value),
      m2: num($('p-m2').value),
      m2_terreno: num($('p-m2t').value),
      recamaras: int($('p-rec').value),
      banos: int($('p-ban').value),
      cajones: int($('p-caj').value),
      antiguedad: $('p-antig').value || null,
      conservacion: $('p-conserv').value || null,
      descripcion: $('p-desc').value.trim() || null,
      publica: $('p-publica').checked,
      destacada: $('p-destacada').checked,
      asesor_captador_id: $('p-captador').value || null,
      asesor_vendedor_id: $('p-vendedor').value || null,
    };
    if (esAdmin) {
      obj.precio_venta_final = num($('p-precio-final').value);
      obj.fecha_venta = $('p-fecha-venta').value || null;
      obj.comision_pct = num($('p-com-pct').value);
      obj.comision_captador_pct = num($('p-com-cap').value);
      obj.comision_vendedor_pct = num($('p-com-ven').value);
    }
    return obj;
  }
  const num = v => (v === '' || v == null) ? null : Number(v);
  const int = v => (v === '' || v == null) ? 0 : parseInt(v, 10);

  $('propForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!$('p-titulo').value.trim()) { msg('El título es obligatorio.', 'err'); return; }
    if (!$('p-precio').value) { msg('El precio es obligatorio.', 'err'); return; }
    $('btnGuardar').disabled = true;
    try {
      const obj = recolectar();
      if (propiedadId) obj.id = propiedadId;
      const guardada = await Legio.crm.propiedades.save(obj);
      propiedadId = guardada.id;

      // Subir fotos pendientes (caso alta nueva)
      if (fotosPendientes.length) {
        for (let i = 0; i < fotosPendientes.length; i++) {
          const row = await Legio.crm.fotos.upload(propiedadId, fotosPendientes[i].blob, { orden: i });
          fotosGuardadas.push(row);
        }
        // Marcar principal la primera si no hay ninguna
        if (fotosGuardadas.length && !fotosGuardadas.some(f => f.principal)) {
          await Legio.crm.fotos.setPrincipal(fotosGuardadas[0].id, propiedadId);
        }
        fotosPendientes = [];
      }
      location.href = 'crm.html';
    } catch (err) {
      msg('No se pudo guardar: ' + err.message, 'err');
      $('btnGuardar').disabled = false;
    }
  });

  $('p-cp').addEventListener('input', buscarCP);
  $('p-tipo').addEventListener('change', mostrarCamposPorTipo);

  async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    await Legio.shell.montar({ page: 'propiedades' });
    esAdmin = await Legio.crmAuth.isAdmin();
    if (!esAdmin) $('ventaBox').style.display = 'none';
    $('hintPublicar').textContent = esAdmin
      ? 'Como administrador, al aprobar la propiedad se marca como pública automáticamente.'
      : 'Marcar esta casilla no publica la propiedad por sí sola: primero tiene que aprobarla un administrador.';
    mostrarCamposPorTipo();
    try {
      await cargarAsesores();
      if (editId) {
        $('titulo').textContent = 'Editar propiedad';
        document.title = 'Editar propiedad — CRM Legio';
        await cargarPropiedad(editId);
      } else {
        // Prefijar captador con el asesor actual
        const yo = await Legio.crmAuth.currentAsesor();
        if (yo) $('p-captador').value = yo.id;
      }
    } catch (e) { msg('Error cargando datos: ' + e.message, 'err'); }
  }

  init();
})();
