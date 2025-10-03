# FreshShare Authentication Troubleshooting Log

## Summary
- **Context**: Header continued to show the logged-out state despite the JWT cookie persisting.
- **Resolution Date**: 2025-09-29
- **Owner**: Cascade AI assistant

## Timeline & Fixes

- **08:40** – Removed `res.clearCookie('token')` side effects in the global auth middleware inside `server.js` so failed verifications no longer delete the session cookie before we can debug.
- **08:42** – Confirmed console noise from `public/js/quagga.min.js` is expected barcode-scanner logging (no action required).
- **08:55** – Added explicit `[globalAuth]` logging in `server.js` to report token candidates and final `res.locals.user` state after each request. This made it obvious the middleware was never hydrating the user.
- **09:21** – Updated the JWT verification block in `server.js` to reference the shared secret from `config/auth.config.js`, with a fallback to `LEGACY_JWT_SECRET`. This aligned verification with the token issued in `controllers/auth.controller.js` and preserved backwards compatibility.
- **09:44** – Removed a duplicate `const dbConfig = require('./config/db.config.js');` declaration that nodemon complained about after hot reloads.
- **09:48** – Installed missing dependencies (`helmet`, `cookie-parser`) and restored the `cookieParser` import in `server.js`, resolving startup crashes.
- **09:54** – Confirmed nodemon starts cleanly, login succeeds, and `[globalAuth] locals.user set to` appears in logs. Header now renders authenticated controls across `/create-listing` and other pages.
- **16:05** – Updated `public/js/create-listing-page.js` so marketplace submissions include both the bearer token and session cookies via `credentials: 'same-origin'`.
- **16:12** – Added `[marketplace.getUserId]` diagnostics in `controllers/marketplace.controller.js` to log cookie/header token previews and decode failures when marketplace APIs return 401.

## How It Works Now
1. `controllers/auth.controller.js` signs JWTs with the secret exported by `config/auth.config.js`.
2. `server.js` reads the token from cookies/headers, verifies with the same secret (falling back to `LEGACY_JWT_SECRET`), and loads the user via `User.findById().populate('roles')`.
3. The user document is normalized to plain data, role names are flattened, and `res.locals.user` becomes available to all EJS templates.
4. Middleware no longer clears cookies on verification failures, so tokens persist during transient issues.
5. Additional logging shows the auth flow in real time, making future troubleshooting straightforward.

## Remaining Watchpoints
- Keep `.env` and `config/auth.config.js` secrets in sync if rotated.
- If logs revert to `invalid signature`, double-check for stale tokens and restart nodemon after updating secrets.
- Leave `npm run dev` running while testing so the middleware continues to emit `[globalAuth]` diagnostics.

## Verification Checklist
- Log in at `/login` → should redirect to `/marketplace` without the login banner.
- Load `/create-listing` → header displays user menu rather than `Login / Sign Up` call-to-action.
- Inspect nodemon output → expect `[globalAuth] locals.user set to: { id, username, roles }` for each page load.
