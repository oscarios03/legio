/* ===== GESTIÓN DE ASESORES (solo admin) ===== */
(function () {
  const $ = id => document.getElementById(id);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function msg(t, tipo){ $('msg').innerHTML = `<div class="crm-msg crm-msg--${tipo}">${esc(t)}</div>`; setTimeout(()=>{ $('msg').innerHTML=''; }, 3000); }

  let YO = null;

  async function cargar() {
    try {
      const asesores = await Legio.crm.asesores.list();
      render(asesores);
    } catch (e) {
      $('listWrap').innerHTML = '<div class="int-card crm-msg crm-msg--err">No se pudieron cargar: ' + esc(e.message) + '</div>';
    }
  }

  function render(asesores) {
    if (!asesores.length) { $('listWrap').innerHTML = '<div class="int-card int-empty">Aún no hay asesores. Crea usuarios en Supabase y aparecerán aquí al iniciar sesión.</div>'; return; }
    $('listWrap').innerHTML =
      '<div class="tabla-scroll"><table class="int-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Activo</th><th title="Entra en el reparto automático de leads del sitio">Recibe leads</th><th></th></tr></thead><tbody>' +
      asesores.map(a => `<tr data-row="${a.id}">
        <td><input type="text" data-f="nombre" value="${esc(a.nombre||'')}" class="tbl-input--md" /></td>
        <td style="color:var(--gray);font-size:.85rem;">${esc(a.email||'—')}</td>
        <td><input type="text" data-f="telefono" value="${esc(a.telefono||'')}" class="tbl-input--sm" /></td>
        <td>
          <select data-f="rol" ${a.id===(YO&&YO.id)?'disabled title="No puedes cambiar tu propio rol"':''}>
            <option value="asesor" ${a.rol==='asesor'?'selected':''}>Asesor</option>
            <option value="admin" ${a.rol==='admin'?'selected':''}>Admin</option>
          </select>
        </td>
        <td><input type="checkbox" data-f="activo" ${a.activo?'checked':''} ${a.id===(YO&&YO.id)?'disabled':''} /></td>
        <td><input type="checkbox" data-f="recibe_leads" ${a.recibe_leads!==false?'checked':''} /></td>
        <td><button class="btn btn--gold btn--sm" data-save="${a.id}">Guardar</button></td>
      </tr>`).join('') +
      '</tbody></table></div>';

    $('listWrap').querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
      const tr = btn.closest('[data-row]');
      const obj = { id: btn.dataset.save };
      obj.nombre   = tr.querySelector('[data-f="nombre"]').value.trim();
      obj.telefono = tr.querySelector('[data-f="telefono"]').value.trim() || null;
      obj.rol      = tr.querySelector('[data-f="rol"]').value;
      obj.activo   = tr.querySelector('[data-f="activo"]').checked;
      obj.recibe_leads = tr.querySelector('[data-f="recibe_leads"]').checked;
      // No permitir que el admin se quite su propio rol/acceso.
      if (YO && obj.id === YO.id) { obj.rol = 'admin'; obj.activo = true; }
      try { await Legio.crm.asesores.save(obj); msg('Guardado.', 'ok'); }
      catch (e) { msg('No se pudo guardar: ' + e.message, 'err'); }
    }));
  }

  $('btnLogout').addEventListener('click', async () => { await Legio.crmAuth.logout(); location.replace('index.html'); });

  async function init() {
    if (!(await Legio.crmAuth.requireAdmin('index.html'))) return;
    YO = await Legio.crmAuth.currentAsesor();
    cargar();
  }

  init();
})();
