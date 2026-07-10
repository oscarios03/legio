/* ===== ACCESO — LEGIO (contraseña compartida) =====
 * AVISO: esto es solo un "gate" del lado del cliente para mantener la herramienta
 * fuera del alcance de clientes. NO es seguridad real (el hash viaja en el JS).
 * Al migrar a backend se reemplaza por autenticación real con cuentas por trabajador.
 */
(function () {
  window.Legio = window.Legio || {};

  // Interruptor del control de acceso.
  // false = sin clave (entra directo al panel). Pon en true (o migra a backend) para exigir acceso.
  const AUTH_ENABLED = false;

  // Contraseña por defecto para empezar a usar la herramienta de inmediato.
  // TODO Legio: 1) cambia DEFAULT_PWD, o mejor 2) genera un hash con
  //   Legio.auth.hashFor('tu-clave')  (en la consola) y pégalo en PWD_HASH;
  //   al fijar PWD_HASH se ignora DEFAULT_PWD.
  const DEFAULT_PWD = 'legio2026';
  const PWD_HASH = '';

  const FLAG = 'legio_auth';

  async function sha256(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  Legio.auth = {
    enabled: AUTH_ENABLED,

    isAuthed() { return !AUTH_ENABLED || sessionStorage.getItem(FLAG) === '1'; },

    async login(pwd) {
      let ok;
      if (PWD_HASH) ok = (await sha256(pwd)) === PWD_HASH;
      else ok = pwd === DEFAULT_PWD;
      if (ok) sessionStorage.setItem(FLAG, '1');
      return ok;
    },

    logout() { sessionStorage.removeItem(FLAG); },

    // Protege páginas internas: si no hay sesión, manda al login.
    requireAuth(redirectTo) {
      if (!this.isAuthed()) { location.replace(redirectTo || 'index.html'); return false; }
      return true;
    },

    // Utilidad para generar el hash de una nueva contraseña (úsala en la consola).
    async hashFor(pwd) { return sha256(pwd); },
  };
})();
