-- ============================================================================
-- LEGIO INMOBILIARIA — Migración v2 del CRM (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Agrega sobre la base de `supabase-migracion.sql`:
--   1. Bitácora de seguimiento por lead   (tabla lead_actividades)
--   2. Campos de seguimiento en leads     (próximo contacto, motivo de pérdida…)
--   3. Asignación automática round-robin de los leads que entran del sitio
--   4. Anti-spam en el alta anónima de leads
--   5. Avalúos compartidos por el equipo  (tabla avaluos)
--   6. Seguridad: el asesor solo edita lo suyo y las comisiones quedan
--      protegidas a nivel de base (no solo escondidas en la interfaz)
--
-- Cómo usar: SQL Editor → New query → pega TODO → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- Requiere haber corrido antes `supabase-migracion.sql`.
-- ============================================================================


-- ============================================================================
-- 1. ASESORES: quién entra a la rotación de leads
-- ============================================================================
alter table public.asesores add column if not exists recibe_leads boolean not null default true;

comment on column public.asesores.recibe_leads is
  'Si está activo, el asesor entra en el reparto automático de leads del sitio.';


-- ============================================================================
-- 2. LEADS: campos de seguimiento
-- ============================================================================
alter table public.leads add column if not exists proximo_seguimiento date;
alter table public.leads add column if not exists ultimo_contacto_at   timestamptz;
alter table public.leads add column if not exists motivo_perdida       text;
alter table public.leads add column if not exists presupuesto          numeric;
alter table public.leads add column if not exists tipo_interes         text;
alter table public.leads add column if not exists valor_estimado       numeric;
alter table public.leads add column if not exists notas                text;
alter table public.leads add column if not exists updated_at           timestamptz not null default now();

comment on column public.leads.proximo_seguimiento is 'Fecha en que el asesor debe volver a contactar. Alimenta el panel de pendientes.';
comment on column public.leads.motivo_perdida      is 'Obligatorio al marcar el lead como perdido.';
comment on column public.leads.valor_estimado      is 'Valor central que arrojó el estimador público, si el lead vino de ahí.';
comment on column public.leads.notas               is 'Notas internas del asesor sobre el prospecto.';

-- El origen ahora admite también referidos y portales inmobiliarios.
alter table public.leads drop constraint if exists leads_origen_check;
alter table public.leads add  constraint leads_origen_check
  check (origen in ('form','estimador','whatsapp','manual','referido','portal'));

create index if not exists idx_leads_seguimiento on public.leads(proximo_seguimiento)
  where estatus not in ('cerrado','perdido');
create index if not exists idx_leads_telefono on public.leads(telefono);
create index if not exists idx_leads_email    on public.leads(lower(email));
create index if not exists idx_leads_propiedad on public.leads(propiedad_id);

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 3. LEAD_ACTIVIDADES: la bitácora de seguimiento
-- ============================================================================
create table if not exists public.lead_actividades (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  asesor_id  uuid references public.asesores(id),
  tipo       text not null default 'nota'
               check (tipo in ('llamada','whatsapp','email','cita','visita','nota','sistema')),
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists idx_act_lead on public.lead_actividades(lead_id, created_at desc);

-- Cada actividad registrada actualiza la fecha de último contacto del lead.
create or replace function public.lead_touch_contacto() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if new.tipo in ('llamada','whatsapp','email','cita','visita') then
      update public.leads
         set ultimo_contacto_at = greatest(coalesce(ultimo_contacto_at, new.created_at), new.created_at)
       where id = new.lead_id;
    end if;
    return new;
  end
$$;

drop trigger if exists trg_act_touch_lead on public.lead_actividades;
create trigger trg_act_touch_lead after insert on public.lead_actividades
  for each row execute function public.lead_touch_contacto();


-- ============================================================================
-- 4. AVALÚOS compartidos (antes vivían solo en el navegador del asesor)
-- ============================================================================
create table if not exists public.avaluos (
  id         uuid primary key default gen_random_uuid(),
  folio      text unique,
  asesor_id  uuid references public.asesores(id) default auth.uid(),
  lead_id    uuid references public.leads(id) on delete set null,
  cliente    text,
  ciudad     text,
  concluido  numeric,
  datos      jsonb not null default '{}'::jsonb,   -- el avalúo completo, tal cual lo arma la herramienta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_avaluos_asesor on public.avaluos(asesor_id);
create index if not exists idx_avaluos_lead   on public.avaluos(lead_id);

drop trigger if exists trg_avaluos_touch on public.avaluos;
create trigger trg_avaluos_touch before update on public.avaluos
  for each row execute function public.touch_updated_at();

-- Folio consecutivo por año: LEGIO-2026-0001
create sequence if not exists public.avaluo_folio_seq;

create or replace function public.avaluo_folio() returns trigger
  language plpgsql as $$
  begin
    if new.folio is null or new.folio = '' then
      new.folio := 'LEGIO-' || to_char(now(), 'YYYY') || '-' ||
                   lpad(nextval('public.avaluo_folio_seq')::text, 4, '0');
    end if;
    return new;
  end
$$;

drop trigger if exists trg_avaluo_folio on public.avaluos;
create trigger trg_avaluo_folio before insert on public.avaluos
  for each row execute function public.avaluo_folio();


-- ============================================================================
-- 5. ANTI-SPAM del alta anónima de leads
--    Los formularios del sitio insertan como `anon`. Aquí se filtra la basura
--    antes de que llegue a la tabla.
-- ============================================================================
create or replace function public.lead_antispam() returns trigger
  language plpgsql security definer set search_path = public as $$
  declare
    v_texto   text;
    v_recientes int;
  begin
    -- Solo aplica al alta anónima (los leads que captura el equipo van directos).
    if auth.uid() is not null then return new; end if;

    -- Debe traer al menos una forma de contacto.
    if coalesce(new.telefono, '') = '' and coalesce(new.email, '') = '' then
      raise exception 'Se requiere teléfono o correo.';
    end if;

    -- Nombres kilométricos y enlaces son la firma del bot.
    if length(coalesce(new.nombre, '')) > 80 then
      raise exception 'Nombre inválido.';
    end if;
    v_texto := lower(coalesce(new.nombre, '') || ' ' || coalesce(new.mensaje, ''));
    if v_texto ~ '(https?://|\[url|\[link|<a\s)' then
      raise exception 'Contenido no permitido.';
    end if;

    -- Freno por ráfaga: mismo teléfono o correo más de 3 veces en 10 minutos.
    select count(*) into v_recientes
      from public.leads
     where created_at > now() - interval '10 minutes'
       and ( (new.telefono is not null and telefono = new.telefono)
          or (new.email    is not null and lower(email) = lower(new.email)) );
    if v_recientes >= 3 then
      raise exception 'Demasiadas solicitudes. Intenta más tarde.';
    end if;

    -- El visitante no decide su estatus ni su asesor.
    new.estatus := 'nuevo';
    new.asesor_id := null;
    if new.origen not in ('form','estimador','whatsapp') then new.origen := 'form'; end if;

    return new;
  end
$$;

drop trigger if exists trg_lead_antispam on public.leads;
create trigger trg_lead_antispam before insert on public.leads
  for each row execute function public.lead_antispam();


-- ============================================================================
-- 6. ASIGNACIÓN AUTOMÁTICA (round-robin) de los leads del sitio
--    Se le da al asesor activo con menos leads recibidos en los últimos 30 días.
--    Corre DESPUÉS del antispam (orden alfabético de triggers: antispam < asignar).
-- ============================================================================
create or replace function public.lead_auto_asignar() returns trigger
  language plpgsql security definer set search_path = public as $$
  declare v_asesor uuid;
  begin
    -- Alta desde el CRM (hay sesión) o ya viene asignado: no tocar.
    if auth.uid() is not null or new.asesor_id is not null then return new; end if;

    select a.id into v_asesor
      from public.asesores a
      left join public.leads l
        on l.asesor_id = a.id
       and l.created_at > now() - interval '30 days'
     where a.activo and a.recibe_leads
     group by a.id
     order by count(l.id) asc, random()
     limit 1;

    new.asesor_id := v_asesor;   -- si no hay nadie disponible queda sin asignar
    return new;
  end
$$;

drop trigger if exists trg_lead_asignar on public.leads;
create trigger trg_lead_asignar before insert on public.leads
  for each row execute function public.lead_auto_asignar();

-- Deja rastro en la bitácora de cómo llegó el lead.
create or replace function public.lead_actividad_alta() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    insert into public.lead_actividades (lead_id, asesor_id, tipo, comentario)
    values (new.id, new.asesor_id, 'sistema',
            'Lead creado desde: ' || new.origen ||
            case when new.asesor_id is not null and auth.uid() is null
                 then ' · asignado automáticamente' else '' end);
    return new;
  end
$$;

drop trigger if exists trg_lead_actividad_alta on public.leads;
create trigger trg_lead_actividad_alta after insert on public.leads
  for each row execute function public.lead_actividad_alta();


-- ============================================================================
-- 7. PROTECCIÓN DE COMISIONES A NIVEL DE BASE
--    Hasta ahora los campos de comisión solo se ocultaban en la interfaz: un
--    asesor con la consola del navegador podía escribirlos. Este trigger los
--    congela para todo el que no sea admin.
-- ============================================================================
alter table public.propiedades alter column created_by set default auth.uid();

create or replace function public.propiedad_protege_comision() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if public.is_admin() then return new; end if;

    if tg_op = 'INSERT' then
      new.comision_pct          := null;
      new.comision_captador_pct := null;
      new.comision_vendedor_pct := null;
      new.precio_venta_final    := null;
      new.fecha_venta           := null;
    else
      new.comision_pct          := old.comision_pct;
      new.comision_captador_pct := old.comision_captador_pct;
      new.comision_vendedor_pct := old.comision_vendedor_pct;
      new.precio_venta_final    := old.precio_venta_final;
      new.fecha_venta           := old.fecha_venta;
    end if;
    return new;
  end
$$;

drop trigger if exists trg_prop_comision on public.propiedades;
create trigger trg_prop_comision before insert or update on public.propiedades
  for each row execute function public.propiedad_protege_comision();


-- ============================================================================
-- 8. ROW LEVEL SECURITY — cada quien ve y edita lo suyo
-- ============================================================================
alter table public.lead_actividades enable row level security;
alter table public.avaluos          enable row level security;

-- ---- PROPIEDADES: todos leen; solo el dueño (o admin) edita -----------------
drop policy if exists prop_auth_upd  on public.propiedades;
drop policy if exists prop_admin_del on public.propiedades;

-- Puede editar: admin, el captador, el vendedor, quien la dio de alta,
-- o cualquiera si la propiedad todavía no tiene dueño.
create policy prop_auth_upd on public.propiedades
  for update to authenticated
  using (
    public.is_admin()
    or asesor_captador_id = auth.uid()
    or asesor_vendedor_id = auth.uid()
    or created_by = auth.uid()
    or (asesor_captador_id is null and asesor_vendedor_id is null)
  )
  with check (true);

create policy prop_admin_del on public.propiedades
  for delete to authenticated using (public.is_admin());

-- ---- LEADS: el asesor ve los suyos y los que están sin asignar --------------
drop policy if exists leads_auth_sel on public.leads;
drop policy if exists leads_auth_wr  on public.leads;
drop policy if exists leads_auth_upd on public.leads;
drop policy if exists leads_auth_ins on public.leads;
drop policy if exists leads_admin_del on public.leads;

create policy leads_auth_sel on public.leads
  for select to authenticated
  using (public.is_admin() or asesor_id = auth.uid() or asesor_id is null);

create policy leads_auth_ins on public.leads
  for insert to authenticated with check (true);

create policy leads_auth_upd on public.leads
  for update to authenticated
  using (public.is_admin() or asesor_id = auth.uid() or asesor_id is null)
  with check (true);

create policy leads_admin_del on public.leads
  for delete to authenticated using (public.is_admin());

-- ---- LEAD_ACTIVIDADES: se ven las del lead que puedes ver -------------------
drop policy if exists act_auth_sel on public.lead_actividades;
drop policy if exists act_auth_ins on public.lead_actividades;
drop policy if exists act_admin_del on public.lead_actividades;

create policy act_auth_sel on public.lead_actividades
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

create policy act_auth_ins on public.lead_actividades
  for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id));

create policy act_admin_del on public.lead_actividades
  for delete to authenticated using (public.is_admin());

-- ---- AVALÚOS: los ve el equipo, los edita su autor (o el admin) ------------
drop policy if exists av_auth_sel on public.avaluos;
drop policy if exists av_auth_ins on public.avaluos;
drop policy if exists av_auth_upd on public.avaluos;
drop policy if exists av_auth_del on public.avaluos;

create policy av_auth_sel on public.avaluos for select to authenticated using (true);
create policy av_auth_ins on public.avaluos for insert to authenticated
  with check (asesor_id = auth.uid() or public.is_admin());
create policy av_auth_upd on public.avaluos for update to authenticated
  using (asesor_id = auth.uid() or public.is_admin()) with check (true);
create policy av_auth_del on public.avaluos for delete to authenticated
  using (asesor_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 9. AVISO DE LEAD NUEVO POR CORREO  (opcional — requiere Edge Function)
--    Descomenta este bloque DESPUÉS de desplegar la función `notificar-lead`
--    (ver supabase/functions/notificar-lead/index.ts y CRM-LEEME.md).
-- ============================================================================
-- create extension if not exists pg_net with schema extensions;
--
-- create table if not exists public.crm_config (
--   clave text primary key,
--   valor text not null
-- );
-- alter table public.crm_config enable row level security;   -- nadie la lee desde el navegador
--
-- -- Guarda aquí la URL de la función y la anon key del proyecto:
-- --   insert into public.crm_config values
-- --     ('notificar_url', 'https://TU-PROYECTO.supabase.co/functions/v1/notificar-lead'),
-- --     ('notificar_key', 'eyJ...tu-anon-key...')
-- --   on conflict (clave) do update set valor = excluded.valor;
--
-- create or replace function public.lead_notificar() returns trigger
--   language plpgsql security definer set search_path = public, extensions as $$
--   declare v_url text; v_key text;
--   begin
--     select valor into v_url from public.crm_config where clave = 'notificar_url';
--     select valor into v_key from public.crm_config where clave = 'notificar_key';
--     if v_url is null then return new; end if;
--     perform net.http_post(
--       url     := v_url,
--       headers := jsonb_build_object('Content-Type','application/json',
--                                     'Authorization','Bearer ' || coalesce(v_key,'')),
--       body    := jsonb_build_object('lead_id', new.id)
--     );
--     return new;
--   exception when others then
--     return new;   -- una notificación fallida jamás debe tumbar el alta del lead
--   end
--   $$;
--
-- drop trigger if exists trg_lead_notificar on public.leads;
-- create trigger trg_lead_notificar after insert on public.leads
--   for each row execute function public.lead_notificar();


-- ============================================================================
-- FIN v2.
-- ============================================================================
