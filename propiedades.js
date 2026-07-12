/* ===== PROPIEDADES — LEGIO INMOBILIARIA =====
   Fuente única de datos para las "Propiedades destacadas" del index
   y el catálogo completo de propiedades.html.

   ⚠️ TODO: reemplazar TODAS las entradas de ejemplo con propiedades reales.
   Campos por propiedad:
     id         → identificador único (texto corto)
     titulo     → nombre comercial de la propiedad
     tipo       → 'casa' | 'departamento' | 'local' | 'terreno'
     operacion  → 'venta' | 'renta'
     ciudad     → una de las 7 ciudades de cobertura
     colonia    → colonia / fraccionamiento
     precio     → número (MXN; en renta es el precio mensual)
     m2         → m² construidos (o de terreno si tipo = terreno)
     rec        → recámaras (0 si no aplica)
     ban        → baños (0 si no aplica)
     caj        → cajones de estacionamiento
     destacada  → true para aparecer en el index (exactamente 6 en true)
     badge      → opcional: 'Nueva' | 'Oportunidad' (o quitar la propiedad)
     foto       → opcional: ruta a la foto real, ej. 'img/prop-01.jpg'.
                  Mientras esté vacía se muestra el placeholder con gradiente.
*/

const PROPIEDADES = [
  // TODO: propiedad de ejemplo — reemplazar con datos reales
  { id: 'p01', titulo: 'Casa en Gran Jardín',           tipo: 'casa',         operacion: 'venta', ciudad: 'León',                     colonia: 'Gran Jardín',        precio: 4850000, m2: 220, rec: 3, ban: 3, caj: 2, destacada: true,  badge: 'Nueva',       foto: '' },
  { id: 'p02', titulo: 'Departamento en Punto Verde',   tipo: 'departamento', operacion: 'venta', ciudad: 'León',                     colonia: 'Punto Verde',        precio: 2380000, m2: 95,  rec: 2, ban: 2, caj: 1, destacada: true,  badge: '',            foto: '' },
  { id: 'p03', titulo: 'Casa en El Molino Residencial', tipo: 'casa',         operacion: 'venta', ciudad: 'León',                     colonia: 'El Molino',          precio: 3150000, m2: 160, rec: 3, ban: 2, caj: 2, destacada: true,  badge: '',            foto: '' },
  { id: 'p04', titulo: 'Casa en Villas de Irapuato',    tipo: 'casa',         operacion: 'venta', ciudad: 'Irapuato',                 colonia: 'Villas de Irapuato', precio: 2650000, m2: 140, rec: 3, ban: 2, caj: 2, destacada: true,  badge: 'Oportunidad', foto: '' },
  { id: 'p05', titulo: 'Departamento céntrico en renta',tipo: 'departamento', operacion: 'renta', ciudad: 'León',                     colonia: 'Centro',             precio: 12500,   m2: 80,  rec: 2, ban: 1, caj: 1, destacada: true,  badge: '',            foto: '' },
  { id: 'p06', titulo: 'Local comercial sobre avenida', tipo: 'local',        operacion: 'renta', ciudad: 'Celaya',                   colonia: 'Zona Centro',        precio: 18000,   m2: 120, rec: 0, ban: 1, caj: 2, destacada: true,  badge: '',            foto: '' },
  { id: 'p07', titulo: 'Casa en La Herradura',          tipo: 'casa',         operacion: 'venta', ciudad: 'Silao',                    colonia: 'La Herradura',       precio: 1980000, m2: 120, rec: 3, ban: 2, caj: 1, destacada: false, badge: '',            foto: '' },
  { id: 'p08', titulo: 'Terreno en zona de crecimiento',tipo: 'terreno',      operacion: 'venta', ciudad: 'Salamanca',                colonia: 'El Refugio',         precio: 1350000, m2: 450, rec: 0, ban: 0, caj: 0, destacada: false, badge: '',            foto: '' },
  { id: 'p09', titulo: 'Casa en San Miguel',            tipo: 'casa',         operacion: 'renta', ciudad: 'San Francisco del Rincón', colonia: 'San Miguel',         precio: 9500,    m2: 110, rec: 3, ban: 2, caj: 1, destacada: false, badge: '',            foto: '' },
  { id: 'p10', titulo: 'Departamento con vista',        tipo: 'departamento', operacion: 'venta', ciudad: 'Guanajuato',               colonia: 'Marfil',             precio: 2890000, m2: 105, rec: 2, ban: 2, caj: 1, destacada: false, badge: '',            foto: '' },
  { id: 'p11', titulo: 'Casa amplia en Campestre',      tipo: 'casa',         operacion: 'venta', ciudad: 'León',                     colonia: 'Campestre',          precio: 7200000, m2: 320, rec: 4, ban: 4, caj: 3, destacada: false, badge: '',            foto: '' },
  { id: 'p12', titulo: 'Local en plaza comercial',      tipo: 'local',        operacion: 'venta', ciudad: 'Irapuato',                 colonia: 'Plaza Cibeles Zona', precio: 2100000, m2: 85,  rec: 0, ban: 1, caj: 1, destacada: false, badge: '',            foto: '' },
];

// ── Utilidades de formato ──

function formatPrecioProp(n, operacion) {
  const precio = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  return operacion === 'renta' ? precio + ' /mes' : precio;
}

function etiquetaTipoProp(t) {
  return { casa: 'Casa', departamento: 'Departamento', local: 'Local comercial', terreno: 'Terreno' }[t] || t;
}

// ── Tarjeta de propiedad ──

const ICONO_PROP = {
  casa: '<path d="M6 20L24 6L42 20V42H30V30H18V42H6V20Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  departamento: '<rect x="10" y="6" width="28" height="36" rx="2" stroke="currentColor" stroke-width="2.5"/><path d="M17 14h4M27 14h4M17 22h4M27 22h4M17 30h4M27 30h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  local: '<path d="M6 18L10 6H38L42 18M6 18V42H42V18M6 18H42M18 42V28H30V42" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  terreno: '<path d="M6 36L18 20L28 32L34 24L42 36V42H6V36Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="34" cy="12" r="4" stroke="currentColor" stroke-width="2.5"/>',
};

function escAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function propiedadCardHTML(p) {
  const feats = [];
  feats.push(`<span>${p.m2} m²</span>`);
  if (p.rec > 0) feats.push(`<span>${p.rec} rec</span>`);
  if (p.ban > 0) feats.push(`<span>${p.ban} baño${p.ban > 1 ? 's' : ''}</span>`);
  if (p.caj > 0) feats.push(`<span>${p.caj} cajón${p.caj > 1 ? 'es' : ''}</span>`);

  const ficha = `propiedad.html?id=${encodeURIComponent(p.id)}`;

  // Con foto real: <img> con carga perezosa y texto alternativo (SEO/accesibilidad).
  // Sin foto: placeholder con gradiente + icono según el tipo.
  const alt = `${etiquetaTipoProp(p.tipo)} en ${p.colonia}, ${p.ciudad}`;
  const media = p.foto
    ? `<img class="property-card__img" src="${escAttr(p.foto)}" alt="${escAttr(alt)}" loading="lazy" decoding="async" />`
    : `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">${ICONO_PROP[p.tipo] || ICONO_PROP.casa}</svg>`;

  return `
  <article class="property-card">
    <a class="property-card__media" href="${ficha}" aria-label="Ver ${escAttr(alt)}">
      ${media}
      <span class="property-card__op property-card__op--${p.operacion}">${p.operacion === 'renta' ? 'Renta' : 'Venta'}</span>
      ${p.badge ? `<span class="property-card__badge">${p.badge}</span>` : ''}
    </a>
    <div class="property-card__body">
      <p class="property-card__price">${formatPrecioProp(p.precio, p.operacion)}</p>
      <h3 class="property-card__title"><a href="${ficha}">${escAttr(p.titulo)}</a></h3>
      <p class="property-card__loc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${escAttr(p.colonia)}, ${escAttr(p.ciudad)}
      </p>
      <div class="property-card__feats">${feats.join('')}</div>
      <a class="property-card__cta" href="${ficha}">Ver propiedad →</a>
    </div>
  </article>`;
}

// ── Fuente de datos: Supabase (CRM) con respaldo al arreglo local ──
// DATA siempre queda en "forma de tarjeta" (rec/ban/caj/foto). Las filas de la
// base traen recamaras/banos/cajones/foto_principal_url y se normalizan aquí.

let DATA = PROPIEDADES.slice(); // respaldo mientras carga o si no hay Supabase
let HUBO_ERROR = false;         // distingue "sin resultados" de "falló la carga"

function mapRowToCard(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    operacion: row.operacion,
    ciudad: row.ciudad,
    colonia: row.colonia,
    precio: Number(row.precio) || 0,
    m2: row.m2 || 0,
    rec: row.recamaras || 0,
    ban: row.banos || 0,
    caj: row.cajones || 0,
    destacada: !!row.destacada,
    badge: row.destacada ? 'Destacada' : '',
    foto: row.foto_principal_url || '',
  };
}

// Trae las propiedades públicas de Supabase. Si no hay conexión o falla,
// deja el respaldo local (o vacío) sin romper la página.
async function cargarPropiedades() {
  if (!window.sb || !window.Legio || !Legio.crm) return; // sin backend: usa respaldo
  try {
    const filas = await Legio.crm.propiedades.listPublicas();
    DATA = filas.map(mapRowToCard);
    HUBO_ERROR = false;
  } catch (e) {
    console.warn('[Legio] No se pudieron cargar propiedades de Supabase:', e.message);
    DATA = []; // evitar mostrar datos de ejemplo como si fueran reales
    HUBO_ERROR = true;
  }
}

// Mensaje de fallo de carga (distinto del catálogo realmente vacío).
function htmlErrorCarga() {
  return `
    <div class="catalog-empty">
      <p><strong>No pudimos cargar el catálogo en este momento.</strong></p>
      <p>Revisa tu conexión e <a href="#" onclick="location.reload();return false;">intenta de nuevo</a>,
         o <a href="index.html#contacto">escríbenos</a> y con gusto te ayudamos.</p>
    </div>`;
}

// ── Render: destacadas en index ──
function renderDestacadas() {
  const grid = document.getElementById('gridDestacadas');
  if (!grid) return;
  if (HUBO_ERROR) { grid.innerHTML = htmlErrorCarga(); return; }
  const destacadas = DATA.filter(p => p.destacada).slice(0, 6);
  const lista = destacadas.length ? destacadas : DATA.slice(0, 6);
  grid.innerHTML = lista.map(propiedadCardHTML).join('');
  if (typeof registrarFadeIn === 'function') registrarFadeIn(grid.querySelectorAll('.property-card'));
}

// ── Render: catálogo con filtros en propiedades.html ──
function aplicarFiltrosPropiedades() {
  const grid = document.getElementById('gridCatalogo');
  if (!grid) return;
  if (HUBO_ERROR) {
    grid.innerHTML = htmlErrorCarga();
    const count = document.getElementById('f-count');
    if (count) count.textContent = '';
    return;
  }

  const ciudad    = (document.getElementById('f-ciudad')    || {}).value || '';
  const tipo      = (document.getElementById('f-tipo')      || {}).value || '';
  const operacion = (document.getElementById('f-operacion') || {}).value || '';
  const orden     = (document.getElementById('f-orden')     || {}).value || '';

  let lista = DATA.filter(p =>
    (!ciudad    || p.ciudad === ciudad) &&
    (!tipo      || p.tipo === tipo) &&
    (!operacion || p.operacion === operacion)
  );

  if (orden === 'precio-asc')  lista = lista.slice().sort((a, b) => a.precio - b.precio);
  if (orden === 'precio-desc') lista = lista.slice().sort((a, b) => b.precio - a.precio);

  const count = document.getElementById('f-count');
  if (count) count.textContent = lista.length === 1 ? '1 propiedad' : lista.length + ' propiedades';

  if (!lista.length) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <p><strong>No encontramos propiedades con esos filtros.</strong></p>
        <p>Cuéntanos qué buscas y te avisamos en cuanto tengamos algo así: <a href="index.html#contacto">escríbenos aquí</a>.</p>
      </div>`;
    return;
  }

  grid.innerHTML = lista.map(propiedadCardHTML).join('');
  if (typeof registrarFadeIn === 'function') registrarFadeIn(grid.querySelectorAll('.property-card'));
}

function renderCatalogo() {
  const grid = document.getElementById('gridCatalogo');
  if (!grid) return;
  ['f-ciudad', 'f-tipo', 'f-operacion', 'f-orden'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', aplicarFiltrosPropiedades);
  });
  aplicarFiltrosPropiedades();
}

// ── Init (el script se carga al final del body, el DOM ya existe) ──
(async function initPropiedades() {
  await cargarPropiedades();
  renderDestacadas();
  renderCatalogo();
})();
