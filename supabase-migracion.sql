-- ============================================================================
-- LEGIO INMOBILIARIA — Migración del CRM (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Cómo usar:
--   1) Crea tu proyecto en https://supabase.com y ve al SQL Editor.
--   2) Pega TODO este archivo y ejecútalo (es idempotente: se puede correr
--      varias veces sin romper nada).
--   3) Crea el bucket de Storage llamado exactamente 'propiedades' (público)
--      desde el panel: Storage → New bucket → Public bucket.
--   4) Crea los usuarios (admin y asesores) en Authentication → Users.
--   5) Promueve a tu admin (una sola vez), reemplazando el uuid:
--        update public.asesores set rol = 'admin' where id = '<UUID-DEL-ADMIN>';
--   6) Copia Project URL y anon key (Settings → API) en
--      interno/js/supabase-config.js
-- ============================================================================

-- 0. Extensiones -------------------------------------------------------------
create extension if not exists pgcrypto;   -- para gen_random_uuid()

-- 1. Tabla ASESORES (perfil; id == auth.users.id) ---------------------------
create table if not exists public.asesores (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  email      text,
  rol        text not null default 'asesor' check (rol in ('admin','asesor')),
  activo     boolean not null default true,
  telefono   text,
  created_at timestamptz not null default now()
);

-- 2. Tabla PROPIEDADES -------------------------------------------------------
create table if not exists public.propiedades (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null,
  tipo                  text not null default 'casa'
                          check (tipo in ('casa','departamento','local','terreno')),
  operacion             text not null default 'venta'
                          check (operacion in ('venta','renta')),
  estatus               text not null default 'borrador'
                          check (estatus in ('borrador','disponible','apartada','vendida')),
  ciudad                text,
  colonia               text,
  cp                    text,
  precio                numeric,
  m2                    numeric,
  m2_terreno            numeric,
  recamaras             int default 0,
  banos                 int default 0,
  cajones               int default 0,
  antiguedad            text,
  conservacion          text,
  descripcion           text,
  direccion             text,
  publica               boolean not null default false,
  destacada             boolean not null default false,
  foto_principal_url    text,
  asesor_captador_id    uuid references public.asesores(id),
  asesor_vendedor_id    uuid references public.asesores(id),
  comision_pct          numeric,
  comision_captador_pct numeric,
  comision_vendedor_pct numeric,
  precio_venta_final    numeric,
  fecha_venta           date,
  created_by            uuid references public.asesores(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_prop_publicas
  on public.propiedades (estatus, publica) where publica = true;
create index if not exists idx_prop_captador on public.propiedades(asesor_captador_id);
create index if not exists idx_prop_vendedor on public.propiedades(asesor_vendedor_id);

-- 3. Tabla PROPIEDAD_FOTOS ---------------------------------------------------
create table if not exists public.propiedad_fotos (
  id           uuid primary key default gen_random_uuid(),
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  url          text not null,
  storage_path text not null,       -- ruta dentro del bucket, para poder borrar el objeto
  orden        int default 0,
  principal    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_fotos_prop on public.propiedad_fotos(propiedad_id);

-- 4. Tabla LEADS -------------------------------------------------------------
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  nombre         text,
  telefono       text,
  email          text,
  mensaje        text,
  origen         text not null default 'manual'
                   check (origen in ('form','estimador','whatsapp','manual')),
  tipo_operacion text,
  ciudad         text,
  estatus        text not null default 'nuevo'
                   check (estatus in ('nuevo','contactado','cita','cerrado','perdido')),
  asesor_id      uuid references public.asesores(id),
  propiedad_id   uuid references public.propiedades(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_leads_asesor on public.leads(asesor_id);
create index if not exists idx_leads_estatus on public.leads(estatus);

-- 5. Trigger updated_at en propiedades ---------------------------------------
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
  begin new.updated_at = now(); return new; end
$$;

drop trigger if exists trg_prop_touch on public.propiedades;
create trigger trg_prop_touch before update on public.propiedades
  for each row execute function public.touch_updated_at();

-- 6. Helper is_admin() (SECURITY DEFINER evita recursión en las políticas) ---
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.asesores
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- 7. Alta automática del perfil de asesor al crear el usuario de auth --------
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    insert into public.asesores (id, email, nombre)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre',''))
    on conflict (id) do nothing;
    return new;
  end
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.asesores        enable row level security;
alter table public.propiedades     enable row level security;
alter table public.propiedad_fotos enable row level security;
alter table public.leads           enable row level security;

-- ---- ASESORES --------------------------------------------------------------
drop policy if exists ase_sel_auth   on public.asesores;
drop policy if exists ase_admin_all  on public.asesores;
drop policy if exists ase_self_upd   on public.asesores;

-- Todo autenticado puede leer (para poblar selects de captador/vendedor).
create policy ase_sel_auth on public.asesores
  for select to authenticated using (true);
-- Solo admin da de alta / edita / borra perfiles.
create policy ase_admin_all on public.asesores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- El propio usuario puede actualizar sus datos, sin cambiarse el rol.
create policy ase_self_upd on public.asesores
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from public.asesores where id = auth.uid()));

-- ---- PROPIEDADES -----------------------------------------------------------
drop policy if exists prop_public_sel on public.propiedades;
drop policy if exists prop_auth_sel   on public.propiedades;
drop policy if exists prop_auth_ins   on public.propiedades;
drop policy if exists prop_auth_upd   on public.propiedades;
drop policy if exists prop_admin_del  on public.propiedades;

-- Público (anon): solo publicadas y disponibles.
create policy prop_public_sel on public.propiedades
  for select to anon using (publica = true and estatus = 'disponible');
-- Autenticado: ve todo, inserta y actualiza.
create policy prop_auth_sel on public.propiedades for select to authenticated using (true);
create policy prop_auth_ins on public.propiedades for insert to authenticated with check (true);
create policy prop_auth_upd on public.propiedades for update to authenticated using (true) with check (true);
-- Borrar: solo admin.
create policy prop_admin_del on public.propiedades for delete to authenticated using (public.is_admin());

-- ---- PROPIEDAD_FOTOS -------------------------------------------------------
drop policy if exists fotos_public_sel on public.propiedad_fotos;
drop policy if exists fotos_auth_sel   on public.propiedad_fotos;
drop policy if exists fotos_auth_wr    on public.propiedad_fotos;

-- Público: solo fotos de propiedades públicas/disponibles.
create policy fotos_public_sel on public.propiedad_fotos
  for select to anon using (
    exists (select 1 from public.propiedades p
            where p.id = propiedad_id and p.publica = true and p.estatus = 'disponible')
  );
create policy fotos_auth_sel on public.propiedad_fotos for select to authenticated using (true);
create policy fotos_auth_wr  on public.propiedad_fotos for all to authenticated using (true) with check (true);

-- ---- LEADS -----------------------------------------------------------------
drop policy if exists leads_anon_ins on public.leads;
drop policy if exists leads_auth_sel on public.leads;
drop policy if exists leads_auth_wr  on public.leads;

-- Anónimo puede INSERTAR (formularios del sitio) pero NO leer.
create policy leads_anon_ins on public.leads for insert to anon with check (true);
create policy leads_auth_sel on public.leads for select to authenticated using (true);
create policy leads_auth_wr  on public.leads for all to authenticated using (true) with check (true);

-- ============================================================================
-- POLÍTICAS DE STORAGE (bucket 'propiedades')
-- Ejecuta esto DESPUÉS de haber creado el bucket 'propiedades' en el panel.
-- ============================================================================
drop policy if exists stor_pub_read   on storage.objects;
drop policy if exists stor_auth_write on storage.objects;

create policy stor_pub_read on storage.objects
  for select to anon using (bucket_id = 'propiedades');
create policy stor_auth_write on storage.objects
  for all to authenticated using (bucket_id = 'propiedades') with check (bucket_id = 'propiedades');

-- ============================================================================
-- FIN. Recuerda: update public.asesores set rol='admin' where id='<UUID-ADMIN>';
-- ============================================================================
