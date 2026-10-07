'use strict';
// Migration only: retire caching workers on existing installations.
// Keep this URL available for browsers updating the previously installed worker.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('basket-shell-')).map(key=>caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
// No fetch handler: all requests use the network.
