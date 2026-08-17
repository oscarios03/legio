-- ============================================================================
-- LEGIO — MIGRACIÓN v3: BIBLIOTECA DE COMPARABLES
--
-- Hoy cada comparable se captura, se usa una vez y queda enterrado dentro del
-- jsonb de un avalúo. Nunca se vuelve a ver, nadie más lo aprovecha, y el precio
-- por m² de Legio sigue dependiendo de un benchmark externo.
--
-- Al darles tabla propia:
--   1. Se dejan de recapturar: el asesor los busca por CP y los reutiliza.
--   2. Se comparten: lo que investigó un asesor le sirve a todo el equipo.
--   3. Y lo importante: `precio_observado_colonia` convierte esa captura diaria
--      en el precio que Legio OBSERVA, no el que un portal publica.
--
-- Cómo usar: SQL Editor → New query → pega TODO → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- Requiere haber corrido antes `supabase-migracion.sql` y `supabase-migracion-v2.sql`.
-- ============================================================================


-- ============================================================================
-- 1. TABLA
-- ============================================================================
create table if not exists public.comparables (
  id         uuid primary key default gen_random_uuid(),
  asesor_id  uuid references public.asesores(id) default auth.uid(),

  -- Ubicación. `colonia` y `cp` son la llave de búsqueda del asesor.
  direccion  text,
  cp         text,
  ciudad     text,
  colonia    text,
  zona_tier  text check (zona_tier in ('premium','media','popular')),

  -- Inmueble
  tipo         text check (tipo in ('casa','departamento','local','terreno')),
  m2           numeric not null check (m2 > 0),
  m2_terreno   numeric check (m2_terreno >= 0),
  recamaras    int, banos int, cajones int,
  antiguedad   text, conservacion text,

  -- Precio. `tipo_precio` decide si se le aplica el factor de negociación:
  -- un precio de portal es de LISTA, uno de escritura es de CIERRE.
  precio      numeric not null check (precio > 0),
  tipo_precio text not null default 'lista' check (tipo_precio in ('lista','cierre')),
  fecha       date,
  fuente      text,
  url         text,
  notas       text,

  -- Precio por m², calculado por la base: nunca queda desincronizado del precio.
  precio_m2 numeric generated always as (precio / nullif(m2, 0)) stored,

  -- Trazabilidad: de qué avalúo salió, y si sigue vigente.
  avaluo_id  uuid references public.avaluos(id) on delete set null,
  activo     boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.comparables is
  'Comparables de mercado reutilizables. Alimentan el enfoque de mercado y la vista precio_observado_colonia.';
comment on column public.comparables.tipo_precio is
  'lista = precio publicado (se le descuenta negociación) · cierre = precio real de operación.';
comment on column public.comparables.activo is
  'false = comparable retirado (dato erróneo o demasiado antiguo) sin borrar el histórico.';

create index if not exists idx_comparables_cp      on public.comparables(cp) where activo;
create index if not exists idx_comparables_zona    on public.comparables(ciudad, colonia) where activo;
create index if not exists idx_comparables_tipo    on public.comparables(tipo) where activo;
create index if not exists idx_comparables_fecha   on public.comparables(fecha desc nulls last);
create index if not exists idx_comparables_asesor  on public.comparables(asesor_id);
create index if not exists idx_comparables_avaluo  on public.comparables(avaluo_id);

drop trigger if exists trg_comparables_touch on public.comparables;
create trigger trg_comparables_touch before update on public.comparables
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 2. EVITAR DUPLICADOS
--    El mismo inmueble capturado dos veces ensucia la estadística: aparecería
--    dos veces en el promedio y le daría el doble de peso a un solo dato.
--    La huella es dirección + precio + m²; sin dirección no se puede deduplicar.
-- ============================================================================
create unique index if not exists uq_comparables_huella
  on public.comparables (lower(trim(direccion)), precio, m2)
  where activo and direccion is not null and trim(direccion) <> '';


-- ============================================================================
-- 3. PRECIO OBSERVADO POR COLONIA
--    Esto es lo que la biblioteca existe para producir. Con suficientes
--    comparables, deja de hacer falta el benchmark externo por ciudad.
--
--    Se usa la MEDIANA además del promedio: una sola propiedad de lujo mal
--    clasificada mueve el promedio y no mueve la mediana.
-- ============================================================================
create or replace view public.precio_observado_colonia as
  select
    ciudad,
    colonia,
    tipo,
    count(*)                                                              as n,
    round(avg(precio_m2))                                                 as precio_m2_promedio,
    round(percentile_cont(0.5) within group (order by precio_m2)::numeric) as precio_m2_mediana,
    round(percentile_cont(0.25) within group (order by precio_m2)::numeric) as precio_m2_q1,
    round(percentile_cont(0.75) within group (order by precio_m2)::numeric) as precio_m2_q3,
    min(fecha)                                                            as desde,
    max(fecha)                                                            as hasta,
    -- Con menos de 5 observaciones la cifra es indicativa, no un precio de referencia.
    (count(*) >= 5)                                                       as suficiente
  from public.comparables
  where activo and precio_m2 is not null
  group by ciudad, colonia, tipo;

comment on view public.precio_observado_colonia is
  'Precio por m² que Legio observa en cada colonia, a partir de sus propios comparables. La columna `suficiente` indica si la muestra basta para usarla como referencia.';


-- ============================================================================
-- 4. SEGURIDAD (RLS)
--    Mismo criterio que los avalúos: los ve todo el equipo, los edita su autor.
--    Un comparable es conocimiento compartido; borrarlo, responsabilidad de quien lo capturó.
-- ============================================================================
alter table public.comparables enable row level security;

drop policy if exists cmp_auth_sel on public.comparables;
drop policy if exists cmp_auth_ins on public.comparables;
drop policy if exists cmp_auth_upd on public.comparables;
drop policy if exists cmp_auth_del on public.comparables;

create policy cmp_auth_sel on public.comparables for select to authenticated using (true);
create policy cmp_auth_ins on public.comparables for insert to authenticated
  with check (asesor_id = auth.uid() or public.is_admin());
create policy cmp_auth_upd on public.comparables for update to authenticated
  using (asesor_id = auth.uid() or public.is_admin()) with check (true);
create policy cmp_auth_del on public.comparables for delete to authenticated
  using (asesor_id = auth.uid() or public.is_admin());

-- La vista hereda el filtrado de la tabla, pero se restringe explícitamente:
-- el precio observado es información de negocio, no es pública.
revoke all on public.precio_observado_colonia from anon;
grant select on public.precio_observado_colonia to authenticated;
