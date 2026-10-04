const $ = s => document.querySelector(s);
const main = $('#main');
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
const fail = e => { console.error(e); alert('Erreur : ' + (e.message || e)); };
const ext = f => (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

// ---------------------------------------------------------------- navigation
async function go(view, arg) {
  if (view === 'logout') return Auth.logout();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === (view === 'form' ? 'products' : view)));
  main.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    if (view === 'dashboard') await dashboard();
    else if (view === 'products') await productList();
    else if (view === 'new') await productForm(null);
    else if (view === 'form') await productForm(arg);
    else if (view === 'categories') await categories();
    else if (view === 'contact') await settingsForm('Contact', [
      ['snapchat', 'Snapchat (pseudo)'], ['instagram', 'Instagram (pseudo)'],
      ['email', 'Email'], ['phone', 'Téléphone'], ['contact_text', 'Texte de contact', true]]);
    else if (view === 'settings') await settingsForm('Paramètres', [
      ['site_name', 'Nom du site'], ['description', 'Description', true]]);
    else if (view === 'qr') await qrView();
  } catch (e) { fail(e); }
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });

// ---------------------------------------------------------------- dashboard
async function dashboard() {
  const cnt = f => f(sb.from('products').select('id', { count: 'exact', head: true })).then(r => r.count || 0);
  const [total, active, news, feat, cats, recent] = await Promise.all([
    cnt(x => x), cnt(x => x.eq('active', true)), cnt(x => x.eq('is_new', true)), cnt(x => x.eq('is_featured', true)),
    sb.from('categories').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
    sb.from('products').select('id,name,price,created_at').order('created_at', { ascending: false }).limit(5)
  ]);
  const st = (n, l) => `<div class="stat"><b>${n}</b>${l}</div>`;
  main.innerHTML = `<h1>Dashboard</h1>
    <div class="stats">${st(total, 'Produits')}${st(active, 'Actifs')}${st(cats, 'Catégories')}${st(news, 'Nouveautés')}${st(feat, 'Mis en avant')}</div>
    <h2>Ajoutés récemment</h2>
    ${(recent.data || []).map(p => `<div class="row"><span class="grow">${esc(p.name)}</span><span class="price">${price(p.price)}</span>
      <button class="btn ghost" data-edit="${p.id}">Modifier</button></div>`).join('') || '<p class="muted">Aucun produit.</p>'}`;
  main.onclick = e => { const b = e.target.closest('[data-edit]'); if (b) go('form', b.dataset.edit); };
}

// ---------------------------------------------------------------- liste produits
async function productList() {
  const { data, error } = await sb.from('products')
    .select('*, categories(name), product_images(image_path,sort_order), product_sizes(size,quantity,enabled)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  main.innerHTML = `<h1>Produits</h1>` + (data.map(p => {
    const im = [...p.product_images].sort((a, b) => a.sort_order - b.sort_order)[0];
    const stock = SIZES.map(s => p.product_sizes.find(x => x.size === s)).filter(x => x && x.enabled).map(x => `${x.size}:${x.quantity}`).join(' ');
    return `<div class="row">
      ${im ? `<img src="${pub('product-images', im.image_path)}" alt="">` : '<img alt="">'}
      <div class="grow"><b>${esc(p.name)}</b> <span class="price">${price(p.price)}</span><br>
        <span class="muted">${esc(p.categories?.name || 'Sans catégorie')} · ${stock || 'aucune taille'}</span><br>
        <span class="tag ${p.active ? 'ok' : ''}">${p.active ? 'Actif' : 'Masqué'}</span>
        ${p.is_new ? '<span class="tag ok">Nouveau</span>' : ''}${p.is_featured ? '<span class="tag ok">À la une</span>' : ''}</div>
      <div class="acts"><button class="btn ghost" data-edit="${p.id}">Modifier</button>
        <button class="btn danger" data-del="${p.id}" data-name="${esc(p.name)}">Supprimer</button></div></div>`;
  }).join('') || '<p class="muted">Aucun produit. Clique sur « Ajouter un produit ».</p>');
  main.onclick = async e => {
    const ed = e.target.closest('[data-edit]'); if (ed) return go('form', ed.dataset.edit);
    const del = e.target.closest('[data-del]'); if (!del) return;
    if (!confirm(`Supprimer « ${del.dataset.name} » et toutes ses images ?`)) return;
    try {
      const { data: im } = await sb.from('product_images').select('image_path').eq('product_id', del.dataset.del);
      if (im?.length) await sb.storage.from('product-images').remove(im.map(i => i.image_path));
      // ON DELETE CASCADE supprime product_images + product_sizes
      const { error } = await sb.from('products').delete().eq('id', del.dataset.del);
      if (error) throw error;
      toast('Produit supprimé'); productList();
    } catch (err) { fail(err); }
  };
}

// ---------------------------------------------------------------- formulaire produit
async function productForm(id) {
  const cats = (await sb.from('categories').select('*').order('sort_order')).data || [];
  let p = { name: '', description: '', price: '', category_id: '', active: true, is_new: false, is_featured: false };
  const sizes = {}; let imgs = []; const removed = [];
  if (id) {
    const { data, error } = await sb.from('products').select('*, product_images(*), product_sizes(*)').eq('id', id).single();
    if (error) throw error;
    p = data; data.product_sizes.forEach(s => sizes[s.size] = s);
    imgs = data.product_images.sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({ id: i.id, path: i.image_path, url: pub('product-images', i.image_path) }));
  }
  main.innerHTML = `<h1>${id ? 'Modifier' : 'Ajouter'} un produit</h1>
  <form class="form" id="pf">
    <label>Nom<input name="name" required value="${esc(p.name)}"></label>
    <label>Description<textarea name="description" rows="4">${esc(p.description)}</textarea></label>
    <div class="two">
      <label>Prix (🎾)<input name="price" type="number" min="0" step="0.5" required value="${esc(p.price)}"></label>
      <label>Catégorie<select name="category_id"><option value="">Sans catégorie</option>
        ${cats.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}${c.active ? '' : ' (masquée)'}</option>`).join('')}</select></label>
    </div>
    <div class="checks">
      <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''}>Actif</label>
      <label><input type="checkbox" name="is_new" ${p.is_new ? 'checked' : ''}>Nouveau</label>
      <label><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}>Mis en avant</label>
    </div>
    <h2>Images</h2>
    <input type="file" id="files" accept="image/*" multiple>
    <p class="muted">La première image est l'image principale. Utilise ◀ ▶ pour l'ordre, ★ pour la choisir comme principale.</p>
    <div class="imgs" id="imgs"></div>
    <h2>Tailles et stock</h2>
    ${SIZES.map(s => `<div class="sizerow"><b>${s}</b>
      <label><input type="checkbox" name="e_${s}" ${(sizes[s] ? sizes[s].enabled : true) ? 'checked' : ''}>Proposée</label>
      <input type="number" min="0" step="1" name="q_${s}" value="${sizes[s] ? sizes[s].quantity : 0}" aria-label="Quantité ${s}"></div>`).join('')}
    <button class="btn" type="submit" id="save">Enregistrer</button>
  </form>`;

  const draw = () => {
    $('#imgs').innerHTML = imgs.map((im, i) => `<div class="tile ${i === 0 ? 'main' : ''}">
      <img src="${im.url}" alt=""><div class="muted">${i === 0 ? 'Principale' : '#' + (i + 1)}${im.file ? ' · nouvelle' : ''}</div>
      <button type="button" data-a="l" data-i="${i}" aria-label="Avant">◀</button>
      <button type="button" data-a="s" data-i="${i}" aria-label="Principale">★</button>
      <button type="button" data-a="r" data-i="${i}" aria-label="Après">▶</button>
      <button type="button" data-a="x" data-i="${i}" aria-label="Supprimer">✕</button></div>`).join('');
  };
  draw();
  $('#files').onchange = e => {
    [...e.target.files].forEach(f => imgs.push({ file: f, url: URL.createObjectURL(f) }));
    e.target.value = ''; draw();
  };
  $('#imgs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i, a = b.dataset.a;
    if (a === 'l' && i > 0) [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]];
    if (a === 'r' && i < imgs.length - 1) [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]];
    if (a === 's') imgs.unshift(imgs.splice(i, 1)[0]);
    if (a === 'x') { const [r] = imgs.splice(i, 1); if (r.id) removed.push(r); }
    draw();
  };

  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#save'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const f = new FormData(e.target);
      const row = {
        name: f.get('name').trim(), description: f.get('description'),
        price: parseFloat(f.get('price')) || 0, category_id: f.get('category_id') || null,
        active: f.has('active'), is_new: f.has('is_new'), is_featured: f.has('is_featured')
      };
      let pid = id;
      if (id) { const r = await sb.from('products').update(row).eq('id', id); if (r.error) throw r.error; }
      else { const r = await sb.from('products').insert(row).select('id').single(); if (r.error) throw r.error; pid = r.data.id; }

      if (removed.length) {
        await sb.storage.from('product-images').remove(removed.map(i => i.path));
        const r = await sb.from('product_images').delete().in('id', removed.map(i => i.id)); if (r.error) throw r.error;
      }
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
        if (im.file) {
          const path = `${pid}/${crypto.randomUUID()}.${ext(im.file)}`;
          const up = await sb.storage.from('product-images').upload(path, im.file, { contentType: im.file.type });
          if (up.error) throw up.error;
          const r = await sb.from('product_images').insert({ product_id: pid, image_path: path, sort_order: i }); if (r.error) throw r.error;
        } else {
          const r = await sb.from('product_images').update({ sort_order: i }).eq('id', im.id); if (r.error) throw r.error;
        }
      }
      const rows = SIZES.map(s => ({
        product_id: pid, size: s, enabled: f.has('e_' + s),
        quantity: Math.max(0, parseInt(f.get('q_' + s)) || 0)
      }));
      const r = await sb.from('product_sizes').upsert(rows, { onConflict: 'product_id,size' }); if (r.error) throw r.error;
      toast('Produit enregistré'); go('products');
    } catch (err) { fail(err); btn.disabled = false; btn.textContent = 'Enregistrer'; }
  };
}

// ---------------------------------------------------------------- catégories
async function categories() {
  const { data, error } = await sb.from('categories').select('*').order('sort_order');
  if (error) throw error;
  const list = data;
  main.innerHTML = `<h1>Catégories</h1>
    <div class="row"><input type="text" id="newcat" placeholder="Nouvelle catégorie"><button class="btn" id="add">Ajouter</button></div>
    ${list.map((c, i) => `<div class="row" data-id="${c.id}" data-i="${i}">
      <input type="text" value="${esc(c.name)}" aria-label="Nom">
      <label class="checks" style="margin:0"><input type="checkbox" ${c.active ? 'checked' : ''}> Active</label>
      <div class="acts"><button class="btn ghost" data-a="up">↑</button><button class="btn ghost" data-a="down">↓</button>
      <button class="btn" data-a="save">Enregistrer</button><button class="btn danger" data-a="del">Supprimer</button></div></div>`).join('')}`;
  $('#add').onclick = async () => {
    const name = $('#newcat').value.trim(); if (!name) return;
    const r = await sb.from('categories').insert({ name, sort_order: list.length });
    if (r.error) return fail(r.error); toast('Catégorie ajoutée'); categories();
  };
  main.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const row = b.closest('.row'), i = +row.dataset.i, id = row.dataset.id, a = b.dataset.a;
    try {
      if (a === 'save') {
        const r = await sb.from('categories').update({ name: row.querySelector('input[type=text]').value.trim(), active: row.querySelector('input[type=checkbox]').checked }).eq('id', id);
        if (r.error) throw r.error; toast('Enregistré');
      } else if (a === 'del') {
        if (!confirm('Supprimer cette catégorie ? Ses produits resteront, sans catégorie.')) return;
        const r = await sb.from('categories').delete().eq('id', id); if (r.error) throw r.error; categories();
      } else {
        const j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        await Promise.all(list.map((c, k) => sb.from('categories').update({ sort_order: k }).eq('id', c.id)));
        categories();
      }
    } catch (err) { fail(err); }
  };
}

// ---------------------------------------------------------------- contact + paramètres (site_settings)
async function settingsForm(title, fields) {
  const { data } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
  const s = data || {};
  main.innerHTML = `<h1>${title}</h1><form class="form" id="sf">
    ${fields.map(([k, l, area]) => `<label>${l}${area
      ? `<textarea name="${k}" rows="3">${esc(s[k])}</textarea>`
      : `<input name="${k}" value="${esc(s[k])}">`}</label>`).join('')}
    <button class="btn" type="submit">Enregistrer</button></form>`;
  main.onclick = null;
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const row = { id: 1 }; fields.forEach(([k]) => row[k] = e.target[k].value.trim());
    const r = await sb.from('site_settings').upsert(row);
    r.error ? fail(r.error) : toast('Enregistré');
  };
}

// ---------------------------------------------------------------- QR code
async function qrView() {
  const { data } = await sb.from('site_settings').select('qr_code_path').eq('id', 1).maybeSingle();
  const cur = data?.qr_code_path;
  main.innerHTML = `<h1>QR Code</h1>
    ${cur ? `<img class="qrimg" src="${pub('site-assets', cur)}?v=${Date.now()}" alt="QR actuel">` : '<p class="muted">Aucun QR code pour le moment.</p>'}
    <input type="file" id="qrfile" accept="image/*"><br><br>
    <button class="btn" id="qrup">${cur ? 'Remplacer' : 'Envoyer'}</button>
    ${cur ? '<button class="btn danger" id="qrdel">Supprimer</button>' : ''}`;
  main.onclick = null;
  $('#qrup').onclick = async () => {
    const f = $('#qrfile').files[0]; if (!f) return alert('Choisis une image.');
    try {
      const path = `qr/${Date.now()}.${ext(f)}`;
      const up = await sb.storage.from('site-assets').upload(path, f, { contentType: f.type }); if (up.error) throw up.error;
      const r = await sb.from('site_settings').upsert({ id: 1, qr_code_path: path }); if (r.error) throw r.error;
      if (cur) await sb.storage.from('site-assets').remove([cur]);
      toast('QR code mis à jour'); qrView();
    } catch (err) { fail(err); }
  };
  if (cur) $('#qrdel').onclick = async () => {
    if (!confirm('Supprimer le QR code ?')) return;
    try {
      const r = await sb.from('site_settings').upsert({ id: 1, qr_code_path: null }); if (r.error) throw r.error;
      await sb.storage.from('site-assets').remove([cur]);
      toast('QR code supprimé'); qrView();
    } catch (err) { fail(err); }
  };
}

// ---------------------------------------------------------------- démarrage (garde admin)
(async () => {
  const session = await Auth.guard();
  if (!session) return;
  document.body.classList.remove('hidden');
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
  go('dashboard');
})();
