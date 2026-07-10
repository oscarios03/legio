/* ============================================================================
 * notificar-lead — Edge Function de Supabase
 * ----------------------------------------------------------------------------
 * Avisa por correo cuando entra un prospecto nuevo del sitio. En bienes raíces
 * la velocidad de respuesta es lo que más pesa: un lead que cae a las 8pm no
 * puede esperar a que alguien abra el CRM al día siguiente.
 *
 * La invoca un trigger de la base (ver la sección 9 de supabase-migracion-v2.sql)
 * con el cuerpo { "lead_id": "<uuid>" }.
 *
 * ---- Despliegue (una sola vez) ----------------------------------------------
 *   1. Crea una cuenta en https://resend.com y verifica tu dominio.
 *      Copia la API key (empieza con "re_").
 *   2. Instala la CLI de Supabase y enlaza el proyecto:
 *        npm i -g supabase
 *        supabase login
 *        supabase link --project-ref TU-PROJECT-REF
 *   3. Guarda los secretos:
 *        supabase secrets set RESEND_API_KEY=re_xxxxx
 *        supabase secrets set NOTIFICAR_DESDE="Legio CRM <crm@tudominio.com>"
 *        supabase secrets set NOTIFICAR_ADMIN=admin@tudominio.com
 *        supabase secrets set CRM_URL=https://tudominio.com/interno
 *   4. Despliega:
 *        supabase functions deploy notificar-lead
 *   5. Descomenta la sección 9 de supabase-migracion-v2.sql y ejecútala.
 * ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const DESDE          = Deno.env.get('NOTIFICAR_DESDE') ?? 'Legio CRM <onboarding@resend.dev>';
const ADMIN          = Deno.env.get('NOTIFICAR_ADMIN') ?? '';
const CRM_URL        = Deno.env.get('CRM_URL') ?? '';

// SERVICE_ROLE_KEY la inyecta Supabase automáticamente en las Edge Functions.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ORIGEN: Record<string, string> = {
  form: 'formulario de contacto',
  estimador: 'estimador de valor',
  whatsapp: 'WhatsApp',
  manual: 'alta manual',
  referido: 'referido',
  portal: 'portal inmobiliario',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function cuerpoCorreo(lead: Record<string, any>): string {
  const wa = lead.telefono ? `https://wa.me/52${String(lead.telefono).replace(/\D/g, '').slice(-10)}` : '';
  const ficha = CRM_URL ? `${CRM_URL}/lead.html?id=${lead.id}` : '';

  const fila = (k: string, v: unknown) =>
    v ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">${esc(k)}</td>
             <td style="padding:6px 0;color:#0f2235;font-weight:600;">${esc(v)}</td></tr>` : '';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;">
    <div style="background:#0f2235;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <div style="color:#c9a24b;font-size:12px;letter-spacing:.15em;text-transform:uppercase;">Legio Inmobiliaria</div>
      <h1 style="margin:6px 0 0;font-size:20px;">Prospecto nuevo</h1>
    </div>
    <div style="border:1px solid #e6e9f2;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <p style="margin:0 0 16px;color:#374151;">
        Llegó un prospecto por <strong>${esc(ORIGEN[lead.origen] ?? lead.origen)}</strong>.
        Contáctalo cuanto antes.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${fila('Nombre', lead.nombre)}
        ${fila('Teléfono', lead.telefono)}
        ${fila('Correo', lead.email)}
        ${fila('Ciudad', lead.ciudad)}
        ${fila('Le interesa', lead.tipo_interes)}
        ${fila('Valor estimado', lead.valor_estimado
          ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(lead.valor_estimado)
          : '')}
        ${fila('Asignado a', lead.asesor?.nombre)}
      </table>
      ${lead.mensaje ? `<p style="margin:16px 0;padding:12px;background:#f7f8fc;border-radius:8px;color:#374151;font-size:14px;">
        “${esc(lead.mensaje)}”</p>` : ''}
      <div style="margin-top:24px;">
        ${wa ? `<a href="${wa}" style="display:inline-block;background:#c9a24b;color:#0f2235;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;margin-right:8px;">Escribir por WhatsApp</a>` : ''}
        ${ficha ? `<a href="${ficha}" style="display:inline-block;border:1px solid #d7dbe6;color:#0f2235;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Ver en el CRM</a>` : ''}
      </div>
    </div>
  </div>`;
}

async function enviarCorreo(para: string[], asunto: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DESDE, to: para, subject: asunto, html }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    if (!RESEND_API_KEY) {
      // Sin API key no hay nada que hacer, pero no es un error del lead.
      return new Response(JSON.stringify({ ok: false, motivo: 'RESEND_API_KEY no configurada' }), { status: 200 });
    }

    const { lead_id } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: 'Falta lead_id' }), { status: 400 });

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*, asesor:asesor_id(nombre, email)')
      .eq('id', lead_id)
      .maybeSingle();

    if (error) throw error;
    if (!lead) return new Response(JSON.stringify({ error: 'Lead no encontrado' }), { status: 404 });

    // Le avisamos al asesor que le tocó y, de copia, al admin.
    const destinos = new Set<string>();
    if (lead.asesor?.email) destinos.add(lead.asesor.email);
    if (ADMIN) destinos.add(ADMIN);
    if (!destinos.size) {
      return new Response(JSON.stringify({ ok: false, motivo: 'Sin destinatarios' }), { status: 200 });
    }

    const asunto = `🔔 Prospecto nuevo: ${lead.nombre || 'sin nombre'} (${ORIGEN[lead.origen] ?? lead.origen})`;
    await enviarCorreo([...destinos], asunto, cuerpoCorreo(lead));

    return new Response(JSON.stringify({ ok: true, enviado_a: [...destinos] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[notificar-lead]', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
