/* ===== UTILIDADES COMPARTIDAS DEL CRM — LEGIO =====
 * Formato, escape, enlaces de contacto y exportación a CSV.
 * API: window.Legio.util
 */
(function () {
  window.Legio = window.Legio || {};

  // Número de WhatsApp de la oficina (fallback cuando el lead no trae teléfono).
  const WA_OFICINA = '524770000000';

  const util = {
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    },

    fmtMXN(n) {
      if (n === null || n === undefined || n === '') return '—';
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
    },

    fmtFecha(iso) {
      if (!iso) return '—';
      const d = (typeof iso === 'string' && iso.length === 10) ? new Date(iso + 'T00:00:00') : new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    fmtFechaHora(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },

    // "hace 3 días" / "en 2 días" / "hoy"
    // Una fecha suelta ('YYYY-MM-DD') se lee como medianoche local, no UTC:
    // si no, en México "mañana" se convertiría en "hoy".
    haceCuanto(iso) {
      if (!iso) return '—';
      const d = (typeof iso === 'string' && iso.length === 10) ? new Date(iso + 'T00:00:00') : new Date(iso);
      const dias = util.diasEntre(d, new Date());
      if (dias === 0) return 'hoy';
      if (dias === 1) return 'ayer';
      if (dias > 1)   return 'hace ' + dias + ' días';
      if (dias === -1) return 'mañana';
      return 'en ' + Math.abs(dias) + ' días';
    },

    // Días completos entre dos fechas (positivo si `b` es posterior).
    diasEntre(a, b) {
      const dia = 24 * 60 * 60 * 1000;
      const ini = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      const fin = new Date(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.round((fin - ini) / dia);
    },

    hoyISO() {
      const d = new Date();
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    },

    // Suma días a hoy y devuelve 'YYYY-MM-DD'.
    enDias(n) {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    },

    // ---- Contacto -----------------------------------------------------------
    // Normaliza a formato internacional de México: 10 dígitos → 52##########
    telE164(tel) {
      const d = String(tel || '').replace(/\D/g, '');
      if (!d) return '';
      if (d.length === 10) return '52' + d;
      if (d.length === 12 && d.startsWith('52')) return d;
      if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
      return d;
    },

    waLink(tel, texto) {
      const num = util.telE164(tel) || WA_OFICINA;
      return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '');
    },

    telLink(tel) { return 'tel:+' + (util.telE164(tel) || WA_OFICINA); },

    // Mensaje de primer contacto, distinto según de dónde llegó el prospecto.
    plantillaWA(lead) {
      const nombre = (lead.nombre || '').split(' ')[0] || '';
      const hola = nombre ? `Hola ${nombre}, ` : 'Hola, ';
      switch (lead.origen) {
        case 'estimador':
          return hola + 'soy asesor de Legio Inmobiliaria. Vi que usaste nuestro estimador de valor. ' +
                 '¿Te gustaría que un asesor haga una valuación profesional de tu propiedad, sin costo?';
        case 'form':
          return hola + 'soy asesor de Legio Inmobiliaria. Recibimos tu solicitud desde nuestro sitio. ' +
                 '¿Cuándo te queda bien que platiquemos?';
        case 'whatsapp':
          return hola + 'te contacto de Legio Inmobiliaria para dar seguimiento a tu mensaje.';
        default:
          return hola + 'te contacto de Legio Inmobiliaria. ¿Cómo te puedo ayudar?';
      }
    },

    // Enlace público absoluto a la ficha de una propiedad (para compartir).
    linkPropiedad(id) {
      return new URL('../propiedad.html?id=' + id, location.href).href;
    },

    async copiar(texto) {
      try { await navigator.clipboard.writeText(texto); return true; }
      catch (e) { return false; }
    },

    // ---- Exportación --------------------------------------------------------
    // filas: array de objetos. columnas: [['clave','Encabezado'], ...]
    descargarCSV(nombreArchivo, columnas, filas) {
      const escCampo = v => {
        const s = (v === null || v === undefined) ? '' : String(v);
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lineas = [columnas.map(c => escCampo(c[1])).join(',')];
      filas.forEach(f => lineas.push(columnas.map(c => escCampo(f[c[0]])).join(',')));
      // BOM para que Excel en Windows respete los acentos.
      const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombreArchivo;
      a.click();
      URL.revokeObjectURL(a.href);
    },

    // ---- Etiquetas ----------------------------------------------------------
    etOrigen: o => ({ form:'Formulario', estimador:'Estimador', whatsapp:'WhatsApp',
                      manual:'Manual', referido:'Referido', portal:'Portal' }[o] || o || '—'),
    etEstatus: e => ({ nuevo:'Nuevo', contactado:'Contactado', cita:'Cita',
                       cerrado:'Cerrado', perdido:'Perdido' }[e] || e || '—'),
    etTipo: t => ({ casa:'Casa', departamento:'Departamento', local:'Local comercial', terreno:'Terreno' }[t] || t || '—'),
    etActividad: t => ({ llamada:'Llamada', whatsapp:'WhatsApp', email:'Correo', cita:'Cita',
                         visita:'Visita', nota:'Nota', sistema:'Sistema' }[t] || t),

    ICONO_ACTIVIDAD: { llamada:'📞', whatsapp:'💬', email:'✉️', cita:'📅', visita:'🏠', nota:'📝', sistema:'⚙️' },

    MOTIVOS_PERDIDA: [
      'Precio fuera de su presupuesto',
      'Dejó de contestar',
      'Compró/rentó con otra inmobiliaria',
      'Ya no quiere vender/comprar',
      'Solo estaba curioseando',
      'Datos de contacto incorrectos',
      'Otro',
    ],
  };

  window.Legio.util = util;
})();
