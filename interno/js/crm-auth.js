/* ===== AUTENTICACIÓN DEL CRM — LEGIO (Supabase Auth) =====
 * Reemplaza al gate por contraseña de auth.js para las páginas del CRM.
 * No toca auth.js (la herramienta de avalúos sigue usándola tal cual).
 *
 * API: window.Legio.crmAuth
 *   login(email, pwd)        -> {ok, error}
 *   logout()
 *   getUser()                -> user | null
 *   currentAsesor()          -> fila de asesores | null (cacheada por sesión)
 *   isAdmin()                -> bool
 *   requireAuth(redirectTo)  -> bool (redirige al login si no hay sesión)
 *   requireAdmin(redirectTo) -> bool
 */
(function () {
  window.Legio = window.Legio || {};

  let _asesorCache = undefined; // undefined = no consultado; null = sin perfil

  const crmAuth = {
    async login(email, pwd) {
      if (!window.sb) return { ok: false, error: 'Supabase no está configurado.' };
      const { error } = await window.sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
      if (error) return { ok: false, error: traducir(error.message) };
      _asesorCache = undefined;
      return { ok: true };
    },

    async logout() {
      _asesorCache = undefined;
      if (window.sb) await window.sb.auth.signOut();
    },

    async getUser() {
      if (!window.sb) return null;
      const { data } = await window.sb.auth.getUser();
      return data ? data.user : null;
    },

    async currentAsesor() {
      if (_asesorCache !== undefined) return _asesorCache;
      const user = await this.getUser();
      if (!user) { _asesorCache = null; return null; }
      const { data } = await window.sb
        .from('asesores').select('*').eq('id', user.id).maybeSingle();
      _asesorCache = data || null;
      return _asesorCache;
    },

    async isAdmin() {
      const a = await this.currentAsesor();
      return !!(a && a.rol === 'admin' && a.activo);
    },

    // Redirige al login si no hay sesión. Devuelve true si hay sesión.
    async requireAuth(redirectTo) {
      const user = await this.getUser();
      if (!user) { location.replace(redirectTo || 'index.html'); return false; }
      return true;
    },

    // Exige admin. Redirige si no lo es.
    async requireAdmin(redirectTo) {
      if (!(await this.requireAuth(redirectTo))) return false;
      if (!(await this.isAdmin())) { location.replace(redirectTo || 'index.html'); return false; }
      return true;
    },
  };

  function traducir(msg) {
    if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(msg))       return 'Tu correo aún no está confirmado.';
    return msg;
  }

  window.Legio.crmAuth = crmAuth;
})();
