// public/js/checkout-page.js
// Lightweight checkout renderer and placeholder submit handler.
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
      const t = localStorage.getItem('token') || localStorage.getItem('authToken');
      return t ? { 'Authorization': `Bearer ${t}` } : {};
    } catch(_) { return {}; }
  }

  async function postJson(url, body){
    try {
      const r = await fetch(url, { method:'POST', headers: Object.assign({ 'Content-Type':'application/json' }, getAuthHeaders()), body: JSON.stringify(body||{}) });
      const text = await r.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
      if (!r.ok) {
        return { success:false, message: (json && json.message) ? json.message : `HTTP ${r.status}` };
      }
      return json;
    } catch (e) { return { success:false, message: e && e.message ? e.message : 'Network error' }; }
  }

  async function getJson(url){
    try {
      const r = await fetch(url, { headers: getAuthHeaders() });
      const text = await r.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
      if (!r.ok) {
        return { success:false, message: (json && json.message) ? json.message : `HTTP ${r.status}` };
      }
      return json;
    } catch (e) { return { success:false, message: e && e.message ? e.message : 'Network error' }; }
  }

  function formatMoney(n){
    const v = Number(n)||0; return `$${v.toFixed(2)}`;
  }

  async function clearReservations(listingIds){
    if (!Array.isArray(listingIds) || listingIds.length === 0) return;
    const unique = Array.from(new Set(listingIds.filter(Boolean).map(String)));
    const headers = getAuthHeaders();
    await Promise.allSettled(unique.map(id => {
      return fetch(`/api/marketplace/${encodeURIComponent(id)}/pieces`, {
        method: 'DELETE',
        headers
      }).catch(() => {});
    }));
  }

  async function renderSummary(){
    const listEl = qs('#summaryList');
    const totalEl = qs('#summaryTotal');
    if (!listEl || !totalEl) return { items: [], total: 0 };

    listEl.innerHTML = '';
    const data = await getJson('/api/marketplace/pieces/my');
    const apiItems = (data && data.success && Array.isArray(data.data)) ? data.data : [];

    // Deduplicate by listingId, sum pieces
    const map = new Map();
    apiItems.forEach(it => {
      const key = String(it.listingId||'');
      if (!map.has(key)) map.set(key, Object.assign({}, it));
      else {
        const cur = map.get(key);
        cur.pieces = (Number(cur.pieces||0)||0) + (Number(it.pieces||0)||0);
      }
    });
    const items = Array.from(map.values());

    if (items.length === 0){
      const empty = ce('div','note');
      empty.textContent = 'Your cart is empty.';
      listEl.appendChild(empty);
      totalEl.textContent = formatMoney(0);
      return { items: [], total: 0 };
    }

    let total = 0;
    items.forEach(it => {
      const unit = (typeof it.unitPrice === 'number') ? it.unitPrice : 0;
      const qty = Number(it.pieces||0) || 0;
      const line = unit * qty; total += line;

      const row = ce('div','summary-item');
      const left = ce('div');
      left.textContent = `${it.title || 'Listing'} × ${qty}`;
      const right = ce('div');
      right.textContent = formatMoney(line);
      row.appendChild(left); row.appendChild(right);
      listEl.appendChild(row);
    });

    totalEl.textContent = formatMoney(total);
    return { items, total };
  }

  async function handlePlaceOrder(){
    const btn = qs('#placeOrderBtn');
    const msg = qs('#placeOrderMsg');
    if (!btn || !msg) return;

    const name = qs('#coName')?.value.trim();
    const email = qs('#coEmail')?.value.trim();
    const phone = qs('#coPhone')?.value.trim();
    const street = qs('#coStreet')?.value.trim();
    const city = qs('#coCity')?.value.trim();
    const state = qs('#coState')?.value.trim();
    const zip = qs('#coZip')?.value.trim();

    msg.textContent = '';

    if (!name || !email){
      msg.className = 'note err';
      msg.textContent = 'Please provide at least your name and email.';
      return;
    }

    if (btn.dataset.loading === '1') return;
    msg.className = 'note'; msg.textContent = 'Placing order...';
    btn.dataset.loading = '1';
    const prevPe = btn.style.pointerEvents, prevOp = btn.style.opacity, prevHtml = btn.innerHTML;
    btn.disabled = true; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6';
    try { setHTMLSafe(btn, '<i class="fas fa-shopping-cart"></i> Placing...'); } catch(_) {}
    try {
      // Recompute summary to capture the latest items & total
      const { items, total } = await renderSummary();
      if (!items || items.length === 0){
        msg.className = 'note err';
        msg.textContent = 'Your cart is empty.';
        btn.disabled = false; btn.dataset.loading = ''; btn.style.pointerEvents = prevPe || ''; btn.style.opacity = prevOp || ''; if (prevHtml) btn.innerHTML = prevHtml;
        return;
      }

      const payload = {
        contact: { name, email, phone, street, city, state, zip },
        items: items.map(it => ({
          listingId: it.listingId || null,
          title: it.title || 'Listing',
          pieces: Number(it.pieces||0) || 0,
          unitPrice: Number(it.unitPrice||0) || 0
        })),
        total
      };

      const resp = await postJson('/api/orders/quick', payload);
      if (resp && resp.success && resp.orderId){
        // Attempt to clear reservations for these listings, then redirect
        try {
          const listingIds = items.map(it => it.listingId).filter(Boolean);
          await clearReservations(listingIds);
        } catch(_) {}
        window.location.href = `/orders/confirm/${encodeURIComponent(resp.orderId)}`;
        return;
      } else {
        msg.className = 'note err';
        msg.textContent = resp && resp.message ? resp.message : 'Failed to place order. Please try again.';
      }
    } catch (e) {
      msg.className = 'note err';
      msg.textContent = 'Failed to place order. Please try again.';
    } finally {
      btn.disabled = false;
      btn.dataset.loading = '';
      btn.style.pointerEvents = prevPe || '';
      btn.style.opacity = prevOp || '';
      if (prevHtml) btn.innerHTML = prevHtml;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await renderSummary();
    const btn = qs('#placeOrderBtn');
    if (btn) btn.addEventListener('click', handlePlaceOrder);
  });
})();
