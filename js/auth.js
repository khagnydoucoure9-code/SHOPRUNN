const DENIED = 'Accès refusé : vous n\'avez pas les droits administrateur.';

const Auth = {
  // La vraie sécurité est dans Postgres (RLS + is_admin()). Ceci ne sert qu'à l'interface.
  async isAdmin(uid) {
    const { data, error } = await sb.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle();
    return !error && !!data;
  },

  // Appelé par /admin/index.html : redirige si non connecté, bloque si non admin
  async guard() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('login.html'); return null; }
    if (!(await Auth.isAdmin(session.user.id))) {
      await sb.auth.signOut();
      document.body.classList.remove('hidden');
      document.body.innerHTML = `<main class="login"><p class="err">${DENIED}</p><a class="btn ghost" href="login.html">Retour à la connexion</a></main>`;
      return null;
    }
    return session;
  },

  async logout() {
    await sb.auth.signOut();          // supprime la session locale
    location.replace('login.html');
  },

  // Appelé par /admin/login.html
  initLogin() {
    const form = document.getElementById('loginForm'), msg = document.getElementById('msg');
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session && await Auth.isAdmin(session.user.id)) location.replace('index.html');
    })();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const btn = form.querySelector('button'); btn.disabled = true;
      const { data, error } = await sb.auth.signInWithPassword({
        email: form.email.value.trim(), password: form.password.value
      });
      if (error) { msg.textContent = 'Email ou mot de passe incorrect.'; btn.disabled = false; return; }
      if (!(await Auth.isAdmin(data.user.id))) {
        await sb.auth.signOut();
        msg.textContent = DENIED; btn.disabled = false; return;
      }
      location.replace('index.html');
    });
  }
};
