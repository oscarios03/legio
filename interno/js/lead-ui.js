/* ===== FICHA DEL PROSPECTO (CRM) =====
 * Datos + bitácora de seguimiento + acciones rápidas + match de inventario.
 */
(function () {
  const $ = id => document.getElementById(id);
  const U = Legio.util;
  const leadId = new URLSearchParams(location.search).get('id');

  let LEAD = null;
  let ASESORES = [];
  let tipoActividad = 'llamada';

  function msg(texto, tipo) {
    $('msg').innerHTML = `<div class="crm-msg crm-msg--${tipo}">${U.esc(texto)}</div>`;
    setTimeout(() => { $('msg').innerHTML = ''; }, 3500);
  }

  // ---- Pintado ---------------------------------------------------------------
  function pintarEncabezado() {
    $('l-origen').textContent = U.etOrigen(LEAD.origen);
    $('l-nombre').textContent = LEAD.nombre || 'Prospecto sin nombre';
    $('l-avatar').textContent = (LEAD.nombre || '?')[0];

    const partes = [];
    partes.push('Registrado ' + U.haceCuanto(LEAD.created_at));
    if (LEAD.ultimo_contacto_at) partes.push('último contacto ' + U.haceCuanto(LEAD.ultimo_contacto_at));
    else partes.push('sin contactar');
    if (LEAD.asesor) partes.push('asesor: ' + LEAD.asesor.nombre);
    $('l-meta').textContent = partes.join(' · ');

    const tel = LEAD.telefono;
    const btnWA = $('btnWA'), btnTel = $('btnTel'), btnCopiar = $('btnCopiar');
    if (tel) {
      btnWA.href = U.waLink(tel, U.plantillaWA(LEAD));
      btnTel.href = U.telLink(tel);
      [btnWA, btnTel, btnCopiar].forEach(b => b.style.display = '');
    } else {
      [btnWA, btnTel, btnCopiar].forEach(b => b.style.display = 'none');
    }
  }

  function pintarFormulario() {
    $('l-estatus').value = LEAD.estatus || 'nuevo';
    $('l-asesor').value = LEAD.asesor_id || '';
    $('l-seguimiento').value = LEAD.proximo_seguimiento || '';
    $('l-nombre-in').value = LEAD.nombre || '';
    $('l-tel').value = LEAD.telefono || '';
    $('l-email').value = LEAD.email || '';
    $('l-ciudad').value = LEAD.ciudad || '';
    $('l-tipo').value = LEAD.tipo_interes || '';
    $('l-presupuesto').value = LEAD.presupuesto ?? '';
    $('l-mensaje').value = LEAD.mensaje || '(sin mensaje)';
    $('l-notas').value = LEAD.notas || '';
    $('l-propiedad').value = LEAD.propiedad_id || '';
    toggleMotivo();
    if (LEAD.motivo_perdida) $('l-motivo').value = LEAD.motivo_perdida;
  }

  function toggleMotivo() {
    const esPerdido = $('l-estatus').value === 'perdido';
    $('motivoBox').style.display = esPerdido ? '' : 'none';
  }

  function pintarTimeline(actividades) {
    if (!actividades.length) {
      $('timeline').innerHTML = '<p class="int-empty" style="padding:24px 0;">Sin actividad registrada.</p>';
      return;
    }
    $('timeline').innerHTML = '<ul class="tl">' + actividades.map(a => `
      <li class="tl__item tl__item--${a.tipo}">
        <span class="tl__icono">${Legio.ico.actividad(a.tipo)}</span>
        <div class="tl__cuerpo">
          <div class="tl__head">
            <strong>${U.esc(U.etActividad(a.tipo))}</strong>
            <span class="tl__fecha">${U.fmtFechaHora(a.created_at)}</span>
          </div>
          ${a.comentario ? `<p class="tl__texto">${U.esc(a.comentario)}</p>` : ''}
          <span class="tl__autor">${a.asesor ? U.esc(a.asesor.nombre) : 'Sistema'}</span>
        </div>
      </li>`).join('') + '</ul>';
  }

  function pintarDuplicados(dups) {
    if (!dups.length) { $('dupWrap').innerHTML = ''; return; }
    $('dupWrap').innerHTML = `
      <div class="crm-msg crm-msg--warn">
        <strong>Ojo:</strong> hay ${dups.length === 1 ? 'otro prospecto' : dups.length + ' prospectos'} con el mismo teléfono o correo.
        <ul style="margin:6px 0 0 18px;">
          ${dups.map(d => `<li><a href="lead.html?id=${d.id}">${U.esc(d.nombre || 'Sin nombre')}</a>
            — ${U.etOrigen(d.origen)}, ${U.etEstatus(d.estatus)}, ${U.fmtFecha(d.created_at)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function pintarMatch(sugerencias) {
    if (!sugerencias.length) { $('matchCard').style.display = 'none'; return; }
    $('matchCard').style.display = '';
    $('matchWrap').innerHTML = sugerencias.map(p => `
      <div class="match-item">
        ${p.foto_principal_url
          ? `<img class="crm-thumb" src="${U.esc(p.foto_principal_url)}" alt="" />`
          : `<span class="crm-thumb crm-thumb--ph">—</span>`}
        <div class="match-item__info">
          <strong>${U.esc(p.titulo)}</strong>
          <span>${U.etTipo(p.tipo)} · ${U.esc(p.colonia || p.ciudad || '')}</span>
          <span class="match-item__precio">${U.fmtMXN(p.precio)}</span>
        </div>
        <div class="match-item__acciones">
          <button class="btn btn--ghost btn--sm" data-vincular="${p.id}">Vincular</button>
          <button class="btn btn--ghost btn--sm" data-enviar="${p.id}" data-titulo="${U.esc(p.titulo)}">Enviar</button>
        </div>
      </div>`).join('');

    $('matchWrap').querySelectorAll('[data-vincular]').forEach(b => b.addEventListener('click', async () => {
      try {
        await Legio.crm.leads.save({ id: leadId, propiedad_id: b.dataset.vincular });
        LEAD.propiedad_id = b.dataset.vincular;
        $('l-propiedad').value = b.dataset.vincular;
        msg('Propiedad vinculada al prospecto.', 'ok');
      } catch (e) { msg('No se pudo vincular: ' + e.message, 'err'); }
    }));

    // "Enviar" abre WhatsApp con la ficha pública y deja el registro en la bitácora.
    $('matchWrap').querySelectorAll('[data-enviar]').forEach(b => b.addEventListener('click', async () => {
      const link = U.linkPropiedad(b.dataset.enviar);
      const nombre = (LEAD.nombre || '').split(' ')[0];
      const texto = `Hola${nombre ? ' ' + nombre : ''}, te comparto esta propiedad que creo que te puede interesar:\n\n${b.dataset.titulo}\n${link}`;
      window.open(U.waLink(LEAD.telefono, texto), '_blank', 'noopener');
      await registrarActividad('whatsapp', 'Le compartí la propiedad: ' + b.dataset.titulo);
    }));
  }

  // ---- Acciones --------------------------------------------------------------
  async function registrarActividad(tipo, comentario) {
    try {
      await Legio.crm.actividades.add(leadId, tipo, comentario);
      // Un contacto registrado saca al lead de "nuevo" sin que el asesor tenga que acordarse.
      if (LEAD.estatus === 'nuevo' && tipo !== 'nota') {
        await Legio.crm.leads.setEstatus(leadId, 'contactado');
        LEAD.estatus = 'contactado';
        $('l-estatus').value = 'contactado';
      }
      LEAD = await Legio.crm.leads.get(leadId);
      pintarEncabezado();
      pintarTimeline(await Legio.crm.actividades.listByLead(leadId));
    } catch (e) { msg('No se pudo registrar: ' + e.message, 'err'); }
  }

  function conectarEventos() {
    // Tipo de actividad
    $('actTipos').querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
      $('actTipos').querySelectorAll('[data-tipo]').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
      tipoActividad = b.dataset.tipo;
    }));

    $('btnActividad').addEventListener('click', async () => {
      const comentario = $('act-comentario').value.trim();
      $('btnActividad').disabled = true;
      await registrarActividad(tipoActividad, comentario);
      $('act-comentario').value = '';
      $('btnActividad').disabled = false;
      msg('Registrado en la bitácora.', 'ok');
    });

    // Estatus
    $('l-estatus').addEventListener('change', async () => {
      toggleMotivo();
      const estatus = $('l-estatus').value;
      if (estatus === 'perdido' && !$('l-motivo').value) return; // esperamos a que elija motivo
      try {
        await Legio.crm.leads.setEstatus(leadId, estatus, estatus === 'perdido' ? { motivo_perdida: $('l-motivo').value } : {});
        await Legio.crm.actividades.add(leadId, 'sistema', 'Estatus cambiado a: ' + U.etEstatus(estatus));
        LEAD.estatus = estatus;
        if (estatus === 'cerrado' || estatus === 'perdido') $('l-seguimiento').value = '';
        pintarTimeline(await Legio.crm.actividades.listByLead(leadId));
        msg('Estatus actualizado.', 'ok');
      } catch (e) { msg('No se pudo actualizar: ' + e.message, 'err'); }
    });

    $('l-motivo').addEventListener('change', async () => {
      if ($('l-estatus').value !== 'perdido' || !$('l-motivo').value) return;
      try {
        await Legio.crm.leads.setEstatus(leadId, 'perdido', { motivo_perdida: $('l-motivo').value });
        await Legio.crm.actividades.add(leadId, 'sistema', 'Marcado como perdido: ' + $('l-motivo').value);
        pintarTimeline(await Legio.crm.actividades.listByLead(leadId));
        msg('Prospecto marcado como perdido.', 'ok');
      } catch (e) { msg('No se pudo guardar el motivo: ' + e.message, 'err'); }
    });

    // Asesor
    $('l-asesor').addEventListener('change', async () => {
      try {
        await Legio.crm.leads.asignar(leadId, $('l-asesor').value || null);
        const nombre = $('l-asesor').selectedOptions[0].textContent;
        await Legio.crm.actividades.add(leadId, 'sistema', 'Asignado a: ' + nombre);
        pintarTimeline(await Legio.crm.actividades.listByLead(leadId));
        msg('Asesor actualizado.', 'ok');
      } catch (e) { msg('No se pudo asignar: ' + e.message, 'err'); }
    });

    // Próximo seguimiento
    $('l-seguimiento').addEventListener('change', async () => {
      try {
        await Legio.crm.leads.setSeguimiento(leadId, $('l-seguimiento').value || null);
        msg($('l-seguimiento').value ? 'Seguimiento agendado.' : 'Seguimiento quitado.', 'ok');
      } catch (e) { msg('No se pudo agendar: ' + e.message, 'err'); }
    });

    document.querySelectorAll('.lead-chip').forEach(b => b.addEventListener('click', () => {
      const d = b.dataset.dias;
      $('l-seguimiento').value = d === '' ? '' : U.enDias(Number(d));
      $('l-seguimiento').dispatchEvent(new Event('change'));
    }));

    // Datos
    $('btnGuardar').addEventListener('click', async () => {
      $('btnGuardar').disabled = true;
      try {
        await Legio.crm.leads.save({
          id: leadId,
          nombre: $('l-nombre-in').value.trim() || null,
          telefono: $('l-tel').value.trim() || null,
          email: $('l-email').value.trim() || null,
          ciudad: $('l-ciudad').value.trim() || null,
          tipo_interes: $('l-tipo').value || null,
          presupuesto: $('l-presupuesto').value ? Number($('l-presupuesto').value) : null,
          notas: $('l-notas').value.trim() || null,
          propiedad_id: $('l-propiedad').value || null,
        });
        LEAD = await Legio.crm.leads.get(leadId);
        pintarEncabezado();
        await cargarMatch();
        msg('Datos guardados.', 'ok');
      } catch (e) { msg('No se pudo guardar: ' + e.message, 'err'); }
      $('btnGuardar').disabled = false;
    });

    $('btnCopiar').addEventListener('click', async () => {
      const ok = await U.copiar(LEAD.telefono || '');
      msg(ok ? 'Teléfono copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'err');
    });

    // Abrir WhatsApp también deja rastro en la bitácora.
    $('btnWA').addEventListener('click', () => registrarActividad('whatsapp', 'Le escribí por WhatsApp.'));
    $('btnTel').addEventListener('click', () => registrarActividad('llamada', 'Le marqué por teléfono.'));

  }

  async function cargarMatch() {
    try { pintarMatch(await Legio.crm.propiedades.sugerenciasParaLead(LEAD, 5)); }
    catch (e) { /* el match es un extra: si falla, la ficha sigue sirviendo */ }
  }

  // ---- Init ------------------------------------------------------------------
  async function init() {
    if (!(await Legio.crmAuth.requireAuth('index.html'))) return;
    await Legio.shell.montar({ page: 'leads' });
    if (!leadId) { location.replace('leads.html'); return; }

    $('l-motivo').innerHTML = '<option value="">Selecciona un motivo…</option>' +
      U.MOTIVOS_PERDIDA.map(m => `<option value="${U.esc(m)}">${U.esc(m)}</option>`).join('');

    try {
      LEAD = await Legio.crm.leads.get(leadId);
      if (!LEAD) { $('cargando').textContent = 'Prospecto no encontrado.'; return; }

      const [asesores, props, actividades] = await Promise.all([
        Legio.crm.asesores.list(true),
        Legio.crm.propiedades.list(),
        Legio.crm.actividades.listByLead(leadId),
      ]);
      ASESORES = asesores;

      $('l-asesor').innerHTML = '<option value="">Sin asignar</option>' +
        ASESORES.map(a => `<option value="${a.id}">${U.esc(a.nombre || a.email)}</option>`).join('');
      $('l-propiedad').innerHTML = '<option value="">—</option>' +
        props.map(p => `<option value="${p.id}">${U.esc(p.titulo)} — ${U.fmtMXN(p.precio)}</option>`).join('');

      $('cargando').style.display = 'none';
      $('ficha').style.display = '';

      pintarEncabezado();
      pintarFormulario();
      pintarTimeline(actividades);
      conectarEventos();

      cargarMatch();
      Legio.crm.leads.duplicados({ telefono: LEAD.telefono, email: LEAD.email, excluirId: leadId })
        .then(pintarDuplicados).catch(() => {});
    } catch (e) {
      $('cargando').innerHTML = '<div class="crm-msg crm-msg--err">No se pudo cargar: ' + U.esc(e.message) + '</div>';
    }
  }

  init();
})();
