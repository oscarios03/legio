/* ===== CONFIGURACIÓN DE SUPABASE — LEGIO =====
 * Crea el cliente global window.sb.
 *
 * REQUISITO: cargar el SDK de Supabase ANTES de este archivo:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src=".../supabase-config.js"></script>
 *
 * TODO Legio: pega aquí los datos de tu proyecto (Settings → API en Supabase).
 * La anon key es PÚBLICA por diseño; la seguridad real la dan las políticas RLS
 * definidas en supabase-migracion.sql. NO pegues aquí la service_role key.
 */
(function () {
  window.SUPABASE_URL      = 'https://bmzgqhnmjkjunnkvotit.supabase.co';
  window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtemdxaG5tamtqdW5ua3ZvdGl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2Mjc2MzksImV4cCI6MjA5OTIwMzYzOX0.tn6iKwut0xTsOIFBQtM7FZ1hDn-vQbvS8FLXMPHHp3M';

  window.sb = null;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('[Legio] SDK de Supabase no cargado. Agrega el <script> del CDN antes de supabase-config.js.');
    return;
  }
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn('[Legio] Falta configurar SUPABASE_URL / SUPABASE_ANON_KEY en interno/js/supabase-config.js. El sitio funciona, pero sin datos en la nube.');
    return;
  }

  window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
})();
