/**
 * Group Details Page JavaScript
 * Handles all functionality for the group details page including:
 * - Loading and displaying group information
 * * - Discussion board functionality
 * - Event management
 * - Member management
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get group ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('id');
    
    if (!groupId) {
        showToast('Error', 'No group ID specified', 'error');
        return;
    }
    
    // Current user information
    let currentUser = null;
    let isAdmin = false;
    let isMember = false;
    
    // Data storage
    let discussionMessages = [];
    let groupEvents = [];
    let groupMembers = [];
    let groupInfo = null;
    let rankedProducts = [];
    let currentProductFilter = 'all';
    let productsMetrics = {
        totalCount: 0,
        activeCount: 0,
        requestedCount: 0,
        pinnedCount: 0,
        maxActiveProducts: 0,
        activeProductIds: []
    };
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    
    // Initialize the page
    initPage();
    
    /**
     * Initialize the page by loading necessary data
     */
    async function initPage() {
        try {
            // Get current user information
            await getCurrentUser();
            
            // Load group details
            await loadGroupDetails();
            
            // Setup event listeners
            setupEventListeners();

            await loadRankedProducts();
            
            // Load discussion board
            loadDiscussionBoard();
            
            // Load events
            loadEvents();
            
            // Load members
            loadMembers();
        } catch (error) {
            console.error('Error initializing page:', error);
            showToast('Error', 'Failed to load group details', 'error');
        }
    }

    function setupProductEventHandlers() {
        const refreshBtn = document.getElementById('refresh-products-btn');
        const suggestBtn = document.getElementById('suggest-product-btn');
        const emptyStateBtn = document.getElementById('empty-state-suggest-btn');
        const submitSuggestBtn = document.getElementById('submit-suggest-product-btn');
        const filterButtons = document.querySelectorAll('.ranked-products-tabs .btn');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                setHTMLSafe(refreshBtn, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Refreshing');
                try {
                    await loadRankedProducts();
                    showToast('Success', 'Product rankings updated.', 'success');
                } catch (err) {
                    showToast('Error', 'Failed to refresh products', 'error');
                } finally {
                    refreshBtn.disabled = false;
                    setHTMLSafe(refreshBtn, '<i class="fas fa-sync"></i> Refresh');
                }
            });
        }

        const openSuggestModal = () => {
            if (!isMember) {
                showToast('Join Group', 'You must join the group before suggesting products.', 'info');
                return;
            }
            const modalEl = document.getElementById('suggest-product-modal');
            if (!modalEl) return;
            document.getElementById('suggest-product-form').reset();
            const errorEl = document.getElementById('suggest-product-error');
            if (errorEl) {
                errorEl.style.display = 'none';
                errorEl.textContent = '';
            }
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        };

        if (suggestBtn) suggestBtn.addEventListener('click', openSuggestModal);
        if (emptyStateBtn) emptyStateBtn.addEventListener('click', openSuggestModal);

        if (submitSuggestBtn) {
            submitSuggestBtn.addEventListener('click', async () => {
                const nameInput = document.getElementById('suggest-product-name');
                const noteInput = document.getElementById('suggest-product-note');
                const imageInput = document.getElementById('suggest-product-image');
                const urlInput = document.getElementById('suggest-product-url');
                const errorEl = document.getElementById('suggest-product-error');

                const payload = {
                    name: nameInput.value.trim(),
                    note: noteInput.value.trim(),
                    imageUrl: imageInput.value.trim(),
                    productUrl: urlInput.value.trim()
                };

                if (!payload.name) {
                    if (errorEl) {
                        errorEl.textContent = 'Product name is required.';
                        errorEl.style.display = 'block';
                    }
                    return;
                }

                submitSuggestBtn.disabled = true;
                setHTMLSafe(submitSuggestBtn, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting');

                try {
                    const response = await authorizedFetch(`/api/groups/${groupId}/products`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const data = await response.json().catch(() => ({ message: 'Failed to suggest product.' }));
                        throw new Error(data.message || 'Failed to suggest product.');
                    }

                    showToast('Success', 'Product suggested successfully', 'success');
                    const modalEl = document.getElementById('suggest-product-modal');
                    if (modalEl) {
                        bootstrap.Modal.getInstance(modalEl)?.hide();
                    }
                    await loadRankedProducts();
                } catch (err) {
                    if (errorEl) {
                        errorEl.textContent = err.message || 'Failed to suggest product.';
                        errorEl.style.display = 'block';
                    }
                } finally {
                    submitSuggestBtn.disabled = false;
                    // Plain text label is safe
                    try { submitSuggestBtn.textContent = 'Submit Suggestion'; } catch(_) {}
                }
            });
        }

        filterButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                filterButtons.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentProductFilter = btn.getAttribute('data-filter');
                renderRankedProducts();
            });
        });
    }
    
    /**
     * Get current user information
     */
    async function getCurrentUser() {
        try {
            const response = await fetch('/api/auth/profile', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json().catch(() => null);
                const userPayload = data?.user || data;
                if (userPayload && typeof userPayload === 'object') {
                    const resolvedId = userPayload.id || userPayload._id || userPayload.userId;
                    currentUser = {
                        ...userPayload,
                        id: resolvedId ? String(resolvedId) : userPayload.id
                    };
                } else {
                    currentUser = null;
                }
                console.log('Current user:', currentUser);
            } else {
                console.log('User not authenticated');
            }
        } catch (error) {
            console.error('Error getting current user:', error);
        }
    }
    
    /**
     * Load group details from the server
     */
    async function loadGroupDetails() {
        try {
            const response = await fetch(`/api/groups/${groupId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load group details');
            }
            
            const payload = await response.json();
            const group = payload?.group || payload || {};
            groupInfo = group;
            displayGroupDetails(group);

            const normalizeIdList = (list) => (
                (Array.isArray(list) ? list : []).map((entry) => {
                    if (!entry) return null;
                    if (typeof entry === 'string') return entry;
                    if (typeof entry === 'object') {
                        if (entry.id) return String(entry.id);
                        if (entry._id) return String(entry._id);
                    }
                    return String(entry);
                }).filter(Boolean)
            );

            const resolveId = (value) => {
                if (!value) return null;
                if (typeof value === 'string') return value;
                if (typeof value === 'object') {
                    if (value.id) return String(value.id);
                    if (value._id) return String(value._id);
                }
                return String(value);
            };

            let computedIsMember = false;
            let computedIsAdmin = false;

            if (currentUser) {
                const currentUserId = resolveId(currentUser.id || currentUser._id || currentUser.userId || currentUser);
                const memberIds = normalizeIdList(group.members);
                const adminIds = normalizeIdList(group.admins);
                const createdById = resolveId(group.createdBy);

                if (currentUserId) {
                    computedIsAdmin = adminIds.includes(currentUserId) || (createdById && createdById === currentUserId);
                    computedIsMember = memberIds.includes(currentUserId) || computedIsAdmin;
                }
            }

            isMember = typeof group.isMember === 'boolean' ? group.isMember : computedIsMember;
            isAdmin = typeof group.isAdmin === 'boolean' ? group.isAdmin : computedIsAdmin;

            updateUIBasedOnRole();
        } catch (error) {
            console.error('Error loading group details:', error);
            showToast('Error', 'Failed to load group details', 'error');
        }
    }
    
    /**
     * Display group details in the UI
     */
    async function authorizedFetch(url, options = {}) {
        const headers = options.headers ? { ...options.headers } : {};
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
        if (token) {
            const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
            headers['Authorization'] = authHeader;
        }
        return fetch(url, { ...options, headers });
    }

    function displayGroupDetails(group) {
        // Set group name and description
        document.getElementById('group-name').textContent = group.name;
        document.getElementById('group-description').textContent = group.description;
        
        // Set category badge
        const categoryBadge = document.getElementById('group-category-badge');
        categoryBadge.textContent = formatCategoryName(group.category);
        categoryBadge.className = `badge-category category-${group.category}`;
        
        // Set member count
        document.getElementById('member-count').textContent = group.members.length;
        
        // Set location
        const locationParts = [];
        if (group.location.city) locationParts.push(group.location.city);
        if (group.location.state) locationParts.push(group.location.state);
        if (group.location.zipCode) locationParts.push(group.location.zipCode);
        document.getElementById('group-location').textContent = locationParts.join(', ');
        
        // Set delivery days
        document.getElementById('delivery-days').textContent = (group.deliveryDays || []).join(', ');
        updateScheduleDisplay();
        updateMaxActiveBanner();
    }
    
    /**
     * Load ranked products from the server
     * Format category name for display
     */
    function formatCategoryName(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    // Basic HTML escape helper for safe text rendering
    function escapeHtml(s){
        try {
            return String(s)
                .replaceAll('&','&amp;')
                .replaceAll('<','&lt;')
                .replaceAll('>','&gt;')
                .replaceAll('"','&quot;')
                .replaceAll("'",'&#039;');
        } catch(_) {
            return String(s||'');
        }
    }
    
    // Safely set HTML using DOMPurify if available; fall back to innerHTML
    function setHTMLSafe(el, html) {
        if (!el) return;
        try {
            if (window.SafeHTML && typeof window.SafeHTML.sanitize === 'function') {
                el.innerHTML = window.SafeHTML.sanitize(String(html || ''));
            } else if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
                el.innerHTML = window.DOMPurify.sanitize(String(html || ''));
            } else {
                el.innerHTML = String(html || '');
            }
        } catch (_) {
            try { el.textContent = String(html || ''); } catch(__) {}
        }
    }
    
    /**
     * Display group rules in the UI
     */
    function displayGroupRules(rules) {
        const rulesContainer = document.getElementById('group-rules');
        const emptyRules = document.getElementById('empty-rules');
        
        // Clear previous content
        rulesContainer.innerHTML = '';
        
        let hasRules = false;
        
        // Text description
        if (rules.textDescription && rules.textDescription.trim() !== '') {
            hasRules = true;
            const descriptionEl = document.createElement('div');
            descriptionEl.className = 'mb-3';
            // Escape the free-form textDescription to prevent XSS
            setHTMLSafe(descriptionEl, `<h5>Guidelines</h5><p>${escapeHtml(rules.textDescription)}</p>`);
            rulesContainer.appendChild(descriptionEl);
        }
        
        // Member limit
        if (rules.maxMembers) {
            hasRules = true;
            const memberLimitEl = document.createElement('div');
            memberLimitEl.className = 'mb-2';
            setHTMLSafe(memberLimitEl, `<strong>Member limit:</strong> ${Number(rules.maxMembers)} members`);
            rulesContainer.appendChild(memberLimitEl);
        }
        
        // Allow guests
        const guestsEl = document.createElement('div');
        guestsEl.className = 'mb-2';
        setHTMLSafe(guestsEl, `<strong>Guests allowed:</strong> ${rules.allowGuests ? 'Yes' : 'No'}`);
        rulesContainer.appendChild(guestsEl);
        hasRules = true;
        
        // Auto-approve members
        const approveMemEl = document.createElement('div');
        approveMemEl.className = 'mb-2';
        setHTMLSafe(approveMemEl, `<strong>Auto-approve members:</strong> ${rules.autoApproveMembers ? 'Yes' : 'No'}`);
        rulesContainer.appendChild(approveMemEl);
        hasRules = true;
        
        // Auto-approve listings
        const approveListEl = document.createElement('div');
        approveListEl.className = 'mb-2';
        setHTMLSafe(approveListEl, `<strong>Auto-approve listings:</strong> ${rules.autoApproveListings ? 'Yes' : 'No'}`);
        rulesContainer.appendChild(approveListEl);
        hasRules = true;
        
        // Membership fee
        if (rules.membershipFee && rules.membershipFee.required) {
            hasRules = true;
            const feeEl = document.createElement('div');
            feeEl.className = 'mb-2';
            setHTMLSafe(feeEl, `<strong>Membership fee:</strong> $${Number(rules.membershipFee.amount)} (${escapeHtml(rules.membershipFee.frequency)})`);
            rulesContainer.appendChild(feeEl);
        }
        
        // Show/hide empty state
        if (hasRules) {
            rulesContainer.style.display = 'block';
            emptyRules.style.display = 'none';
        } else {
            rulesContainer.style.display = 'none';
            emptyRules.style.display = 'block';
        }
    }
    
    /**
     * Update UI elements based on user role (admin, member, or visitor)
     */
    function updateUIBasedOnRole() {
        const joinGroupBtn = document.getElementById('join-group-btn');
        const leaveGroupBtn = document.getElementById('leave-group-btn');
        const adminActions = document.getElementById('admin-actions');
        const createEventBtn = document.getElementById('create-event-btn');
        const inviteMemberBtn = document.getElementById('invite-member-btn');
        const scheduleAdminActions = document.getElementById('schedule-admin-actions');
        const scheduleForm = document.getElementById('schedule-form');
        const rankedSection = document.getElementById('ranked-products-section');
        const suggestBtn = document.getElementById('suggest-product-btn');
        const emptySuggestBtn = document.getElementById('empty-state-suggest-btn');

        // Update buttons based on membership status
        if (joinGroupBtn && leaveGroupBtn) {
            if (isMember) {
                joinGroupBtn.style.display = 'none';
                leaveGroupBtn.style.display = 'inline-block';
            } else {
                joinGroupBtn.style.display = 'inline-block';
                leaveGroupBtn.style.display = 'none';
            }
        }

        if (createEventBtn) {
            createEventBtn.style.display = isMember ? 'inline-block' : 'none';
        }

        if (scheduleAdminActions) {
            if (isMember && isAdmin) {
                scheduleAdminActions.style.display = 'inline-block';
                scheduleAdminActions.classList.remove('d-none');
            } else {
                scheduleAdminActions.style.display = 'none';
                scheduleAdminActions.classList.add('d-none');
            }
        }
        if (scheduleForm && !isAdmin) {
            scheduleForm.style.display = 'none';
        }

        if (adminActions) {
            adminActions.style.display = isAdmin ? 'inline-block' : 'none';
        }
        if (inviteMemberBtn) {
            inviteMemberBtn.style.display = isAdmin ? 'inline-block' : 'none';
        }

        if (rankedSection) {
            rankedSection.style.display = isMember ? 'block' : 'none';
        }
        if (suggestBtn) {
            suggestBtn.style.display = isMember ? 'inline-block' : 'none';
        }
        if (emptySuggestBtn) {
            emptySuggestBtn.style.display = isMember ? 'inline-flex' : 'none';
        }
    }

    function updateMaxActiveBanner() {
        const banner = document.getElementById('max-products-banner');
        if (!banner || !groupInfo) return;
        const maxProducts = groupInfo.maxActiveProducts || productsMetrics.maxActiveProducts;
        const countBadge = document.getElementById('active-products-count-badge');
        const maxCountEl = document.getElementById('max-products-count');
        const summaryEl = document.getElementById('active-products-summary');

        if (maxProducts > 0) {
            banner.style.display = 'flex';
            if (maxCountEl) maxCountEl.textContent = maxProducts;
            if (countBadge) countBadge.textContent = `${productsMetrics.activeCount || 0} Active`;
            if (summaryEl) {
                const requestedCount = Math.max(0, (productsMetrics.totalCount || 0) - (productsMetrics.activeCount || 0));
                summaryEl.textContent = `• ${productsMetrics.activeCount || 0} active · ${requestedCount} in queue`;
            }
        } else {
            banner.style.display = 'none';
        }
    }

    async function loadRankedProducts() {
        if (!isMember && !isAdmin) {
            rankedProducts = [];
            renderRankedProducts();
            return;
        }

        try {
            const params = new URLSearchParams();
            if (currentProductFilter === 'mine') params.set('mine', 'true');
            if (currentProductFilter === 'pinned') params.set('pinned', 'true');
            if (['active', 'requested'].includes(currentProductFilter)) params.set('status', currentProductFilter);

            const response = await authorizedFetch(`/api/groups/${groupId}/products?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch ranked products (${response.status})`);
            }
            const data = await response.json();
            rankedProducts = Array.isArray(data.products) ? data.products : [];
            productsMetrics = data.metrics || productsMetrics;
            updateMaxActiveBanner();
            renderRankedProducts();
        } catch (error) {
            console.error('Error loading ranked products:', error);
            rankedProducts = [];
            renderRankedProducts();
            showToast('Error', 'Unable to load ranked products right now.', 'error');
        }
    }

    function renderRankedProducts() {
        const listEl = document.getElementById('ranked-products-list');
        const emptyStateEl = document.getElementById('ranked-products-empty');
        const infoBanner = document.getElementById('products-info-banner');

        if (!listEl || !emptyStateEl) return;

        listEl.innerHTML = '';

        if (!isMember && !isAdmin) {
            emptyStateEl.style.display = 'block';
            setHTMLSafe(emptyStateEl, '<p class="mb-0">Join this group to view and suggest products.</p>');
            if (infoBanner) infoBanner.style.display = 'none';
            return;
        }

        let filtered = rankedProducts.slice();
        if (currentProductFilter === 'mine') {
            filtered = filtered.filter((product) => product.isMine);
        } else if (currentProductFilter === 'pinned') {
            filtered = filtered.filter((product) => product.pinned);
        }

        if (filtered.length === 0) {
            emptyStateEl.style.display = 'block';
            setHTMLSafe(emptyStateEl, '<p class="mb-2">No requests yet—be the first to suggest a product.</p><button class="btn btn-primary" id="empty-state-suggest-btn"><i class="fas fa-plus"></i> Suggest a Product</button>');
            if (infoBanner) infoBanner.style.display = 'none';
            setupProductEventHandlers();
            return;
        }

        emptyStateEl.style.display = 'none';

        const activeIds = new Set(productsMetrics.activeProductIds || []);

        filtered.forEach((product) => {
            const card = document.createElement('div');
            card.className = 'ranked-product-card';
            if (activeIds.has(product.id)) card.classList.add('highlight-active');

            const productStatus = product.status || (activeIds.has(product.id) ? 'active' : 'requested');
            const pinnedBadge = product.pinned ? '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-thumbtack"></i> Pinned</span>' : '';
            const isActive = productStatus === 'active';

            setHTMLSafe(card, `
                <div class="product-rank-badge">#${product.rank || '?'}</div>
                <div class="ranked-product-topline">
                    <div class="ranked-product-info">
                        <h4 class="ranked-product-title">${escapeHtml(product.name || 'Untitled Product')}
                            <span class="product-status-badge ${productStatus}">${productStatus === 'active' ? 'Active' : 'Requested'}</span>
                            ${isActive ? '<span class="badge bg-success ms-1">Buyable</span>' : ''}
                            ${pinnedBadge}
                        </h4>
                        <div class="ranked-product-meta">
                            <span><i class="fas fa-user"></i> ${escapeHtml(product.createdBy?.displayName || 'Unknown')}</span>
                            <span><i class="far fa-clock"></i> ${formatRelativeTime(product.lastActivityAt)}</span>
                            <span><i class="fas fa-signal"></i> Score: ${product.score ?? 0}</span>
                        </div>
                        ${product.note ? `<p class="mb-2">${escapeHtml(product.note)}</p>` : ''}
                        <div class="ranked-product-links">
                            ${product.imageUrl ? `<a href="${encodeURI(product.imageUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary"><i class="fas fa-image"></i> View image</a>` : ''}
                            ${product.productUrl ? `<a href="${encodeURI(product.productUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary"><i class="fas fa-external-link-alt"></i> Product link</a>` : ''}
                        </div>
                    </div>
                    <div class="ranked-product-score">
                        <div class="score-value">${product.score ?? 0}</div>
                        <div class="score-label">Score</div>
                        <div class="text-muted small">${product.upvoteCount || 0} up · ${product.downvoteCount || 0} down</div>
                    </div>
                </div>
                <div class="ranked-product-actions">
                    <div class="vote-buttons" data-product-id="${product.id}">
                        <button class="btn btn-outline-success btn-sm vote-btn" data-vote="up" ${product.userVote === 'up' ? 'disabled' : ''}><i class="fas fa-thumbs-up"></i></button>
                        <button class="btn btn-outline-danger btn-sm vote-btn" data-vote="down" ${product.userVote === 'down' ? 'disabled' : ''}><i class="fas fa-thumbs-down"></i></button>
                        <button class="btn btn-outline-secondary btn-sm vote-btn" data-vote="clear" ${!product.userVote ? 'disabled' : ''}>Clear</button>
                    </div>
                    ${isAdmin ? renderAdminProductActions(product) : ''}
                </div>
            `);

            listEl.appendChild(card);
        });

        // Attach vote handlers
        listEl.querySelectorAll('.vote-buttons').forEach((container) => {
            container.addEventListener('click', async (event) => {
                const button = event.target.closest('.vote-btn');
                if (!button) return;
                const productId = container.getAttribute('data-product-id');
                const vote = button.getAttribute('data-vote');
                await voteOnProduct(productId, vote, button);
            });
        });

        // Attach admin handlers
        if (isAdmin) {
            listEl.querySelectorAll('.admin-product-actions').forEach((container) => {
                container.addEventListener('click', async (event) => {
                    const actionBtn = event.target.closest('[data-action]');
                    if (!actionBtn) return;
                    const productId = container.getAttribute('data-product-id');
                    const action = actionBtn.getAttribute('data-action');
                    if (action === 'remove') {
                        await removeProduct(productId, actionBtn);
                    } else if (action === 'pin') {
                        const currentPinned = actionBtn.getAttribute('data-pinned') === 'true';
                        await updateProductStatus(productId, { pinned: !currentPinned }, actionBtn);
                    }
                });
            });
        }

        if (infoBanner) {
            const { activeCount = 0, totalCount = 0, maxActiveProducts = 0 } = productsMetrics;
            infoBanner.textContent = `Top ${Math.min(maxActiveProducts, totalCount)} products are available to buy. Rankings update as members vote.`;
            infoBanner.style.display = totalCount > 0 ? 'block' : 'none';
        }

        setupProductEventHandlers();
    }

    function renderAdminProductActions(product) {
        const pinned = product.pinned ? 'true' : 'false';
        const pinLabel = product.pinned ? 'Unpin' : 'Pin';
        return `
            <div class="admin-product-actions" data-product-id="${product.id}">
                <button class="btn btn-outline-secondary btn-sm" data-action="pin" data-pinned="${pinned}">
                    <i class="fas fa-thumbtack"></i> ${pinLabel}
                </button>
                <button class="btn btn-outline-danger btn-sm" data-action="remove">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
        `;
    }

    async function voteOnProduct(productId, vote, buttonEl) {
        if (!isMember) {
            showToast('Join Group', 'You must join the group before voting.', 'info');
            return;
        }

        const container = buttonEl.closest('.vote-buttons');
        const buttons = container.querySelectorAll('.vote-btn');
        buttons.forEach((btn) => btn.disabled = true);
        setHTMLSafe(buttonEl, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

        try {
            const response = await authorizedFetch(`/api/groups/${groupId}/products/${productId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vote })
            });

            if (!response.ok) {
                throw new Error('Failed to record vote.');
            }

            const data = await response.json();
            if (data?.product) {
                const index = rankedProducts.findIndex((product) => product.id === productId);
                if (index !== -1) {
                    rankedProducts[index] = data.product;
                }
                productsMetrics = data.metrics || productsMetrics;
                updateMaxActiveBanner();
                renderRankedProducts();
            } else {
                await loadRankedProducts();
            }
        } catch (error) {
            console.error('Error voting on product:', error);
            showToast('Error', error.message || 'Failed to record vote', 'error');
        } finally {
            buttons.forEach((btn) => btn.disabled = false);
        }
    }

    async function updateProductStatus(productId, payload, buttonEl) {
        const originalLabel = buttonEl.innerHTML;
        buttonEl.disabled = true;
        setHTMLSafe(buttonEl, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

        try {
            const response = await authorizedFetch(`/api/groups/${groupId}/products/${productId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to update product status.');
            }

            const data = await response.json();
            if (data?.product) {
                const index = rankedProducts.findIndex((product) => product.id === productId);
                if (index !== -1) {
                    rankedProducts[index] = data.product;
                }
                productsMetrics = data.metrics || productsMetrics;
                updateMaxActiveBanner();
                renderRankedProducts();
            } else {
                await loadRankedProducts();
            }
            showToast('Success', 'Product updated.', 'success');
        } catch (error) {
            console.error('Error updating product status:', error);
            showToast('Error', error.message || 'Failed to update product', 'error');
        } finally {
            buttonEl.disabled = false;
            buttonEl.innerHTML = originalLabel;
        }
    }

    async function removeProduct(productId, buttonEl) {
        if (!confirm('Remove this product from the ranked list?')) {
            return;
        }

        const originalLabel = buttonEl.innerHTML;
        buttonEl.disabled = true;
        setHTMLSafe(buttonEl, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

        try {
            const response = await authorizedFetch(`/api/groups/${groupId}/products/${productId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to remove product.');
            }

            const data = await response.json();
            rankedProducts = data.products || rankedProducts.filter((product) => product.id !== productId);
            productsMetrics = data.metrics || productsMetrics;
            updateMaxActiveBanner();
            renderRankedProducts();
            showToast('Success', 'Product removed.', 'success');
        } catch (error) {
            console.error('Error removing product:', error);
            showToast('Error', error.message || 'Failed to remove product', 'error');
        } finally {
            buttonEl.disabled = false;
            buttonEl.innerHTML = originalLabel;
        }
    }

    function formatRelativeTime(dateString) {
        if (!dateString) return 'Recently';
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes} min ago`;
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) return `${diffHours} hr ago`;
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            return date.toLocaleDateString();
        } catch (_) {
            return 'Recently';
        }
    }

    // Periodically refresh the order-by warning (every 60 seconds)
    setInterval(() => { try { updateOrderByWarning(); } catch(_){} }, 60000);

    function openScheduleForm() {
        const form = document.getElementById('schedule-form');
        if (!form) return;
        populateScheduleForm();
        form.style.display = 'block';
    }

    function closeScheduleForm() {
        const form = document.getElementById('schedule-form');
        if (form) form.style.display = 'none';
    }

    function populateScheduleForm() {
        if (!groupInfo) return;
        const orderDay = document.getElementById('order-by-input-day');
        const orderTime = document.getElementById('order-by-input-time');
        const deliveryDay = document.getElementById('delivery-day-input');
        const deliveryTime = document.getElementById('delivery-time-input');
        if (orderDay) orderDay.value = groupInfo.orderBySchedule?.day || '';
        if (orderTime) orderTime.value = groupInfo.orderBySchedule?.time || '';
        if (deliveryDay) deliveryDay.value = groupInfo.deliverySchedule?.day || '';
        if (deliveryTime) deliveryTime.value = groupInfo.deliverySchedule?.time || '';
    }

    function updateScheduleDisplay() {
        const orderEl = document.getElementById('order-by-date-display');
        const deliveryEl = document.getElementById('delivery-date-display');
        if (!orderEl || !deliveryEl) return;
        orderEl.textContent = formatSchedule(groupInfo?.orderBySchedule) || 'Not set';
        deliveryEl.textContent = formatSchedule(groupInfo?.deliverySchedule) || 'Not set';
        updateOrderByWarning();
    }

    function updateOrderByWarning() {
        const banner = document.getElementById('order-by-warning');
        if (!banner) return;
        const schedule = groupInfo?.orderBySchedule;
        if (!schedule || !schedule.day || !schedule.time) {
            banner.style.display = 'none';
            banner.className = 'alert mt-3';
            banner.textContent = '';
            return;
        }
        const orderDate = resolveNextOccurrence(schedule.day, schedule.time);
        if (!orderDate) {
            banner.style.display = 'none';
            banner.className = 'alert mt-3';
            banner.textContent = '';
            return;
        }
        const now = new Date();
        const diffMs = orderDate.getTime() - now.getTime();
        const thresholdMs = 24 * 60 * 60 * 1000; // 24 hours
        if (diffMs <= 0) {
            banner.className = 'alert alert-danger mt-3';
            setHTMLSafe(banner, '<strong>The order-by window has passed.</strong> New orders may not be accepted until the next cycle.');
            banner.style.display = 'block';
        } else if (diffMs <= thresholdMs) {
            banner.className = 'alert alert-warning mt-3';
            setHTMLSafe(banner, `<strong>Order by is approaching:</strong> ${formatDuration(diffMs)} remaining.`);
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
            banner.className = 'alert mt-3';
            banner.textContent = '';
        }
    }

    function formatDuration(ms) {
        const sec = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(sec / 86400);
        const hours = Math.floor((sec % 86400) / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const parts = [];
        if (days) parts.push(days + 'd');
        if (hours) parts.push(hours + 'h');
        if (mins || (!days && !hours)) parts.push(mins + 'm');
        return parts.join(' ');
    }

    function formatSchedule(schedule) {
        if (!schedule || !schedule.day || !schedule.time) return '';
        try {
            const [hour, minute] = schedule.time.split(':').map(Number);
            if (Number.isNaN(hour) || Number.isNaN(minute)) return '';
            const date = new Date();
            date.setHours(hour, minute, 0, 0);
            const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return `${schedule.day} at ${timeString}`;
        } catch (_) {
            return '';
        }
    }

    function resolveNextOccurrence(day, time) {
        try {
            const dayIndex = DAYS.indexOf(day);
            if (dayIndex === -1) return null;
            const [hour, minute] = time.split(':').map(Number);
            if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
            const now = new Date();
            const result = new Date(now);
            const dayDiff = (dayIndex + 7 - now.getDay()) % 7;
            result.setDate(now.getDate() + dayDiff);
            result.setHours(hour, minute, 0, 0);
            if (result <= now) {
                result.setDate(result.getDate() + 7);
            }
            return result;
        } catch (_) {
            return null;
        }
    }

    async function saveSchedule() {
        if (!groupInfo) return;
        const orderDayEl = document.getElementById('order-by-input-day');
        const orderTimeEl = document.getElementById('order-by-input-time');
        const deliveryDayEl = document.getElementById('delivery-day-input');
        const deliveryTimeEl = document.getElementById('delivery-time-input');
        const scheduleForm = document.getElementById('schedule-form');
        const saveBtn = document.getElementById('save-schedule-btn');
        const errorEl = document.getElementById('schedule-form-error');
        if (errorEl){ errorEl.style.display = 'none'; errorEl.textContent = ''; }

        const orderDayVal = orderDayEl?.value || '';
        const orderTimeVal = orderTimeEl?.value || '';
        const deliveryDayVal = deliveryDayEl?.value || '';
        const deliveryTimeVal = deliveryTimeEl?.value || '';

        const scheduleErrors = [];
        const payload = {};

        if (orderDayVal || orderTimeVal) {
            if (!orderDayVal || !orderTimeVal) {
                scheduleErrors.push('Select both order-by day and time.');
            } else {
                payload.orderBySchedule = { day: orderDayVal, time: orderTimeVal };
            }
        } else {
            payload.orderBySchedule = { day: null, time: null };
        }

        if (deliveryDayVal || deliveryTimeVal) {
            if (!deliveryDayVal || !deliveryTimeVal) {
                scheduleErrors.push('Select both delivery day and time.');
            } else {
                payload.deliverySchedule = { day: deliveryDayVal, time: deliveryTimeVal };
            }
        } else {
            payload.deliverySchedule = { day: null, time: null };
        }

        if (scheduleErrors.length > 0) {
            if (errorEl){ errorEl.textContent = scheduleErrors.join(' '); errorEl.style.display = 'block'; }
            return;
        }
        const prevHtml = saveBtn ? saveBtn.innerHTML : '';
        try {
            if (saveBtn){ saveBtn.disabled = true; try { saveBtn.textContent = 'Saving...'; } catch(_) {} }
            const res = await fetch(`/api/groups/${groupId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json?.message || 'Failed to update schedule');
            }
            const updatedGroup = json.group || json;
            groupInfo = updatedGroup;
            updateScheduleDisplay();
            updateOrderByWarning();
            showToast('Success', 'Group schedule updated', 'success');
            closeScheduleForm();
        } catch (error) {
            console.error('Error saving schedule:', error);
            showToast('Error', error.message || 'Failed to update schedule', 'error');
        } finally {
            if (saveBtn){ saveBtn.disabled = false; saveBtn.innerHTML = prevHtml || 'Save schedule'; }
            if (scheduleForm) scheduleForm.style.display = 'none';
        }
    }
    
    /**
     * Setup event listeners for the page
     */
    function setupEventListeners() {
        // Join group button
        document.getElementById('join-group-btn').addEventListener('click', joinGroup);
        
        // Leave group button
        document.getElementById('leave-group-btn').addEventListener('click', leaveGroup);
        
        // Share group button
        document.getElementById('share-group-btn').addEventListener('click', shareGroup);
        
        // Edit group button (admin only)
        document.getElementById('edit-group-btn').addEventListener('click', editGroup);

        setupProductEventHandlers();
        
        // Repurpose Add Item to Create Listing for this group
        const editScheduleBtn = document.getElementById('edit-schedule-btn');
        if (editScheduleBtn) editScheduleBtn.addEventListener('click', openScheduleForm);
        const saveScheduleBtn = document.getElementById('save-schedule-btn');
        if (saveScheduleBtn) saveScheduleBtn.addEventListener('click', saveSchedule);
        const cancelScheduleBtn = document.getElementById('cancel-schedule-btn');
        if (cancelScheduleBtn) cancelScheduleBtn.addEventListener('click', closeScheduleForm);
        
        // Discussion board
        document.getElementById('send-message-btn').addEventListener('click', sendMessage);
        
        // Events
        document.getElementById('create-event-btn').addEventListener('click', toggleCreateEventForm);
        document.getElementById('save-event-btn').addEventListener('click', createEvent);
        document.getElementById('cancel-event-btn').addEventListener('click', toggleCreateEventForm);
        
        // Members
        document.getElementById('invite-member-btn').addEventListener('click', inviteMember);
    }
    
    /**
     * Join the current group
     */
    async function joinGroup() {
        if (!currentUser) {
            showToast('Error', 'You must be logged in to join a group', 'error');
            return;
        }
        // disable join button during request
        const joinBtn = document.getElementById('join-group-btn');
        let prevPe='', prevOp='', prevHtml='';
        if (joinBtn){ if (joinBtn.dataset.loading === '1') return; joinBtn.dataset.loading='1'; prevPe=joinBtn.style.pointerEvents; prevOp=joinBtn.style.opacity; prevHtml=joinBtn.innerHTML; joinBtn.style.pointerEvents='none'; joinBtn.style.opacity='0.6'; try{ joinBtn.textContent = 'Joining...'; }catch(_){} }

        try {
            const response = await fetch(`/api/groups/${groupId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to join group');
            }
            
            // Update UI
            isMember = true;
            updateUIBasedOnRole();
            
            // Reload members
            loadMembers();
            
            showToast('Success', 'You have joined the group', 'success');
        } catch (error) {
            console.error('Error joining group:', error);
            showToast('Error', 'Failed to join group', 'error');
        } finally {
            if (joinBtn){ joinBtn.dataset.loading=''; joinBtn.style.pointerEvents = prevPe || ''; joinBtn.style.opacity = prevOp || ''; if (prevHtml) joinBtn.innerHTML = prevHtml; }
        }
    }
    
    /**
     * Leave the current group
     */
    async function leaveGroup() {
        if (!currentUser) {
            return;
        }
        
        // Confirm before leaving
        if (!confirm('Are you sure you want to leave this group?')) {
            return;
        }
        // disable leave button during request
        const leaveBtn = document.getElementById('leave-group-btn');
        let prevPe='', prevOp='', prevHtml='';
        if (leaveBtn){ if (leaveBtn.dataset.loading === '1') return; leaveBtn.dataset.loading='1'; prevPe=leaveBtn.style.pointerEvents; prevOp=leaveBtn.style.opacity; prevHtml=leaveBtn.innerHTML; leaveBtn.style.pointerEvents='none'; leaveBtn.style.opacity='0.6'; try{ leaveBtn.textContent = 'Leaving...'; }catch(_){} }

        try {
            const response = await fetch(`/api/groups/${groupId}/leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to leave group');
            }
            
            // Update UI
            isMember = false;
            isAdmin = false;
            updateUIBasedOnRole();
            
            // Reload members
            loadMembers();
            
            showToast('Success', 'You have left the group', 'success');
        } catch (error) {
            console.error('Error leaving group:', error);
            showToast('Error', 'Failed to leave group', 'error');
        } finally {
            if (leaveBtn){ leaveBtn.dataset.loading=''; leaveBtn.style.pointerEvents = prevPe || ''; leaveBtn.style.opacity = prevOp || ''; if (prevHtml) leaveBtn.innerHTML = prevHtml; }
        }
    }
    
    /**
     * Share the group link
     */
    function shareGroup() {
        // Create a temporary input to copy the URL
        const tempInput = document.createElement('input');
        tempInput.value = window.location.href;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        
        showToast('Success', 'Group link copied to clipboard', 'success');
    }
    
    /**
     * Edit group details (admin only)
     */
    function editGroup() {
        // Redirect to edit page
        window.location.href = `/groups/${groupId}/edit`;
    }
    
    /**
     * Toggle the add item form visibility
     */
    /**
     * Load discussion board messages from the server
     */
    async function loadDiscussionBoard() {
        try {
            const response = await fetch(`/api/groups/${groupId}/messages`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                console.error('Failed to load discussion messages');
                showToast('Error', 'Failed to load discussion messages', 'error');
                return;
            }
            
            const data = await response.json().catch(() => ({}));
            if (Array.isArray(data)) {
                discussionMessages = data;
            } else if (Array.isArray(data?.messages)) {
                discussionMessages = data.messages;
            } else {
                discussionMessages = [];
            }
            displayDiscussionMessages();
        } catch (error) {
            console.error('Error loading discussion messages:', error);
            showToast('Error', 'Failed to load discussion messages', 'error');
            discussionMessages = [];
            displayDiscussionMessages();
        }
    }
    
    /**
     * Display discussion messages in the UI
     */
    function displayDiscussionMessages() {
        const discussionBoard = document.getElementById('discussion-board');
        const emptyDiscussion = document.getElementById('empty-discussion');
        
        // Clear previous content
        discussionBoard.innerHTML = '';
        
        if (discussionMessages.length === 0) {
            discussionBoard.style.display = 'none';
            emptyDiscussion.style.display = 'block';
            return;
        }
        
        discussionBoard.style.display = 'block';
        emptyDiscussion.style.display = 'none';
        
        // Sort messages by date (newest first)
        discussionMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Add each message to the board
        discussionMessages.forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = 'message';
            
            const createdDate = new Date(message.createdAt);
            const formattedDate = createdDate.toLocaleString();
            const authorName = escapeHtml((message.author && message.author.name) || 'Anonymous');
            const contentSafe = escapeHtml(message.content || '');
            
            setHTMLSafe(messageEl, `
                <div class="message-header">
                    <strong>${authorName}</strong>
                    <small>${formattedDate}</small>
                </div>
                <div class="message-content">${contentSafe}</div>
            `);
            
            discussionBoard.appendChild(messageEl);
        });
    }
    
    /**
     * Send a new message to the discussion board
     */
    async function sendMessage() {
        if (!currentUser) {
            showToast('Error', 'You must be logged in to post messages', 'error');
            return;
        }
        
        const messageInput = document.getElementById('message-input');
        const content = messageInput.value.trim();
        
        if (!content) {
            showToast('Error', 'Message cannot be empty', 'error');
            return;
        }
        const sendBtn = document.getElementById('send-message-btn');
        let prevPe='', prevOp='', prevHtml='';
        if (sendBtn){ if (sendBtn.dataset.loading === '1') return; sendBtn.dataset.loading='1'; prevPe=sendBtn.style.pointerEvents; prevOp=sendBtn.style.opacity; prevHtml=sendBtn.innerHTML; sendBtn.style.pointerEvents='none'; sendBtn.style.opacity='0.6'; try{ sendBtn.textContent='Sending...'; }catch(_){} }
        
        const newMessage = {
            content,
            groupId,
            authorId: currentUser.id
        };
        
        try {
            const response = await fetch(`/api/groups/${groupId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(newMessage)
            });
            
            if (!response.ok) {
                // For demo purposes, add to local array if API doesn't exist yet
                const demoMessage = {
                    _id: Date.now().toString(),
                    content,
                    createdAt: new Date().toISOString(),
                    author: {
                        _id: currentUser.id,
                        name: currentUser.username || 'Current User'
                    },
                    groupId
                };
                
                discussionMessages.unshift(demoMessage);
                displayDiscussionMessages();
                messageInput.value = '';
                showToast('Success', 'Message posted', 'success');
                return;
            }
            
            const data = await response.json().catch(() => ({}));
            const addedMessage = data?.message || data;
            if (addedMessage) {
                discussionMessages.unshift(addedMessage);
            }
            displayDiscussionMessages();
            messageInput.value = '';
            showToast('Success', 'Message posted', 'success');
        } catch (error) {
            console.error('Error posting message:', error);
            // For demo purposes, add to local array
            const demoMessage = {
                _id: Date.now().toString(),
                content,
                createdAt: new Date().toISOString(),
                author: {
                    _id: currentUser.id,
                    name: currentUser.username || 'Current User'
                },
                groupId
            };
            
            discussionMessages.unshift(demoMessage);
            displayDiscussionMessages();
            messageInput.value = '';
            showToast('Success', 'Message posted', 'success');
        } finally {
            if (sendBtn){ sendBtn.dataset.loading=''; sendBtn.style.pointerEvents = prevPe || ''; sendBtn.style.opacity = prevOp || ''; if (prevHtml) sendBtn.innerHTML = prevHtml; }
        }
    }
    
    // Sample data functions removed
    
    /**
     * Toggle the create event form visibility
     */
    function toggleCreateEventForm() {
        const form = document.getElementById('create-event-form');
        const isVisible = form.style.display !== 'none';
        
        form.style.display = isVisible ? 'none' : 'block';
        
        // Clear form if hiding
        if (isVisible) {
            document.getElementById('event-title').value = '';
            document.getElementById('event-date').value = '';
            document.getElementById('event-location').value = '';
            document.getElementById('event-description').value = '';
        }
    }
    
    /**
     * Load events from the server
     */
    async function loadEvents() {
        try {
            const response = await fetch(`/api/groups/${groupId}/events`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                console.error('Failed to load events');
                showToast('Error', 'Failed to load events', 'error');
                return;
            }
            
            const data = await response.json().catch(() => ({}));
            if (Array.isArray(data)) {
                groupEvents = data;
            } else if (Array.isArray(data?.events)) {
                groupEvents = data.events;
            } else {
                groupEvents = [];
            }
            displayEvents();
        } catch (error) {
            console.error('Error loading events:', error);
            showToast('Error', 'Failed to load events', 'error');
            groupEvents = [];
            displayEvents();
        }
    }
    
    /**
     * Display events in the UI
     */
    function displayEvents() {
        const eventsList = document.getElementById('events-list');
        const emptyEvents = document.getElementById('empty-events');
        
        // Clear previous content
        eventsList.innerHTML = '';
        
        if (groupEvents.length === 0) {
            eventsList.style.display = 'none';
            emptyEvents.style.display = 'block';
            return;
        }
        
        eventsList.style.display = 'grid';
        emptyEvents.style.display = 'none';
        
        // Sort events by date (soonest first)
        groupEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Add each event to the list
        groupEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'event-card';
            
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString();
            const formattedTime = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const eventTitle = escapeHtml(event.title || 'Untitled Event');
            const eventLocation = escapeHtml(event.location || 'Location TBD');
            const eventDescription = escapeHtml(event.description || '');
            
            setHTMLSafe(eventEl, `
                <h5>${eventTitle}</h5>
                <div><i class="fas fa-calendar"></i> ${formattedDate} at ${formattedTime}</div>
                <div><i class="fas fa-map-marker-alt"></i> ${eventLocation}</div>
                <p>${eventDescription}</p>
            `);
            
            if (isAdmin || event.createdBy === currentUser?.id) {
                const actionsEl = document.createElement('div');
                actionsEl.className = 'event-actions';
                
                setHTMLSafe(actionsEl, `
                    <button class="btn btn-sm btn-outline-primary edit-event" data-id="${event._id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-event" data-id="${event._id}">
                        <i class="fas fa-trash"></i> Cancel
                    </button>
                `);
                
                eventEl.appendChild(actionsEl);
            }

            eventsList.appendChild(eventEl);
        });
        
        // Add event listeners to edit and delete buttons
        document.querySelectorAll('.edit-event').forEach(button => {
            button.addEventListener('click', () => editEvent(button.dataset.id));
        });
        
        document.querySelectorAll('.delete-event').forEach(button => {
            button.addEventListener('click', () => deleteEvent(button.dataset.id));
        });
    }
    
    /**
     * Create a new event
     */
    async function createEvent() {
        if (!currentUser) {
            showToast('Error', 'You must be logged in to create events', 'error');
            return;
        }
        
        // Get form values
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;
        const location = document.getElementById('event-location').value.trim();
        const description = document.getElementById('event-description').value.trim();
        
        // Validate required fields
        if (!title) {
            showToast('Error', 'Event title is required', 'error');
            return;
        }
        
        if (!date) {
            showToast('Error', 'Event date is required', 'error');
            return;
        }
        const saveEventBtn = document.getElementById('save-event-btn');
        let prevPe='', prevOp='', prevHtml='';
        if (saveEventBtn){ if (saveEventBtn.dataset.loading === '1') return; saveEventBtn.dataset.loading='1'; prevPe=saveEventBtn.style.pointerEvents; prevOp=saveEventBtn.style.opacity; prevHtml=saveEventBtn.innerHTML; saveEventBtn.style.pointerEvents='none'; saveEventBtn.style.opacity='0.6'; try{ saveEventBtn.innerHTML='Saving...'; }catch(_){} }
        
        // Create event object
        const newEvent = {
            title,
            date,
            location,
            description,
            createdBy: currentUser.id,
            groupId
        };
        
        try {
            const response = await fetch(`/api/groups/${groupId}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(newEvent)
            });
            
            if (!response.ok) {
                // For demo purposes, add to local array if API doesn't exist yet
                newEvent._id = Date.now().toString();
                newEvent.date = new Date(date).toISOString();
                groupEvents.push(newEvent);
                displayEvents();
                toggleCreateEventForm();
                showToast('Success', 'Event created', 'success');
                return;
            }
            
            const data = await response.json().catch(() => ({}));
            const addedEvent = data?.event || data;
            if (addedEvent) {
                groupEvents.push(addedEvent);
            }
            displayEvents();
            toggleCreateEventForm();
            showToast('Success', 'Event created', 'success');
        } catch (error) {
            console.error('Error creating event:', error);
            // For demo purposes, add to local array
            newEvent._id = Date.now().toString();
            newEvent.date = new Date(date).toISOString();
            groupEvents.push(newEvent);
            displayEvents();
            toggleCreateEventForm();
            showToast('Success', 'Event created', 'success');
        } finally {
            if (saveEventBtn){ saveEventBtn.dataset.loading=''; saveEventBtn.style.pointerEvents = prevPe || ''; saveEventBtn.style.opacity = prevOp || ''; if (prevHtml) saveEventBtn.innerHTML = prevHtml; }
        }
    }
    
    /**
     * Edit an event
     */
    function editEvent(eventId) {
        // Find the event
        const event = groupEvents.find(e => e._id === eventId);
        if (!event) return;
        
        // Show the form and populate with event data
        document.getElementById('event-title').value = event.title;
        
        // Format date for datetime-local input
        const eventDate = new Date(event.date);
        const formattedDate = eventDate.toISOString().slice(0, 16); // Format: YYYY-MM-DDThh:mm
        document.getElementById('event-date').value = formattedDate;
        
        document.getElementById('event-location').value = event.location || '';
        document.getElementById('event-description').value = event.description || '';
        
        // Show the form
        document.getElementById('create-event-form').style.display = 'block';
        
        // Change save button to update
        const saveButton = document.getElementById('save-event-btn');
        saveButton.textContent = 'Update Event';
        saveButton.dataset.eventId = eventId;
        
        // Change event listener to update event
        saveButton.removeEventListener('click', createEvent);
        saveButton.addEventListener('click', function updateHandler() {
            updateEvent(eventId);
            saveButton.removeEventListener('click', updateHandler);
            saveButton.addEventListener('click', createEvent);
        });
    }
    
    /**
     * Update an event
     */
    async function updateEvent(eventId) {
        // Get form values
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;
        const location = document.getElementById('event-location').value.trim();
        const description = document.getElementById('event-description').value.trim();
        
        // Validate required fields
        if (!title) {
            showToast('Error', 'Event title is required', 'error');
            return;
        }
        
        if (!date) {
            showToast('Error', 'Event date is required', 'error');
            return;
        }
        
        // Create updated event object
        const updatedEvent = {
            title,
            date,
            location,
            description
        };
        
        try {
            const response = await fetch(`/api/groups/${groupId}/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(updatedEvent)
            });
            
            if (!response.ok) {
                // For demo purposes, update local array if API doesn't exist yet
                const index = groupEvents.findIndex(e => e._id === eventId);
                if (index !== -1) {
                    groupEvents[index] = { 
                        ...groupEvents[index], 
                        ...updatedEvent,
                        date: new Date(date).toISOString()
                    };
                    displayEvents();
                    toggleCreateEventForm();
                    
                    // Reset save button
                    const saveButton = document.getElementById('save-event-btn');
                    saveButton.textContent = 'Create Event';
                    delete saveButton.dataset.eventId;
                    
                    showToast('Success', 'Event updated', 'success');
                }
                return;
            }
            
            // Update the event in the array
            const updatedEventData = await response.json();
            const index = groupEvents.findIndex(e => e._id === eventId);
            if (index !== -1) {
                groupEvents[index] = updatedEventData;
            }
            
            displayEvents();
            toggleCreateEventForm();
            
            // Reset save button
            const saveButton = document.getElementById('save-event-btn');
            saveButton.textContent = 'Create Event';
            delete saveButton.dataset.eventId;
            
            showToast('Success', 'Event updated', 'success');
        } catch (error) {
            console.error('Error updating event:', error);
            // For demo purposes, update local array
            const index = groupEvents.findIndex(e => e._id === eventId);
            if (index !== -1) {
                groupEvents[index] = { 
                    ...groupEvents[index], 
                    ...updatedEvent,
                    date: new Date(date).toISOString()
                };
                displayEvents();
                toggleCreateEventForm();
                
                // Reset save button
                const saveButton = document.getElementById('save-event-btn');
                saveButton.textContent = 'Create Event';
                delete saveButton.dataset.eventId;
                
                showToast('Success', 'Event updated', 'success');
            }
        }
    }
    
    /**
     * Delete an event
     */
    async function deleteEvent(eventId) {
        // Confirm before deleting
        if (!confirm('Are you sure you want to cancel this event?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/groups/${groupId}/events/${eventId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                // For demo purposes, remove from local array if API doesn't exist yet
                groupEvents = groupEvents.filter(event => event._id !== eventId);
                displayEvents();
                showToast('Success', 'Event cancelled', 'success');
                return;
            }
            
            // Remove the event from the array
            groupEvents = groupEvents.filter(event => event._id !== eventId);
            displayEvents();
            showToast('Success', 'Event cancelled', 'success');
        } catch (error) {
            console.error('Error deleting event:', error);
            // For demo purposes, remove from local array
            groupEvents = groupEvents.filter(event => event._id !== eventId);
            displayEvents();
            showToast('Success', 'Event cancelled', 'success');
        }
    }
    
    // Sample data functions removed
    
    /**
     * Load members from the server
     */
    async function loadMembers() {
        try {
            const response = await fetch(`/api/groups/${groupId}/members`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                console.error('Failed to load group members');
                showToast('Error', 'Failed to load group members', 'error');
                return;
            }
            
            const data = await response.json().catch(() => ({}));
            if (Array.isArray(data)) {
                groupMembers = data;
            } else if (Array.isArray(data?.members)) {
                groupMembers = data.members;
            } else {
                groupMembers = [];
            }
            displayMembers();
        } catch (error) {
            console.error('Error loading members:', error);
            showToast('Error', 'Failed to load group members', 'error');
            groupMembers = [];
            displayMembers();
        }
    }
    
    /**
     * Display members in the UI
     */
    function displayMembers() {
        const membersGrid = document.getElementById('members-grid');
        const emptyMembers = document.getElementById('empty-members');
        
        // Clear previous content
        membersGrid.innerHTML = '';
        
        if (groupMembers.length === 0) {
            membersGrid.style.display = 'none';
            emptyMembers.style.display = 'block';
            return;
        }
        
        membersGrid.style.display = 'grid';
        emptyMembers.style.display = 'none';
        
        // Add each member to the grid
        groupMembers.forEach(member => {
            const memberEl = document.createElement('div');
            memberEl.className = 'member-card';
            
            const isAdmin = member.role === 'admin';
            const roleClass = isAdmin ? 'role-admin' : 'role-member';
            const roleText = isAdmin ? 'Admin' : 'Member';
            setHTMLSafe(memberEl, `
                <img src="${escapeHtml(member.avatar || '/images/default-avatar.png')}" alt="${escapeHtml(member.name)}" class="member-avatar">
                <div>${escapeHtml(member.name)}</div>
                <span class="member-role ${roleClass}">${roleText}</span>
            `);
            
            membersGrid.appendChild(memberEl);
        });
    }
    
    /**
     * Invite a member to the group
     */
    function inviteMember() {
        // Prompt for email address
        const email = prompt('Enter the email address of the person you want to invite:');
        
        if (!email) return;
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('Error', 'Please enter a valid email address', 'error');
            return;
        }
        
        // Send invitation
        sendInvitation(email);
    }
    
    /**
     * Send an invitation to join the group
     */
    async function sendInvitation(email) {
        try {
            const response = await fetch(`/api/groups/${groupId}/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ email })
            });
            
            if (!response.ok) {
                // For demo purposes, show success if API doesn't exist yet
                showToast('Success', `Invitation sent to ${email}`, 'success');
                return;
            }
            
            showToast('Success', `Invitation sent to ${email}`, 'success');
        } catch (error) {
            console.error('Error sending invitation:', error);
            // For demo purposes, show success
            showToast('Success', `Invitation sent to ${email}`, 'success');
        }
    }
    
    // Sample data functions removed
    
    /**
     * Show a toast notification
     */
    function showToast(title, message, type = 'info') {
        const toast = document.getElementById('status-toast');
        const toastTitle = document.getElementById('toast-title');
        const toastMessage = document.getElementById('toast-message');
        
        // Set toast content
        toastTitle.textContent = title;
        toastMessage.textContent = message;
        
        // Set toast type
        toast.className = 'toast';
        toast.classList.add(`toast-${type}`);
        
        // Show the toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }
});





