'use client';

import { useEffect, useRef, useState } from 'react';

export default function NotificationSystem() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [audioEnabled, setAudioEnabled] = useState(false); // 🔊 Control de audio para iOS
  const [showPrompt, setShowPrompt] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isChromeiOS, setIsChromeiOS] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Detectar Chrome iOS
    const chromeiOS = /CriOS/i.test(navigator.userAgent);
    setIsChromeiOS(chromeiOS);
    
    // Verificar permiso actual
    checkPermission();
    
    // 🔊 DESBLOQUEAR AUDIO CONTEXT al cargar
    const unlockAudio = async () => {
      try {
        // Crear audio context
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext && !audioContextRef.current) {
          audioContextRef.current = new AudioContext();
          
          // Intentar reproducir un sonido silencioso para desbloquear
          const oscillator = audioContextRef.current.createOscillator();
          const gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = 0.001; // Muy bajo, casi silencioso
          oscillator.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          oscillator.start(0);
          oscillator.stop(0.01);
          
          console.log('🔓 Audio context desbloqueado');
          setAudioUnlocked(true);
        }
        
        // También intentar cargar el audio
        if (audioRef.current) {
          audioRef.current.load();
          // Intentar play y pause inmediato
          const playPromise = audioRef.current.play();
          if (playPromise) {
            playPromise.then(() => {
              audioRef.current?.pause();
              audioRef.current!.currentTime = 0;
              console.log('🔓 Audio file desbloqueado');
            }).catch(() => {
              console.log('⚠️ Audio aún bloqueado, esperando interacción');
            });
          }
        }
      } catch (error) {
        console.log('⚠️ No se pudo desbloquear audio automáticamente');
      }
    };
    
    unlockAudio();
    
    // Listener para primera interacción del usuario
    const handleFirstInteraction = () => {
      unlockAudio();
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };
    
    document.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    document.addEventListener('click', handleFirstInteraction);
    
    return () => {
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };
    
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
      // Detectar si realmente es Chrome iOS
      const isChromeiOS = /CriOS/i.test(navigator.userAgent);
      
      if (isChromeiOS) {
        alert('⚠️ Chrome iOS no soporta notificaciones.\n\nPor favor, abre esta app en Safari para recibir notificaciones.');
      } else {
        alert('⚠️ Tu navegador no soporta notificaciones.');
      }
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
    console.log('🔔 handleNotification llamado:', data);
    console.log('   - isVisible:', isVisible);
    console.log('   - permission:', permission);
    
    // 🔔 LOG VISUAL: Notificación recibida
    if (typeof window !== 'undefined') {
      const logDiv = document.createElement('div');
      logDiv.style.cssText = `
        position: fixed;
        top: 250px;
        left: 10px;
        right: 10px;
        background: linear-gradient(135deg, #8B5CF6, #6D28D9);
        color: white;
        padding: 16px;
        border-radius: 12px;
        z-index: 999999;
        font-size: 13px;
        font-weight: bold;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;
      logDiv.innerHTML = `
        <div style="font-size: 16px; margin-bottom: 8px;">📱 NotificationSystem recibió:</div>
        <div style="font-size: 12px; opacity: 0.9;">De: ${data.from}</div>
        <div style="font-size: 12px; opacity: 0.9;">Texto: ${data.text?.substring(0, 30)}</div>
        <div style="font-size: 12px; opacity: 0.9;">isVisible: ${isVisible}</div>
        <div style="font-size: 12px; opacity: 0.9;">permission: ${permission}</div>
      `;
      document.body.appendChild(logDiv);
      setTimeout(() => logDiv.remove(), 5000);
    }
    
    // ✅ NOTIFICAR SIEMPRE (incluso si la app está visible)
    // Las notificaciones ayudan cuando hay múltiples conversaciones
    
    console.log('🔊 1. Reproduciendo sonido...');
    
    // 🔔 LOG VISUAL: Intentando sonido
    if (typeof window !== 'undefined') {
      const soundDiv = document.createElement('div');
      soundDiv.style.cssText = `
        position: fixed;
        top: 350px;
        left: 10px;
        right: 10px;
        background: linear-gradient(135deg, #3B82F6, #1D4ED8);
        color: white;
        padding: 12px;
        border-radius: 12px;
        z-index: 999999;
        font-size: 13px;
        font-weight: bold;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;
      soundDiv.innerHTML = `<div>🔊 Intentando reproducir sonido...</div>`;
      document.body.appendChild(soundDiv);
      setTimeout(() => soundDiv.remove(), 3000);
    }
    
    playSound();
    
    console.log('📳 2. Activando vibración...');
    vibrate();
    
    console.log('💫 3. Iniciando título parpadeante...');
    flashTitle(data.text || 'Nuevo mensaje');
    
    // 4. NOTIFICACIÓN DEL SISTEMA (solo si tiene permiso)
    if (permission === 'granted') {
      console.log('📬 4. Mostrando notificación del sistema...');
      showNotification(data);
    } else {
      console.log('⚠️ 4. Sin permiso para notificaciones (permission:', permission, ')');
      console.log('   Mostrando prompt para solicitar permiso...');
      setShowPrompt(true);
    }
    
    console.log('🎖️ 5. Actualizando badge...');
    updateBadge();
    
    console.log('✅ handleNotification COMPLETADO');
    
    // 🔔 LOG VISUAL: Completado
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const doneDiv = document.createElement('div');
        doneDiv.style.cssText = `
          position: fixed;
          top: 420px;
          left: 10px;
          right: 10px;
          background: linear-gradient(135deg, #10B981, #059669);
          color: white;
          padding: 12px;
          border-radius: 12px;
          z-index: 999999;
          font-size: 13px;
          font-weight: bold;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;
        doneDiv.innerHTML = `<div>✅ NotificationSystem completado</div>`;
        document.body.appendChild(doneDiv);
        setTimeout(() => doneDiv.remove(), 3000);
      }, 100);
    }
  }
  
  function playSound() {
    // 🔊 Verificar si el audio ha sido habilitado (necesario para iOS)
    if (!audioEnabled) {
      console.log('⚠️ Audio no habilitado todavía (iOS requiere interacción del usuario)');
      return;
    }
    
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
  
  // 🔊 Función para ACTIVAR el audio (requiere interacción del usuario en iOS)
  function enableAudio() {
    try {
      // Reproducir el audio una vez para "desbloquearlo"
      if (audioRef.current) {
        audioRef.current.volume = 0.01; // Casi mudo
        audioRef.current.play()
          .then(() => {
            audioRef.current!.pause();
            audioRef.current!.currentTime = 0;
            audioRef.current!.volume = 1.0;
            setAudioEnabled(true);
            console.log('✅ Audio habilitado correctamente para iOS');
            
            // Mostrar confirmación visual
            alert('✅ Audio activado!\n\nAhora recibirás sonidos cuando lleguen mensajes.');
          })
          .catch((error) => {
            console.error('❌ Error activando audio:', error);
            alert('❌ No se pudo activar el audio.\n\nIntenta de nuevo.');
          });
      }
    } catch (error) {
      console.error('❌ Error en enableAudio:', error);
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
      
      {/* 🔊 BOTÓN PARA ACTIVAR AUDIO (iOS requiere interacción del usuario) */}
      {!audioEnabled && (
        <div 
          className="fixed top-20 right-4 left-4 md:left-auto md:w-96 z-[99999]"
          style={{
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: 'white',
            padding: '20px',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 2px rgba(245,158,11,0.3)',
            animation: 'pulse 2s infinite'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
            <div style={{ fontSize: '32px' }}>🔊</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                ⚠️ Audio Bloqueado
              </h3>
              <p style={{ fontSize: '14px', marginBottom: '16px', opacity: 0.95 }}>
                iOS bloquea sonidos automáticos. Toca el botón para activar las notificaciones de audio.
              </p>
              <button
                onClick={enableAudio}
                style={{
                  width: '100%',
                  backgroundColor: 'white',
                  color: '#D97706',
                  fontWeight: 'bold',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                🔊 ACTIVAR AUDIO
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Prompt para activar notificaciones */}
      {showPrompt && permission === 'default' && !isChromeiOS && (
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
      
      {/* Banner de advertencia para Chrome iOS */}
      {isChromeiOS && (
        <div className="fixed bottom-20 right-4 left-4 md:left-auto md:w-80 z-[9999] bg-red-600 text-white p-4 rounded-xl shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <h3 className="font-bold mb-1">Chrome iOS no soporta notificaciones</h3>
              <p className="text-sm text-white/90 mb-2">
                Para recibir notificaciones, abre esta app en Safari
              </p>
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
