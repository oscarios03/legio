/* ===== CALIBRACIÓN PROFESIONAL — LEGIO (fuente única, editable) =====
 *
 * EXTIENDE Legio.calibracionBase (../../calibracion-base.js) con todo lo que NO debe
 * salir del sitio público. Solo lo cargan las páginas de /interno/.
 *
 * Todos los números "de mercado" viven aquí para que Legio los actualice SIN tocar la
 * lógica. valuacion-core.js los lee con fallback a sus defaults: si este archivo no
 * carga, el motor sigue funcionando con valores por defecto.
 *
 * ÚLTIMA ACTUALIZACIÓN: 2026-08 · Valores benchmark 2025-2026 (afinar con datos de Legio).
 * Fuentes: opus-planet.mx y navarretearquitectos.com (costo de construcción/m²),
 * creasoluciones.com.mx e inmuebles24.com (tasas de capitalización).
 */
(function () {
  window.Legio = window.Legio || {};
  const BASE = window.Legio.calibracionBase || {};

  // ── Costo de construcción nuevo por m² (reposición, incluye indirectos), MXN/m² ──
  const COSTO_CONSTRUCCION_M2 = { economica: 12000, media: 18000, alta: 27000, lujo: 40000 };

  // ── Tasa de capitalización anual por tipo (%) — enfoque de ingresos ──
  //
  // ⚠️ Son tasas NETAS: se aplican sobre la renta ya descontada de vacancia y gastos
  //    (ver DEDUCCIONES_INGRESOS). Mezclar una tasa bruta con renta neta es el error
  //    clásico que hunde el enfoque de ingresos.
  //
  //    La vivienda en México renta con rendimiento bajo respecto a su precio de venta
  //    (4-5% bruto es normal). Capitalizar renta neta al 7% —tasa de inmueble
  //    comercial— hacía que el enfoque de ingresos indicara ~52% del valor de mercado
  //    y arrastrara el avalúo hacia abajo. El comercial sí sostiene tasas más altas.
  const TASA_CAP = { casa: 5.0, departamento: 5.5, local: 7.5, terreno: 0 };

  // ── Deducciones para el enfoque de ingresos (renta bruta → renta neta) ──
  // vacancia = desocupación esperada; gastos = administración + predial + mantenimiento + seguros.
  const DEDUCCIONES_INGRESOS = { vacancia: 0.08, gastos: 0.20 };

  // ── Pesos de conciliación por tipo de inmueble ──
  //
  // El enfoque de ingresos NO es un indicador principal de valor en vivienda de uso
  // propio: se captura como referencia, pero no debe mover el valor por sí solo. Por eso
  // entra con peso 0 en casa y departamento, y el asesor decide si se lo asigna.
  // Sin esto, el asesor que se toma la molestia de investigar la renta obtiene un
  // avalúo más bajo que el que no la captura — castigar el rigor es inaceptable.
  const PESOS_DEFAULT = {
    casa:         { mercado: 0.70, costo: 0.30, ingresos: 0.00 },
    departamento: { mercado: 0.70, costo: 0.30, ingresos: 0.00 },
    local:        { mercado: 0.50, costo: 0.20, ingresos: 0.30 },
    terreno:      { mercado: 1.00, costo: 0.00, ingresos: 0.00 },
  };

  // Coeficiente de Heidecke por estado de conservación (0 = nuevo, 1 = sin valor).
  const HEIDECKE = { excelente: 0.00, buena: 0.025, regular: 0.18, reparaciones: 0.52 };

  // Vida útil total de referencia para la depreciación por edad (años).
  const VIDA_UTIL_DEFAULT = 60;

  // ── Homologación de comparables (% de ajuste por diferencia frente al sujeto) ──
  const HOMOLOGACION = { superficie: 0.10, recamara: 0.03, bano: 0.02 };

  // ── Factor de negociación (lista → cierre) ──
  // Los portales publican precio de LISTA; el cierre real suele ser menor. Se descuenta
  // este % solo a comparables marcados como "lista" (no a los de "cierre").
  const FACTOR_NEGOCIACION = 0.06;

  // ── Plusvalía mensual (ajuste por fecha del comparable) ──
  // Trae el precio de un comparable pasado a valor de HOY. 0.004/mes ≈ 4.9% anual.
  const PLUSVALIA_MENSUAL = 0.004;

  // ── Control de calidad de la muestra de comparables ──
  const CALIDAD_MUESTRA = {
    minComparables: 3,      // mínimo recomendado
    maxAjusteNeto: 0.30,    // ajuste neto por encima del cual el comparable es sospechoso
    maxCV: 0.15,            // coeficiente de variación por encima del cual la muestra es dispersa
  };

  Legio.calibracion = Object.assign({}, BASE, {
    ULTIMA_ACTUALIZACION: '2026-08',
    COSTO_CONSTRUCCION_M2, TASA_CAP, DEDUCCIONES_INGRESOS, PESOS_DEFAULT,
    HEIDECKE, VIDA_UTIL_DEFAULT,
    HOMOLOGACION, FACTOR_NEGOCIACION, PLUSVALIA_MENSUAL, CALIDAD_MUESTRA,

    // Pesos sugeridos para un tipo de inmueble; cae a los de casa si el tipo es desconocido.
    pesosSugeridos(tipo) { return { ...(PESOS_DEFAULT[tipo] || PESOS_DEFAULT.casa) }; },
  });
})();
