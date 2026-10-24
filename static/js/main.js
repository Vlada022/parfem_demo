// ─── STATE ───────────────────────────────────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let allProducts = [];
let allBrands = [];
let activeBrand = '';

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  renderCart();

  window.addEventListener('scroll', () => {
    const h = document.getElementById('header');
    h.style.boxShadow = window.scrollY > 50 ? '0 2px 30px rgba(0,0,0,.5)' : '';
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
});

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    allProducts = data.products;
    allBrands = data.brands;
    renderBrands(allBrands);
    renderProducts(allProducts);
  } catch {
    document.getElementById('products-grid').innerHTML =
      '<div class="empty-state"><p>Greška pri učitavanju. Osvežite stranicu.</p></div>';
  }
}

function renderBrands(brands) {
  const wrap = document.getElementById('brand-filters');
  wrap.querySelectorAll('.brand-btn:not(:first-child)').forEach(b => b.remove());
  brands.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'brand-btn';
    btn.textContent = b;
    btn.onclick = () => selectBrand(b, btn);
    wrap.appendChild(btn);
  });
}

function selectBrand(brand, el) {
  activeBrand = brand;
  document.querySelectorAll('.brand-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  filterProducts();
}

function filterProducts() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  let filtered = allProducts;
  if (activeBrand) filtered = filtered.filter(p => p.brand === activeBrand);
  if (search) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(search) || p.brand.toLowerCase().includes(search)
  );
  renderProducts(filtered);
}

// ── Grupisanje po brend+naziv ─────────────────────────────────────────────────
function groupProducts(products) {
  const map = new Map();
  products.forEach(p => {
    const key = p.brand + '|||' + p.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  // Sortiraj varijante po ml unutar grupe
  map.forEach(variants => variants.sort((a, b) => a.ml - b.ml));
  return Array.from(map.values());
}

// ML labele
function mlLabel(ml) {
  if (ml >= 1000) return 'Ceo parfem';
  return ml + 'ml';
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state"><p>Nema pronađenih proizvoda.</p></div>';
    return;
  }

  const groups = groupProducts(products);

  grid.innerHTML = groups.map((variants, gi) => {
    const p = variants[0]; // Reprezentativni proizvod za sliku/opis
    const selectId = `ml-select-${gi}`;
    const optionsHtml = variants.map(v =>
      `<option value="${v.id}" data-price="${v.price}">${mlLabel(v.ml)} – ${formatPrice(v.price)} RSD</option>`
    ).join('');

    return `
    <article class="product-card">
      <div class="product-img-wrap">
        <img src="${p.image || 'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=400'}"
             alt="${p.name}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=400'">
      </div>
      <div class="product-body">
        <div class="product-brand">${p.brand}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || ''}</div>

        <div class="ml-selector-wrap">
          <label class="ml-label">Odaberite količinu:</label>
          <div class="ml-select-row">
            <select class="ml-select" id="${selectId}" onchange="onMlChange('${selectId}', '${gi}')">
              <option value="" data-price="">– Izaberite ml –</option>
              ${optionsHtml}
            </select>
          </div>
          <div class="ml-notice" id="notice-${gi}">
            ⚠ Molimo izaberite količinu pre dodavanja u korpu.
          </div>
        </div>

        <div class="product-footer">
          <div class="product-price" id="price-display-${gi}">
            <span class="price-placeholder">Izaberite količinu</span>
          </div>
          <button class="add-to-cart-btn" onclick="addToCart('${selectId}', '${gi}')" title="Dodaj u korpu">+</button>
        </div>
      </div>
    </article>
  `;
  }).join('');
}

function onMlChange(selectId, gi) {
  const sel = document.getElementById(selectId);
  const notice = document.getElementById(`notice-${gi}`);
  const priceDisplay = document.getElementById(`price-display-${gi}`);

  notice.classList.remove('show');

  if (sel.value) {
    const price = sel.options[sel.selectedIndex].dataset.price;
    priceDisplay.innerHTML = `${formatPrice(price)}<small>RSD</small>`;
  } else {
    priceDisplay.innerHTML = '<span class="price-placeholder">Izaberite količinu</span>';
  }
}

function formatPrice(n) {
  return Number(n).toLocaleString('sr-RS');
}

// ─── CART ────────────────────────────────────────────────────────────────────
function addToCart(selectId, gi) {
  const sel = document.getElementById(selectId);
  const notice = document.getElementById(`notice-${gi}`);

  // Validacija – mora biti izabrana količina
  if (!sel.value) {
    notice.classList.add('show');
    sel.classList.add('ml-select-error');
    setTimeout(() => sel.classList.remove('ml-select-error'), 1500);
    return;
  }
  notice.classList.remove('show');

  const productId = parseInt(sel.value);
  const p = allProducts.find(p => p.id === productId);
  if (!p) return;

  const existing = cart.find(i => i.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, brand: p.brand, ml: p.ml, price: p.price, image: p.image, qty: 1 });
  }
  saveCart();
  renderCart();

  // Feedback na dugmetu
  const btn = event.currentTarget;
  btn.textContent = '✓';
  btn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
  setTimeout(() => { btn.textContent = '+'; btn.style.background = ''; }, 900);

  // Reset selekta
  sel.value = '';
  onMlChange(selectId, gi);
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function renderCart() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cart-count');
  countEl.textContent = count > 0 ? count : '';

  const listEl = document.getElementById('cart-items-list');
  const footerEl = document.getElementById('cart-footer');

  if (!cart.length) {
    listEl.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">◇</div><p>Korpa je prazna</p></div>`;
    footerEl.style.display = 'none';
    return;
  }

  listEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img"
           src="${item.image || ''}"
           alt="${item.name}"
           onerror="this.style.display='none'">
      <div class="cart-item-info">
        <div class="cart-item-brand">${item.brand}</div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-ml">${mlLabel(item.ml)}</div>
      </div>
      <div class="cart-item-right">
        <div class="cart-item-price">${formatPrice(item.price * item.qty)} RSD</div>
        <div class="cart-item-qty">
          <button onclick="changeQty(${item.id}, -1)">−</button>
          <span>${item.qty}</span>
          <button onclick="changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
    </div>
  `).join('');

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('cart-total-price').textContent = formatPrice(total) + ' RSD';
  footerEl.style.display = 'flex';
}

function toggleCart() {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  const open = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

// ─── CHECKOUT ────────────────────────────────────────────────────────────────
function openCheckout() {
  if (!cart.length) return;
  toggleCart();
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('order-summary').innerHTML = `
    <div class="order-summary-title">Pregled narudžbine</div>
    ${cart.map(i => `
      <div class="order-summary-item">
        <span>${i.brand} ${i.name} ${mlLabel(i.ml)} × ${i.qty}</span>
        <span>${formatPrice(i.price * i.qty)} RSD</span>
      </div>
    `).join('')}
    <div class="order-summary-total">
      <span>Ukupno</span>
      <span>${formatPrice(total)} RSD</span>
    </div>
  `;
  document.getElementById('checkout-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkout-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function placeOrder(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('o-name').value.trim(),
    email: document.getElementById('o-email').value.trim(),
    phone: document.getElementById('o-phone').value.trim(),
    street: document.getElementById('o-street').value.trim(),
    street_number: document.getElementById('o-street-number').value.trim(),
    city: document.getElementById('o-city').value.trim(),
    postal_code: document.getElementById('o-postal').value.trim(),
    note: document.getElementById('o-note').value.trim(),
    items: cart.map(i => ({ id: i.id, name: i.name, brand: i.brand, ml: i.ml, price: i.price, qty: i.qty }))
  };

  const btn = e.target.querySelector('[type="submit"]');
  btn.textContent = 'Slanje...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      closeCheckout();
      cart = [];
      saveCart();
      renderCart();
      document.getElementById('checkout-form').reset();
      document.getElementById('success-overlay').classList.add('open');
    } else {
      alert(data.error || 'Greška pri naručivanju.');
    }
  } catch {
    alert('Mrežna greška. Pokušajte ponovo.');
  } finally {
    btn.textContent = 'Potvrdi narudžbinu';
    btn.disabled = false;
  }
}

function closeSuccess() {
  document.getElementById('success-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── CONTACT FORM ────────────────────────────────────────────────────────────
async function submitContact(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Slanje...';
  btn.disabled = true;

  const payload = {
    name: document.getElementById('c-name').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    message: document.getElementById('c-message').value.trim()
  };

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      e.target.reset();
      btn.textContent = '✓ Poruka poslata!';
      btn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
      setTimeout(() => {
        btn.textContent = 'Pošalji poruku';
        btn.style.background = '';
        btn.disabled = false;
      }, 3000);
    } else {
      alert('Greška pri slanju poruke.');
      btn.textContent = 'Pošalji poruku';
      btn.disabled = false;
    }
  } catch {
    alert('Mrežna greška.');
    btn.textContent = 'Pošalji poruku';
    btn.disabled = false;
  }
}

document.addEventListener('click', e => {
  if (e.target.id === 'checkout-overlay') closeCheckout();
  if (e.target.id === 'success-overlay') closeSuccess();
});

// ─── MOBILE MENU ─────────────────────────────────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('hamburger');
  const open = menu.classList.toggle('open');
  btn.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCheckout();
    closeSuccess();
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar.classList.contains('open')) toggleCart();
  }
});
