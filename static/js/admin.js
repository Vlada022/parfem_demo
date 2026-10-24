// ─── TABS ────────────────────────────────────────────────────────────────────
function showTab(name, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  el.classList.add('active');

  if (name === 'products') loadProducts();
  if (name === 'orders') loadOrders();
  if (name === 'contacts') loadContacts();
  return false;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadProducts();
});

async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.role !== 'admin') {
    window.location.href = '/admin/login';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/admin/login';
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
let products = [];

async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-dim)">Učitavanje...</td></tr>';

  const res = await fetch('/api/products');
  const data = await res.json();
  // Include inactive too - fetch without filter
  const res2 = await fetch('/api/products?all=1');
  products = data.products;
  renderProductsTable(data.products);
}

function renderProductsTable(list) {
  const tbody = document.getElementById('products-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-dim)">Nema proizvoda</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <img class="table-img"
             src="${p.image || ''}"
             alt="${p.name}"
             onerror="this.style.opacity='0.2'">
      </td>
      <td class="table-product-name">${p.name}</td>
      <td><span class="table-brand">${p.brand}</span></td>
      <td>${p.ml}ml</td>
      <td><strong>${formatPrice(p.price)} RSD</strong></td>
      <td>${p.stock}</td>
      <td>
        <span class="status-badge ${p.active ? 'status-active' : 'status-inactive'}">
          ${p.active ? 'Aktivan' : 'Neaktivan'}
        </span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-icon btn-edit" onclick="openProductModal(${p.id})" title="Izmeni">✎</button>
          <button class="btn-icon btn-delete" onclick="deleteProduct(${p.id})" title="Deaktiviraj">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function formatPrice(n) {
  return Number(n).toLocaleString('sr-RS');
}

// ─── PRODUCT MODAL ───────────────────────────────────────────────────────────

// Prikaži/sakrij polje za cenu kad se označi checkbox
function toggleMlPrice(checkbox) {
  const wrap = checkbox.closest('.ml-option-row').querySelector('.ml-price-wrap');
  wrap.style.display = checkbox.checked ? 'flex' : 'none';
  if (checkbox.checked) {
    wrap.querySelector('.ml-price-input').focus();
  }
}

function resetMlOptions() {
  document.querySelectorAll('.ml-check').forEach(cb => {
    cb.checked = false;
    const wrap = cb.closest('.ml-option-row').querySelector('.ml-price-wrap');
    wrap.style.display = 'none';
    wrap.querySelector('.ml-price-input').value = '';
  });
  document.getElementById('ml-options-error').style.display = 'none';
}

// Prikupi selektovane ml opcije sa cenama
function getSelectedMlOptions() {
  const opts = [];
  document.querySelectorAll('.ml-check:checked').forEach(cb => {
    const wrap = cb.closest('.ml-option-row').querySelector('.ml-price-wrap');
    const price = wrap.querySelector('.ml-price-input').value;
    opts.push({ ml: parseInt(cb.value), price: parseFloat(price), stock: 100 });
  });
  return opts;
}

function openProductModal(id) {
  const overlay = document.getElementById('product-overlay');
  const isEdit = !!id;

  document.getElementById('p-active-wrap').style.display = isEdit ? 'block' : 'none';
  document.getElementById('product-modal-title').textContent = isEdit ? 'Izmeni varijantu' : 'Dodaj proizvod';
  document.getElementById('product-save-btn').textContent = isEdit ? 'Sačuvaj izmene' : 'Dodaj proizvod';

  // Resetuj ml opcije
  resetMlOptions();

  if (isEdit) {
    // Editujemo jednu varijantu (jedan ml)
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-brand').value = p.brand;
    document.getElementById('p-desc').value = p.description || '';
    document.getElementById('p-active').checked = !!p.active;
    document.getElementById('p-image-url').value = p.image || '';

    // Označi odgovarajući ml checkbox i popuni cenu
    const mlVal = p.ml >= 1000 ? '9999' : String(p.ml);
    const cb = document.querySelector(`.ml-check[value="${mlVal}"]`);
    if (cb) {
      cb.checked = true;
      const wrap = cb.closest('.ml-option-row').querySelector('.ml-price-wrap');
      wrap.style.display = 'flex';
      wrap.querySelector('.ml-price-input').value = p.price;
      // Zaključaj checkbox da ne može da se skloni (editujemo fiksnu varijantu)
      cb.disabled = true;
    }

    const preview = document.getElementById('img-preview');
    preview.innerHTML = p.image
      ? `<img src="${p.image}" alt="preview">`
      : '<span>Prevucite sliku ili kliknite</span>';
  } else {
    // Novi proizvod – reset svega
    document.getElementById('p-id').value = '';
    document.getElementById('p-name').value = '';
    document.getElementById('p-brand').value = '';
    document.getElementById('p-desc').value = '';
    document.getElementById('p-image-url').value = '';
    document.getElementById('p-image').value = '';
    document.getElementById('img-preview').innerHTML = '<span>Prevucite sliku ili kliknite</span>';
    // Ukloni disabled sa checkboxeva
    document.querySelectorAll('.ml-check').forEach(cb => cb.disabled = false);
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  document.getElementById('product-overlay').classList.remove('open');
  document.body.style.overflow = '';
  // Ukloni disabled sa checkboxeva za sledeće otvaranje
  document.querySelectorAll('.ml-check').forEach(cb => cb.disabled = false);
}

function previewImage(input) {
  const preview = document.getElementById('img-preview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" alt="preview">`; };
    reader.readAsDataURL(input.files[0]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('img-preview').addEventListener('click', () => {
    document.getElementById('p-image').click();
  });
});

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const errEl = document.getElementById('ml-options-error');

  // Pripremi zajedničke podatke
  const name = document.getElementById('p-name').value.trim();
  const brand = document.getElementById('p-brand').value.trim();
  const description = document.getElementById('p-desc').value.trim();
  const active = document.getElementById('p-active').checked ? '1' : '0';
  const imageFile = document.getElementById('p-image').files[0];
  const imageUrl = document.getElementById('p-image-url').value.trim();

  const btn = document.getElementById('product-save-btn');

  if (id) {
    // ── EDIT: ažuriraj jednu varijantu ──────────────────────────────────
    const opts = getSelectedMlOptions();
    if (!opts.length) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const opt = opts[0];
    if (!opt.price || opt.price <= 0) { alert('Unesite cenu za označenu varijantu.'); return; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('brand', brand);
    formData.append('description', description);
    formData.append('ml', opt.ml >= 9999 ? 9999 : opt.ml);
    formData.append('price', opt.price);
    formData.append('stock', opt.stock);
    formData.append('active', active);
    if (imageFile) formData.append('image', imageFile);
    else if (imageUrl) formData.append('image_url', imageUrl);

    btn.textContent = 'Čuvanje...'; btn.disabled = true;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'PUT', body: formData });
      const data = await res.json();
      if (res.ok) { closeProductModal(); loadProducts(); }
      else alert(data.error || 'Greška.');
    } catch { alert('Mrežna greška.'); }
    finally { btn.textContent = 'Sačuvaj izmene'; btn.disabled = false; }

  } else {
    // ── DODAJ: kreiraj po jedan zapis za svaki označeni ml ───────────────
    const opts = getSelectedMlOptions();
    if (!opts.length) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    // Validacija cena
    for (const opt of opts) {
      if (!opt.price || opt.price <= 0) {
        alert(`Unesite cenu za ${opt.ml >= 9999 ? 'ceo parfem' : opt.ml + 'ml'}.`);
        return;
      }
    }

    btn.textContent = 'Čuvanje...'; btn.disabled = true;

    // Pošalji sliku samo uz prvu varijantu, ostale dobijaju isti URL nazad
    let sharedImageUrl = imageUrl;

    try {
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        const formData = new FormData();
        formData.append('name', name);
        formData.append('brand', brand);
        formData.append('description', description);
        formData.append('ml', opt.ml >= 9999 ? 9999 : opt.ml);
        formData.append('price', opt.price);
        formData.append('stock', opt.stock);
        // Sliku šaljemo samo uz prvu varijantu
        if (i === 0 && imageFile) {
          formData.append('image', imageFile);
        } else if (sharedImageUrl) {
          formData.append('image_url', sharedImageUrl);
        }

        const res = await fetch('/api/products', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Greška.'); break; }

        // Nakon prve varijante, uzmi URL koji je server sačuvao
        if (i === 0 && imageFile && data.image_url) {
          sharedImageUrl = data.image_url;
        }
      }
      closeProductModal();
      loadProducts();
    } catch { alert('Mrežna greška.'); }
    finally { btn.textContent = 'Dodaj proizvod'; btn.disabled = false; }
  }
}

async function deleteProduct(id) {
  if (!confirm('Da li ste sigurni da želite da deaktivirate ovaj proizvod?')) return;
  await fetch(`/api/products/${id}`, { method: 'DELETE' });
  loadProducts();
}

// Close product modal on overlay click
document.getElementById('product-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('product-overlay')) closeProductModal();
});

// ─── ORDERS ──────────────────────────────────────────────────────────────────
const statusLabels = {
  u_pripremi: 'U pripremi',
  spakovano: 'Spakovano',
  poslato: 'Poslato',
  preuzeto: 'Preuzeto',
  kompletirano: 'Kompletirano'
};

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-dim)">Učitavanje...</td></tr>';

  const res = await fetch('/api/orders');
  const data = await res.json();
  const orders = data.orders;

  // Stats
  const stats = {};
  orders.forEach(o => { stats[o.status] = (stats[o.status] || 0) + 1; });
  document.getElementById('order-stats').innerHTML = Object.entries(statusLabels)
    .map(([k, v]) => `<span class="order-stat-chip status-badge status-${k}">${v}: ${stats[k] || 0}</span>`)
    .join('');

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-dim)">Nema narudžbina</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>#${o.id}</strong></td>
      <td style="white-space:nowrap;font-size:.8rem;color:var(--text-muted)">${formatDate(o.created_at)}</td>
      <td>
        <div style="font-weight:500">${o.full_name}</div>
      </td>
      <td style="font-size:.8rem;color:var(--text-muted)">
        ${o.email}<br>${o.phone}
      </td>
      <td style="font-size:.8rem;color:var(--text-muted)">
        ${o.street} ${o.street_number},<br>${o.postal_code} ${o.city}
        ${o.note ? `<br><em>${o.note}</em>` : ''}
      </td>
      <td class="order-items-cell">
        ${o.items.map(i => `${i.brand} ${i.name} ${i.ml}ml ×${i.qty}`).join('<br>')}
      </td>
      <td><strong>${formatPrice(o.total)} RSD</strong></td>
      <td>
        <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
          ${Object.entries(statusLabels).map(([k, v]) =>
            `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

async function updateOrderStatus(id, status) {
  await fetch(`/api/orders/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  // Reload stats
  loadOrders();
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('sr-RS') + ' ' + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────
async function loadContacts() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '<p style="color:var(--text-dim)">Učitavanje...</p>';

  const res = await fetch('/api/contacts');
  const data = await res.json();
  const contacts = data.contacts;

  if (!contacts.length) {
    list.innerHTML = '<p style="color:var(--text-dim)">Nema primljenih poruka.</p>';
    return;
  }

  list.innerHTML = contacts.map(c => `
    <div class="contact-card">
      <div class="contact-card-header">
        <div class="contact-card-name">${c.name}</div>
        <div class="contact-card-date">${formatDate(c.created_at)}</div>
      </div>
      <div class="contact-card-email">✉ ${c.email}</div>
      <div class="contact-card-msg">${c.message}</div>
    </div>
  `).join('');
}
