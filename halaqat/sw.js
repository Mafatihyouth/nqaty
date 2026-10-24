/* حلقات أبوبكر الصديق: يعمل بدون إنترنت بعد أول فتح */
const CACHE='halaqat-v1792847789';
const CORE=["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-48.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "fonts/AmiriQuran-Regular.woff", "fonts/ArefRuqaa-Bold.woff", "fonts/ArefRuqaa-Regular.woff", "fonts/Tajawal-Bold.woff", "fonts/Tajawal-ExtraBold.woff", "fonts/Tajawal-Medium.woff", "fonts/Tajawal-Regular.woff"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith((async()=>{
    const hit=await caches.match(r,{ignoreSearch:true});
    const net=fetch(r).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res}).catch(()=>null);
    if(hit){e.waitUntil(net);return hit}
    const res=await net;
    if(res)return res;
    if(r.mode==='navigate')return (await caches.match('index.html'))||Response.error();
    return Response.error();
  })());
});
