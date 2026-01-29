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
    
    // Detectar visibilidad de la pestaña
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Exponer función global
    if (typeof window !== 'undefined') {
      (window as any).notifyUser = handleNotification;
      console.log('✅ notifyUser registrado globalmente');
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (typeof window !== 'undefined') {
        delete (window as any).notifyUser;
      }
    };
  }, []);
  
  function checkPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }
  
  function handleNotification(data: { text?: string; from?: string; messageId?: string }) {
    console.log('🔔 Notificación recibida:', data);
    
    // 1. SONIDO
    playSound();
    
    // 2. VIBRACIÓN
    vibrate();
    
    // 3. TÍTULO PARPADEANTE
    flashTitle(data.text || 'Nuevo mensaje');
    
    // 4. BADGE
    updateBadge();
  }
  
  function playSound() {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 1.0;
      audioRef.current.play()
        .then(() => {
          console.log('✅ Sonido reproducido');
        })
        .catch((error) => {
          console.log('⚠️ Audio bloqueado:', error.message);
          // Intentar beep como alternativa
          generateBeep();
        });
    } else {
      generateBeep();
    }
  }
  
  function generateBeep() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      // Tres beeps cortos
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.frequency.value = 800;
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        gain.gain.value = 0.3;
        
        const startTime = ctx.currentTime + (i * 0.15);
        osc.start(startTime);
        osc.stop(startTime + 0.1);
      }
      
      console.log('🔊 Beep generado');
    } catch (error) {
      console.error('❌ Error generando beep:', error);
    }
  }
  
  function vibrate() {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
      console.log('📳 Vibración activada');
    }
  }
  
  function flashTitle(message: string) {
    const originalTitle = document.title;
    let flashCount = 0;
    
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
    }
    
    titleIntervalRef.current = setInterval(() => {
      if (flashCount < 10) {
        document.title = flashCount % 2 === 0 ? `💬 ${message}` : originalTitle;
        flashCount++;
      } else {
        document.title = originalTitle;
        if (titleIntervalRef.current) {
          clearInterval(titleIntervalRef.current);
        }
      }
    }, 1000);
  }
  
  function updateBadge() {
    if ('setAppBadge' in navigator) {
      (navigator as any).setAppBadge(1).catch(() => {
        console.log('⚠️ Badge no soportado');
      });
    }
  }
  
  return (
    <>
      {/* Elemento de audio oculto */}
      <audio
        ref={audioRef}
        src="/notification.mp3"
        preload="auto"
        style={{ display: 'none' }}
      />
    </>
  );
}
