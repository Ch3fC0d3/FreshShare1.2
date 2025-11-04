/* Messages page client logic */

(function(){
  document.addEventListener('DOMContentLoaded', init);

  function setHTMLSafe(el, html){
    if (!el) return;
    try {
      if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
      el.innerHTML = String(html||'');
    } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }
  function getToken() {
    return localStorage.getItem('token') || getCookie('token');
  }

  function wireCompose() {
    const form = document.getElementById('compose-form');
    const to = document.getElementById('compose-to');
    const content = document.getElementById('compose-content');
    const send = document.getElementById('compose-send');
    const alertBox = document.getElementById('compose-alert');
    if (!form || !to || !content || !send) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertBox) { alertBox.textContent = ''; alertBox.className = 'mt-2 small'; }
      const recipientUsername = to.value.trim();
      const body = content.value.trim();
      if (!recipientUsername && !(to.dataset && to.dataset.toId)) return;
      if (!body) return;
      send.disabled = true;
      try {
        const token = getToken();
        const payload = (to.dataset && to.dataset.toId && to.dataset.toId.length)
          ? { recipientId: to.dataset.toId, content: body }
          : { recipientUsername, content: body };
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': `Bearer ${token}` } : {}),
          body: JSON.stringify(payload)
        });
        const json = await res.json().catch(()=>({ success:false, message:'Invalid response' }));
        if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
        // Clear form and reload first page (newest first)
        to.value = '';
        if (to.dataset) { delete to.dataset.toId; }
        content.value = '';
        if (alertBox) { alertBox.textContent = 'Message sent.'; alertBox.classList.add('text-success'); }
        await loadPage(1);
        window.dispatchEvent(new Event('messages:unread-updated'));
      } catch (err) {
        if (alertBox) { alertBox.textContent = err.message || 'Failed to send message'; alertBox.classList.add('text-danger'); }
      } finally {
        send.disabled = false;
      }
    });
  }

  function prefillComposeFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search);
      const to = document.getElementById('compose-to');
      const content = document.getElementById('compose-content');
      if (!to) return;
      const username = params.get('to');
      const toId = params.get('toId');
      const wantCompose = params.has('compose') || username || toId;
      if (username) to.value = username;
      if (toId && to.dataset) to.dataset.toId = toId;
      if (wantCompose) {
        try { document.getElementById('compose-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
        try { (content || to).focus(); } catch(_) {}
      }
    } catch(_) {}
  }

  let state = {
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
    loading: false
  };

  async function init() {
    wireMarkAll();
    wireCompose();
    prefillComposeFromQuery();
    await refreshUnread();
    await loadPage(1);
  }

  async function refreshUnread() {
    try {
      const token = getToken();
      const res = await fetch('/api/messages/unread-count', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const count = (data && data.data && typeof data.data.count === 'number') ? data.data.count : 0;
      const el = document.getElementById('unread-count');
      if (el) el.textContent = String(count);
    } catch (e) {
      // keep silent, badge remains as-is
    }
  }

  async function loadPage(page) {
    try {
      state.loading = true;
      const token = getToken();
      const url = `/api/messages?page=${page}&limit=${state.limit}`;
      const res = await fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const payload = json && json.data ? json.data : { messages: [], pagination: { total: 0, page, limit: state.limit, pages: 1 } };
      state.page = payload.pagination.page || page;
      state.limit = payload.pagination.limit || state.limit;
      state.total = payload.pagination.total || 0;
      state.pages = payload.pagination.pages || 1;
      renderMessages(payload.messages || []);
      renderSummary();
      renderPagination();
      await refreshUnread();
    } catch (e) {
      renderError(e.message || 'Failed to load messages');
    } finally {
      state.loading = false;
    }
  }

  function renderMessages(items) {
    const list = document.getElementById('messages-list');
    const empty = document.getElementById('messages-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!items || items.length === 0) {
      if (empty) { empty.textContent = 'No messages'; empty.style.display = 'list-item'; }
      return;
    }
    if (empty) empty.style.display = 'none';

    items.forEach(msg => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-start';
      if (!msg.read) li.classList.add('bg-light');
      const senderName = msg.sender && msg.sender.username ? msg.sender.username : 'Unknown';
      const when = msg.timestamp ? new Date(msg.timestamp) : null;
      const timeStr = when ? when.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

      const safeId = escapeHtml(String(msg._id || ''));
      setHTMLSafe(li, `
        <div class="me-3">
          <div class="fw-semibold">${escapeHtml(senderName)}</div>
          <div class="text-muted small">${escapeHtml(timeStr)}</div>
          <div>${escapeHtml(msg.content || '')}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${msg.read ? '<span class="badge bg-secondary">Read</span>' : '<span class="badge bg-primary">Unread</span>'}
          ${msg.read ? '' : `<button class="btn btn-sm btn-outline-success" data-action="mark-read" data-id="${safeId}"><i class="fas fa-check"></i></button>`}
        </div>
      `);
      list.appendChild(li);
    });

    // Wire buttons
    list.querySelectorAll('button[data-action="mark-read"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          await markRead(id, true);
          await loadPage(state.page);
        } catch (_) {}
        finally { btn.disabled = false; }
      });
    });
  }

  function renderSummary() {
    const el = document.getElementById('messages-summary');
    if (!el) return;
    const start = (state.page - 1) * state.limit + 1;
    const end = Math.min(state.page * state.limit, state.total);
    el.textContent = state.total > 0 ? `Showing ${start}-${end} of ${state.total}` : 'No messages';
  }

  function renderPagination() {
    const ul = document.getElementById('messages-pagination');
    if (!ul) return;
    ul.innerHTML = '';
    if (state.pages <= 1) return;

    function addPage(label, page, disabled, active) {
      const li = document.createElement('li');
      li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
      const a = document.createElement('a');
      a.className = 'page-link';
      a.href = '#';
      a.textContent = label;
      if (!disabled && !active) {
        a.addEventListener('click', (e) => { e.preventDefault(); loadPage(page); });
      }
      li.appendChild(a);
      ul.appendChild(li);
    }

    addPage('«', Math.max(1, state.page - 1), state.page === 1, false);

    const windowSize = 5;
    let start = Math.max(1, state.page - Math.floor(windowSize / 2));
    let end = Math.min(state.pages, start + windowSize - 1);
    start = Math.max(1, Math.min(start, end - windowSize + 1));

    for (let p = start; p <= end; p++) {
      addPage(String(p), p, false, p === state.page);
    }

    addPage('»', Math.min(state.pages, state.page + 1), state.page === state.pages, false);
  }

  function wireMarkAll() {
    const btn = document.getElementById('mark-all-read');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const token = getToken();
        await fetch('/api/messages/mark-all-read', {
          method: 'PATCH',
          headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': `Bearer ${token}` } : {}),
          body: JSON.stringify({})
        });
        await loadPage(state.page);
        await refreshUnread();
      } catch (_) {}
      finally { btn.disabled = false; }
    });
  }

  async function markRead(id, desired) {
    const token = getToken();
    const res = await fetch(`/api/messages/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': `Bearer ${token}` } : {}),
      body: JSON.stringify({ read: !!desired })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderError(msg) {
    const list = document.getElementById('messages-list');
    if (!list) return;
    setHTMLSafe(list, `<li class="list-group-item text-danger">${escapeHtml(msg)}</li>`);
  }

  function escapeHtml(s) {
    try {
      return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    } catch (_) { return String(s || ''); }
  }
})();
