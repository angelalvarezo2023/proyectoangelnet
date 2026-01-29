'use client';

import { useEffect, useRef, useState } from 'react';

export default function NotificationSystem() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [showPrompt, setShowPrompt] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Verificar permiso actual
    checkPermission();
    
    // Exponer función global para llamar desde cualquier parte del código
    (window as any).notifyUser = handleNotification;
    
    // Detectar visibilidad de la pestaña
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
      
      // Limpiar título cuando vuelve a la pestaña
      if (!document.hidden && titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
        // Restaurar título original (puedes personalizar esto)
        document.title = 'Angel Vercel';
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Mostrar prompt después de 5 segundos si no tiene permiso
    const promptTimer = setTimeout(() => {
      if (permission === 'default') {
        setShowPrompt(true);
      }
    }, 5000);
    
    // Escuchar mensajes del Service Worker
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        console.log('🔔 Notificación clickeada:', event.data);
        // Aquí puedes navegar a una ruta específica o actualizar el estado
      }
    });
    
    return () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(promptTimer);
    };
  }, [permission]);
  
  function checkPermission() {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      console.log('🔔 Permiso de notificaciones:', Notification.permission);
    } else {
      console.log('⚠️ Notificaciones no soportadas en este navegador');
    }
  }
  
  async function requestPermission() {
    if (!('Notification' in window)) {
      alert('⚠️ Tu navegador no soporta notificaciones.\n\nSi estás en Chrome iOS, necesitas usar Safari para recibir notificaciones.');
      return;
    }
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setShowPrompt(false);
      
      console.log('✅ Permiso de notificaciones:', result);
      
      if (result === 'granted') {
        // Mostrar notificación de prueba
        new Notification('✅ Notificaciones activadas', {
          body: 'Recibirás alertas cuando lleguen mensajes nuevos',
          icon: '/icon-192.png',
          badge: '/icon-72.png',
          vibrate: [200, 100, 200]
        });
        
        // Reproducir sonido de confirmación
        playSound();
        vibrate();
      } else if (result === 'denied') {
        alert('⚠️ Notificaciones bloqueadas.\n\nPara habilitarlas:\n1. Ve a configuración del navegador\n2. Busca este sitio\n3. Permite notificaciones');
      }
    } catch (error) {
      console.error('❌ Error pidiendo permiso:', error);
    }
  }
  
  function handleNotification(data: { text?: string; from?: string; messageId?: string }) {
    console.log('🔔 Notificación recibida:', data);
    
    // Solo notificar si la pestaña NO está visible
    // (Si está visible, el usuario ya ve el mensaje)
    if (isVisible) {
      console.log('⏭️ Pestaña visible, omitiendo notificación');
      return;
    }
    
    // 1. SONIDO
    playSound();
    
    // 2. VIBRACIÓN
    vibrate();
    
    // 3. TÍTULO PARPADEANTE
    flashTitle(data.text || 'Nuevo mensaje');
    
    // 4. NOTIFICACIÓN DEL SISTEMA
    if (permission === 'granted') {
      showNotification(data);
    } else {
      console.log('⚠️ Sin permiso para notificaciones del sistema');
      // Mostrar prompt si no tiene permiso
      setShowPrompt(true);
    }
    
    // 5. BADGE (si es PWA instalada)
    updateBadge();
  }
  
  function playSound() {
    try {
      // Intentar reproducir archivo MP3
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1.0;
        audioRef.current.play()
          .then(() => {
            console.log('✅ Sonido MP3 reproducido');
          })
          .catch((error) => {
            console.log('⚠️ Audio bloqueado, generando beep:', error.message);
            generateBeep();
          });
      } else {
        // Si no hay elemento de audio, generar beep
        generateBeep();
      }
    } catch (error) {
      console.error('❌ Error reproduciendo sonido:', error);
      generateBeep();
    }
  }
  
  function generateBeep() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      // Primer beep (800 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.value = 800;
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.3);
      
      // Segundo beep (1000 Hz) - después de 300ms
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1000;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.3);
      }, 300);
      
      console.log('✅ Beep generado');
    } catch (error) {
      console.error('❌ Error generando beep:', error);
    }
  }
  
  function vibrate() {
    if ('vibrate' in navigator) {
      try {
        // Patrón: vibrar-pausa-vibrar-pausa-vibrar
        const success = navigator.vibrate([200, 100, 200, 100, 200]);
        if (success) {
          console.log('✅ Vibración activada');
        } else {
          console.log('⚠️ Vibración no disponible');
        }
      } catch (error) {
        console.error('❌ Error en vibración:', error);
      }
    } else {
      console.log('⚠️ Vibración no soportada');
    }
  }
  
  function flashTitle(text: string) {
    // Limpiar intervalo anterior si existe
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
    }
    
    const originalTitle = document.title;
    let isOriginal = true;
    let count = 0;
    const maxFlashes = 30; // 15 segundos de parpadeo
    
    titleIntervalRef.current = setInterval(() => {
      // Detener si se alcanza el límite o si la pestaña está visible
      if (count >= maxFlashes || isVisible) {
        if (titleIntervalRef.current) {
          clearInterval(titleIntervalRef.current);
          titleIntervalRef.current = null;
        }
        document.title = originalTitle;
        console.log('⏹️ Título restaurado');
        return;
      }
      
      document.title = isOriginal 
        ? '🔴 NUEVO MENSAJE!' 
        : originalTitle;
      
      isOriginal = !isOriginal;
      count++;
    }, 500); // Parpadeo cada 500ms
    
    console.log('✅ Título parpadeando');
  }
  
  function showNotification(data: { text?: string; from?: string; messageId?: string }) {
    if (permission !== 'granted') {
      console.log('⚠️ Sin permiso para notificaciones');
      return;
    }
    
    try {
      const notificationTitle = data.from 
        ? `💬 Mensaje de ${data.from}` 
        : '💬 Nuevo mensaje';
      
      const notificationOptions: NotificationOptions = {
        body: data.text || 'Tienes un mensaje nuevo en el chat',
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'message-notification', // Para no duplicar notificaciones
        requireInteraction: false,
        silent: false, // Permitir sonido del sistema
        renotify: true, // Notificar de nuevo con el mismo tag
        data: {
          url: '/',
          messageId: data.messageId || Date.now().toString(),
          timestamp: Date.now()
        }
      };
      
      const notification = new Notification(notificationTitle, notificationOptions);
      
      notification.onclick = () => {
        console.log('🔔 Notificación clickeada');
        window.focus();
        notification.close();
        
        // Limpiar badge
        if ('clearAppBadge' in navigator) {
          (navigator as any).clearAppBadge();
        }
      };
      
      notification.onclose = () => {
        console.log('🔕 Notificación cerrada');
      };
      
      notification.onerror = (error) => {
        console.error('❌ Error en notificación:', error);
      };
      
      console.log('✅ Notificación del sistema mostrada');
      
      // Auto-cerrar después de 10 segundos
      setTimeout(() => {
        notification.close();
      }, 10000);
      
    } catch (error) {
      console.error('❌ Error mostrando notificación:', error);
    }
  }
  
  function updateBadge() {
    // Badge API (solo en PWA instaladas)
    if ('setAppBadge' in navigator) {
      try {
        (navigator as any).setAppBadge(1);
        console.log('✅ Badge actualizado');
      } catch (error) {
        console.error('❌ Error actualizando badge:', error);
      }
    }
  }
  
  function dismissPrompt() {
    setShowPrompt(false);
    // No volver a mostrar por 24 horas
    localStorage.setItem('notification-prompt-dismissed', Date.now().toString());
  }
  
  return (
    <>
      {/* Audio oculto para notificación */}
      <audio 
        ref={audioRef} 
        src="/notification.mp3" 
        preload="auto"
        style={{ display: 'none' }}
      />
      
      {/* Prompt para activar notificaciones */}
      {showPrompt && permission === 'default' && (
        <div className="fixed bottom-20 right-4 left-4 md:left-auto md:w-80 z-[9999] bg-gradient-to-r from-amber-600 to-orange-600 text-white p-4 rounded-xl shadow-2xl animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="text-3xl">🔔</div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">Activar Notificaciones</h3>
              <p className="text-sm text-white/90 mb-3">
                Recibe alertas cuando lleguen mensajes nuevos
              </p>
              <div className="flex gap-2">
                <button
                  onClick={requestPermission}
                  className="flex-1 bg-white text-amber-600 font-bold py-2 px-4 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Activar
                </button>
                <button
                  onClick={dismissPrompt}
                  className="px-4 py-2 text-white/80 hover:text-white transition-colors"
                >
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Indicador de estado de notificaciones (solo en desarrollo) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 left-4 z-[9999] bg-black/80 text-white text-xs px-3 py-2 rounded-lg">
          🔔 {permission === 'granted' ? 'ON' : permission === 'denied' ? 'BLOQUEADO' : 'OFF'}
        </div>
      )}
      
      {/* Estilos para animaciones */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
