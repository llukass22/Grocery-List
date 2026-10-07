'use strict';
// Optional browser integration check: provide Playwright through NODE_PATH.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {createServer} = require('../app.cjs');
const password = 'pwa-smoke-household-password';
let items = [{id:'milk',name:'Milk',quantity:2,done:false}];
const store = {read:async()=>items,add:async batch=>{items.push(...batch);return items;},update:async(id,changes)=>{Object.assign(items.find(item=>item.id===id),changes);return items;},remove:async id=>{items=items.filter(item=>item.id!==id);return items;},clear:async()=>{items=[];return items;}};
(async()=>{
  const server=createServer(store,{SHARED_PASSWORD:password,SESSION_SECRET:'pwa-smoke-secret-at-least-32-characters',APP_ORIGIN:'http://localhost'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  // Permit writes from the randomly assigned test origin.
  await new Promise(resolve=>server.close(resolve));
  const app=createServer(store,{SHARED_PASSWORD:password,SESSION_SECRET:'pwa-smoke-secret-at-least-32-characters',APP_ORIGIN:url});
  await new Promise(resolve=>app.listen(Number(new URL(url).port),'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.locator('#shared-password').fill(password);await page.locator('#unlock-form button').click();
    await page.waitForFunction(()=>document.querySelector('.item-name')?.textContent==='Milk'&&!document.querySelector('.item-toggle').disabled);
    assert.equal(await page.evaluate(async()=>Object.keys(await (await fetch('/manifest.webmanifest')).json()).includes('icons')),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('basket-offline-list-v1')),null);
    assert.deepEqual(await page.evaluate(async()=>await caches.keys()),[]);
    assert.equal(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length),0);
    // Upgrading clears previous snapshots/caches without touching unrelated ones.
    await page.evaluate(async()=>{
      localStorage.setItem('basket-offline-list-v1',JSON.stringify({items:[{id:'old',name:'Old saved list',quantity:1,done:false}]}));
      await (await caches.open('basket-shell-v1')).put('/',new Response('old shell'));
      await caches.open('unrelated-app');
    });
    await page.reload();await page.waitForFunction(()=>document.querySelector('.item-name')?.textContent==='Milk');
    assert.equal(await page.evaluate(()=>localStorage.getItem('basket-offline-list-v1')),null);
    await page.waitForFunction(async()=>!(await caches.keys()).includes('basket-shell-v1'));
    assert.ok((await page.evaluate(()=>caches.keys())).includes('unrelated-app'));
    // The migration worker removes itself; new visits never register a worker.
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');});
    await page.waitForFunction(async()=> (await navigator.serviceWorker.getRegistrations()).length===0);
    await context.setOffline(true);
    assert.equal(await page.locator('.item-toggle').isDisabled(),true);
    assert.equal(await page.locator('#add-form button').isDisabled(),true);
    assert.match(await page.locator('#connection-status').innerText(),/internet connection/);
    await assert.rejects(()=>page.reload({timeout:10000}),/ERR_INTERNET_DISCONNECTED/);
    items=[...items,{id:'bread',name:'Bread',quantity:1,done:false}];
    await context.setOffline(false);await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('.item-name').length===2&&!document.querySelector('.item-toggle').disabled);
    // Sessions persist across tabs/reloads with no manual locking controls.
    const other=await context.newPage();await other.goto(url);await other.waitForFunction(()=>document.querySelectorAll('.item-name').length===2);
    assert.equal(await page.locator('#logout').count(),0);
    assert.equal(await other.locator('#logout').count(),0);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.item-name').length===2);
    assert.equal(await page.evaluate(()=>localStorage.getItem('basket-offline-list-v1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('basket-pending-lock-v1')),null);
    assert.equal((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated)),true);
    assert.deepEqual(errors,[]);
    console.log('PWA browser checks passed: installation manifest, offline cache cleanup, online reconnection, persistent sessions and no Lock list controls.');
  } finally {if(browser)await browser.close();await new Promise(resolve=>app.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
