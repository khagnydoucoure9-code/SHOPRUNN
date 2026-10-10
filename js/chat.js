// Discussion côté visiteur
const getToken = () => { try { return localStorage.getItem('chatToken'); } catch (_) { return null; } };
const setToken = t => { try { t ? localStorage.setItem('chatToken', t) : localStorage.removeItem('chatToken'); } catch (_) {} };
let about = null, sig = '', poll = null, msgs = [], composer = null;

function setAbout(p) {
  about = p ? { id: p.id, name: p.name } : null;
  $('#about').hidden = !about;
  $('#about').textContent = about ? `À propos de : ${about.name}` : '';
}
// appelé depuis la fiche produit
function askAbout(p) {
  if (getToken()) { composer.prefill(`À propos de « ${p.name} » : `); $('#message').scrollIntoView(); }
  else { setAbout(p); $('#message').scrollIntoView(); $('#msgForm').sender_name.focus(); }
}

async function refreshChat(force) {
  const t = getToken(); if (!t) return;
  const { data, error } = await sb.rpc('visitor_get', { p_token: t });
  if (error) { console.error(error); return; }
  if (!data.length) { setToken(null); showChat(); return; }       // conversation supprimée
  const s = data.map(m => m.id + (m.edited_at || '') + m.deleted).join('|');
  if (!force && s === sig) return;
  sig = s; msgs = data;
  const c = $('#chat'), bottom = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
  c.innerHTML = ChatUI.html(data, 'visitor');
  if (bottom || force) c.scrollTop = c.scrollHeight;
}
function showChat() {
  const t = getToken();
  $('#chatBox').hidden = !t; $('#msgForm').hidden = !!t;
  clearInterval(poll); sig = '';
  if (t) { refreshChat(true); poll = setInterval(() => { if (!document.hidden) refreshChat(); }, 4000); }
}

composer = ChatUI.composer($('#chatForm'), async (body, editId) => {
  const t = getToken(), st = $('#msgStatus');
  const { error } = editId
    ? await sb.rpc('visitor_edit', { p_token: t, p_message_id: editId, p_body: body })
    : await sb.rpc('visitor_send', { p_token: t, p_body: body });
  if (error) { console.error(error); st.textContent = 'Message non envoyé. Réessaie dans quelques secondes.'; return false; }
  st.textContent = ''; await refreshChat(true); return true;
});
ChatUI.bind($('#chat'), {
  onEdit: id => { const m = msgs.find(x => x.id === id); if (m) composer.edit(id, m.body); },
  onDelete: async id => {
    if (!confirm('Supprimer ce message ?')) return;
    const { error } = await sb.rpc('visitor_delete', { p_token: getToken(), p_message_id: id });
    if (error) { console.error(error); $('#msgStatus').textContent = 'Suppression impossible.'; return; }
    refreshChat(true);
  }
});

// démarrer une conversation
$('#msgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, st = $('#msgStatus');
  if (f.website.value) return;                                    // anti-spam (champ piège)
  const btn = f.querySelector('button'); btn.disabled = true; st.textContent = 'Envoi…';
  const { data, error } = await sb.rpc('start_conversation', {
    p_name: f.sender_name.value.trim(), p_contact: f.contact.value.trim(), p_body: f.body.value.trim(),
    p_product_id: about?.id || null, p_product_name: about?.name || null
  });
  btn.disabled = false;
  if (error) { console.error(error); st.textContent = 'Envoi impossible. Réessaie dans un instant.'; return; }
  setToken(data); f.reset(); setAbout(null); st.textContent = ''; showChat();
});
$('#newChat').addEventListener('click', () => {
  if (confirm('Commencer une nouvelle conversation ? Tu ne verras plus celle-ci sur cet appareil.')) { setToken(null); setAbout(null); showChat(); }
});
showChat();
