"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // ← Usar las exportaciones de firebase.ts

interface UserData {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isAdmin: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signOut: async () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Configurar persistencia
    setPersistence(auth, browserLocalPersistence);

    // Escuchar cambios de autenticación
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Obtener datos adicionales del usuario desde Firestore
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: data.name || data.displayName || 'Usuario',
              role: data.role || 'user',
              isAdmin: data.isAdmin === true || data.role === 'admin',
              createdAt: data.createdAt || new Date().toISOString(),
            });
          } else {
            // Usuario no tiene documento en Firestore
            setUserData({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: 'Usuario',
              role: 'user',
              isAdmin: false,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('Error obteniendo datos del usuario:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserData(null);
    } catch (error) {
      console.error('Error en logout:', error);
      throw error;
    }
  };

  const value = {
    user,
    userData,
    loading,
    signOut,
    isAdmin: userData?.isAdmin || false,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
