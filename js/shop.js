const $ = s => document.querySelector(s);
let products = [], cats = [], settings = {}, catId = null, q = '';
let openId = null, openImg = 0, showBuy = false, openSize = null;

async function load() {
  const [c, p, s] = await Promise.all([
    sb.from('categories').select('*').eq('active', true).order('sort_order'),
    sb.from('products')
      .select('*, product_images(image_path, sort_order), product_sizes(size, quantity, enabled)')
      .eq('active', true).order('created_at', { ascending: false }),
    sb.from('site_settings').select('*').eq('id', 1).maybeSingle()
  ]);
  if (c.error || p.error) {
    console.error(c.error || p.error);
    $('#grid').innerHTML = '<p class="muted">Impossible de charger les produits. Vérifie js/config.js.</p>';
    return;
  }
  cats = c.data; products = p.data; settings = s.data || {};
  render();
  if (openId) openProduct(openId, true);
}

const imgs = p => [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order);
const sizesOf = p => (p.product_sizes || []).filter(s => s.enabled)
  .sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));

function card(p) {
  const im = imgs(p)[0];
  const av = sizesOf(p).filter(s => s.quantity > 0);
  return `<article class="card" data-id="${p.id}" tabindex="0">
    ${p.is_new ? '<span class="badge">Nouveau</span>' : ''}
    <div class="ph">${im ? `<img loading="lazy" src="${pub('product-images', im.image_path)}" alt="${esc(p.name)}">` : ''}</div>
    <h3>${esc(p.name)}</h3>
    <p class="price">${price(p.price)}</p>
    <p class="muted">${av.length ? av.map(s => s.size).join(' • ') + ' disponibles' : 'Rupture'}</p>
  </article>`;
}

function render() {
  const name = settings.site_name || 'SHOP';
  document.title = name;
  $('#siteName').textContent = name; $('#heroTitle').textContent = name; $('#footName').textContent = name;
  $('#heroDesc').textContent = settings.description || '';

  $('#chips').innerHTML = [`<button class="chip ${catId ? '' : 'on'}" data-cat="">Tout</button>`]
    .concat(cats.map(c => `<button class="chip ${catId === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`)).join('');

  const term = q.trim().toLowerCase();
  const list = products.filter(p => (!catId || p.category_id === catId) &&
    (!term || (p.name + ' ' + p.description).toLowerCase().includes(term)));
  const filtering = !!(catId || term);

  const feat = products.filter(p => p.is_featured), news = products.filter(p => p.is_new);
  $('#featuredBlock').hidden = filtering || !feat.length;
  $('#newBlock').hidden = filtering || !news.length;
  $('#featured').innerHTML = feat.map(card).join('');
  $('#news').innerHTML = news.map(card).join('');
  $('#allTitle').textContent = filtering ? 'Résultats' : 'Tous les produits';
  $('#grid').innerHTML = list.length ? list.map(card).join('') : '<p class="muted">Aucun produit pour le moment.</p>';

  renderContact();
}

function renderContact() {
  const s = settings, sn = handle(s.snapchat), ig = handle(s.instagram);
  const rows = [];
  if (s.contact_text) rows.push(`<p>${esc(s.contact_text)}</p>`);
  if (sn) rows.push(`<a href="https://www.snapchat.com/add/${encodeURIComponent(sn)}" target="_blank" rel="noopener">Snapchat : @${esc(sn)}</a>`);
  if (ig) rows.push(`<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram : @${esc(ig)}</a>`);
  if (s.email) rows.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (s.phone) rows.push(`<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>`);
  if (s.qr_code_path) rows.push(`<img src="${pub('site-assets', s.qr_code_path)}?v=${encodeURIComponent(s.updated_at || '')}" alt="QR code">`);
  $('#contactBox').innerHTML = rows.join('') || '<p class="muted">Contact bientôt disponible.</p>';
}

function openProduct(id, keep) {
  const p = products.find(x => x.id === id);
  if (!p) return closeModal();
  if (!keep) { openImg = 0; showBuy = false; openSize = null; }
  openId = id;
  const im = imgs(p);
  if (openImg >= im.length) openImg = 0;
  const sz = sizesOf(p);
  const sn = handle(settings.snapchat), ig = handle(settings.instagram);
  $('#sheet').innerHTML = `
    <button class="close" aria-label="Fermer" data-close>✕</button>
    <div>
      <div class="main-img">${im.length ? `<img src="${pub('product-images', im[openImg].image_path)}" alt="${esc(p.name)}">` : ''}</div>
      ${im.length > 1 ? `<div class="thumbs">${im.map((i, k) =>
        `<img class="${k === openImg ? 'on' : ''}" data-img="${k}" src="${pub('product-images', i.image_path)}" alt="">`).join('')}</div>` : ''}
    </div>
    <div class="info">
      ${p.is_new ? '<span class="muted">Nouveau</span>' : ''}
      <h2>${esc(p.name)}</h2>
      <p class="price">${price(p.price)}</p>
      <p style="margin-top:10px;white-space:pre-line">${esc(p.description)}</p>
      <ul class="sizes">${sz.map(s => s.quantity > 0
        ? `<li>${s.size}<span>${s.size} — ${s.quantity} disponible${s.quantity > 1 ? 's' : ''}</span></li>`
        : `<li class="out">${s.size}<span>Rupture</span></li>`).join('') || '<li class="muted">Tailles bientôt disponibles</li>'}</ul>
      <button class="btn" data-buy>Acheter / Nous contacter</button>
      ${showBuy ? `<div class="buybox">
        <button class="btn ghost" data-ask>Envoyer un message à propos de ce produit</button>
        <p>Pour acheter « ${esc(p.name)} », contacte-nous directement${sn ? ' sur Snapchat' : ''}. Indique le produit et ta taille.</p>
        ${sn ? `<a class="btn" href="https://www.snapchat.com/add/${encodeURIComponent(sn)}" target="_blank" rel="noopener">Snapchat @${esc(sn)}</a>` : ''}
        ${ig ? `<a class="btn ghost" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a>` : ''}
        ${settings.email ? `<a class="btn ghost" href="mailto:${esc(settings.email)}?subject=${encodeURIComponent(p.name)}">Email</a>` : ''}
        ${settings.qr_code_path ? `<img src="${pub('site-assets', settings.qr_code_path)}" alt="QR code" style="width:140px;background:#fff;padding:6px;border-radius:8px">` : ''}
      </div>` : ''}
    </div>`;
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  openId = null;
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ---- Événements ----
document.addEventListener('click', e => {
  const t = e.target;
  const c = t.closest('.card'); if (c) return openProduct(c.dataset.id);
  const chip = t.closest('.chip'); if (chip) { catId = chip.dataset.cat || null; return render(); }
  if (t.closest('[data-close]') || t === $('#modal')) return closeModal();
  const th = t.closest('[data-img]'); if (th) { openImg = +th.dataset.img; return openProduct(openId, true); }
  if (t.closest('[data-ask]')) {
    const p = products.find(x => x.id === openId);
    closeModal();
    if (getToken()) {
      const ta = $('#chatForm').elements.body;
      ta.value = `À propos de « ${p.name} » : `;
      $('#message').scrollIntoView(); ta.focus();
    } else {
      setAbout(p); $('#message').scrollIntoView(); $('#msgForm').sender_name.focus();
    }
    return;
  }
  if (t.closest('[data-buy]')) { showBuy = true; return openProduct(openId, true); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target.classList?.contains('card')) openProduct(e.target.dataset.id);
});
$('#search').addEventListener('input', e => { q = e.target.value; render(); });

// ---- Discussion ----
const getToken = () => { try { return localStorage.getItem('chatToken'); } catch (_) { return null; } };
const setToken = t => { try { t ? localStorage.setItem('chatToken', t) : localStorage.removeItem('chatToken'); } catch (_) {} };
let about = null, lastCount = -1, poll = null;

function setAbout(p) {
  about = p ? { id: p.id, name: p.name } : null;
  $('#about').hidden = !about;
  $('#about').textContent = about ? `À propos de : ${about.name}` : '';
}
const fmt = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const bubbles = l => l.map(m => `<div class="bub ${m.sender === 'visitor' ? 'me' : 'them'}">${esc(m.body)}<small>${fmt(m.created_at)}</small></div>`).join('');

async function refreshChat(force) {
  const t = getToken(); if (!t) return;
  const { data, error } = await sb.rpc('visitor_get', { p_token: t });
  if (error) { console.error(error); return; }
  if (!data.length) { setToken(null); showChat(); return; }      // conversation supprimée
  if (force || data.length !== lastCount) {
    lastCount = data.length;
    const c = $('#chat'), bottom = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    c.innerHTML = bubbles(data);
    if (bottom || force) c.scrollTop = c.scrollHeight;
  }
}
function showChat() {
  const t = getToken();
  $('#chatBox').hidden = !t; $('#msgForm').hidden = !!t;
  clearInterval(poll);
  if (t) { lastCount = -1; refreshChat(true); poll = setInterval(() => { if (!document.hidden) refreshChat(); }, 4000); }
}

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
// répondre dans la conversation
$('#chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, ta = f.elements.body, body = ta.value.trim(), st = $('#msgStatus');
  if (!body) return;
  const btn = f.querySelector('button'); btn.disabled = true;
  const { error } = await sb.rpc('visitor_send', { p_token: getToken(), p_body: body });
  btn.disabled = false;
  if (error) { console.error(error); st.textContent = 'Message non envoyé. Réessaie dans quelques secondes.'; return; }
  st.textContent = ''; ta.value = ''; refreshChat(true);
});
$('#chatForm').elements.body.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.form.requestSubmit(); }
});
$('#newChat').addEventListener('click', () => {
  if (confirm('Commencer une nouvelle conversation ? Tu ne verras plus celle-ci sur cet appareil.')) { setToken(null); setAbout(null); showChat(); }
});
showChat();

// ---- Temps réel : tout changement admin met le site à jour ----
let timer;
const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
const ch = sb.channel('shop-public');
['products', 'product_sizes', 'product_images', 'categories', 'site_settings'].forEach(table =>
  ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
ch.subscribe();

load();
