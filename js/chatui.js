// Affichage de discussion partagé (site public + admin)
const ChatUI = {
  time: d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  dayLabel(d) {
    const x = new Date(d), same = (a, b) => a.toDateString() === b.toDateString();
    if (same(x, new Date())) return "Aujourd'hui";
    if (same(x, new Date(Date.now() - 864e5))) return 'Hier';
    return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  },

  // me = 'visitor' ou 'admin' ; modAll = l'admin peut supprimer les messages des autres
  html(msgs, me, modAll) {
    let out = '', prevDay = '', prevSender = null;
    msgs.forEach((m, i) => {
      const day = new Date(m.created_at).toDateString();
      if (day !== prevDay) { out += `<div class="daysep"><span>${esc(this.dayLabel(m.created_at))}</span></div>`; prevDay = day; prevSender = null; }
      const nx = msgs[i + 1];
      const last = !nx || nx.sender !== m.sender || new Date(nx.created_at).toDateString() !== day;
      const mine = m.sender === me;
      const acts = m.deleted ? '' : mine
        ? `<button data-edit="${m.id}">Modifier</button><button data-del="${m.id}">Supprimer</button>`
        : (modAll ? `<button data-del="${m.id}">Supprimer</button>` : '');
      out += `<div class="msg ${mine ? 'me' : 'them'} ${prevSender === m.sender ? 'cont' : ''} ${acts ? 'can' : ''}">
        <div class="bub ${m.deleted ? 'gone' : ''}">${m.deleted ? 'Message supprimé' : esc(m.body) + (m.edited_at ? '<span class="ed">modifié</span>' : '')}</div>
        ${acts ? `<div class="acts2">${acts}</div>` : ''}
        ${last ? `<small>${this.time(m.created_at)}</small>` : ''}</div>`;
      prevSender = m.sender;
    });
    return out;
  },

  // Clic sur une bulle = affiche Modifier / Supprimer
  bind(box, { onEdit, onDelete }) {
    box.addEventListener('click', e => {
      const ed = e.target.closest('[data-edit]'); if (ed) return onEdit(ed.dataset.edit);
      const del = e.target.closest('[data-del]'); if (del) return onDelete(del.dataset.del);
      const msg = e.target.closest('.msg.can');
      if (!msg || !e.target.closest('.bub')) return;
      const was = msg.classList.contains('open');
      box.querySelectorAll('.msg.open').forEach(x => x.classList.remove('open'));
      if (!was) msg.classList.add('open');
    });
  },

  // Zone de saisie : Entrée envoie (ordinateur), mode modification
  // onSubmit(body, editId) doit renvoyer true si OK
  composer(form, onSubmit) {
    const ta = form.elements.body, banner = form.parentElement.querySelector('.editing');
    let editId = null;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
    const stop = () => { editId = null; banner.hidden = true; ta.value = ''; grow(); };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); form.requestSubmit(); }
    });
    banner.querySelector('[data-cancel]').onclick = stop;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      const btn = form.querySelector('button'); btn.disabled = true;
      let ok = false;
      try { ok = await onSubmit(body, editId); } finally { btn.disabled = false; }
      if (ok) stop();
    });
    return {
      edit(id, text) { editId = id; banner.hidden = false; ta.value = text; ta.focus(); grow(); },
      prefill(text) { ta.value = text; ta.focus(); grow(); },
      stop
    };
  }
};
