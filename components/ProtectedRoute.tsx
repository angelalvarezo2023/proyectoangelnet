// Componente para proteger rutas
// Ubicación: components/ProtectedRoute.tsx

"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  redirectTo?: string;
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false,
  redirectTo = '/'
}: ProtectedRouteProps) {
  const { user, userData, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (!loading) {
      // Si no hay usuario, redirigir
      if (!user) {
        window.location.href = redirectTo;
        return;
      }

      // Si requiere admin pero no es admin, redirigir
      if (requireAdmin && !isAdmin) {
        window.location.href = redirectTo;
        return;
      }
    }
  }, [user, userData, loading, isAdmin, requireAdmin, redirectTo]);

  // Mostrar loading mientras verifica
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // Si no hay usuario, no mostrar nada (se redirige arriba)
  if (!user) {
    return null;
  }

  // Si requiere admin pero no es admin, no mostrar nada (se redirige arriba)
  if (requireAdmin && !isAdmin) {
    return null;
  }

  // Si todo está OK, mostrar el contenido
  return <>{children}</>;
}
