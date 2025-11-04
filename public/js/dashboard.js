/**
 * FreshShare Dashboard JavaScript
 * Manages dashboard data fetching and UI updates
 */

// Safe HTML helpers available to all functions in this module
function setHTMLSafe(el, html) {
  try {
    if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
    el.innerHTML = String(html||'');
  } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
}
function escapeHtml(s) {
  try { return (window.SafeHTML && window.SafeHTML.escape) ? window.SafeHTML.escape(String(s||'')) : String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); }
}

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is authenticated
  const token = localStorage.getItem('token') || getCookie('token');
  if (!token) {
    console.error('No authentication token found');
    window.location.href = '/login?redirect=/dashboard';
    return;
  }

  // Initialize dashboard
  initDashboard();

  // Set up calendar navigation
  initCalendarNavigation();
});

/**
 * Initialize the dashboard and fetch data
 */
async function initDashboard() {
  try {
    showLoadingState(true);
    const dashboardData = await fetchDashboardData();
    
    if (!dashboardData.success) {
      showError('Failed to load dashboard data');
      return;
    }
    
    // Update dashboard sections with real data
    updateOrdersSection(dashboardData.data.recentOrders);
    updateDeliveriesSection(dashboardData.data.upcomingDeliveries);
    updateEventsSection(dashboardData.data.events);
    updateMessagesSection(dashboardData.data.messages);
    
    // Load calendar data for current month
    const today = new Date();
    loadCalendarEvents(today.getMonth(), today.getFullYear());
    // Load active piece orders
    await loadActivePieceOrders();
    
    showLoadingState(false);
  } catch (error) {
    console.error('Dashboard initialization error:', error);
    showError('Error loading dashboard: ' + error.message);
    showLoadingState(false);
  }
}

/**
 * Fetch dashboard data from the API
 * @returns {Promise<Object>} Dashboard data
 */
async function fetchDashboardData() {
  try {
    const token = localStorage.getItem('token') || getCookie('token');
    
    const response = await fetch('/api/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Handle unauthorized access
        window.location.href = '/login?redirect=/dashboard';
        return { success: false };
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return { 
      success: false,
      message: error.message
    };
  }
}

/**
 * Load calendar events for a specific month
 * @param {number} month - Month (0-11)
 * @param {number} year - Year (e.g., 2025)
 */
async function loadCalendarEvents(month, year) {
  try {
    const token = localStorage.getItem('token') || getCookie('token');
    
    const response = await fetch(`/api/dashboard/calendar?month=${month}&year=${year}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.success) {
      updateCalendar(month, year, result.data.events);
    } else {
      console.error('Failed to load calendar events:', result.message);
    }
  } catch (error) {
    console.error('Error loading calendar events:', error);
  }
}

/**
 * Update the calendar UI with events
 * @param {number} month - Month (0-11) 
 * @param {number} year - Year (e.g., 2025)
 * @param {Array} events - Calendar events
 */
function updateCalendar(month, year, events) {
  // Update calendar title
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const calendarTitle = document.querySelector('.calendar-title');
  if (calendarTitle) {
    calendarTitle.textContent = `${months[month]} ${year}`;
  }
  
  // Clear existing event markers
  const calendarDays = document.querySelectorAll('.calendar-day');
  calendarDays.forEach(day => {
    day.classList.remove('has-delivery', 'has-event');
    day.removeAttribute('data-event-count');
    day.classList.remove('today');
  });
  
  // Group events by day
  const eventsByDay = {};
  events.forEach(event => {
    const eventDate = new Date(event.date);
    const dayOfMonth = eventDate.getDate();
    
    if (!eventsByDay[dayOfMonth]) {
      eventsByDay[dayOfMonth] = [];
    }
    eventsByDay[dayOfMonth].push(event);
  });
  
  // Mark calendar days with events
  for (const [day, dayEvents] of Object.entries(eventsByDay)) {
    const dayCell = findDayCell(parseInt(day));
    if (dayCell) {
      if (dayEvents.some(e => e.type === 'delivery')) {
        dayCell.classList.add('has-delivery');
      } else {
        dayCell.classList.add('has-event');
      }
      
      if (dayEvents.length > 1) {
        dayCell.setAttribute('data-event-count', dayEvents.length);
      }
    }
  }
  
  // Update today's schedule in the events panel
  const today = new Date();
  if (month === today.getMonth() && year === today.getFullYear()) {
    const dayOfMonth = today.getDate();
    const todaysEvents = eventsByDay[dayOfMonth] || [];
    updateTodaysSchedule(todaysEvents);
    // Highlight today's cell for better contrast
    const todayCell = findDayCell(dayOfMonth);
    if (todayCell) todayCell.classList.add('today');
  }
}

/**
 * Find the calendar cell for a specific day
 * @param {number} day - Day of month
 * @returns {HTMLElement} Calendar day cell
 */
function findDayCell(day) {
  const cells = document.querySelectorAll('.calendar-day:not(.other-month)');
  for (const cell of cells) {
    if (parseInt(cell.textContent.trim()) === day) {
      return cell;
    }
  }
  return null;
}

/**
 * Update today's schedule in the events panel
 * @param {Array} events - Today's events
 */
function updateTodaysSchedule(events) {
  const eventsContainer = document.querySelector('.upcoming-events');
  if (!eventsContainer) return;
  
  // Clear existing events
  const eventsList = eventsContainer.querySelector('.events-list');
  if (!eventsList) return;
  eventsList.innerHTML = '';
  
  if (events.length === 0) {
    setHTMLSafe(eventsList, '<div class="no-events">No events scheduled for today</div>');
    return;
  }
  
  // Sort events by time
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Add events to the list
  events.forEach(event => {
    const eventDate = new Date(event.date);
    const timeString = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    setHTMLSafe(eventItem, `
      <span class="event-date">${escapeHtml(timeString)}</span>
      <div class="event-title">${escapeHtml(event.title)}</div>
      <div class="event-desc">${escapeHtml(event.description || event.location || '')}</div>
    `);
    
    eventsList.appendChild(eventItem);
  });
}

/**
 * Update the orders section with actual data
 * @param {Array} orders - Recent orders data
 */
function updateOrdersSection(orders) {
  const orderList = document.querySelector('.order-list');
  if (!orderList) return;
  
  orderList.innerHTML = '';
  
  if (!orders || orders.length === 0) {
    setHTMLSafe(orderList, '<li class="no-data">No recent orders found</li>');
    return;
  }
  
  orders.forEach(order => {
    const orderDate = new Date(order.date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    const orderItem = document.createElement('li');
    orderItem.className = 'order-item';
    setHTMLSafe(orderItem, `
      <div class="order-header">
        <span class="order-id">Order #${escapeHtml(order.orderNumber)}</span>
        <span class="order-date">${escapeHtml(orderDate)}</span>
      </div>
      <div class="order-items">
        ${escapeHtml(order.groupName)} (${Number(order.items)||0} items)
      </div>
      <div class="order-footer">
        <span class="order-total">$${Number(order.total||0).toFixed(2)}</span>
        <div class="order-actions">
          <button class="btn btn-outline" onclick="viewOrderDetails('${escapeHtml(order.id)}')">View Details</button>
          <button class="btn btn-primary" onclick="reorderOrder('${escapeHtml(order.id)}', this)">Reorder</button>
        </div>
      </div>
    `);
    
    orderList.appendChild(orderItem);
  });
}

/**
 * Update the upcoming deliveries section
 * @param {Array} deliveries - Upcoming deliveries data
 */
function updateDeliveriesSection(deliveries) {
  const deliveryList = document.querySelector('#upcoming-deliveries');
  if (!deliveryList) return;
  
  deliveryList.innerHTML = '';
  
  if (!deliveries || deliveries.length === 0) {
    setHTMLSafe(deliveryList, '<li class="no-data">No upcoming deliveries</li>');
    return;
  }
  
  deliveries.forEach(delivery => {
    const deliveryDate = new Date(delivery.date);
    const isToday = isDateToday(deliveryDate);
    const isTomorrow = isDateTomorrow(deliveryDate);
    
    let dateDisplay = deliveryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    if (isToday) dateDisplay = 'Today';
    if (isTomorrow) dateDisplay = 'Tomorrow';
    
    const deliveryItem = document.createElement('li');
    deliveryItem.className = 'delivery-item';
    setHTMLSafe(deliveryItem, `
      <div>
        <span>${escapeHtml(delivery.groupName)}</span>
        <span>${escapeHtml(dateDisplay)}</span>
      </div>
      <div>
        Order #${escapeHtml(delivery.orderNumber)}
      </div>
      <div>
        <span>${escapeHtml(delivery.status)}</span>
        <span>$${Number(delivery.total||0).toFixed(2)}</span>
      </div>
    `);
    
    deliveryList.appendChild(deliveryItem);
  });
}

/**
 * Update the messages section
 * @param {Array} messages - Messages data
 */
function updateMessagesSection(messages) {
  const messageList = document.querySelector('.message-list');
  if (!messageList) return;
  
  messageList.innerHTML = '';
  
  if (!messages || messages.length === 0) {
    setHTMLSafe(messageList, '<li class="no-data">No messages</li>');
    return;
  }
  
  messages.forEach(message => {
    const messageTime = getRelativeTimeString(new Date(message.timestamp));
    
    const messageItem = document.createElement('li');
    messageItem.className = 'message-item';
    if (!message.read) messageItem.classList.add('unread');
    
    const contentPreview = String(message.content||'');
    setHTMLSafe(messageItem, `
      <div>
        <div>
          <i class="fas fa-user"></i>
        </div>
        <div>
          <div>${escapeHtml(message.sender && message.sender.username)}</div>
          <div>${escapeHtml(contentPreview.substring(0, 50))}${contentPreview.length > 50 ? '...' : ''}</div>
        </div>
      </div>
      <div>
        ${escapeHtml(messageTime)}
      </div>
    `);
    
    messageList.appendChild(messageItem);
  });
}

/**
 * Update events section
 * @param {Array} events - Events data
 */
function updateEventsSection(events) {
  // This could update a dedicated events section if present in the UI
  console.log('Events data loaded:', events);
}

/**
 * Initialize calendar navigation
 */
function initCalendarNavigation() {
  const prevMonthBtn = document.querySelector('.calendar-nav-btn:first-child');
  const nextMonthBtn = document.querySelector('.calendar-nav-btn:last-child');
  
  if (!prevMonthBtn || !nextMonthBtn) return;
  
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  
  prevMonthBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    loadCalendarEvents(currentMonth, currentYear);
  });
  
  nextMonthBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    loadCalendarEvents(currentMonth, currentYear);
  });
}

/**
 * View order details
 * @param {string} orderId - Order ID
 */
function viewOrderDetails(orderId) {
  window.location.href = `/orders/${orderId}`;
}

/**
 * Recreate per-piece reservations from a past order
 * @param {string} orderId
 * @param {HTMLElement} btn
 */
async function reorderOrder(orderId, btn){
  try {
    if (btn) { btn.disabled = true; }
    const token = localStorage.getItem('token') || getCookie('token');
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success){
      throw new Error((json && json.message) || `HTTP ${res.status}`);
    }
    try { if (typeof showToast === 'function') showToast('Items re-added from your past order.'); } catch(_) {}
    // Refresh active piece orders section
    try { await loadActivePieceOrders(); } catch(_) {}
    // If global cart panel exists, refresh it too
    try {
      const refresh = document.getElementById('myCartRefresh');
      if (refresh) refresh.click();
    } catch(_) {}
  } catch (e) {
    console.warn('Reorder failed:', e);
    try { if (typeof showToast === 'function') showToast(e.message || 'Reorder failed'); } catch(_) {}
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// ================= Active Piece Orders =================
async function fetchActivePieceOrders() {
  try {
    const token = localStorage.getItem('token') || getCookie('token');
    const res = await fetch('/api/marketplace/pieces/my', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      if (res.status === 401) return { success: false, data: [] };
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.warn('Failed to fetch active piece orders:', e);
    return { success: false, data: [] };
  }
}

function renderActivePieceOrders(items) {
  const ul = document.getElementById('active-piece-orders');
  if (!ul) return;
  ul.innerHTML = '';
  if (!items || items.length === 0) {
    setHTMLSafe(ul, '<li class="no-data">No active piece orders</li>');
    return;
  }
  items.forEach(it => {
    const li = document.createElement('li');
    li.className = 'delivery-item';
    const rawImg = String(it.image || '');
    const isAbs = /^https?:\/\//i.test(rawImg);
    const imgSrc = rawImg
      ? (isAbs ? rawImg : ('/' + rawImg.replace(/^public\//, '').replace(/^\//, '')))
      : '/uploads/marketplace/default-product.jpg';
    const left = Number(it.currentCaseRemaining || 0);
    const yours = Number(it.userPieces || 0);
    setHTMLSafe(li, `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(it.title)}" style="width:40px;height:40px;border-radius:4px;object-fit:cover;">
        <div>
          <div><strong>${escapeHtml(it.title)}</strong></div>
          <div class="text-muted small">Your pieces: ${Number(yours)} • Filling – ${Number(left)} left</div>
        </div>
      </div>
      <div>
        <a class="btn btn-outline" href="/listings/${escapeHtml(String(it.listingId))}">Adjust</a>
      </div>
    `);
    ul.appendChild(li);
  });
}

async function loadActivePieceOrders() {
  const data = await fetchActivePieceOrders();
  if (data && data.success) renderActivePieceOrders(data.data);
  const refresh = document.getElementById('refresh-piece-orders');
  if (refresh && !refresh.__wired) {
    refresh.addEventListener('click', async (e) => { e.preventDefault(); await loadActivePieceOrders(); });
    refresh.__wired = true;
  }
}

/**
 * Helper to check if a date is today
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is today
 */
function isDateToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

/**
 * Helper to check if a date is tomorrow
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is tomorrow
 */
function isDateTomorrow(date) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.getDate() === tomorrow.getDate() &&
         date.getMonth() === tomorrow.getMonth() &&
         date.getFullYear() === tomorrow.getFullYear();
}

/**
 * Get a relative time string
 * @param {Date} date - Date to format
 * @returns {string} Relative time string
 */
function getRelativeTimeString(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Show loading state on the dashboard
 * @param {boolean} isLoading - Whether the dashboard is loading
 */
function showLoadingState(isLoading) {
  const dashboard = document.querySelector('.dashboard-grid');
  
  if (isLoading) {
    if (dashboard) {
      dashboard.classList.add('loading');
    }
    // Could add a loading spinner here
  } else {
    if (dashboard) {
      dashboard.classList.remove('loading');
    }
  }
}

/**
 * Show an error message on the dashboard
 * @param {string} message - Error message
 */
function showError(message) {
  // Create an error alert if it doesn't exist
  let errorAlert = document.querySelector('.dashboard-error');
  
  if (!errorAlert) {
    errorAlert = document.createElement('div');
    errorAlert.className = 'dashboard-error alert alert-danger';
    
    const dashboardContainer = document.querySelector('.main-container');
    if (dashboardContainer) {
      dashboardContainer.prepend(errorAlert);
    }
  }
  
  errorAlert.textContent = message;
  errorAlert.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorAlert.style.display = 'none';
  }, 5000);
}

/**
 * Get cookie value by name
 * @param {string} name - Cookie name
 * @returns {string} Cookie value
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
