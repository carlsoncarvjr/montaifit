// MontAI Fit: guarda uma cópia do app para abrir sem internet na academia.
// Rede primeiro (sempre pega a versão nova quando há sinal); sem sinal, usa a cópia guardada.
const CACHE = "montai-fit-20261122114045";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html", "./manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("montai-fit-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const u = new URL(req.url);
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  const sdk = u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/");   // biblioteca do login, para abrir sem internet
  if (!sameOrigin && !font && !sdk) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html")))
  );
});
