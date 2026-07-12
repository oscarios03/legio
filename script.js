// ===== NAV SCROLL =====
const nav    = document.getElementById('nav');
const burger = document.getElementById('burger');
const menu   = document.getElementById('mobileMenu');

// Los elementos de nav pueden faltar en alguna página: proteger para no romper el resto del script.
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  });
}

if (burger && menu) {
  const setExpanded = open => {
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setExpanded(!menu.classList.contains('open')));
  // Close mobile menu when a link is clicked
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setExpanded(false));
  });
}

// ===== SMOOTH SCROLL for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const href = anchor.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const offset = (nav ? nav.offsetHeight : 0) + 8;
    window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });
  });
});

// ===== FORM → WHATSAPP =====
const form = document.getElementById('contactForm');

// ⚠️  Reemplaza este número con el número real de WhatsApp (solo dígitos, con código de país)
const WA_NUMBER = '524770000000';

// ===== CAPTURA DE LEADS (para no perder prospectos) =====
// TODO: Pega la URL de tu endpoint de captura. Mientras esté vacío, esta función
// no hace nada y el flujo de WhatsApp sigue funcionando igual que hoy.
//   • Formspree:  https://formspree.io/f/XXXXXXXX
//   • Google Apps Script (Web App):  https://script.google.com/macros/s/XXXX/exec
const LEAD_ENDPOINT = '';

/* ===== HONEYPOT =====
 * Cada formulario lleva un campo oculto que una persona nunca ve ni llena.
 * Si viene con texto, es un bot: descartamos el envío en silencio.
 */
function esBot(form) {
  const trampa = form && form.querySelector('input[name="website"]');
  return !!(trampa && trampa.value.trim());
}

function enviarLead(payload) {
  // 1) Guardar en el CRM (Supabase), si está configurado. Nunca bloquea la UX.
  guardarLeadSupabase(payload);

  // 2) Endpoint opcional (Formspree / Apps Script), si se configuró.
  if (!LEAD_ENDPOINT) return;
  try {
    fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, origen: location.pathname, fecha: new Date().toISOString() }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* nunca bloquear la UX del usuario */ }
}

// Traduce el payload del sitio a la tabla `leads` del CRM y lo inserta como
// anónimo (política RLS lo permite). Si no hay Supabase, no hace nada.
// El asesor que atenderá el lead lo asigna un trigger de la base (round-robin).
function guardarLeadSupabase(payload) {
  try {
    if (!window.Legio || !Legio.crm || !Legio.crm.leads) return;
    const t = payload.tipo_lead || '';
    const origen = /estimador/.test(t) ? 'estimador' : 'form';
    Legio.crm.leads.crearAnon({
      nombre:   payload.nombre || null,
      telefono: payload.telefono || null,
      email:    payload.email || null,
      mensaje:  payload.mensaje || null,
      ciudad:   payload.ciudad || null,
      tipo_operacion: payload.operacion || null,
      tipo_interes:   payload.tipo || null,          // casa, departamento, local, terreno
      valor_estimado: payload.valor_central || null, // lo que arrojó el estimador
      origen,
    });
  } catch (e) { /* nunca bloquear la UX */ }
}

// ===== TRACKING DE CONVERSIÓN (Meta Pixel + GA4) =====
// Los IDs se definen en el <head> de cada página (window.GA_ID / window.PIXEL_ID).
// Si están vacíos no se carga nada y estas funciones no fallan.
(function initTracking() {
  if (window.GA_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + window.GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', window.GA_ID);
  }
  if (window.PIXEL_ID) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', window.PIXEL_ID);
    fbq('track', 'PageView');
  }
})();

function trackLead(params) {
  if (window.gtag) gtag('event', 'generate_lead', params || {});
  if (window.fbq)  fbq('track', 'Lead', params || {});
}

function trackEvent(nombre, params) {
  if (window.gtag) gtag('event', nombre, params || {});
  if (window.fbq)  fbq('trackCustom', nombre, params || {});
}

// ===== AÑO DINÁMICO EN EL FOOTER =====
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('footerYear');
  if (y) y.textContent = new Date().getFullYear();
});

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
  // Marca el campo asociado (error-<campo>) como inválido para lectores de pantalla.
  const field = document.getElementById(id.replace(/^error-/, ''));
  if (field && msg && /^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName)) field.setAttribute('aria-invalid', 'true');
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
}

function validateForm(data) {
  let valid = true;

  if (!data.nombre.trim()) {
    showError('error-nombre', 'Por favor ingresa tu nombre.');
    document.getElementById('nombre').classList.add('error');
    valid = false;
  }

  const tel = data.telefono.replace(/\D/g, '');
  if (tel.length < 10) {
    showError('error-telefono', 'Ingresa un número de 10 dígitos.');
    document.getElementById('telefono').classList.add('error');
    valid = false;
  }

  if (!data.ciudad) {
    showError('error-ciudad', 'Selecciona tu ciudad.');
    document.getElementById('ciudad').classList.add('error');
    valid = false;
  }

  if (!data.operacion) {
    showError('error-operacion', 'Selecciona qué deseas hacer.');
    document.getElementById('operacion').classList.add('error');
    valid = false;
  }

  if (!data.tiene_propiedad) {
    showError('error-propiedad', 'Por favor selecciona una opción.');
    valid = false;
  }

  return valid;
}

if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (esBot(form)) return;
    clearErrors();

    const data = {
      nombre:          document.getElementById('nombre').value.trim(),
      telefono:        document.getElementById('telefono').value.trim(),
      ciudad:          document.getElementById('ciudad').value,
      operacion:       document.getElementById('operacion').value,
      tiene_propiedad: (form.querySelector('input[name="tiene_propiedad"]:checked') || {}).value || '',
      mensaje:         document.getElementById('mensaje').value.trim(),
    };

    if (!validateForm(data)) return;

    // Capturar el lead (no depender solo del clic de WhatsApp) + tracking
    enviarLead({ ...data, tipo_lead: 'contacto-landing' });
    trackLead({ source: 'form_contacto', operacion: data.operacion, ciudad: data.ciudad });

    const lines = [
      `Hola, me interesa la *Opinión de Valor Gratuita* de Legio Inmobiliaria 🏠`,
      ``,
      `*Nombre:* ${data.nombre}`,
      `*Teléfono:* ${data.telefono}`,
      `*Ciudad:* ${data.ciudad}`,
      `*Operación:* ${data.operacion}`,
      `*¿Tiene propiedad?:* ${data.tiene_propiedad}`,
    ];

    if (data.mensaje) lines.push(`*Detalles:* ${data.mensaje}`);

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, '_blank', 'noopener');
  });
}

// ===== SCROLL ANIMATION (simple fade-in) =====
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

// Registra nodos para la animación de aparición. Se expone en window para que
// propiedades.js pueda animar las tarjetas que renderiza dinámicamente.
function registrarFadeIn(nodes) {
  nodes.forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
  });
}
window.registrarFadeIn = registrarFadeIn;

registrarFadeIn(document.querySelectorAll(
  '.service-card, .testimonial-card, .why-card, .process-card, .case-card, .team-card, .guide-card, .faq-item'
));

// ===== FAQ (acordeón exclusivo) =====
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      faqItems.forEach(other => { if (other !== item) other.open = false; });
      const q = item.querySelector('summary');
      if (q) trackEvent('FAQAbierta', { pregunta: q.textContent.trim() });
    }
  });
});

// ===== LEAD MAGNET (guía PDF) =====
const leadMagnetForm = document.getElementById('leadMagnetForm');
if (leadMagnetForm) {
  leadMagnetForm.addEventListener('submit', e => {
    e.preventDefault();
    if (esBot(leadMagnetForm)) return;
    const nombre = (document.getElementById('lm-nombre').value || '').trim();
    const tel    = (document.getElementById('lm-tel').value || '').trim();
    const telDig = tel.replace(/\D/g, '');

    if (nombre.length < 2) { showError('err-lm', 'Ingresa tu nombre.'); return; }
    if (telDig.length < 10) { showError('err-lm', 'Ingresa un WhatsApp de 10 dígitos.'); return; }
    showError('err-lm', '');

    enviarLead({ nombre, telefono: tel, tipo_lead: 'lead-magnet-guia' });
    trackLead({ source: 'lead_magnet' });

    const msg = encodeURIComponent(`Hola, soy ${nombre}. Quiero recibir la *Guía PDF: Vende tu propiedad al mejor precio* de Legio Inmobiliaria.`);
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank', 'noopener');
    leadMagnetForm.reset();
  });
}
