/* ===== ALMACENAMIENTO DE AVALÚOS — LEGIO =====
 * Dos modos, misma interfaz (Promesas), elegido automáticamente:
 *
 *   'nube'  → tabla `avaluos` de Supabase. Todo el equipo ve los avalúos.
 *             Se usa cuando hay sesión iniciada en el CRM.
 *   'local' → localStorage del navegador (el comportamiento original).
 *             Es el respaldo cuando no hay sesión o Supabase no está configurado.
 *
 * Quien llama a estos métodos (avaluo-ui.js, informe-ui.js, dashboard-ui.js)
 * no necesita saber en qué modo está.
 */
(function () {
  window.Legio = window.Legio || {};

  const KEY_DATA  = 'legio_avaluos';
  const KEY_FOLIO = 'legio_folio';

  let _modo = null;   // se resuelve una vez por carga de página

  async function modo() {
    if (_modo) return _modo;
    if (!window.sb || !window.Legio.crm) { _modo = 'local'; return _modo; }
    try {
      const { data } = await window.sb.auth.getSession();
      _modo = (data && data.session) ? 'nube' : 'local';
    } catch (e) { _modo = 'local'; }
    return _modo;
  }

  // ---- Modo local (localStorage) --------------------------------------------
  function _leerTodos() {
    try { return JSON.parse(localStorage.getItem(KEY_DATA)) || []; }
    catch (e) { return []; }
  }
  function _guardarTodos(arr) { localStorage.setItem(KEY_DATA, JSON.stringify(arr)); }
  function _siguienteFolio() {
    const n = (parseInt(localStorage.getItem(KEY_FOLIO), 10) || 0) + 1;
    localStorage.setItem(KEY_FOLIO, String(n));
    return 'LEGIO-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
  }

  // ---- Traducción entre el objeto del avalúo y la fila de la tabla -----------
  // El avalúo completo vive en la columna `datos` (jsonb); los campos sueltos
  // existen solo para poder listar y filtrar sin abrir el jsonb.
  function aFila(avaluo) {
    return {
      cliente:   avaluo.cliente   && avaluo.cliente.nombre   || null,
      ciudad:    avaluo.propiedad && avaluo.propiedad.ciudad || null,
      concluido: avaluo.resultado && avaluo.resultado.concluido || null,
      lead_id:   avaluo.lead_id || null,
      datos:     avaluo,
    };
  }
  function aAvaluo(fila) {
    return { ...(fila.datos || {}), id: fila.id, folio: fila.folio, fecha: fila.created_at, lead_id: fila.lead_id };
  }

  Legio.storage = {
    // Expuesto para que la interfaz pueda avisar en qué modo está trabajando.
    async modo() { return modo(); },

    async list() {
      if (await modo() === 'nube') {
        const filas = await Legio.crm.avaluos.list();
        return filas.map(a => ({
          id: a.id, folio: a.folio, fecha: a.created_at,
          cliente: a.cliente, ciudad: a.ciudad, concluido: a.concluido,
          asesor: a.asesor ? a.asesor.nombre : null,
        }));
      }
      return _leerTodos().map(a => ({
        id: a.id, folio: a.folio, fecha: a.fecha,
        cliente: a.cliente && a.cliente.nombre,
        ciudad: a.propiedad && a.propiedad.ciudad,
        concluido: a.resultado && a.resultado.concluido,
      }));
    },

    async get(id) {
      if (await modo() === 'nube') {
        const fila = await Legio.crm.avaluos.get(id);
        return fila ? aAvaluo(fila) : null;
      }
      return _leerTodos().find(a => a.id === id) || null;
    },

    async save(avaluo) {
      if (await modo() === 'nube') {
        const payload = aFila(avaluo);
        if (avaluo.id) payload.id = avaluo.id;
        const fila = await Legio.crm.avaluos.save(payload);   // el folio lo pone la base
        return aAvaluo(fila);
      }
      const todos = _leerTodos();
      if (!avaluo.id) {
        avaluo.id = 'av_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        avaluo.folio = avaluo.folio || _siguienteFolio();
        avaluo.fecha = avaluo.fecha || new Date().toISOString();
        todos.push(avaluo);
      } else {
        const i = todos.findIndex(a => a.id === avaluo.id);
        if (i >= 0) todos[i] = avaluo; else todos.push(avaluo);
      }
      _guardarTodos(todos);
      return avaluo;
    },

    async remove(id) {
      if (await modo() === 'nube') { await Legio.crm.avaluos.remove(id); return; }
      _guardarTodos(_leerTodos().filter(a => a.id !== id));
    },

    async exportAll() {
      const ids = await this.list();
      const completos = await Promise.all(ids.map(a => this.get(a.id)));
      return JSON.stringify({ version: 1, exportado: new Date().toISOString(), avaluos: completos.filter(Boolean) }, null, 2);
    },

    async importAll(json) {
      const data = JSON.parse(json);
      const entrantes = Array.isArray(data) ? data : (data.avaluos || []);

      if (await modo() === 'nube') {
        for (const a of entrantes) {
          const copia = { ...a };
          delete copia.id;      // se crean como nuevos: la base asigna id y folio
          delete copia.folio;
          await this.save(copia);
        }
        return (await this.list()).length;
      }

      const porId = {};
      [..._leerTodos(), ...entrantes].forEach(a => { if (a && a.id) porId[a.id] = a; });
      _guardarTodos(Object.values(porId));
      return Object.values(porId).length;
    },

    // Cuántos avalúos quedaron guardados solo en este navegador.
    contarLocales() { return _leerTodos().length; },

    /* Sube a la nube los avalúos que quedaron en este navegador (de antes de
     * conectar Supabase) y los borra de aquí una vez subidos. */
    async subirLocales() {
      if (await modo() !== 'nube') throw new Error('Necesitas haber iniciado sesión en el CRM.');
      const locales = _leerTodos();
      if (!locales.length) return 0;
      for (const a of locales) {
        const copia = { ...a };
        delete copia.id; delete copia.folio;
        await this.save(copia);
      }
      _guardarTodos([]);
      return locales.length;
    },
  };
})();
