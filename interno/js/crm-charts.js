/* ===== GRÁFICAS DEL PANEL — LEGIO =====
 * SVG a mano, sin librerías: son tres formas y así el panel no depende de un CDN
 * ni pesa 300 KB para dibujar treinta números.
 *
 * API: Legio.chart.puntos()  — área de puntos (evolución en el tiempo)
 *      Legio.chart.panal()   — panal de hexágonos (reparto por categoría)
 *      Legio.chart.delta()   — píldora de variación contra el periodo anterior
 *      Legio.chart.PALETA    — colores de serie (marca Legio)
 */
(function () {
  window.Legio = window.Legio || {};

  // Serie cromática: navy y oro de la marca + dos apoyos que conviven con ellos.
  const PALETA = ['#1B2B5E', '#C9A84C', '#2E7D6F', '#6B4E9B', '#8C5A3C', '#4A6FB5'];
  const GRIS = '#E4E7EF';

  let _id = 0;
  const uid = () => 'lg' + (++_id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  /* Redondea el techo del eje a una cifra legible (10, 25, 50, 100…). */
  function techo(max) {
    if (max <= 4) return 4;
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / mag;
    const paso = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return paso * mag;
  }

  /* ---------------------------------------------------------------------------
   * ÁREA DE PUNTOS
   * datos: [{ fecha:'YYYY-MM-DD', n:Number }, …]
   * opts:  { color, fmtEje, altoFilas }
   * La serie se remuestrea a ~90 columnas de puntos: así el relleno se ve denso
   * aunque el periodo tenga 30 días.
   * ------------------------------------------------------------------------ */
  function puntos(datos, opts) {
    opts = opts || {};
    if (!datos.length) return '<p class="int-empty" style="padding:28px 0;">Sin datos en el periodo.</p>';

    const color = opts.color || PALETA[1];
    // La retícula es fija y la serie se remuestrea sobre ella: si el número de
    // columnas dependiera de los datos, la proporción del SVG cambiaría con
    // ellos y la gráfica crecería a lo alto en los periodos cortos.
    const filas = opts.altoFilas || 24;
    const cols  = opts.cols || 68;
    const G = 7;      // paso de la retícula
    const R = 2.05;   // radio del punto
    const w = cols * G, h = filas * G;

    const max = techo(Math.max(...datos.map(d => d.n), 1));
    const valorEn = i => {
      // Remuestreo lineal de la serie original sobre la retícula de puntos.
      const t = datos.length === 1 ? 0 : (i / (cols - 1)) * (datos.length - 1);
      const a = Math.floor(t), b = Math.min(datos.length - 1, a + 1);
      return datos[a].n + (datos[b].n - datos[a].n) * (t - a);
    };

    const id = uid();
    let dots = '';
    for (let i = 0; i < cols; i++) {
      const llenas = Math.round((valorEn(i) / max) * filas);
      for (let j = 0; j < llenas; j++) {
        dots += `<circle cx="${(i * G + G / 2).toFixed(1)}" cy="${(h - j * G - G / 2).toFixed(1)}" r="${R}"/>`;
      }
    }

    // Los ejes van en HTML, no dentro del SVG: así el texto conserva su tamaño
    // aunque la gráfica se estire para llenar la tarjeta.
    const fmt = opts.fmtEje || (v => String(v));
    const ejeY = [max, max / 2, 0].map(v => `<span>${esc(fmt(v))}</span>`).join('');

    const et = i => etiquetaFecha(datos[i].fecha);
    const medio = Math.floor((datos.length - 1) / 2);
    const ejeX = datos.length < 3
      ? `<span>${esc(et(0))}</span>`
      : `<span>${esc(et(0))}</span><span>${esc(et(medio))}</span><span>${esc(et(datos.length - 1))}</span>`;

    return `<div class="dotwrap">
      <div class="dotwrap__y">${ejeY}</div>
      <div class="dotwrap__plot">
        <svg class="dotchart" viewBox="0 0 ${w} ${h}" role="img">
          <defs>
            <pattern id="${id}" width="${G}" height="${G}" patternUnits="userSpaceOnUse">
              <circle cx="${G / 2}" cy="${G / 2}" r="${R}" fill="${GRIS}"/>
            </pattern>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id})"/>
          <g fill="${color}">${dots}</g>
        </svg>
      </div>
      <div class="dotwrap__x">${ejeX}</div>
    </div>`;
  }

  function etiquetaFecha(iso) {
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  /* ---------------------------------------------------------------------------
   * PANAL DE HEXÁGONOS
   * partes: [{ et, n, color }, …]
   *
   * La rejilla completa se dibuja en gris y el reparto se colorea sobre una
   * elipse central. Cada categoría crece desde su propia semilla (repartidas
   * alrededor del centro), de modo que se lee como grupos vecinos y no como
   * anillos concéntricos: la proporción se ve en el tamaño de cada mancha.
   * ------------------------------------------------------------------------ */
  function panal(partes, opts) {
    opts = opts || {};
    const total = partes.reduce((s, x) => s + x.n, 0);
    if (!total) return '<p class="int-empty" style="padding:28px 0;">Sin datos en el periodo.</p>';

    const R = 8;                                  // radio del hexágono
    const anchoHex = Math.sqrt(3) * R;
    const cols = 21, filas = 9;                   // rejilla ancha y baja
    const w = anchoHex * cols + anchoHex / 2 + 8;
    const h = 1.5 * R * (filas - 1) + 2 * R + 8;
    const cx0 = w / 2, cy0 = h / 2;

    const celdas = [];
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < cols; c++) {
        celdas.push({
          cx: 4 + anchoHex * (c + (f % 2 ? 1 : 0.5)) + anchoHex / 2,
          cy: 4 + R + 1.5 * R * f,
        });
      }
    }

    // La mancha de color ocupa una elipse; el resto de la rejilla queda en gris.
    const dentro = celdas.filter(z =>
      Math.pow((z.cx - cx0) / (w * 0.40), 2) + Math.pow((z.cy - cy0) / (h * 0.44), 2) <= 1);

    const libres = dentro.slice();
    repartir(partes, total, dentro.length).forEach((cuantas, i) => {
      const ang = (i / partes.length) * Math.PI * 2 - Math.PI / 2;
      const sx = cx0 + Math.cos(ang) * w * 0.20;
      const sy = cy0 + Math.sin(ang) * h * 0.24;
      const color = partes[i].color || PALETA[i % PALETA.length];
      // Toma siempre la celda libre más cercana a su semilla: la mancha crece compacta.
      for (let j = 0; j < cuantas && libres.length; j++) {
        let mejor = 0, dm = Infinity;
        for (let x = 0; x < libres.length; x++) {
          const d = Math.pow(libres[x].cx - sx, 2) + Math.pow(libres[x].cy - sy, 2);
          if (d < dm) { dm = d; mejor = x; }
        }
        libres[mejor].color = color;
        libres.splice(mejor, 1);
      }
    });

    const hex = ({ cx, cy, color }) => {
      const a = anchoHex / 2;
      return `<path d="M${cx.toFixed(1)},${(cy - R).toFixed(1)} l${a.toFixed(1)},${(R / 2).toFixed(1)} ` +
             `l0,${R.toFixed(1)} l${(-a).toFixed(1)},${(R / 2).toFixed(1)} l${(-a).toFixed(1)},${(-R / 2).toFixed(1)} ` +
             `l0,${(-R).toFixed(1)} Z" fill="${color || GRIS}"/>`;
    };

    return `<svg class="hexchart" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" role="img">
      ${celdas.map(hex).join('')}
    </svg>`;
  }

  /* Reparte `celdas` entre las partes por resto mayor: la suma cuadra exacto y
   * ninguna categoría con datos se queda sin un solo hexágono. */
  function repartir(partes, total, celdas) {
    const exactos = partes.map(p => (p.n / total) * celdas);
    const base = exactos.map(x => Math.max(p_min(x), Math.floor(x)));
    let sobran = celdas - base.reduce((s, n) => s + n, 0);
    const orden = exactos.map((x, i) => ({ i, resto: x - Math.floor(x) }))
      .sort((a, b) => b.resto - a.resto);
    for (let k = 0; sobran > 0; k++, sobran--) base[orden[k % orden.length].i]++;
    return base;
  }
  const p_min = x => (x > 0 ? 1 : 0);

  /* ---------------------------------------------------------------------------
   * PÍLDORA DE VARIACIÓN
   * delta(actual, previo, { fmt, invertir, sufijo })
   * `invertir` para métricas donde bajar es bueno (tiempo de respuesta).
   * ------------------------------------------------------------------------ */
  function delta(actual, previo, opts) {
    opts = opts || {};
    const ico = Legio.ico ? Legio.ico.svg : () => '';
    if (previo == null || actual == null || !isFinite(previo) || !isFinite(actual)) {
      return '<span class="delta delta--igual">Sin comparativa</span>';
    }
    const dif = actual - previo;
    const casi = Math.abs(dif) < (opts.epsilon || 0.0001);
    const mejor = opts.invertir ? dif < 0 : dif > 0;
    const clase = casi ? 'igual' : (mejor ? 'sube' : 'baja');
    const flecha = casi ? 'igual' : (dif > 0 ? 'sube' : 'baja');
    const texto = casi ? 'Sin cambio'
      : (dif > 0 ? '+' : '−') + (opts.fmt ? opts.fmt(Math.abs(dif)) : Math.abs(dif));
    return `<span class="delta delta--${clase}"><span class="delta__ico">${ico(flecha)}</span>${esc(texto)}</span>`;
  }

  window.Legio.chart = { puntos, panal, delta, PALETA, GRIS };
})();
