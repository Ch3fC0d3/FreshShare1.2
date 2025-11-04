// public/js/signup-page.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try {
      console.log('Signup page loaded');
      function setHTMLSafe(el, html){
        if (!el) return;
        try {
          if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
          el.innerHTML = String(html||'');
        } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
      }
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      console.log('Redirect URL:', redirectUrl);

      // If user is already logged in, redirect to dashboard
      try {
        if (document.cookie.includes('token')) {
          console.log('User already logged in, redirecting to dashboard');
          window.location.href = '/dashboard';
          return;
        }
      } catch(_) {}

      const signupForm = document.getElementById('signupForm');
      if (!signupForm) return;

      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Signup form submitted');

        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const address = document.getElementById('address').value;
        const city = document.getElementById('city').value;
        const zipCode = document.getElementById('zipCode').value;

        // Validate password match
        if (password !== confirmPassword) {
          console.error('Password mismatch');
          alert('Passwords do not match!');
          return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        setHTMLSafe(submitBtn, '<i class="fas fa-spinner fa-spin"></i> Creating Account...');
        submitBtn.disabled = true;

        try {
          const requestBody = { username, email, password, address, city, zipCode };
          console.log('Sending signup request to /api/auth/signup...');
          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });
          const data = await response.json();
          console.log('Signup response status:', response.status);

          if (response.ok) {
            console.log('Signup successful, showing success message');
            signupForm.style.display = 'none';
            const successEl = document.getElementById('signupSuccess');
            if (successEl) successEl.style.display = 'block';
          } else {
            console.error('Signup failed:', data && data.message);
            alert((data && data.message) || 'Registration failed. Please try again.');
          }
        } catch (error) {
          console.error('Signup error:', error);
          alert('An error occurred. Please try again later.');
        } finally {
          setHTMLSafe(submitBtn, originalBtnText);
          submitBtn.disabled = false;
        }
      });
    } catch (e) {
      try { console.error('signup-page init error', e); } catch(_) {}
    }
  });
})();
