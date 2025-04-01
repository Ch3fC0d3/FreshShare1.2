const express = require('express');
const path = require('path');

// Create a minimal Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for testing
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Default route - serve a simple HTML page
app.get('*', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>FreshShare - Maintenance Mode</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #63b175; }
          .message { background-color: #f8f9fa; border-left: 4px solid #63b175; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>FreshShare - Maintenance Mode</h1>
        <div class="message">
          <p>Our application is currently in maintenance mode. We'll be back shortly!</p>
          <p>Thank you for your patience.</p>
        </div>
      </body>
    </html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Minimal server is running on port ${PORT}`);
});
