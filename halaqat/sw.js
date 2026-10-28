/* حلقات أبوبكر الصديق: يعمل بدون إنترنت بعد أول فتح */
const CACHE='halaqat-v1793172977';
const CORE=["./", "index.html", "manifest.webmanifest", "qcf.json", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-48.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "fonts/AmiriQuran-Regular.woff", "fonts/ArefRuqaa-Bold.woff", "fonts/ArefRuqaa-Regular.woff", "fonts/Tajawal-Bold.woff", "fonts/Tajawal-ExtraBold.woff", "fonts/Tajawal-Medium.woff", "fonts/Tajawal-Regular.woff"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!=='halaqat-qcf').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  const u=new URL(r.url);const cdn=u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('/quran-qcf4@');
  if(r.method!=='GET'||(u.origin!==location.origin&&!cdn)||u.pathname.includes('/api/'))return;
  e.respondWith((async()=>{
    const hit=await caches.match(r,{ignoreSearch:true});
    const store=(cdn||u.pathname.includes('/fonts/qcf/'))?'halaqat-qcf':CACHE;
    const net=fetch(r).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(store).then(c=>c.put(r,cp))}return res}).catch(()=>null);
    if(hit){e.waitUntil(net);return hit}
    const res=await net;
    if(res)return res;
    if(r.mode==='navigate')return (await caches.match('index.html'))||Response.error();
    return Response.error();
  })());
});
