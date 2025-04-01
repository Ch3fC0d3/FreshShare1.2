const express = require('express');

// Create the simplest possible Express app
const app = express();
const PORT = process.env.PORT || 8080; // Digital Ocean often uses port 8080

// Extremely simple route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>FreshShare - Emergency Mode</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #63b175; }
          .message { background-color: #f8f9fa; border-left: 4px solid #63b175; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>FreshShare - Emergency Mode</h1>
        <div class="message">
          <p>Our application is currently in emergency maintenance mode.</p>
          <p>Server is running on port: ${PORT}</p>
          <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
        </div>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Emergency server is running' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Emergency server is running on port ${PORT}`);
});
