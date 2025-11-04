// public/js/create-group-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try {
      const form = document.getElementById('create-group-form');
      const cancelBtn = document.getElementById('cancel-btn');

      function setHTMLSafe(el, html){
        if (!el) return;
        try {
          if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
          el.innerHTML = String(html||'');
        } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
      }

      // Debug authentication status widgets
      const cookieStatus = document.getElementById('cookie-status');
      const localStorageStatus = document.getElementById('localstorage-status');
      const tokenValue = document.getElementById('token-value');
      const debugToggle = document.getElementById('debug-toggle');

      // Check cookie token
      const hasCookieToken = document.cookie.includes('token');
      if (cookieStatus){
        setHTMLSafe(cookieStatus, `<strong>Cookie Token:</strong> ${hasCookieToken ? 'Present' : 'Not found'}`);
        cookieStatus.style.color = hasCookieToken ? 'green' : 'red';
      }

      // Check localStorage token
      let localToken = '';
      try { localToken = localStorage.getItem('token') || ''; } catch(_) { localToken = ''; }
      if (localStorageStatus){
        setHTMLSafe(localStorageStatus, `<strong>LocalStorage Token:</strong> ${localToken ? 'Present' : 'Not found'}`);
        localStorageStatus.style.color = localToken ? 'green' : 'red';
      }

      if (debugToggle){
        debugToggle.addEventListener('click', function(){
          if (debugToggle.textContent === 'Show Token'){
            let cookieToken = '';
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++){
              const c = cookies[i].trim();
              if (c.startsWith('token=')) { cookieToken = c.substring('token='.length); break; }
            }
            setHTMLSafe(tokenValue, `<strong>Cookie Token Value:</strong> ${cookieToken ? cookieToken.substring(0, 10) + '...' : 'None'}<br>` +
                                   `<strong>LocalStorage Token Value:</strong> ${localToken ? localToken.substring(0, 10) + '...' : 'None'}`);
            debugToggle.textContent = 'Hide Token';
          } else {
            setHTMLSafe(tokenValue, '');
            debugToggle.textContent = 'Show Token';
          }
        });
      }

      const categorySelect = document.getElementById('group-category');
      const maxActiveProductsInput = document.getElementById('max-active-products');
      const starterProductsList = document.getElementById('starter-products-list');
      const addStarterProductBtn = document.getElementById('add-starter-product-btn');

      if (cancelBtn){
        cancelBtn.addEventListener('click', function(e){ e.preventDefault(); window.location.href = '/groups'; });
      }

      const starterProducts = [];

      function renderStarterProducts(){
        if (!starterProductsList) return;
        starterProductsList.innerHTML = '';
        if (starterProducts.length === 0){
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
                <input type="text" class="form-control starter-product-name" data-index="${index}" value="${product.name || ''}" placeholder="e.g., Organic Honey" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Image URL</label>
                <input type="url" class="form-control starter-product-image" data-index="${index}" value="${product.imageUrl || ''}" placeholder="https://example.com/image.jpg" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Product URL</label>
                <input type="url" class="form-control starter-product-url" data-index="${index}" value="${product.productUrl || ''}" placeholder="https://example.com/listing" />
              </div>
              <div class="col-12 mt-2">
                <label class="form-label">Note</label>
                <textarea class="form-control starter-product-note" data-index="${index}" rows="2" placeholder="Why should members want this?">${product.note || ''}</textarea>
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

        renderStarterProducts();
      }

      if (form){
        form.addEventListener('submit', async function(e){
          e.preventDefault();
          // Reset error messages
          const errorMessages = document.querySelectorAll('.error-message');
          errorMessages.forEach(el => { el.style.display = 'none'; el.textContent = ''; });

          // Validate
          let isValid = true;
          const requiredFields = [
            { id: 'group-name', error: 'name-error', message: 'Group name is required (min 3 characters)' },
            { id: 'group-description', error: 'description-error', message: 'Group description is required (min 10 characters)' },
            { id: 'group-city', error: 'city-error', message: 'City is required' },
            { id: 'group-zipcode', error: 'zipcode-error', message: 'Zip/Postal code is required' }
          ];
          requiredFields.forEach(field => {
            const input = document.getElementById(field.id); const value = (input?.value || '').trim();
            if (!value){
              const el = document.getElementById(field.error); if (el){ el.textContent = field.message; el.style.display = 'block'; }
              isValid = false;
            } else if (field.id === 'group-name' && value.length < 3){
              const el = document.getElementById(field.error); if (el){ el.textContent = 'Group name must be at least 3 characters'; el.style.display = 'block'; }
              isValid = false;
            } else if (field.id === 'group-description' && value.length < 10){
              const el = document.getElementById(field.error); if (el){ el.textContent = 'Description must be at least 10 characters'; el.style.display = 'block'; }
              isValid = false;
            }
          });

          const category = (document.getElementById('group-category')?.value) || '';
          if (!category){ const el = document.getElementById('category-error'); if (el){ el.textContent = 'Please select a category'; el.style.display = 'block'; } isValid = false; }

          const deliveryDays = document.querySelectorAll('input[name="deliveryDays"]:checked');
          if (deliveryDays.length === 0){ const el = document.getElementById('delivery-days-error'); if (el){ el.textContent = 'Please select at least one delivery day'; el.style.display = 'block'; } isValid = false; }

          const maxActiveProductsEl = document.getElementById('max-active-products-error');
          if (maxActiveProductsEl){ maxActiveProductsEl.style.display = 'none'; maxActiveProductsEl.textContent = ''; }

          const starterProductsErrorEl = document.getElementById('starter-products-error');
          if (starterProductsErrorEl){ starterProductsErrorEl.style.display = 'none'; starterProductsErrorEl.textContent = ''; }

          // Schedule validation (optional weekly day/time fields)
          const orderDayInput = document.getElementById('order-by-day');
          const orderTimeInput = document.getElementById('order-by-time');
          const deliveryDayInput = document.getElementById('delivery-day');
          const deliveryTimeInput = document.getElementById('delivery-time');

          const orderDay = orderDayInput?.value || '';
          const orderTime = orderTimeInput?.value || '';
          const deliveryDay = deliveryDayInput?.value || '';
          const deliveryTime = deliveryTimeInput?.value || '';

          let orderBySchedule = null;
          let deliverySchedule = null;

          const scheduleErrors = [];
          if ((orderDay && !orderTime) || (orderTime && !orderDay)){
            scheduleErrors.push('Please select both an order-by day and time.');
          } else if (orderDay && orderTime){
            orderBySchedule = { day: orderDay, time: orderTime };
          }

          if ((deliveryDay && !deliveryTime) || (deliveryTime && !deliveryDay)){
            scheduleErrors.push('Please select both a delivery day and time.');
          } else if (deliveryDay && deliveryTime){
            deliverySchedule = { day: deliveryDay, time: deliveryTime };
          }

          const maxActiveProductsValue = maxActiveProductsInput ? parseInt(maxActiveProductsInput.value, 10) : 20;
          if (Number.isNaN(maxActiveProductsValue) || maxActiveProductsValue < 1 || maxActiveProductsValue > 200){
            const el = document.getElementById('max-active-products-error');
            if (el){
              el.textContent = 'Max active products must be between 1 and 200.';
              el.style.display = 'block';
            }
            isValid = false;
          }

          const cleanedStarterProducts = starterProducts
            .map((product) => ({
              name: (product.name || '').trim(),
              imageUrl: (product.imageUrl || '').trim(),
              productUrl: (product.productUrl || '').trim(),
              note: (product.note || '').trim()
            }))
            .filter((product) => product.name);

          if (cleanedStarterProducts.length !== starterProducts.length){
            const el = document.getElementById('starter-products-error');
            if (el){
              el.textContent = 'Every starter product must have a name. Remove unused entries or fill them in.';
              el.style.display = 'block';
            }
            isValid = false;
          }

          if (scheduleErrors.length > 0){
            const el = document.getElementById('schedule-error');
            if (el){ setHTMLSafe(el, scheduleErrors.join(' ')); el.style.display = 'block'; }
            isValid = false;
          }
          if (!isValid) return;

          const data = {
            name: document.getElementById('group-name').value.trim(),
            category,
            description: document.getElementById('group-description').value.trim(),
            location: {
              street: document.getElementById('group-street').value.trim() || '',
              city: document.getElementById('group-city').value.trim(),
              state: document.getElementById('group-state').value.trim() || '',
              zipCode: document.getElementById('group-zipcode').value.trim()
            },
            rules: document.getElementById('group-rules').value.trim() || '',
            isPrivate: (document.getElementById('group-privacy').value === 'true'),
            deliveryDays: Array.from(deliveryDays).map(d => d.value),
            orderBySchedule: orderBySchedule,
            deliverySchedule: deliverySchedule,
            maxActiveProducts: maxActiveProductsValue,
            starterProducts: cleanedStarterProducts
          };

          try {
            const token = (function(){ try { return localStorage.getItem('token'); } catch(_) { return null; } })();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const response = await fetch('/api/groups', { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify(data) });
            let respData = null; const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) respData = await response.json();
            else { const text = await response.text(); console.warn('Non-JSON response received:', text.slice(0,200)); respData = { success: false, message: `Unexpected response (${response.status})` }; }

            if (response.ok && respData.success){
              window.location.href = '/groups';
            } else if (response.status === 401){
              const debugInfo = document.getElementById('auth-debug');
              if (debugInfo) debugInfo.insertAdjacentHTML('beforeend', '<div class="alert alert-danger">Server says you are not authenticated. Redirecting to login page...</div>');
              setTimeout(() => { window.location.href = respData.redirect || '/login?redirect=/create-group'; }, 2000);
            } else {
              if (respData.errors && Array.isArray(respData.errors)){
                respData.errors.forEach(error => {
                  const field = String(error || '').split(' ')[0].toLowerCase();
                  const el = document.getElementById(`${field}-error`);
                  if (el){ el.textContent = error; el.style.display = 'block'; }
                });
              } else {
                alert('Failed to create group: ' + (respData.message || 'An unknown error occurred'));
              }
            }
          } catch (error){
            console.error('Error creating group:', error);
            alert('An error occurred while creating the group. Please try again.');
          }
        });
      }
    } catch (e){ try { console.error('create-group-page init error', e); } catch(_) {} }
  });
})();
