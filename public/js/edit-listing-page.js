// public/js/edit-listing-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const pageEl = document.getElementById('editListingPage');
    if (!pageEl) return;
    const IS_AUTH = (pageEl.dataset.auth === 'true');
    const LISTING_ID = pageEl.dataset.listingId;

    try { console.log('[EditListing] Script initialized. Listing ID:', LISTING_ID, 'Auth:', IS_AUTH); } catch(_) {}

    // Elements
    const form = document.getElementById('editListingForm');
    const savedVendorSelect = document.getElementById('saved-vendor');
    const vendorIdInput = document.getElementById('vendorId');
    // Group Buy inputs
    const gbEnabledEl = document.getElementById('groupBuy-enabled');
    const gbMinCasesEl = document.getElementById('groupBuy-minCases');
    const gbTargetCasesEl = document.getElementById('groupBuy-targetCases');
    const gbDeadlineEl = document.getElementById('groupBuy-deadline');
    const poEnabledEl = document.getElementById('pieceOrdering-enabled');
    const deleteBtn = document.getElementById('deleteListingBtn');
    const commitmentsContent = document.getElementById('commitmentsContent');
    const refreshCommitmentsBtn = document.getElementById('refreshCommitmentsBtn');
    // Group Buy cancel
    const cancelGbBtn = document.getElementById('cancelGbBtn');
    const cancelPoBtn = document.getElementById('cancelPoBtn');
    const vendorQuickPickBtn = document.getElementById('vendorQuickPickBtn');
    const vendorQuickPickModal = document.getElementById('vendorQuickPickModal');
    const vendorQuickPickClose = document.getElementById('vendorQuickPickClose');
    const vendorQuickPickSearch = document.getElementById('vendorQuickPickSearch');
    const vendorQuickPickList = document.getElementById('vendorQuickPickList');
    let vendorQuickPickModalInstance = null;
    let vendorQuickPickFocusedIndex = -1;
    let vendorQuickPickRows = [];
    let vendorQuickPickPage = 1;
    let vendorQuickPickPerPage = 20;
    let vendorQuickPickTotalPages = 1;
    let vendorQuickPickPrefocusId = null;
    const debouncedRenderVendors = debounce(() => { vendorQuickPickPage = 1; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); }, 150);
    const pendingChangesNote = document.getElementById('pendingChangesNote');
    const TOKEN = (function(){ try { return localStorage.getItem('token') || localStorage.getItem('authToken') || ''; } catch (_) { return ''; } })();
    const AUTH_HEADERS = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmDeleteModalEl = document.getElementById('confirmDeleteModal');
    let confirmDeleteModal = null;
    try { if (confirmDeleteModalEl && window.bootstrap) confirmDeleteModal = new bootstrap.Modal(confirmDeleteModalEl); } catch (_) {}

    // Utils
    function setValue(id, val){ const el = document.getElementById(id); if (el) el.value = (val ?? ''); }
    function setChecked(id, on){ const el = document.getElementById(id); if (el) el.checked = !!on; }

    // Banner helper
    function showBanner(type, html){
      const el = document.getElementById('editListingAlert');
      if (!el) return;
      el.className = `alert alert-${type}`;
      setHTMLSafe(el, html);
      el.style.display = 'block';
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_) {}
    }
    function markPending(){ if (pendingChangesNote) pendingChangesNote.style.display = 'block'; }
    function clearPending(){ if (pendingChangesNote) pendingChangesNote.style.display = 'none'; }

    // Commitments helpers
    async function fetchGbStatus(){ try { const res = await fetch(`/api/marketplace/${LISTING_ID}/groupbuy/status`); if (!res.ok) return null; const json = await res.json(); return json && json.success ? json.data : null; } catch(_) { return null; } }
    async function fetchPoStatus(){ try { const res = await fetch(`/api/marketplace/${LISTING_ID}/pieces/status`); if (!res.ok) return null; const json = await res.json(); return json && json.success ? json.data : null; } catch(_) { return null; } }
    function renderCommitments(gb, po){
      if (!commitmentsContent) return;
      const rows = [];
      if (gb && gb.enabled){
        const gbLine = `Group Buy: Committed: <strong>${gb.committedCases || 0}</strong>${gb.targetCases ? ` / ${gb.targetCases}` : ''}${typeof gb.userCommit === 'number' ? ` • Your cases: <strong>${gb.userCommit}</strong>` : ''}${gb.deadline ? ` • Deadline: <strong>${new Date(gb.deadline).toLocaleString()}</strong>` : ''}`;
        rows.push(`<div>${gbLine}</div>`);
      } else {
        rows.push('<div>Group Buy: <span class="text-muted">Disabled</span></div>');
      }
      if (po && po.enabled){ rows.push(`<div>Per-Piece: Case #<strong>${po.currentCaseNumber || 1}</strong> • Remaining: <strong>${po.currentCaseRemaining ?? 0}</strong> / ${po.caseSize || 0}${typeof po.userPieces === 'number' ? ` • Your pieces: <strong>${po.userPieces}</strong>` : ''}</div>`); }
      else { rows.push('<div>Per-Piece: <span class="text-muted">Disabled</span></div>'); }
      setHTMLSafe(commitmentsContent, rows.join(''));
      if (cancelGbBtn) cancelGbBtn.style.display = (gb && gb.enabled && Number(gb.userCommit || 0) > 0) ? '' : 'none';
      if (cancelPoBtn) cancelPoBtn.style.display = (po && po.enabled && Number(po.userPieces || 0) > 0) ? '' : 'none';
    }
    async function loadCommitments(){ if (commitmentsContent) commitmentsContent.textContent = 'Loading...'; const [gb, po] = await Promise.all([fetchGbStatus(), fetchPoStatus()]); renderCommitments(gb, po); }

    if (refreshCommitmentsBtn){
      refreshCommitmentsBtn.addEventListener('click', async () => {
        const btn = refreshCommitmentsBtn;
        if (btn.dataset.loading === '1') return;
        btn.dataset.loading = '1';
        const prevPe = btn.style.pointerEvents; const prevOp = btn.style.opacity;
        btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6';
        try { await loadCommitments(); }
        finally { btn.dataset.loading=''; btn.style.pointerEvents = prevPe || ''; btn.style.opacity = prevOp || ''; }
      });
    } else { try { console.warn('[EditListing] Refresh button not found in DOM'); } catch(_) {} }
    // Group Buy cancel
    if (cancelGbBtn){
      cancelGbBtn.addEventListener('click', async () => {
        const btn = cancelGbBtn; if (btn.dataset.loading === '1') return;
        btn.dataset.loading='1'; const prevPe = btn.style.pointerEvents; const prevOp = btn.style.opacity; const prevHtml = btn.innerHTML;
        btn.style.pointerEvents='none'; btn.style.opacity='0.6'; try { btn.textContent = 'Canceling...'; } catch(_) {}
        try {
          const res = await fetch(`/api/marketplace/${LISTING_ID}/groupbuy/commit`, { method: 'DELETE' });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json && json.success){ showBanner('success', 'Your group buy commitment was canceled.'); await loadCommitments(); }
          else if (res.status === 401){ window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search); }
          else { showBanner('danger', 'Failed to cancel your group buy commitment.'); }
        } catch(_) { showBanner('danger', 'Network error canceling group buy commitment.'); }
        finally { btn.dataset.loading=''; btn.style.pointerEvents = prevPe || ''; btn.style.opacity = prevOp || ''; try { btn.innerHTML = prevHtml; } catch(_) {} }
      });
    }
    if (cancelPoBtn){
      cancelPoBtn.addEventListener('click', async () => {
        const btn = cancelPoBtn; if (btn.dataset.loading === '1') return;
        btn.dataset.loading='1'; const prevPe = btn.style.pointerEvents; const prevOp = btn.style.opacity; const prevHtml = btn.innerHTML;
        btn.style.pointerEvents='none'; btn.style.opacity='0.6'; try { btn.innerHTML = 'Canceling...'; } catch(_) {}
        try {
          const res = await fetch(`/api/marketplace/${LISTING_ID}/pieces`, { method: 'DELETE' });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json && json.success){ showBanner('success', 'Your piece reservation was canceled.'); await loadCommitments(); }
          else if (res.status === 401){ window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search); }
          else { showBanner('danger', 'Failed to cancel your piece reservation.'); }
        } catch(_) { showBanner('danger', 'Network error canceling piece reservation.'); }
        finally { btn.dataset.loading=''; btn.style.pointerEvents = prevPe || ''; btn.style.opacity = prevOp || ''; try { btn.innerHTML = prevHtml; } catch(_) {} }
      });
    }

    // Pricing sync
    const priceEl = document.getElementById('price');
    const priceUnitEl = document.getElementById('priceUnit');
    const casePriceEl = document.getElementById('casePrice');
    const caseSizeEl = document.getElementById('caseSize');
    function isCaseUnit(){ return String(priceUnitEl && priceUnitEl.value || '').toLowerCase() === 'case'; }
    function num(val){ const n = Number(val); return (typeof n === 'number' && !Number.isNaN(n)) ? n : undefined; }
    function round2(n){ return Math.round(n * 100) / 100; }
    function fmt(n){ return '$' + (Math.round(n * 100) / 100).toFixed(2); }
    function sanitizeMoneyString(s){ try { return String(s || '').replace(/[^0-9.\-]/g,''); } catch(_) { return s; } }
    function formatMoneyInput(el){ if (!el) return; const raw = sanitizeMoneyString(el.value); if (raw === '') return; const n = Number(raw); if (!Number.isNaN(n)) { el.value = (Math.round(n * 100) / 100).toFixed(2); } }
    function updateCasePriceUIMode(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; const isCase = isCaseUnit(); if (isCase){ casePriceEl.value = priceEl.value || ''; casePriceEl.disabled = true; } else { casePriceEl.disabled = false; } }
    function syncFromPrice(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()) { casePriceEl.value = priceEl.value || ''; return; } const p = num(priceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (p !== undefined && cs !== undefined && cs > 0){ casePriceEl.value = round2(p * cs); } }
    function syncFromCasePrice(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()) return; const cp = num(casePriceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (cp !== undefined && cs !== undefined && cs > 0){ priceEl.value = round2(cp / cs); } }
    function onCaseSizeChange(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()) return; const p = num(priceEl.value); const cp = num(casePriceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (cs === undefined || cs <= 0) return; if ((p === undefined || priceEl.value === '') && cp !== undefined){ priceEl.value = round2(cp / cs); } else if ((cp === undefined || casePriceEl.value === '') && p !== undefined){ casePriceEl.value = round2(p * cs); } }
    function updatePriceBreakdown(){ const out = document.getElementById('priceBreakdown'); if (!out) return; const cs = num(caseSizeEl && caseSizeEl.value); const parts = []; if (isCaseUnit()){ const cpFromPrice = num(priceEl && priceEl.value); if (cpFromPrice !== undefined && cs !== undefined && cs > 0){ parts.push(`Unit price: ${fmt(cpFromPrice / cs)} per unit @ case size ${cs}`); } } else if (cs !== undefined && cs > 0){ const p = num(priceEl && priceEl.value); const cp = num(casePriceEl && casePriceEl.value); if (p !== undefined) parts.push(`Case price: ${fmt(p * cs)} (${cs} units @ ${fmt(p)} each)`); if (cp !== undefined) parts.push(`Unit price: ${fmt(cp / cs)} each @ case size ${cs}`); } out.textContent = parts.join(' • '); }

    if (priceUnitEl) priceUnitEl.addEventListener('change', () => { updateCasePriceUIMode(); markPending(); });
    if (priceUnitEl) priceUnitEl.addEventListener('change', () => { updatePriceBreakdown(); });
    if (priceEl) priceEl.addEventListener('input', () => { priceEl.value = sanitizeMoneyString(priceEl.value); syncFromPrice(); markPending(); updatePriceBreakdown(); });
    if (priceEl) priceEl.addEventListener('blur', () => { formatMoneyInput(priceEl); syncFromPrice(); updatePriceBreakdown(); });
    if (casePriceEl) casePriceEl.addEventListener('input', () => { casePriceEl.value = sanitizeMoneyString(casePriceEl.value); syncFromCasePrice(); markPending(); updatePriceBreakdown(); });
    if (casePriceEl) casePriceEl.addEventListener('blur', () => { formatMoneyInput(casePriceEl); syncFromCasePrice(); updatePriceBreakdown(); });
    if (caseSizeEl) caseSizeEl.addEventListener('input', () => { onCaseSizeChange(); markPending(); updatePriceBreakdown(); });

    savedVendorSelect?.addEventListener('change', onVendorSelect);
    // Group Buy inputs
    if (gbEnabledEl) { gbEnabledEl.addEventListener('change', () => { toggleGroupBuyInputs(); markPending(); }); toggleGroupBuyInputs(); }
    if (poEnabledEl) poEnabledEl.addEventListener('change', markPending);

    function toggleGroupBuyInputs(){ const on = !!(gbEnabledEl && gbEnabledEl.checked); [gbMinCasesEl, gbTargetCasesEl, gbDeadlineEl].forEach(el => { if (el) el.disabled = !on; }); }

    // Load listing data and vendors
    let SAVED_VENDORS = [];
    let listing = null;

    async function loadListing(){
      const res = await fetch(`/api/marketplace/${LISTING_ID}`);
      const text = await res.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
      if (!res.ok || !json || json.success === false){
        const msg = (json && json.message) ? json.message : `Failed to load listing (HTTP ${res.status})`;
        showBanner('danger', msg);
        throw new Error(msg);
      }
      listing = json.data;
      populateFormFromListing();
    }

    async function loadVendors(){
      const statusEl = document.getElementById('vendorsFetchStatus');
      const retryEl = document.getElementById('vendorsRetry');
      if (statusEl){ statusEl.style.display = 'block'; statusEl.textContent = 'Loading saved vendors...'; }
      if (retryEl) retryEl.style.display = 'none';
      try {
        const res = await fetch('/api/marketplace/vendors');
        if (!res.ok){
          if (statusEl){ if (res.status === 401) statusEl.textContent = 'Please log in to load saved vendors.'; else statusEl.textContent = `Failed to load vendors (HTTP ${res.status}).`; }
          if (retryEl) retryEl.style.display = 'inline';
          return;
        }
        const text = await res.text();
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
        if (json && json.success){
          SAVED_VENDORS = json.data || [];
          populateVendorSelect();
          if (statusEl){
            if (SAVED_VENDORS.length === 0){ statusEl.textContent = 'No saved vendors yet.'; statusEl.style.display = 'block'; }
            else { statusEl.textContent = ''; statusEl.style.display = 'none'; }
          }
          if (retryEl) retryEl.style.display = 'none';
          if (listing && listing.vendorId){ const hasOption = SAVED_VENDORS.some(v => v._id === listing.vendorId); if (hasOption) savedVendorSelect.value = listing.vendorId; }
        } else {
          if (statusEl) statusEl.textContent = 'Failed to load vendors.';
          if (retryEl) retryEl.style.display = 'inline';
        }
      } catch(e){
        if (statusEl) statusEl.textContent = 'Network error loading vendors.';
        if (retryEl) retryEl.style.display = 'inline';
      }
    }

    function populateVendorSelect(){ savedVendorSelect.innerHTML = '<option value="">Select a saved vendor</option>'; SAVED_VENDORS.forEach(v => { const opt = document.createElement('option'); opt.value = v._id; opt.textContent = v.name || '(Unnamed vendor)'; savedVendorSelect.appendChild(opt); }); }

    function escapeHtml(s){ try { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); } }

    // Safely set HTML using DOMPurify / SafeHTML
    function setHTMLSafe(el, html){
      if (!el) return;
      try {
        if (window.SafeHTML && typeof window.SafeHTML.sanitize === 'function'){
          el.innerHTML = window.SafeHTML.sanitize(String(html || ''));
        } else if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function'){
          el.innerHTML = window.DOMPurify.sanitize(String(html || ''));
        } else {
          el.innerHTML = String(html || '');
        }
      } catch(_){ try { el.textContent = String(html || ''); } catch(__){} }
    }

    function openVendorQuickPick(){
      try {
        if (!vendorQuickPickModal) return;
        if (!vendorQuickPickModalInstance && window.bootstrap){ try { vendorQuickPickModalInstance = new bootstrap.Modal(vendorQuickPickModal); } catch(_) {} }
        if (vendorQuickPickSearch) { vendorQuickPickSearch.value = ''; }
        vendorQuickPickFocusedIndex = 0;
        vendorQuickPickPage = 1;
        // Pre-focus current vendor if exists
        vendorQuickPickPrefocusId = (vendorIdInput && vendorIdInput.value) || (savedVendorSelect && savedVendorSelect.value) || null;
        renderVendorQuickPickList();
        if (vendorQuickPickModalInstance && vendorQuickPickModalInstance.show){ vendorQuickPickModalInstance.show(); } else { vendorQuickPickModal.style.display = 'block'; }
        setTimeout(() => { try { vendorQuickPickSearch && vendorQuickPickSearch.focus(); } catch(_) {} }, 10);
      } catch(_) {}
    }

    function closeVendorQuickPick(){
      try {
        if (!vendorQuickPickModal) return;
        if (vendorQuickPickModalInstance && vendorQuickPickModalInstance.hide){ vendorQuickPickModalInstance.hide(); }
        else { vendorQuickPickModal.style.display = 'none'; }
      } catch(_) {}
    }

    function renderVendorQuickPickList(){
      if (!vendorQuickPickList) return;
      const qRaw = (vendorQuickPickSearch && vendorQuickPickSearch.value ? vendorQuickPickSearch.value : '').trim();
      const q = qRaw.toLowerCase();
      const filtered = (SAVED_VENDORS || []).filter(v => {
        const n = String(v.name || '').toLowerCase();
        const c = String(v.city || '').toLowerCase();
        const s = String(v.state || '').toLowerCase();
        const e = String(v.contactEmail || '').toLowerCase();
        const p = String(v.contactPhone || '').toLowerCase();
        if (!q) return true;
        return n.includes(q) || c.includes(q) || s.includes(q) || e.includes(q) || p.includes(q);
      }).sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));

      // Prefocus current vendor if we have one
      if (vendorQuickPickPrefocusId){
        const overallIdx = filtered.findIndex(x => String(x._id) === String(vendorQuickPickPrefocusId));
        if (overallIdx >= 0){
          vendorQuickPickPage = Math.floor(overallIdx / vendorQuickPickPerPage) + 1;
          vendorQuickPickFocusedIndex = overallIdx % vendorQuickPickPerPage;
        }
        vendorQuickPickPrefocusId = null;
      }

      vendorQuickPickRows = filtered;
      vendorQuickPickTotalPages = Math.max(1, Math.ceil(filtered.length / vendorQuickPickPerPage));
      if (vendorQuickPickPage > vendorQuickPickTotalPages) vendorQuickPickPage = vendorQuickPickTotalPages;
      const start = (vendorQuickPickPage - 1) * vendorQuickPickPerPage;
      const end = start + vendorQuickPickPerPage;
      const pageRows = filtered.slice(start, end);

      if (pageRows.length === 0){ setHTMLSafe(vendorQuickPickList, '<div class="p-3 text-muted">No matches</div>'); renderVendorQuickPickPagination(); return; }
      vendorQuickPickList.innerHTML = '';
      pageRows.forEach((v, idx) => {
        const a = document.createElement('a'); a.href = '#'; a.className = 'list-group-item list-group-item-action'; a.dataset.index = String(idx);
        if (idx === vendorQuickPickFocusedIndex) a.classList.add('active');
        const cityState = [v.city, v.state].filter(Boolean).join(', ');
        const nameHtml = highlightHtml(v.name || '(Unnamed)', qRaw);
        const cityStateHtml = highlightHtml(cityState, qRaw);
        const contactBits = [v.contactEmail, v.contactPhone].filter(Boolean).join(' • ');
        const contactHtml = highlightHtml(contactBits, qRaw);
        setHTMLSafe(a, `<div class="d-flex flex-column"><strong>${nameHtml}</strong><span class="text-muted small">${cityStateHtml}${contactBits ? ' • ' + contactHtml : ''}</span></div>`);
        a.addEventListener('click', (e) => { e.preventDefault(); chooseVendor(v); });
        vendorQuickPickList.appendChild(a);
      });
      renderVendorQuickPickPagination();
      scrollActiveIntoView();
    }

    function chooseVendor(v){
      if (!v) return;
      if (vendorIdInput) vendorIdInput.value = v._id || '';
      if (savedVendorSelect){
        let has = false; Array.from(savedVendorSelect.options).forEach(o => { if (o.value === v._id) has = true; });
        if (!has){ const opt = document.createElement('option'); opt.value = v._id; opt.textContent = v.name || '(Unnamed vendor)'; savedVendorSelect.appendChild(opt); }
        savedVendorSelect.value = v._id || '';
        try { savedVendorSelect.dispatchEvent(new Event('change')); } catch(_) {}
      }
      closeVendorQuickPick();
    }

    function highlightHtml(text, q){
      try {
        const s = String(text || '');
        const query = String(q || '');
        if (!query) return escapeHtml(s);
        const idx = s.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return escapeHtml(s);
        const before = escapeHtml(s.slice(0, idx));
        const match = escapeHtml(s.slice(idx, idx + query.length));
        const after = escapeHtml(s.slice(idx + query.length));
        return `${before}<mark>${match}</mark>${after}`;
      } catch(_) { return escapeHtml(text); }
    }

    function scrollActiveIntoView(){
      try {
        const list = document.getElementById('vendorQuickPickList');
        if (!list) return;
        const active = list.querySelector('.list-group-item.active');
        if (active && active.scrollIntoView){ active.scrollIntoView({ block: 'nearest' }); }
      } catch(_) {}
    }

    function populateFormFromListing(){ setValue('title', listing.title); const desc = document.getElementById('description'); if (desc) desc.value = listing.description || ''; setValue('price', listing.price); const priceUnit = document.getElementById('priceUnit'); if (priceUnit) priceUnit.value = listing.priceUnit || ''; setValue('casePrice', typeof listing.casePrice === 'number' ? listing.casePrice : (listing.casePrice || '')); const category = document.getElementById('category'); if (category && listing.category) category.value = listing.category; setValue('quantity', listing.quantity); setValue('caseSize', listing.caseSize); const isOrg = document.getElementById('isOrganic'); if (isOrg) isOrg.checked = !!listing.isOrganic; setValue('upcCode', listing.upcCode); const tagsInput = document.getElementById('tags'); if (Array.isArray(listing.tags)) tagsInput.value = listing.tags.join(', '); try { updateCasePriceUIMode(); } catch(_) {} try { if (priceEl && priceEl.value) formatMoneyInput(priceEl); if (casePriceEl && casePriceEl.value) formatMoneyInput(casePriceEl); updatePriceBreakdown(); } catch(_) {}
      if (listing.groupBuy){ setChecked('groupBuy-enabled', !!listing.groupBuy.enabled); if (typeof listing.groupBuy.minCases !== 'undefined') setValue('groupBuy-minCases', listing.groupBuy.minCases); if (typeof listing.groupBuy.targetCases !== 'undefined') setValue('groupBuy-targetCases', listing.groupBuy.targetCases); if (listing.groupBuy.deadline){ const d = new Date(listing.groupBuy.deadline); const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); setValue('groupBuy-deadline', iso); } toggleGroupBuyInputs(); }
      if (listing.pieceOrdering){ setChecked('pieceOrdering-enabled', !!listing.pieceOrdering.enabled); }
      if (listing.vendorId){ vendorIdInput.value = listing.vendorId; }
    }

    function onVendorSelect(){ const id = savedVendorSelect.value; vendorIdInput.value = id || ''; }

    // Vendor Quick Pick event listeners
    if (vendorQuickPickBtn) vendorQuickPickBtn.addEventListener('click', async () => { if (SAVED_VENDORS.length === 0) { await loadVendors(); } openVendorQuickPick(); });
    if (vendorQuickPickClose) vendorQuickPickClose.addEventListener('click', closeVendorQuickPick);
    if (vendorQuickPickSearch) {
      vendorQuickPickSearch.addEventListener('input', debouncedRenderVendors);
      vendorQuickPickSearch.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown'){
          e.preventDefault();
          const visibleCount = Math.min(vendorQuickPickPerPage, vendorQuickPickRows.length - ((vendorQuickPickPage - 1) * vendorQuickPickPerPage));
          if (vendorQuickPickFocusedIndex < visibleCount - 1){ vendorQuickPickFocusedIndex++; renderVendorQuickPickList(); }
          else if (vendorQuickPickPage < vendorQuickPickTotalPages){ vendorQuickPickPage++; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); }
          scrollActiveIntoView();
        }
        else if (e.key === 'ArrowUp'){
          e.preventDefault();
          if (vendorQuickPickFocusedIndex > 0){ vendorQuickPickFocusedIndex--; renderVendorQuickPickList(); }
          else if (vendorQuickPickPage > 1){ vendorQuickPickPage--; vendorQuickPickFocusedIndex = vendorQuickPickPerPage - 1; renderVendorQuickPickList(); }
          scrollActiveIntoView();
        }
        else if (e.key === 'Enter'){ e.preventDefault(); const v = vendorQuickPickRows[vendorQuickPickFocusedIndex + ((vendorQuickPickPage - 1) * vendorQuickPickPerPage)]; if (v) chooseVendor(v); }
        else if (e.key === 'Escape'){ e.preventDefault(); closeVendorQuickPick(); }
      });
    }

    function renderVendorQuickPickPagination(){
      try {
        const list = document.getElementById('vendorQuickPickList');
        if (!list) return;
        let pager = document.getElementById('vendorQuickPickPager');
        if (!pager){
          pager = document.createElement('div');
          pager.id = 'vendorQuickPickPager';
          pager.className = 'd-flex align-items-center justify-content-between mt-2';
          list.parentElement.appendChild(pager);
        }
        setHTMLSafe(pager, `
          <button type=\"button\" class=\"btn btn-sm btn-outline-secondary\" id=\"vendorQuickPickPrev\" ${vendorQuickPickPage <= 1 ? 'disabled' : ''}>Prev</button>
          <div class=\"small text-muted\">Page ${vendorQuickPickPage} of ${vendorQuickPickTotalPages}</div>
          <button type=\"button\" class=\"btn btn-sm btn-outline-secondary\" id=\"vendorQuickPickNext\" ${vendorQuickPickPage >= vendorQuickPickTotalPages ? 'disabled' : ''}>Next</button>
        `);
        const prev = document.getElementById('vendorQuickPickPrev');
        const next = document.getElementById('vendorQuickPickNext');
        if (prev) prev.addEventListener('click', () => { if (vendorQuickPickPage > 1){ vendorQuickPickPage--; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); } });
        if (next) next.addEventListener('click', () => { if (vendorQuickPickPage < vendorQuickPickTotalPages){ vendorQuickPickPage++; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); } });
      } catch(_) {}
    }

    function debounce(fn, delay){ let t; return function(){ const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, args), delay); } }

    if (deleteBtn){
      deleteBtn.addEventListener('click', () => {
        try { console.log('[EditListing] Delete clicked for', LISTING_ID); } catch(_) {}
        if (confirmDeleteModal){ confirmDeleteModal.show(); }
        else { if (confirm('Are you sure you want to delete this listing? This action cannot be undone.')) performDelete(); }
      });
    }

    if (confirmDeleteBtn){ confirmDeleteBtn.addEventListener('click', async () => { await performDelete(); try { if (confirmDeleteModal) confirmDeleteModal.hide(); } catch(_) {} }); }

    async function performDelete(){
      if (!LISTING_ID){ showBanner('danger', 'Missing listing id; cannot delete. Please reload the page.'); return; }
      deleteBtn.disabled = true;
      const previousText = deleteBtn.textContent;
      deleteBtn.textContent = 'Deleting...';
      try {
        try { console.log('[Delete] Sending DELETE /api/marketplace/' + LISTING_ID); } catch(_) {}
        const res = await fetch(`/api/marketplace/${LISTING_ID}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'Accept': 'application/json', ...AUTH_HEADERS } });
        const text = await res.text();
        let json = {}; try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
        try { console.log('[Delete] Status:', res.status, 'Body:', json); } catch(_) {}
        if (res.ok && json && json.success){
          const gid = (listing && (listing.group && (listing.group._id || listing.group))) ? (listing.group._id || listing.group) : null;
          const redirectUrl = gid ? `/marketplace?groupId=${encodeURIComponent(gid)}` : '/marketplace';
          window.location.href = redirectUrl;
          return;
        }
        if (res.status === 401){ window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search); return; }
        if (res.status === 409){
          const d = (json && json.details) || {};
          const gb = d.groupBuy;
          const po = d.pieceOrdering;
          const parts = [];
          if (gb){ parts.push(`• Group Buy is active (participants: <strong>${gb.participants}</strong>, committed cases: <strong>${gb.committedCases}</strong>).`); }
          if (po){ parts.push(`• Per-piece case <strong>#${po.currentCaseNumber}</strong> has <strong>${po.currentCaseRemaining}</strong> pieces remaining and <strong>${po.reservationsCount}</strong> active reservations.`); }
          const msg = `
            <strong>Cannot delete listing.</strong> ${json && json.message ? json.message : 'Active commitments exist.'}<br>
            ${parts.join('<br>')}<br>
            <a href="/listings/${LISTING_ID}" class="alert-link">View listing page</a> to manage commitments.
          `;
          showBanner('warning', msg);
          return;
        }
        showBanner('danger', `Failed to delete listing${json && json.message ? (': ' + json.message) : ''}. HTTP ${res.status}`);
      } catch(e){
        showBanner('danger', 'Network error deleting listing. Please try again.');
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = previousText;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        price: Number(document.getElementById('price').value),
        priceUnit: document.getElementById('priceUnit').value,
        category: document.getElementById('category').value,
        quantity: document.getElementById('quantity').value ? Number(document.getElementById('quantity').value) : undefined,
        caseSize: document.getElementById('caseSize').value ? Number(document.getElementById('caseSize').value) : undefined,
        casePrice: (function(){ const pu = (document.getElementById('priceUnit').value || '').toLowerCase(); if (pu === 'case') return Number(document.getElementById('price').value || 0); const cpEl = document.getElementById('casePrice'); return cpEl && cpEl.value !== '' ? Number(cpEl.value) : undefined; })(),
        isOrganic: document.getElementById('isOrganic').checked,
        upcCode: document.getElementById('upcCode').value.trim(),
        tags: (document.getElementById('tags').value || '').split(',').map(t => t.trim()).filter(Boolean),
        vendorId: document.getElementById('vendorId').value || undefined,
        'pieceOrdering[enabled]': poEnabledEl && poEnabledEl.checked ? 'true' : 'false',
        'groupBuy[enabled]': gbEnabledEl && gbEnabledEl.checked ? 'true' : 'false',
        'groupBuy[minCases]': gbMinCasesEl && gbMinCasesEl.value ? String(gbMinCasesEl.value) : undefined,
        'groupBuy[targetCases]': gbTargetCasesEl && gbTargetCasesEl.value ? String(gbTargetCasesEl.value) : undefined,
        'groupBuy[deadline]': gbDeadlineEl && gbDeadlineEl.value ? gbDeadlineEl.value : undefined
      };
      const submitBtn = form.querySelector('button[type="submit"]');
      let prevPe = '', prevOp = '', prevHtml = '';
      if (submitBtn && submitBtn.dataset.loading !== '1'){
        submitBtn.dataset.loading = '1'; prevPe = submitBtn.style.pointerEvents; prevOp = submitBtn.style.opacity; prevHtml = submitBtn.innerHTML;
        submitBtn.style.pointerEvents = 'none'; submitBtn.style.opacity = '0.6';
        try { submitBtn.textContent = 'Saving...'; } catch(_) {}
      }
      try {
        const res = await fetch(`/api/marketplace/${LISTING_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...AUTH_HEADERS }, body: JSON.stringify(body) });
        const text = await res.text();
        let json = {}; try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
        if (res.ok && json && json.success){ showBanner('success', 'Saved. Your changes have been applied.'); clearPending(); await loadCommitments(); }
        else { showBanner('danger', 'Failed to update listing' + (json && json.message ? (': ' + json.message) : '')); }
      } catch(err){ showBanner('danger', 'Failed to update listing. Network error.'); }
      finally { if (submitBtn){ submitBtn.dataset.loading=''; submitBtn.style.pointerEvents = prevPe || ''; submitBtn.style.opacity = prevOp || ''; if (prevHtml) submitBtn.innerHTML = prevHtml; } }
    });

    const vendorsRetryLink = document.getElementById('vendorsRetry');
    if (vendorsRetryLink) vendorsRetryLink.addEventListener('click', (e) => { e.preventDefault(); loadVendors(); });
    Promise.all([loadListing(), loadVendors()]).catch(err => { try { console.error(err); } catch(_) {} showBanner('danger', 'Failed to load edit page data'); });
    loadCommitments();
  });
})();
