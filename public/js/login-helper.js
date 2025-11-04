/**
 * Login Helper Script
 * This script helps ensure proper authentication by updating localStorage after login.
 */

(function() {
    // Wait for the login form to be available
    document.addEventListener('DOMContentLoaded', function() {
        function setHTMLSafe(el, html){
            if (!el) return;
            try {
                if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
                el.innerHTML = String(html||'');
            } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
        }
        const loginForm = document.getElementById('loginForm');
        
        if (loginForm) {
            console.log('Login helper script attached to login form');
            
            // Override the default form submission
            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const errorMessage = document.getElementById('errorMessage');
                
                try {
                    // Show loading state
                    const submitBtn = this.querySelector('button[type="submit"]');
                    const originalBtnText = submitBtn.innerHTML;
                    setHTMLSafe(submitBtn, '<i class="fas fa-spinner fa-spin"></i> Logging in...');
                    submitBtn.disabled = true;
                    
                    console.log('Sending login request...');
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'same-origin',
                        body: JSON.stringify({ username, password })
                    });
                    
                    console.log('Login response status:', response.status);
                    const data = await response.json();
                    console.log('Login response data:', JSON.stringify(data, null, 2));
                    
                    if (response.ok) {
                        // Store token in localStorage
                        if (data.token) {
                            // Store the raw token exactly as the server returns it
                            const rawToken = data.token.startsWith('Bearer ') ? data.token.substring(7) : data.token;
                            localStorage.setItem('token', rawToken);
                            console.log('Token stored in localStorage (raw token without Bearer prefix)');
                            
                            // Check if "Remember me" is checked
                            const rememberMe = document.getElementById('rememberMe').checked;
                            
                            // Store the remember me preference
                            localStorage.setItem('rememberMe', rememberMe);
                            
                            // Force reload cart data after successful login
                            try {
                                window.dispatchEvent(new CustomEvent('cart:refresh'));
                                console.log('Triggered cart refresh event');
                            } catch(e) {
                                console.error('Failed to trigger cart refresh:', e);
                            }
                        }
                        
                        // Show success message
                        errorMessage.textContent = 'Login successful! Redirecting...';
                        errorMessage.className = 'alert alert-success mb-4';
                        
                        // Get redirect URL from query parameters
                        const urlParams = new URLSearchParams(window.location.search);
                        const redirectUrl = urlParams.get('redirect');
                        
                        // Redirect to dashboard or the redirect URL
                        console.log('Login successful, redirecting to:', redirectUrl || '/marketplace');
                        setTimeout(() => {
                            window.location.href = redirectUrl || '/marketplace';
                        }, 1000);
                    } else {
                        // Show error message
                        errorMessage.textContent = data.message || 'Login failed. Please check your credentials.';
                        errorMessage.className = 'alert alert-danger mb-4';
                        errorMessage.classList.remove('d-none');
                        
                        // Reset button
                        setHTMLSafe(submitBtn, originalBtnText);
                        submitBtn.disabled = false;
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    errorMessage.textContent = 'An error occurred during login. Please try again.';
                    errorMessage.className = 'alert alert-danger mb-4';
                    errorMessage.classList.remove('d-none');
                    
                    // Reset button
                    const submitBtn = this.querySelector('button[type="submit"]');
                    setHTMLSafe(submitBtn, '<i class="fas fa-sign-in-alt me-2"></i>Login');
                    submitBtn.disabled = false;
                }
            });
        }
    });
})();
