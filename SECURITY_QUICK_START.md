# Security Improvements - Quick Start Guide

## 🚀 Installation

Run this command to install the new security dependencies:

```bash
npm install
```

This installs:
- `dompurify@^3.0.6` - XSS protection
- `isomorphic-dompurify@^2.9.0` - Server-side DOMPurify
- `express-rate-limit@^7.1.5` - Rate limiting

## ✅ What Changed

### 1. Password Security
- **Minimum password length**: 6 → 8 characters
- **Bcrypt operations**: Now async (non-blocking)
- **Salt rounds**: 8 → 10 (more secure)
- **Password field**: Hidden by default in queries

### 2. XSS Protection
- **DOMPurify**: Automatically loaded on all pages
- **SafeHTML utility**: Available globally as `window.SafeHTML`
- **CSP**: Content Security Policy already configured

### 3. Rate Limiting
- **Login**: 5 attempts per 15 minutes
- **Signup**: 3 accounts per hour per IP

## 🛡️ Using SafeHTML (Prevent XSS)

### Quick Reference

```javascript
// ❌ UNSAFE - Never do this with user content
element.innerHTML = userContent;

// ✅ SAFE - Use SafeHTML utility
window.SafeHTML.setHTML(element, userContent);

// ✅ SAFE - For plain text only
window.SafeHTML.setText(element, userText);

// ✅ SAFE - Sanitize and return
const clean = window.SafeHTML.sanitize(dirtyHTML);
```

### Common Patterns

```javascript
// Rendering user comments
const commentDiv = document.getElementById('comment');
window.SafeHTML.setHTML(commentDiv, userComment);

// Displaying usernames (plain text)
const nameSpan = document.getElementById('username');
window.SafeHTML.setText(nameSpan, user.username);

// Creating safe elements
const badge = window.SafeHTML.createElement('span', 'New', 'badge badge-primary');
container.appendChild(badge);
```

## 📝 Migration Checklist

### For Developers

- [ ] Run `npm install` to get new dependencies
- [ ] Review `SECURITY_IMPROVEMENTS.md` for details
- [ ] Update any code that uses `innerHTML` with user content
- [ ] Test login/signup with rate limiting
- [ ] Verify password validation (8+ characters)

### Priority Files to Update

These files have the most `innerHTML` usage:

1. `public/js/group-details.js` (41 instances)
2. `public/js/forum-page.js` (20 instances)
3. `public/js/edit-listing-page.js` (16 instances)
4. `public/js/dashboard.js` (15 instances)
5. `public/js/create-listing-page.js` (12 instances)

### Search for Unsafe Patterns

```bash
# Find innerHTML usage
grep -r "innerHTML" public/js/

# Find direct HTML insertion
grep -r "\.html(" public/js/
```

## 🧪 Testing

### Manual Tests

1. **Password Length**
   - Try signup with 7-char password → Should fail
   - Try signup with 8-char password → Should succeed

2. **Rate Limiting**
   - Try login 6 times with wrong password → Should block after 5
   - Wait 15 minutes → Should allow login again

3. **XSS Protection**
   - Try entering `<script>alert('XSS')</script>` in a form
   - Verify it's sanitized and doesn't execute

4. **Password Not Exposed**
   - Call `/api/auth/profile` → Password should not be in response

## ⚠️ Breaking Changes

### Password Requirements
Users with passwords shorter than 8 characters will need to update them.

**Recommended approach**:
1. Add a banner for affected users
2. Force password reset on next login
3. Provide clear instructions

### Code Changes Required

If your code queries users and expects password field:

```javascript
// ❌ OLD - Password not included
const user = await User.findById(userId);

// ✅ NEW - Explicitly select password
const user = await User.findById(userId).select('+password');
```

## 📚 Additional Resources

- Full documentation: `SECURITY_IMPROVEMENTS.md`
- DOMPurify docs: https://github.com/cure53/DOMPurify
- Rate limiting: https://github.com/express-rate-limit/express-rate-limit

## 🆘 Common Issues

### "DOMPurify is not defined"
**Solution**: Ensure scripts load in correct order. DOMPurify must load before sanitize.js.

### "Too many authentication attempts"
**Solution**: This is rate limiting working correctly. Wait 15 minutes or use different IP.

### "Password must be at least 8 characters"
**Solution**: Update password to meet new requirements.

### innerHTML still used somewhere
**Solution**: Replace with `window.SafeHTML.setHTML()` or `textContent`.

## 🎯 Next Steps

1. Install dependencies: `npm install`
2. Test the application thoroughly
3. Update frontend code to use SafeHTML
4. Monitor rate limiting in production
5. Review full security documentation

## 📞 Support

For questions or issues:
1. Check `SECURITY_IMPROVEMENTS.md`
2. Review code examples above
3. Test in development environment first
4. Document any issues found
