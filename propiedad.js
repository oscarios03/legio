/* ===== FICHA DE PROPIEDAD (pública) — LEGIO =====
   Muestra TODAS las fotos de una propiedad publicada (no solo la principal).
   Fuente: Supabase (Legio.crm). El id llega por la URL: propiedad.html?id=<uuid>.
   La RLS ya limita a anon a propiedades públicas + disponibles y sus fotos.
*/
(function () {
  const $ = id => document.getElementById(id);
  const cont = $('propDetalle');
  const propId = new URLSearchParams(location.search).get('id');

  const WA = '524770000000'; // TODO: número real de WhatsApp

  // ---- Formato (mismo criterio que propiedades.js, aquí autocontenido) ----
  function fmtPrecio(n, operacion) {
    const p = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
    return operacion === 'renta' ? p + ' /mes' : p;
  }
  const etTipo = t => ({ casa: 'Casa', departamento: 'Departamento', local: 'Local comercial', terreno: 'Terreno' }[t] || t);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function mensaje(html) { cont.innerHTML = `<div class="pd-empty">${html}</div>`; }

  // ---- Estado de la galería ----
  let fotosUrls = [];
  let fotoActual = 0;

  function setPrincipal(i) {
    fotoActual = i;
    const main = $('pdMainImg');
    if (main) main.src = fotosUrls[i];
    document.querySelectorAll('.pd-thumb').forEach((t, idx) =>
      t.classList.toggle('is-active', idx === i));
  }

  // ---- Lightbox ----
  let lbFocoPrevio = null;
  function abrirLightbox(i) {
    fotoActual = i;
    $('lbImg').src = fotosUrls[i];
    $('lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    // Foco al botón de cerrar para que el teclado quede dentro del visor.
    lbFocoPrevio = document.activeElement;
    $('lbClose').focus();
  }
  function cerrarLightbox() {
    $('lightbox').hidden = true;
    document.body.style.overflow = '';
    if (lbFocoPrevio && lbFocoPrevio.focus) lbFocoPrevio.focus();
  }
  function moverLightbox(delta) {
    if (!fotosUrls.length) return;
    fotoActual = (fotoActual + delta + fotosUrls.length) % fotosUrls.length;
    $('lbImg').src = fotosUrls[fotoActual];
    setPrincipal(fotoActual);
  }
  $('lbClose').addEventListener('click', cerrarLightbox);
  $('lbPrev').addEventListener('click', () => moverLightbox(-1));
  $('lbNext').addEventListener('click', () => moverLightbox(1));
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) cerrarLightbox(); });
  document.addEventListener('keydown', e => {
    if ($('lightbox').hidden) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowLeft') moverLightbox(-1);
    if (e.key === 'ArrowRight') moverLightbox(1);
    if (e.key === 'Tab') {
      // Mantener el foco dentro del visor (cerrar / anterior / siguiente).
      const foco = [$('lbClose'), $('lbPrev'), $('lbNext')].filter(b => b && b.offsetParent !== null);
      if (!foco.length) return;
      const primero = foco[0], ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  });

  // ---- Render principal ----
  function render(p, fotos) {
    fotosUrls = fotos.map(f => f.url).filter(Boolean);

    // SEO / social: título y descripción reales.
    const nombre = `${p.titulo} — ${p.colonia || ''}${p.colonia ? ', ' : ''}${p.ciudad || ''}`.trim();
    document.title = `${nombre} · Legio Inmobiliaria`;
    const desc = (p.descripcion || `${etTipo(p.tipo)} en ${p.operacion} en ${p.colonia || p.ciudad || 'el Bajío'}.`).slice(0, 155);
    const setMeta = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
    setMeta('metaDesc', desc); setMeta('ogTitle', nombre); setMeta('ogDesc', desc);
    if (fotosUrls[0]) setMeta('ogImage', fotosUrls[0]);

    // Galería
    let galeria;
    if (fotosUrls.length) {
      const thumbs = fotosUrls.map((u, i) =>
        `<button type="button" class="pd-thumb ${i === 0 ? 'is-active' : ''}" data-i="${i}">
           <img src="${esc(u)}" alt="Foto ${i + 1} de ${esc(p.titulo)}" loading="lazy" decoding="async" />
         </button>`).join('');
      galeria = `
        <div class="pd-gallery">
          <button type="button" class="pd-main" id="pdMainBtn" aria-label="Ampliar foto">
            <img id="pdMainImg" src="${esc(fotosUrls[0])}" alt="${esc(p.titulo)}" decoding="async" />
            <span class="pd-main__zoom">⤢ Ampliar</span>
          </button>
          ${fotosUrls.length > 1 ? `<div class="pd-thumbs">${thumbs}</div>` : ''}
        </div>`;
    } else {
      galeria = `
        <div class="pd-gallery">
          <div class="pd-main pd-main--empty">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 20L24 6L42 20V42H30V30H18V42H6V20Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>
            <span>Sin fotos disponibles</span>
          </div>
        </div>`;
    }

    // Características
    const feats = [];
    if (p.m2) feats.push(['Construcción', p.m2 + ' m²']);
    if (p.m2_terreno) feats.push(['Terreno', p.m2_terreno + ' m²']);
    if (p.recamaras) feats.push(['Recámaras', p.recamaras]);
    if (p.banos) feats.push(['Baños', p.banos]);
    if (p.cajones) feats.push(['Estacionamiento', p.cajones]);
    if (p.antiguedad) feats.push(['Antigüedad', p.antiguedad]);
    if (p.conservacion) feats.push(['Conservación', p.conservacion]);
    const featsHTML = feats.map(([k, v]) =>
      `<div class="pd-spec"><span class="pd-spec__k">${esc(k)}</span><span class="pd-spec__v">${esc(v)}</span></div>`).join('');

    const waTexto = `Hola, me interesa la propiedad "${p.titulo}" (${p.colonia || ''}, ${p.ciudad || ''}). ¿Me pueden dar más información?`;
    const waLink = `https://wa.me/${WA}?text=${encodeURIComponent(waTexto)}`;

    cont.innerHTML = `
      ${galeria}
      <div class="pd-info">
        <div class="pd-info__main">
          <div class="pd-tags">
            <span class="pd-tag pd-tag--${p.operacion === 'renta' ? 'renta' : 'venta'}">${p.operacion === 'renta' ? 'Renta' : 'Venta'}</span>
            <span class="pd-tag pd-tag--tipo">${esc(etTipo(p.tipo))}</span>
            ${p.destacada ? '<span class="pd-tag pd-tag--dest">Destacada</span>' : ''}
          </div>
          <h1 class="pd-title">${esc(p.titulo)}</h1>
          <p class="pd-loc">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${esc([p.colonia, p.ciudad].filter(Boolean).join(', '))}
          </p>
          ${featsHTML ? `<div class="pd-specs">${featsHTML}</div>` : ''}
          ${p.descripcion ? `<div class="pd-desc"><h2>Descripción</h2><p>${esc(p.descripcion).replace(/\n/g, '<br>')}</p></div>` : ''}
        </div>
        <aside class="pd-info__aside">
          <div class="pd-price-card">
            <p class="pd-price">${fmtPrecio(p.precio, p.operacion)}</p>
            <a class="btn btn--gold btn--lg pd-cta" href="${waLink}" target="_blank" rel="noopener">Me interesa · WhatsApp</a>
            <a class="btn btn--outline-navy pd-cta" href="index.html#contacto">Solicitar más información</a>
            <p class="pd-price-card__note">Un asesor de Legio te atenderá y agendará una visita sin compromiso.</p>
          </div>
        </aside>
      </div>`;

    // Eventos de galería
    if (fotosUrls.length) {
      cont.querySelectorAll('.pd-thumb').forEach(b =>
        b.addEventListener('click', () => setPrincipal(+b.dataset.i)));
      const mainBtn = $('pdMainBtn');
      if (mainBtn) mainBtn.addEventListener('click', () => abrirLightbox(fotoActual));
    }
    if (typeof registrarFadeIn === 'function') registrarFadeIn(cont.querySelectorAll('.pd-gallery, .pd-info'));
  }

  // ---- Init ----
  (async function init() {
    if (!propId) { mensaje('<p><strong>Propiedad no especificada.</strong></p><p><a href="propiedades.html">Ver todas las propiedades</a></p>'); return; }
    if (!window.sb || !window.Legio || !Legio.crm) {
      mensaje('<p><strong>No se pudo conectar con el catálogo.</strong></p><p><a href="propiedades.html">Ver todas las propiedades</a></p>');
      return;
    }
    try {
      const p = await Legio.crm.propiedades.get(propId);
      if (!p) {
        mensaje('<p><strong>Esta propiedad ya no está disponible.</strong></p><p><a href="propiedades.html">Ver propiedades disponibles</a></p>');
        return;
      }
      let fotos = [];
      try { fotos = await Legio.crm.fotos.listByPropiedad(propId); }
      catch (e) { console.warn('[Legio] No se pudieron cargar las fotos:', e.message); }
      render(p, fotos);
    } catch (e) {
      console.warn('[Legio] Error cargando la propiedad:', e.message);
      mensaje('<p><strong>Ocurrió un error al cargar la propiedad.</strong></p><p><a href="propiedades.html">Ver todas las propiedades</a></p>');
    }
  })();
})();
