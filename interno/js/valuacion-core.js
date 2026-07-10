/* ===== MOTOR DE VALUACIÓN — LEGIO =====
 * Lógica pura (sin DOM). Compartida por el estimador público y la herramienta interna.
 * Expuesta como window.Legio.valuacion para no depender de ES modules (compatible file:// y servidor).
 * Migrar a backend NO requiere tocar este archivo: es lógica de dominio.
 */
(function () {
  window.Legio = window.Legio || {};

  // ── Multiplicadores base (fuente única; antes vivían en estimador.js) ──
  const MULT_TIPO = { casa: 1.00, departamento: 0.85, local: 0.90, terreno: 0.45 };
  const MULT_ANTIG = { nueva: 1.00, reciente: 0.95, media: 0.88, antigua: 0.80 };
  const MULT_CONSERVACION = { excelente: 1.10, buena: 1.00, regular: 0.87, reparaciones: 0.74 };
  const MULT_PISO = { alto: 1.08, medio: 1.00, bajo: 0.93 };
  const MULT_TIER = { premium: 1.25, media: 1.00, popular: 0.82 };

  // Atributos avanzados (solo herramienta interna). TODO Legio: calibrar con datos reales.
  const MULT_CALIDAD = { lujo: 1.14, alta: 1.06, media: 1.00, economica: 0.90 };
  const MULT_UBICACION = { privada: 1.05, avenida: 1.04, esquina: 1.03, interior: 1.00, ruidosa: 0.95 };
  const BONUS_SERVICIO = { areas_verdes: 0.01, gimnasio: 0.02, alberca_comun: 0.02, seguridad: 0.02, casa_club: 0.02, roof_garden: 0.015 };

  // ── Clasificación de zona por nombre de colonia ──
  const TIER_PREMIUM = /campestre|gran jard|country|\bgolf\b|jardines del|jardines de san|cañada del refugio|el molino|puerta (de|del|para)|real provid|hacienda.*(golf|viñedos)|lomas de gran|club hípico|residencial san ángel|santa sofía|punta cañada/i;
  const TIER_POPULAR = /ampliación|fracción|ejido|rancho|granja|predio|comunitaria|obrera|popular|emiliano zapata|18 de marzo|lo de |presa |cañada de |loma de |las peñitas|peñitas/i;

  function clasificarTier(nombre) {
    if (!nombre) return 'media';
    if (TIER_PREMIUM.test(nombre)) return 'premium';
    if (TIER_POPULAR.test(nombre)) return 'popular';
    return 'media';
  }

  // ── Estimado automático ──
  // datos: { tipo, conMin, conMax, terMin, terMax, m2c, m2t, rec, ban, caj,
  //          antiguedad, conservacion, nivel, extras[], coloniaNombre, atributos? }
  // Devuelve { min, mid, max, tier, multBase }. Equivalente a calcular() del estimador público.
  function estimadoAutomatico(d) {
    const tipo = d.tipo;
    const m2c  = +d.m2c || 0;
    const m2t  = +d.m2t || 0;
    const rec  = +d.rec || 0;
    const ban  = +d.ban || 0;
    const caj  = +d.caj || 0;
    const extras = d.extras || [];

    const multTipo = MULT_TIPO[tipo] || 1;
    const multAntig = MULT_ANTIG[d.antiguedad] || 1;
    const multConservacion = MULT_CONSERVACION[d.conservacion] || 1;
    const multPiso = tipo === 'departamento' ? (MULT_PISO[d.nivel] || 1) : 1;
    const tier = clasificarTier(d.coloniaNombre);
    const multTier = MULT_TIER[tier] || 1;

    const bonusRec = tipo !== 'terreno' ? Math.max(0, rec - 2) * 0.03 : 0;
    const bonusBan = tipo !== 'terreno' ? Math.max(0, ban - 1) * 0.02 : 0;
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
      min: totalMin * 0.92,
      max: totalMax * 1.08,
      mid: (totalMin + totalMax) / 2,
      tier,
      multBase,
    };
  }

  // ── Comparativa de mercado (enfoque de comparables) ──
  // Ajusta el precio/m² de un comparable para hacerlo equivalente al sujeto.
  // Si el sujeto es "mejor" en un factor, el comparable sube (+).
  // TODO Legio: calibrar estos porcentajes con transacciones reales.
  function ajustarComparable(sujeto, comp) {
    const precioM2 = (+comp.precio || 0) / (+comp.m2 || 1);

    const adjSuperficie = ((+comp.m2 || 0) - (+sujeto.m2c || 0)) / (+sujeto.m2c || 1) * 0.10; // comp más grande => menor $/m² => sube al comparar
    const adjRec = ((+sujeto.rec || 0) - (+comp.recamaras || 0)) * 0.03;
    const adjBan = ((+sujeto.ban || 0) - (+comp.banos || 0)) * 0.02;
    const adjAntig = (MULT_ANTIG[sujeto.antiguedad] || 1) - (MULT_ANTIG[comp.antiguedad] || 1);
    const adjConsv = (MULT_CONSERVACION[sujeto.conservacion] || 1) - (MULT_CONSERVACION[comp.conservacion] || 1);

    const factores = {
      superficie: adjSuperficie,
      recamaras: adjRec,
      banos: adjBan,
      antiguedad: adjAntig,
      conservacion: adjConsv,
    };
    const netAdj = adjSuperficie + adjRec + adjBan + adjAntig + adjConsv;
    const adjustedM2 = precioM2 * (1 + netAdj);
    return { precioM2, netAdj, adjustedM2, factores };
  }

  // Concilia los comparables ajustados: promedio ponderado (menor ajuste neto => mayor peso).
  function conciliar(comparables, sujeto) {
    const items = (comparables || [])
      .filter(c => (+c.precio > 0) && (+c.m2 > 0))
      .map(c => ajustarComparable(sujeto, c));
    if (!items.length) return { porM2: 0, total: 0, items: [] };

    let sumaPond = 0, sumaPeso = 0;
    items.forEach(it => {
      const peso = 1 / (1 + Math.abs(it.netAdj));
      sumaPond += it.adjustedM2 * peso;
      sumaPeso += peso;
    });
    const porM2 = sumaPeso ? sumaPond / sumaPeso : 0;
    return { porM2, total: porM2 * (+sujeto.m2c || 0), items };
  }

  // ── Valor concluido ──
  // Combina estimado automático + comparables; el override del asesor (con justificación) manda.
  function valorConcluido(estimado, valorComparables, override) {
    let concluido;
    if (override && override.activo && +override.valor > 0) {
      concluido = +override.valor;
    } else if (valorComparables && valorComparables.total > 0) {
      concluido = (estimado.mid + valorComparables.total) / 2;
    } else {
      concluido = estimado.mid;
    }
    return { concluido, min: concluido * 0.95, max: concluido * 1.05, mid: concluido };
  }

  Legio.valuacion = {
    MULT_TIPO, MULT_ANTIG, MULT_CONSERVACION, MULT_PISO, MULT_TIER,
    MULT_CALIDAD, MULT_UBICACION, BONUS_SERVICIO,
    clasificarTier, estimadoAutomatico, ajustarComparable, conciliar, valorConcluido,
  };
})();
