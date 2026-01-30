'use client';

import React, { useEffect } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import NotificationSystem from '@/components/NotificationSystem';

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-jetbrains' });

// ⚠️ NOTA: metadata no puede estar en 'use client', moverlo a un layout.tsx separado si es necesario
// Por ahora, las meta tags están en el <head> manual abajo

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  
  useEffect(() => {
    // ==================== REGISTRO DE SERVICE WORKER ====================
    if ('serviceWorker' in navigator) {
      console.log('🔧 Registrando Service Worker...');
      
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
        })
        .then((registration) => {
          console.log('✅ Service Worker registrado correctamente');
          console.log('📍 Scope:', registration.scope);
          
          // Verificar actualizaciones cada 60 segundos
          setInterval(() => {
            registration.update();
          }, 60000);
          
          // Detectar cuando hay una nueva versión
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('🆕 Nueva versión del Service Worker encontrada');
            
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('✨ Nueva versión disponible');
                  
                  // Notificar al usuario que hay una actualización
                  if (confirm('🆕 Nueva versión disponible. ¿Recargar ahora?')) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('❌ Error registrando Service Worker:', error);
        });
      
      // Detectar cuando el Service Worker toma control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker actualizado, recargando página...');
        window.location.reload();
      });
    } else {
      console.log('⚠️ Service Workers no soportados en este navegador');
    }
    
    // ==================== DETECTAR INSTALACIÓN DE PWA ====================
    let deferredPrompt: any;
    
    const handleBeforeInstall = (e: Event) => {
      console.log('📱 PWA puede ser instalada');
      e.preventDefault();
      deferredPrompt = e;
    };
    
    const handleAppInstalled = () => {
      console.log('✅ PWA instalada correctamente');
      deferredPrompt = null;
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    // ==================== DETECTAR MODO PWA ====================
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone ||
                  document.referrer.includes('android-app://');
    
    if (isPWA) {
      console.log('📱 App ejecutándose como PWA');
      window.scrollTo(0, 1); // Ocultar URL bar en móviles
    } else {
      console.log('🌐 App ejecutándose en navegador');
    }
    
    // ==================== DETECTAR ONLINE/OFFLINE ====================
    const handleOnline = () => {
      console.log('✅ Conexión restaurada');
    };
    
    const handleOffline = () => {
      console.log('❌ Sin conexión');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // ==================== CLEANUP ====================
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return (
    <html lang="es" className="dark">
      <head>
        {/* Metadata básica */}
        <title>Megapersonals Premium - Panel de Control</title>
        <meta name="description" content="Sistema avanzado de gestión de cuentas y servicios premium" />
        <meta name="generator" content="v0.app" />
        
        {/* Viewport */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#d97706" />
        
        {/* Apple iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MP Chat" />
        
        {/* Icons */}
        <link rel="icon" href="/icon-light-32x32.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/icon-dark-32x32.png" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        
        {/* PWA Icons */}
        <link rel="icon" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" sizes="512x512" href="/icon-512.png" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}>
        {/* Sistema de Notificaciones */}
        <NotificationSystem />
        
        {/* Contenido principal */}
        {children}
        
        {/* Analytics de Vercel */}
        <Analytics />
      </body>
    </html>
  );
}
