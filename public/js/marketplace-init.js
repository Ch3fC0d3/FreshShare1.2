// public/js/marketplace-init.js
// Initializes view buttons and lazy-loading on the marketplace page
(function(){
  document.addEventListener('DOMContentLoaded', function() {
    const formEl = document.getElementById('marketplaceFiltersForm');
    if (formEl) {
      const submitForm = () => {
        try {
          const formData = new FormData(formEl);
          const params = new URLSearchParams();
          // Handle multi-value categories
          formData.forEach((value, key) => {
            if (key === 'category') {
              params.append(key, value);
            } else if (key === 'isOrganic') {
              params.set(key, 'true');
            } else if (value !== null && String(value).trim() !== '') {
              params.set(key, String(value).trim());
            }
          });
          const query = params.toString();
          const baseUrl = window.location.pathname || '/marketplace';
          const next = query ? `${baseUrl}?${query}` : baseUrl;
          window.location.assign(next);
        } catch (e) {
          console.error('Failed to submit marketplace filters form', e);
          formEl.submit();
        }
      };

      formEl.addEventListener('submit', function(ev){
        ev.preventDefault();
        submitForm();
      });

      const sortSelect = formEl.querySelector('select[name="sortBy"]');
      if (sortSelect) {
        sortSelect.addEventListener('change', submitForm);
      }

      const clearBtn = document.getElementById('filtersClearBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          window.location.assign('/marketplace');
        });
      }

      const resetBtn = document.getElementById('filtersResetBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          try {
            formEl.reset();
          } catch (_) {}
          window.location.assign('/marketplace');
        });
      }

      const organicCheckbox = formEl.querySelector('input[name="isOrganic"]');
      if (organicCheckbox) {
        organicCheckbox.addEventListener('change', submitForm);
      }
    }

    // Show toast if returning from an order confirmation
    try {
      const flag = localStorage.getItem('orderJustPlaced');
      if (flag === '1') {
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
          try { window.showToast('Order placed! Your cart has been cleared.'); } catch(_) {}
        }
        localStorage.removeItem('orderJustPlaced');
      }
    } catch(_) {}
    // Simple toggle for view buttons (grid/list)
    const rootEl = document.querySelector('body.marketplace-page') || document.body;
    const viewButtons = document.querySelectorAll('.view-btn');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        viewButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.getAttribute('data-view') || 'grid';
        if (view === 'list') {
          rootEl.classList.add('list-view');
        } else {
          rootEl.classList.remove('list-view');
        }
        try { localStorage.setItem('marketplaceView', view); } catch (e) {}
      });
    });

    // Initialize view on load
    try {
      const savedView = localStorage.getItem('marketplaceView') || 'grid';
      const target = Array.from(viewButtons).find(b => (b.getAttribute('data-view') || 'grid') === savedView);
      if (target) {
        target.click();
      }
    } catch (e) {}

    // Lazy loading for images
    const lazyImages = document.querySelectorAll('img.lazy-load');

    // Add loading class to images initially
    lazyImages.forEach(img => {
      if (img.parentNode) img.parentNode.classList.add('image-loading');
    });

    // Create intersection observer for lazy loading
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.classList.add('loaded');
            if (img.parentNode) img.parentNode.classList.remove('image-loading');
            imageObserver.unobserve(img);
          }
        });
      });

      lazyImages.forEach(img => {
        imageObserver.observe(img);
      });
    } else {
      // Fallback for browsers that don't support IntersectionObserver
      lazyImages.forEach(img => {
        img.classList.add('loaded');
        if (img.parentNode) img.parentNode.classList.remove('image-loading');
      });
    }

    // CSP-safe image error handling (replaces inline onerror)
    // Hide any lazy-load image that fails to load and remove loading class on its container
    function handleImgError(e){
      const t = e && e.target;
      if (!t || !(t instanceof HTMLImageElement)) return;
      if (!t.classList || !t.classList.contains('lazy-load')) return;
      try {
        t.style.display = 'none';
        if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('image-loading')) {
          t.parentNode.classList.remove('image-loading');
        }
      } catch(_) {}
    }
    // Use capture phase because error events on media elements do not bubble
    document.addEventListener('error', handleImgError, true);

    // --- Quick Reserve (add 1 piece) ---
    function getAuthHeaders(){
      try {
        const t = localStorage.getItem('token') || localStorage.getItem('authToken');
        return t ? { 'Authorization': `Bearer ${t}` } : {};
      } catch(_) { return {}; }
    }
    async function fetchJson(url, opts = {}) {
      try {
        const merged = Object.assign({}, opts);
        merged.headers = Object.assign({}, (opts && opts.headers) || {}, getAuthHeaders());
        const res = await fetch(url, merged);
        let data = null;
        try { data = await res.json(); } catch(_) {}
        return { ok: res.ok, status: res.status, data };
      } catch (e) { return { ok:false, status:0, data:{ message:'Network error' } }; }
    }
    function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

    async function quickReserve(listingId, btnEl){
      if (!listingId) return;
      if (btnEl && btnEl.dataset && btnEl.dataset.loading === '1') return;
      const prevText = btnEl && btnEl.textContent;
      let prevPe = '', prevOp = '';
      if (btnEl) {
        btnEl.dataset.loading = '1';
        prevPe = btnEl.style.pointerEvents; prevOp = btnEl.style.opacity;
        btnEl.disabled = true; btnEl.textContent = 'Adding…'; btnEl.setAttribute('aria-busy','true');
        btnEl.style.pointerEvents = 'none'; btnEl.style.opacity = '0.6';
      }
      try {
        // Get current userPieces and availability
        const st = await fetchJson(`/api/marketplace/${listingId}/pieces/status`);
        if (st.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
        if (!st.ok || !st.data || !st.data.data) {
          // Fallback: attempt to initialize by reserving 1
          const res0 = await fetchJson(`/api/marketplace/${listingId}/pieces`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ pieces: 1 }) });
          if (res0.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
          if (!res0.ok) {
            const err = (res0 && res0.data && res0.data.message) || 'Failed to reserve';
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast(err); }catch(_){ }
            return;
          }
          try { window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId } })); } catch(_){ }
          try { window.dispatchEvent(new CustomEvent('po:refresh')); } catch(_){ }
          try { const cartBtn = document.getElementById('myCartBtn'); if (cartBtn) cartBtn.click(); } catch(_) {}
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast('Added to cart'); }catch(_){ }
          return;
        }
        const s = st.data.data;
        const caseSize = Number(s.caseSize || 1) || 1;
        const remaining = Number(s.currentCaseRemaining || 0) || 0;
        const current = Number(s.userPieces || 0) || 0;
        if (!s.enabled) {
          // Attempt to initialize by reserving 1
          const res0 = await fetchJson(`/api/marketplace/${listingId}/pieces`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ pieces: 1 }) });
          if (res0.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
          if (!res0.ok) {
            const err = (res0 && res0.data && res0.data.message) || 'Failed to reserve';
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast(err); }catch(_){ }
            return;
          }
          try { window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId } })); } catch(_){ }
          try { window.dispatchEvent(new CustomEvent('po:refresh')); } catch(_){ }
          try { const cartBtn = document.getElementById('myCartBtn'); if (cartBtn) cartBtn.click(); } catch(_) {}
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast('Added to cart'); }catch(_){ }
          return;
        }
        if (remaining <= 0) {
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast('Case is full. Opening next case soon.'); }catch(_){ }
          return;
        }
        const next = clamp(current + 1, 1, caseSize);
        const res = await fetchJson(`/api/marketplace/${listingId}/pieces`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ pieces: next }) });
        if (res.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
        if (!res.ok) {
          const err = (res && res.data && res.data.message) || 'Failed to reserve';
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast(err); }catch(_){ }
          return;
        }
        // Notify widgets and cart to refresh
        try { window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId } })); } catch(_){ }
        try { window.dispatchEvent(new CustomEvent('po:refresh')); } catch(_){ }
        // Open cart panel if present
        try {
          const cartBtn = document.getElementById('myCartBtn');
          if (cartBtn) cartBtn.click();
        } catch(_) {}
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast('Added to cart'); }catch(_){ }
      } finally {
        if (btnEl) { btnEl.dataset.loading=''; btnEl.disabled = false; btnEl.textContent = prevText || 'Reserve'; btnEl.removeAttribute('aria-busy'); btnEl.style.pointerEvents = prevPe || ''; btnEl.style.opacity = prevOp || ''; }
      }
    }

    // Delegate click for quick reserve buttons
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      const btn = t.closest && t.closest('.quick-reserve-btn');
      if (btn && btn.dataset && btn.dataset.listingId){
        try{ e.preventDefault(); e.stopPropagation(); }catch(_){ }
        quickReserve(btn.dataset.listingId, btn);
      }
    });

    // ---- Quick Per-Piece Controls ----
    async function initQuickPO(container){
      try {
        if (!container) return;
        const id = container.dataset.listingId;
        if (!id) return;
        const remainingEl = container.querySelector('.quick-po-remaining');
        const qtyEl = container.querySelector('.quick-qty');
        const incBtn = container.querySelector('.quick-inc');
        const decBtn = container.querySelector('.quick-dec');
        const saveBtn = container.querySelector('.quick-save');
        const st = await fetchJson(`/api/marketplace/${id}/pieces/status`);
        if (st.status === 401) { return; }
        if (!st.ok || !st.data || !st.data.data || !st.data.data.enabled) {
          // Show available controls to allow first-time initialize via Save
          if (remainingEl) remainingEl.textContent = 'Available';
          if (qtyEl){ qtyEl.disabled = false; qtyEl.min = '0'; qtyEl.max = '1'; qtyEl.value = '0'; }
          if (incBtn) incBtn.disabled = false;
          if (decBtn) decBtn.disabled = false;
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        const s = st.data.data;
        const caseSize = Number(s.caseSize || 1) || 1;
        const remaining = Number(s.currentCaseRemaining || 0) || 0;
        const current = Number(s.userPieces || 0) || 0;
        if (remainingEl){
          remainingEl.textContent = remaining > 0 ? `Filling – ${remaining} left` : 'Case filled! Opening next case...';
        }
        if (qtyEl){
          qtyEl.min = '0';
          qtyEl.max = String(caseSize);
          qtyEl.value = String(current);
        }
        if (saveBtn){ saveBtn.disabled = false; }
      } catch(_) {}
    }

    function clampNumber(n, min, max){
      let v = Number(n);
      if (Number.isNaN(v)) v = 0;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    }

    document.querySelectorAll('.quick-po[data-listing-id]').forEach(initQuickPO);
    // Refresh quick-po when piece ordering updates elsewhere
    window.addEventListener('po:refresh', (e) => {
      const id = e && e.detail && e.detail.listingId;
      if (id){
        const c = document.querySelector(`.quick-po[data-listing-id="${id}"]`);
        if (c) initQuickPO(c);
      } else {
        document.querySelectorAll('.quick-po[data-listing-id]').forEach(initQuickPO);
      }
    });

    // Delegate events for quick-po controls
    document.addEventListener('click', async (e) => {
      const inc = e.target && e.target.closest && e.target.closest('.quick-inc');
      const dec = e.target && e.target.closest && e.target.closest('.quick-dec');
      const save = e.target && e.target.closest && e.target.closest('.quick-save');
      if (inc || dec || save){
        try{ e.preventDefault(); e.stopPropagation(); }catch(_){ }
        const wrapper = (inc||dec||save).closest('.quick-po');
        if (!wrapper) return;
        const id = wrapper.dataset.listingId;
        const qtyEl = wrapper.querySelector('.quick-qty');
        const max = Number(qtyEl && qtyEl.max) || 1;
        const min = 0;
        if (inc){
          qtyEl.value = String(clampNumber((Number(qtyEl.value)||0)+1, min, max));
          return;
        }
        if (dec){
          qtyEl.value = String(clampNumber((Number(qtyEl.value)||0)-1, min, max));
          return;
        }
        if (save){
          const n = clampNumber(qtyEl && qtyEl.value, min, max);
          const btnEl = save;
          const prev = btnEl.textContent;
          if (btnEl.dataset && btnEl.dataset.loading === '1') return;
          btnEl.dataset.loading = '1';
          const prevPe = btnEl.style.pointerEvents, prevOp = btnEl.style.opacity;
          btnEl.disabled = true; btnEl.textContent = 'Saving…'; btnEl.setAttribute('aria-busy','true');
          btnEl.style.pointerEvents = 'none'; btnEl.style.opacity = '0.6';
          const res = await fetchJson(`/api/marketplace/${id}/pieces`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ pieces: n }) });
          if (res.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
          if (!res.ok){
            const err = (res && res.data && res.data.message) || 'Failed to reserve';
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast(err); }catch(_){ }
          } else {
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') try{ window.showToast('Reservation updated'); }catch(_){ }
            try { window.dispatchEvent(new CustomEvent('po:refresh', { detail:{ listingId: id } })); } catch(_){ }
          }
          btnEl.dataset.loading = '';
          btnEl.disabled = false; btnEl.textContent = prev || 'Reserve'; btnEl.removeAttribute('aria-busy');
          btnEl.style.pointerEvents = prevPe || ''; btnEl.style.opacity = prevOp || '';
        }
      }
    });

    document.addEventListener('input', (e) => {
      const qty = e.target && e.target.matches && e.target.matches('.quick-qty') ? e.target : null;
      if (!qty) return;
      const max = Number(qty.max) || 1;
      const min = 0;
      qty.value = String(clampNumber(qty.value, min, max));
    });

    // Group-Buy controls removed per per-piece-only ordering policy
  });
})();
