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

> ⚠️ **La base de producción va por delante de estos dos archivos.** Se le
> agregaron cosas por fuera que no están aquí: la tabla `propiedad_comisiones`
> y los campos `revision_*` de `propiedades`. Antes de escribir una consulta
> nueva, confirma las columnas contra la base real, no contra estos `.sql`.
>
> En particular, **los porcentajes de comisión ya no viven en `propiedades`**:
> están en `propiedad_comisiones` (1 a 1 por `propiedad_id`), para que la RLS
> pueda dejarlos fuera del alcance de quien no debe verlos. `crm-data.js` los
> trae embebidos y los aplana, así que en el resto del CRM se siguen usando
> como si fueran campos de la propiedad.

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
El tablero de inicio. Todo el CRM comparte una **barra lateral fija** con el buscador
global (atajo `/`), las secciones y tu usuario; se pliega con el botón de la esquina y en
celular se abre con el botón de menú.

El panel se lee de arriba abajo, de lo urgente a lo estratégico:

1. **Lo que exige atención hoy**: sin contactar, seguimiento vencido y citas de la semana,
   cada uno con su botón para ir directo a la lista ya filtrada.
2. **Resultados del periodo** (ocho cifras) comparadas contra el **periodo anterior del
   mismo largo**: prospectos nuevos, tasa de contacto, cierres, monto vendido, tiempo de
   1ª respuesta, citas por venir, inventario activo y comisión.
3. **De dónde llegan** (panal de hexágonos por origen) y **prospectos por día**.
4. **Próximas citas y seguimientos** + **cierres del periodo** con su monto.
5. **Prospectos que te necesitan**: los ocho más urgentes, con WhatsApp en un clic.
6. **Inventario que lleva demasiado en el mercado** (más de 180 días).

Arriba se elige el **periodo** (este mes, últimos 30 días, mes pasado, últimos 90 días o el
año) y, si eres admin, el **alcance**: toda la oficina o solo lo tuyo. Con el alcance en
"solo lo mío", los cierres y la comisión son los de tus operaciones, no los de la casa.
El botón **Exportar** baja a CSV los prospectos del periodo que estés viendo.

### Propiedades (`crm.html`)
- Alta/edición, fotos, estatus (borrador → disponible → apartada → vendida),
  captador/vendedor, y (solo admin) % de comisión.
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
- Si entras sin sesión del CRM, la herramienta sigue funcionando guardando en el navegador.

### Métricas (`metricas.html`, solo admin)
- Leads por semana y **por origen** (formulario vs estimador vs WhatsApp): te dice qué
  canal del sitio está funcionando.
- **Embudo de conversión** y tasa de contacto/cierre **por asesor**.
- **Tiempo de primera respuesta** promedio: la métrica que más pesa en bienes raíces.
- Días en mercado del inventario y días promedio hasta vender.
- Por qué se pierden los prospectos.

### Comisiones (`comisiones.html`, solo admin)
- Reporte por periodo con split captador/vendedor, totales y exportación a CSV.

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
- Los **campos de comisión** (`comision_*`, `precio_venta_final`, `fecha_venta`) están
  protegidos por un trigger: si quien escribe no es admin, la base ignora esos valores
  aunque los mande desde la consola del navegador.
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
| `interno/js/crm-shell.js` | Barra lateral, buscador global e iconos (una sola vez para todo el CRM). |
| `interno/js/crm-charts.js` | Gráficas del panel en SVG, sin librerías externas. |
| `interno/interno.css` | Sistema visual del CRM (colores de marca + grises del panel). |
| `interno/index.html` | Tablero de inicio. |
| `interno/lead.html` | Ficha del prospecto con bitácora y match de inventario. |
| `interno/metricas.html` | Panel de métricas del admin. |

> **Agregar una sección al menú:** se toca un solo lugar, la constante `MENU` de
> `interno/js/crm-shell.js`; aparece en todas las pantallas.
