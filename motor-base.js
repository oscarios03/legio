/* ===== MOTOR BASE (PÚBLICO) — LEGIO =====
 * Clasificación de zona + estimado automático. Lógica pura (sin DOM).
 * Es lo único que necesita el estimador público.
 *
 * Los enfoques profesionales (comparables homologados, costo, ingresos y su
 * conciliación) viven en interno/js/valuacion-core.js, que EXTIENDE este objeto y
 * solo cargan las páginas de /interno/.
 *
 * Expuesto como window.Legio.valuacion para no depender de ES modules (compatible file:// y servidor).
 */
(function () {
  window.Legio = window.Legio || {};
  const CAL = (window.Legio && window.Legio.calibracionBase) || {};

  // ── Multiplicadores base ──
  // MULT_TIPO ya NO castiga al terreno: un predio se valúa con precio de terreno,
  // no con precio de construcción rebajado (ver estimadoAutomatico).
  const MULT_TIPO = { casa: 1.00, departamento: 0.85, local: 0.90, terreno: 1.00 }; // estructural
  const MULT_PISO = { alto: 1.08, medio: 1.00, bajo: 0.93 };                        // estructural
  const MULT_ANTIG = CAL.MULT_ANTIG || { nueva: 1.00, reciente: 0.95, media: 0.88, antigua: 0.80 };
  const MULT_CONSERVACION = CAL.MULT_CONSERVACION || { excelente: 1.10, buena: 1.00, regular: 0.87, reparaciones: 0.74 };
  const MULT_TIER = CAL.MULT_TIER || { premium: 1.30, media: 1.00, popular: 0.78 };
  const MULT_CALIDAD = CAL.MULT_CALIDAD || { lujo: 1.14, alta: 1.06, media: 1.00, economica: 0.90 };
  const MULT_UBICACION = CAL.MULT_UBICACION || { privada: 1.05, avenida: 1.04, esquina: 1.03, interior: 1.00, ruidosa: 0.95 };
  const BONUS_SERVICIO = CAL.BONUS_SERVICIO || { areas_verdes: 0.01, gimnasio: 0.02, alberca_comun: 0.02, seguridad: 0.02, casa_club: 0.02, roof_garden: 0.015 };

  // Amplitud del rango del estimado automático (±). Criterio único en todo el motor.
  const AMPLITUD_ESTIMADO = 0.08;

  // ── Clasificación de zona por nombre de colonia (incluye colonias premium de León) ──
  const TIER_PREMIUM = /campestre|gran jard|country|\bgolf\b|jardines del|jardines de san|cañada del refugio|el molino|puerta (de|del|para)|real provid|hacienda.*(golf|viñedos)|lomas de gran|club hípico|residencial san ángel|santa sofía|punta cañada|bosque azul|el bosque|misión cañada/i;
  const TIER_POPULAR = /ampliación|fracción|ejido|rancho|granja|predio|comunitaria|obrera|popular|emiliano zapata|18 de marzo|lo de |presa |cañada de |loma de |las peñitas|peñitas/i;

  function clasificarTier(nombre) {
    if (!nombre) return 'media';
    if (TIER_PREMIUM.test(nombre)) return 'premium';
    if (TIER_POPULAR.test(nombre)) return 'popular';
    return 'media';
  }

  // ── Estimado automático ──
  // datos: { tipo, conMin, conMax, terMin, terMax, m2c, m2t, rec, ban, caj,
  //          antiguedad, conservacion, nivel, extras[], coloniaNombre, atributos?,
  //          precioEsGenerico? }
  // Devuelve { min, mid, max, tier, multTier, multBase }.
  //
  // TERRENO: se valúa con el precio de TERRENO (terMin/terMax × m² de terreno).
  // El resto de los tipos = construcción (× m² construidos) + terreno cuando aplica.
  //
  // ZONA (precioEsGenerico): el multiplicador de tier solo se aplica cuando el precio
  // recibido es el estándar de la ciudad. Si la colonia tiene precio propio en
  // colonias.js, la zona ya está dentro del precio y volver a multiplicarla la cuenta
  // dos veces. Se omite → se asume genérico, que es el comportamiento histórico.
  function estimadoAutomatico(d) {
    const tipo = d.tipo;
    const m2c  = +d.m2c || 0;
    const m2t  = +d.m2t || 0;
    const rec  = +d.rec || 0;
    const ban  = +d.ban || 0;
    const caj  = +d.caj || 0;
    const extras = d.extras || [];

    const tier = clasificarTier(d.coloniaNombre);
    const precioEsGenerico = d.precioEsGenerico !== false;
    const multTier = precioEsGenerico ? (MULT_TIER[tier] || 1) : 1;
    const multConservacion = MULT_CONSERVACION[d.conservacion] || 1;

    // ── Terreno: no hay construcción que valuar ──
    // Solo influyen zona y ubicación dentro de la colonia; antigüedad, conservación de
    // construcción, recámaras o acabados no aplican a un predio.
    if (tipo === 'terreno') {
      const multUbic = (d.atributos && MULT_UBICACION[d.atributos.ubicacionEnColonia]) || 1;
      const superficie = m2t > 0 ? m2t : m2c;   // tolera capturas antiguas que usaban m2c
      const base = multTier * multUbic * superficie;
      const totalMin = (+d.terMin || 0) * base;
      const totalMax = (+d.terMax || 0) * base;
      return {
        min: totalMin * (1 - AMPLITUD_ESTIMADO),
        max: totalMax * (1 + AMPLITUD_ESTIMADO),
        mid: (totalMin + totalMax) / 2,
        tier, multTier, precioEsGenerico,
        multBase: base / (superficie || 1),
      };
    }

    const multTipo = MULT_TIPO[tipo] || 1;
    const multAntig = MULT_ANTIG[d.antiguedad] || 1;
    const multPiso = tipo === 'departamento' ? (MULT_PISO[d.nivel] || 1) : 1;

    const bonusRec = Math.max(0, rec - 2) * 0.03;
    const bonusBan = Math.max(0, ban - 1) * 0.02;
    const bonusCaj = caj * 0.04;
    let bonusExtras = 0;
    if (extras.includes('alberca'))    bonusExtras += 0.05;
    if (extras.includes('jardin'))     bonusExtras += 0.03;
    if (extras.includes('vigilancia')) bonusExtras += 0.04;

    // Atributos avanzados (opcionales; solo herramienta interna)
    let multAtrib = 1;
    if (d.atributos) {
      multAtrib *= MULT_CALIDAD[d.atributos.calidadAcabados] || 1;
      multAtrib *= MULT_UBICACION[d.atributos.ubicacionEnColonia] || 1;
      (d.atributos.servicios || []).forEach(s => { multAtrib *= (1 + (BONUS_SERVICIO[s] || 0)); });
    }

    const multBase = multTipo * multAntig * multConservacion * multPiso * multTier * multAtrib *
                     (1 + bonusRec + bonusBan + bonusCaj + bonusExtras);

    const conMin = (+d.conMin || 0) * multBase * m2c;
    const conMax = (+d.conMax || 0) * multBase * m2c;

    let terMin = 0, terMax = 0;
    if ((tipo === 'casa' || tipo === 'local') && m2t > 0) {
      terMin = (+d.terMin || 0) * multConservacion * multTier * m2t;
      terMax = (+d.terMax || 0) * multConservacion * multTier * m2t;
    }

    const totalMin = conMin + terMin;
    const totalMax = conMax + terMax;
    return {
      min: totalMin * (1 - AMPLITUD_ESTIMADO),
      max: totalMax * (1 + AMPLITUD_ESTIMADO),
      mid: (totalMin + totalMax) / 2,
      tier, multTier, precioEsGenerico,
      multBase,
    };
  }

  Legio.valuacion = Object.assign(window.Legio.valuacion || {}, {
    MULT_TIPO, MULT_ANTIG, MULT_CONSERVACION, MULT_PISO, MULT_TIER,
    MULT_CALIDAD, MULT_UBICACION, BONUS_SERVICIO, AMPLITUD_ESTIMADO,
    clasificarTier, estimadoAutomatico,
  });
})();
