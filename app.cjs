'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, 'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const fail = (status, message) => Object.assign(new Error(message), {status});
const digest = value => crypto.createHash('sha256').update(value).digest();

function createServer(store, env = process.env) {
  if (!env.SHARED_PASSWORD || env.SHARED_PASSWORD.length < 12) throw new Error('SHARED_PASSWORD must be at least 12 characters.');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const origin = new URL(env.APP_ORIGIN).origin;
  const allowedOrigins = new Set([origin]);
  for (const value of (env.APP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    const address = new URL(value);
    if (!['http:', 'https:'].includes(address.protocol) || (env.NODE_ENV === 'production' && address.protocol !== 'https:')) throw new Error('Allowed app origins must use HTTP locally or HTTPS in production.');
    allowedOrigins.add(address.origin);
  }
  const secure = new URL(origin).protocol === 'https:';
  if (env.NODE_ENV === 'production' && !secure) throw new Error('APP_ORIGIN must use HTTPS in production.');
  const sessionKey = crypto.createHmac('sha256', env.SESSION_SECRET).update(env.SHARED_PASSWORD).digest();
  const sign = value => crypto.createHmac('sha256', sessionKey).update(value).digest('hex');
  const maxAge = 7 * 24 * 60 * 60;
  const cookie = (value, age) => `basket_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function authenticated(req) {
    const token = /(?:^|;\s*)basket_session=([^;]*)/.exec(req.headers.cookie || '')?.[1] || '';
    const [expires, signature] = token.split('.');
    if (!/^\d+$/.test(expires || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
    return Number(expires) > Date.now() && crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(expires), 'hex'));
  }
  let loginWindow = 0, loginAttempts = 0;
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Expected JSON.');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw fail(413, 'Request is too large.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw fail(400, 'Invalid JSON.'); }
  }
  function validItem(item) {
    return item && typeof item.id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(item.id) && typeof item.name === 'string' && item.name.trim().length >= 1 && item.name.trim().length <= 120 && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10 && typeof item.done === 'boolean';
  }
  return http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const pathname = new URL(req.url, origin).pathname;
      if (pathname.startsWith('/api/')) {
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) throw fail(405, 'Method not allowed.');
        if (req.method !== 'GET' && !allowedOrigins.has(req.headers.origin)) throw fail(403, 'This address is not enabled for the shared list. Open the configured app address.');
        if (pathname === '/api/session' && req.method === 'GET') return json(200, {authenticated: authenticated(req)});
        if (pathname === '/api/session' && req.method === 'POST') {
          if (Date.now() - loginWindow > 60000) { loginWindow = Date.now(); loginAttempts = 0; }
          if (++loginAttempts > 30) throw fail(429, 'Too many login attempts. Try again in a minute.');
          const data = await body(req);
          if (typeof data?.password !== 'string' || !crypto.timingSafeEqual(digest(data.password), digest(env.SHARED_PASSWORD))) throw fail(401, 'Incorrect password.');
          const expires = String(Date.now() + maxAge * 1000);
          res.setHeader('Set-Cookie', cookie(`${expires}.${sign(expires)}`, maxAge));
          return json(200, {authenticated: true});
        }
        if (pathname === '/api/session' && req.method === 'DELETE') {
          res.setHeader('Set-Cookie', cookie('', 0));
          return json(200, {authenticated: false});
        }
        if (!authenticated(req)) throw fail(401, 'Unlock the shared list first.');
        if (pathname === '/api/items' && req.method === 'GET') return json(200, {items: await store.read()});
        if (pathname === '/api/items' && req.method === 'POST') {
          const data = await body(req);
          if (!Array.isArray(data?.items) || !data.items.length || data.items.length > 100 || !data.items.every(validItem)) throw fail(400, 'Supply 1–100 valid items with quantities from 1–10.');
          return json(200, {items: await store.add(data.items.map(item => ({id:item.id, name:item.name.trim(), quantity:item.quantity, done:item.done})))});
        }
        if (pathname === '/api/items' && req.method === 'DELETE') return json(200, {items: await store.clear()});
        const match = /^\/api\/items\/([A-Za-z0-9-]{1,64})$/.exec(pathname);
        if (match && req.method === 'PATCH') {
          const changes = await body(req);
          if (!changes || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).some(key => !['quantity','done'].includes(key)) || ('quantity' in changes && (!Number.isInteger(changes.quantity) || changes.quantity < 1 || changes.quantity > 10)) || ('done' in changes && typeof changes.done !== 'boolean')) throw fail(400, 'Invalid item changes.');
          return json(200, {items: await store.update(match[1], changes)});
        }
        if (match && req.method === 'DELETE') return json(200, {items: await store.remove(match[1])});
        throw fail(404, 'API route not found.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
      // Only public assets are served; credentials and server files stay private.
      const file = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!['index.html','app.js','styles.css','favicon.svg'].includes(file)) throw fail(404, 'Not found.');
      const data = await fs.readFile(path.join(root, file));
      res.writeHead(200, {'Content-Type':types[path.extname(file)], 'Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!error.status) console.error('Basket request failed:', error.code || error.name);
      json(error.status || 503, {error: error.status ? error.message : 'Shared list is unavailable. Please try again.'});
    }
  });
}
module.exports = {createServer};
