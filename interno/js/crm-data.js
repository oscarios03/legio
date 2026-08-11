/* ===== DATOS DEL CRM — LEGIO (Supabase) =====
 * Espeja la forma async de interno/js/storage.js (Promesas) pero contra Supabase.
 * API: window.Legio.crm.{ propiedades, fotos, leads, actividades, asesores, comisiones, avaluos, metricas }
 * Requiere window.sb (ver supabase-config.js). Si no está, los métodos lanzan
 * un error claro (las páginas del CRM lo muestran).
 *
 * OJO: este archivo también se carga en el sitio público (index, estimador,
 * propiedades, propiedad). No debe depender de crm-util.js ni de crm-auth.js.
 */
(function () {
  window.Legio = window.Legio || {};
  const BUCKET = 'propiedades';

  function sb() {
    if (!window.sb) throw new Error('Supabase no está configurado (revisa interno/js/supabase-config.js).');
    return window.sb;
  }
  function check(error) { if (error) throw new Error(error.message || String(error)); }

  /* ---- Comisiones ------------------------------------------------------------
   * Los porcentajes NO están en `propiedades`: viven en `propiedad_comisiones`
   * (1-a-1 por propiedad_id) para que la RLS pueda dejarlos fuera del alcance de
   * quien no debe verlos. Aquí se traen embebidos y se aplanan, de modo que el
   * resto del CRM las siga usando como campos normales de la propiedad.
   */
  const CAMPOS_COMISION = ['comision_pct', 'comision_captador_pct', 'comision_vendedor_pct'];
  const EMBED_COMISION  = 'comisiones:propiedad_comisiones(' + CAMPOS_COMISION.join(', ') + ')';

  // PostgREST devuelve objeto (relación 1-a-1) o arreglo según versión y llaves.
  function comisionesDe(fila) {
    const c = fila && fila.comisiones;
    const row = Array.isArray(c) ? c[0] : c;
    return row || {};
  }

  async function miId() {
    if (!window.sb) return null;
    const { data } = await window.sb.auth.getUser();
    return data && data.user ? data.user.id : null;
  }

  // ---- PROPIEDADES ----------------------------------------------------------
  const propiedades = {
    async list(filtros) {
      filtros = filtros || {};
      let q = sb().from('propiedades')
        .select('*, captador:asesor_captador_id(nombre), vendedor:asesor_vendedor_id(nombre)')
        .order('updated_at', { ascending: false });
      if (filtros.estatus)   q = q.eq('estatus', filtros.estatus);
      if (filtros.ciudad)    q = q.eq('ciudad', filtros.ciudad);
      if (filtros.tipo)      q = q.eq('tipo', filtros.tipo);
      if (filtros.asesorId)  q = q.eq('asesor_captador_id', filtros.asesorId);
      const { data, error } = await q;
      check(error);
      return data || [];
    },

    async get(id) {
      const { data, error } = await sb().from('propiedades')
        .select('*, ' + EMBED_COMISION).eq('id', id).maybeSingle();
      check(error);
      if (!data) return null;
      // La ficha las trae planas, como siempre las ha usado el formulario.
      return { ...data, ...comisionesDe(data) };
    },

    /* Inserta (sin id) o actualiza (con id). Devuelve la fila guardada.
     * Los porcentajes de comisión viven en `propiedad_comisiones` (tabla aparte,
     * protegida por RLS para que solo el admin los escriba), así que se separan
     * del payload y se guardan en su propia tabla. */
    async save(obj) {
      const payload = { ...obj };
      const com = {};
      CAMPOS_COMISION.forEach(c => {
        if (c in payload) { com[c] = payload[c]; delete payload[c]; }
      });

      let res;
      if (!payload.id) {
        res = await sb().from('propiedades').insert(payload).select().single();
      } else {
        const id = payload.id; delete payload.id;
        res = await sb().from('propiedades').update(payload).eq('id', id).select().single();
      }
      check(res.error);

      if (Object.keys(com).length && res.data) {
        const up = await sb().from('propiedad_comisiones')
          .upsert({ propiedad_id: res.data.id, ...com }, { onConflict: 'propiedad_id' });
        // Un asesor sin permiso sobre comisiones no debe perder el guardado de la
        // propiedad: la RLS ya bloqueó lo que tenía que bloquear.
        if (up.error) console.warn('[Legio] Comisiones no guardadas:', up.error.message);
      }
      return { ...res.data, ...com };
    },

    async setEstatus(id, estatus, extra) {
      const payload = { estatus, ...(extra || {}) };
      const { data, error } = await sb().from('propiedades').update(payload).eq('id', id).select().single();
      check(error);
      return data;
    },

    /* Dictamen del admin sobre una propiedad capturada por un asesor.
     * Solo las aprobadas salen al sitio público (lo exige la política RLS
     * `prop_public_sel`, no solo la interfaz). Aprobar publica; devolver o
     * desechar despublica, porque una ficha con observaciones no debe seguir
     * a la vista de los clientes.
     *   estado: 'aprobada' | 'devuelta' | 'desechada' | 'pendiente'
     */
    async revisar(id, estado, observaciones) {
      const payload = {
        revision_estado: estado,
        revision_observaciones: observaciones || null,
        revision_por: await miId(),
        revision_at: new Date().toISOString(),
      };
      if (estado === 'aprobada') payload.publica = true;
      if (estado === 'devuelta' || estado === 'desechada') payload.publica = false;

      const { data, error } = await sb().from('propiedades')
        .update(payload).eq('id', id).select().single();
      check(error);
      return data;
    },

    // Bandeja del admin: lo que espera dictamen, lo más viejo primero.
    async porRevisar() {
      const { data, error } = await sb().from('propiedades')
        .select('id, titulo, tipo, operacion, ciudad, colonia, precio, estatus, created_at, ' +
                'foto_principal_url, revision_estado, revision_observaciones, ' +
                'captador:asesor_captador_id(nombre), creador:created_by(nombre)')
        .eq('revision_estado', 'pendiente')
        .order('created_at', { ascending: true });
      check(error);
      return data || [];
    },

    // Borra la propiedad, sus filas de fotos y los objetos en Storage (sin huérfanos).
    async remove(id) {
      const fotosProp = await fotos.listByPropiedad(id);
      const paths = fotosProp.map(f => f.storage_path).filter(Boolean);
      if (paths.length) { await sb().storage.from(BUCKET).remove(paths); } // fallo no crítico
      const { error } = await sb().from('propiedades').delete().eq('id', id); // cascade borra fotos
      check(error);
    },

    // Público (anon): solo publicadas y disponibles.
    async listPublicas() {
      const { data, error } = await sb().from('propiedades')
        .select('*')
        .eq('publica', true).eq('estatus', 'disponible')
        .order('destacada', { ascending: false })
        .order('created_at', { ascending: false });
      check(error);
      return data || [];
    },

    // Prospectos que declararon interés en esta propiedad.
    async interesados(propiedadId) {
      const { data, error } = await sb().from('leads')
        .select('id, nombre, telefono, email, estatus, created_at, asesor:asesor_id(nombre)')
        .eq('propiedad_id', propiedadId)
        .order('created_at', { ascending: false });
      check(error);
      return data || [];
    },

    // Días que lleva publicada (o los que tardó en venderse).
    diasEnMercado(p) {
      if (!p || !p.created_at) return null;
      const ini = new Date(p.created_at);
      const fin = p.fecha_venta ? new Date(p.fecha_venta + 'T00:00:00') : new Date();
      return Math.max(0, Math.round((fin - ini) / 86400000));
    },

    // Propiedades del inventario que embonan con lo que busca el lead.
    // Puntúa ciudad, tipo y presupuesto; devuelve las mejores primero.
    async sugerenciasParaLead(lead, limite) {
      const { data, error } = await sb().from('propiedades')
        .select('id, titulo, tipo, ciudad, colonia, precio, operacion, foto_principal_url, recamaras, m2')
        .in('estatus', ['disponible', 'apartada']);
      check(error);

      const presupuesto = Number(lead.presupuesto) || Number(lead.valor_estimado) || 0;
      const norm = s => String(s || '').toLowerCase().trim();

      const puntuadas = (data || []).map(p => {
        let score = 0;
        if (lead.ciudad && norm(p.ciudad) === norm(lead.ciudad)) score += 3;
        if (lead.tipo_interes && p.tipo === lead.tipo_interes) score += 2;
        if (presupuesto && p.precio) {
          const ratio = p.precio / presupuesto;
          if (ratio >= 0.85 && ratio <= 1.15) score += 3;
          else if (ratio >= 0.7 && ratio <= 1.3) score += 1;
        }
        return { ...p, score };
      }).filter(p => p.score > 0);

      puntuadas.sort((a, b) => b.score - a.score);
      return puntuadas.slice(0, limite || 5);
    },
  };

  // ---- FOTOS ----------------------------------------------------------------
  const fotos = {
    async listByPropiedad(propiedadId) {
      const { data, error } = await sb().from('propiedad_fotos')
        .select('*').eq('propiedad_id', propiedadId)
        .order('principal', { ascending: false }).order('orden', { ascending: true });
      check(error);
      return data || [];
    },

    // Sube un Blob al Storage y registra la fila. Devuelve la fila creada.
    async upload(propiedadId, blob, opts) {
      opts = opts || {};
      const ext  = (blob.type && blob.type.split('/')[1]) || 'jpg';
      const name = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2)) + '.' + ext;
      const path = propiedadId + '/' + name;
      const up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      check(up.error);
      const { data: pub } = sb().storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;
      const ins = await sb().from('propiedad_fotos')
        .insert({ propiedad_id: propiedadId, url, storage_path: path, orden: opts.orden || 0, principal: !!opts.principal })
        .select().single();
      check(ins.error);
      return ins.data;
    },

    // Marca una foto como principal (desmarca las demás) y actualiza foto_principal_url.
    async setPrincipal(fotoId, propiedadId) {
      await sb().from('propiedad_fotos').update({ principal: false }).eq('propiedad_id', propiedadId);
      const { data, error } = await sb().from('propiedad_fotos')
        .update({ principal: true }).eq('id', fotoId).select().single();
      check(error);
      if (data) await sb().from('propiedades').update({ foto_principal_url: data.url }).eq('id', propiedadId);
      return data;
    },

    async remove(fotoId) {
      const { data: row } = await sb().from('propiedad_fotos').select('*').eq('id', fotoId).maybeSingle();
      if (row && row.storage_path) await sb().storage.from(BUCKET).remove([row.storage_path]);
      const { error } = await sb().from('propiedad_fotos').delete().eq('id', fotoId);
      check(error);
      // Si era la principal, limpiar/reasignar en la propiedad.
      if (row && row.principal) {
        const rest = await this.listByPropiedad(row.propiedad_id);
        const nuevaUrl = rest.length ? rest[0].url : null;
        await sb().from('propiedades').update({ foto_principal_url: nuevaUrl }).eq('id', row.propiedad_id);
        if (rest.length) await sb().from('propiedad_fotos').update({ principal: true }).eq('id', rest[0].id);
      }
    },
  };

  // ---- LEADS ----------------------------------------------------------------
  const SELECT_LEAD = '*, asesor:asesor_id(nombre), propiedad:propiedad_id(id, titulo, ciudad, precio)';

  const leads = {
    async list(filtros) {
      filtros = filtros || {};
      let q = sb().from('leads').select(SELECT_LEAD).order('created_at', { ascending: false });
      if (filtros.estatus)  q = q.eq('estatus', filtros.estatus);
      if (filtros.origen)   q = q.eq('origen', filtros.origen);
      if (filtros.asesorId === 'sin') q = q.is('asesor_id', null);
      else if (filtros.asesorId)      q = q.eq('asesor_id', filtros.asesorId);
      if (filtros.propiedadId) q = q.eq('propiedad_id', filtros.propiedadId);
      const { data, error } = await q;
      check(error);
      return data || [];
    },

    async get(id) {
      const { data, error } = await sb().from('leads').select(SELECT_LEAD).eq('id', id).maybeSingle();
      check(error);
      return data || null;
    },

    async save(obj) {
      const payload = { ...obj };
      let res;
      if (!payload.id) res = await sb().from('leads').insert(payload).select().single();
      else { const id = payload.id; delete payload.id; res = await sb().from('leads').update(payload).eq('id', id).select().single(); }
      check(res.error);
      return res.data;
    },

    async asignar(id, asesorId) {
      const { data, error } = await sb().from('leads').update({ asesor_id: asesorId || null }).eq('id', id).select().single();
      check(error);
      return data;
    },

    // `extra` permite mandar motivo_perdida al cerrar como perdido.
    async setEstatus(id, estatus, extra) {
      const payload = { estatus, ...(extra || {}) };
      if (estatus !== 'perdido') payload.motivo_perdida = null;
      // Cerrado o perdido: ya no hay nada que agendar.
      if (estatus === 'cerrado' || estatus === 'perdido') payload.proximo_seguimiento = null;
      const { data, error } = await sb().from('leads').update(payload).eq('id', id).select().single();
      check(error);
      return data;
    },

    async setSeguimiento(id, fecha) {
      const { data, error } = await sb().from('leads')
        .update({ proximo_seguimiento: fecha || null }).eq('id', id).select().single();
      check(error);
      return data;
    },

    // Busca otros leads con el mismo teléfono o correo (para no duplicar prospectos).
    async duplicados({ telefono, email, excluirId }) {
      const tel = String(telefono || '').replace(/\D/g, '').slice(-10);
      const mail = limpiarFiltro(String(email || '').toLowerCase());
      if (!tel && !mail) return [];

      const ors = [];
      if (tel)  ors.push('telefono.ilike.%' + tel);
      if (mail) ors.push('email.ilike.' + mail);

      let q = sb().from('leads')
        .select('id, nombre, telefono, email, origen, estatus, created_at, asesor:asesor_id(nombre)')
        .or(ors.join(','))
        .order('created_at', { ascending: false })
        .limit(5);
      if (excluirId) q = q.neq('id', excluirId);
      const { data, error } = await q;
      check(error);
      return data || [];
    },

    // Búsqueda global por nombre, teléfono o correo.
    async buscar(texto) {
      const t = limpiarFiltro(texto);
      if (t.length < 2) return [];
      const { data, error } = await sb().from('leads')
        .select('id, nombre, telefono, email, estatus, origen, created_at')
        .or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,email.ilike.%${t}%`)
        .order('created_at', { ascending: false })
        .limit(8);
      check(error);
      return data || [];
    },

    /* Pendientes del día. Devuelve tres cubetas:
     *   nuevos    — sin contactar todavía
     *   vencidos  — con seguimiento agendado para hoy o antes
     *   citas     — con cita agendada en los próximos 7 días
     * Si `asesorId` viene, filtra a ese asesor (más los que están sin asignar).
     */
    async pendientes(asesorId) {
      const hoy = new Date();
      const hoyISO = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const en7 = new Date(hoy.getTime() + 7 * 86400000);
      const en7ISO = new Date(en7.getTime() - en7.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

      const base = () => {
        let q = sb().from('leads').select(SELECT_LEAD);
        if (asesorId) q = q.or(`asesor_id.eq.${asesorId},asesor_id.is.null`);
        return q;
      };

      const [nuevos, vencidos, citas] = await Promise.all([
        base().eq('estatus', 'nuevo').is('ultimo_contacto_at', null)
              .order('created_at', { ascending: true }),
        base().not('estatus', 'in', '(cerrado,perdido)')
              .not('proximo_seguimiento', 'is', null).lte('proximo_seguimiento', hoyISO)
              .order('proximo_seguimiento', { ascending: true }),
        base().eq('estatus', 'cita')
              .gt('proximo_seguimiento', hoyISO).lte('proximo_seguimiento', en7ISO)
              .order('proximo_seguimiento', { ascending: true }),
      ]);
      check(nuevos.error); check(vencidos.error); check(citas.error);
      return { nuevos: nuevos.data || [], vencidos: vencidos.data || [], citas: citas.data || [] };
    },

    // Usado por la web pública (anon). No lanza: nunca debe romper el flujo del sitio.
    async crearAnon(payload) {
      try {
        if (!window.sb) return null;
        const { data, error } = await window.sb.from('leads').insert(payload).select().single();
        if (error) { console.warn('[Legio] No se pudo guardar el lead:', error.message); return null; }
        return data;
      } catch (e) { console.warn('[Legio] Lead no guardado:', e.message); return null; }
    },
  };

  // ---- ACTIVIDADES (bitácora de seguimiento) --------------------------------
  const actividades = {
    async listByLead(leadId) {
      const { data, error } = await sb().from('lead_actividades')
        .select('*, asesor:asesor_id(nombre)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      check(error);
      return data || [];
    },

    // Registra un contacto. El trigger de la base actualiza `ultimo_contacto_at`.
    async add(leadId, tipo, comentario) {
      const { data, error } = await sb().from('lead_actividades')
        .insert({ lead_id: leadId, asesor_id: await miId(), tipo, comentario: comentario || null })
        .select('*, asesor:asesor_id(nombre)').single();
      check(error);
      return data;
    },
  };

  // ---- ASESORES -------------------------------------------------------------
  const asesores = {
    async list(soloActivos) {
      let q = sb().from('asesores').select('*').order('nombre', { ascending: true });
      if (soloActivos) q = q.eq('activo', true);
      const { data, error } = await q;
      check(error);
      return data || [];
    },
    async get(id) {
      const { data, error } = await sb().from('asesores').select('*').eq('id', id).maybeSingle();
      check(error);
      return data || null;
    },
    async save(obj) {
      // El perfil se crea solo (trigger) al alta del usuario; aquí solo se actualiza.
      const { id, ...campos } = obj;
      const { data, error } = await sb().from('asesores').update(campos).eq('id', id).select().single();
      check(error);
      return data;
    },
    async setActivo(id, activo) { return this.save({ id, activo }); },
    async setRol(id, rol)       { return this.save({ id, rol }); },
  };

  // ---- AVALÚOS --------------------------------------------------------------
  const avaluos = {
    async list() {
      const { data, error } = await sb().from('avaluos')
        .select('id, folio, cliente, ciudad, concluido, created_at, lead_id, asesor:asesor_id(nombre)')
        .order('created_at', { ascending: false });
      check(error);
      return data || [];
    },
    async get(id) {
      const { data, error } = await sb().from('avaluos').select('*').eq('id', id).maybeSingle();
      check(error);
      return data || null;
    },
    async save(obj) {
      const payload = { ...obj };
      let res;
      if (!payload.id) {
        payload.asesor_id = payload.asesor_id || await miId();
        res = await sb().from('avaluos').insert(payload).select().single();
      } else {
        const id = payload.id; delete payload.id; delete payload.folio; delete payload.asesor_id;
        res = await sb().from('avaluos').update(payload).eq('id', id).select().single();
      }
      check(res.error);
      return res.data;
    },
    async remove(id) {
      const { error } = await sb().from('avaluos').delete().eq('id', id);
      check(error);
    },
  };

  // ---- COMISIONES -----------------------------------------------------------
  const comisiones = {
    // Reporte de vendidas en un periodo. Devuelve filas + totales por asesor y global.
    async reporte(opts) {
      opts = opts || {};
      let q = sb().from('propiedades')
        .select('*, captador:asesor_captador_id(nombre), vendedor:asesor_vendedor_id(nombre), ' + EMBED_COMISION)
        .eq('estatus', 'vendida');
      if (opts.desde) q = q.gte('fecha_venta', opts.desde);
      if (opts.hasta) q = q.lte('fecha_venta', opts.hasta);
      if (opts.asesorId) q = q.or('asesor_captador_id.eq.' + opts.asesorId + ',asesor_vendedor_id.eq.' + opts.asesorId);
      const { data, error } = await q.order('fecha_venta', { ascending: false });
      check(error);

      const rows = (data || []).map(p => {
        const base = Number(p.precio_venta_final || p.precio || 0);
        const c = comisionesDe(p);
        const pctCap = num(c.comision_captador_pct);
        const pctVen = num(c.comision_vendedor_pct);
        // Si no hay split, usar comision_pct como total y repartir 50/50 informativo.
        const totalPct = num(c.comision_pct);
        const comCap = pctCap != null ? base * pctCap / 100 : (totalPct != null ? base * totalPct / 200 : 0);
        const comVen = pctVen != null ? base * pctVen / 100 : (totalPct != null ? base * totalPct / 200 : 0);
        return {
          id: p.id, titulo: p.titulo, ciudad: p.ciudad, fecha_venta: p.fecha_venta,
          base,
          captador: p.captador ? p.captador.nombre : '—', captadorId: p.asesor_captador_id, comCap,
          vendedor: p.vendedor ? p.vendedor.nombre : '—', vendedorId: p.asesor_vendedor_id, comVen,
          totalComision: comCap + comVen,
        };
      });

      const porAsesor = {};
      const acum = (id, nombre, monto) => {
        if (!id) return;
        porAsesor[id] = porAsesor[id] || { nombre, total: 0 };
        porAsesor[id].total += monto;
      };
      rows.forEach(r => { acum(r.captadorId, r.captador, r.comCap); acum(r.vendedorId, r.vendedor, r.comVen); });

      return {
        rows,
        porAsesor: Object.values(porAsesor).sort((a, b) => b.total - a.total),
        totalVentas: rows.reduce((s, r) => s + r.base, 0),
        totalComisiones: rows.reduce((s, r) => s + r.totalComision, 0),
      };
    },
  };

  // ---- MÉTRICAS (panel del admin) ------------------------------------------
  const ESTADOS_EMBUDO = ['nuevo', 'contactado', 'cita', 'cerrado'];

  const metricas = {
    /* Trae los datos crudos del periodo y los agrega en memoria. Es más simple
     * que mantener vistas SQL y basta de sobra para el volumen de una oficina.
     */
    async resumen(desde, hasta) {
      const hastaFin = hasta ? hasta + 'T23:59:59' : null;

      let ql = sb().from('leads').select('id, origen, estatus, motivo_perdida, created_at, ultimo_contacto_at, asesor_id, asesor:asesor_id(nombre)');
      if (desde)    ql = ql.gte('created_at', desde);
      if (hastaFin) ql = ql.lte('created_at', hastaFin);

      const [rl, rp] = await Promise.all([
        ql,
        sb().from('propiedades').select('id, estatus, precio, precio_venta_final, created_at, fecha_venta, ciudad, tipo'),
      ]);
      check(rl.error); check(rp.error);

      const leadsRows = rl.data || [];
      const props     = rp.data || [];

      // --- Leads por origen ---
      const porOrigen = {};
      leadsRows.forEach(l => { porOrigen[l.origen] = (porOrigen[l.origen] || 0) + 1; });

      // --- Leads por semana (últimas 12) ---
      const porSemana = {};
      leadsRows.forEach(l => {
        const k = claveSemana(new Date(l.created_at));
        porSemana[k] = (porSemana[k] || 0) + 1;
      });

      // --- Embudo ---
      // Acumulado por etapa *alcanzada*, no por estatus actual: un lead cerrado
      // también cuenta como contactado. Un lead perdido cuenta hasta donde llegó.
      const alcanzo = {
        nuevo:      () => true,
        contactado: l => !!l.ultimo_contacto_at || ['contactado','cita','cerrado'].includes(l.estatus),
        cita:       l => ['cita','cerrado'].includes(l.estatus),
        cerrado:    l => l.estatus === 'cerrado',
      };
      const embudo = ESTADOS_EMBUDO.map(etapa => ({
        etapa,
        total: leadsRows.filter(alcanzo[etapa]).length,
      }));

      // --- Conversión por asesor ---
      const porAsesor = {};
      leadsRows.forEach(l => {
        const id = l.asesor_id || 'sin';
        const nombre = l.asesor ? l.asesor.nombre : 'Sin asignar';
        porAsesor[id] = porAsesor[id] || { nombre, total: 0, contactados: 0, citas: 0, cerrados: 0, perdidos: 0 };
        const a = porAsesor[id];
        a.total++;
        if (l.ultimo_contacto_at) a.contactados++;
        if (l.estatus === 'cita')    a.citas++;
        if (l.estatus === 'cerrado') a.cerrados++;
        if (l.estatus === 'perdido') a.perdidos++;
      });
      Object.values(porAsesor).forEach(a => {
        a.tasaContacto = a.total ? a.contactados / a.total : 0;
        a.tasaCierre   = a.total ? a.cerrados / a.total : 0;
      });

      // --- Motivos de pérdida ---
      const motivos = {};
      leadsRows.filter(l => l.estatus === 'perdido').forEach(l => {
        const m = l.motivo_perdida || 'Sin especificar';
        motivos[m] = (motivos[m] || 0) + 1;
      });

      // --- Propiedades ---
      const porEstatus = {};
      props.forEach(p => { porEstatus[p.estatus] = (porEstatus[p.estatus] || 0) + 1; });

      const activas = props.filter(p => p.estatus === 'disponible' || p.estatus === 'apartada');
      const diasMercado = activas.map(p => propiedades.diasEnMercado(p)).filter(d => d != null);
      const vendidas = props.filter(p => p.estatus === 'vendida' && p.fecha_venta &&
        (!desde || p.fecha_venta >= desde) && (!hasta || p.fecha_venta <= hasta));
      const diasVenta = vendidas.map(p => propiedades.diasEnMercado(p)).filter(d => d != null);

      // --- Tiempo de respuesta al lead (horas hasta el primer contacto) ---
      const respuestas = leadsRows
        .filter(l => l.ultimo_contacto_at)
        .map(l => (new Date(l.ultimo_contacto_at) - new Date(l.created_at)) / 3600000)
        .filter(h => h >= 0);

      return {
        totalLeads: leadsRows.length,
        sinContactar: leadsRows.filter(l => !l.ultimo_contacto_at && l.estatus === 'nuevo').length,
        porOrigen, porSemana, embudo, motivos,
        porAsesor: Object.values(porAsesor).sort((a, b) => b.total - a.total),
        horasRespuestaProm: promedio(respuestas),
        propiedades: {
          porEstatus,
          activas: activas.length,
          diasMercadoProm: promedio(diasMercado),
          vendidas: vendidas.length,
          diasVentaProm: promedio(diasVenta),
          montoVendido: vendidas.reduce((s, p) => s + Number(p.precio_venta_final || p.precio || 0), 0),
        },
        leadsRows,   // para exportar a CSV sin volver a consultar
      };
    },
  };

  // ---- PANEL (tablero de inicio) --------------------------------------------
  /* Todo lo que enseña el tablero en una sola llamada: cifras del periodo contra
   * el periodo anterior, agenda, cierres, actividad del equipo e inventario.
   * Se agrega en memoria por lo mismo que las métricas: el volumen de una
   * oficina cabe de sobra y evita mantener vistas SQL.
   *
   *   opts: { desde, hasta, asesorId }   asesorId nulo = toda la oficina (admin)
   */
  const CAMPOS_PANEL = 'id, nombre, telefono, email, origen, estatus, ciudad, created_at, ' +
                       'ultimo_contacto_at, proximo_seguimiento, asesor_id, asesor:asesor_id(nombre)';

  const panel = {
    async resumen(opts) {
      opts = opts || {};
      const desde = opts.desde, hasta = opts.hasta;
      const asesorId = opts.asesorId || null;

      // Periodo anterior del mismo largo, para las comparativas.
      const largo = diasEntreISO(desde, hasta) + 1;
      const prevHasta = sumarDiasISO(desde, -1);
      const prevDesde = sumarDiasISO(prevHasta, -(largo - 1));

      // El asesor ve lo suyo y lo que aún no tiene dueño (igual que en pendientes).
      const mio = q => asesorId ? q.or(`asesor_id.eq.${asesorId},asesor_id.is.null`) : q;

      const [rMes, rPrev, rAgenda, rProps, rAct] = await Promise.all([
        mio(sb().from('leads').select(CAMPOS_PANEL))
          .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59')
          .order('created_at', { ascending: false }),
        mio(sb().from('leads').select('id, estatus, created_at, ultimo_contacto_at'))
          .gte('created_at', prevDesde).lte('created_at', prevHasta + 'T23:59:59'),
        mio(sb().from('leads').select(CAMPOS_PANEL))
          .not('estatus', 'in', '(cerrado,perdido)')
          .not('proximo_seguimiento', 'is', null)
          .gte('proximo_seguimiento', opts.agendaDesde || desde)
          .lte('proximo_seguimiento', opts.agendaHasta || hasta)
          .order('proximo_seguimiento', { ascending: true }),
        sb().from('propiedades').select('id, titulo, ciudad, estatus, precio, precio_venta_final, publica, ' +
          'created_at, fecha_venta, foto_principal_url, asesor_captador_id, asesor_vendedor_id, ' +
          'revision_estado, vendedor:asesor_vendedor_id(nombre), ' + EMBED_COMISION),
        sb().from('lead_actividades').select('id, tipo, created_at')
          .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),
      ]);
      check(rMes.error); check(rPrev.error); check(rAgenda.error); check(rProps.error);
      // La bitácora es secundaria: si falla, el tablero se dibuja igual.
      const actos = rAct.error ? [] : (rAct.data || []);

      const leads     = rMes.data || [];
      const leadsPrev = rPrev.data || [];
      const agenda    = rAgenda.data || [];
      const props     = rProps.data || [];

      // --- Cierres del periodo (lo que de verdad se firmó) ---
      // Con la vista acotada a un asesor, los cierres son los suyos (captó o vendió):
      // el monto del panel tiene que ser el que le toca, no el de toda la oficina.
      const enRango = (f, a, b) => !!f && f >= a && f <= b;
      const mia = p => !asesorId || p.asesor_vendedor_id === asesorId || p.asesor_captador_id === asesorId;
      const cerrada = (p, a, b) => p.estatus === 'vendida' && enRango(p.fecha_venta, a, b) && mia(p);
      const vendidas     = props.filter(p => cerrada(p, desde, hasta));
      const vendidasPrev = props.filter(p => cerrada(p, prevDesde, prevHasta));
      const monto     = vendidas.reduce((s, p) => s + Number(p.precio_venta_final || p.precio || 0), 0);
      const montoPrev = vendidasPrev.reduce((s, p) => s + Number(p.precio_venta_final || p.precio || 0), 0);
      const comision  = vendidas.reduce((s, p) => s + comisionDe(p, asesorId), 0);

      // --- Inventario ---
      const activas = props.filter(p => p.estatus === 'disponible' || p.estatus === 'apartada');
      const diasAct = activas.map(p => propiedades.diasEnMercado(p)).filter(d => d != null);
      const estancadas = activas
        .map(p => ({ ...p, dias: propiedades.diasEnMercado(p) }))
        .filter(p => p.dias != null && p.dias > 180)
        .sort((a, b) => b.dias - a.dias);

      // --- Conversión y respuesta ---
      const contactados = leads.filter(l => l.ultimo_contacto_at).length;
      const horas = l => (new Date(l.ultimo_contacto_at) - new Date(l.created_at)) / 3600000;
      const respuesta     = promedio(leads.filter(l => l.ultimo_contacto_at).map(horas).filter(h => h >= 0));
      const respuestaPrev = promedio(leadsPrev.filter(l => l.ultimo_contacto_at).map(horas).filter(h => h >= 0));

      // --- Reparto por origen ---
      const porOrigen = Object.entries(leads.reduce((acc, l) => {
        acc[l.origen || 'manual'] = (acc[l.origen || 'manual'] || 0) + 1; return acc;
      }, {})).map(([k, n]) => ({ clave: k, n })).sort((a, b) => b.n - a.n);

      // --- Serie temporal: por día si el periodo es corto, por semana si es largo ---
      const porSemana = largo > 62;
      const serie = serieDeLeads(leads, desde, hasta, porSemana);

      // --- Actividad registrada (llamadas, WhatsApp, citas…) ---
      const eventos = actos.reduce((acc, a) => { acc[a.tipo] = (acc[a.tipo] || 0) + 1; return acc; }, {});

      return {
        rango: { desde, hasta, largo, prevDesde, prevHasta },
        leads: {
          total: leads.length, totalPrev: leadsPrev.length,
          contactados, sinContactar: leads.filter(l => !l.ultimo_contacto_at && l.estatus === 'nuevo').length,
          tasaContacto:     leads.length ? contactados / leads.length : null,
          tasaContactoPrev: leadsPrev.length ? leadsPrev.filter(l => l.ultimo_contacto_at).length / leadsPrev.length : null,
          ganados:     leads.filter(l => l.estatus === 'cerrado').length,
          ganadosPrev: leadsPrev.filter(l => l.estatus === 'cerrado').length,
          perdidos: leads.filter(l => l.estatus === 'perdido').length,
          filas: leads,
        },
        respuesta: { horas: respuesta, horasPrev: respuestaPrev },
        cierres: {
          n: vendidas.length, nPrev: vendidasPrev.length,
          monto, montoPrev, comision, filas: vendidas,
        },
        agenda: {
          filas: agenda,
          citas: agenda.filter(l => l.estatus === 'cita').length,
          vencidas: agenda.filter(l => l.proximo_seguimiento < hoyISO()).length,
        },
        inventario: {
          activas: activas.length,
          disponibles: props.filter(p => p.estatus === 'disponible').length,
          apartadas:   props.filter(p => p.estatus === 'apartada').length,
          borradores:  props.filter(p => p.estatus === 'borrador').length,
          // "Publicada" de verdad es publica + aprobada: sin el dictamen del
          // admin la propiedad no sale al sitio aunque tenga la casilla puesta.
          publicadas:  props.filter(p => p.publica && p.estatus === 'disponible' &&
                                         p.revision_estado === 'aprobada').length,
          porRevisar:  props.filter(p => p.revision_estado === 'pendiente').length,
          devueltas:   props.filter(p => p.revision_estado === 'devuelta').length,
          diasMercadoProm: promedio(diasAct),
          estancadas,
        },
        porOrigen, serie, porSemana, eventos,
        totalEventos: actos.length,
      };
    },
  };

  /* Comisión de una propiedad vendida. Sin `asesorId` devuelve la de la casa
   * (captador + vendedor); con él, solo la parte que le corresponde a ese asesor.
   * Sin split capturado se reparte el total 50/50, igual que en el reporte de
   * comisiones, para no inventar cifras distintas en dos pantallas. */
  function comisionDe(p, asesorId) {
    const base = Number(p.precio_venta_final || p.precio || 0);
    const c = comisionesDe(p);
    const tot = num(c.comision_pct);
    const cap = num(c.comision_captador_pct) != null ? num(c.comision_captador_pct) : (tot != null ? tot / 2 : null);
    const ven = num(c.comision_vendedor_pct) != null ? num(c.comision_vendedor_pct) : (tot != null ? tot / 2 : null);
    if (cap == null && ven == null) return 0;

    if (!asesorId) return base * ((cap || 0) + (ven || 0)) / 100;
    let pct = 0;
    if (p.asesor_captador_id === asesorId) pct += cap || 0;
    if (p.asesor_vendedor_id === asesorId) pct += ven || 0;
    return base * pct / 100;
  }

  /* Serie de leads por día (o por semana en periodos largos), sin huecos.
   * La serie se corta en el día de hoy: en "este mes" los días que aún no pasan
   * dibujarían un valle de ceros que se lee como una caída de prospectos. */
  function serieDeLeads(leads, desde, hasta, porSemana) {
    const fin = hasta > hoyISO() ? hoyISO() : hasta;
    const cubetas = new Map();
    for (let f = desde; f <= fin; f = sumarDiasISO(f, 1)) {
      cubetas.set(porSemana ? claveSemana(new Date(f + 'T00:00:00')) : f, 0);
    }
    leads.forEach(l => {
      const d = new Date(l.created_at);
      const k = porSemana ? claveSemana(d) : isoLocal(d);
      if (cubetas.has(k)) cubetas.set(k, cubetas.get(k) + 1);
    });
    return Array.from(cubetas, ([fecha, n]) => ({ fecha, n }));
  }

  // ---- Fechas (sin dependencias: crm-data.js también corre en el sitio público)
  function isoLocal(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function hoyISO() { return isoLocal(new Date()); }
  function sumarDiasISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoLocal(d);
  }
  function diasEntreISO(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  function promedio(arr) { return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null; }

  // Etiqueta 'YYYY-Www' del lunes de esa semana (ISO).
  function claveSemana(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() - dia + 1);
    return dt.toISOString().slice(0, 10);
  }

  function num(v) { return (v === null || v === undefined || v === '') ? null : Number(v); }

  /* Los filtros `.or()` de PostgREST separan condiciones con comas y agrupan con
   * paréntesis. Un texto de búsqueda con esos caracteres rompería la consulta. */
  function limpiarFiltro(texto) {
    return String(texto || '').replace(/[(),*]/g, ' ').trim();
  }

  window.Legio.crm = { propiedades, fotos, leads, actividades, asesores, comisiones, avaluos, metricas, panel };
})();
