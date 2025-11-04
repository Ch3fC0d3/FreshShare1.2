// public/js/forum-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try {
      // --- Helpers ---
      function escapeHtml(text){
        try {
          return String(text)
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;')
            .replaceAll("'",'&#039;');
        } catch(_){ return String(text||''); }
      }

      // Safely set HTML using DOMPurify / SafeHTML when available
      function setHTMLSafe(el, html){
        if (!el) return;
        try {
          if (window.SafeHTML && typeof window.SafeHTML.sanitize === 'function'){
            el.innerHTML = window.SafeHTML.sanitize(String(html||''));
          } else if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function'){
            el.innerHTML = window.DOMPurify.sanitize(String(html||''));
          } else {
            el.innerHTML = String(html||'');
          }
        } catch(_){ try { el.textContent = String(html||''); } catch(__){} }
      }

      function showToast(message, variant){
        try {
          const id = 'fs-toast-container';
          let c = document.getElementById(id);
          if (!c){
            c = document.createElement('div');
            c.id = id;
            c.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
            document.body.appendChild(c);
          }
          const el = document.createElement('div');
          const bg = variant === 'ok' ? '#065f46' : (variant === 'warn' ? '#92400e' : '#1f2937');
          const border = variant === 'ok' ? '#10b981' : (variant === 'warn' ? '#f59e0b' : '#9ca3af');
          el.style.cssText = `color:#fff;background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 12px;box-shadow:0 2px 8px rgba(0,0,0,.2);opacity:0;transform:translateY(6px);transition:opacity .2s ease, transform .2s ease;`;
          setHTMLSafe(el, message || '');
          c.appendChild(el);
          requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
          setTimeout(() => {
            el.style.opacity = '0'; el.style.transform = 'translateY(6px)';
            setTimeout(() => { try { el.remove(); } catch(_) {} }, 200);
          }, 2800);
        } catch(_) {}
      }
      function isUnauthorizedMsg(msg){
        try { return /(^|\b)(401|unauthorized)(\b|$)/i.test(String(msg||'')); } catch(_) { return false; }
      }
      function relTime(iso){
        try {
          const d = new Date(iso);
          const diff = Math.floor((Date.now() - d.getTime())/1000);
          if (diff < 60) return `${diff}s ago`;
          const m = Math.floor(diff/60); if (m < 60) return `${m}m ago`;
          const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
          const days = Math.floor(h/24); return `${days}d ago`;
        } catch(_) { return ''; }
      }
      function getAuthHeaders(){
        try { const t = localStorage.getItem('token') || localStorage.getItem('authToken'); return t ? { 'Authorization': `Bearer ${t}` } : {}; } catch(_) { return {}; }
      }
      async function getJson(url){
        try {
          const r = await fetch(url, { headers: getAuthHeaders() });
          const text = await r.text();
          let json = {}; try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
          if (!r.ok) return { success:false, message: (json && json.message) ? json.message : `HTTP ${r.status}` };
          return json;
        } catch(e){ return { success:false, message: e && e.message || 'Network error' }; }
      }
      async function postJson(url, body){
        try {
          const r = await fetch(url, { method:'POST', headers: Object.assign({ 'Content-Type':'application/json' }, getAuthHeaders()), body: JSON.stringify(body||{}) });
          const text = await r.text();
          let json = {}; try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {}; }
          if (!r.ok) return { success:false, message: (json && json.message) ? json.message : `HTTP ${r.status}` };
          return json;
        } catch(e){ return { success:false, message: e && e.message || 'Network error' }; }
      }

      // New Post button scroll (replaces inline onclick)
      const newPostBtn = document.getElementById('new-post-btn') || document.querySelector('.new-post-btn');
      if (newPostBtn){
        newPostBtn.addEventListener('click', function(){
          const section = document.querySelector('.create-post-section');
          if (section) section.scrollIntoView({ behavior: 'smooth' });
        });
      }

      // Like/Save interactions
      let likeButtons = [];
      let saveButtons = [];
      try {
        // Prefer selecting by container then filtering to avoid :has dependency
        const actionItems = document.querySelectorAll('.action-item');
        likeButtons = Array.from(actionItems).filter(el => el.querySelector('.fa-heart'));
        saveButtons = Array.from(actionItems).filter(el => el.querySelector('.fa-bookmark'));
      } catch(_) {
        try {
          likeButtons = document.querySelectorAll('.action-item:has(.fa-heart)');
          saveButtons = document.querySelectorAll('.action-item:has(.fa-bookmark)');
        } catch(_) {}
      }

      likeButtons.forEach(button => {
        button.addEventListener('click', function(){
          const icon = this.querySelector('i');
          const countSpan = this.querySelector('span');
          if (!icon || !countSpan) return;
          const currentText = countSpan.textContent || '0';
          const m = currentText.match(/\d+/);
          const currentCount = m ? parseInt(m[0], 10) : 0;
          if (icon.classList.contains('far')){
            icon.classList.remove('far');
            icon.classList.add('fas');
            this.classList.add('liked');
            countSpan.textContent = `${currentCount + 1} Likes`;
          } else {
            icon.classList.remove('fas');
            icon.classList.add('far');
            this.classList.remove('liked');
            countSpan.textContent = `${Math.max(0, currentCount - 1)} Likes`;
          }
        });
      });

      saveButtons.forEach(button => {
        button.addEventListener('click', function(){
          const icon = this.querySelector('i');
          const textSpan = this.querySelector('span');
          if (!icon || !textSpan) return;
          if (icon.classList.contains('far')){
            icon.classList.remove('far');
            icon.classList.add('fas');
            this.classList.add('saved');
            textSpan.textContent = 'Saved';
          } else {
            icon.classList.remove('fas');
            icon.classList.add('far');
            this.classList.remove('saved');
            textSpan.textContent = 'Save';
          }
        });
      });

      // Animation for forum cards
      function animateCards(){
        const cards = document.querySelectorAll('.forum-card');
        cards.forEach((card, index) => {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, 100 * index);
        });
      }
      // Initial animation will also run after dynamic render

      // File upload preview functionality
      const fileInput = document.getElementById('postMedia');
      const mediaPreview = document.getElementById('mediaPreview');
      if (fileInput && mediaPreview){
        fileInput.addEventListener('change', function(){
          mediaPreview.innerHTML = '';
          if (this.files){
            Array.from(this.files).forEach(file => {
              if (file.type && file.type.match('image.*')){
                const reader = new FileReader();
                reader.onload = function(e){
                  const previewItem = document.createElement('div');
                  previewItem.className = 'preview-item';
                  const img = document.createElement('img');
                  img.src = e.target.result;
                  const removeBtn = document.createElement('span');
                  removeBtn.className = 'remove-preview';
                  removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                  removeBtn.addEventListener('click', function(ev){ ev.stopPropagation(); previewItem.remove(); });
                  previewItem.appendChild(img);
                  previewItem.appendChild(removeBtn);
                  mediaPreview.appendChild(previewItem);
                };
                reader.readAsDataURL(file);
              }
            });
          }
        });
      }

      // Rich text editor toolbar
      const toolbarButtons = document.querySelectorAll('.toolbar-btn');
      const contentTextarea = document.querySelector('.content-textarea');
      if (toolbarButtons.length && contentTextarea){
        toolbarButtons.forEach(button => {
          button.addEventListener('click', function(){
            const command = (this.getAttribute('title') || '').toLowerCase();
            let tag = '';
            switch (command){
              case 'bold': tag = '**text**'; break;
              case 'italic': tag = '*text*'; break;
              case 'bulleted list': tag = '- List item\n- List item\n- List item'; break;
              case 'numbered list': tag = '1. List item\n2. List item\n3. List item'; break;
              case 'insert link': tag = '[Link text](https://example.com)'; break;
            }
            const startPos = contentTextarea.selectionStart || 0;
            const endPos = contentTextarea.selectionEnd || 0;
            const selectedText = contentTextarea.value.substring(startPos, endPos);
            let insertText = tag;
            if (selectedText){
              if (command === 'bold') insertText = `**${selectedText}**`;
              else if (command === 'italic') insertText = `*${selectedText}*`;
              else if (command === 'insert link') insertText = `[${selectedText}](https://example.com)`;
              else insertText = selectedText + '\n' + tag;
            }
            contentTextarea.focus();
            try { document.execCommand('insertText', false, insertText); } catch(_) {
              // Fallback
              const before = contentTextarea.value.substring(0, startPos);
              const after = contentTextarea.value.substring(endPos);
              contentTextarea.value = before + insertText + after;
            }
          });
        });
      }

      // Cancel button
      const cancelButton = document.querySelector('.btn-cancel');
      if (cancelButton){
        cancelButton.addEventListener('click', function(){
          const form = document.querySelector('.create-post-form');
          if (form) form.reset();
          const mp = document.getElementById('mediaPreview');
          if (mp) mp.innerHTML = '';
        });
      }

      // --- Dynamic posts ---
      const postsContainer = document.getElementById('forumPosts');
      const postsStatus = document.getElementById('forumPostsStatus');
      const loadMoreBtn = document.getElementById('forumLoadMore');
      const loadMoreStatus = document.getElementById('forumLoadMoreStatus');
      let currentPage = 1;
      const pageLimit = 10;
      let isLoading = false;
      let noMore = false;
      function renderPostCard(p){
        const el = document.createElement('div');
        el.className = 'forum-card';
        const pid = p.id || p._id || p.postId || '';
        const author = escapeHtml(p.authorName || (p.createdBy && p.createdBy.username) || 'Member');
        const title = escapeHtml(p.title || '');
        const content = escapeHtml(p.content || '');
        const category = escapeHtml(p.category || 'Discussion');
        const when = relTime(p.createdAt || Date.now());
        const profileImage = (p.createdBy && p.createdBy.profileImage) || '/images/avatar-placeholder.svg';
        setHTMLSafe(el, `
          <div class="post-header">
            <img src="${escapeHtml(profileImage)}" alt="User Avatar" class="user-avatar" onerror="this.src='/images/avatar-placeholder.svg'">
            <div class="post-user-info">
              <h5>${author}</h5>
              <div class="post-meta">
                <span><i class="far fa-clock me-1"></i> ${when}</span>
                <span class="category-badge">${category}</span>
              </div>
            </div>
          </div>
          <div class="post-content">
            <h4>${title}</h4>
            <p>${content}</p>
          </div>
          <div class="post-actions">
            <div class="action-item${p.liked ? ' liked' : ''}">
              <i class="${p.liked ? 'fas' : 'far'} fa-heart"></i>
              <span>${Number(p.likesCount||0)} Likes</span>
            </div>
            <div class="action-item">
              <i class="far fa-comment"></i>
              <span>${Number(p.commentsCount||0)} Comments</span>
            </div>
            <div class="action-item">
              <i class="far fa-bookmark"></i>
              <span>Save</span>
            </div>
          </div>
        `);
        // Comments block
        const commentsWrap = document.createElement('div');
        commentsWrap.className = 'post-comments';
        setHTMLSafe(commentsWrap, `
          <div class="comments-list" data-post-id="${pid}"></div>
          <form class="comment-form" data-post-id="${pid}" style="margin-top:8px;display:flex;gap:8px;align-items:flex-start">
            <input class="comment-input" type="text" placeholder="Write a comment..." style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px" />
            <button type="submit" class="comment-submit" style="padding:8px 12px;background:#0d6efd;color:#fff;border:none;border-radius:8px">Post</button>
            <span class="comment-status note" style="margin-left:8px;"></span>
          </form>
        `);
        el.appendChild(commentsWrap);
        // wire like/save toggles for this card only
        try {
          const likeBtn = el.querySelector('.action-item i.fa-heart')?.parentElement;
          const saveBtn = el.querySelector('.action-item i.fa-bookmark')?.parentElement;
          if (likeBtn){
            likeBtn.addEventListener('click', async function(){
              const btn = this;
              if (btn.dataset.loading === '1') return;
              btn.dataset.loading = '1';
              const prevPe = btn.style.pointerEvents;
              const prevOp = btn.style.opacity;
              btn.style.pointerEvents = 'none';
              btn.style.opacity = '0.6';
              const icon = btn.querySelector('i');
              const countSpan = btn.querySelector('span');
              try {
                const r = await postJson(`/api/forum/posts/${encodeURIComponent(pid)}/like`, {});
                if (r && r.success && r.data){
                  const liked = !!r.data.liked;
                  const count = Number(r.data.likesCount||0);
                  if (liked){
                    icon.classList.remove('far'); icon.classList.add('fas'); btn.classList.add('liked');
                  } else {
                    icon.classList.remove('fas'); icon.classList.add('far'); btn.classList.remove('liked');
                  }
                  countSpan.textContent = `${count} Likes`;
                } else {
                  if (r && isUnauthorizedMsg(r.message)) showToast('Please log in to like posts.', 'warn');
                }
              } catch(_) {}
              finally {
                btn.dataset.loading = '';
                btn.style.pointerEvents = prevPe || '';
                btn.style.opacity = prevOp || '';
              }
            });
          }
          if (saveBtn){
            saveBtn.addEventListener('click', function(){
              const icon = this.querySelector('i'); const textSpan = this.querySelector('span');
              if (icon.classList.contains('far')){ icon.classList.remove('far'); icon.classList.add('fas'); this.classList.add('saved'); textSpan.textContent = 'Saved'; }
              else { icon.classList.remove('fas'); icon.classList.add('far'); this.classList.remove('saved'); textSpan.textContent = 'Save'; }
            });
          }
        } catch(_) {}
        // load initial comments (last page not needed; we just show recent few)
        (async () => {
          try {
            const listEl = commentsWrap.querySelector('.comments-list');
            const resp = await getJson(`/api/forum/posts/${encodeURIComponent(pid)}/comments?limit=5&page=1`);
            if (resp && resp.success && Array.isArray(resp.data)){
              listEl.innerHTML = '';
              resp.data.slice(-5).forEach(c => {
                const row = document.createElement('div');
                row.className = 'comment-row';
                row.style.cssText = 'padding:6px 0;border-bottom:1px dotted #eee;display:flex;gap:8px;';
                const commentAuthor = escapeHtml(c.authorName || (c.createdBy && c.createdBy.username) || 'Member');
                const commentAvatar = (c.createdBy && c.createdBy.profileImage) || '/images/avatar-placeholder.svg';
                setHTMLSafe(row, `
                  <img src="${escapeHtml(commentAvatar)}" alt="${commentAuthor}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.src='/images/avatar-placeholder.svg'">
                  <div style="flex:1">
                    <div class="comment-meta"><strong>${commentAuthor}</strong> · <span class="note">${relTime(c.createdAt||Date.now())}</span></div>
                    <div class="comment-text">${escapeHtml(c.content||'')}</div>
                  </div>
                `);
                listEl.appendChild(row);
              });
            }
          } catch(_) {}
        })();
        // submit new comment
        const form = commentsWrap.querySelector('.comment-form');
        const status = commentsWrap.querySelector('.comment-status');
        const listEl = commentsWrap.querySelector('.comments-list');
        if (form){
          form.addEventListener('submit', async function(e){
            e.preventDefault();
            const input = form.querySelector('.comment-input');
            const submitBtn = form.querySelector('.comment-submit');
            let prevPe='', prevOp='', prevHtml='';
            const text = (input && input.value || '').trim();
            if (!text){ if (status){ status.textContent = 'Please write something.'; } return; }
            if (status){ status.textContent = 'Posting...'; }
            if (submitBtn && submitBtn.dataset.loading !== '1'){
              submitBtn.dataset.loading = '1';
              prevPe = submitBtn.style.pointerEvents; prevOp = submitBtn.style.opacity; prevHtml = submitBtn.innerHTML;
              submitBtn.style.pointerEvents = 'none'; submitBtn.style.opacity = '0.6';
              setHTMLSafe(submitBtn, '<i class="fas fa-sync-alt fa-spin"></i> <span>Posting...</span>');
            }
            const resp = await postJson(`/api/forum/posts/${encodeURIComponent(pid)}/comments`, { content: text });
            if (resp && resp.success && resp.data){
              // append comment
              const c = resp.data;
              const row = document.createElement('div');
              row.className = 'comment-row';
              row.style.cssText = 'padding:6px 0;border-bottom:1px dotted #eee;display:flex;gap:8px;';
              const commentAuthor = escapeHtml(c.authorName || (c.createdBy && c.createdBy.username) || 'You');
              const commentAvatar = (c.createdBy && c.createdBy.profileImage) || '/images/avatar-placeholder.svg';
              setHTMLSafe(row, `
                <img src="${escapeHtml(commentAvatar)}" alt="${commentAuthor}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.src='/images/avatar-placeholder.svg'">
                <div style="flex:1">
                  <div class="comment-meta"><strong>${commentAuthor}</strong> · <span class="note">${relTime(c.createdAt||Date.now())}</span></div>
                  <div class="comment-text">${escapeHtml(c.content||'')}</div>
                </div>
              `);
              listEl.appendChild(row);
              try { input.value=''; } catch(_) {}
              if (status){ status.textContent = ''; }
            } else {
              if (resp && isUnauthorizedMsg(resp.message)) { showToast('Please log in to comment.', 'warn'); }
              if (status){ status.textContent = resp && resp.message ? resp.message : 'Failed to post comment'; }
            }
            // restore submit button
            if (submitBtn){ submitBtn.dataset.loading=''; submitBtn.style.pointerEvents = prevPe || ''; submitBtn.style.opacity = prevOp || ''; if (prevHtml) submitBtn.innerHTML = prevHtml; }
          });
        }
        return el;
      }
      async function loadPosts(page, append){
        if (isLoading || noMore) return;
        isLoading = true;
        if (!append){ postsContainer.innerHTML = ''; if (postsStatus) postsStatus.textContent = 'Loading posts...'; }
        if (loadMoreStatus) loadMoreStatus.textContent = append ? 'Loading...' : '';
        const resp = await getJson(`/api/forum/posts?page=${page}&limit=${pageLimit}`);
        if (resp && resp.success && Array.isArray(resp.data)){
          if (!append) postsContainer.innerHTML = '';
          if (resp.data.length === 0 && page === 1){
            const empty = document.createElement('div'); empty.className='note'; empty.textContent = 'No posts yet. Be the first to share!';
            postsContainer.appendChild(empty);
            noMore = true;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
          } else {
            resp.data.forEach(p => postsContainer.appendChild(renderPostCard(p)));
            animateCards();
            // pagination controls
            if (resp.data.length < pageLimit){
              noMore = true;
              if (loadMoreBtn) loadMoreBtn.style.display = 'none';
              if (loadMoreStatus) loadMoreStatus.textContent = page > 1 ? 'No more posts.' : '';
            } else {
              noMore = false;
              if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block';
              if (loadMoreStatus) loadMoreStatus.textContent = '';
            }
          }
        } else {
          if (!append && postsStatus) postsStatus.textContent = resp && resp.message ? resp.message : 'Failed to load posts';
          if (append && loadMoreStatus) loadMoreStatus.textContent = resp && resp.message ? resp.message : 'Failed to load more';
        }
        isLoading = false;
      }
      // initial load
      currentPage = 1; noMore = false; loadPosts(currentPage, false);
      // Load more handler
      if (loadMoreBtn){
        loadMoreBtn.addEventListener('click', async function(){
          if (isLoading || noMore) return;
          const btn = this;
          if (btn.dataset.loading === '1') return;
          btn.dataset.loading = '1';
          const prevPe = btn.style.pointerEvents; const prevOp = btn.style.opacity; const prevHtml = btn.innerHTML;
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.6';
          setHTMLSafe(btn, '<i class="fas fa-sync-alt fa-spin"></i> <span>Loading...</span>');
          currentPage += 1;
          await loadPosts(currentPage, true);
          btn.dataset.loading = '';
          btn.style.pointerEvents = prevPe || '';
          btn.style.opacity = prevOp || '';
          btn.innerHTML = prevHtml;
        });
      }

      // --- Submit new post ---
      const formEl = document.getElementById('forumCreateForm');
      const msgEl = document.getElementById('forumCreateMsg');
      const titleEl = document.getElementById('postTitle');
      const contentEl = document.getElementById('postContent');
      const catEl = document.getElementById('postCategory');
      if (formEl){
        formEl.addEventListener('submit', async function(e){
          e.preventDefault();
          const publishBtn = formEl.querySelector('.btn-publish');
          let prevPe='', prevOp='', prevHtml='';
          const title = (titleEl && titleEl.value || '').trim();
          const content = (contentEl && contentEl.value || '').trim();
          const category = (catEl && catEl.value && catEl.value !== 'Choose a category') ? catEl.value : 'Discussion';
          if (!title || !content){ if (msgEl){ msgEl.className='note err'; msgEl.textContent='Please enter a title and content.'; } return; }
          if (publishBtn && publishBtn.dataset.loading !== '1'){
            publishBtn.dataset.loading = '1';
            prevPe = publishBtn.style.pointerEvents; prevOp = publishBtn.style.opacity; prevHtml = publishBtn.innerHTML;
            publishBtn.style.pointerEvents = 'none'; publishBtn.style.opacity = '0.6';
            setHTMLSafe(publishBtn, '<i class="fas fa-paper-plane"></i> Publishing...');
          }
          if (msgEl){ msgEl.className = 'note'; msgEl.textContent = 'Publishing...'; }
          const resp = await postJson('/api/forum/posts', { title, content, category, images: [] });
          if (resp && resp.success && resp.data){
            if (msgEl){ msgEl.className='note ok'; msgEl.textContent='Post published!'; }
            try {
              // Prepend new post optimistically
              postsContainer.prepend(renderPostCard(Object.assign({ likesCount:0, commentsCount:0 }, resp.data)));
              animateCards();
            } catch(_){}
            try { formEl.reset(); const mp = document.getElementById('mediaPreview'); if (mp) mp.innerHTML=''; } catch(_){ }
          } else {
            if (resp && isUnauthorizedMsg(resp.message)) { showToast('Please log in to publish a post.', 'warn'); }
            if (msgEl){ msgEl.className='note err'; msgEl.textContent = resp && resp.message ? resp.message : 'Failed to publish post'; }
          }
          // restore publish button
          if (publishBtn){ publishBtn.dataset.loading=''; publishBtn.style.pointerEvents = prevPe || ''; publishBtn.style.opacity = prevOp || ''; if (prevHtml) publishBtn.innerHTML = prevHtml; }
        });
      }
    } catch (e){
      try { console.error('forum-page init error', e); } catch(_) {}
    }
  });
})();
