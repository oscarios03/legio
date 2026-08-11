-- ============================================================================
-- LEGIO INMOBILIARIA — Migración v3 del CRM (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Esta migración se escribió A PARTIR DE LA BASE REAL, no al revés.
--
-- Entre la v2 y hoy, la base de producción recibió cambios que nunca quedaron
-- en un archivo. Este archivo cierra esa brecha: aplicado sobre una base con
-- v1 + v2 la deja igual a producción, y sobre producción no cambia nada.
--
--   1. Las comisiones salen de `propiedades` a su propia tabla
--   2. Flujo de revisión de propiedades (borrador → aprobada)
--   3. Moderación: quien no es admin no publica ni aprueba
--   4. El asesor no se puede ascender solo
--   5. ARREGLO: el trigger de comisiones de la v2 quedó roto al mover las
--      columnas y bloqueaba a todos los asesores no admin
--
-- Cómo usar: SQL Editor → New query → pega TODO → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- Requiere haber corrido antes `supabase-migracion.sql` y `-v2.sql`.
-- ============================================================================


-- ============================================================================
-- 1. COMISIONES EN SU PROPIA TABLA
--    En la v2 los porcentajes vivían en `propiedades`. El problema es que la
--    RLS de Postgres es por fila, no por columna: cualquier asesor con acceso
--    a la propiedad podía leer lo que gana la casa. Moverlos a una tabla 1 a 1
--    permite ponerles su propia política.
-- ============================================================================
create table if not exists public.propiedad_comisiones (
  propiedad_id          uuid primary key references public.propiedades(id) on delete cascade,
  comision_pct          numeric,
  comision_captador_pct numeric,
  comision_vendedor_pct numeric,
  updated_at            timestamptz not null default now()
);

comment on table public.propiedad_comisiones is
  'Porcentajes de comisión, fuera de `propiedades` para poder restringirlos por RLS.';

drop trigger if exists trg_pcom_touch on public.propiedad_comisiones;
create trigger trg_pcom_touch before update on public.propiedad_comisiones
  for each row execute function public.touch_updated_at();

-- Se rescata lo que hubiera en las columnas viejas antes de tirarlas.
-- En una base que ya está en v3 este bloque no hace nada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='propiedades' and column_name='comision_pct'
  ) then
    execute $mig$
      insert into public.propiedad_comisiones
             (propiedad_id, comision_pct, comision_captador_pct, comision_vendedor_pct)
      select id, comision_pct, comision_captador_pct, comision_vendedor_pct
        from public.propiedades
       where comision_pct is not null
          or comision_captador_pct is not null
          or comision_vendedor_pct is not null
      on conflict (propiedad_id) do nothing
    $mig$;
  end if;
end $$;

alter table public.propiedades drop column if exists comision_pct;
alter table public.propiedades drop column if exists comision_captador_pct;
alter table public.propiedades drop column if exists comision_vendedor_pct;

alter table public.propiedad_comisiones enable row level security;

-- Escribe solo el admin. Lee el admin y el asesor que participó en esa operación
-- (necesita ver su propia comisión, no la de los demás).
drop policy if exists pcom_admin_wr on public.propiedad_comisiones;
drop policy if exists pcom_sel      on public.propiedad_comisiones;

create policy pcom_admin_wr on public.propiedad_comisiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy pcom_sel on public.propiedad_comisiones
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.propiedades p
       where p.id = propiedad_id
         and (p.asesor_captador_id = auth.uid() or p.asesor_vendedor_id = auth.uid())
    )
  );


-- ============================================================================
-- 2. ARREGLO DEL TRIGGER DE COMISIONES DE LA v2
--    `propiedad_protege_comision()` seguía asignando new.comision_pct, que ya
--    no existe. Postgres resuelve esos campos en tiempo de ejecución, así que
--    la función no se rompió al mover las columnas: se rompía en cada alta o
--    edición de propiedad hecha por alguien que no fuera admin, con
--    «record "new" has no field "comision_pct"». El admin nunca lo vio porque
--    la función devuelve antes de llegar ahí.
--
--    Los porcentajes ya no necesitan este trigger (los protege la RLS de
--    `propiedad_comisiones`). Lo que sí sigue viviendo en `propiedades` y sigue
--    siendo solo del admin es el precio de venta y la fecha de cierre.
-- ============================================================================
create or replace function public.propiedad_protege_comision() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if public.is_admin() then return new; end if;

    if tg_op = 'INSERT' then
      new.precio_venta_final := null;
      new.fecha_venta        := null;
    else
      new.precio_venta_final := old.precio_venta_final;
      new.fecha_venta        := old.fecha_venta;
    end if;
    return new;
  end
$$;

drop trigger if exists trg_prop_comision on public.propiedades;
create trigger trg_prop_comision before insert or update on public.propiedades
  for each row execute function public.propiedad_protege_comision();


-- ============================================================================
-- 3. REVISIÓN DE PROPIEDADES
--    El asesor captura; el admin revisa y decide si sale al sitio público.
-- ============================================================================
alter table public.propiedades add column if not exists revision_estado        text not null default 'pendiente';
alter table public.propiedades add column if not exists revision_observaciones text;
alter table public.propiedades add column if not exists revision_por           uuid references public.asesores(id);
alter table public.propiedades add column if not exists revision_at            timestamptz;

alter table public.propiedades drop constraint if exists propiedades_revision_estado_check;
alter table public.propiedades add  constraint propiedades_revision_estado_check
  check (revision_estado in ('pendiente','aprobada','devuelta','desechada'));

comment on column public.propiedades.revision_estado is
  'pendiente | aprobada | devuelta | desechada. Solo las aprobadas salen al sitio público.';
comment on column public.propiedades.revision_observaciones is
  'Por qué se devolvió o desechó. Lo escribe el admin, lo lee el captador.';

-- La bandeja del admin son las pendientes: se indexan solo esas.
create index if not exists idx_prop_revision on public.propiedades(revision_estado)
  where revision_estado = 'pendiente';


-- ============================================================================
-- 4. MODERACIÓN
--    Sin esto, un asesor con la consola del navegador puede marcar `publica`
--    y saltarse la revisión. Se corrige en la base, no en la interfaz.
-- ============================================================================
create or replace function public.propiedad_moderacion() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if public.is_admin() then
      return new;
    end if;
    -- Quien no es admin no publica, no destaca y no dictamina su propia ficha.
    new.publica                := false;
    new.destacada              := false;
    new.revision_estado        := 'pendiente';
    new.revision_observaciones := null;
    new.revision_por           := null;
    new.revision_at            := null;
    return new;
  end
$$;

drop trigger if exists trg_prop_moderacion on public.propiedades;
create trigger trg_prop_moderacion before insert or update on public.propiedades
  for each row execute function public.propiedad_moderacion();

-- El público solo ve lo aprobado (antes bastaba con publica + disponible).
drop policy if exists prop_public_sel on public.propiedades;
create policy prop_public_sel on public.propiedades
  for select to anon
  using (publica = true and estatus = 'disponible' and revision_estado = 'aprobada');


-- ============================================================================
-- 5. EL ASESOR NO SE ASCIENDE SOLO
--    La política `ase_self_upd` de la v1 ya lo intentaba, pero una política no
--    puede comparar contra el valor anterior de la fila. Un trigger sí.
-- ============================================================================
create or replace function public.asesor_congela_privilegios() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if public.is_admin() then return new; end if;
    new.rol    := old.rol;
    new.activo := old.activo;
    return new;
  end
$$;

drop trigger if exists trg_asesor_congela on public.asesores;
create trigger trg_asesor_congela before update on public.asesores
  for each row execute function public.asesor_congela_privilegios();


-- ============================================================================
-- 6. COMPROBACIÓN
--    Devuelve una fila por chequeo. Todas deben decir OK.
-- ============================================================================
select 'comisiones fuera de propiedades' as chequeo,
       case when not exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='propiedades'
            and column_name in ('comision_pct','comision_captador_pct','comision_vendedor_pct')
       ) then 'OK' else 'FALTA' end as resultado
union all
select 'tabla propiedad_comisiones',
       case when to_regclass('public.propiedad_comisiones') is not null then 'OK' else 'FALTA' end
union all
select 'campos de revisión',
       case when (select count(*) from information_schema.columns
                   where table_schema='public' and table_name='propiedades'
                     and column_name like 'revision\_%') = 4 then 'OK' else 'FALTA' end
union all
select 'triggers de propiedades',
       case when (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                   where not t.tgisinternal and c.relname='propiedades'
                     and t.tgname in ('trg_prop_comision','trg_prop_moderacion','trg_prop_touch')) = 3
            then 'OK' else 'FALTA' end
union all
select 'políticas de comisiones',
       case when (select count(*) from pg_policies
                   where schemaname='public' and tablename='propiedad_comisiones') = 2
            then 'OK' else 'FALTA' end;


-- ============================================================================
-- FIN v3.
-- ============================================================================
