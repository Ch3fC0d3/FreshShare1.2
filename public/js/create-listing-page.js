// public/js/create-listing-page.js
(function(){
  // Read feature flags from form data attribute to comply with CSP
  (function initFlags(){
    try {
      const form = document.getElementById('createListingForm');
      const scannerAutoStart = (form && form.dataset && form.dataset.scannerAutostart === 'true');
      window.FeatureFlags = Object.freeze({ scannerAutoStart });
      try { if (!scannerAutoStart) console.log('Scanner auto-start disabled by UPC_SCANNER_AUTOSTART flag'); } catch(_) {}
    } catch (_) { window.FeatureFlags = Object.freeze({}); }
  })();

  // Group Buy toggle: enable/disable inputs based on switch
  function toggleGroupBuyInputs() {
    try {
      const enabledEl = document.getElementById('groupBuy-enabled');
      const minEl = document.getElementById('groupBuy-minCases');
      const targetEl = document.getElementById('groupBuy-targetCases');
      const deadlineEl = document.getElementById('groupBuy-deadline');
      const on = !!(enabledEl && enabledEl.checked);
      [minEl, targetEl, deadlineEl].forEach(el => { if (el) el.disabled = !on; });
    } catch(_) {}
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Global state
    let selectedFiles = [];
    let tags = [];
    // Safe HTML helpers
    const setHTMLSafe = (el, html) => {
      try {
        if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
        el.innerHTML = String(html||'');
      } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
    };
    const escapeHtml = (s) => {
      try { return (window.SafeHTML && window.SafeHTML.escape) ? window.SafeHTML.escape(String(s||'')) : String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); }
    };

    // Elements
    const imageUploadContainer = document.getElementById('imageUploadContainer');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const tagInput = document.getElementById('tagInput');
    const tagContainer = document.getElementById('tagContainer');
    const createListingForm = document.getElementById('createListingForm');
    const groupSelect = document.getElementById('groupId');
    const cancelButton = document.getElementById('cancelButton');
    const savedVendorSelect = document.getElementById('saved-vendor');
    const vendorIdInput = document.getElementById('vendorId');
    const savedTemplateSelect = document.getElementById('saved-template');
    const gbEnabledEl = document.getElementById('groupBuy-enabled');
    const gbMinCasesEl = document.getElementById('groupBuy-minCases');
    const gbTargetCasesEl = document.getElementById('groupBuy-targetCases');
    const gbDeadlineEl = document.getElementById('groupBuy-deadline');
    const priceEl = document.getElementById('price');
    const priceUnitEl = document.getElementById('priceUnit');
    const casePriceEl = document.getElementById('casePrice');
    const caseSizeEl = document.getElementById('caseSize');
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

    const IS_AUTH = (createListingForm?.dataset.auth === 'true');
    const CURRENT_USER_ID = createListingForm?.dataset.userId || '';
    const preselectGroupId = (() => { try { return (new URLSearchParams(window.location.search)).get('groupId'); } catch(_) { return null; } })();

    let SAVED_VENDORS = [];
    let SAVED_TEMPLATES = [];
    let MY_GROUPS = [];

    // Wire Group Buy toggle
    if (gbEnabledEl) {
      gbEnabledEl.addEventListener('change', toggleGroupBuyInputs);
      // Initialize state
      toggleGroupBuyInputs();
    }

    // Image upload UI
    if (imageUploadContainer && imageUpload){
      imageUploadContainer.addEventListener('click', () => imageUpload.click());
      imageUploadContainer.addEventListener('dragover', (e) => { e.preventDefault(); imageUploadContainer.classList.add('border-primary'); });
      imageUploadContainer.addEventListener('dragleave', () => { imageUploadContainer.classList.remove('border-primary'); });
      imageUploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        imageUploadContainer.classList.remove('border-primary');
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        // Group Buy controls removed
      });
      imageUpload.addEventListener('change', () => handleFiles(imageUpload.files));
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
        <button type="button" class="btn btn-sm btn-outline-secondary" id="vendorQuickPickPrev" ${vendorQuickPickPage <= 1 ? 'disabled' : ''}>Prev</button>
        <div class="small text-muted">Page ${vendorQuickPickPage} of ${vendorQuickPickTotalPages}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="vendorQuickPickNext" ${vendorQuickPickPage >= vendorQuickPickTotalPages ? 'disabled' : ''}>Next</button>
      `);
      const prev = document.getElementById('vendorQuickPickPrev');
      const next = document.getElementById('vendorQuickPickNext');
      if (prev) prev.addEventListener('click', () => { if (vendorQuickPickPage > 1){ vendorQuickPickPage--; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); } });
      if (next) next.addEventListener('click', () => { if (vendorQuickPickPage < vendorQuickPickTotalPages){ vendorQuickPickPage++; vendorQuickPickFocusedIndex = 0; renderVendorQuickPickList(); } });
    } catch(_) {}
  }
  function debounce(fn, delay){ let t; return function(){ const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, args), delay); } }

    function handleFiles(files){
      if (!files) return;
      if (selectedFiles.length + files.length > 5) { alert('You can upload a maximum of 5 images.'); return; }
      for (let i = 0; i < files.length; i++){
        const file = files[i];
        if (!file.type.match('image/jpeg') && !file.type.match('image/png')) { alert('Only JPG and PNG images are allowed.'); continue; }
        if (file.size > 5 * 1024 * 1024) { alert('Image size should not exceed 5MB.'); continue; }
        selectedFiles.push(file);
        const reader = new FileReader();
        reader.onload = function(e){
          const preview = document.createElement('div');
          preview.className = 'image-preview';
          setHTMLSafe(preview, `
            <img src="${escapeHtml(e.target.result)}" alt="Preview">
            <div class="remove-image" data-index="${selectedFiles.length - 1}">
              <i class=\"fas fa-times\"></i>
            </div>
          `);
          imagePreviewContainer.appendChild(preview);
          preview.querySelector('.remove-image').addEventListener('click', function(){
            const index = parseInt(this.dataset.index);
            removeImage(index);
          });
        };
        reader.readAsDataURL(file);
      }
      imageUpload.value = '';
    }
    function removeImage(index){ selectedFiles.splice(index, 1); updateImagePreviews(); }
    function updateImagePreviews(){
      imagePreviewContainer.innerHTML = '';
      selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e){
          const preview = document.createElement('div');
          preview.className = 'image-preview';
          setHTMLSafe(preview, `
            <img src="${escapeHtml(e.target.result)}" alt="Preview">
            <div class="remove-image" data-index="${index}">
              <i class=\"fas fa-times\"></i>
            </div>
          `);
          imagePreviewContainer.appendChild(preview);
          preview.querySelector('.remove-image').addEventListener('click', function(){ removeImage(index); });
        };
        reader.readAsDataURL(file);
      });
    }

    // Tags
    if (tagInput){
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){
          e.preventDefault();
          const tag = tagInput.value.trim();
          if (tag && !tags.includes(tag)) { tags.push(tag); updateTags(); }
          tagInput.value = '';
        }
      });
    }
    function updateTags(){
      tagContainer.innerHTML = '';
      tags.forEach((tag, index) => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tag';
        setHTMLSafe(tagElement, `
          <span>${escapeHtml(tag)}</span>
          <i class=\"fas fa-times remove-tag\" data-index=\"${index}\"></i>
        `);
        tagContainer.appendChild(tagElement);
        tagElement.querySelector('.remove-tag').addEventListener('click', function(){ removeTag(parseInt(this.dataset.index)); });
      });
    }
    function removeTag(index){ tags.splice(index, 1); updateTags(); }

    // Pricing sync
    function isCaseUnit(){ return String(priceUnitEl && priceUnitEl.value || '').toLowerCase() === 'case'; }
    function num(val){ const n = Number(val); return (typeof n === 'number' && !Number.isNaN(n)) ? n : undefined; }
    function round2(n){ return Math.round(n * 100) / 100; }
    function fmt(n){ return '$' + (Math.round(n * 100) / 100).toFixed(2); }
    function sanitizeMoneyString(s){ try { return String(s || '').replace(/[^0-9.\-]/g,''); } catch(_) { return s; } }
    function formatMoneyInput(el){ if (!el) return; const raw = sanitizeMoneyString(el.value); if (raw === '') return; const n = Number(raw); if (!Number.isNaN(n)) { el.value = (Math.round(n * 100) / 100).toFixed(2); } }
    function updateCasePriceUIMode(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; const isCase = isCaseUnit(); if (isCase){ casePriceEl.value = priceEl.value || ''; casePriceEl.disabled = true; } else { casePriceEl.disabled = false; } }
    function syncFromPrice(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()){ casePriceEl.value = priceEl.value || ''; return; } const p = num(priceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (p !== undefined && cs !== undefined && cs > 0){ casePriceEl.value = round2(p * cs); } }
    function syncFromCasePrice(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()) return; const cp = num(casePriceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (cp !== undefined && cs !== undefined && cs > 0){ priceEl.value = round2(cp / cs); } }
    function onCaseSizeChange(){ if (!priceUnitEl || !casePriceEl || !priceEl) return; if (isCaseUnit()) return; const cp = num(casePriceEl.value); const p = num(priceEl.value); const cs = num(caseSizeEl && caseSizeEl.value); if (cs === undefined || cs <= 0) return; if ((p === undefined || priceEl.value === '') && cp !== undefined){ priceEl.value = round2(cp / cs); } else if ((cp === undefined || casePriceEl.value === '') && p !== undefined){ casePriceEl.value = round2(p * cs); } }
    function updatePriceBreakdown(){ const out = document.getElementById('priceBreakdown'); if (!out) return; const cs = num(caseSizeEl && caseSizeEl.value); const isCase = isCaseUnit(); const parts = []; if (isCase){ const cp = num(priceEl && priceEl.value); if (cp !== undefined && cs !== undefined && cs > 0){ parts.push(`Unit price: ${fmt(cp / cs)} per unit @ case size ${cs}`); } } else if (cs !== undefined && cs > 0){ const p = num(priceEl && priceEl.value); const cp = num(casePriceEl && casePriceEl.value); if (p !== undefined) parts.push(`Case price: ${fmt(p * cs)} (${cs} units @ ${fmt(p)} each)`); if (cp !== undefined) parts.push(`Unit price: ${fmt(cp / cs)} each @ case size ${cs}`); } out.textContent = parts.join(' • '); }
    if (priceUnitEl) priceUnitEl.addEventListener('change', updateCasePriceUIMode);
    if (priceUnitEl) priceUnitEl.addEventListener('change', updatePriceBreakdown);
    if (priceEl) priceEl.addEventListener('input', () => { priceEl.value = sanitizeMoneyString(priceEl.value); syncFromPrice(); updatePriceBreakdown(); });
    if (priceEl) priceEl.addEventListener('blur', () => { formatMoneyInput(priceEl); syncFromPrice(); updatePriceBreakdown(); });
    if (casePriceEl) casePriceEl.addEventListener('input', () => { casePriceEl.value = sanitizeMoneyString(casePriceEl.value); syncFromCasePrice(); updatePriceBreakdown(); });
    if (casePriceEl) casePriceEl.addEventListener('blur', () => { formatMoneyInput(casePriceEl); syncFromCasePrice(); updatePriceBreakdown(); });
    if (caseSizeEl) caseSizeEl.addEventListener('input', onCaseSizeChange);
    if (caseSizeEl) caseSizeEl.addEventListener('input', updatePriceBreakdown);
    updateCasePriceUIMode();
    // Initial normalization of money fields (if server prefilled)
    if (priceEl && priceEl.value) formatMoneyInput(priceEl);
    if (casePriceEl && casePriceEl.value) formatMoneyInput(casePriceEl);
    updatePriceBreakdown();

    // Saved Vendors, Templates, Groups
    async function loadGroups(){ if (!groupSelect) return; try { const res = await fetch('/api/groups'); const json = await res.json(); const all = (json && json.success && Array.isArray(json.groups)) ? json.groups : []; MY_GROUPS = all.filter(g => { const members = Array.isArray(g.members) ? g.members : []; const admins = Array.isArray(g.admins) ? g.admins : []; const memberHit = members.some(m => String(m._id) === String(CURRENT_USER_ID)); const adminHit = admins.some(a => String(a._id) === String(CURRENT_USER_ID)); const creatorHit = g.createdBy && String(g.createdBy._id || g.createdBy) === String(CURRENT_USER_ID); return memberHit || adminHit || creatorHit; }); groupSelect.innerHTML = ''; if (MY_GROUPS.length === 0){ setHTMLSafe(groupSelect, '<option value="">No groups found. Join or create a group first.</option>'); groupSelect.disabled = true; const submit = document.getElementById('submitButton'); if (submit) submit.disabled = true; const errEl = document.getElementById('group-error'); if (errEl) { errEl.textContent = 'You must join a group before creating a listing.'; errEl.style.display = 'block'; } return; } MY_GROUPS.forEach(g => { const opt = document.createElement('option'); opt.value = g._id; opt.textContent = g.name || ('Group ' + g._id.slice(-6)); groupSelect.appendChild(opt); }); if (MY_GROUPS.length === 1) groupSelect.value = MY_GROUPS[0]._id; if (preselectGroupId){ const hit = MY_GROUPS.some(g => String(g._id) === String(preselectGroupId)); if (hit) { groupSelect.value = preselectGroupId; groupSelect.disabled = false; const submit = document.getElementById('submitButton'); if (submit) submit.disabled = false; const errEl = document.getElementById('group-error'); if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; } } } } catch (e){ console.warn('Failed to load groups', e); if (groupSelect) setHTMLSafe(groupSelect, '<option value="">Failed to load groups</option>'); } }

    async function loadVendors(){ const statusEl = document.getElementById('vendorsFetchStatus'); const retryEl = document.getElementById('vendorsRetry'); if (statusEl){ statusEl.style.display = 'block'; statusEl.textContent = 'Loading saved vendors...'; } if (retryEl) retryEl.style.display = 'none'; try { const res = await fetch('/api/marketplace/vendors'); if (!res.ok){ if (statusEl){ if (res.status === 401) statusEl.textContent = 'Please log in to load saved vendors.'; else statusEl.textContent = `Failed to load vendors (HTTP ${res.status}).`; } if (retryEl) retryEl.style.display = 'inline'; return; } const json = await res.json(); if (json.success && Array.isArray(json.data)){ SAVED_VENDORS = json.data; populateVendorSelect(); if (statusEl){ if (SAVED_VENDORS.length === 0){ statusEl.textContent = 'No saved vendors yet.'; statusEl.style.display = 'block'; } else { statusEl.textContent = ''; statusEl.style.display = 'none'; } } if (retryEl) retryEl.style.display = 'none'; } else if (statusEl){ statusEl.textContent = 'Failed to load vendors.'; if (retryEl) retryEl.style.display = 'inline'; } } catch (err){ console.warn('Failed to load vendors:', err); if (statusEl) statusEl.textContent = 'Network error loading vendors.'; const re = document.getElementById('vendorsRetry'); if (re) re.style.display = 'inline'; } }
    function populateVendorSelect(){ if (!savedVendorSelect) return; savedVendorSelect.innerHTML = '<option value="">Select a saved vendor</option>'; SAVED_VENDORS.forEach(v => { const opt = document.createElement('option'); opt.value = v._id; opt.textContent = v.name || '(Unnamed vendor)'; savedVendorSelect.appendChild(opt); }); }
    function onVendorSelect(){ const id = savedVendorSelect.value; if (vendorIdInput) vendorIdInput.value = id || ''; }
    function escapeHtml(s){ try { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); } }
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

    function openVendorQuickPick(){
      try {
        if (!vendorQuickPickModal) return;
        if (!vendorQuickPickModalInstance && window.bootstrap){ try { vendorQuickPickModalInstance = new bootstrap.Modal(vendorQuickPickModal); } catch(_) {} }
        if (vendorQuickPickSearch) { vendorQuickPickSearch.value = ''; }
        vendorQuickPickFocusedIndex = 0;
        vendorQuickPickPage = 1;
        // Pre-focus currently selected vendor if available
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
        const name = String(v.name || '').toLowerCase();
        const city = String(v.city || '').toLowerCase();
        const state = String(v.state || '').toLowerCase();
        const email = String(v.contactEmail || '').toLowerCase();
        const phone = String(v.contactPhone || '').toLowerCase();
        if (!q) return true;
        return name.includes(q) || city.includes(q) || state.includes(q) || email.includes(q) || phone.includes(q);
      }).sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));

      // Prefocus currently selected vendor if provided
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
        setHTMLSafe(a, `<div class="d-flex flex-column">
          <strong>${nameHtml}</strong>
          <span class="text-muted small">${cityStateHtml}${contactBits ? ' • ' + contactHtml : ''}</span>
        </div>`);
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
        let has = false; Array.from(savedVendorSelect.options).forEach(o => { if (o.value === v._id){ has = true; } });
        if (!has){ const opt = document.createElement('option'); opt.value = v._id; opt.textContent = v.name || '(Unnamed vendor)'; savedVendorSelect.appendChild(opt); }
        savedVendorSelect.value = v._id || '';
        try { savedVendorSelect.dispatchEvent(new Event('change')); } catch(_) {}
      }
      closeVendorQuickPick();
    }
    function setValue(id, val){ const el = document.getElementById(id); if (el) el.value = val; }

    async function loadTemplates(){ const statusEl = document.getElementById('templatesFetchStatus'); const retryEl = document.getElementById('templatesRetry'); if (statusEl){ statusEl.style.display = 'block'; statusEl.textContent = 'Loading previous listings...'; } if (retryEl) retryEl.style.display = 'none'; try { const res = await fetch('/api/marketplace/my-templates'); if (!res.ok){ if (statusEl){ if (res.status === 401) statusEl.textContent = 'Please log in to load previous listings.'; else if (res.status === 404) statusEl.textContent = 'Previous listings feature is unavailable right now.'; else statusEl.textContent = `Failed to load previous listings (HTTP ${res.status}).`; } if (retryEl) retryEl.style.display = 'inline'; return; } const json = await res.json(); if (json.success && Array.isArray(json.data)){ SAVED_TEMPLATES = json.data; populateTemplateSelect(); if (statusEl){ if (SAVED_TEMPLATES.length === 0){ statusEl.textContent = 'No previous listings yet.'; statusEl.style.display = 'block'; } else { statusEl.textContent = ''; statusEl.style.display = 'none'; } } if (retryEl) retryEl.style.display = 'none'; } else if (statusEl){ statusEl.textContent = 'Failed to load previous listings.'; if (retryEl) retryEl.style.display = 'inline'; } } catch (err){ console.warn('Failed to load templates:', err); if (statusEl) statusEl.textContent = 'Network error loading previous listings.'; if (retryEl) retryEl.style.display = 'inline'; } }
    function populateTemplateSelect(){ if (!savedTemplateSelect) return; savedTemplateSelect.innerHTML = '<option value="">Select a previous listing to prefill...</option>'; SAVED_TEMPLATES.forEach(t => { const opt = document.createElement('option'); opt.value = t._id; opt.textContent = t.title || '(Untitled listing)'; savedTemplateSelect.appendChild(opt); }); }
    function onTemplateSelect(){ const id = savedTemplateSelect.value; const t = SAVED_TEMPLATES.find(x => x._id === id); if (t) applyTemplateToForm(t); }
    function applyTemplateToForm(t){ setValue('title', t.title || ''); const desc = document.getElementById('description'); if (desc) desc.value = t.description || ''; setValue('price', typeof t.price === 'number' ? t.price : (t.price || '')); const priceUnit = document.getElementById('priceUnit'); if (priceUnit && t.priceUnit) priceUnit.value = t.priceUnit; const category = document.getElementById('category'); if (category && t.category) category.value = t.category; setValue('quantity', typeof t.quantity === 'number' ? t.quantity : (t.quantity || '')); setValue('caseSize', typeof t.caseSize === 'number' ? t.caseSize : (t.caseSize || '')); setValue('casePrice', typeof t.casePrice === 'number' ? t.casePrice : (t.casePrice || '')); const isOrg = document.getElementById('isOrganic'); if (isOrg && typeof t.isOrganic === 'boolean') isOrg.checked = t.isOrganic; setValue('listing-upc', t.upcCode || ''); if (t.vendor){ setValue('vendor-name', t.vendor.name || ''); setValue('vendor-email', t.vendor.contactEmail || ''); setValue('vendor-phone', t.vendor.contactPhone || ''); setValue('vendor-website', t.vendor.website || ''); const notesEl = document.getElementById('vendor-notes'); if (notesEl) notesEl.value = t.vendor.notes || ''; } if (t.vendorId && savedVendorSelect){ vendorIdInput.value = t.vendorId; const hasOption = Array.from(savedVendorSelect.options).some(o => o.value === t.vendorId); if (hasOption) savedVendorSelect.value = t.vendorId; } if (t.groupBuy){ const gbEnabled = document.getElementById('groupBuy-enabled'); if (gbEnabled) gbEnabled.checked = !!t.groupBuy.enabled; if (typeof t.groupBuy.minCases !== 'undefined') setValue('groupBuy-minCases', t.groupBuy.minCases); if (typeof t.groupBuy.targetCases !== 'undefined') setValue('groupBuy-targetCases', t.groupBuy.targetCases); if (t.groupBuy.deadline){ const d = new Date(t.groupBuy.deadline); const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); setValue('groupBuy-deadline', iso); } toggleGroupBuyInputs(); } if (t.pieceOrdering){ const poEnabled = document.getElementById('pieceOrdering-enabled'); if (poEnabled) poEnabled.checked = !!t.pieceOrdering.enabled; } }

    if (IS_AUTH){
      if (savedVendorSelect) savedVendorSelect.addEventListener('change', onVendorSelect);
      if (savedTemplateSelect) savedTemplateSelect.addEventListener('change', onTemplateSelect);
      const vendorsRetry = document.getElementById('vendorsRetry'); if (vendorsRetry) vendorsRetry.addEventListener('click', (e) => { e.preventDefault(); loadVendors(); });
      const templatesRetry = document.getElementById('templatesRetry'); if (templatesRetry) templatesRetry.addEventListener('click', (e) => { e.preventDefault(); loadTemplates(); });
      loadVendors();
      loadTemplates();
      loadGroups();
      // Vendor Quick Pick
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
    }

    // Form submission
    if (createListingForm){
      createListingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const groupErr = document.getElementById('group-error');
        if (groupErr) { groupErr.style.display = 'none'; groupErr.textContent = ''; }
        if (groupSelect && (!groupSelect.value || groupSelect.value.trim() === '')){
          if (groupErr) { groupErr.textContent = 'Please select a group'; groupErr.style.display = 'block'; }
          return;
        }
        const formData = new FormData(createListingForm);
        if (groupSelect && groupSelect.value){ formData.set('groupId', groupSelect.value); }
        formData.delete('images');
        selectedFiles.forEach(file => formData.append('images', file));
        formData.delete('tags');
        tags.forEach(tag => formData.append('tags', tag));
        if (priceUnitEl && String(priceUnitEl.value || '').toLowerCase() === 'case'){
          formData.set('casePrice', priceEl && priceEl.value ? priceEl.value : '');
        }
        try {
          const token = (window.localStorage && window.localStorage.getItem('token')) || null;
          const options = { method: 'POST', body: formData, credentials: 'same-origin' };
          if (token) {
            options.headers = {
              Authorization: `Bearer ${token}`
            };
          }
          const response = await fetch('/api/marketplace', options);
          const data = await response.json();
          if (data && data.success){
            alert('Listing created successfully!');
            window.location.href = '/marketplace';
          } else {
            const statusInfo = response && typeof response.status === 'number' ? ` (HTTP ${response.status})` : '';
            const details = Array.isArray(data?.errors) && data.errors.length ? `\n- ${data.errors.join('\n- ')}` : '';
            alert(`Failed to create listing${statusInfo}: ${data?.message || 'Unknown error'}${details}`);
          }
        } catch (error) {
          console.error('Error creating listing:', error);
          alert('An error occurred while creating the listing. Please try again.');
        }
      });
    }

    // Cancel button
    if (cancelButton){
      cancelButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel? All changes will be lost.')) {
          window.location.href = '/marketplace';
        }
      });
    }

    // Map placeholder
    function initMap(){ console.log('Map initialization would happen here'); }
    function normalizeUrl(url){ try { const s = (url || '').trim(); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; return 'https://' + s; } catch(e){ return url; } }

    // Initialize page
    initMap();

    // Food autocomplete
    try {
      const titleInput = document.getElementById('title');
      if (titleInput && window.FoodAutocomplete){
        const foodAutocomplete = new FoodAutocomplete(titleInput, {
          maxResults: 10,
          minLength: 2,
          debounceTime: 300,
          onSelect: (item) => {
            const descriptionInput = document.getElementById('description');
            if (descriptionInput && item && item.category){
              if (!descriptionInput.value.trim()) {
                descriptionInput.value = `Category: ${item.category}\n\nAdd more details about your ${item.description} here.`;
              }
            }
          },
          onResults: (results, isMockData) => {
            try { console.log('🍎 Received results:', results?.length || 0, 'items'); } catch(_) {}
            return (results || []).map(item => ({ description: item.description || item.name || '', category: item.category || item.foodCategory || '' }));
          }
        });
        titleInput.addEventListener('input', function(){ try { console.log('🍎 Input detected in title field:', this.value); } catch(_) {} });
      }
    } catch (error){ try { console.error('🍎❌ Error initializing food autocomplete:', error); } catch(_) {} }

    // UPC scan button
    const scanUpcBtn = document.getElementById('scan-upc-btn');
    const upcModal = document.getElementById('upc-modal');
    if (scanUpcBtn && upcModal){
      scanUpcBtn.addEventListener('click', function(){
        upcModal.style.display = 'block';
        const scannerContainer = document.getElementById('scanner-container');
        const manualEntryContainer = document.getElementById('manual-entry-container');
        const cameraPlaceholder = document.getElementById('camera-placeholder');
        if (scannerContainer) scannerContainer.style.display = 'block';
        if (manualEntryContainer) manualEntryContainer.style.display = 'none';
        if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
        if (typeof Quagga !== 'undefined' && Quagga.canvas && Quagga.canvas.ctx){ Quagga.stop(); }
        if (window.FeatureFlags && window.FeatureFlags.scannerAutoStart){
          if (typeof UpcLookup !== 'undefined' && typeof UpcLookup.setupUpcScanner === 'function'){
            UpcLookup.setupUpcScanner();
          }
        }
      });
    }

    // UPC scan modal close
    const upcModalClose = document.getElementById('upc-modal-close');
    if (upcModalClose){
      upcModalClose.addEventListener('click', function(){
        upcModal.style.display = 'none';
      });
    }

    // UPC scan modal cancel
    const upcModalCancel = document.getElementById('upc-modal-cancel');
    if (upcModalCancel){
      upcModalCancel.addEventListener('click', function(){
        upcModal.style.display = 'none';
      });
    }

    // UPC scan modal submit
    const upcModalSubmit = document.getElementById('upc-modal-submit');
    if (upcModalSubmit){
      upcModalSubmit.addEventListener('click', function(){
        const upcInput = document.getElementById('upc-input');
        if (upcInput){
          const upcValue = upcInput.value.trim();
          if (upcValue){
            const listingUpcInput = document.getElementById('listing-upc');
            if (listingUpcInput){
              listingUpcInput.value = upcValue;
            }
          }
        }
        upcModal.style.display = 'none';
      });
    }
  });
})();
