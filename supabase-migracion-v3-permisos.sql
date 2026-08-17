-- ============================================================================
-- LEGIO INMOBILIARIA — Permisos de las funciones internas (Supabase/PostgreSQL)
-- ----------------------------------------------------------------------------
-- PostgreSQL le da EXECUTE a PUBLIC en cada función nueva, y PostgREST publica
-- todo lo que viva en el esquema `public`. Resultado: las funciones internas del
-- CRM quedaban colgadas de la API como `/rest/v1/rpc/<nombre>`, alcanzables sin
-- iniciar sesión. El linter de Supabase lo marcaba con 19 avisos.
--
-- Hay que nombrar a `public` de forma explícita: revocarle solo a `anon` y a
-- `authenticated` no sirve de nada, porque el permiso que de verdad las abría es
-- el de PUBLIC y ese se queda intacto.
--
-- ¡OJO CON is_admin()! No se le puede quitar el permiso a `authenticated`.
-- Las expresiones de las políticas RLS SÍ se evalúan con los permisos de quien
-- consulta, y 15 políticas llaman a `is_admin()`. Al revocárselo, todo usuario
-- con sesión se topa con `permission denied for function is_admin` y el CRM
-- entero deja de leer. Comprobado en producción el 2026-08-17, y revertido en
-- el momento. A `is_admin()` solo se le cierra la puerta de `anon` y de PUBLIC.
--
-- El resto sí se cierran del todo: son funciones de trigger y los triggers
-- siguen disparando sin EXECUTE. PostgreSQL revisa ese permiso al crear el
-- trigger, no al dispararlo. Probado con el alta de un lead desde el formulario
-- público como `anon`: el antispam normalizó el origen, el reparto le asignó
-- asesor y se escribió la actividad en la bitácora.
--
-- `service_role` conserva EXECUTE en todas: es la llave de servidor, nunca sale
-- al navegador.
--
-- Cómo usar: SQL Editor → New query → pega TODO → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================================

revoke all on function public.asesor_congela_privilegios() from public, anon, authenticated;
revoke all on function public.avaluo_folio()               from public, anon, authenticated;
revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.lead_actividad_alta()        from public, anon, authenticated;
revoke all on function public.lead_antispam()              from public, anon, authenticated;
revoke all on function public.lead_auto_asignar()          from public, anon, authenticated;
revoke all on function public.lead_touch_contacto()        from public, anon, authenticated;
revoke all on function public.propiedad_moderacion()       from public, anon, authenticated;
revoke all on function public.propiedad_protege_comision() from public, anon, authenticated;
revoke all on function public.touch_updated_at()           from public, anon, authenticated;

-- is_admin() se cierra a medias, en este orden: primero se le quita a todos y
-- luego se le devuelve a `authenticated`, que es quien lo necesita para el RLS.
revoke all   on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Que las funciones que se creen de aquí en adelante nazcan cerradas, en vez de
-- tener que acordarse de revocarlas una por una.
-- OJO: a partir de aquí, cualquier función nueva que se use dentro de una
-- política RLS necesita su permiso a mano, igual que is_admin():
--   grant execute on function public.<nombre>() to authenticated;
-- Lo mismo si algún día quieres exponer una RPC a propósito para el front.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ============================================================================
-- Comprobación: la única función que debe seguir viéndose desde la API es
-- is_admin(), y solo para `authenticated`.
-- ============================================================================
-- select p.proname, array_to_string(p.proacl, ' | ') as acl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--  order by p.proname;
