// Ensure JWT_SECRET is configured in environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set!');
  console.error('Please configure JWT_SECRET in your .env file for security.');
  process.exit(1);
}

module.exports = {
  secret: process.env.JWT_SECRET
};
