(function(){
  'use strict';

  function getToken(){
    try { return localStorage.getItem('token') || ''; } catch(_) { return ''; }
  }

  function setHTMLSafe(el, html){
    if (!el) return;
    try {
      if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
      el.innerHTML = String(html||'');
    } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
  }

  function escapeHtml(s){
    try {
      return String(s)
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;')
        .replaceAll("'",'&#039;');
    } catch(_) { return String(s||''); }
  }

  // ===== Initialize CURRENT_USER_ID =====
  document.addEventListener('DOMContentLoaded', function(){
    try {
      var ROOT = document.getElementById('admin-root');
      window.CURRENT_USER_ID = ROOT ? (ROOT.getAttribute('data-current-user-id') || '') : '';
    } catch(_) {}
  });

  function formatBytes(bytes){
    if (!Number.isFinite(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const units = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
  }

  function formatUptime(seconds){
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  // ===== Stats =====
  async function loadStats(){
    try {
      const token = getToken();
      const res = await fetch('/api/admin/stats', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const json = await res.json();
      if (res.ok && json && json.success && json.data){
        const d = json.data;
        const elU = document.getElementById('stat-users'); if (elU) elU.textContent = d.users;
        const elL = document.getElementById('stat-listings'); if (elL) elL.textContent = d.listings;
        const elO = document.getElementById('stat-orders'); if (elO) elO.textContent = d.orders;
        const elM = document.getElementById('stat-messages'); if (elM) elM.textContent = d.messages;
      } else {
        console.warn('Admin stats failed:', json && json.message);
      }
    } catch (e) {
      console.warn('Admin stats error:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', loadStats);

  // ===== System utilities =====
  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('system-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); loadSystem(true); });
    loadSystem(false);
  });

  async function loadSystem(force){
    const statusDb = document.getElementById('system-db-status');
    const statusDbDetails = document.getElementById('system-db-details');
    const statusApi = document.getElementById('system-api-status');
    const statusNode = document.getElementById('system-node-uptime');
    const nodeDetails = document.getElementById('system-node-details');
    const updatedEl = document.getElementById('system-updated');
    if (!statusDb || !statusApi || !statusNode) return;
    if (!force) {
      statusDb.textContent = 'Loading…';
      statusApi.textContent = 'Loading…';
      statusNode.textContent = 'Loading…';
    }
    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/system', { headers, credentials: 'include' });
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const json = isJson ? await res.json() : null;
      if (!isJson) {
        const text = await res.text();
        throw new Error(text ? text.slice(0, 160) : 'Non-JSON response');
      }
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      const data = json.data || {};
      const db = data.db || {};
      const node = data.node || {};
      const api = data.api || {};

      statusDb.textContent = db.connected ? 'Connected' : 'Unavailable';
      if (statusDbDetails) {
        const parts = [];
        if (db.state) parts.push(`State: ${db.state}`);
        if (typeof db.pingMs === 'number') parts.push(`Ping: ${db.pingMs} ms`);
        if (parts.length === 0 && typeof db.pingOk === 'boolean') parts.push(db.pingOk ? 'Ping OK' : 'Ping failed');
        statusDbDetails.textContent = parts.join(' • ');
      }

      statusApi.textContent = api && api.endpoint ? `Index at ${api.endpoint}` : 'API online';

      statusNode.textContent = formatUptime(node.uptimeSeconds);
      if (nodeDetails) {
        const mem = node.memory || {};
        const parts = [];
        if (mem.heapUsed) parts.push(`Heap: ${formatBytes(mem.heapUsed)} used`);
        if (Array.isArray(node.loadAverage) && node.loadAverage.length) {
          const load = node.loadAverage.slice(0, 3).map(v => v.toFixed(2)).join(', ');
          parts.push(`Load avg: ${load}`);
        }
        nodeDetails.textContent = parts.join(' • ');
      }

      if (updatedEl && data.generatedAt) {
        updatedEl.textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString()}`;
      }
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load system status';
      statusDb.textContent = 'Error';
      statusApi.textContent = 'Error';
      statusNode.textContent = 'Error';
      if (statusDbDetails) statusDbDetails.textContent = message;
      if (nodeDetails) nodeDetails.textContent = '';
      if (updatedEl) updatedEl.textContent = 'Update failed';
    }
  }

  // ===== Users =====
  const usersState = { q: '', page: 1, limit: 20, total: 0, pages: 1 };

  document.addEventListener('DOMContentLoaded', () => {
    const q = document.getElementById('admin-users-q');
    const btn = document.getElementById('admin-users-search');
    if (btn) btn.addEventListener('click', () => { usersState.q = (q && q.value || '').trim(); loadUsers(1); });
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); usersState.q = (q && q.value || '').trim(); loadUsers(1); }});
    loadUsers(1);
  });

  async function loadUsers(page){
    try {
      const token = getToken();
      const url = `/api/admin/users?page=${page}&limit=${usersState.limit}&q=${encodeURIComponent(usersState.q||'')}`;
      const res = await fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error((json && json.message) || `HTTP ${res.status}`);
      const data = json.data || { users: [], pagination: { total:0, page, limit: usersState.limit, pages:1 } };
      usersState.page = data.pagination.page || page;
      usersState.limit = data.pagination.limit || usersState.limit;
      usersState.total = data.pagination.total || 0;
      usersState.pages = data.pagination.pages || 1;
      renderUsers(data.users || []);
      renderUsersSummary();
      renderUsersPagination();
    } catch (e) {
      const tb = document.getElementById('admin-users-tbody');
      if (tb) setHTMLSafe(tb, `<tr><td colspan="5" class="text-danger">${escapeHtml(e && e.message || 'Failed to load users')}</td></tr>`);
    }
  }

  function renderUsers(rows){
    const tb = document.getElementById('admin-users-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    if (!rows.length) { setHTMLSafe(tb, '<tr><td colspan="5" class="text-muted">No users found</td></tr>'); return; }
    rows.forEach(u => {
      const tr = document.createElement('tr');
      const created = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '';
      const last = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—';
      const roles = Array.isArray(u.roles) && u.roles.length ? u.roles.join(', ') : 'user';
      const isAdmin = Array.isArray(u.roles) && u.roles.includes('admin');
      const isSelf = (typeof window !== 'undefined' && window.CURRENT_USER_ID) ? (String(u.id) === String(window.CURRENT_USER_ID)) : false;
      setHTMLSafe(tr, `
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(roles)}</td>
        <td>${escapeHtml(created)}</td>
        <td>${escapeHtml(last)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary me-1" data-action="overview" data-id="${escapeHtml(u.id)}">Overview</button>
          ${isSelf
            ? ''
            : (isAdmin
                ? `<button class="btn btn-sm btn-outline-danger" data-action="revoke" data-id="${escapeHtml(u.id)}">Revoke Admin</button>`
                : `<button class="btn btn-sm btn-outline-primary" data-action="grant" data-id="${escapeHtml(u.id)}">Grant Admin</button>`) }
        </td>
      `);
      Array.from(tr.querySelectorAll('button[data-action]')).forEach(btn => {
        const act = btn.getAttribute('data-action');
        if (act === 'overview') {
          btn.addEventListener('click', (e) => onOverview(e, u));
        } else if (!isSelf) {
          btn.addEventListener('click', (e) => onAdminAction(e, u));
        }
      });
      tb.appendChild(tr);
    });
  }

  function renderUsersSummary(){
    const el = document.getElementById('admin-users-summary');
    if (!el) return;
    if (usersState.total === 0) { el.textContent = 'No users'; return; }
    const start = (usersState.page - 1) * usersState.limit + 1;
    const end = Math.min(usersState.page * usersState.limit, usersState.total);
    el.textContent = `Showing ${start}-${end} of ${usersState.total}`;
  }

  function renderUsersPagination(){
    const ul = document.getElementById('admin-users-pagination');
    if (!ul) return;
    ul.innerHTML = '';
    if (usersState.pages <= 1) return;
    function add(label, page, disabled, active){
      const li = document.createElement('li');
      li.className = `page-item ${disabled?'disabled':''} ${active?'active':''}`;
      const a = document.createElement('a'); a.className='page-link'; a.href='#'; a.textContent=label;
      if (!disabled && !active) a.addEventListener('click', (e)=>{ e.preventDefault(); loadUsers(page); });
      li.appendChild(a); ul.appendChild(li);
    }
    add('«', Math.max(1, usersState.page-1), usersState.page===1, false);
    const windowSize = 5; let start = Math.max(1, usersState.page - Math.floor(windowSize/2)); let end = Math.min(usersState.pages, start + windowSize - 1); start = Math.max(1, Math.min(start, end - windowSize + 1));
    for (let p=start; p<=end; p++) add(String(p), p, false, p===usersState.page);
    add('»', Math.min(usersState.pages, usersState.page+1), usersState.page===usersState.pages, false);
  }

  async function onAdminAction(e, user){
    try {
      const btn = e.currentTarget; if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      const token = getToken();
      const url = action === 'grant' ? `/api/admin/users/${encodeURIComponent(id)}/roles/admin/grant` : `/api/admin/users/${encodeURIComponent(id)}/roles/admin/revoke`;
      const res = await fetch(url, { method: 'POST', headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const json = await res.json().catch(()=>({success:false}));
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      await loadUsers(usersState.page);
      try { if (typeof showToast === 'function') showToast('Roles updated'); } catch(_) {}
    } catch (err) {
      console.warn('Admin role change failed:', err);
      alert(err && err.message || 'Failed to update role');
    } finally {
      const btn = e.currentTarget; if (btn) btn.disabled = false;
    }
  }

  async function onOverview(e, user){
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/overview`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      const d = json.data || {};
      alert(`User: ${d.user && d.user.username}\nEmail: ${d.user && d.user.email}\nListings: ${d.counts && d.counts.listings}\nOrders: ${d.counts && d.counts.orders}\nUnread Messages: ${d.counts && d.counts.unreadMessages}`);
    } catch (err) {
      console.warn('Overview failed:', err);
      alert(err && err.message || 'Failed to load overview');
    }
  }

  // ===== Audit Log =====
  document.addEventListener('DOMContentLoaded', () => {
    const limitSel = document.getElementById('audit-limit');
    const refreshBtn = document.getElementById('audit-refresh');
    if (limitSel) limitSel.addEventListener('change', () => loadAudit());
    if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); loadAudit(); });
    loadAudit();
  });

  async function loadAudit(){
    try {
      const token = getToken();
      const limit = parseInt(document.getElementById('audit-limit')?.value || '100', 10) || 100;
      const res = await fetch(`/api/admin/audit?limit=${limit}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json && json.message || `HTTP ${res.status}`);
      const entries = (json.data && json.data.entries) || [];
      renderAudit(entries);
    } catch (e) {
      const tb = document.getElementById('admin-audit-tbody');
      if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-danger">${escapeHtml(e && e.message || 'Failed to load audit log')}</td></tr>`;
    }
  }

  function renderAudit(rows){
    const tb = document.getElementById('admin-audit-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    if (!rows.length) { setHTMLSafe(tb, '<tr><td colspan="6" class="text-muted">No audit entries</td></tr>'); return; }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
      const level = r.level || '';
      const action = r.action || '';
      const p = r.payload || {};
      const actor = p && p.actor ? p.actor : '';
      const target = p && p.target ? p.target : '';
      const details = summarizePayload(p, r);
      setHTMLSafe(tr, `
        <td>${escapeHtml(ts)}</td>
        <td>${escapeHtml(level)}</td>
        <td>${escapeHtml(action)}</td>
        <td>${escapeHtml(actor)}</td>
        <td>${escapeHtml(target)}</td>
        <td><code class="small">${escapeHtml(details)}</code></td>
      `);
      tb.appendChild(tr);
    });
  }

  function summarizePayload(p, entry){
    if (p && typeof p === 'object' && Object.keys(p).length > 0) {
      return JSON.stringify(p);
    }
    if (entry && entry.raw) return entry.raw;
    return '';
  }
})();
