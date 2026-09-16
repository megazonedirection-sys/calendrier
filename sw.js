// Service Worker CalendIT — Game Zone Montauban
//
// Rôle STRICT et volontairement limité : garantir que la page elle-même et
// ses scripts externes (Firebase, EmailJS) se chargent même sans connexion
// au démarrage, pour que le mode hors ligne géré dans calendrier.html
// (cache local des réservations, file d'attente) ait une chance de
// s'exécuter. Ce fichier NE gère JAMAIS les données de réservation
// elles-mêmes — uniquement le "coffrage" technique de l'application.
//
// Incrémenter CACHE_NAME à chaque changement de cette liste force le
// navigateur à retélécharger et remplacer le cache au prochain déploiement.
const CACHE_NAME = 'gz-calendit-shell-v1';

const ASSETS_TO_CACHE = [
  './calendrier.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Mise en cache tolérante aux échecs individuels : si un des scripts
    // externes ne peut pas être récupéré maintenant (CDN temporairement
    // indisponible, etc.), on continue quand même avec le reste plutôt que
    // de faire échouer toute l'installation du Service Worker.
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

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Ne jamais intercepter les échanges avec Firebase (données temps réel) —
  // ce Service Worker gère uniquement le chargement de l'app, jamais les
  // données de réservation (qui ont leur propre cache applicatif, géré
  // séparément dans calendrier.html via localStorage).
  if (url.includes('firebaseio.com') || url.includes('firebasedatabase.app') || url.includes('googleapis.com')) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    // "Stale-while-revalidate" : sert immédiatement la version en cache si
    // elle existe (rapide, fonctionne hors ligne), tout en tentant de la
    // rafraîchir en arrière-plan pour la prochaine visite.
    const networkFetch = fetch(event.request).then(response => {
      if (response && response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      }
      return response;
    }).catch(() => null);

    return cached || (await networkFetch) || new Response(
      'Hors ligne — cette ressource n\'est pas disponible dans le cache local.',
      { status: 503, statusText: 'Offline' }
    );
  })());
});
