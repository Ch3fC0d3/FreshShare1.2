// public/js/edit-group-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    function setHTMLSafe(el, html){
      if (!el) return;
      try {
        if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
        el.innerHTML = String(html||'');
      } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
    }
    function escapeHtml(s){
      try { return (window.SafeHTML && window.SafeHTML.escape) ? window.SafeHTML.escape(String(s||'')) : String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); }
    }
    const groupId = window.__GROUP_ID__;
    if (!groupId){
      console.error('Edit Group: missing groupId');
      return;
    }

    const form = document.getElementById('edit-group-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const starterProductsList = document.getElementById('starter-products-list');
    const addStarterProductBtn = document.getElementById('add-starter-product-btn');
    const maxActiveProductsInput = document.getElementById('max-active-products');

    let starterProducts = [];
    let isSaving = false;

    if (cancelBtn){
      cancelBtn.addEventListener('click', function(e){
        e.preventDefault();
        window.location.href = `/group-details?id=${encodeURIComponent(groupId)}`;
      });
    }

    function renderStarterProducts(){
      if (!starterProductsList) return;
      starterProductsList.innerHTML = '';

      if (!starterProducts.length){
        setHTMLSafe(starterProductsList, '<p class="text-muted mb-0">No starter products yet.</p>');
        return;
      }

      starterProducts.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'starter-product-card';
        setHTMLSafe(card, `
          <button type="button" class="btn btn-sm btn-outline-danger remove-product-btn" data-index="${index}">
            <i class="fas fa-times"></i>
          </button>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label">Product Name</label>
              <input type="text" class="form-control starter-product-name" data-index="${index}" value="${escapeHtml(product.name || '')}" placeholder="e.g., Organic Honey" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Image URL</label>
              <input type="url" class="form-control starter-product-image" data-index="${index}" value="${escapeHtml(product.imageUrl || '')}" placeholder="https://example.com/image.jpg" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Product URL</label>
              <input type="url" class="form-control starter-product-url" data-index="${index}" value="${escapeHtml(product.productUrl || '')}" placeholder="https://example.com/listing" />
            </div>
            <div class="col-12 mt-2">
              <label class="form-label">Note</label>
              <textarea class="form-control starter-product-note" data-index="${index}" rows="2" placeholder="Why should members want this?">${escapeHtml(product.note || '')}</textarea>
            </div>
          </div>
        `);
        starterProductsList.appendChild(card);
      });
    }

    if (addStarterProductBtn){
      addStarterProductBtn.addEventListener('click', () => {
        starterProducts.push({ name: '', imageUrl: '', productUrl: '', note: '' });
        renderStarterProducts();
      });
    }

    if (starterProductsList){
      starterProductsList.addEventListener('input', (event) => {
        const target = event.target;
        const index = Number(target.getAttribute('data-index'));
        if (Number.isNaN(index) || !starterProducts[index]) return;

        if (target.classList.contains('starter-product-name')){
          starterProducts[index].name = target.value;
        } else if (target.classList.contains('starter-product-image')){
          starterProducts[index].imageUrl = target.value;
        } else if (target.classList.contains('starter-product-url')){
          starterProducts[index].productUrl = target.value;
        } else if (target.classList.contains('starter-product-note')){
          starterProducts[index].note = target.value;
        }
      });

      starterProductsList.addEventListener('click', (event) => {
        const target = event.target.closest('.remove-product-btn');
        if (!target) return;
        const index = Number(target.getAttribute('data-index'));
        if (Number.isNaN(index) || !starterProducts[index]) return;
        starterProducts.splice(index, 1);
        renderStarterProducts();
      });
    }

    function setCheckboxes(containerSelector, values){
      const checkboxes = document.querySelectorAll(containerSelector);
      checkboxes.forEach((checkbox) => {
        checkbox.checked = values.includes(checkbox.value);
      });
    }

    function setSelectValue(selector, value){
      const el = document.querySelector(selector);
      if (el) el.value = value || '';
    }

    function setInputValue(selector, value){
      const el = document.querySelector(selector);
      if (el) el.value = value || '';
    }

    function populateForm(group){
      setInputValue('#group-name', group.name);
      setSelectValue('#group-category', group.category);
      setInputValue('#group-description', group.description || '');

      setInputValue('#group-street', group.location?.street || '');
      setInputValue('#group-city', group.location?.city || '');
      setInputValue('#group-state', group.location?.state || '');
      setInputValue('#group-zipcode', group.location?.zipCode || '');

      setInputValue('#group-rules', group.rules?.textDescription || group.rules || '');
      if (Array.isArray(group.deliveryDays)){
        setCheckboxes('input[name="deliveryDays"]', group.deliveryDays);
      }

      setSelectValue('#group-privacy', group.isPrivate ? 'true' : 'false');

      if (group.orderBySchedule){
        setSelectValue('#order-by-day', group.orderBySchedule.day || '');
        setInputValue('#order-by-time', group.orderBySchedule.time || '');
      }
      if (group.deliverySchedule){
        setSelectValue('#delivery-day', group.deliverySchedule.day || '');
        setInputValue('#delivery-time', group.deliverySchedule.time || '');
      }

      const maxActive = Number(group.maxActiveProducts);
      if (maxActiveProductsInput){
        maxActiveProductsInput.value = Number.isFinite(maxActive) ? maxActive : 20;
      }

      const initialProducts = Array.isArray(group.starterProducts)
        ? group.starterProducts
        : Array.isArray(group.products)
          ? group.products.filter((product) => product.status === 'active' || product.status === 'requested')
          : [];

      starterProducts = initialProducts
        .slice(0, 25)
        .map((product) => ({
          name: product.name || '',
          imageUrl: product.imageUrl || '',
          productUrl: product.productUrl || '',
          note: product.note || ''
        }));
      renderStarterProducts();
    }

    async function loadGroup(){
      try {
        const token = (function(){ try { return localStorage.getItem('token') || localStorage.getItem('authToken'); } catch(_) { return null; } })();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          // Always use Bearer prefix format for consistency
          const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
          headers['Authorization'] = authHeader;
          console.log('Using auth header in loadGroup:', authHeader.substring(0, 20) + '...');
        }

        const response = await fetch(`/api/groups/${groupId}`, { method: 'GET', headers });
        if (!response.ok){
          throw new Error(`Failed to load group (status ${response.status})`);
        }
        const payload = await response.json();
        const group = payload?.group || payload;
        populateForm(group);
      } catch (error) {
        console.error('Error loading group for edit:', error);
        alert('Unable to load group details. Please try again later.');
      }
    }

    function collectFormData(){
      const deliveryDays = Array.from(document.querySelectorAll('input[name="deliveryDays"]:checked')).map((el) => el.value);
      const orderDay = document.getElementById('order-by-day')?.value || '';
      const orderTime = document.getElementById('order-by-time')?.value || '';
      const deliveryDay = document.getElementById('delivery-day')?.value || '';
      const deliveryTime = document.getElementById('delivery-time')?.value || '';

      const orderBySchedule = orderDay && orderTime ? { day: orderDay, time: orderTime } : null;
      const deliverySchedule = deliveryDay && deliveryTime ? { day: deliveryDay, time: deliveryTime } : null;

      const maxActiveValue = maxActiveProductsInput ? parseInt(maxActiveProductsInput.value, 10) : 20;

      const cleanedStarterProducts = starterProducts
        .map((product) => ({
          name: (product.name || '').trim(),
          imageUrl: (product.imageUrl || '').trim(),
          productUrl: (product.productUrl || '').trim(),
          note: (product.note || '').trim()
        }))
        .filter((product) => product.name);

      return {
        name: document.getElementById('group-name')?.value.trim() || '',
        category: document.getElementById('group-category')?.value || '',
        description: document.getElementById('group-description')?.value.trim() || '',
        location: {
          street: document.getElementById('group-street')?.value.trim() || '',
          city: document.getElementById('group-city')?.value.trim() || '',
          state: document.getElementById('group-state')?.value.trim() || '',
          zipCode: document.getElementById('group-zipcode')?.value.trim() || ''
        },
        rules: document.getElementById('group-rules')?.value.trim() || '',
        isPrivate: (document.getElementById('group-privacy')?.value === 'true'),
        deliveryDays,
        orderBySchedule,
        deliverySchedule,
        maxActiveProducts: maxActiveValue,
        starterProducts: cleanedStarterProducts
      };
    }

    function validateForm(data){
      let isValid = true;
      const errorMessages = document.querySelectorAll('.error-message');
      errorMessages.forEach(el => { el.style.display = 'none'; el.textContent = ''; });

      if (!data.name || data.name.length < 3){
        const el = document.getElementById('name-error');
        if (el){
          el.textContent = 'Group name must be at least 3 characters.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (!data.category){
        const el = document.getElementById('category-error');
        if (el){
          el.textContent = 'Please select a category.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (!data.description || data.description.length < 10){
        const el = document.getElementById('description-error');
        if (el){
          el.textContent = 'Description must be at least 10 characters.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (!data.location.city){
        const el = document.getElementById('city-error');
        if (el){
          el.textContent = 'City is required.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (!data.location.zipCode){
        const el = document.getElementById('zipcode-error');
        if (el){
          el.textContent = 'Zip/Postal code is required.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (!data.deliveryDays.length){
        const el = document.getElementById('delivery-days-error');
        if (el){
          el.textContent = 'Please select at least one delivery day.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (Number.isNaN(data.maxActiveProducts) || data.maxActiveProducts < 1 || data.maxActiveProducts > 200){
        const el = document.getElementById('max-active-products-error');
        if (el){
          el.textContent = 'Max active products must be between 1 and 200.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      if (starterProducts.some((product) => product.name.trim() === '')){
        const el = document.getElementById('starter-products-error');
        if (el){
          el.textContent = 'Every starter product must have a name or be removed.';
          el.style.display = 'block';
        }
        isValid = false;
      }

      return isValid;
    }

    async function submitForm(event){
      event.preventDefault();
      if (isSaving) return;

      const data = collectFormData();
      if (!validateForm(data)) return;

      try {
        isSaving = true;
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn){
          saveBtn.disabled = true;
          setHTMLSafe(saveBtn, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...');
        }

        const token = (function(){ try { return localStorage.getItem('token') || localStorage.getItem('authToken'); } catch(_) { return null; } })();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          // Always use Bearer prefix format for consistency
          const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
          headers['Authorization'] = authHeader;
          console.log('Using auth header in submitForm:', authHeader.substring(0, 20) + '...');
        }

        const response = await fetch(`/api/groups/${groupId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        });
        const contentType = response.headers.get('content-type') || '';
        const responseBody = contentType.includes('application/json') ? await response.json() : null;

        if (response.ok){
          window.location.href = `/group-details?id=${encodeURIComponent(groupId)}`;
        } else if (response.status === 401){
          alert('Your session has expired. Please log in again.');
          window.location.href = `/login?redirect=${encodeURIComponent(`/edit-group?id=${groupId}`)}`;
        } else {
          const message = responseBody?.message || 'Failed to update group.';
          alert(message);
        }
      } catch (error) {
        console.error('Error updating group:', error);
        alert('An error occurred while updating the group. Please try again.');
      } finally {
        isSaving = false;
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn){
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    }

    if (form){
      form.addEventListener('submit', submitForm);
    }

    loadGroup();
  });
})();
