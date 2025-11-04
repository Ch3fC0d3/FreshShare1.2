/**
 * FreshShare Header Component
 * This file contains functionality for the FreshShare header including:
 * - Mobile menu toggle
 * - User dropdown menu
 * - Scroll behavior
 */

class FreshShareHeader {
  constructor() {
    // DOM Elements
    this.header = document.querySelector('.fs-header');
    this.mobileToggle = document.querySelector('#fs-mobile-toggle');
    this.nav = document.querySelector('#fs-nav');
    this.navLinks = document.querySelectorAll('.fs-nav-link');
    this.userProfile = document.querySelector('#fs-user-profile');
    this.dropdown = document.querySelector('#fs-user-dropdown');
    this.bars = document.querySelectorAll('.fs-bar');
    this.logoutBtn = document.querySelector('#fs-logout-btn');
    
    // Initialize
    this.init();
  }
  
  init() {
    // Add event listeners
    this.addEventListeners();
    this.setActiveNavLink();
  }
  
  addEventListeners() {
    // Mobile menu toggle
    if (this.mobileToggle) {
      this.mobileToggle.addEventListener('click', () => this.toggleMobileMenu());
    }
    
    // User profile dropdown
    if (this.userProfile) {
      this.userProfile.addEventListener('click', (e) => this.toggleDropdown(e));
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => this.handleOutsideClick(e));
    
    // Scroll event for header shadow
    window.addEventListener('scroll', () => this.handleScroll());
    
    // Add click event to nav links on mobile
    this.navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          this.closeMobileMenu();
        }
      });
    });
    
    // Logout handling
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', (e) => {
        // Optional: Add confirmation dialog
        if (confirm('Are you sure you want to log out?')) {
          // Allow default behavior to navigate to logout route
          return true;
        } else {
          e.preventDefault();
          return false;
        }
      });
    }
  }
  
  toggleMobileMenu() {
    this.nav.classList.toggle('active');
    this.toggleBars();
    document.body.classList.toggle('fs-no-scroll');
  }
  
  closeMobileMenu() {
    this.nav.classList.remove('active');
    this.resetBars();
    document.body.classList.remove('fs-no-scroll');
  }
  
  toggleBars() {
    if (this.bars.length >= 3) {
      this.bars[0].classList.toggle('fs-rotated-up');
      this.bars[1].classList.toggle('fs-hidden');
      this.bars[2].classList.toggle('fs-rotated-down');
    }
  }
  
  resetBars() {
    if (this.bars.length >= 3) {
      this.bars[0].classList.remove('fs-rotated-up');
      this.bars[1].classList.remove('fs-hidden');
      this.bars[2].classList.remove('fs-rotated-down');
    }
  }
  
  toggleDropdown(e) {
    e.stopPropagation();
    if (this.dropdown) {
      this.dropdown.classList.toggle('active');
    }
  }
  
  handleOutsideClick(e) {
    if (this.dropdown && this.userProfile && 
        !this.userProfile.contains(e.target) && 
        this.dropdown.classList.contains('active')) {
      this.dropdown.classList.remove('active');
    }
  }
  
  handleScroll() {
    if (window.scrollY > 10) {
      this.header.classList.add('fs-header-scrolled');
    } else {
      this.header.classList.remove('fs-header-scrolled');
    }
  }
  
  setActiveNavLink() {
    const currentPath = window.location.pathname;
    
    this.navLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.remove('active');
      
      if (href === currentPath || 
          (href !== '/' && currentPath.startsWith(href)) ||
          (href === '/' && currentPath === '/')) {
        link.classList.add('active');
      }
    });
  }
}

// Initialize the header when DOM is loaded
document.addEventListener('DOMContentLoaded', function(){
  try {
    function setHTMLSafe(el, html){
      if (!el) return;
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    const getToken = () => {
      try { return localStorage.getItem('token') || getCookie('token'); } catch(_) { return getCookie('token'); }
    };
    const badge = document.getElementById('fsMsgBadge');
    async function refreshHeaderUnread() {
      if (!badge) return;
      try {
        const token = getToken();
        const res = await fetch('/api/messages/unread-count', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const count = (json && json.data && typeof json.data.count === 'number') ? json.data.count : 0;
        if (count > 0) {
          badge.style.display = 'inline-block';
          badge.textContent = String(count);
        } else {
          badge.style.display = 'none';
          badge.textContent = '0';
        }
      } catch(_) { /* silent */ }
    }
    // Initial fetch and polling
    refreshHeaderUnread();
    setInterval(refreshHeaderUnread, 60000);
    // Listen for custom events from other pages to refresh quickly
    window.addEventListener('messages:unread-updated', refreshHeaderUnread);
  } catch(_) {}
  // Verify Email modal logic (moved from header.ejs to comply with CSP)
  try {
    const verifyEmailBtn = document.getElementById('verifyEmailBtn');
    const sendVerificationBtn = document.getElementById('sendVerificationBtn');
    const verifySuccessAlert = document.getElementById('verifySuccessAlert');
    const verifyErrorAlert = document.getElementById('verifyErrorAlert');
    const verifyEmailModalEl = document.getElementById('verifyEmailModal');
    let verifyEmailModal = null;
    try { if (verifyEmailModalEl && window.bootstrap) verifyEmailModal = new bootstrap.Modal(verifyEmailModalEl); } catch(_) {}

    if (verifyEmailBtn && verifyEmailModal) {
      verifyEmailBtn.addEventListener('click', function(e){
        e.preventDefault();
        try { verifyEmailModal.show(); } catch(_) {}
      });
    }

    if (sendVerificationBtn) {
      sendVerificationBtn.addEventListener('click', async function(){
        try {
          if (verifySuccessAlert) verifySuccessAlert.classList.add('d-none');
          if (verifyErrorAlert) verifyErrorAlert.classList.add('d-none');
          sendVerificationBtn.disabled = true;
          setHTMLSafe(sendVerificationBtn, '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...');
          const token = (function(){ try { return localStorage.getItem('token') || ''; } catch(_) { return ''; } })();
          const response = await fetch('/api/email/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
          });
          const data = await response.json().catch(() => ({}));
          if (data && data.success) {
            if (verifySuccessAlert) verifySuccessAlert.classList.remove('d-none');
          } else {
            if (verifyErrorAlert) {
              verifyErrorAlert.textContent = (data && data.message) || 'Failed to send verification email. Please try again.';
              verifyErrorAlert.classList.remove('d-none');
            }
          }
        } catch (error) {
          if (verifyErrorAlert) {
            verifyErrorAlert.textContent = 'An error occurred. Please try again later.';
            verifyErrorAlert.classList.remove('d-none');
          }
          try { console.error('Verify email error:', error); } catch(_) {}
        } finally {
          sendVerificationBtn.disabled = false;
          sendVerificationBtn.textContent = 'Send Verification Email';
        }
      });
    }
  } catch(_) {}

  // Navbar Cart button opens the global cart panel
  try {
    const fsCartBtn = document.getElementById('fsCartBtn');
    if (fsCartBtn){
      fsCartBtn.addEventListener('click', () => {
        const panel = document.getElementById('myCartPanel');
        if (panel){ panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); }
        const refresh = document.getElementById('myCartRefresh');
        if (refresh){ try { refresh.click(); } catch(_) {} }
      });
    }
  } catch(_) {}
});
