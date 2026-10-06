'use strict';
require('dotenv').config();

// Hostinger loads this entry point as a module, so startup must be unconditional.
try {
  const store = require('./database.cjs').createStore();
  const server = require('./app.cjs').createServer(store);
  server.listen(Number(process.env.PORT || 5187), '0.0.0.0', () => console.log('Basket HTTP server is listening.'));
  module.exports = server;

  // Database connections must not delay listen() beyond the hosting startup limit.
  store.read().then(() => console.log('Basket database is ready.')).catch(async error => {
    console.error('Database startup failed:', error.code || error.message);
    server.close();
    await store.close();
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
