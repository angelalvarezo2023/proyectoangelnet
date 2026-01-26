// Contexto de Autenticación con Firebase
// Ubicación: contexts/AuthContext.tsx

"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  getAuth,
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';

// Configuración de Firebase (copia la misma que tienes en firebase.ts)
const firebaseConfig = {
  apiKey: "AIzaSyC9Ot5UY3gDdq2Jrj0CjqUqg9KLUPnUBbc",
  authDomain: "proyectoangel-f745d.firebaseapp.com",
  projectId: "proyectoangel-f745d",
  storageBucket: "proyectoangel-f745d.firebasestorage.app",
  messagingSenderId: "419050686069",
  appId: "1:419050686069:web:bce71b37a32e17a0b4f76f",
  measurementId: "G-FQ86YN58SR"
};

// Inicializar Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signIn: async () => {},
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
              isAdmin: data.role === 'admin',
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

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Error en login:', error);
      throw new Error(getErrorMessage(error.code));
    }
  };

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
    signIn,
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

// Mensajes de error en español
function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Email inválido';
    case 'auth/user-disabled':
      return 'Usuario deshabilitado';
    case 'auth/user-not-found':
      return 'Usuario no encontrado';
    case 'auth/wrong-password':
      return 'Contraseña incorrecta';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Intenta más tarde';
    case 'auth/network-request-failed':
      return 'Error de red. Verifica tu conexión';
    default:
      return 'Error de autenticación';
  }
}
