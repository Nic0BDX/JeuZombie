const cacheName='cendres-v5';
const files=['./','./index.html','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./main.js','./game.js','./input.js','./player.js',
 './enemies.js','./weapons.js','./passives.js','./pickups.js','./waves.js','./ui.js','./audio.js','./sprites.js','./save.js','./meta.js','./meta-ui.js','./data/shop.js',
 './data/audio.js','./data/characters.js','./data/enemies.js','./data/weapons.js','./data/cards.js','./data/passives.js','./data/waves.js'];
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('cendres-') && key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event=>{
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request).catch(async error=>{
    if(event.request.mode==='navigate') return await caches.match('./');
    throw error;
  })));
});
