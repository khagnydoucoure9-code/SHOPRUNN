// Discussion côté admin : remplace l'ancienne liste de messages de admin.js
let openConv = null, convs = [], convFilter = 'all', convQuery = '', msgs = [], composer = null;

const when = d => new Date(d).toDateString() === new Date().toDateString()
  ? ChatUI.time(d) : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const avatar = n => {
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="av" style="background:hsl(${h} 40% 32%)">${esc((n[0] || '?').toUpperCase())}</span>`;
};

async function updateBadge() {
  const { count } = await sb.from('conversations').select('id', { count: 'exact', head: true }).eq('admin_unread', true);
  const b = document.querySelector('[data-view=messages]');
  if (b) b.textContent = 'Messages' + (count ? ` (${count})` : '');
}

async function messagesView() {
  openConv = null;
  main.innerHTML = `<h1>Messages</h1>
    <div class="convtools">
      <input id="convq" type="search" placeholder="Rechercher une personne" value="${esc(convQuery)}">
      <div class="chips"><button class="chip ${convFilter === 'all' ? 'on' : ''}" data-f="all">Tous</button>
        <button class="chip ${convFilter === 'unread' ? 'on' : ''}" data-f="unread">Non lus</button></div>
    </div><div id="convlist"><p class="muted">Chargement…</p></div>`;
  $('#convq').oninput = e => { convQuery = e.target.value; renderList(); };
  main.onclick = e => {
    const chip = e.target.closest('.chip');
    if (chip) { convFilter = chip.dataset.f; main.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === chip)); return renderList(); }
    const r = e.target.closest('[data-open]'); if (r) threadView(r.dataset.open).catch(fail);
  };
  await reloadConvs();
}

async function reloadConvs() {
  const { data, error } = await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(200);
  if (error) throw error;
  convs = data; renderList(); updateBadge();
}

function renderList() {
  const box = document.getElementById('convlist'); if (!box) return;
  const q = convQuery.trim().toLowerCase();
  const list = convs.filter(c => (convFilter === 'all' || c.admin_unread) &&
    (!q || c.visitor_name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q)));
  box.innerHTML = list.map(c => `<div class="conv ${c.admin_unread ? 'unread' : ''}" data-open="${c.id}">
    ${avatar(c.visitor_name)}
    <div class="mid"><div class="top"><b>${esc(c.visitor_name)}</b><span class="muted">${when(c.last_message_at)}</span></div>
      <div class="prev">${c.last_sender === 'admin' ? 'Toi : ' : ''}${esc(c.last_preview || '')}</div>
      <span class="muted">${esc(c.contact)}${c.product_name ? ' · ' + esc(c.product_name) : ''}</span></div>
    ${c.admin_unread ? '<span class="dot"></span>' : ''}</div>`).join('') || '<p class="muted">Aucune conversation.</p>';
}

async function loadThread(id, force) {
  const chat = document.getElementById('chat');
  if (!chat || openConv !== id) return;
  const { data, error } = await sb.from('chat_messages').select('*').eq('conversation_id', id).order('created_at');
  if (error) return fail(error);
  const bottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
  msgs = data; chat.innerHTML = ChatUI.html(data, 'admin', true);
  if (force || bottom) chat.scrollTop = chat.scrollHeight;
}

async function threadView(id) {
  const c = convs.find(x => x.id === id) || (await sb.from('conversations').select('*').eq('id', id).single()).data;
  if (!c) return;
  openConv = id;
  main.innerHTML = `<div class="threadhead">
      <button class="btn ghost" data-back aria-label="Retour">←</button>${avatar(c.visitor_name)}
      <div class="grow"><b>${esc(c.visitor_name)}</b><br><span class="muted">${esc(c.contact)}${c.product_name ? ' · ' + esc(c.product_name) : ''}</span></div>
      <button class="btn danger" data-delconv>Supprimer</button></div>
    <div class="chatwrap" style="max-width:none">
      <div class="chat" id="chat"></div>
      <div class="editing" hidden><span>✎ Modification du message</span><button type="button" data-cancel aria-label="Annuler">✕</button></div>
      <form class="composer" id="reply"><textarea name="body" rows="1" maxlength="1000" placeholder="Écris une réponse…" required></textarea>
        <button class="send" type="submit" aria-label="Envoyer">➤</button></form></div>`;

  composer = ChatUI.composer($('#reply'), async (body, editId) => {
    const r = editId
      ? await sb.from('chat_messages').update({ body, edited_at: new Date().toISOString() }).eq('id', editId)
      : await sb.from('chat_messages').insert({ conversation_id: id, sender: 'admin', body });
    if (r.error) { fail(r.error); return false; }
    await loadThread(id, true); return true;
  });
  ChatUI.bind($('#chat'), {
    onEdit: mid => { const m = msgs.find(x => x.id === mid); if (m) composer.edit(mid, m.body); },
    onDelete: async mid => {
      if (!confirm('Supprimer ce message ?')) return;
      const r = await sb.from('chat_messages').update({ deleted: true, body: 'Message supprimé' }).eq('id', mid);
      if (r.error) return fail(r.error);
      loadThread(id);
    }
  });
  main.onclick = async e => {
    if (e.target.closest('[data-back]')) return messagesView();
    if (e.target.closest('[data-delconv]')) {
      if (!confirm('Supprimer toute la conversation ?')) return;
      const r = await sb.from('conversations').delete().eq('id', id);
      if (r.error) return fail(r.error);
      toast('Conversation supprimée'); messagesView();
    }
  };
  await loadThread(id, true);
  if (c.admin_unread) { await sb.from('conversations').update({ admin_unread: false }).eq('id', id); c.admin_unread = false; updateBadge(); }
}

// Temps réel : nouveaux messages, modifications, suppressions
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  sb.channel('admin-chat')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, p => {
      const m = p.new; if (!m || !m.conversation_id) return;
      if (openConv === m.conversation_id && document.getElementById('chat')) {
        loadThread(openConv);
        if (p.eventType === 'INSERT' && m.sender === 'visitor')
          sb.from('conversations').update({ admin_unread: false }).eq('id', openConv).then(updateBadge);
        return;
      }
      if (p.eventType === 'INSERT' && m.sender === 'visitor') toast('Nouveau message');
      updateBadge();
      if (document.getElementById('convlist')) reloadConvs().catch(() => {});
    }).subscribe();
})();
