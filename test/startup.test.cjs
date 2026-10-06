'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

test('hosting can require the entry point and listen while the database check is pending', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    let checked = false;
    Module._load = function(name, ...args) {
      if (name === 'dotenv') return {config() {}};
      if (name === './database.cjs') return {createStore() {
        return {read() {checked = true; return new Promise(() => {});}, close: async () => {}};
      }};
      return original.call(this, name, ...args);
    };
    Object.assign(process.env, {
      PORT: '0', APP_ORIGIN: 'https://basket.example', NODE_ENV: 'production',
      APP_ALLOWED_ORIGINS: '', SHARED_PASSWORD: 'startup-test-password',
      SESSION_SECRET: 'startup-test-secret-with-at-least-32-characters'
    });
    const server = require('./server.cjs');
    server.once('listening', () => {
      assert.ok(server.address().port > 0);
      assert.ok(checked);
      server.close();
    });
  `], {cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 5000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HTTP server is listening/);
});
