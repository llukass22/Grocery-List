'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createServer} = require('../app.cjs');
const env = {SHARED_PASSWORD:'a-private-household-password',SESSION_SECRET:'test-session-secret-with-at-least-32-characters',APP_ORIGIN:'http://localhost:5187'};
function request(server, method, pathname, data, cookie, origin = env.APP_ORIGIN) {
  return new Promise((resolve,reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const req = http.request({host:'127.0.0.1',port:server.address().port,path:pathname,method,headers:{...(body ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})}}, res => {
      let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:res.headers['content-type']?.includes('json')?JSON.parse(text):text}));
    });req.on('error',reject);req.end(body);
  });
}
function memoryStore() {
  const items = new Map();
  const read = async () => [...items.values()].map(i=>({...i}));
  return {read,add:async batch=>{for(const i of batch)if(!items.has(i.id))items.set(i.id,{...i});return read();},update:async(id,changes)=>{if(!items.has(id))throw Object.assign(new Error('Item no longer exists.'),{status:404});Object.assign(items.get(id),changes);return read();},remove:async id=>{items.delete(id);return read();},clear:async()=>{if([...items.values()].some(i=>!i.done))throw Object.assign(new Error('Check off every item before clearing the list.'),{status:409});items.clear();return [];}};
}
async function fixture(t,store=memoryStore(),config=env) {
  const server=createServer(store,config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return server;
}
async function login(server){const result=await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD});assert.equal(result.status,200);return result.headers['set-cookie'][0].split(';')[0];}

test('private list: auth, cookie tampering, CSRF, secret-file isolation',async t=>{
  const server=await fixture(t);
  assert.equal((await request(server,'GET','/api/items')).status,401);
  assert.equal((await request(server,'POST','/api/session',{password:'wrong'})).status,401);
  const cookie=await login(server);
  assert.match((await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD})).headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
  assert.equal((await request(server,'GET','/api/items',undefined,cookie+'0')).status,401);
  assert.equal((await request(server,'POST','/api/items',{items:[]},cookie,'https://other.example')).status,403);
  assert.equal((await request(server,'DELETE','/api/items',undefined,cookie,null)).status,403);
  for(const pathname of ['/.env','/server.cjs','/schema.sql','/%2e%2e/package.json'])assert.equal((await request(server,'GET',pathname)).status,404);
  assert.equal((await request(server,'GET','/')).status,200);
  assert.equal((await request(server,'DELETE','/api/session',undefined,cookie)).headers['set-cookie'][0].includes('Max-Age=0'),true);
});

test('two devices share item operations; retries do not duplicate imported items',async t=>{
  const server=await fixture(t), a=await login(server), b=await login(server);
  const milk={id:'milk-id',name:'Milk',quantity:1,done:false};
  assert.equal((await request(server,'POST','/api/items',{items:[milk]},a)).status,200);
  assert.deepEqual((await request(server,'GET','/api/items',undefined,b)).body.items,[milk]);
  await Promise.all([request(server,'PATCH','/api/items/milk-id',{quantity:3},a),request(server,'PATCH','/api/items/milk-id',{done:true},b)]);
  const expected={...milk,quantity:3,done:true};
  assert.deepEqual((await request(server,'GET','/api/items',undefined,a)).body.items,[expected]);
  await request(server,'POST','/api/items',{items:[milk]},b);
  assert.deepEqual((await request(server,'GET','/api/items',undefined,a)).body.items,[expected]);
  assert.equal((await request(server,'DELETE','/api/items',undefined,a)).status,200);
  assert.deepEqual((await request(server,'GET','/api/items',undefined,b)).body.items,[]);
});

test('validation, stale edits and clear protection',async t=>{
  const server=await fixture(t),cookie=await login(server);
  for(const items of [[],[{id:'x',name:'Milk',quantity:11,done:false}],[{id:'x',name:' ',quantity:1,done:false}],[{id:'x',name:'Milk',quantity:1,done:'yes'}]])assert.equal((await request(server,'POST','/api/items',{items},cookie)).status,400);
  await request(server,'POST','/api/items',{items:[{id:'x',name:'Milk',quantity:1,done:false}]},cookie);
  assert.equal((await request(server,'DELETE','/api/items',undefined,cookie)).status,409);
  assert.equal((await request(server,'PATCH','/api/items/x',{name:'injected'},cookie)).status,400);
  assert.equal((await request(server,'PATCH','/api/items/x',{quantity:0},cookie)).status,400);
  await request(server,'DELETE','/api/items/x',undefined,cookie);
  assert.equal((await request(server,'PATCH','/api/items/x',{done:true},cookie)).status,404);
});

test('database errors do not disclose connection details',async t=>{
  const store=memoryStore();store.read=async()=>{throw new Error('secret db password');};
  const server=await fixture(t,store),cookie=await login(server);
  const result=await request(server,'GET','/api/items',undefined,cookie);
  assert.equal(result.status,503);assert.equal(JSON.stringify(result.body).includes('secret'),false);
});

test('HTTPS sessions use secure cookies and production rejects HTTP',async t=>{
  assert.throws(()=>createServer(memoryStore(),{...env,NODE_ENV:'production'}),/HTTPS/);
  const config={...env,APP_ORIGIN:'https://basket.example',NODE_ENV:'production'};
  const server=await fixture(t,memoryStore(),config);
  const result=await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD},undefined,config.APP_ORIGIN);
  assert.match(result.headers['set-cookie'][0],/; Secure/);
});

test('login attempts are limited',async t=>{
  const server=await fixture(t);
  for(let i=0;i<30;i++)assert.equal((await request(server,'POST','/api/session',{password:'wrong'})).status,401);
  assert.equal((await request(server,'POST','/api/session',{password:'wrong'})).status,429);
});

test('explicit additional origins work while other hosts and ports are rejected',async t=>{
  const localOrigin='http://192.0.2.1:5191';
  const server=await fixture(t,memoryStore(),{...env,APP_ALLOWED_ORIGINS:localOrigin+',http://localhost:5191'});
  const result=await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD},undefined,localOrigin);
  assert.equal(result.status,200);
  const cookie=result.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request(server,'POST','/api/items',{items:[{id:'lan-item',name:'Milk',quantity:1,done:false}]},cookie,localOrigin)).status,200);
  assert.equal((await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD},undefined,'http://192.0.2.2:5191')).status,403);
  assert.equal((await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD},undefined,'http://192.0.2.1:5192')).status,403);
  assert.equal((await request(server,'POST','/api/session',{password:env.SHARED_PASSWORD},undefined,'null')).status,403);
  assert.throws(()=>createServer(memoryStore(),{...env,APP_ORIGIN:'https://basket.example',NODE_ENV:'production',APP_ALLOWED_ORIGINS:localOrigin}),/HTTPS/);
});
