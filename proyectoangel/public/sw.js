// Service Worker para MP Chat PWA
// Versión 1.0.0

const CACHE_VERSION = 'mp-chat-v1.0.0';
const RUNTIME_CACHE = 'mp-chat-runtime';

// Archivos para cachear inmediatamente
const PRECACHE_URLS = [
  '/',
  '/offline.html', // Página offline personalizada
  '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('📦 Service Worker: Cacheando archivos...');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker: Instalado correctamente');
        return self.skipWaiting(); // Activar inmediatamente
      })
  );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activando...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Borrar caches viejas
              return cacheName !== CACHE_VERSION && cacheName !== RUNTIME_CACHE;
            })
            .map((cacheName) => {
              console.log('🗑️ Service Worker: Borrando cache vieja:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activado correctamente');
        return self.clients.claim(); // Tomar control inmediatamente
      })
  );
});

// Interceptar peticiones (estrategia: Network First, fallback a Cache)
self.addEventListener('fetch', (event) => {
  // Solo cachear peticiones GET
  if (event.request.method !== 'GET') return;

  // Ignorar Firebase, Google APIs, etc.
  if (
    event.request.url.includes('firebase') ||
    event.request.url.includes('googleapis') ||
    event.request.url.includes('firebasestorage')
  ) {
    return;
  }

  event.respondWith(
    // Intentar red primero (para datos frescos)
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, cachearla
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, usar cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no hay cache, mostrar página offline
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
  console.log('📬 Push recibido:', event);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Nuevo mensaje';
  const options = {
    body: data.body || 'Tienes un nuevo mensaje en el chat',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'mp-chat-notification',
    requireInteraction: false,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Manejar click en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notificación clickeada');
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Sincronización en background (para enviar mensajes offline)
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Función para sincronizar mensajes pendientes
async function syncMessages() {
  // Aquí podrías sincronizar mensajes que se enviaron offline
  console.log('📨 Sincronizando mensajes pendientes...');
}

console.log('✅ Service Worker cargado correctamente');
