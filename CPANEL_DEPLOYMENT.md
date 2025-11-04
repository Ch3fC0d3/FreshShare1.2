# cPanel Deployment Guide for FreshShare

## Prerequisites
- ✅ Node.js enabled in cPanel (you have this!)
- ✅ MongoDB database (you have this set up)
- GitHub repository with your code

## Step 1: Setup GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

### FTP Credentials
```
FTP_SERVER: your-server-hostname (e.g., myfreshshare.com or IP address)
FTP_USERNAME: myjrooxo (your cPanel username)
FTP_PASSWORD: your-cpanel-password
```

### SSH/cPanel Credentials
```
CPANEL_HOST: your-server-hostname
CPANEL_USERNAME: myjrooxo
CPANEL_PASSWORD: your-cpanel-password
```

### Application Secrets
```
MONGODB_URI: mongodb+srv://freshshare:ResQueen@cluster0.wufa48.mongodb.net
JWT_SECRET: (copy from your current cPanel env variables)
JWT_REFRESH_SECRET: (generate a new secure random string)
EMAIL_HOST: mail.yourdomain.com
EMAIL_PORT: 587
EMAIL_USER: noreply@yourdomain.com
EMAIL_PASS: your-email-password
EMAIL_FROM: noreply@yourdomain.com
```

## Step 2: Update cPanel Node.js Settings

Based on your screenshots:

1. **Application root**: `/home/myjrooxo/freshshare1.3`
2. **Application startup file**: `server.js`
3. **Application mode**: Production
4. **Node.js version**: 18.28.8 ✅

## Step 3: Enable SSH Access (if not already enabled)

1. Log into cPanel
2. Go to "Terminal" or "SSH Access"
3. If SSH is disabled, contact Namecheap support to enable it
4. Alternative: Use cPanel's built-in Terminal

## Step 4: Test Manual Deployment

In cPanel Terminal:

```bash
cd /home/myjrooxo/freshshare1.3

# Pull latest code
git clone https://github.com/Ch3fC0d3/Freshshare4.git temp
cp -r temp/* .
rm -rf temp

# Install dependencies
npm install --production

# Create .env file (use your actual values)
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
EMAIL_HOST=mail.yourdomain.com
EMAIL_PORT=587
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your_password
EMAIL_FROM=noreply@yourdomain.com
EOF

# Restart app in cPanel Node.js interface
# Or create restart trigger
touch tmp/restart.txt
```

## Step 5: Push to GitHub to Auto-Deploy

Once secrets are set up:

```bash
git add .
git commit -m "Enable auto-deployment"
git push origin main
```

The GitHub Action will automatically:
1. Upload files via FTP
2. Install dependencies
3. Create .env file
4. Restart your Node.js app

## Step 6: Monitor Deployment

1. Go to GitHub → Actions tab
2. Watch the deployment progress
3. Check for any errors

## Troubleshooting

### If FTP fails:
- Check FTP credentials in GitHub Secrets
- Verify FTP is enabled in cPanel
- Try using cPanel File Manager to manually upload

### If SSH fails:
- Contact Namecheap to enable SSH
- Use cPanel Terminal instead
- Or use Git deployment in cPanel

### Alternative: cPanel Git Deployment

If SSH doesn't work, use cPanel's built-in Git:

1. In cPanel, go to "Git Version Control"
2. Click "Create"
3. Clone URL: `https://github.com/Ch3fC0d3/Freshshare4.git`
4. Repository Path: `/home/myjrooxo/freshshare1.3`
5. Click "Create"

Then in cPanel Terminal:
```bash
cd /home/myjrooxo/freshshare1.3
npm install --production
# Create .env file manually
```

## Monitoring Your App

Check logs in cPanel:
- Node.js App Manager → View logs
- Or SSH/Terminal: `tail -f /home/myjrooxo/freshshare1.3/server.log`

## Updating Your App

Just push to GitHub:
```bash
git add .
git commit -m "Update feature"
git push origin main
```

GitHub Actions will automatically deploy!

## Current Setup (from your screenshots)

✅ App URL: myfreshshare.com
✅ App Root: /home/myjrooxo/freshshare1.3
✅ Startup: server.js
✅ Node: 18.28.8
✅ Status: Started
✅ MongoDB: Connected
✅ Environment Variables: Set

You're all set! Just add the GitHub secrets and push to deploy.
