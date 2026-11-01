const VERSION='panelverse-shell-v10';
const ASSETS=['/styles.css','/app.js','/manifest.webmanifest','/icon.svg','/login.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;if(url.pathname.startsWith('/api/')||req.mode==='navigate'){event.respondWith(fetch(req));return;}event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put(req,response.clone()));return response;})));});
