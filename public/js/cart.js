// public/js/cart.js
(function(){
  function qs(sel, ctx=document){ return ctx.querySelector(sel); }
  function ce(tag, cls){ const el = document.createElement(tag); if (cls) el.className = cls; return el; }
  function setHTMLSafe(el, html){
    if (!el) return;
    try {
      if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
      el.innerHTML = String(html||'');
    } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
  }
  function getAuthHeaders(){
    try {
      // Try multiple storage locations
      const t = localStorage.getItem('token') || localStorage.getItem('authToken');
      if (!t) {
        return {};
      }
      const token = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      return { 'Authorization': token };
    } catch(_) {
      return {};
    }
  }
  async function getJson(url){
    try {
      const r = await fetch(url, { headers: getAuthHeaders() });
      try{ return await r.json(); } catch(_){ return { success:false, message:'Bad JSON' }; }
    } catch (e) {
      return { success:false, message:'Network error' };
    }
  }
  async function postJson(url, body){
    try {
      const r = await fetch(url, { method:'POST', headers:Object.assign({ 'Content-Type':'application/json' }, getAuthHeaders()), body: JSON.stringify(body||{}) });
      try{ return await r.json(); } catch(_){ return { success:false, message:'Bad JSON' }; }
    } catch (e) {
      return { success:false, message:'Network error' };
    }
  }
  async function del(url){
    try {
      const r = await fetch(url, { method:'DELETE', headers: getAuthHeaders() });
      try{ return await r.json(); } catch(_){ return { success:false, message:'Bad JSON' }; }
    } catch (e) {
      return { success:false, message:'Network error' };
    }
  }

  const panel = qs('#myCartPanel');
  const btn = qs('#myCartBtn');
  const closeBtn = qs('#myCartClose');
  const list = qs('#myCartList');
  const refreshBtn = qs('#myCartRefresh');
  const countBadge = qs('#myCartCount');
  const fab = qs('#cartFab');
  const countBadgeFab = qs('#myCartCountFab');

  function open(){
    if (panel){
      panel.classList.add('open');
      panel.removeAttribute('inert');
      panel.setAttribute('aria-hidden','false');
      // Move focus inside the panel (prefer close button)
      try {
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
        else {
          const focusable = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable && typeof focusable.focus === 'function') focusable.focus();
        }
      } catch(_) {}
    }
  }
  function close(){
    if (panel){
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden','true');
      panel.setAttribute('inert','');
    }
    // Return focus to opener to avoid aria-hidden on focused descendant
    try {
      const opener = btn || fab || document.querySelector('[data-cart-open], .open-cart, #openCart, #cartButton');
      if (opener && typeof opener.focus === 'function') opener.focus();
      else if (document && document.body && typeof document.body.focus === 'function') document.body.focus();
    } catch(_) {}
  }

  // Guard to avoid duplicate renders from overlapping requests
  let lastLoadId = 0;

  async function loadCart(){
    const myLoadId = ++lastLoadId;
    if (!list) return;
    
    // Skip cart loading on login/signup pages
    const isLoginPage = window.location.pathname.includes('/login') || window.location.pathname.includes('/signup');
    if (isLoginPage) {
      console.log('Skipping cart API call on login/signup page');
      // Update badge count to 0
      if (countBadge) countBadge.textContent = '0';
      if (countBadgeFab) countBadgeFab.textContent = '0';
      return;
    }
    
    // Check if user is authenticated before making API call
    const token = localStorage.getItem('token');
    if (!token) {
      // User not authenticated, show empty cart
      list.innerHTML = '';
      const empty = ce('div','mycart-empty');
      setHTMLSafe(empty, '<i class="fas fa-user-lock"></i><div>Please log in to view your cart</div>');
      list.appendChild(empty);
      
      // Update badge count to 0
      if (countBadge) countBadge.textContent = '0';
      if (countBadgeFab) countBadgeFab.textContent = '0';
      return;
    }
    
    // Do not clear immediately; wait until we have the latest data to avoid race-condition duplicates
    const data = await getJson('/api/marketplace/pieces/my');
    if (myLoadId !== lastLoadId) return; // a newer load started; ignore this response
    const apiItems = (data && data.success && Array.isArray(data.data)) ? data.data : [];
    // Deduplicate by listingId and sum pieces to avoid duplicate rows across cases
    const map = new Map();
    apiItems.forEach(it => {
      const key = `${it.listingId || ''}`;
      if (!map.has(key)) map.set(key, Object.assign({}, it));
      else {
        const cur = map.get(key);
        cur.pieces = (Number(cur.pieces||0) || 0) + (Number(it.pieces||0) || 0);
      }
    });
    const items = Array.from(map.values());

    // Now that this response is current, clear and render
    list.innerHTML = '';
    if (!items.length){
      const empty = ce('div','mycart-empty');
      setHTMLSafe(empty, '<i class="fas fa-box-open"></i><div>No reservations yet</div>');
      list.appendChild(empty);
    } else {
      items.forEach(it => {
        const row = ce('div','mycart-item');
        const left = ce('div','left');
        const right = ce('div','controls');

        const title = ce('div','title');
        title.textContent = it.title || 'Listing';
        const meta = ce('div','meta');
        meta.textContent = `Reserved: ${it.pieces || 0}`;
        const unit = (typeof it.unitPrice === 'number') ? it.unitPrice : 0;
        const unitLabel = it.priceUnit || 'each';
        const lineSubtotal = (Number(it.pieces||0) || 0) * (Number(unit) || 0);
        const priceDiv = ce('div','price');
        priceDiv.textContent = `$${unit.toFixed(2)} ${unitLabel}`;
        const subtotalDiv = ce('div','subtotal');
        setHTMLSafe(subtotalDiv, `<span class="label">Subtotal:</span> $${lineSubtotal.toFixed(2)} <span class="mult">(${Number(it.pieces||0)} × $${unit.toFixed(2)})</span>`);
        const sep = ce('div','sep');

        // Optional thumbnail
        if (it.image) {
          try {
            const img = ce('img','mycart-thumb');
            const raw = String(it.image || '');
            const isAbsolute = /^https?:\/\//i.test(raw);
            if (isAbsolute) {
              img.src = raw;
            } else {
              const trimmed = raw.replace(/^public\//,'').replace(/^\//,'');
              img.src = '/' + trimmed;
            }
            img.alt = it.title || 'Listing image';
            left.appendChild(img);
            try { row.classList.add('has-thumb'); } catch(_) {}
          } catch(_) {}
        } else {
          try { row.classList.add('no-thumb'); } catch(_) {}
        }
        left.appendChild(title);
        left.appendChild(meta);
        left.appendChild(sep);
        left.appendChild(priceDiv);
        left.appendChild(subtotalDiv);

        const qty = ce('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = String(it.pieces || 0);
        qty.title = 'Adjust reserved pieces';

        const saveBtn = ce('button','marketplace-btn');
        saveBtn.textContent = 'Update';
        saveBtn.addEventListener('click', async () => {
          const n = Math.max(0, Number(qty.value) || 0);
          const res = await postJson(`/api/marketplace/${it.listingId}/pieces`, { pieces: n });
          if (!res || !res.success){
            alert(res && res.message ? res.message : 'Failed to update reservation');
            return;
          }
          await loadCart();
          window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId: it.listingId } }));
        });

        const cancelBtn = ce('button','marketplace-btn');
        cancelBtn.textContent = 'Cancel';
        try{ cancelBtn.classList.add('outline'); }catch(_){ }
        cancelBtn.addEventListener('click', async () => {
          const res = await del(`/api/marketplace/${it.listingId}/pieces`);
          if (!res || !res.success){
            alert(res && res.message ? res.message : 'Failed to cancel reservation');
            return;
          }
          await loadCart();
          window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId: it.listingId } }));
        });

        right.appendChild(qty);
        right.appendChild(saveBtn);
        right.appendChild(cancelBtn);

        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
      });
    }

    // Update right-hand sidebar summary
    try {
      const sc = document.querySelector('.shopping-cart');
      if (sc){
        const headerCountEl = sc.querySelector('.cart-header span:last-child');
        const emptyEl = sc.querySelector('.cart-empty');
        const itemsEl = sc.querySelector('.cart-items');
        const subtotalEl = sc.querySelector('.cart-summary .summary-row:nth-child(1) span:last-child');
        const shippingRow = sc.querySelector('.cart-summary .summary-row:nth-child(2)');
        const shippingEl = shippingRow ? shippingRow.querySelector('span:last-child') : null;
        const totalEl = sc.querySelector('.cart-summary .summary-row.total span:last-child');

        const piecesCount = items.reduce((s, it) => s + (Number(it.pieces||0) || 0), 0);
        const listingCount = items.filter(it => Number(it.pieces || 0) > 0).length;
        const subtotal = items.reduce((s, it) => s + ((Number(it.pieces||0) || 0) * (Number(it.unitPrice||0) || 0)), 0);
        const totalDollars = subtotal;

        if (headerCountEl) headerCountEl.textContent = `${piecesCount} piece${piecesCount === 1 ? '' : 's'}`;
        if (emptyEl) emptyEl.style.display = piecesCount === 0 ? '' : 'none';
        if (itemsEl){
          itemsEl.innerHTML = '';
          if (piecesCount > 0){
            items.slice(0, 6).forEach(it => {
              const row = document.createElement('div');
              row.className = 'cart-mini-item';
              const name = document.createElement('div');
              name.className = 'name';
              name.textContent = it.title || 'Listing';
              const meta = document.createElement('div');
              meta.className = 'meta';
              const unit = (typeof it.unitPrice === 'number') ? it.unitPrice : 0;
              const qty = Number(it.pieces||0) || 0;
              const line = qty * unit;
              meta.textContent = `${qty} × $${unit.toFixed(2)} = $${line.toFixed(2)}`;
              row.appendChild(name);
              row.appendChild(meta);
              // click row opens slide-in cart
              row.addEventListener('click', () => { try{ open(); }catch(_){} });
              itemsEl.appendChild(row);
            });
            if (items.length > 6){
              const more = document.createElement('div');
              more.className = 'cart-mini-more';
              more.textContent = `+ ${items.length - 6} more…`;
              more.addEventListener('click', () => { try{ open(); }catch(_){} });
              itemsEl.appendChild(more);
            }
          }
        }
        if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
        // Hide shipping row entirely since no shipping is necessary
        if (shippingRow) shippingRow.style.display = 'none';
        if (totalEl) totalEl.textContent = `$${totalDollars.toFixed(2)}`;
      }
    } catch(_) {}

    // Update badge
    const piecesTotal = items.reduce((s, it) => s + (Number(it.pieces||0) || 0), 0);
    if (countBadge){
      if (piecesTotal > 0){ countBadge.textContent = String(piecesTotal); countBadge.style.display = 'inline-block'; }
      else { countBadge.style.display = 'none'; }
    }
    if (countBadgeFab){
      if (piecesTotal > 0){ countBadgeFab.textContent = String(piecesTotal); countBadgeFab.style.display = 'inline-block'; }
      else { countBadgeFab.style.display = 'none'; }
    }
    // Header navbar badge
    try {
      const headerBadge = document.getElementById('fsCartCount');
      if (headerBadge){
        if (piecesTotal > 0){ headerBadge.textContent = String(piecesTotal); headerBadge.style.display = 'inline-block'; }
        else { headerBadge.style.display = 'none'; }
      }
      // Broadcast count for any listeners
      try { window.dispatchEvent(new CustomEvent('cart:countUpdated', { detail:{ count: piecesTotal } })); } catch(_) {}
    } catch(_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    const openAndLoad = (e) => { try{ if(e){ e.preventDefault(); e.stopPropagation(); } }catch(_){} open(); loadCart(); };
    if (btn) btn.addEventListener('click', openAndLoad);
    if (fab) fab.addEventListener('click', openAndLoad);
    // Generic openers: any element with data-cart-open or class .open-cart
    document.querySelectorAll('[data-cart-open], .open-cart, #openCart, #cartButton').forEach(el => {
      el.addEventListener('click', openAndLoad);
    });
    // Safety: delegate clicks for dynamically added buttons
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.matches('[data-cart-open], .open-cart, #openCart, #cartButton')) openAndLoad(e);
      // If icon inside button
      const p = t.closest && t.closest('[data-cart-open], .open-cart, #openCart, #cartButton');
      if (p) openAndLoad(e);
    });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (refreshBtn) refreshBtn.addEventListener('click', loadCart);
    // Slide-in panel checkout button navigates to /checkout
    try {
      const myCartCheckoutBtn = document.getElementById('myCartCheckout');
      if (myCartCheckoutBtn){
        myCartCheckoutBtn.addEventListener('click', (e) => {
          try { if (e) { e.preventDefault(); e.stopPropagation && e.stopPropagation(); } } catch(_){ }
          try { window.location.href = '/checkout'; } catch(_){ }
        });
      }
    } catch(_) {}

    // Also open the slide-in when interacting with the sidebar summary
    try {
      const sc = document.querySelector('.shopping-cart');
      if (sc){
        const header = sc.querySelector('.cart-header');
        const checkout = sc.querySelector('.checkout-btn');
        const clear = sc.querySelector('.clear-cart-btn');
        if (header) header.addEventListener('click', openAndLoad);
        if (checkout) checkout.addEventListener('click', (e) => {
          try { if (e) { e.preventDefault(); e.stopPropagation && e.stopPropagation(); } } catch(_){ }
          // Navigate to the dedicated checkout page
          try { window.location.href = '/checkout'; } catch(_){ }
        });
        if (clear) clear.addEventListener('click', openAndLoad);
      }
    } catch(_) {}

    // Close on escape
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    // Refresh cart when piece ordering updates elsewhere
    window.addEventListener('po:refresh', () => { loadCart(); });
    // Listen for cart refresh events (triggered after login)
    window.addEventListener('cart:refresh', () => { 
      console.log('Cart refresh event received');
      loadCart(); 
    });

    // Populate sidebar summary on page load
    loadCart();

    // Clear Cart button in sidebar
    try {
      const sc = document.querySelector('.shopping-cart');
      const clearBtn = sc && sc.querySelector('.clear-cart-btn');
      if (clearBtn){
        clearBtn.addEventListener('click', async () => {
          clearBtn.disabled = true;
          const data = await getJson('/api/marketplace/pieces/my');
          const items = (data && data.success && Array.isArray(data.data)) ? data.data : [];
          try {
            await Promise.all(items.map(it => del(`/api/marketplace/${it.listingId}/pieces`)));
          } catch(_) {}
          await loadCart();
          // notify widgets to refresh
          items.forEach(it => { try { window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId: it.listingId } })); } catch(_) {} });
          clearBtn.disabled = false;
        });
      }
    } catch(_) {}
  });
})();
