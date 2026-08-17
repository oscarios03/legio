/* ===== CALIBRACIÓN BASE (PÚBLICA) — LEGIO =====
 *
 * Solo lo que el estimador público NECESITA para dar un rango orientativo:
 * multiplicadores de ajuste y un precio de respaldo por si el CP no está en colonias.js.
 * El precio por m² real lo aporta colonias.js, que la página pública ya carga.
 *
 * ⚠️ NO poner aquí nada del modelo profesional. Este archivo se descarga desde el
 *    sitio público y es visible para cualquiera (incluida la competencia).
 *    Lo confidencial vive en interno/js/calibracion.js, que solo cargan las
 *    páginas de /interno/:
 *      · costos de construcción por m²      · tasas de capitalización
 *      · coeficientes de Heidecke           · % de homologación de comparables
 *      · factor de negociación              · plusvalía mensual
 *      · deducciones del enfoque de ingresos
 *
 * ÚLTIMA ACTUALIZACIÓN: 2026-08 · Valores benchmark 2025-2026.
 * Fuentes: propiedades.com (valores por ciudad), lasillarota.com (colonias premium de León).
 */
(function () {
  window.Legio = window.Legio || {};

  // ── Precio de respaldo por m² (MXN) ──
  // Solo se usa si el CP no aparece en colonias.js. La fuente real es esa tabla:
  // cada colonia trae su propio conMin/conMax/terMin/terMax.
  const PRECIO_DEFAULT = { conMin: 9000, conMax: 13000, terMin: 3500, terMax: 6500 };

  // ── Tier de zona ──
  const MULT_TIER = { premium: 1.30, media: 1.00, popular: 0.78 };

  // ── Multiplicadores de ajuste (criterio técnico de valuación) ──
  const MULT_ANTIG        = { nueva: 1.00, reciente: 0.95, media: 0.88, antigua: 0.80 };
  const MULT_CONSERVACION = { excelente: 1.10, buena: 1.00, regular: 0.87, reparaciones: 0.74 };
  const MULT_CALIDAD      = { lujo: 1.14, alta: 1.06, media: 1.00, economica: 0.90 };
  const MULT_UBICACION    = { privada: 1.05, avenida: 1.04, esquina: 1.03, interior: 1.00, ruidosa: 0.95 };
  const BONUS_SERVICIO    = { areas_verdes: 0.01, gimnasio: 0.02, alberca_comun: 0.02, seguridad: 0.02, casa_club: 0.02, roof_garden: 0.015 };

  /* ── Precio estándar por ciudad ──────────────────────────────────────────
   *
   * colonias.js tiene dos regímenes conviviendo:
   *   · León está diferenciado a mano: ~100 colonias con precio propio (Jardines del
   *     Moral 22000/34000) sobre una base de 11000/17000 que comparten 929 colonias.
   *   · El resto de las ciudades es plano: las 457 colonias de Celaya comparten precio,
   *     las 396 de Guanajuato también.
   *
   * Sin distinguirlos, el multiplicador de zona significa cosas distintas según la
   * ciudad: en León se suma a un premium que el precio YA incluye (lo cuenta dos veces),
   * y en Celaya es la única diferenciación que existe.
   *
   * El precio estándar de cada ciudad se deduce del propio colonias.js: es el que más
   * colonias comparten. Así la regla se mantiene sola conforme Legio afine precios.
   */
  let _baseline = null;
  function baselinePorCiudad() {
    if (_baseline) return _baseline;
    _baseline = {};
    const db = (typeof COLONIAS_DB !== 'undefined') ? COLONIAS_DB : null;
    if (!db) return _baseline;

    const cuenta = {};   // ciudad → { "conMin|conMax|terMin|terMax": nº de colonias }
    Object.keys(db).forEach(cp => {
      const e = db[cp];
      if (!e || !e.colonias) return;
      const porCiudad = cuenta[e.ciudad] || (cuenta[e.ciudad] = {});
      e.colonias.forEach(c => {
        const k = clavePrecio(c);
        porCiudad[k] = (porCiudad[k] || 0) + 1;
      });
    });

    Object.keys(cuenta).forEach(ciudad => {
      let clave = null, max = -1;
      Object.keys(cuenta[ciudad]).forEach(k => {
        if (cuenta[ciudad][k] > max) { max = cuenta[ciudad][k]; clave = k; }
      });
      _baseline[ciudad] = clave;
    });
    return _baseline;
  }

  function clavePrecio(c) { return [c.conMin, c.conMax, c.terMin, c.terMax].join('|'); }

  function esPrecioGenerico(ciudad, colonia) {
    const base = baselinePorCiudad()[ciudad];
    // Sin baseline (colonias.js no cargó) se asume genérico: es el comportamiento previo.
    return base == null ? true : clavePrecio(colonia) === base;
  }

  Legio.calibracionBase = {
    ULTIMA_ACTUALIZACION: '2026-08',
    PRECIO_DEFAULT, MULT_TIER,
    MULT_ANTIG, MULT_CONSERVACION, MULT_CALIDAD, MULT_UBICACION, BONUS_SERVICIO,

    /* Precio por m² de una colonia concreta. Busca en colonias.js (COLONIAS_DB) y
     * cae al respaldo si el CP o la colonia no están.
     * cp: código postal de 5 dígitos · nombreColonia: exactamente como aparece en la lista.
     *
     * Devuelve además `esGenerico`: true cuando la colonia tiene el precio estándar de su
     * ciudad, false cuando Legio le puso precio propio. El motor lo necesita para no
     * contar la zona dos veces (ver estimadoAutomatico en motor-base.js). */
    precioZona(cp, nombreColonia) {
      const db = (typeof COLONIAS_DB !== 'undefined') ? COLONIAS_DB : null;
      const entrada = db && db[String(cp || '').trim()];
      if (!entrada) return { ...PRECIO_DEFAULT, esGenerico: true };
      const col = (entrada.colonias || []).find(c => c.nombre === nombreColonia) || entrada.colonias[0];
      if (!col) return { ...PRECIO_DEFAULT, esGenerico: true };
      return {
        conMin: col.conMin, conMax: col.conMax, terMin: col.terMin, terMax: col.terMax,
        esGenerico: esPrecioGenerico(entrada.ciudad, col),
      };
    },

    /* ¿El precio de esta colonia es el estándar de su ciudad, o Legio le puso uno propio?
     * Expuesto para que la interfaz pueda explicárselo al asesor. */
    esPrecioGenerico,

    // Precio estándar de cada ciudad, deducido de colonias.js. Útil para diagnóstico.
    baselinePorCiudad,
  };

  // Compatibilidad: hasta que cargue la calibración PRO, Legio.calibracion es la base.
  // interno/js/calibracion.js la reemplaza extendiendo este objeto.
  Legio.calibracion = Legio.calibracion || Object.assign({}, Legio.calibracionBase);
})();
