# CRM Legio Inmobiliaria — Guía de configuración

El CRM vive en la carpeta `interno/` y usa **Supabase** (base de datos + acceso de
asesores + almacenamiento de fotos). El sitio y el CRM funcionan aunque Supabase no
esté configurado (modo degradado), pero para usar el CRM de verdad hay que conectarlo.

## Pasos (una sola vez, ~15 min)

### 1. Crear el proyecto en Supabase
1. Entra a https://supabase.com y crea una cuenta (plan gratuito sirve para empezar).
2. **New project** → nombre "legio", contraseña de base de datos (guárdala), región
   cercana a México (ej. *East US*).
3. Cuando termine de crearse, ve a **Settings → API** y copia:
   - **Project URL** (ej. `https://abcd1234.supabase.co`)
   - **anon public key** (empieza con `eyJ...`)

### 2. Pegar las credenciales en el sitio
Abre `interno/js/supabase-config.js` y pega los dos valores:
```js
window.SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...tu-anon-key...';
```
> La anon key es **pública** por diseño; la seguridad la dan las políticas (RLS) de la
> base. **Nunca** pegues aquí la `service_role` key.

### 3. Crear las tablas y la seguridad
1. En Supabase, ve a **SQL Editor → New query**.
2. Abre `supabase-migracion.sql`, copia **todo** su contenido, pégalo y dale **Run**.
3. Repite con **`supabase-migracion-v2.sql`** (bitácora de seguimiento, avalúos en la
   nube, reparto automático de leads, anti-spam y protección de comisiones).

Ambos archivos son idempotentes: se pueden correr varias veces sin romper nada.

### 4. Crear el bucket de fotos
1. **Storage → New bucket**.
2. Nombre exacto: `propiedades`. Marca **Public bucket**. Crear.
3. Vuelve al **SQL Editor** y ejecuta solo la sección final de `supabase-migracion.sql`
   ("POLÍTICAS DE STORAGE") si no se aplicó antes (al haber creado el bucket después).

### 5. Crear los usuarios (accesos)
1. **Authentication → Users → Add user**: crea tu usuario **admin** (correo + contraseña).
   - En **Authentication → Providers → Email**, puedes desactivar "Confirm email" para
     que el equipo entre sin confirmar correo.
   - En **Authentication → Sign In / Providers**, desactiva el registro público
     ("Allow new users to sign up") para que solo existan los usuarios que tú crees.
2. Crea un usuario por cada **asesor** de la misma forma.

### 6. Marcar quién es admin (una sola vez)
1. Haz login una vez con el usuario admin en `interno/index.html` (esto crea su perfil).
2. En **SQL Editor**, ejecuta (reemplaza el correo):
   ```sql
   update public.asesores set rol = 'admin'
   where id = (select id from auth.users where email = 'tu-admin@correo.com');
   ```
3. Listo: ese usuario ya ve **Métricas**, **Comisiones** y **Asesores**.

---

## Cómo se usa

### Panel (`interno/index.html`)
- Al entrar, lo primero que ves son tus **pendientes de hoy**: prospectos sin contactar,
  seguimientos vencidos y citas de la semana. El admin ve los de toda la oficina; el
  asesor ve los suyos y los que están sin asignar.
- **Buscador global** arriba: encuentra un prospecto por nombre, teléfono o correo, o una
  propiedad por título o colonia.

### Propiedades (`crm.html`) y revisión (`revision.html`)
- Alta/edición, fotos, estatus (borrador → disponible → apartada → vendida),
  captador/vendedor, y (solo admin) % de comisión.
- **Moderación**: cuando un **asesor** sube o **edita** una propiedad, esta **no se
  publica directo**: pasa a estado *pendiente* y sale del sitio hasta que un admin la
  apruebe. Editar una propiedad ya publicada también la baja del sitio hasta la nueva
  aprobación. Los **admin** publican/editan sin pasar por revisión.
- **Panel de revisión** (`revision.html`, solo admin): lista lo pendiente y permite
  **Aprobar** (publica), **Ver/editar** (corregir antes de aprobar), **Devolver** (regresa
  al asesor con observaciones, no publica) o **Desechar** (se conserva el registro con el
  motivo). El asesor ve el estado y las observaciones en su lista y al abrir la ficha.
- La columna **Revisión** en la lista muestra *En revisión / Devuelta / Desechada*.
- Columna **En mercado**: días que lleva publicada. En rojo si pasa de 180 días.
- Columna **Interesados**: cuántos prospectos preguntaron por ella.
- Botón **🔗** para compartir la ficha pública por WhatsApp (copia también el enlace).
- Una propiedad aparece en el **sitio público** (`propiedades.html` y portada) solo si
  está **Disponible** y con **"Mostrar en el sitio público"** activado. Si además marcas
  **Destacada**, sale en la portada.

### Prospectos (`leads.html` y `lead.html`)
- Los formularios del sitio (contacto, guía PDF y estimador) crean leads automáticamente
  y **se reparten solos** entre los asesores activos que tengan marcado "Recibe leads"
  (le toca al que menos leads haya recibido en los últimos 30 días).
- La lista trae botones de **WhatsApp** y **llamada** en un clic, con un mensaje ya
  redactado según de dónde vino el prospecto.
- La columna **Seguimiento** avisa si el prospecto está *sin contactar*, *vencido* o
  agendado para hoy.
- Al abrir la **ficha del prospecto** tienes:
  - **Bitácora**: cada llamada, WhatsApp, cita o nota queda registrada con fecha y autor.
    Abrir WhatsApp desde el CRM ya cuenta como contacto.
  - **Próximo seguimiento** con atajos (hoy, mañana, en 3 días, en 1 semana).
  - **Motivo de pérdida** obligatorio al marcar un prospecto como perdido.
  - **Propiedades sugeridas** del inventario según ciudad, tipo y presupuesto, con botón
    para vincularlas o mandárselas por WhatsApp.
  - Aviso de **posible duplicado** si ya existe otro prospecto con el mismo teléfono o correo.
- Exportación a **CSV** para Excel.

### Avalúos (`avaluos.html`)
- Ahora se guardan **en la nube** y los ve todo el equipo (antes vivían solo en el
  navegador del asesor). Si tienes avalúos viejos guardados localmente, el panel te
  ofrece un botón para **subirlos a la nube**.
- **Requiere iniciar sesión en el CRM** (mismo usuario/contraseña de Supabase). Ya no hay
  contraseña compartida: si entras sin sesión te manda al login.

### Métricas (`metricas.html`, solo admin)
- Leads por semana y **por origen** (formulario vs estimador vs WhatsApp): te dice qué
  canal del sitio está funcionando.
- **Embudo de conversión** y tasa de contacto/cierre **por asesor**.
- **Tiempo de primera respuesta** promedio: la métrica que más pesa en bienes raíces.
- Días en mercado del inventario y días promedio hasta vender.
- Por qué se pierden los prospectos.

### Comisiones (`comisiones.html`, solo admin)
- Reporte por periodo con split captador/vendedor, totales y exportación a CSV.
- Los % de comisión viven en una tabla aparte (`propiedad_comisiones`) protegida por RLS:
  **cada asesor solo puede ver las comisiones de propiedades donde es captador o vendedor**;
  el admin las ve todas. La restricción es a nivel de base, no solo en la interfaz.

### Asesores (`asesores.html`, solo admin)
- Nombre, teléfono, rol, activo y **Recibe leads** (si entra en el reparto automático).
- El *acceso* (correo/contraseña) se crea en el panel de Supabase; el perfil aparece aquí
  en el primer login.

---

## Aviso de lead nuevo por correo (opcional)

Un lead que cae a las 8pm no debería esperar a que alguien abra el CRM. Para que llegue
un correo al asesor asignado (con copia al admin) en cuanto entra:

1. Crea una cuenta en https://resend.com y verifica tu dominio. Copia la API key.
2. Instala la CLI de Supabase y enlaza el proyecto:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref TU-PROJECT-REF
   ```
3. Guarda los secretos:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxx
   supabase secrets set NOTIFICAR_DESDE="Legio CRM <crm@tudominio.com>"
   supabase secrets set NOTIFICAR_ADMIN=admin@tudominio.com
   supabase secrets set CRM_URL=https://tudominio.com/interno
   ```
4. Despliega la función:
   ```bash
   supabase functions deploy notificar-lead
   ```
5. En el **SQL Editor**, descomenta y ejecuta la **sección 9** de `supabase-migracion-v2.sql`
   (incluye el `insert` en `crm_config` con la URL de tu función y tu anon key).

Si algo falla en el envío, el trigger lo ignora: **una notificación fallida nunca tumba
el alta del lead**.

---

## Seguridad

- **Roles**: *admin* ve todo y gestiona asesores, métricas y comisiones; *asesor* gestiona
  propiedades y sus prospectos.
- Un **asesor solo ve los prospectos que tiene asignados** y los que están sin asignar.
  Solo puede **editar las propiedades** donde es captador, vendedor, quien la dio de alta,
  o las que aún no tienen dueño. Esto lo aplican las políticas RLS de la base, no la
  interfaz.
- Los **datos de venta** (`precio_venta_final`, `fecha_venta`) están protegidos por un
  trigger: si quien escribe no es admin, la base ignora esos valores aunque los mande
  desde la consola. Los **% de comisión** viven en `propiedad_comisiones` y solo el admin
  los escribe; cada asesor solo lee los de sus propiedades (RLS).
- **Moderación de propiedades**: un trigger obliga a que toda alta/edición de un asesor
  entre en revisión (`revision_estado='pendiente'`) sin publicarse; solo un admin puede
  aprobar y publicar. Ni desde la consola puede un asesor publicarse a sí mismo.
- **Roles protegidos**: un trigger impide que un asesor se auto-promueva a admin (o se
  reactive) aunque intente `update` directo a su fila desde la consola.
- Los **avalúos** ya no usan contraseña compartida: exigen sesión real de Supabase.
- El alta anónima de leads (los formularios del sitio) pasa por un filtro **anti-spam**:
  exige teléfono o correo, rechaza enlaces y nombres kilométricos, y frena las ráfagas
  (mismo contacto más de 3 veces en 10 minutos). Además cada formulario lleva un campo
  trampa (*honeypot*) invisible: **no borres los `<input name="website" class="hp-campo">`**.
- No borres ni cambies las políticas RLS de los archivos de migración: son las que impiden
  que un visitante lea borradores, comisiones o los datos de tus prospectos.

---

## Archivos

| Archivo | Qué hace |
|---|---|
| `supabase-migracion.sql` | Tablas base, RLS y storage (v1). |
| `supabase-migracion-v2.sql` | Bitácora, avalúos, reparto de leads, anti-spam, seguridad. |
| `supabase/functions/notificar-lead/` | Edge Function del aviso por correo. |
| `interno/js/crm-util.js` | Formato, enlaces de WhatsApp, exportación a CSV. |
| `interno/js/crm-data.js` | Toda la lectura/escritura contra Supabase. |
| `interno/lead.html` | Ficha del prospecto con bitácora y match de inventario. |
| `interno/metricas.html` | Panel de métricas del admin. |
