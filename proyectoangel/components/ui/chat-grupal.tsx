"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";

type UserRole = "escort" | "telefonista" | "admin";
type EscortStatus = "disponible" | "ocupada";
type ThemeName = "scarface" | "elpatron";

// Componente de reproductor de audio estilo WhatsApp moderno
const AudioPlayer = ({ audioUrl }: { audioUrl: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audio.currentTime = percentage * duration;
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Generar forma de onda visual (simulada)
  const waveformBars = Array.from({ length: 40 }, (_, i) => {
    const height = Math.sin(i * 0.5) * 20 + 25;
    const isActive = (i / 40) * 100 < progress;
    return (
      <div
        key={i}
        className={cn(
          "w-1 rounded-full transition-all duration-150",
          isActive ? "bg-white" : "bg-white/30"
        )}
        style={{ height: `${height}%` }}
      />
    );
  });

  return (
    <div 
      className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl border border-green-500/30"
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      {/* Botón Play/Pausa circular verde WhatsApp */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 flex items-center justify-center shadow-lg transition-all active:scale-95"
      >
        {isPlaying ? (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Área de forma de onda y progreso */}
      <div className="flex-1 flex flex-col gap-1">
        {/* Forma de onda */}
        <div className="flex items-center justify-between h-8 gap-0.5">
          {waveformBars}
        </div>
        
        {/* Barra de progreso clickeable */}
        <div
          className="h-1 bg-white/20 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tiempo */}
      <div className="flex-shrink-0 text-xs font-medium text-white/90 min-w-[35px] text-right">
        {formatTime(duration - currentTime)}
      </div>
    </div>
  );
};

interface ChatTheme {
  name: string;
  icon: string;
  bgImage: string;
  primary: string;
  secondary: string;
  text: string;
  accent: string;
  cardBg: string;
}

// 🎬 TEMAS CON IMÁGENES LOCALES
const THEMES: Record<ThemeName, ChatTheme> = {
  scarface: {
    name: "SCARFACE",
    icon: "🎬",
    bgImage: "/temas/scarface.png",
    primary: "from-amber-600 to-yellow-700",
    secondary: "from-gray-900 to-black",
    text: "text-amber-400",
    accent: "bg-amber-500",
    cardBg: "bg-black/85",
  },
  elpatron: {
    name: "EL PATRÓN",
    icon: "💎",
    bgImage: "/temas/elpatron.png",
    primary: "from-yellow-500 to-amber-600",
    secondary: "from-orange-600 to-red-700",
    text: "text-yellow-400",
    accent: "bg-yellow-500",
    cardBg: "bg-black/90",
  },
};

interface Message {
  id: string;
  text: string;
  sender: string;
  senderId: string;
  senderRole?: UserRole;
  timestamp: number;
  isSystem: boolean;
  isClientCode?: boolean;
  clientCode?: string;
  isWarning?: boolean;
  isPrivate?: boolean;
  recipientId?: string;
  replyTo?: {
    messageId: string;
    text: string;
    sender: string;
  };
  mediaUrl?: string;
  mediaType?: "photo" | "audio";
}

interface Participant {
  id: string;
  name: string;
  role: UserRole;
  joinedAt: number;
  lastActive: number;
  violations: number;
  clientsSent: number;
  lastClientTime?: number;
  rating?: number;
  totalRatings?: number;
  badges?: string[];
}

interface PeriodSettings {
  type: "daily" | "weekly" | "monthly";
  startDate: number;
  clientsAttended: number;
}

interface ClientRecord {
  id: string;
  code: string;
  status: "paid" | "left";
  timestamp: number;
  handledBy: string; // Nombre de la escort
  handlerId: string; // ID de la escort
  // Para clientes que pagaron
  amount?: number;
  // Para clientes que se fueron
  reason?: string;
  customReason?: string;
}

interface RoomSettings {
  maxEscorts: number;
  maxTelefonistas: number;
  prices: number[];
  turnsEnabled: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  theme: ThemeName;
  period?: PeriodSettings;
  clientHistory?: Record<string, ClientRecord>; // 🆕 Historial de clientes
}

interface RoomData {
  messages: Record<string, Message>;
  participants: Record<string, Participant>;
  escortStatus: EscortStatus;
  waitingClients: string[];
  settings: RoomSettings;
  createdAt: number;
  creatorId: string;
  lastActivity: number; // ✅ Nuevo campo para detectar salas inactivas
}

const FIREBASE_URL = "https://megapersonals-4f24c-default-rtdb.firebaseio.com";

const QUICK_MESSAGES = {
  telefonista: ["Cliente abajo", "Cliente llegando en 5 min", "Cliente esperando", "Cliente canceló"],
  escort: ["En camino", "Ya estoy lista", "Dame 5 minutos"],
};

const BADGES = {
  gold: { name: "Oro", icon: "🥇", requirement: 100 },
  silver: { name: "Plata", icon: "🥈", requirement: 50 },
  bronze: { name: "Bronce", icon: "🥉", requirement: 25 },
};

const detectProhibitedContent = (text: string): { isProhibited: boolean; reason: string } => {
  const lowerText = text.toLowerCase();
  const cleanText = text.replace(/[\s\-_.()]/g, "");
  const phonePatterns = [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, /\b\d{10,11}\b/g, /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g, /\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3}[-.\s]?\d{4}/g];
  for (const pattern of phonePatterns) { if (pattern.test(text)) return { isProhibited: true, reason: "números de teléfono" }; }
  const urlPatterns = [/https?:\/\//gi, /www\./gi, /\b\w+\.(com|net|org|edu|gov|io|co|me|info)\b/gi];
  for (const pattern of urlPatterns) { if (pattern.test(text)) return { isProhibited: true, reason: "links o URLs" }; }
  const socialPatterns = [/\bwhatsapp\b|\bwpp\b/gi, /\binstagram\b|\binsta\b/gi, /\bfacebook\b|\bface\b/gi, /\btelegram\b/gi];
  for (const pattern of socialPatterns) { if (pattern.test(lowerText)) return { isProhibited: true, reason: "redes sociales" }; }
  const longNumbers = cleanText.match(/\d{7,}/g);
  if (longNumbers) return { isProhibited: true, reason: "números de teléfono" };
  return { isProhibited: false, reason: "" };
};

export function ChatGrupal() {
  const [step, setStep] = useState<"room-select" | "join" | "chat">("room-select");
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("telefonista");
  const [isCreator, setIsCreator] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [escortStatus, setEscortStatus] = useState<EscortStatus>("disponible");
  const [waitingClients, setWaitingClients] = useState<string[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [processingClient, setProcessingClient] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>("scarface");
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    maxEscorts: 1,
    maxTelefonistas: 10,
    prices: [100, 150, 200],
    turnsEnabled: false,
    soundEnabled: true,
    notificationsEnabled: true,
    theme: "scarface",
  });
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [periodSettings, setPeriodSettings] = useState<PeriodSettings>({
    type: "weekly",
    startDate: Date.now(),
    clientsAttended: 0
  });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedTelefonistaToRate, setSelectedTelefonistaToRate] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [selectedClientForPrice, setSelectedClientForPrice] = useState<string | null>(null);
  const [clientAttentionStep, setClientAttentionStep] = useState<"status" | "paid" | "left">("status");
  const [customAmount, setCustomAmount] = useState("");
  const [leftReason, setLeftReason] = useState("");
  const [customLeftReason, setCustomLeftReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  // Estados para fotos y audio
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement | null>(null);
  const touchStartYRef = useRef<number>(0);
  const touchStartXRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const [audioSending, setAudioSending] = useState(false);
  
  const [myViolations, setMyViolations] = useState(0);
  const [myClientsSent, setMyClientsSent] = useState(0);
  const [myBadges, setMyBadges] = useState<string[]>([]);
  const [showPrivateChat, setShowPrivateChat] = useState(false);
  const [privateChatRecipient, setPrivateChatRecipient] = useState<string | null>(null);
  const [privateMessage, setPrivateMessage] = useState("");
  const [editingSettings, setEditingSettings] = useState({
    maxEscorts: "1",
    maxTelefonistas: "10",
    prices: ["100", "150", "200"],
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldAutoScroll = useRef<boolean>(true);
  const previousMessageCount = useRef<number>(0);
  const lastNotificationTimeRef = useRef<number>(Date.now()); // 🔔 Timestamp del último mensaje notificado

  const currentTheme = THEMES[selectedTheme];

  // ✅ FUNCIONES DE PERÍODO (movidas DENTRO del componente)
  const getDaysRemaining = () => {
    const now = Date.now();
    const start = periodSettings.startDate;
    const dayInMs = 24 * 60 * 60 * 1000;
    
    let endDate;
    if (periodSettings.type === "daily") {
      endDate = start + dayInMs;
    } else if (periodSettings.type === "weekly") {
      endDate = start + (7 * dayInMs);
    } else {
      endDate = start + (30 * dayInMs);
    }
    
    const remaining = Math.ceil((endDate - now) / dayInMs);
    return remaining > 0 ? remaining : 0;
  };

  const getPeriodLabel = () => {
    if (periodSettings.type === "daily") return "Día";
    if (periodSettings.type === "weekly") return "Semana";
    return "Mes";
  };

  const resetPeriod = async () => {
    if (!confirm("¿Resetear contador? Esto pondrá todo en 0.")) return;
    
    const newPeriod: PeriodSettings = {
      ...periodSettings,
      startDate: Date.now(),
      clientsAttended: 0
    };
    
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/period.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPeriod),
      });
      setPeriodSettings(newPeriod);
      alert("Contador reseteado!");
    } catch (error) {
      console.error("Error resetting period:", error);
    }
  };

  const changePeriodType = async (type: "daily" | "weekly" | "monthly") => {
    const newPeriod: PeriodSettings = {
      type,
      startDate: Date.now(),
      clientsAttended: 0
    };
    
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/period.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPeriod),
      });
      setPeriodSettings(newPeriod);
      setShowPeriodConfig(false);
      alert("Período actualizado!");
    } catch (error) {
      console.error("Error updating period:", error);
    }
  };

  // ✅ SCROLL ARREGLADO - Solo baja cuando REALMENTE llegan mensajes nuevos
  const scrollToBottom = (force: boolean = false) => {
    if (!messagesEndRef.current) return;
    
    // Solo hacer scroll si se fuerza O si shouldAutoScroll está activado
    if (force || shouldAutoScroll.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Detectar si el usuario está al final del chat
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // Si está a menos de 150px del final, activar auto-scroll
      shouldAutoScroll.current = distanceFromBottom < 150;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ✅ CRÍTICO: Solo hacer scroll cuando REALMENTE llegan mensajes NUEVOS
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = previousMessageCount.current;
    
    // Solo hacer scroll si aumentó el número de mensajes
    if (currentCount > previousCount && previousCount > 0) {
      scrollToBottom(false);
    }
    
    // Actualizar el contador
    previousMessageCount.current = currentCount;
  }, [messages.length]); // ✅ Depende solo de la CANTIDAD, no del array completo

  useEffect(() => {
    if (step === "chat") {
      localStorage.setItem("chatSession", JSON.stringify({ roomCode, userName, userRole, currentUserId, isCreator, timestamp: Date.now() }));
    }
  }, [step, roomCode, userName, userRole, currentUserId, isCreator]);

  useEffect(() => {
    const savedSession = localStorage.getItem("chatSession");
    if (savedSession) {
      const session = JSON.parse(savedSession);
      const isOld = Date.now() - session.timestamp > 24 * 60 * 60 * 1000;
      if (!isOld) {
        setRoomCode(session.roomCode);
        setUserName(session.userName);
        setUserRole(session.userRole);
        setCurrentUserId(session.currentUserId);
        setIsCreator(session.isCreator);
        setStep("chat");
      } else {
        localStorage.removeItem("chatSession");
      }
    }
  }, []);

  const playNotification = () => {
    if (!roomSettings.soundEnabled) return;
    const beep = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 1000;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        console.error("Error playing beep:", e);
      }
    };
    beep();
    setTimeout(beep, 250);
    setTimeout(beep, 500);
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    if (roomSettings.notificationsEnabled && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        const notification = new Notification("🔔 NUEVO CLIENTE ABAJO", {
          body: "Un telefonista ha enviado un cliente",
          requireInteraction: true,
          vibrate: [300, 100, 300],
        });
        setTimeout(() => notification.close(), 10000);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  };

  useEffect(() => {
    if (step !== "chat" || !roomCode || !currentUserId) return;
    const updateHeartbeat = async () => {
      try {
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/lastActive.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Date.now()),
        });
      } catch (error) {
        console.error("Error updating heartbeat:", error);
      }
    };
    updateHeartbeat();
    heartbeatIntervalRef.current = setInterval(updateHeartbeat, 5000);
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [step, roomCode, currentUserId]);

  useEffect(() => {
    if (step !== "chat" || !roomCode) return;
    const syncChat = async () => {
      try {
        const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`);
        const data: RoomData | null = await response.json();
        
        // ✅ SI LA SALA NO EXISTE (fue cerrada por el admin)
        if (!data) {
          alert("🚪 La sala ha sido cerrada por el administrador.");
          localStorage.removeItem("chatSession");
          setStep("room-select");
          setRoomCode("");
          setUserName("");
          setMessages([]);
          setParticipants([]);
          return;
        }
        
        if (data) {
          // ✅ ACTUALIZAR lastActivity - la sala está siendo usada
          await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/lastActivity.json`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Date.now()),
          });
          
          // ✅ Obtener mensajes de Firebase
          const firebaseMessages = data.messages 
            ? Object.values(data.messages)
            : [];
          
          console.log("🔄 Sincronización - Firebase tiene", firebaseMessages.length, "mensajes");
          console.log("🔄 Sincronización - Local tiene", messages.length, "mensajes");
          
          // ✅ FUSIÓN INTELIGENTE: Combinar Firebase + locales sin perder nada
          setMessages(prev => {
            // Crear mapa de mensajes de Firebase por ID
            const firebaseMap = new Map(firebaseMessages.map(m => [m.id, m]));
            
            // Crear mapa de mensajes locales por ID
            const localMap = new Map(prev.map(m => [m.id, m]));
            
            // Combinar: usar Firebase si existe, sino mantener local
            const combinedMap = new Map();
            
            // Agregar todos los mensajes de Firebase (son la fuente de verdad)
            firebaseMessages.forEach(msg => {
              combinedMap.set(msg.id, msg);
            });
            
            // Agregar mensajes locales que aún no están en Firebase (recién enviados)
            prev.forEach(msg => {
              if (!firebaseMap.has(msg.id)) {
                console.log("⚠️ Mensaje local no en Firebase aún:", msg.text, new Date(msg.timestamp).toLocaleTimeString());
                combinedMap.set(msg.id, msg);
              }
            });
            
            // Convertir a array y ordenar por timestamp
            const combined = Array.from(combinedMap.values());
            combined.sort((a, b) => {
              const timeA = a.timestamp || 0;
              const timeB = b.timestamp || 0;
              return timeA - timeB;
            });
            
            console.log("✅ Después de fusión:", combined.length, "mensajes");
            console.log("📊 Últimos 3 mensajes:", combined.slice(-3).map(m => ({
              sender: m.sender,
              text: m.text.substring(0, 20),
              time: new Date(m.timestamp).toLocaleTimeString()
            })));
            
            return combined;
          });
          
          // ⬇️⬇️⬇️ 🔔 CÓDIGO DE NOTIFICACIONES AGREGADO ⬇️⬇️⬇️
          
          // 🔍 LOGS DE DEPURACIÓN DETALLADOS
          console.log('=====================================');
          console.log('📊 DIAGNÓSTICO DE NOTIFICACIONES:');
          console.log('- Total mensajes Firebase:', firebaseMessages.length);
          console.log('- Usuario actual:', currentUserId);
          console.log('- notifyUser existe?', typeof (window as any).notifyUser);
          console.log('- Último timestamp notificado:', new Date(lastNotificationTimeRef.current).toLocaleTimeString());
          
          // Mostrar últimos 3 mensajes para diagnóstico
          console.log('📝 Últimos 3 mensajes:');
          firebaseMessages.slice(-3).forEach((msg, idx) => {
            console.log(`  ${idx + 1}. ${msg.sender} (${msg.senderId.slice(-6)}): ${msg.text?.substring(0, 30)}`);
            console.log(`     Timestamp: ${new Date(msg.timestamp).toLocaleTimeString()}`);
            console.log(`     isSystem: ${msg.isSystem}, senderId: ${msg.senderId}`);
          });
          
          // ✅ ESTRATEGIA SIMPLIFICADA: Detectar por TIMESTAMP
          const now = Date.now();
          
          console.log('🔍 Filtrando mensajes...');
          const newMessages = firebaseMessages.filter(msg => {
            // Calcular antigüedad del mensaje
            const messageAge = now - msg.timestamp;
            const ageInSeconds = Math.floor(messageAge / 1000);
            
            // Condiciones
            const isNewerThanLast = msg.timestamp > lastNotificationTimeRef.current;
            const isFromOther = msg.senderId !== currentUserId;
            const isNotSystem = !msg.isSystem;
            const isRecent = messageAge < 30000; // Últimos 30 segundos
            
            console.log(`  Mensaje de ${msg.sender}:`);
            console.log(`    - Edad: ${ageInSeconds}s`);
            console.log(`    - Más nuevo que último? ${isNewerThanLast}`);
            console.log(`    - De otro usuario? ${isFromOther}`);
            console.log(`    - No es sistema? ${isNotSystem}`);
            console.log(`    - Es reciente? ${isRecent}`);
            
            const shouldNotify = isNewerThanLast && isFromOther && isNotSystem && isRecent;
            console.log(`    ➡️ ¿Notificar? ${shouldNotify}`);
            
            return shouldNotify;
          });

          console.log('🔔 TOTAL MENSAJES NUEVOS DETECTADOS:', newMessages.length);

          // Si hay mensajes nuevos, notificar
          if (newMessages.length > 0) {
            const latestNew = newMessages[newMessages.length - 1];
            
            console.log('📢 ¡NOTIFICANDO!');
            console.log('   Mensaje de:', latestNew.sender);
            console.log('   Texto:', latestNew.text);
            
            if ((window as any).notifyUser) {
              (window as any).notifyUser({
                text: latestNew.text || 'Nuevo mensaje',
                from: latestNew.sender || 'Usuario',
                messageId: latestNew.id
              });
              console.log('✅ notifyUser() EJECUTADO');
              
              // Actualizar timestamp
              lastNotificationTimeRef.current = latestNew.timestamp;
              console.log('📝 Timestamp actualizado a:', new Date(latestNew.timestamp).toLocaleTimeString());
            } else {
              console.error('❌ ERROR CRÍTICO: notifyUser no existe!');
              console.error('   Verifica que NotificationSystem esté cargado');
            }
          } else {
            console.log('⚠️ No hay mensajes nuevos que notificar');
          }
          
          console.log('=====================================');
          
          // ⬆️⬆️⬆️ FIN CÓDIGO DE NOTIFICACIONES ⬆️⬆️⬆️
          
          if (userRole === "escort" && firebaseMessages.length > messages.length) {
            const newMsg = firebaseMessages[firebaseMessages.length - 1];
            if (newMsg.isClientCode) playNotification();
          }
          
          if (data.participants) {
            const now = Date.now();
            const activeParticipants: Record<string, Participant> = {};
            let hasInactive = false;
            for (const [id, participant] of Object.entries(data.participants)) {
              // ✅ Ignorar participantes null/undefined/corruptos
              if (!participant || !participant.name || !participant.id) {
                hasInactive = true;
                continue;
              }
              
              if (now - participant.lastActive < 30000) {
                activeParticipants[id] = participant;
              } else {
                hasInactive = true;
              }
            }
            if (hasInactive) {
              await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants.json`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(activeParticipants),
              });
            }
            setParticipants(Object.values(activeParticipants));
            const myData = activeParticipants[currentUserId];
            if (myData) {
              setMyViolations(myData.violations || 0);
              setMyClientsSent(myData.clientsSent || 0);
              setMyBadges(myData.badges || []);
            }
          }
          if (data.escortStatus) setEscortStatus(data.escortStatus);
          // ✅ CRÍTICO: Siempre actualizar waitingClients, incluso si está vacío
          setWaitingClients(data.waitingClients || []);
          if (data.settings) {
            setRoomSettings(data.settings);
            setSelectedTheme(data.settings.theme);
            
            // Cargar período
            if (data.settings.period) {
              const now = Date.now();
              const start = data.settings.period.startDate;
              const dayInMs = 24 * 60 * 60 * 1000;
              let endDate;
              
              if (data.settings.period.type === "daily") {
                endDate = start + dayInMs;
              } else if (data.settings.period.type === "weekly") {
                endDate = start + (7 * dayInMs);
              } else {
                endDate = start + (30 * dayInMs);
              }
              
              const remaining = Math.ceil((endDate - now) / dayInMs);
              
              // Reset automático si llegó a 0
              if (remaining <= 0 && data.settings.period.clientsAttended > 0) {
                const newPeriod: PeriodSettings = {
                  type: data.settings.period.type,
                  startDate: Date.now(),
                  clientsAttended: 0
                };
                await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/period.json`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(newPeriod),
                });
                setPeriodSettings(newPeriod);
              } else {
                setPeriodSettings(data.settings.period);
              }
            } else {
              // Inicializar período si no existe
              const initPeriod: PeriodSettings = {
                type: "weekly",
                startDate: Date.now(),
                clientsAttended: 0
              };
              await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/period.json`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(initPeriod),
              });
              setPeriodSettings(initPeriod);
            }
          }
        }
      } catch (error) {
        console.error("Error syncing chat:", error);
      }
    };
    
    // ✅ LIMPIEZA DE SALAS INACTIVAS (solo ejecuta si es admin y cada 10 minutos)
    const cleanupInactiveRooms = async () => {
      if (userRole !== "admin") return; // Solo admin limpia
      
      try {
        const allRoomsResponse = await fetch(`${FIREBASE_URL}/chat-rooms.json`);
        const allRooms = await allRoomsResponse.json();
        
        if (!allRooms) return;
        
        const now = Date.now();
        const INACTIVITY_THRESHOLD = 24 * 60 * 60 * 1000; // 24 horas
        
        for (const [roomId, roomData] of Object.entries(allRooms)) {
          const room = roomData as RoomData;
          const lastActivity = room.lastActivity || room.createdAt || 0;
          const inactivePeriod = now - lastActivity;
          
          // Si la sala lleva más de 24 horas inactiva, eliminarla
          if (inactivePeriod > INACTIVITY_THRESHOLD && roomId !== roomCode) {
            console.log(`🗑️ Eliminando sala inactiva: ${roomId} (${Math.floor(inactivePeriod / (60 * 60 * 1000))}h de inactividad)`);
            await fetch(`${FIREBASE_URL}/chat-rooms/${roomId}.json`, {
              method: "DELETE",
            });
          }
        }
      } catch (error) {
        console.error("Error cleaning inactive rooms:", error);
      }
    };
    
    syncChat();
    syncIntervalRef.current = setInterval(syncChat, 2000);
    
    // ✅ Ejecutar limpieza cada 10 minutos
    const cleanupInterval = setInterval(cleanupInactiveRooms, 10 * 60 * 1000);
    cleanupInactiveRooms(); // Ejecutar inmediatamente también
    
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      clearInterval(cleanupInterval);
    };
  }, [step, roomCode, userRole, currentUserId]); // ✅ SIN messages.length

  useEffect(() => {
    if (step === "chat" && userRole === "escort" && typeof Notification !== "undefined") {
      if (Notification.permission === "default") Notification.requestPermission();
    }
  }, [step, userRole]);

  const changeTheme = async (newTheme: ThemeName) => {
    setSelectedTheme(newTheme);
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/theme.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTheme),
      });
    } catch (error) {
      console.error("Error changing theme:", error);
    }
  };

  const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const handleCreateRoom = () => {
    const newRoomCode = generateRoomCode();
    setRoomCode(newRoomCode);
    setIsCreator(true);
    setStep("join");
  };

  const handleJoinExistingRoom = () => {
    if (!roomCode.trim()) {
      alert("Por favor ingresa el código de la sala");
      return;
    }
    setIsCreator(false);
    setStep("join");
  };

  const handleJoin = async () => {
    if (!userName.trim()) {
      alert("Por favor ingresa tu nombre");
      return;
    }
    if (isJoining) return;
    setIsJoining(true);
    try {
      const checkResponse = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`);
      const existingRoom: RoomData | null = await checkResponse.json();
      if (existingRoom?.participants) {
        // ✅ Filtrar valores null/undefined antes de buscar
        const existingUser = Object.values(existingRoom.participants)
          .filter(p => p && p.name) // Filtrar participantes válidos
          .find(p => p.name.toLowerCase() === userName.trim().toLowerCase());
        
        if (existingUser) {
          alert("Este nombre ya está en uso. Elige otro.");
          setIsJoining(false);
          return;
        }
        if (!isCreator) {
          const currentRoles = Object.values(existingRoom.participants).filter(p => p); // Filtrar null/undefined
          const escortCount = currentRoles.filter(p => p.role === "escort").length;
          const telefonistaCount = currentRoles.filter(p => p.role === "telefonista").length;
          if (userRole === "escort" && escortCount >= existingRoom.settings.maxEscorts) {
            alert(`Máximo de escorts alcanzado (${existingRoom.settings.maxEscorts})`);
            setIsJoining(false);
            return;
          }
          if (userRole === "telefonista" && telefonistaCount >= existingRoom.settings.maxTelefonistas) {
            alert(`Máximo de telefonistas alcanzado (${existingRoom.settings.maxTelefonistas})`);
            setIsJoining(false);
            return;
          }
        }
      }
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentUserId(userId);
      const finalRole: UserRole = isCreator ? "admin" : userRole;
      const newParticipant: Participant = {
        id: userId,
        name: userName.trim(),
        role: finalRole,
        joinedAt: Date.now(),
        lastActive: Date.now(),
        violations: 0,
        clientsSent: 0,
        lastClientTime: 0,
        rating: 0,
        totalRatings: 0,
        badges: [],
      };
      const getRoleLabel = (role: UserRole) => {
        switch (role) {
          case "escort":
            return "Escort";
          case "telefonista":
            return "Telefonista";
          case "admin":
            return "Administrador";
        }
      };
      const welcomeMsg: Message = {
        id: `msg_${Date.now()}`,
        text: `${userName.trim()} se ha unido (${getRoleLabel(finalRole)})`,
        sender: "Sistema",
        senderId: "system",
        timestamp: Date.now(),
        isSystem: true,
      };
      if (!existingRoom) {
        const initialData: RoomData = {
          messages: { [welcomeMsg.id]: welcomeMsg },
          participants: { [userId]: newParticipant },
          escortStatus: "disponible",
          waitingClients: [],
          settings: {
            maxEscorts: 1,
            maxTelefonistas: 10,
            prices: [100, 150, 200],
            turnsEnabled: false,
            soundEnabled: true,
            notificationsEnabled: true,
            theme: selectedTheme,
          },
          createdAt: Date.now(),
          creatorId: userId,
          lastActivity: Date.now(), // ✅ Inicializar lastActivity
        };
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initialData),
        });
      } else {
        // ✅ Actualizar lastActivity al unirse a sala existente
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/lastActivity.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Date.now()),
        });
        
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${userId}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newParticipant),
        });
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${welcomeMsg.id}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(welcomeMsg),
        });
      }
      if (isCreator) setUserRole("admin");
      setStep("chat");
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Error al unirse a la sala. Por favor verifica:\n- Que el código de sala sea correcto\n- Que tengas conexión a internet\n- Intenta de nuevo en unos segundos");
    } finally {
      setIsJoining(false);
    }
  };

  const getTopTelefonistas = () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return participants
      .filter(p => p.role === "telefonista" && p.joinedAt > oneWeekAgo)
      .sort((a, b) => b.clientsSent - a.clientsSent)
      .slice(0, 3);
  };

  const getTimeSinceLastClient = (timestamp?: number) => {
    if (!timestamp) return "Nunca";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Ahora mismo";
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  const calculateBadges = (clientsSent: number): string[] => {
    const earnedBadges: string[] = [];
    if (clientsSent >= 100) earnedBadges.push("gold");
    else if (clientsSent >= 50) earnedBadges.push("silver");
    else if (clientsSent >= 25) earnedBadges.push("bronze");
    return earnedBadges;
  };

  const registerViolation = async (reason: string) => {
    try {
      const newViolations = myViolations + 1;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/violations.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newViolations),
      });
      setMyViolations(newViolations);
      let warningText = `⚠️ ADVERTENCIA: No está permitido enviar ${reason} en el chat.`;
      if (newViolations >= 3) {
        warningText += `\n\n🚨 Has sido advertido ${newViolations} veces. El administrador ha sido notificado.`;
        const adminAlert: Message = {
          id: `msg_${Date.now()}_alert`,
          text: `🚨 ALERTA: ${userName} ha intentado enviar ${reason} (${newViolations} infracciones)`,
          sender: "Sistema",
          senderId: "system",
          timestamp: Date.now(),
          isSystem: true,
          isWarning: true,
        };
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${adminAlert.id}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminAlert),
        });
      }
      alert(warningText);
    } catch (error) {
      console.error("Error registering violation:", error);
    }
  };

  const sendMessage = async (customText?: string) => {
    const text = customText || newMessage.trim();
    if (!text) return;
    
    const { isProhibited, reason } = detectProhibitedContent(text);
    if (isProhibited) {
      await registerViolation(reason);
      setNewMessage("");
      return;
    }
    
    // ✅ Generar timestamp confiable y asegurar que sea mayor que el último
    let timestamp = Date.now();
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && timestamp <= lastMessage.timestamp) {
      // Si el reloj está atrasado, usar el timestamp del último mensaje + 1ms
      timestamp = lastMessage.timestamp + 1;
      console.warn("⚠️ Reloj atrasado detectado. Ajustando timestamp de", Date.now(), "a", timestamp);
    }
    
    const message: Message = {
      id: `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      sender: userName,
      senderId: currentUserId,
      senderRole: userRole,
      timestamp,
      isSystem: false,
      ...(replyingTo && {
        replyTo: {
          messageId: replyingTo.id,
          text: replyingTo.text,
          sender: replyingTo.sender,
        },
      }),
    };
    
    console.log("📤 Enviando mensaje con timestamp:", new Date(timestamp).toLocaleTimeString(), "Real:", new Date(Date.now()).toLocaleTimeString());
    
    try {
      // ✅ PRIMERO guardar en Firebase
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      
      // ✅ LUEGO actualizar localmente
      setMessages(prev => {
        // Verificar si ya existe (por si acaso)
        if (prev.some(m => m.id === message.id)) {
          return prev; // Ya existe, no duplicar
        }
        return [...prev, message];
      });
      
      if (!customText) setNewMessage("");
      setReplyingTo(null);
      
      // Scroll después de actualizar mensajes
      setTimeout(() => scrollToBottom(true), 50);
    } catch (error) {
      console.error("Error sending message:", error);
      // Si falla, remover el mensaje local
      setMessages(prev => prev.filter(m => m.id !== message.id));
    }
  };

  const sendPrivateMessage = async () => {
    if (!privateMessage.trim() || !privateChatRecipient) return;
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: privateMessage.trim(),
      sender: userName,
      senderId: currentUserId,
      senderRole: userRole,
      timestamp: Date.now(),
      isSystem: false,
      isPrivate: true,
      recipientId: privateChatRecipient,
    };
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      setPrivateMessage("");
      setShowPrivateChat(false);
      alert("Mensaje privado enviado");
    } catch (error) {
      console.error("Error sending private message:", error);
    }
  };

  const sendClientCode = async () => {
    if (clientCode.length !== 4 || !/^\d{4}$/.test(clientCode)) {
      alert("El código debe ser 4 dígitos");
      return;
    }
    
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: `🔔 CLIENTE ABAJO - Terminal: ${clientCode}`,
      sender: userName,
      senderId: currentUserId,
      senderRole: userRole,
      timestamp: Date.now(),
      isSystem: false,
      isClientCode: true,
      clientCode: clientCode,
    };
    
    try {
      // ✅ CRÍTICO: Actualizar estado local INMEDIATAMENTE con ordenamiento
      setMessages(prev => [...prev, message].sort((a, b) => a.timestamp - b.timestamp));
      
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`);
      const currentWaiting = await response.json() || [];
      const updatedWaiting = [...currentWaiting, clientCode];
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedWaiting),
      });
      
      const newCount = myClientsSent + 1;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/clientsSent.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCount),
      });
      
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/lastClientTime.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Date.now()),
      });
      
      const newBadges = calculateBadges(newCount);
      if (newBadges.length > 0) {
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/badges.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBadges),
        });
      }
      
      setMyClientsSent(newCount);
      setClientCode("");
      setTimeout(() => scrollToBottom(true), 50);
    } catch (error) {
      console.error("Error sending client code:", error);
    }
  };

  const toggleEscortStatus = async () => {
    const newStatus: EscortStatus = escortStatus === "disponible" ? "ocupada" : "disponible";
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/escortStatus.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStatus),
      });
      const message: Message = {
        id: `msg_${Date.now()}`,
        text: `🚦 ${userName} ahora está ${newStatus === "ocupada" ? "OCUPADA" : "DISPONIBLE"}`,
        sender: "Sistema",
        senderId: "system",
        timestamp: Date.now(),
        isSystem: true,
      };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      setEscortStatus(newStatus);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const markClientAttended = async (code: string, price: number) => {
    if (processingClient === code) return;
    setProcessingClient(code);
    try {
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`);
      const currentWaiting = await response.json() || [];
      const updatedWaiting = currentWaiting.filter((c: string) => c !== code);
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedWaiting),
      });
      
      // ✅ Actualizar inmediatamente para quien atiende el cliente
      setWaitingClients(updatedWaiting);
      
      // Incrementar contador de período
      const newCount = periodSettings.clientsAttended + 1;
      const newPeriod = { ...periodSettings, clientsAttended: newCount };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/period.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPeriod),
      });
      setPeriodSettings(newPeriod);
      
      // 🆕 Guardar en historial
      const recordId = `record_${Date.now()}`;
      const clientRecord: ClientRecord = {
        id: recordId,
        code: code,
        status: "paid",
        timestamp: Date.now(),
        handledBy: userName,
        handlerId: currentUserId,
        amount: price,
      };
      
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/clientHistory/${recordId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientRecord),
      });
      
      const message: Message = {
        id: `msg_${Date.now()}`,
        text: `✅ Cliente ${code} atendido por ${userName} - PAGÓ $${price}`,
        sender: "Sistema",
        senderId: "system",
        timestamp: Date.now(),
        isSystem: true,
      };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      setSelectedClientForPrice(null);
      setClientAttentionStep("status");
      setCustomAmount("");
    } catch (error) {
      console.error("Error marking client:", error);
    } finally {
      setTimeout(() => setProcessingClient(null), 2000);
    }
  };

  const markClientLeft = async (code: string, reason: string, customReason?: string) => {
    if (processingClient === code) return;
    setProcessingClient(code);
    try {
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`);
      const currentWaiting = await response.json() || [];
      const updatedWaiting = currentWaiting.filter((c: string) => c !== code);
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedWaiting),
      });
      
      // ✅ Actualizar inmediatamente para quien marca al cliente
      setWaitingClients(updatedWaiting);
      
      // 🆕 Guardar en historial
      const recordId = `record_${Date.now()}`;
      const clientRecord: ClientRecord = {
        id: recordId,
        code: code,
        status: "left",
        timestamp: Date.now(),
        handledBy: userName,
        handlerId: currentUserId,
        reason: reason,
        customReason: customReason,
      };
      
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/clientHistory/${recordId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientRecord),
      });
      
      const displayReason = reason === "other" && customReason ? customReason : reason;
      const message: Message = {
        id: `msg_${Date.now()}`,
        text: `❌ Cliente ${code} SE FUE - Razón: ${displayReason} (Atendido por ${userName})`,
        sender: "Sistema",
        senderId: "system",
        timestamp: Date.now(),
        isSystem: true,
      };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      
      setSelectedClientForPrice(null);
      setClientAttentionStep("status");
      setLeftReason("");
      setCustomLeftReason("");
    } catch (error) {
      console.error("Error marking client left:", error);
    } finally {
      setTimeout(() => setProcessingClient(null), 2000);
    }
  };

  const rateTelefonista = async () => {
    if (!selectedTelefonistaToRate || rating < 1 || rating > 5) return;
    try {
      const telefonistaData = participants.find(p => p.id === selectedTelefonistaToRate);
      if (!telefonistaData) return;
      const currentRating = telefonistaData.rating || 0;
      const currentTotal = telefonistaData.totalRatings || 0;
      const newTotal = currentTotal + 1;
      const newRating = ((currentRating * currentTotal) + rating) / newTotal;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${selectedTelefonistaToRate}/rating.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRating),
      });
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${selectedTelefonistaToRate}/totalRatings.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTotal),
      });
      setShowRatingModal(false);
      setSelectedTelefonistaToRate(null);
      setRating(5);
      alert("Calificación enviada");
    } catch (error) {
      console.error("Error rating telefonista:", error);
    }
  };

  const saveSettings = async () => {
    const maxEscorts = parseInt(editingSettings.maxEscorts);
    const maxTelefonistas = parseInt(editingSettings.maxTelefonistas);
    const newPrices = editingSettings.prices.map(p => parseInt(p)).filter(p => !isNaN(p) && p > 0);
    if (isNaN(maxEscorts) || maxEscorts < 1 || maxEscorts > 10) {
      alert("Escorts: 1-10");
      return;
    }
    if (isNaN(maxTelefonistas) || maxTelefonistas < 1 || maxTelefonistas > 20) {
      alert("Telefonistas: 1-20");
      return;
    }
    if (newPrices.length === 0) {
      alert("Configura al menos un precio");
      return;
    }
    const newSettings: RoomSettings = {
      ...roomSettings,
      maxEscorts,
      maxTelefonistas,
      prices: newPrices,
      theme: selectedTheme,
    };
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      setRoomSettings(newSettings);
      setShowSettingsModal(false);
      alert("Configuración actualizada");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Error al guardar");
    }
  };

  const handleLeaveChat = async () => {
    const confirmLeave = confirm("¿Seguro que quieres salir?");
    if (!confirmLeave) return;
    
    try {
      // ✅ SI ES ADMIN: CERRAR TODA LA SALA
      if (userRole === "admin") {
        const closeMsg: Message = {
          id: `msg_${Date.now()}`,
          text: `🚪 El administrador ha cerrado la sala. Todos han sido expulsados.`,
          sender: "Sistema",
          senderId: "system",
          timestamp: Date.now(),
          isSystem: true,
          isWarning: true,
        };
        
        // Enviar mensaje de cierre
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${closeMsg.id}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(closeMsg),
        });
        
        // Esperar 1 segundo para que todos vean el mensaje
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // ✅ ELIMINAR ARCHIVOS DE STORAGE
        await deleteRoomMedia(roomCode);
        
        // ELIMINAR TODA LA SALA
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`, {
          method: "DELETE",
        });
        
        alert("Sala cerrada. Todos los usuarios han sido expulsados.");
      } else {
        // Si NO es admin, solo sale él
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}.json`, {
          method: "DELETE",
        });
        const leaveMsg: Message = {
          id: `msg_${Date.now()}`,
          text: `${userName} ha salido del chat`,
          sender: "Sistema",
          senderId: "system",
          timestamp: Date.now(),
          isSystem: true,
        };
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${leaveMsg.id}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leaveMsg),
        });
      }
    } catch (error) {
      console.error("Error leaving chat:", error);
    }
    
    localStorage.removeItem("chatSession");
    setStep("room-select");
    setRoomCode("");
    setUserName("");
    setMessages([]);
    setParticipants([]);
  };

  // ===== FUNCIONES DE FOTOS =====
  
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Reducir tamaño si es muy grande
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1080;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = height * (MAX_WIDTH / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = width * (MAX_HEIGHT / height);
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              resolve(blob || file);
            },
            'image/jpeg',
            0.8 // Calidad 80%
          );
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelect = async (file: File) => {
    // Validar tipo
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes');
      return;
    }
    
    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es muy grande (máx 5MB)');
      return;
    }
    
    setSelectedPhoto(file);
    
    // Crear preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string);
      setShowPhotoModal(true);
    };
    reader.readAsDataURL(file);
  };

  const sendPhoto = async () => {
    if (!selectedPhoto) return;
    
    setUploadingMedia(true);
    try {
      // Comprimir imagen
      const compressedBlob = await compressImage(selectedPhoto);
      
      // Crear referencia en Storage
      const storage = getStorage();
      const timestamp = Date.now();
      const filename = `photo_${timestamp}.jpg`;
      const photoRef = storageRef(storage, `chat-rooms/${roomCode}/${filename}`);
      
      // Subir a Firebase Storage
      await uploadBytes(photoRef, compressedBlob);
      
      // Obtener URL pública
      const photoURL = await getDownloadURL(photoRef);
      
      // Crear mensaje con foto
      const message: Message = {
        id: `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        text: newMessage.trim() || "",
        sender: userName,
        senderId: currentUserId,
        senderRole: userRole,
        timestamp,
        isSystem: false,
        mediaUrl: photoURL,
        mediaType: "photo",
        ...(replyingTo && {
          replyTo: {
            messageId: replyingTo.id,
            text: replyingTo.text,
            sender: replyingTo.sender,
          },
        }),
      };
      
      // ✅ CRÍTICO: Actualizar estado local INMEDIATAMENTE con ordenamiento
      setMessages(prev => [...prev, message].sort((a, b) => a.timestamp - b.timestamp));
      
      // Guardar mensaje en Firebase
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      
      // Limpiar
      setSelectedPhoto(null);
      setPhotoPreview(null);
      setShowPhotoModal(false);
      setNewMessage("");
      setReplyingTo(null);
      
      setTimeout(() => scrollToBottom(true), 50);
    } catch (error) {
      console.error("Error sending photo:", error);
      alert("Error al enviar la foto");
    } finally {
      setUploadingMedia(false);
    }
  };

  // ===== FUNCIONES DE AUDIO - SISTEMA DE TOQUE ON/OFF =====
  
  const toggleRecording = async () => {
    if (uploadingMedia || audioSending) return;
    
    if (isRecording) {
      // Detener grabación y enviar
      stopRecording();
    } else {
      // Iniciar grabación
      startRecording();
    }
  };
  
  const startRecording = async () => {
    // Prevenir grabaciones múltiples
    if (isRecordingRef.current || isRecording || uploadingMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        isRecordingRef.current = false;
      };
      
      // Crear visualización de onda
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Contador de tiempo
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
      
      // Vibración de inicio
      if (navigator.vibrate) navigator.vibrate(50);
      
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("No se pudo acceder al micrófono. Verifica los permisos.");
      isRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      // Vibración de fin
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioBlob(null);
      audioChunksRef.current = [];
      isRecordingRef.current = false;
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      // Vibración de cancelación (patrón diferente)
      if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
    }
  };

  const sendAudio = async () => {
    if (!audioBlob || uploadingMedia || audioSending) return;
    
    setAudioSending(true);
    setUploadingMedia(true);
    try {
      // Crear referencia en Storage
      const storage = getStorage();
      const timestamp = Date.now();
      const filename = `audio_${timestamp}.webm`;
      const audioRef = storageRef(storage, `chat-rooms/${roomCode}/${filename}`);
      
      // Subir a Firebase Storage
      await uploadBytes(audioRef, audioBlob);
      
      // Obtener URL pública
      const audioURL = await getDownloadURL(audioRef);
      
      // Crear mensaje con audio
      const message: Message = {
        id: `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        text: `🎤 Nota de voz (${recordingTime}s)`,
        sender: userName,
        senderId: currentUserId,
        senderRole: userRole,
        timestamp,
        isSystem: false,
        mediaUrl: audioURL,
        mediaType: "audio",
        ...(replyingTo && {
          replyTo: {
            messageId: replyingTo.id,
            text: replyingTo.text,
            sender: replyingTo.sender,
          },
        }),
      };
      
      // ✅ CRÍTICO: Actualizar estado local INMEDIATAMENTE con ordenamiento
      setMessages(prev => [...prev, message].sort((a, b) => a.timestamp - b.timestamp));
      
      // Guardar mensaje en Firebase
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      
      // Limpiar
      setAudioBlob(null);
      setRecordingTime(0);
      setReplyingTo(null);
      
      setTimeout(() => scrollToBottom(true), 50);
    } catch (error) {
      console.error("Error sending audio:", error);
      alert("Error al enviar el audio");
    } finally {
      setUploadingMedia(false);
      setAudioSending(false);
    }
  };

  // Enviar audio automáticamente cuando se detiene la grabación
  useEffect(() => {
    if (audioBlob && !isRecording && !audioSending && !isRecordingRef.current) {
      sendAudio();
    }
  }, [audioBlob, isRecording]);

  // ===== FUNCIÓN PARA ELIMINAR ARCHIVOS AL CERRAR SALA =====
  
  const deleteRoomMedia = async (roomId: string) => {
    try {
      const storage = getStorage();
      const roomFolderRef = storageRef(storage, `chat-rooms/${roomId}`);
      
      // Listar todos los archivos
      const fileList = await listAll(roomFolderRef);
      
      // Eliminar cada archivo
      const deletePromises = fileList.items.map(itemRef => deleteObject(itemRef));
      await Promise.all(deletePromises);
      
      console.log(`✅ Archivos de sala ${roomId} eliminados`);
    } catch (error) {
      console.error("Error deleting room media:", error);
    }
  };

  const escorts = participants.filter(p => p.role === "escort");
  const telefonistas = participants.filter(p => p.role === "telefonista");
  const topTelefonistas = getTopTelefonistas();

  // RENDERIZADO
  if (step === "room-select") {
    return (
      <div 
        className="min-h-screen bg-black flex items-center justify-center p-4"
        style={{ 
          backgroundImage: `url(${currentTheme.bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
        <div className={`relative w-full max-w-md rounded-3xl border-2 ${currentTheme.cardBg} backdrop-blur-md shadow-2xl overflow-hidden border-amber-500/50`}>
          <div className={`bg-gradient-to-r ${currentTheme.primary} p-6 text-center`}>
            <h1 className="text-4xl font-bold text-white mb-2">{currentTheme.name}</h1>
            <p className="text-amber-100 text-sm">Sistema de Gestión</p>
          </div>
          <div className="p-8 space-y-4">
            <Button
              onClick={handleCreateRoom}
              className={`w-full h-14 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white text-lg font-bold rounded-xl shadow-lg`}
            >
              ➕ Crear Sala Nueva
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-black text-gray-400 font-medium">o</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-amber-400">Código de Sala</label>
              <Input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleJoinExistingRoom()}
                placeholder="ABC123"
                className="h-12 text-center text-lg tracking-wider uppercase font-bold bg-black/50 border-2 border-amber-500 text-amber-300"
                maxLength={6}
              />
            </div>
            <Button
              onClick={handleJoinExistingRoom}
              disabled={!roomCode.trim()}
              className={`w-full h-12 bg-gradient-to-r ${currentTheme.secondary} hover:opacity-90 text-white font-bold rounded-xl shadow-lg`}
            >
              🔑 Unirse a Sala
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "join") {
    return (
      <div 
        className="min-h-screen bg-black flex items-center justify-center p-4"
        style={{ 
          backgroundImage: `url(${currentTheme.bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
        <div className={`relative w-full max-w-md rounded-3xl border-2 ${currentTheme.cardBg} backdrop-blur-md shadow-2xl overflow-hidden border-amber-500/50`}>
          <div className={`bg-gradient-to-r ${currentTheme.primary} p-6`}>
            <button
              onClick={() => setStep("room-select")}
              className="text-white hover:opacity-80 transition-colors mb-4"
            >
              ← Volver
            </button>
            <h1 className="text-3xl font-bold text-white text-center">Sala: {roomCode}</h1>
            {isCreator && <p className="text-center text-amber-100 text-sm mt-2">👑 Serás el Administrador</p>}
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-bold text-amber-400 mb-2">Tu Nombre</label>
              <Input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ej: Maria"
                className="h-12 bg-black/50 border-2 border-amber-500 text-amber-300"
              />
            </div>
            {!isCreator && (
              <div>
                <label className="block text-sm font-bold text-amber-400 mb-3">Tu Rol</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUserRole("escort")}
                    className={cn(
                      "h-24 rounded-xl border-2 font-bold transition-all flex flex-col items-center justify-center gap-2",
                      userRole === "escort"
                        ? "border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg scale-105"
                        : "border-gray-600 bg-black/30 text-gray-400 hover:border-amber-500"
                    )}
                  >
                    <span className="text-3xl">💃</span>
                    <span className="text-sm">Escort</span>
                  </button>
                  <button
                    onClick={() => setUserRole("telefonista")}
                    className={cn(
                      "h-24 rounded-xl border-2 font-bold transition-all flex flex-col items-center justify-center gap-2",
                      userRole === "telefonista"
                        ? "border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg scale-105"
                        : "border-gray-600 bg-black/30 text-gray-400 hover:border-amber-500"
                    )}
                  >
                    <span className="text-3xl">📞</span>
                    <span className="text-sm">Telefonista</span>
                  </button>
                </div>
              </div>
            )}
            <Button
              onClick={handleJoin}
              disabled={!userName.trim() || isJoining}
              className={`w-full h-14 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white text-lg font-bold rounded-xl shadow-lg`}
            >
              {isJoining ? "Uniéndose..." : isCreator ? "Crear Sala" : "Entrar al Chat"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // CHAT PRINCIPAL - FULLSCREEN TIPO WHATSAPP
  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <div className={`relative w-full h-full flex flex-col`}>
        {/* Header compacto tipo WhatsApp */}
        <div className={`bg-gradient-to-r ${currentTheme.primary} px-3 py-2 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="text-xl">{currentTheme.icon}</div>
            <div>
              <h2 className="text-sm font-bold text-white">Sala: {roomCode}</h2>
              <p className="text-xs text-amber-100">{participants.length} online</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setShowRankingModal(true)}
              className="bg-yellow-500/90 hover:bg-yellow-600 text-black font-bold text-xs px-2 py-1 rounded-lg h-7"
            >
              🏆
            </Button>
            {userRole === "admin" && (
              <>
                <Button
                  onClick={() => setShowHistory(true)}
                  className="bg-green-500/90 hover:bg-green-600 text-white font-bold text-xs px-2 py-1 rounded-lg h-7"
                >
                  📋
                </Button>
                <Button
                  onClick={() => setShowStatsModal(true)}
                  className="bg-blue-500/90 hover:bg-blue-600 text-white font-bold text-xs px-2 py-1 rounded-lg h-7"
                >
                  📊
                </Button>
                <Button
                  onClick={() => {
                    setEditingSettings({
                      maxEscorts: roomSettings.maxEscorts.toString(),
                      maxTelefonistas: roomSettings.maxTelefonistas.toString(),
                      prices: roomSettings.prices.map(p => p.toString()),
                    });
                    setShowSettingsModal(true);
                  }}
                  className="bg-purple-500/90 hover:bg-purple-600 text-white font-bold text-xs px-2 py-1 rounded-lg h-7"
                >
                  ⚙️
                </Button>
              </>
            )}
            <Button
              onClick={handleLeaveChat}
              className="bg-red-500/90 hover:bg-red-600 text-white rounded-lg px-2 py-1 h-7"
            >
              🚪
            </Button>
          </div>
        </div>

        {/* Barra de advertencia */}
        <div className="bg-red-900/80 border-b-2 border-red-600 p-2 text-center">
          <p className="text-xs text-red-200 font-medium">
            🚫 Prohibido compartir números, links o redes sociales
          </p>
        </div>

        {/* Contador de Período - VISIBLE PARA TODOS */}
        <div className="bg-gradient-to-r from-amber-900/50 to-orange-900/50 border-b-2 border-amber-500 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="text-sm text-gray-300">Clientes Atendidos ({getPeriodLabel()})</p>
                  <p className="text-2xl font-bold text-amber-300">
                    {periodSettings.clientsAttended}
                  </p>
                </div>
              </div>
              
              <div className="h-10 w-px bg-amber-500/30"></div>
              
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏰</span>
                <div>
                  <p className="text-sm text-gray-300">Días Restantes</p>
                  <p className="text-2xl font-bold text-amber-300">
                    {getDaysRemaining()}
                  </p>
                </div>
              </div>
            </div>
            
            {userRole === "admin" && (
              <button
                onClick={() => setShowPeriodConfig(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <span>⚙️</span>
                <span className="hidden sm:inline">Configurar Período</span>
              </button>
            )}
          </div>
        </div>

        {/* Estado Escorts */}
        {escorts.map(escort => (
          <div
            key={escort.id}
            className={cn(
              "flex items-center justify-between p-3 border-b-2",
              escortStatus === "disponible" ? "bg-green-900/30 border-green-600" : "bg-red-900/30 border-red-600"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-3 h-3 rounded-full",
                  escortStatus === "disponible" ? "bg-green-500 animate-pulse" : "bg-red-500"
                )}
              ></div>
              <span className="font-bold text-sm text-white">
                {escort.name} {escortStatus === "disponible" ? "DISPONIBLE 🟢" : "OCUPADA 🔴"}
              </span>
            </div>
            {userRole === "escort" && escort.id === currentUserId && (
              <Button
                onClick={toggleEscortStatus}
                className={cn(
                  "h-8 text-sm font-bold rounded-lg",
                  escortStatus === "disponible"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-green-500 hover:bg-green-600"
                )}
              >
                {escortStatus === "disponible" ? "Marcar Ocupada" : "Marcar Disponible"}
              </Button>
            )}
          </div>
        ))}

        {/* Clientes en espera */}
        {waitingClients.length > 0 && (
          <div className="p-4 bg-yellow-900/30 border-b-2 border-yellow-600">
            <p className="text-sm font-bold text-yellow-300 mb-2">
              ⏳ {waitingClients.length} Cliente{waitingClients.length !== 1 ? "s" : ""} en Espera
            </p>
            <div className="space-y-2">
              {waitingClients.map((code, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 bg-black/50 p-3 rounded-lg border-2 border-yellow-600"
                >
                  <span className="font-mono font-bold text-2xl text-yellow-300">{code}</span>
                  {userRole === "escort" && (
                    <button
                      onClick={() => {
                        setSelectedClientForPrice(code);
                        setClientAttentionStep("status");
                        setCustomAmount("");
                        setLeftReason("");
                        setCustomLeftReason("");
                      }}
                      disabled={processingClient === code}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all",
                        processingClient === code
                          ? "bg-gray-600 cursor-not-allowed"
                          : "bg-green-500 hover:bg-green-600 text-white shadow-lg hover:scale-105"
                      )}
                    >
                      <span>✓</span>
                      <span className="text-sm">Atendido</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ✅ ÁREA DE MENSAJES CON FONDO DENTRO */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 py-2 space-y-2 relative"
          style={{
            backgroundImage: `url(${currentTheme.bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'local'
          }}
        >
          {/* Overlay oscuro para legibilidad */}
          <div className="absolute inset-0 bg-black/70 pointer-events-none"></div>
          
          {/* Mensajes encima del fondo */}
          <div className="relative z-10 space-y-2">
          {messages.map((msg) => {
            const isForMe = msg.recipientId === currentUserId || msg.senderId === currentUserId;
            if (msg.isPrivate && !isForMe && userRole !== "admin") return null;
            
            // ✅ Si es mensaje de cliente y soy escort, hacer clickeable con respuesta automática
            const isClientMessage = msg.isClientCode && userRole === "escort";
            const canReply = !msg.isSystem; // Todos los mensajes no-sistema pueden ser respondidos
            
            // ✅ CRÍTICO: Mensajes MÍOS a la DERECHA, otros a la IZQUIERDA
            const isMyMessage = msg.senderId === currentUserId;
            
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.isSystem 
                    ? "justify-center" // Mensajes del sistema centrados
                    : isMyMessage 
                    ? "justify-end" // MIS mensajes a la DERECHA
                    : "justify-start" // Mensajes de OTROS a la IZQUIERDA
                )}
              >
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2 shadow",
                    msg.isSystem
                      ? msg.isWarning
                        ? "bg-red-900/80 text-red-200 border-2 border-red-600 w-full max-w-none text-center font-bold"
                        : "bg-gray-800/80 text-gray-300 w-full max-w-none text-center text-sm italic"
                      : msg.isClientCode
                      ? cn(
                          "bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold border-2 border-orange-400 animate-pulse",
                          canReply && "cursor-pointer hover:scale-[1.02] transition-transform active:scale-95"
                        )
                      : msg.isPrivate
                      ? "bg-purple-900/80 text-purple-200 border-2 border-purple-500"
                      : isMyMessage
                      ? `bg-gradient-to-r ${currentTheme.primary} text-white` // MIS mensajes - verde/color tema
                      : "bg-gray-800/80 text-gray-200 border-2 border-gray-600", // Mensajes de OTROS - gris
                    canReply && !msg.isClientCode && !msg.isSystem && "cursor-pointer hover:opacity-90 transition-opacity"
                  )}
                  onClick={() => {
                    if (canReply) {
                      setReplyingTo(msg);
                      if (isClientMessage) {
                        setNewMessage("Manda estare esperandolo");
                      }
                      // Hacer scroll hacia abajo para que vea el input
                      setTimeout(() => scrollToBottom(true), 100);
                    }
                  }}
                >
                  {!msg.isSystem && (
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-bold opacity-80">
                        {msg.sender}
                      </p>
                      {/* Badge de ROL muy visible */}
                      {msg.senderRole === "admin" && (
                        <span className="px-2 py-0.5 rounded-full bg-yellow-500 text-black text-[9px] font-black flex items-center gap-1">
                          👑 ADMIN
                        </span>
                      )}
                      {msg.senderRole === "escort" && (
                        <span className="px-2 py-0.5 rounded-full bg-pink-500 text-white text-[9px] font-black flex items-center gap-1">
                          💃 ESCORT
                        </span>
                      )}
                      {msg.senderRole === "telefonista" && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center gap-1">
                          📞 TELEFONISTA
                        </span>
                      )}
                      {msg.isPrivate && (
                        <span className="text-purple-300">🔒</span>
                      )}
                    </div>
                  )}
                  
                  {/* ✅ Mostrar mensaje respondido si existe - Estilo WhatsApp */}
                  {msg.replyTo && (
                    <div 
                      className="mb-2 pl-2 border-l-4 border-green-500 bg-black/40 rounded-r p-2 cursor-pointer hover:bg-black/60 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Aquí podrías hacer scroll al mensaje original
                      }}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[10px] font-bold text-green-400">{msg.replyTo.sender}</p>
                        {msg.sender === msg.replyTo.sender && (
                          <span className="text-[8px] text-green-400">tú</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-2 leading-tight">{msg.replyTo.text}</p>
                    </div>
                  )}
                  
                  {/* ✅ Mostrar FOTO si existe */}
                  {msg.mediaType === "photo" && msg.mediaUrl && (
                    <div className="mb-2">
                      <img
                        src={msg.mediaUrl}
                        alt="Foto compartida"
                        className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: "300px", objectFit: "cover" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenPhoto(msg.mediaUrl!);
                        }}
                      />
                    </div>
                  )}
                  
                  {/* ✅ Mostrar AUDIO si existe */}
                  {msg.mediaType === "audio" && msg.mediaUrl && (
                    <div className="mb-2">
                      <AudioPlayer audioUrl={msg.mediaUrl} />
                    </div>
                  )}
                  
                  {msg.text && <p className="text-sm break-words">{msg.text}</p>}
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input de mensajes compacto tipo WhatsApp */}
        <div className="bg-gray-900 px-2 py-2 space-y-2">
          {/* Input oculto para seleccionar fotos */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelect(file);
              e.target.value = ""; // Reset input
            }}
            className="hidden"
          />
          
          {/* ✅ Área de respuesta - Estilo WhatsApp */}
          {replyingTo && (
            <div className="bg-gray-800/80 rounded-lg p-2 flex items-start justify-between gap-2 border-l-4 border-green-500">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-green-400">
                    {replyingTo.sender}
                  </p>
                  {replyingTo.senderRole === "escort" && <span className="text-[8px]">💃</span>}
                  {replyingTo.senderRole === "telefonista" && <span className="text-[8px]">📞</span>}
                  {replyingTo.senderRole === "admin" && <span className="text-[8px]">👑</span>}
                </div>
                <p className="text-sm text-gray-300 truncate leading-tight">
                  {replyingTo.isClientCode && "🔔 "}
                  {replyingTo.mediaType === "photo" && "📸 Foto"}
                  {replyingTo.mediaType === "audio" && "🎤 Audio"}
                  {!replyingTo.mediaType && replyingTo.text}
                </p>
              </div>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  if (replyingTo.isClientCode && newMessage === "Manda estare esperandolo") {
                    setNewMessage("");
                  }
                }}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0 text-xl leading-none"
              >
                ✕
              </button>
            </div>
          )}
          
          {userRole === "telefonista" && (
            <div className="flex gap-2">
              <Input
                type="text"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyPress={(e) => e.key === "Enter" && sendClientCode()}
                placeholder="4 dígitos"
                className="flex-1 h-10 text-center text-base font-mono font-bold bg-black border-2 border-amber-500 text-amber-300"
                maxLength={4}
              />
              <Button
                onClick={sendClientCode}
                disabled={clientCode.length !== 4}
                className={`h-10 px-4 bg-gradient-to-r ${currentTheme.primary} text-white font-bold rounded-lg`}
              >
                📞
              </Button>
            </div>
          )}
          {/* Botones rápidos con scroll horizontal */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {QUICK_MESSAGES[userRole === "escort" ? "escort" : "telefonista"].map((msg, index) => (
              <button
                key={index}
                onClick={() => {
                  sendMessage(msg);
                  setReplyingTo(null);
                }}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-full whitespace-nowrap"
              >
                {msg}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            {/* Botón de Foto */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              📸
            </button>
            
            {/* Botón de Audio - Sistema de toque ON/OFF */}
            <button
              ref={recordButtonRef}
              onClick={toggleRecording}
              disabled={uploadingMedia || audioSending}
              className={cn(
                "h-10 w-10 rounded-full text-white flex items-center justify-center transition-all select-none",
                uploadingMedia || audioSending
                  ? "bg-gray-600 cursor-not-allowed opacity-50"
                  : isRecording 
                  ? "bg-red-600 animate-pulse scale-110 shadow-lg shadow-red-500/50" 
                  : "bg-green-600 hover:bg-green-700 active:scale-95"
              )}
              title={
                uploadingMedia 
                  ? "Enviando..." 
                  : isRecording 
                  ? "Toca para DETENER y enviar" 
                  : "Toca para GRABAR"
              }
            >
              {uploadingMedia || audioSending ? "⏳" : isRecording ? "⏹️" : "🎤"}
            </button>
            
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder={isRecording ? "Grabando..." : "Mensaje..."}
              disabled={isRecording || uploadingMedia}
              className="flex-1 h-10 bg-gray-800 border border-gray-700 text-white rounded-full px-4"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!newMessage.trim() || uploadingMedia}
              className={`h-10 w-10 rounded-full ${currentTheme.accent} text-white flex items-center justify-center`}
            >
              📤
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL DE PREVIEW DE FOTO */}
      {showPhotoModal && photoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-blue-500 p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-blue-400">📸 Preview de Foto</h3>
              <button
                onClick={() => {
                  setShowPhotoModal(false);
                  setSelectedPhoto(null);
                  setPhotoPreview(null);
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full rounded-lg"
                style={{ maxHeight: "400px", objectFit: "contain" }}
              />
            </div>

            <div className="mb-4">
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Agregar descripción (opcional)..."
                className="w-full h-10 bg-black/50 border-2 border-blue-500 text-white"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowPhotoModal(false);
                  setSelectedPhoto(null);
                  setPhotoPreview(null);
                }}
                className="flex-1 h-12 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg"
              >
                ❌ Cancelar
              </Button>
              <Button
                onClick={sendPhoto}
                disabled={uploadingMedia}
                className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg"
              >
                {uploadingMedia ? "Enviando..." : "✓ Enviar Foto"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* INDICADOR DE GRABACIÓN - Sistema ON/OFF */}
      {isRecording && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 max-w-md mx-4">
            {/* Animación de grabación */}
            <div className="relative">
              <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center animate-pulse">
                <div className="text-6xl">🎤</div>
              </div>
              <div className="absolute inset-0 border-4 border-red-400 rounded-full animate-ping"></div>
            </div>
            
            {/* Tiempo */}
            <div className="bg-red-600 text-white px-8 py-4 rounded-full shadow-2xl">
              <p className="font-bold text-3xl font-mono">{recordingTime}s / 60s</p>
            </div>
            
            {/* Instrucciones GRANDES y CLARAS */}
            <div className="text-center space-y-4">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                <p className="text-white text-2xl font-bold mb-4">🔴 GRABANDO...</p>
                <p className="text-white/90 text-lg">
                  Toca el botón 🎤 de nuevo para <strong>DETENER Y ENVIAR</strong>
                </p>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-4">
              {/* Botón para detener y enviar */}
              <button
                onClick={stopRecording}
                className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-full font-bold text-lg shadow-lg active:scale-95 transition-all"
              >
                ✅ Enviar
              </button>
              
              {/* Botón para cancelar */}
              <button
                onClick={cancelRecording}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-full font-bold text-lg shadow-lg active:scale-95 transition-all"
              >
                ❌ Cancelar
              </button>
            </div>

            {/* Barra de progreso */}
            <div className="w-full max-w-sm">
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-1000"
                  style={{ width: `${(recordingTime / 60) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOTO PANTALLA COMPLETA */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <div className="relative w-full h-full flex flex-col">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setFullscreenPhoto(null)}
                className="text-white text-4xl hover:opacity-80"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <img
                src={fullscreenPhoto}
                alt="Foto completa"
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="flex justify-center mt-4">
              <a
                href={fullscreenPhoto}
                download
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                onClick={(e) => e.stopPropagation()}
              >
                ⬇️ Descargar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RANKING */}
      {showRankingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-amber-400">🏆 TOP 3 TELEFONISTAS</h3>
              <button
                onClick={() => setShowRankingModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-6">Últimos 7 días</p>
            <div className="space-y-4">
              {topTelefonistas.map((tel, index) => {
                const badges = calculateBadges(tel.clientsSent);
                return (
                  <div
                    key={tel.id}
                    className={cn(
                      "p-4 rounded-xl border-2 flex items-center justify-between",
                      index === 0 && "bg-yellow-900/20 border-yellow-500",
                      index === 1 && "bg-gray-700/20 border-gray-400",
                      index === 2 && "bg-orange-900/20 border-orange-600"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">
                        {index === 0 && "🥇"}
                        {index === 1 && "🥈"}
                        {index === 2 && "🥉"}
                      </div>
                      <div>
                        <p className="font-bold text-lg text-white">{tel.name}</p>
                        <p className="text-sm text-gray-400">
                          {tel.clientsSent} cliente{tel.clientsSent !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          Último: {getTimeSinceLastClient(tel.lastClientTime)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {badges.length > 0 && (
                        <div className="flex gap-1">
                          {badges.map(badge => (
                            <span key={badge} className="text-2xl">
                              {BADGES[badge as keyof typeof BADGES].icon}
                            </span>
                          ))}
                        </div>
                      )}
                      {tel.rating && tel.rating > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          <span className="text-sm font-bold text-white">
                            {tel.rating.toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({tel.totalRatings})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {topTelefonistas.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  No hay datos suficientes para mostrar ranking
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ESTADÍSTICAS */}
      {showStatsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-4xl ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-amber-400">📊 Panel de Administración</h3>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Estadísticas generales */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-600">
                <p className="text-xs text-blue-300 mb-1">Total Participantes</p>
                <p className="text-2xl font-bold text-white">{participants.length}</p>
              </div>
              <div className="bg-green-900/30 p-4 rounded-lg border border-green-600">
                <p className="text-xs text-green-300 mb-1">Clientes Totales</p>
                <p className="text-2xl font-bold text-white">
                  {participants.reduce((sum, p) => sum + p.clientsSent, 0)}
                </p>
              </div>
              <div className="bg-yellow-900/30 p-4 rounded-lg border border-yellow-600">
                <p className="text-xs text-yellow-300 mb-1">En Espera</p>
                <p className="text-2xl font-bold text-white">{waitingClients.length}</p>
              </div>
            </div>

            {/* Telefonistas */}
            <div className="mb-6">
              <h4 className="text-lg font-bold text-amber-400 mb-3">
                📞 Telefonistas ({telefonistas.length})
              </h4>
              <div className="space-y-2">
                {telefonistas.map(tel => (
                  <div
                    key={tel.id}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-600"
                  >
                    <div>
                      <p className="font-bold text-white">{tel.name}</p>
                      <p className="text-xs text-gray-400">
                        {tel.clientsSent} cliente{tel.clientsSent !== 1 ? "s" : ""} • 
                        {tel.violations > 0 && ` ${tel.violations} violación${tel.violations !== 1 ? "es" : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {tel.rating && tel.rating > 0 && (
                        <div className="flex items-center gap-1 bg-yellow-900/30 px-2 py-1 rounded">
                          <span className="text-yellow-500 text-xs">★</span>
                          <span className="text-sm font-bold text-white">{tel.rating.toFixed(1)}</span>
                        </div>
                      )}
                      <Button
                        onClick={() => {
                          setPrivateChatRecipient(tel.id);
                          setShowPrivateChat(true);
                          setShowStatsModal(false);
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1 rounded"
                      >
                        💬
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Escorts */}
            <div>
              <h4 className="text-lg font-bold text-amber-400 mb-3">
                💃 Escorts ({escorts.length})
              </h4>
              <div className="space-y-2">
                {escorts.map(esc => (
                  <div
                    key={esc.id}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-600"
                  >
                    <div>
                      <p className="font-bold text-white">{esc.name}</p>
                      <p className="text-xs text-gray-400">
                        Estado: {escortStatus === "disponible" ? "🟢 Disponible" : "🔴 Ocupada"}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setPrivateChatRecipient(esc.id);
                        setShowPrivateChat(true);
                        setShowStatsModal(false);
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1 rounded"
                    >
                      💬
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN CON SELECTOR DE TEMA */}
      {showSettingsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-amber-400">⚙️ Configuración de Sala</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* SELECTOR DE TEMA */}
            <div className="mb-6">
              <h4 className="text-lg font-bold text-amber-400 mb-3">🎬 Tema Visual</h4>
              <div className="grid grid-cols-2 gap-4">
                {(Object.keys(THEMES) as ThemeName[]).map((themeKey) => {
                  const theme = THEMES[themeKey];
                  return (
                    <button
                      key={themeKey}
                      onClick={() => changeTheme(themeKey)}
                      className={cn(
                        "relative h-40 rounded-xl border-4 transition-all hover:scale-105 overflow-hidden",
                        selectedTheme === themeKey
                          ? "border-yellow-500 shadow-2xl shadow-yellow-500/50 ring-4 ring-yellow-400/50"
                          : "border-gray-600 hover:border-amber-500"
                      )}
                    >
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${theme.bgImage})` }}
                      ></div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
                      
                      {selectedTheme === themeKey && (
                        <div className="absolute top-2 right-2 bg-yellow-500 text-black font-bold px-2 py-1 rounded-full text-xs">
                          ✓ ACTUAL
                        </div>
                      )}
                      
                      <div className="relative h-full flex flex-col items-center justify-end p-4">
                        <span className="text-4xl mb-2">{theme.icon}</span>
                        <p className="font-black text-xl text-white" style={{ textShadow: '2px 2px 8px rgba(0,0,0,1)' }}>
                          {theme.name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Configuración de límites */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-amber-400 mb-2">
                  Máximo de Escorts
                </label>
                <Input
                  type="number"
                  value={editingSettings.maxEscorts}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, maxEscorts: e.target.value })
                  }
                  min="1"
                  max="10"
                  className="w-full h-10 bg-black/50 border-2 border-gray-600 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-amber-400 mb-2">
                  Máximo de Telefonistas
                </label>
                <Input
                  type="number"
                  value={editingSettings.maxTelefonistas}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, maxTelefonistas: e.target.value })
                  }
                  min="1"
                  max="20"
                  className="w-full h-10 bg-black/50 border-2 border-gray-600 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-amber-400 mb-2">
                  Precios (separados por comas)
                </label>
                <Input
                  type="text"
                  value={editingSettings.prices.join(", ")}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      prices: e.target.value.split(",").map(p => p.trim()),
                    })
                  }
                  placeholder="100, 150, 200"
                  className="w-full h-10 bg-black/50 border-2 border-gray-600 text-white"
                />
              </div>

              <Button
                onClick={saveSettings}
                className={`w-full h-12 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white font-bold rounded-lg`}
              >
                💾 Guardar Configuración
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CALIFICAR TELEFONISTA */}
      {showRatingModal && selectedTelefonistaToRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-amber-500 p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-amber-400">⭐ Calificar Telefonista</h3>
              <button
                onClick={() => {
                  setShowRatingModal(false);
                  setSelectedTelefonistaToRate(null);
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-white font-bold mb-4">
                {participants.find(p => p.id === selectedTelefonistaToRate)?.name}
              </p>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={cn(
                      "text-4xl transition-transform hover:scale-110",
                      star <= rating ? "text-yellow-500" : "text-gray-600"
                    )}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={rateTelefonista}
              className={`w-full h-12 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white font-bold rounded-lg`}
            >
              Enviar Calificación
            </Button>
          </div>
        </div>
      )}

      {/* MODAL CHAT PRIVADO */}
      {showPrivateChat && privateChatRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-purple-500 p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-purple-400">💬 Mensaje Privado</h3>
              <button
                onClick={() => {
                  setShowPrivateChat(false);
                  setPrivateChatRecipient(null);
                  setPrivateMessage("");
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <p className="text-white mb-4">
              Para: <span className="font-bold">{participants.find(p => p.id === privateChatRecipient)?.name}</span>
            </p>

            <textarea
              value={privateMessage}
              onChange={(e) => setPrivateMessage(e.target.value)}
              placeholder="Escribe tu mensaje privado..."
              className="w-full h-32 p-3 bg-black/50 border-2 border-purple-500 text-white rounded-lg resize-none mb-4"
            />

            <Button
              onClick={sendPrivateMessage}
              disabled={!privateMessage.trim()}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white font-bold rounded-lg"
            >
              📤 Enviar Mensaje Privado
            </Button>
          </div>
        </div>
      )}

      {/* MODAL ATENCIÓN DE CLIENTE - MULTI-PASO */}
      {selectedClientForPrice && userRole === "escort" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-green-500 p-6`}>
            
            {/* PASO 1: Seleccionar PAGÓ o SE FUE */}
            {clientAttentionStep === "status" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-green-400">👤 Cliente {selectedClientForPrice}</h3>
                  <button
                    onClick={() => {
                      setSelectedClientForPrice(null);
                      setClientAttentionStep("status");
                    }}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-white mb-6 text-center text-lg">¿Qué pasó con el cliente?</p>

                <div className="space-y-3">
                  <button
                    onClick={() => setClientAttentionStep("paid")}
                    className="w-full h-20 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-2xl rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-3"
                  >
                    <span>💵</span>
                    <span>PAGÓ</span>
                  </button>

                  <button
                    onClick={() => setClientAttentionStep("left")}
                    className="w-full h-20 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold text-2xl rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-3"
                  >
                    <span>🚪</span>
                    <span>SE FUE</span>
                  </button>
                </div>
              </>
            )}

            {/* PASO 2A: Cliente PAGÓ - Seleccionar precio */}
            {clientAttentionStep === "paid" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => setClientAttentionStep("status")}
                    className="text-white hover:opacity-80"
                  >
                    ← Volver
                  </button>
                  <h3 className="text-xl font-bold text-green-400">💵 Cliente {selectedClientForPrice}</h3>
                  <button
                    onClick={() => {
                      setSelectedClientForPrice(null);
                      setClientAttentionStep("status");
                      setCustomAmount("");
                    }}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-white mb-4 text-center">¿Cuánto pagó?</p>

                {/* Precios predefinidos */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {roomSettings.prices.map((price) => (
                    <button
                      key={price}
                      onClick={() => markClientAttended(selectedClientForPrice, price)}
                      className="h-20 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-2xl rounded-xl shadow-lg transition-transform hover:scale-105"
                    >
                      ${price}
                    </button>
                  ))}
                </div>

                {/* Precio personalizado */}
                <div className="border-t-2 border-gray-600 pt-4">
                  <label className="block text-sm font-bold text-green-400 mb-2 text-center">
                    💰 O escribe la cantidad exacta:
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Ejemplo: 175"
                      className="flex-1 h-12 text-center text-lg font-bold bg-black/50 border-2 border-green-500 text-green-300"
                    />
                    <button
                      onClick={() => {
                        const amount = parseInt(customAmount);
                        if (!isNaN(amount) && amount > 0) {
                          markClientAttended(selectedClientForPrice, amount);
                        } else {
                          alert("Ingresa una cantidad válida");
                        }
                      }}
                      disabled={!customAmount || parseInt(customAmount) <= 0}
                      className="h-12 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* PASO 2B: Cliente SE FUE - Seleccionar razón */}
            {clientAttentionStep === "left" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => setClientAttentionStep("status")}
                    className="text-white hover:opacity-80"
                  >
                    ← Volver
                  </button>
                  <h3 className="text-xl font-bold text-red-400">🚪 Cliente {selectedClientForPrice}</h3>
                  <button
                    onClick={() => {
                      setSelectedClientForPrice(null);
                      setClientAttentionStep("status");
                      setLeftReason("");
                      setCustomLeftReason("");
                    }}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-white mb-4 text-center">¿Por qué se fue?</p>

                {/* Razones predefinidas */}
                <div className="space-y-2 mb-4">
                  <button
                    onClick={() => markClientLeft(selectedClientForPrice, "No era la de la foto")}
                    className="w-full p-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-xl transition-transform hover:scale-105 text-left"
                  >
                    📸 No era la de la foto
                  </button>

                  <button
                    onClick={() => markClientLeft(selectedClientForPrice, "No tenía dinero")}
                    className="w-full p-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-xl transition-transform hover:scale-105 text-left"
                  >
                    💸 No tenía dinero
                  </button>

                  <button
                    onClick={() => markClientLeft(selectedClientForPrice, "Se arrepintió")}
                    className="w-full p-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-xl transition-transform hover:scale-105 text-left"
                  >
                    🤔 Se arrepintió
                  </button>
                </div>

                {/* Razón personalizada */}
                <div className="border-t-2 border-gray-600 pt-4">
                  <label className="block text-sm font-bold text-red-400 mb-2 text-center">
                    ✍️ O escribe otra razón:
                  </label>
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={customLeftReason}
                      onChange={(e) => setCustomLeftReason(e.target.value)}
                      placeholder="Ejemplo: Era menor de edad"
                      className="w-full h-20 p-3 text-sm bg-black/50 border-2 border-red-500 text-red-300 rounded-lg resize-none"
                    />
                    <button
                      onClick={() => {
                        if (customLeftReason.trim()) {
                          markClientLeft(selectedClientForPrice, "other", customLeftReason.trim());
                        } else {
                          alert("Escribe una razón");
                        }
                      }}
                      disabled={!customLeftReason.trim()}
                      className="h-12 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✓ Confirmar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL DE CLIENTES - SOLO ADMIN */}
      {showHistory && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className={`w-full max-w-4xl ${currentTheme.cardBg} rounded-2xl shadow-2xl border-2 border-green-500 p-6 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-green-400">📋 Historial de Clientes</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {(() => {
              const history = roomSettings.clientHistory ? Object.values(roomSettings.clientHistory) : [];
              const paidClients = history.filter(r => r.status === "paid");
              const leftClients = history.filter(r => r.status === "left");
              const totalEarnings = paidClients.reduce((sum, r) => sum + (r.amount || 0), 0);

              return (
                <>
                  {/* Estadísticas Resumidas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-900/30 p-4 rounded-lg border border-green-600">
                      <p className="text-xs text-green-300 mb-1">✅ Clientes que Pagaron</p>
                      <p className="text-3xl font-bold text-white">{paidClients.length}</p>
                    </div>
                    <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-600">
                      <p className="text-xs text-blue-300 mb-1">💰 Total Ganado</p>
                      <p className="text-3xl font-bold text-white">${totalEarnings}</p>
                    </div>
                    <div className="bg-red-900/30 p-4 rounded-lg border border-red-600">
                      <p className="text-xs text-red-300 mb-1">🚪 Clientes que se Fueron</p>
                      <p className="text-3xl font-bold text-white">{leftClients.length}</p>
                    </div>
                  </div>

                  {/* Tasa de Conversión */}
                  {history.length > 0 && (
                    <div className="bg-purple-900/30 p-4 rounded-lg border border-purple-600 mb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-purple-300 mb-1">📊 Tasa de Conversión</p>
                          <p className="text-2xl font-bold text-white">
                            {((paidClients.length / history.length) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Total de Clientes</p>
                          <p className="text-xl font-bold text-white">{history.length}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lista de Clientes */}
                  {history.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2">
                        📜 Registro Completo
                        <span className="text-sm text-gray-400">({history.length} registros)</span>
                      </h4>
                      
                      {history
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((record) => (
                          <div
                            key={record.id}
                            className={cn(
                              "p-4 rounded-xl border-2",
                              record.status === "paid"
                                ? "bg-green-900/20 border-green-600"
                                : "bg-red-900/20 border-red-600"
                            )}
                          >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "w-12 h-12 rounded-full flex items-center justify-center text-2xl",
                                    record.status === "paid"
                                      ? "bg-green-600/30"
                                      : "bg-red-600/30"
                                  )}
                                >
                                  {record.status === "paid" ? "💵" : "🚪"}
                                </div>
                                <div>
                                  <p className="font-bold text-white text-lg">
                                    Cliente {record.code}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {new Date(record.timestamp).toLocaleString("es", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="text-sm text-gray-300">
                                    Atendido por: <span className="text-white font-medium">{record.handledBy}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="text-right">
                                {record.status === "paid" ? (
                                  <div className="bg-green-600/20 px-4 py-2 rounded-lg border border-green-600">
                                    <p className="text-xs text-green-300">PAGÓ</p>
                                    <p className="text-2xl font-bold text-green-400">
                                      ${record.amount}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="bg-red-600/20 px-4 py-2 rounded-lg border border-red-600">
                                    <p className="text-xs text-red-300 mb-1">SE FUE</p>
                                    <p className="text-sm text-red-400 font-medium">
                                      {record.reason === "other" && record.customReason
                                        ? record.customReason
                                        : record.reason}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📋</div>
                      <p className="text-xl text-gray-400">
                        No hay registros todavía
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Los clientes atendidos aparecerán aquí
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* MODAL CONFIG Período */}
      {showPeriodConfig && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-2xl border-2 border-amber-500 p-6 max-w-md w-full">
            <h3 className="text-2xl font-bold text-amber-400 mb-4">
              ⚙️ Configurar Período
            </h3>
            
            <div className="space-y-4">
              <button
                onClick={() => changePeriodType("daily")}
                className={cn(
                  "w-full p-4 rounded-lg border-2 font-medium transition-colors",
                  periodSettings.type === "daily"
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-600 hover:border-amber-500/50 text-gray-300"
                )}
              >
                📅 Diario (24 horas)
              </button>
              
              <button
                onClick={() => changePeriodType("weekly")}
                className={cn(
                  "w-full p-4 rounded-lg border-2 font-medium transition-colors",
                  periodSettings.type === "weekly"
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-600 hover:border-amber-500/50 text-gray-300"
                )}
              >
                📊 Semanal (7 días)
              </button>
              
              <button
                onClick={() => changePeriodType("monthly")}
                className={cn(
                  "w-full p-4 rounded-lg border-2 font-medium transition-colors",
                  periodSettings.type === "monthly"
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-600 hover:border-amber-500/50 text-gray-300"
                )}
              >
                📆 Mensual (30 días)
              </button>
              
              <div className="border-t border-gray-700 pt-4 mt-4">
                <p className="text-sm text-gray-400 mb-3">
                  Estado actual: <strong className="text-amber-300">{periodSettings.clientsAttended} clientes</strong> en <strong className="text-amber-300">{getDaysRemaining()} días</strong> restantes
                </p>
                <button
                  onClick={resetPeriod}
                  className="w-full p-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-colors"
                >
                  🔄 Resetear Contador Ahora
                </button>
              </div>
              
              <button
                onClick={() => setShowPeriodConfig(false)}
                className="w-full p-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
