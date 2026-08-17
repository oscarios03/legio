/* ===== ESTIMADOR DE VALOR — LEGIO INMOBILIARIA ===== */

const WA_EST = '524770000000'; // Reemplaza con el número real

// ── Motor de valuación (fuente única) ──
// Las constantes (MULT_TIPO, MULT_ANTIG, ...), la clasificación de zona y el cálculo
// viven en interno/js/valuacion-core.js (Legio.valuacion), cargado ANTES que este
// archivo en estimador.html. Aquí solo lo consumimos para no duplicar lógica.
const clasificarTier = Legio.valuacion.clasificarTier;

// Guarda el último estimado calculado para armar el mensaje/lead cuando el
// usuario pide su informe completo en el paso 2 (ver enviarInforme()).
let ultimoEstimado = null;

// ── Navegación entre pasos ──

function mostrarPaso(num) {
  document.getElementById('step1').classList.toggle('est-card--hidden', num !== 1);
  document.getElementById('step2').classList.toggle('est-card--hidden', num !== 2);
  document.getElementById('step3').classList.toggle('est-card--hidden', num !== 3);

  document.querySelectorAll('.est-progress__step').forEach(el => {
    const n = parseInt(el.dataset.step);
    el.classList.toggle('active', n === num);
    el.classList.toggle('done',   n < num);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Validaciones ──

function validarContacto() {
  let ok = true;
  const nombre = document.getElementById('e-nombre').value.trim();
  const tel    = document.getElementById('e-tel').value.trim().replace(/\D/g, '');
  const email  = document.getElementById('e-email').value.trim();

  setError('err-nombre', nombre.length < 2 ? 'Por favor ingresa tu nombre.' : '');
  if (nombre.length < 2) ok = false;

  setError('err-tel', tel.length < 10 ? 'Ingresa un teléfono de 10 dígitos.' : '');
  if (tel.length < 10) ok = false;

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setError('err-email', !emailValido ? 'Ingresa un correo válido.' : '');
  if (!emailValido) ok = false;

  return ok;
}

function validarPropiedad() {
  let ok = true;
  const tipo         = document.getElementById('e-tipo').value;
  const cp           = document.getElementById('e-cp').value.trim();
  const colonia      = document.getElementById('e-colonia').value;
  const m2           = parseFloat(document.getElementById('e-m2').value);
  const antig        = document.getElementById('e-antig').value;
  const conservacion = document.getElementById('e-conservacion').value;

  setError('err-tipo', !tipo ? 'Selecciona el tipo de propiedad.' : '');
  if (!tipo) ok = false;

  if (cp.length !== 5) {
    setError('err-cp', 'Ingresa los 5 dígitos del código postal.');
    ok = false;
  } else if (!COLONIAS_DB[cp]) {
    setError('err-cp', 'CP no encontrado. Cubrimos León, Guanajuato, Silao, San Francisco del Rincón, Irapuato, Salamanca y Celaya.');
    ok = false;
  } else {
    setError('err-cp', '');
  }

  setError('err-colonia', !colonia ? 'Selecciona tu colonia.' : '');
  if (!colonia) ok = false;

  setError('err-m2', (!m2 || m2 < 20) ? 'Ingresa los m² (mínimo 20).' : '');
  if (!m2 || m2 < 20) ok = false;

  setError('err-antig', !antig ? 'Selecciona la antigüedad.' : '');
  if (!antig) ok = false;

  setError('err-conservacion', !conservacion ? 'Selecciona el estado de conservación.' : '');
  if (!conservacion) ok = false;

  if (tipo !== 'terreno') {
    const rec = document.getElementById('e-rec').value;
    const ban = document.getElementById('e-ban').value;
    setError('err-rec', !rec ? 'Selecciona el número de recámaras.' : '');
    if (!rec) ok = false;
    setError('err-ban', !ban ? 'Selecciona el número de baños.' : '');
    if (!ban) ok = false;
  }

  return ok;
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

// ── Búsqueda de colonias por CP ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('e-tipo').addEventListener('change', actualizarCamposPorTipo);
  document.getElementById('e-cp').addEventListener('input', buscarColonias);
  // Los campos dependientes del tipo ahora viven en el primer paso visible:
  // inicializarlos al cargar para que el estado sea coherente desde el inicio.
  actualizarCamposPorTipo();
});

function buscarColonias() {
  const cp   = document.getElementById('e-cp').value.trim();
  const sel  = document.getElementById('e-colonia');
  const info = document.getElementById('cp-ciudad');

  setError('err-cp', '');
  info.textContent = '';

  if (cp.length < 5) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">Ingresa tu código postal primero</option>';
    return;
  }

  const data = COLONIAS_DB[cp];
  if (!data) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">CP no encontrado</option>';
    setError('err-cp', 'CP no reconocido. Cubrimos León, Guanajuato, Silao, San Francisco del Rincón, Irapuato, Salamanca y Celaya.');
    return;
  }

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
    sel.appendChild(opt);
  });
}

// ── Mostrar/ocultar campos según tipo de propiedad ──
function actualizarCamposPorTipo() {
  const tipo = document.getElementById('e-tipo').value;
  document.getElementById('row-recamaras').style.display = tipo === 'terreno'      ? 'none' : '';
  document.getElementById('group-m2t').style.display     = (tipo === 'casa' || tipo === 'local') ? '' : 'none';
  document.getElementById('group-piso').style.display    = tipo === 'departamento' ? '' : 'none';
}

// ── Cálculo principal (paso 1 → paso 2) ──
function calcular() {
  if (!validarPropiedad()) return;

  const tipo         = document.getElementById('e-tipo').value;
  const coloniaVal   = JSON.parse(document.getElementById('e-colonia').value);
  const m2c          = parseFloat(document.getElementById('e-m2').value);
  const m2t          = parseFloat(document.getElementById('e-m2t').value) || 0;
  const rec          = parseInt(document.getElementById('e-rec').value)   || 0;
  const ban          = parseInt(document.getElementById('e-ban').value)   || 0;
  const caj          = parseInt(document.getElementById('e-caj').value)   || 0;
  const antig        = document.getElementById('e-antig').value;
  const conservacion = document.getElementById('e-conservacion').value;
  const piso         = document.getElementById('e-piso').value || 'medio';
  const calidad      = document.getElementById('e-calidad').value || 'media';
  const ubicacion    = document.getElementById('e-ubicacion').value || 'interior';
  const extras       = [...document.querySelectorAll('.est-checks input:checked')].map(c => c.value);

  // Diferenciación por zona/colonia (premium / media / popular)
  const tier = clasificarTier(coloniaVal.nombre);

  // Cálculo vía motor compartido (mismas fórmulas, fuente única).
  // El cliente usa solo calidad + ubicación (no comparables ni servicios): más preciso
  // que antes, pero menos que el avalúo profesional del asesor.
  const est = Legio.valuacion.estimadoAutomatico({
    tipo,
    conMin: coloniaVal.conMin, conMax: coloniaVal.conMax,
    terMin: coloniaVal.terMin, terMax: coloniaVal.terMax,
    coloniaNombre: coloniaVal.nombre,
    precioEsGenerico: coloniaVal.esGenerico,
    m2c, m2t, rec, ban, caj,
    nivel: piso, antiguedad: antig, conservacion, extras,
    atributos: { calidadAcabados: calidad, ubicacionEnColonia: ubicacion, servicios: [] },
  });
  const valMin = est.min;
  const valMax = est.max;
  const valMid = est.mid;

  // Labels de texto
  const cp           = document.getElementById('e-cp').value.trim();
  const ciudadLabel  = COLONIAS_DB[cp]?.ciudad || '';
  const antigSel     = document.getElementById('e-antig');
  const antigLabel   = antigSel.options[antigSel.selectedIndex].text;
  const consvSel     = document.getElementById('e-conservacion');
  const consvLabel   = consvSel.options[consvSel.selectedIndex].text.split(' — ')[0];
  const pisoSel      = document.getElementById('e-piso');
  const pisoLabel    = tipo === 'departamento' ? pisoSel.options[pisoSel.selectedIndex].text : null;
  const calidadSel   = document.getElementById('e-calidad');
  const calidadLabel = calidadSel.options[calidadSel.selectedIndex].text.split(' — ')[0];
  const ubicSel      = document.getElementById('e-ubicacion');
  const ubicLabel    = ubicSel.options[ubicSel.selectedIndex].text;

  // Llenar pantalla de resultado (sin datos personales: aún no los pedimos)
  document.getElementById('res-nombre').textContent = etiquetaTipo(tipo) + ' en ' + ciudadLabel + ' · ' + coloniaVal.nombre;
  document.getElementById('res-min').textContent    = formatMXN(valMin);
  document.getElementById('res-max').textContent    = formatMXN(valMax);
  document.getElementById('res-mid').textContent    = formatMXN(valMid);

  // Barra visual: posición del valor central dentro del rango
  const rango = valMax - valMin;
  const pct   = rango > 0 ? Math.max(6, Math.min(94, ((valMid - valMin) / rango) * 100)) : 50;
  const fill   = document.getElementById('resBarFill');
  const marker = document.getElementById('resBarMarker');
  if (fill)   fill.style.width = pct + '%';
  if (marker) marker.style.left = pct + '%';
  const barMin = document.getElementById('resBarMin');
  const barMax = document.getElementById('resBarMax');
  if (barMin) barMin.textContent = formatMXN(valMin);
  if (barMax) barMax.textContent = formatMXN(valMax);

  const rows = [
    ['Tipo',             etiquetaTipo(tipo)],
    ['Ciudad / Colonia', ciudadLabel + ' · ' + coloniaVal.nombre],
    ['M² construidos',   m2c + ' m²'],
  ];
  if ((tipo === 'casa' || tipo === 'local') && m2t > 0) rows.push(['M² terreno', m2t + ' m²']);
  if (tipo !== 'terreno') rows.push(['Recámaras / Baños', rec + ' rec · ' + ban + ' baños']);
  rows.push(['Estacionamiento', caj === 0 ? 'Sin cajón' : caj + ' cajón(es)']);
  if (tipo === 'departamento' && pisoLabel) rows.push(['Nivel', pisoLabel]);
  rows.push(['Antigüedad',   antigLabel]);
  rows.push(['Conservación', consvLabel]);
  rows.push(['Calidad de acabados', calidadLabel]);
  rows.push(['Ubicación', ubicLabel]);
  if (extras.length) rows.push(['Extras', extras.map(etiquetaExtra).join(', ')]);

  document.getElementById('res-detalle').innerHTML =
    '<ul class="est-detail-list">' +
    rows.map(([k, v]) => `<li><span>${k}</span><strong>${v}</strong></li>`).join('') +
    '</ul>';

  // Guardar todo lo necesario para armar el mensaje/lead cuando pidan el informe.
  ultimoEstimado = {
    tipo, ciudadLabel, coloniaNombre: coloniaVal.nombre,
    m2c, m2t, rec, ban, caj, pisoLabel, antigLabel, consvLabel, calidadLabel, ubicLabel, extras,
    valMin, valMax, valMid, tier,
  };

  // Evento de conversión: el usuario completó el estimado
  if (typeof trackEvent === 'function') {
    trackEvent('EstimadorCompletado', { tipo, ciudad: ciudadLabel, tier, valor_central: Math.round(valMid) });
  }

  mostrarPaso(2);
}

// ── Envío del informe (paso 2 → paso 3): aquí se captura el lead ──
function enviarInforme() {
  // Campo trampa: si viene lleno es un bot (ver esBot() en script.js).
  const trampa = document.getElementById('e-website');
  if (trampa && trampa.value.trim()) return;

  if (!validarContacto()) return;
  if (!ultimoEstimado) { mostrarPaso(1); return; }

  const nombre = document.getElementById('e-nombre').value.trim();
  const tel    = document.getElementById('e-tel').value.trim().replace(/\D/g, '');
  const email  = document.getElementById('e-email').value.trim();

  // Capturar el lead (enviarLead / trackLead viven en script.js)
  if (typeof enviarLead === 'function') enviarLead({
    nombre, telefono: tel, email,
    tipo_lead: 'estimador-informe',
    tipo: ultimoEstimado.tipo, ciudad: ultimoEstimado.ciudadLabel,
    valor_central: Math.round(ultimoEstimado.valMid),
  });
  if (typeof trackLead === 'function')  trackLead({ source: 'estimador_resultado' });
  if (typeof trackEvent === 'function') trackEvent('LeadCTAClick', { origen: 'estimador_resultado' });

  const msg = buildWhatsAppMsg({ nombre, tel, email, ...ultimoEstimado });
  window.open(`https://wa.me/${WA_EST}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');

  const cn = document.getElementById('confirm-nombre');
  if (cn) cn.textContent = ', ' + nombre.split(' ')[0];
  mostrarPaso(3);
}

// ── Reinicio ──
function reiniciar() {
  ultimoEstimado = null;
  ['e-nombre','e-tel','e-email','e-tipo','e-cp','e-m2','e-m2t','e-rec','e-ban','e-antig','e-conservacion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('e-caj').value       = '0';
  document.getElementById('e-piso').value      = 'medio';
  document.getElementById('e-calidad').value   = 'media';
  document.getElementById('e-ubicacion').value = 'interior';
  const sel = document.getElementById('e-colonia');
  sel.disabled = true;
  sel.innerHTML = '<option value="">Ingresa tu código postal primero</option>';
  document.getElementById('cp-ciudad').textContent = '';
  document.querySelectorAll('.est-checks input').forEach(c => c.checked = false);
  mostrarPaso(1);
}

// ── Utilidades ──
function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function etiquetaTipo(t) {
  return { casa: 'Casa', departamento: 'Departamento', local: 'Local comercial', terreno: 'Terreno' }[t] || t;
}

function etiquetaExtra(e) {
  return { alberca: 'Alberca', jardin: 'Jardín', vigilancia: 'Vigilancia' }[e] || e;
}

function buildWhatsAppMsg({ nombre, tel, email, tipo, ciudadLabel, coloniaNombre, m2c, m2t, rec, ban, caj, pisoLabel, antigLabel, consvLabel, calidadLabel, ubicLabel, extras, valMin, valMax, valMid }) {
  const lines = [
    '🏠 *Solicitud de Valuación Profesional — Legio Inmobiliaria*',
    '',
    `👤 *Cliente:* ${nombre}`,
    `📞 *Teléfono:* ${tel}`,
    `📧 *Email:* ${email}`,
    '',
    '📋 *Datos de la propiedad:*',
    `• Tipo: ${etiquetaTipo(tipo)}`,
    `• Ciudad / Colonia: ${ciudadLabel} · ${coloniaNombre}`,
    `• M² construidos: ${m2c} m²`,
  ];
  if ((tipo === 'casa' || tipo === 'local') && m2t > 0) lines.push(`• M² terreno: ${m2t} m²`);
  if (tipo !== 'terreno') lines.push(`• Recámaras: ${rec} | Baños: ${ban}`);
  lines.push(`• Estacionamiento: ${caj === 0 ? 'Sin cajón' : caj + ' cajón(es)'}`);
  if (tipo === 'departamento' && pisoLabel) lines.push(`• Nivel: ${pisoLabel}`);
  lines.push(`• Antigüedad: ${antigLabel}`);
  lines.push(`• Conservación: ${consvLabel}`);
  if (calidadLabel) lines.push(`• Calidad de acabados: ${calidadLabel}`);
  if (ubicLabel) lines.push(`• Ubicación: ${ubicLabel}`);
  if (extras.length) lines.push(`• Extras: ${extras.map(etiquetaExtra).join(', ')}`);
  lines.push(
    '',
    '💰 *Estimado automático obtenido:*',
    `• Mínimo:        ${formatMXN(valMin)}`,
    `• Máximo:        ${formatMXN(valMax)}`,
    `• Valor central: ${formatMXN(valMid)}`,
    '',
    'El cliente solicita una valuación profesional de parte de un asesor Legio.',
  );
  return lines.join('\n');
}
