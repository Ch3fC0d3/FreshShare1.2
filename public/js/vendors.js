(function(){
  function setHTMLSafe(el, html){
    try {
      if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
      el.innerHTML = String(html||'');
    } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
  }
  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    const root = document.getElementById('vendors-root');
    const returnTo = root ? (root.getAttribute('data-return') || '') : '';
    const listEl = document.getElementById('vendor-list');
    const btnNew = document.getElementById('vendor-new');
    const btnDelete = document.getElementById('vendor-delete');
    const form = document.getElementById('vendor-form');

    if (btnNew) btnNew.addEventListener('click', () => editNew());
    if (btnDelete) btnDelete.addEventListener('click', () => onDelete());
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); onSave(returnTo); });
    const btnCancel = document.getElementById('vendor-cancel');
    if (btnCancel) btnCancel.addEventListener('click', () => { if (returnTo) window.location.href = returnTo; else window.location.href = '/marketplace'; });

    await loadList();
    editNew();
  }

  function getHeaders(){
    try { const t = localStorage.getItem('token') || localStorage.getItem('authToken'); return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }; } catch(_) { return { 'Content-Type': 'application/json' }; }
  }

  async function loadList(){
    const listEl = document.getElementById('vendor-list');
    if (listEl) setHTMLSafe(listEl, '<div class="list-group-item text-muted">Loading…</div>');
    try {
      const res = await fetch('/api/marketplace/vendors');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      const rows = Array.isArray(json.data) ? json.data : [];
      renderList(rows);
    } catch (e) {
      if (listEl) setHTMLSafe(listEl, `<div class="list-group-item text-danger">${escapeHtml(e && e.message || 'Failed to load')}</div>`);
    }
  }

  function renderList(rows){
    const listEl = document.getElementById('vendor-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!rows.length){
      setHTMLSafe(listEl, '<div class="list-group-item text-muted">No vendors yet. Click New to add one.</div>');
      return;
    }
    rows.forEach(v => {
      const a = document.createElement('a');
      a.href = '#'; a.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      setHTMLSafe(a, `<span>${escapeHtml(v.name || '(Unnamed)')}</span>`);
      a.addEventListener('click', (e) => { e.preventDefault(); editExisting(v); });
      listEl.appendChild(a);
    });
  }

  function editNew(){
    setFormTitle('Create Vendor');
    setForm({});
    setDeleteVisible(false);
  }

  function editExisting(v){
    setFormTitle('Edit Vendor');
    setForm(v || {});
    setDeleteVisible(true);
  }

  function setFormTitle(s){ const el = document.getElementById('vendor-form-title'); if (el) el.textContent = s; }
  function setDeleteVisible(on){ const btn = document.getElementById('vendor-delete'); if (btn) btn.style.display = on ? '' : 'none'; }

  function setForm(v){
    setVal('vendor-id', v._id || '');
    setVal('vendor-name', v.name || '');
    setVal('vendor-website', v.website || '');
    setVal('vendor-email', v.contactEmail || '');
    setVal('vendor-phone', v.contactPhone || '');
    setVal('vendor-address', v.address || '');
    setVal('vendor-city', v.city || '');
    setVal('vendor-state', v.state || '');
    setVal('vendor-zip', v.zipCode || '');
    setVal('vendor-notes', v.notes || '');
  }
  function setVal(id, v){ const el = document.getElementById(id); if (el) el.value = v; }
  function val(id){ const el = document.getElementById(id); return el ? el.value : ''; }

  async function onSave(returnTo){
    const id = val('vendor-id');
    const payload = {
      name: val('vendor-name').trim(),
      website: val('vendor-website').trim(),
      contactEmail: val('vendor-email').trim(),
      contactPhone: val('vendor-phone').trim(),
      address: val('vendor-address').trim(),
      city: val('vendor-city').trim(),
      state: val('vendor-state').trim(),
      zipCode: val('vendor-zip').trim(),
      notes: val('vendor-notes').trim()
    };
    if (!payload.name){ alert('Name is required'); return; }
    try {
      let res;
      if (id){ res = await fetch(`/api/marketplace/vendors/${encodeURIComponent(id)}`, { method:'PUT', headers: getHeaders(), body: JSON.stringify(payload) }); }
      else { res = await fetch('/api/marketplace/vendors', { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) }); }
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      if (returnTo){ window.location.href = returnTo; return; }
      await loadList(); editExisting(json.data);
    } catch (e) {
      alert(e && e.message || 'Failed to save vendor');
    }
  }

  async function onDelete(){
    const id = val('vendor-id'); if (!id) return;
    if (!confirm('Delete this vendor?')) return;
    try {
      const res = await fetch(`/api/marketplace/vendors/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      await loadList(); editNew();
    } catch (e) {
      alert(e && e.message || 'Failed to delete vendor');
    }
  }

  function escapeHtml(s){ try { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); } }
})();
