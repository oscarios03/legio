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

  /* Escribir en localStorage FALLA de verdad: al llenarse la cuota, setItem lanza.
   * Sin este envoltorio la excepción viajaba hasta una promesa sin manejar y el asesor
   * pulsaba «Guardar» sin que pasara nada, después de seis pasos de captura.
   * Aquí se traduce a un error con `codigo`, para que la interfaz sepa qué ofrecerle. */
  function _escribir(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch (e) {
      const lleno = e && (e.name === 'QuotaExceededError' ||
                          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                          e.code === 22 || e.code === 1014);
      const err = new Error(lleno
        ? 'No cabe en el almacenamiento de este navegador. Las fotografías son lo que más ocupa: quita algunas y vuelve a guardar, o inicia sesión en el CRM para guardar en la nube.'
        : 'El navegador rechazó el guardado local (' + ((e && e.name) || 'error desconocido') + ').');
      err.codigo = lleno ? 'ESPACIO_LLENO' : 'ESCRITURA_LOCAL';
      err.causa = e;
      throw err;
    }
  }

  function _guardarTodos(arr) { _escribir(KEY_DATA, JSON.stringify(arr)); }

  // El folio se reserva antes de escribir y se devuelve si la escritura falla, para
  // no dejar huecos en la numeración por un guardado que nunca ocurrió.
  function _reservarFolio() {
    const anterior = localStorage.getItem(KEY_FOLIO);
    const n = (parseInt(anterior, 10) || 0) + 1;
    _escribir(KEY_FOLIO, String(n));
    return {
      texto: 'LEGIO-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0'),
      devolver() {
        try {
          if (anterior == null) localStorage.removeItem(KEY_FOLIO);
          else localStorage.setItem(KEY_FOLIO, anterior);
        } catch (e) { /* si ni esto se puede, el hueco en la numeración es lo de menos */ }
      },
    };
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
      const esNuevo = !avaluo.id;
      let folio = null;
      if (esNuevo) {
        avaluo.id = 'av_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        if (!avaluo.folio) { folio = _reservarFolio(); avaluo.folio = folio.texto; }
        avaluo.fecha = avaluo.fecha || new Date().toISOString();
        todos.push(avaluo);
      } else {
        const i = todos.findIndex(a => a.id === avaluo.id);
        if (i >= 0) todos[i] = avaluo; else todos.push(avaluo);
      }
      try {
        _guardarTodos(todos);
      } catch (e) {
        // No quedó guardado: se deshace lo que este intento había asignado, para que
        // reintentar no deje un id fantasma ni un hueco en la numeración de folios.
        if (esNuevo) {
          delete avaluo.id;
          if (folio) { folio.devolver(); delete avaluo.folio; }
        }
        throw e;
      }
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
