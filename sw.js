// Service Worker CalendIT — Game Zone Montauban
//
// Rôle STRICT et volontairement limité : garantir que CalendIT
// (calendrier.html) et ses scripts externes (Firebase, EmailJS) se chargent
// même sans connexion au démarrage, pour que le mode hors ligne géré dans
// calendrier.html (cache local des réservations, file d'attente) ait une
// chance de s'exécuter. Ce fichier NE gère JAMAIS les données de réservation.
//
// v2 : n'intercepte plus QUE calendrier.html et les scripts listés ci-dessous.
// Les autres pages du site (planning.html, réservation en ligne…) passent
// directement par le réseau, sans jamais être servies depuis ce cache.
// calendrier.html est chargé en priorité depuis le réseau (dernière version
// déployée), le cache ne servant qu'en cas d'absence de connexion.
//
// Incrémenter CACHE_NAME à chaque changement de cette liste force le
// navigateur à retélécharger et remplacer le cache au prochain déploiement.
const CACHE_NAME = 'gz-calendit-shell-v2';

const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
];
const ASSETS_TO_CACHE = ['./calendrier.html', ...CDN_ASSETS];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS_TO_CACHE.map(async url => {
      try { await cache.add(url); }
      catch(e) { console.warn('[SW] Échec de mise en cache :', url, e); }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

const isCalendit = url => {
  const u = new URL(url);
  return u.origin === self.location.origin && /\/calendrier\.html$/.test(u.pathname);
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // CalendIT : réseau d'abord (toujours la dernière version), cache si hors ligne
  if (isCalendit(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(new URL(url).pathname, copy));
        }
        return res;
      } catch(e) {
        const cached = await caches.match(new URL(url).pathname) || await caches.match('./calendrier.html');
        return cached || new Response('Hors ligne — CalendIT n\'est pas encore disponible dans le cache local.', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Scripts Firebase / EmailJS : cache d'abord (versions figées), réseau sinon
  if (CDN_ASSETS.includes(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    })());
    return;
  }

  // Tout le reste (planning.html, réservation en ligne, Firebase…) : non intercepté
});
