// Discussion côté admin : remplace l'ancienne liste de messages de admin.js
let openConv = null;
const hhmm = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const bubbles = l => l.map(m => `<div class="bub ${m.sender === 'admin' ? 'me' : 'them'}">${esc(m.body)}<small>${hhmm(m.created_at)}</small></div>`).join('');

async function updateBadge() {
  const { count } = await sb.from('conversations').select('id', { count: 'exact', head: true }).eq('admin_unread', true);
  const b = document.querySelector('[data-view=messages]');
  if (b) b.textContent = 'Messages' + (count ? ` (${count})` : '');
}

async function messagesView() {
  openConv = null;
  const { data, error } = await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(200);
  if (error) throw error;
  main.innerHTML = '<h1>Messages</h1>' + (data.map(c => `<div class="row">
    <div class="grow"><b>${esc(c.visitor_name)}</b> ${c.admin_unread ? '<span class="tag ok">Nouveau</span>' : ''}<br>
      <span class="muted">${esc(c.contact)} · ${hhmm(c.last_message_at)}${c.product_name ? ' · ' + esc(c.product_name) : ''}</span></div>
    <button class="btn ghost" data-open="${c.id}">Ouvrir</button></div>`).join('') || '<p class="muted">Aucune conversation pour le moment.</p>');
  main.onclick = e => { const b = e.target.closest('[data-open]'); if (b) threadView(b.dataset.open).catch(fail); };
  updateBadge();
}

async function loadThread(id) {
  const chat = document.getElementById('chat');
  if (!chat || openConv !== id) return;
  const { data, error } = await sb.from('chat_messages').select('*').eq('conversation_id', id).order('created_at');
  if (error) return fail(error);
  chat.innerHTML = bubbles(data); chat.scrollTop = chat.scrollHeight;
}

async function threadView(id) {
  const { data: c, error } = await sb.from('conversations').select('*').eq('id', id).single();
  if (error) throw error;
  openConv = id;
  main.innerHTML = `<button class="btn ghost" data-back>← Conversations</button>
    <h1 style="margin-top:12px">${esc(c.visitor_name)}</h1>
    <p class="muted">${esc(c.contact)}${c.product_name ? ' · ' + esc(c.product_name) : ''}</p>
    <div class="chat" id="chat" style="max-width:none"></div>
    <form class="chatform" id="reply" style="max-width:none">
      <textarea name="body" rows="3" maxlength="1000" placeholder="Ta réponse (Ctrl + Entrée pour envoyer)" required></textarea>
      <button class="btn" type="submit">Envoyer</button></form>
    <button class="btn danger" data-del style="margin-top:16px">Supprimer la conversation</button>`;
  await loadThread(id);
  if (c.admin_unread) { await sb.from('conversations').update({ admin_unread: false }).eq('id', id); updateBadge(); }

  const form = $('#reply');
  form.elements.body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  form.onsubmit = async e => {
    e.preventDefault();
    const ta = form.elements.body, body = ta.value.trim(); if (!body) return;
    const btn = form.querySelector('button'); btn.disabled = true;
    const r = await sb.from('chat_messages').insert({ conversation_id: id, sender: 'admin', body });
    btn.disabled = false;
    if (r.error) return fail(r.error);
    ta.value = ''; loadThread(id);
  };
  main.onclick = async e => {
    if (e.target.closest('[data-back]')) return messagesView();
    if (e.target.closest('[data-del]')) {
      if (!confirm('Supprimer toute la conversation ?')) return;
      const r = await sb.from('conversations').delete().eq('id', id);
      if (r.error) return fail(r.error);
      toast('Conversation supprimée'); messagesView();
    }
  };
}

// Temps réel : nouveau message d'un visiteur
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  sb.channel('admin-chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, p => {
      const m = p.new;
      if (m.sender !== 'visitor') return;
      if (openConv === m.conversation_id && document.getElementById('chat')) {
        loadThread(openConv);
        sb.from('conversations').update({ admin_unread: false }).eq('id', openConv).then(updateBadge);
      } else {
        toast('Nouveau message'); updateBadge();
        if (!openConv && document.querySelector('#nav .on')?.dataset.view === 'messages') messagesView();
      }
    }).subscribe();
})();
