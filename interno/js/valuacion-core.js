/* ===== MOTOR PROFESIONAL DE VALUACIÓN — LEGIO =====
 *
 * EXTIENDE el motor base (../../motor-base.js) con los tres enfoques reconocidos y su
 * conciliación. Lógica pura (sin DOM). Solo lo cargan las páginas de /interno/.
 *
 * El sitio público NO carga este archivo: ahí basta motor-base.js. Así los porcentajes
 * de homologación, los costos de construcción, las tasas de capitalización y el factor
 * de negociación no son descargables por la competencia.
 *
 * Orden de carga obligatorio en cada página de /interno/:
 *   ../calibracion-base.js → ../motor-base.js → js/calibracion.js → js/valuacion-core.js
 *
 * Migrar a backend NO requiere tocar este archivo: es lógica de dominio.
 */
(function () {
  window.Legio = window.Legio || {};

  // Calibración profesional (fuente única, editable): js/calibracion.js.
  // Fallback a defaults si no carga, para que el motor nunca quede sin números.
  const CAL = (window.Legio && window.Legio.calibracion) || {};
  const V   = (window.Legio && window.Legio.valuacion) || {};

  // Del motor base. Si por orden de carga no estuvieran, se usan equivalentes locales.
  const MULT_ANTIG = V.MULT_ANTIG || { nueva: 1.00, reciente: 0.95, media: 0.88, antigua: 0.80 };
  const MULT_CONSERVACION = V.MULT_CONSERVACION || { excelente: 1.10, buena: 1.00, regular: 0.87, reparaciones: 0.74 };
  const MULT_TIER = V.MULT_TIER || { premium: 1.30, media: 1.00, popular: 0.78 };
  const clasificarTier = V.clasificarTier || (() => 'media');

  const HOMOLOGACION = CAL.HOMOLOGACION || { superficie: 0.10, recamara: 0.03, bano: 0.02 };
  const FACTOR_NEGOCIACION = CAL.FACTOR_NEGOCIACION != null ? CAL.FACTOR_NEGOCIACION : 0.06;
  const PLUSVALIA_MENSUAL = CAL.PLUSVALIA_MENSUAL != null ? CAL.PLUSVALIA_MENSUAL : 0.004;
  const DEDUCCIONES_INGRESOS = CAL.DEDUCCIONES_INGRESOS || { vacancia: 0.08, gastos: 0.20 };
  const COSTO_CONSTRUCCION_M2 = CAL.COSTO_CONSTRUCCION_M2 || { economica: 12000, media: 18000, alta: 27000, lujo: 40000 };
  const HEIDECKE = CAL.HEIDECKE || { excelente: 0.00, buena: 0.025, regular: 0.18, reparaciones: 0.52 };
  const VIDA_UTIL_DEFAULT = CAL.VIDA_UTIL_DEFAULT || 60;
  const TASA_CAP = CAL.TASA_CAP || { casa: 5.0, departamento: 5.5, local: 7.5, terreno: 0 };
  const QC = CAL.CALIDAD_MUESTRA || { minComparables: 3, maxAjusteNeto: 0.30, maxCV: 0.15 };

  // ══════════════════════════════════════════════════════════════════
  //  ENFOQUE DE MERCADO (comparables homologados)
  // ══════════════════════════════════════════════════════════════════

  // Meses transcurridos entre la fecha del comparable y hoy (0 si no hay fecha o es futura).
  function mesesDesde(fechaIso) {
    if (!fechaIso) return 0;
    const t = new Date(fechaIso).getTime();
    if (isNaN(t)) return 0;
    const dias = (Date.now() - t) / (1000 * 60 * 60 * 24);
    return dias > 0 ? dias / 30.44 : 0;
  }

  // Homologa el precio/m² de un comparable para hacerlo equivalente al sujeto.
  // Si el sujeto es "mejor" en un factor, el comparable sube (+).
  function ajustarComparable(sujeto, comp) {
    const precioLista = (+comp.precio || 0);
    // Negociación: solo se descuenta a precios de LISTA (portales); los de cierre ya son reales.
    const esLista = (comp.tipoPrecio || 'lista') === 'lista';
    const precioNegociado = esLista ? precioLista * (1 - FACTOR_NEGOCIACION) : precioLista;
    const precioM2 = precioNegociado / (+comp.m2 || 1);

    const adjSuperficie = ((+comp.m2 || 0) - (+sujeto.m2c || 0)) / (+sujeto.m2c || 1) * HOMOLOGACION.superficie; // comp más grande => menor $/m² => sube al comparar
    const adjRec = ((+sujeto.rec || 0) - (+comp.recamaras || 0)) * HOMOLOGACION.recamara;
    const adjBan = ((+sujeto.ban || 0) - (+comp.banos || 0)) * HOMOLOGACION.bano;
    const adjAntig = (MULT_ANTIG[sujeto.antiguedad] || 1) - (MULT_ANTIG[comp.antiguedad] || 1);
    const adjConsv = (MULT_CONSERVACION[sujeto.conservacion] || 1) - (MULT_CONSERVACION[comp.conservacion] || 1);
    // Zona: diferencia de tier entre el sujeto y el comparable (sujeto mejor => comp sube).
    const tierSujeto = clasificarTier(sujeto.coloniaNombre);
    const tierComp = comp.zonaTier || tierSujeto;
    const adjZona = (MULT_TIER[tierSujeto] || 1) - (MULT_TIER[tierComp] || 1);
    // Fecha: plusvalía acumulada desde la publicación/venta hasta hoy (comp antiguo => sube).
    const adjFecha = mesesDesde(comp.fecha) * PLUSVALIA_MENSUAL;

    const factores = {
      superficie: adjSuperficie,
      recamaras: adjRec,
      banos: adjBan,
      antiguedad: adjAntig,
      conservacion: adjConsv,
      zona: adjZona,
      fecha: adjFecha,
    };
    const netAdj = adjSuperficie + adjRec + adjBan + adjAntig + adjConsv + adjZona + adjFecha;
    const adjustedM2 = precioM2 * (1 + netAdj);
    return { precioLista, precioNegociado, esLista, precioM2, netAdj, adjustedM2, factores };
  }

  // Estadística de la muestra homologada: dispersión (CV) para juzgar su calidad.
  function estadisticaComparables(items) {
    const vals = (items || []).map(it => +it.adjustedM2 || 0).filter(v => v > 0);
    const n = vals.length;
    if (!n) return { n: 0, media: 0, desviacion: 0, cv: 0 };
    const media = vals.reduce((a, b) => a + b, 0) / n;
    const varianza = vals.reduce((a, b) => a + (b - media) * (b - media), 0) / n;
    const desviacion = Math.sqrt(varianza);
    return { n, media, desviacion, cv: media ? desviacion / media : 0 };
  }

  // Concilia los comparables homologados: promedio ponderado (menor ajuste neto => mayor peso).
  // Devuelve además estadística de dispersión y alertas de control de calidad para el asesor.
  function conciliar(comparables, sujeto) {
    const items = (comparables || [])
      .filter(c => (+c.precio > 0) && (+c.m2 > 0))
      .map(c => ajustarComparable(sujeto, c));
    if (!items.length) {
      return { porM2: 0, total: 0, items: [], stats: estadisticaComparables([]),
               alertas: ['Sin comparables con precio y m² válidos: el valor de mercado usa el modelo por zona.'] };
    }

    let sumaPond = 0, sumaPeso = 0;
    items.forEach(it => {
      const peso = 1 / (1 + Math.abs(it.netAdj));
      sumaPond += it.adjustedM2 * peso;
      sumaPeso += peso;
    });
    const porM2 = sumaPeso ? sumaPond / sumaPeso : 0;

    const stats = estadisticaComparables(items);
    const alertas = [];
    if (items.length < QC.minComparables) alertas.push('Muestra insuficiente: se recomiendan al menos ' + QC.minComparables + ' comparables (hay ' + items.length + ').');
    const outliers = items.reduce((n, it) => n + (Math.abs(it.netAdj) > QC.maxAjusteNeto ? 1 : 0), 0);
    if (outliers) alertas.push(outliers + ' comparable(s) con ajuste neto mayor a ' + (QC.maxAjusteNeto * 100).toFixed(0) + '%: revisa si realmente son comparables.');
    if (stats.cv > QC.maxCV) alertas.push('Dispersión alta (CV ' + (stats.cv * 100).toFixed(0) + '%): los comparables no son homogéneos; afina la muestra.');

    return { porM2, total: porM2 * (+sujeto.m2c || 0), items, stats, alertas };
  }

  // ══════════════════════════════════════════════════════════════════
  //  ENFOQUE DE COSTO (reposición depreciada + terreno)
  // ══════════════════════════════════════════════════════════════════

  // Depreciación Ross-Heidecke -> fracción depreciada (0..1).
  function depreciacionRossHeidecke(edad, vidaUtil, conservacion) {
    const vu = vidaUtil > 0 ? vidaUtil : VIDA_UTIL_DEFAULT;
    const x = Math.min(1, Math.max(0, (+edad || 0) / vu));
    const ross = 0.5 * (x + x * x);                         // depreciación por edad
    const c = HEIDECKE[conservacion] != null ? HEIDECKE[conservacion] : 0.025;
    return ross + c * (1 - ross);                           // combinada Ross-Heidecke
  }

  // d: { calidadAcabados, m2c, edad, vidaUtil, conservacion, terMin, terMax, m2t, coloniaNombre }
  function enfoqueCosto(d) {
    const costoM2 = COSTO_CONSTRUCCION_M2[d.calidadAcabados] || COSTO_CONSTRUCCION_M2.media;
    const vrn = costoM2 * (+d.m2c || 0);                    // valor de reposición nuevo
    const dep = depreciacionRossHeidecke(d.edad, d.vidaUtil, d.conservacion);
    const construccionDepreciada = vrn * (1 - dep);
    const multTier = MULT_TIER[clasificarTier(d.coloniaNombre)] || 1;
    const terPromedio = ((+d.terMin || 0) + (+d.terMax || 0)) / 2;
    const terreno = terPromedio * multTier * (+d.m2t || 0);
    return { costoM2, vrn, depreciacion: dep, construccionDepreciada, terreno, total: construccionDepreciada + terreno };
  }

  // ══════════════════════════════════════════════════════════════════
  //  ENFOQUE DE INGRESOS (capitalización de rentas NETAS)
  // ══════════════════════════════════════════════════════════════════

  // Capitaliza la renta NETA, no la bruta: se descuenta vacancia y gastos de operación
  // (administración, predial, mantenimiento, seguros). total = renta neta anual / tasa.
  // La tasa debe ser NETA también (ver TASA_CAP en calibracion.js).
  // vacancia/gastos son opcionales (fracción 0..1); si no se pasan, usa la calibración.
  function enfoqueIngresos(d) {
    const rentaBrutaAnual = (+d.rentaMensual || 0) * 12;
    const vacancia = d.vacancia != null ? +d.vacancia : DEDUCCIONES_INGRESOS.vacancia;
    const gastos = d.gastos != null ? +d.gastos : DEDUCCIONES_INGRESOS.gastos;
    const rentaNetaAnual = rentaBrutaAnual * (1 - vacancia) * (1 - gastos);
    const tasa = (+d.tasaCapAnual || 0) / 100;
    return {
      rentaBrutaAnual,
      // 'rentaAnual' se conserva por compatibilidad; ahora refiere a la renta NETA capitalizada.
      rentaAnual: rentaNetaAnual,
      rentaNetaAnual,
      vacancia, gastos,
      tasaCapAnual: +d.tasaCapAnual || 0,
      total: tasa > 0 ? rentaNetaAnual / tasa : 0,
    };
  }

  // Tasa de capitalización sugerida para un tipo de inmueble (%).
  function tasaCapSugerida(tipo) { return TASA_CAP[tipo] != null ? TASA_CAP[tipo] : TASA_CAP.casa; }

  // ══════════════════════════════════════════════════════════════════
  //  CONCILIACIÓN DE LOS TRES ENFOQUES
  // ══════════════════════════════════════════════════════════════════

  /* Promedio ponderado sobre los enfoques efectivamente presentes.
   *
   * Al renormalizar (dividir entre la suma de los pesos que sí entraron), el peso que
   * SE APLICA no es el que capturó el asesor: con 50/30/20 y sin enfoque de ingresos,
   * lo aplicado es 62.5/37.5, no 50/30. `detalle[k].pesoAplicado` es el número que debe
   * imprimir el informe; `peso` es el capturado. Publicar el capturado hace que el
   * documento declare pesos que suman 80% — lo primero que revisa un tercero en un
   * avalúo para garantía hipotecaria o juicio.
   *
   * `omitidos` explica por qué un enfoque no entró, para que el informe pueda decirlo.
   */
  function conciliarEnfoques(valores, pesos) {
    pesos = pesos || { mercado: 0.5, costo: 0.3, ingresos: 0.2 };
    const CLAVES = ['mercado', 'costo', 'ingresos'];

    // 1ª pasada: qué enfoques entran y cuánto pesa el total capturado de esos.
    const presentes = [];
    const omitidos = [];
    CLAVES.forEach(k => {
      const v = +(valores && valores[k]) || 0;
      const p = +(pesos[k]) || 0;
      if (v > 0 && p > 0) presentes.push({ k, v, p });
      else omitidos.push({ enfoque: k, motivo: v > 0 ? 'sin peso asignado' : 'sin datos suficientes' });
    });

    const sumaPeso = presentes.reduce((a, it) => a + it.p, 0);
    if (!sumaPeso) return { valor: 0, detalle: {}, omitidos, sumaPesosCapturados: 0, renormalizado: false };

    // 2ª pasada: peso realmente aplicado = capturado / suma de los que entraron.
    let suma = 0;
    const detalle = {};
    presentes.forEach(({ k, v, p }) => {
      const pesoAplicado = p / sumaPeso;
      suma += v * pesoAplicado;
      detalle[k] = { valor: v, peso: p, pesoAplicado };
    });

    const sumaPesosCapturados = CLAVES.reduce((a, k) => a + (+(pesos[k]) || 0), 0);
    return {
      valor: suma,
      detalle,
      omitidos,
      sumaPesosCapturados,
      // true cuando lo aplicado difiere de lo capturado: el informe debe decirlo.
      renormalizado: Math.abs(sumaPeso - 1) > 1e-9,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  VALOR CONCLUIDO
  // ══════════════════════════════════════════════════════════════════

  /* Valor del enfoque de mercado: los comparables homologados cuando hay muestra
   * válida; si no, el modelo por zona. El estimado por zona se conserva aparte como
   * contraste, no se promedia con los comparables: mezclarlos diluye el enfoque de
   * mercado y vuelve indescifrable el peso real de cada fuente. */
  function valorMercado(estimado, valorComparables) {
    if (valorComparables && valorComparables.total > 0) {
      return { valor: valorComparables.total, fuente: 'comparables' };
    }
    return { valor: (estimado && estimado.mid) || 0, fuente: 'modelo-zona' };
  }

  /* Orquesta el avalúo completo: los tres enfoques, su conciliación y el override.
   *
   * entrada: {
   *   estimado,            // salida de estimadoAutomatico (motor base)
   *   valorComparables,    // salida de conciliar
   *   costo,               // salida de enfoqueCosto (o null)
   *   ingresos,            // salida de enfoqueIngresos (o null)
   *   pesos,               // { mercado, costo, ingresos } capturados por el asesor
   *   override,            // { activo, valor, justificacion }
   * }
   */
  function valorFinal(entrada) {
    const e = entrada || {};
    const mercado = valorMercado(e.estimado, e.valorComparables);
    const valores = {
      mercado: mercado.valor,
      costo: (e.costo && e.costo.total) || 0,
      ingresos: (e.ingresos && e.ingresos.total) || 0,
    };
    const conciliacion = conciliarEnfoques(valores, e.pesos);

    const ov = e.override;
    const usaOverride = !!(ov && ov.activo && +ov.valor > 0);
    const concluido = usaOverride ? +ov.valor : conciliacion.valor;

    return {
      mercado, valores, conciliacion, usaOverride,
      concluido,
      min: concluido * 0.95,
      max: concluido * 1.05,
      mid: concluido,
    };
  }

  /* LEGADO — conciliación de dos enfoques (modelo por zona + comparables).
   * Se conserva para que los avalúos guardados antes de la unificación sigan
   * abriendo y recalculando igual que cuando se emitieron. Los avalúos nuevos usan
   * valorFinal(). No ampliar esta función: si necesitas un enfoque más, va en valorFinal. */
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

  Legio.valuacion = Object.assign(window.Legio.valuacion || {}, {
    COSTO_CONSTRUCCION_M2, HEIDECKE, VIDA_UTIL_DEFAULT, TASA_CAP,
    HOMOLOGACION, FACTOR_NEGOCIACION, PLUSVALIA_MENSUAL, DEDUCCIONES_INGRESOS,
    mesesDesde, ajustarComparable, estadisticaComparables, conciliar,
    depreciacionRossHeidecke, enfoqueCosto, enfoqueIngresos, tasaCapSugerida,
    conciliarEnfoques, valorMercado, valorFinal, valorConcluido,
  });
})();
