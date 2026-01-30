// Service Worker para MP Chat PWA con Notificaciones Push
// Versión 2.0.0 - Con soporte completo de notificaciones

const CACHE_VERSION = 'mp-chat-v2.0.0';
const RUNTIME_CACHE = 'mp-chat-runtime';

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-72.png'
];

// ==================== INSTALACIÓN ====================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando v2.0.0...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('📦 Service Worker: Cacheando archivos esenciales...');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker: Instalado correctamente');
        return self.skipWaiting(); // Activar inmediatamente
      })
      .catch((error) => {
        console.error('❌ Service Worker: Error en instalación:', error);
      })
  );
});

// ==================== ACTIVACIÓN ====================
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activando v2.0.0...');
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
        return self.clients.claim(); // Tomar control inmediatamente de todas las pestañas
      })
  );
});

// ==================== FETCH (Network First) ====================
self.addEventListener('fetch', (event) => {
  // Solo cachear peticiones GET
  if (event.request.method !== 'GET') return;

  // Ignorar Firebase, Google APIs, y servicios externos
  if (
    event.request.url.includes('firebase') ||
    event.request.url.includes('googleapis') ||
    event.request.url.includes('firebasestorage') ||
    event.request.url.includes('firebaseio') ||
    event.request.url.includes('gstatic')
  ) {
    return;
  }

  event.respondWith(
    // Intentar red primero (para datos frescos)
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, cachearla
        if (response && response.status === 200 && response.type === 'basic') {
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
              console.log('📦 Sirviendo desde cache:', event.request.url);
              return cachedResponse;
            }
            // Si no hay cache y es navegación, mostrar página offline
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// ==================== NOTIFICACIONES PUSH ====================
self.addEventListener('push', (event) => {
  console.log('📬 Push notification recibida:', event);
  
  let data = {};
  
  // Parsear datos del push
  if (event.data) {
    try {
      data = event.data.json();
      console.log('📄 Datos del push:', data);
    } catch (e) {
      // Si no es JSON, usar como texto
      data = { 
        title: 'Nuevo mensaje', 
        body: event.data.text() 
      };
    }
  }
  
  const title = data.title || '💬 Nuevo mensaje';
  const options = {
    body: data.body || 'Tienes un mensaje nuevo en el chat',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200, 100, 200], // Patrón de vibración más notable
    tag: 'message-notification', // Para reemplazar notificaciones antiguas
    requireInteraction: false, // No requiere interacción para desaparecer
    silent: false, // NO silenciar (permitir sonido del sistema)
    renotify: true, // Notificar de nuevo si hay una con el mismo tag
    data: {
      url: data.url || '/',
      messageId: data.messageId || Date.now(),
      timestamp: Date.now(),
      senderId: data.senderId,
      senderName: data.senderName
    },
    actions: [
      { 
        action: 'open', 
        title: 'Abrir',
        icon: '/icon-72.png'
      },
      { 
        action: 'close', 
        title: 'Cerrar',
        icon: '/icon-72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('✅ Notificación mostrada correctamente');
      })
      .catch((error) => {
        console.error('❌ Error mostrando notificación:', error);
      })
  );
});

// ==================== CLICK EN NOTIFICACIÓN ====================
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notificación clickeada. Acción:', event.action);
  
  // Cerrar la notificación
  event.notification.close();

  // Si presionó "close", no hacer nada más
  if (event.action === 'close') {
    console.log('❌ Usuario cerró la notificación');
    return;
  }

  // Si presionó "open" o clickeó la notificación
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
      clients.matchAll({ 
        type: 'window', 
        includeUncontrolled: true 
      })
        .then((clientList) => {
          console.log('🔍 Buscando ventanas abiertas:', clientList.length);
          
          // Buscar si ya hay una ventana abierta de la app
          for (let client of clientList) {
            if (client.url.includes(self.registration.scope) && 'focus' in client) {
              console.log('✅ Enfocando ventana existente');
              return client.focus().then(() => {
                // Opcional: Enviar mensaje a la ventana para que navegue
                if ('postMessage' in client) {
                  client.postMessage({
                    type: 'NOTIFICATION_CLICKED',
                    data: event.notification.data
                  });
                }
                return client;
              });
            }
          }
          
          // Si no hay ventana abierta, abrir una nueva
          if (clients.openWindow) {
            console.log('🆕 Abriendo nueva ventana:', urlToOpen);
            return clients.openWindow(urlToOpen);
          }
        })
        .catch((error) => {
          console.error('❌ Error manejando click:', error);
        })
    );
  }
});

// ==================== CIERRE DE NOTIFICACIÓN ====================
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notificación cerrada:', event.notification.tag);
  
  // Aquí podrías hacer tracking de notificaciones cerradas
  // Por ejemplo, registrar en analytics que el usuario ignoró la notificación
});

// ==================== SINCRONIZACIÓN EN BACKGROUND ====================
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync solicitado:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  } else if (event.tag === 'clear-notifications') {
    event.waitUntil(clearAllNotifications());
  }
});

// Función para sincronizar mensajes pendientes (envío offline)
async function syncPendingMessages() {
  try {
    console.log('📨 Sincronizando mensajes pendientes...');
    
    // Aquí implementarías la lógica para enviar mensajes que se guardaron
    // cuando el usuario estaba offline
    
    // Ejemplo:
    // const pendingMessages = await getPendingMessagesFromIndexedDB();
    // for (const message of pendingMessages) {
    //   await sendMessageToServer(message);
    //   await removePendingMessage(message.id);
    // }
    
    console.log('✅ Sincronización completada');
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    throw error; // Re-throw para que el navegador reintente
  }
}

// Función para limpiar todas las notificaciones
async function clearAllNotifications() {
  try {
    const notifications = await self.registration.getNotifications();
    console.log(`🧹 Limpiando ${notifications.length} notificaciones`);
    
    notifications.forEach(notification => notification.close());
    
    console.log('✅ Notificaciones limpiadas');
  } catch (error) {
    console.error('❌ Error limpiando notificaciones:', error);
  }
}

// ==================== MENSAJE DEL CLIENTE ====================
self.addEventListener('message', (event) => {
  console.log('💬 Mensaje recibido del cliente:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  } else if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    event.waitUntil(clearAllNotifications());
  }
});

// ==================== LOG INICIAL ====================
console.log('✅ Service Worker v2.0.0 cargado correctamente');
console.log('📱 Soporte de notificaciones:', 'Notification' in self);
console.log('📬 Soporte de push:', 'PushManager' in self);
console.log('🔄 Soporte de sync:', 'SyncManager' in self);
