// public/js/groups-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try {
      function setHTMLSafe(el, html){
        if (!el) return;
        try {
          if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
          el.innerHTML = String(html||'');
        } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
      }
      const token = (function(){ try { return localStorage.getItem('token'); } catch(_) { return null; } })();
      const groupsContainer = document.getElementById('groups-container');
      const groupCardTemplate = document.getElementById('group-card-template');
      const loadingIndicator = document.getElementById('loading-indicator');
      const searchInput = document.getElementById('search-groups');
      const createGroupBtn = document.getElementById('create-group-btn');

      if (searchInput){
        searchInput.addEventListener('input', debounce(function(){
          const searchTerm = this.value.trim().toLowerCase();
          filterGroups(searchTerm);
        }, 300));
      }
      if (createGroupBtn){
        createGroupBtn.addEventListener('click', function(){ window.location.href = '/create-group'; });
      }

      loadGroups();

      async function loadGroups(){
        try {
          const response = await fetch('/api/groups', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}`, 'x-access-token': token } : {})
            }
          });
          if (!response.ok) throw new Error(`Failed to load groups: ${response.status}`);
          const data = await response.json();
          if (loadingIndicator) loadingIndicator.remove();
          if (data.success && Array.isArray(data.groups) && data.groups.length > 0){
            renderGroups(data.groups);
          } else {
            if (groupsContainer) setHTMLSafe(groupsContainer, '<p class="text-center w-100">No groups found. Be the first to create one!</p>');
          }
        } catch (error){
          console.error('Error loading groups:', error);
          if (loadingIndicator) loadingIndicator.remove();
          if (groupsContainer) setHTMLSafe(groupsContainer, '<p class="text-center w-100">Failed to load groups. Please try again later.</p>');
        }
      }

      function renderGroups(groups){
        if (!groupsContainer) return;
        groupsContainer.innerHTML = '';
        groups.forEach(group => {
          try {
            const node = groupCardTemplate.content.cloneNode(true);
            const groupImage = node.querySelector('.group-card-image-container');
            if (groupImage) groupImage.innerHTML = getGroupImage(group.category);
            const nameEl = node.querySelector('.group-name'); if (nameEl) nameEl.textContent = group.name;
            const descEl = node.querySelector('.group-description'); if (descEl) descEl.textContent = truncateText(group.description, 100);
            const membersEl = node.querySelector('.member-count'); if (membersEl) membersEl.textContent = group.members ? group.members.length : 0;
            const loc = (group.location && group.location.city) ? group.location.city : 'Unknown location';
            const locEl = node.querySelector('.group-city'); if (locEl) locEl.textContent = loc;
            const linkEl = node.querySelector('.join-group-btn'); if (linkEl) linkEl.href = `/group-details?id=${group._id}`;
            groupsContainer.appendChild(node);
          } catch (e){ console.error('Render group error:', e); }
        });
        if (groups.length === 0){ setHTMLSafe(groupsContainer, '<p class="text-center w-100">No groups found. Be the first to create one!</p>'); }
      }

      function getGroupImage(category){
        const iconMap = {
          'neighborhood': '<i class="fas fa-home fa-3x"></i>',
          'community_garden': '<i class="fas fa-seedling fa-3x"></i>',
          'food_bank': '<i class="fas fa-box-open fa-3x"></i>',
          'cooking_club': '<i class="fas fa-utensils fa-3x"></i>',
          'other': '<i class="fas fa-users fa-3x"></i>'
        };
        return iconMap[category] || iconMap.other;
      }

      function truncateText(text, maxLength){
        if (!text) return '';
        return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
      }

      function debounce(func, delay){
        let timeout;
        return function(){
          const ctx = this, args = arguments;
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(ctx, args), delay);
        };
      }

      function filterGroups(searchTerm){
        if (!groupsContainer) return;
        const cards = groupsContainer.querySelectorAll('.group-card');
        if (!searchTerm){ cards.forEach(c => c.style.display = 'block'); return; }
        cards.forEach(card => {
          const name = (card.querySelector('.group-name')?.textContent || '').toLowerCase();
          const description = (card.querySelector('.group-description')?.textContent || '').toLowerCase();
          const location = (card.querySelector('.group-city')?.textContent || '').toLowerCase();
          card.style.display = (name.includes(searchTerm) || description.includes(searchTerm) || location.includes(searchTerm)) ? 'block' : 'none';
        });
      }
    } catch (e){ try { console.error('groups-page init error', e); } catch(_) {} }
  });
})();
