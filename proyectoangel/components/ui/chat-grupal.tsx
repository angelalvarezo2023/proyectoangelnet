"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ══════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════

type UserRole = "escort" | "telefonista" | "admin";
type EscortStatus = "disponible" | "ocupada";

interface Message {
  id: string;
  text: string;
  sender: string;
  senderId: string;
  timestamp: number;
  isSystem: boolean;
  isClientCode?: boolean;
  clientCode?: string;
  isWarning?: boolean;
  isPrivate?: boolean;
  recipientId?: string;
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

interface RoomSettings {
  maxEscorts: number;
  maxTelefonistas: number;
  prices: number[];
  turnsEnabled: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

interface RoomData {
  messages: Record<string, Message>;
  participants: Record<string, Participant>;
  escortStatus: EscortStatus;
  waitingClients: string[];
  settings: RoomSettings;
  createdAt: number;
  creatorId: string;
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

// ══════════════════════════════════════════════════════════════════════════
// DETECCIÓN DE CONTENIDO PROHIBIDO
// ══════════════════════════════════════════════════════════════════════════

const detectProhibitedContent = (text: string): { isProhibited: boolean; reason: string } => {
  const lowerText = text.toLowerCase();
  const cleanText = text.replace(/[\s\-_.()]/g, "");
  
  const phonePatterns = [
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b\d{10,11}\b/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g,
    /\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}/g,
  ];
  
  for (const pattern of phonePatterns) {
    if (pattern.test(text)) return { isProhibited: true, reason: "números de teléfono" };
  }
  
  const urlPatterns = [/https?:\/\//gi, /www\./gi, /\b\w+\.(com|net|org|edu|gov|io|co|me|info)\b/gi];
  for (const pattern of urlPatterns) {
    if (pattern.test(text)) return { isProhibited: true, reason: "links o URLs" };
  }
  
  const socialPatterns = [/\bwhatsapp\b|\bwpp\b/gi, /\binstagram\b|\binsta\b/gi, /\bfacebook\b|\bface\b/gi, /\btelegram\b/gi];
  for (const pattern of socialPatterns) {
    if (pattern.test(lowerText)) return { isProhibited: true, reason: "redes sociales" };
  }
  
  const longNumbers = cleanText.match(/\d{7,}/g);
  if (longNumbers) return { isProhibited: true, reason: "números de teléfono" };
  
  return { isProhibited: false, reason: "" };
};

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════

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
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    maxEscorts: 1,
    maxTelefonistas: 10,
    prices: [100, 150, 200],
    turnsEnabled: false,
    soundEnabled: true,
    notificationsEnabled: true,
  });
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedTelefonistaToRate, setSelectedTelefonistaToRate] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [selectedClientForPrice, setSelectedClientForPrice] = useState<string | null>(null);
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
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTENCIA DE SESIÓN
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (step === "chat") {
      const sessionData = { roomCode, userName, userRole, currentUserId, isCreator, timestamp: Date.now() };
      localStorage.setItem("chatSession", JSON.stringify(sessionData));
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

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICACIONES
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT Y SINCRONIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════

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

        if (data) {
          const messagesArray = data.messages 
            ? Object.values(data.messages).sort((a, b) => a.timestamp - b.timestamp)
            : [];
          
          if (userRole === "escort" && messagesArray.length > messages.length) {
            const newMsg = messagesArray[messagesArray.length - 1];
            if (newMsg.isClientCode) playNotification();
          }
          
          setMessages(messagesArray);

          if (data.participants) {
            const now = Date.now();
            const activeParticipants: Record<string, Participant> = {};
            let hasInactive = false;

            for (const [id, participant] of Object.entries(data.participants)) {
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
          if (data.waitingClients) setWaitingClients(data.waitingClients);
          if (data.settings) setRoomSettings(data.settings);
        }
      } catch (error) {
        console.error("Error syncing chat:", error);
      }
    };

    syncChat();
    syncIntervalRef.current = setInterval(syncChat, 2000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [step, roomCode, messages.length, userRole, currentUserId]);

  useEffect(() => {
    if (step === "chat" && userRole === "escort" && typeof Notification !== "undefined") {
      if (Notification.permission === "default") Notification.requestPermission();
    }
  }, [step, userRole]);

  // ══════════════════════════════════════════════════════════════════════════
  // FUNCIONES DE SALA
  // ══════════════════════════════════════════════════════════════════════════

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
        const existingUser = Object.values(existingRoom.participants).find(
          p => p.name.toLowerCase() === userName.trim().toLowerCase()
        );
        
        if (existingUser) {
          alert("Este nombre ya está en uso. Elige otro.");
          setIsJoining(false);
          return;
        }

        if (!isCreator) {
          const currentRoles = Object.values(existingRoom.participants);
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
          case "escort": return "Escort";
          case "telefonista": return "Telefonista";
          case "admin": return "Administrador";
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
          },
          createdAt: Date.now(),
          creatorId: userId,
        };

        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initialData),
        });
      } else {
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
      alert("Error al unirse a la sala");
    } finally {
      setIsJoining(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // FUNCIONES DE RANKING
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // FUNCIONES DE MENSAJERÍA
  // ══════════════════════════════════════════════════════════════════════════

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

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      sender: userName,
      senderId: currentUserId,
      timestamp: Date.now(),
      isSystem: false,
    };

    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!customText) setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const sendPrivateMessage = async () => {
    if (!privateMessage.trim() || !privateChatRecipient) return;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: privateMessage.trim(),
      sender: userName,
      senderId: currentUserId,
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
      timestamp: Date.now(),
      isSystem: false,
      isClientCode: true,
      clientCode: clientCode,
    };

    try {
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
    } catch (error) {
      console.error("Error marking client:", error);
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

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO - SELECCIÓN DE SALA
  // ══════════════════════════════════════════════════════════════════════════

  if (step === "room-select") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-green-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-orange-200 bg-white shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-center">
            <h1 className="text-4xl font-bold text-white mb-2">MegaPersonals</h1>
            <p className="text-orange-100 text-sm">Sistema de Gestión</p>
          </div>

          <div className="p-8 space-y-4">
            <Button
              onClick={handleCreateRoom}
              className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-lg font-bold rounded-xl shadow-lg"
            >
              ➕ Crear Sala Nueva
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500 font-medium">o</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700">Código de Sala</label>
              <Input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleJoinExistingRoom()}
                placeholder="ABC123"
                className="h-12 text-center text-lg tracking-wider uppercase font-bold border-2 border-gray-300 focus:border-orange-500"
                maxLength={6}
              />
            </div>

            <Button
              onClick={handleJoinExistingRoom}
              disabled={!roomCode.trim()}
              className="w-full h-12 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl shadow-lg"
            >
              🔑 Unirse a Sala
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO - INGRESO
  // ══════════════════════════════════════════════════════════════════════════

  if (step === "join") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-green-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-orange-200 bg-white shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6">
            <button
              onClick={() => setStep("room-select")}
              className="text-white hover:text-orange-100 transition-colors mb-4"
            >
              ← Volver
            </button>
            <h1 className="text-3xl font-bold text-white text-center">Sala: {roomCode}</h1>
            {isCreator && (
              <p className="text-center text-orange-100 text-sm mt-2">👑 Serás el Administrador</p>
            )}
          </div>

          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Tu Nombre</label>
              <Input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ej: Maria"
                className="h-12 border-2 border-gray-300 focus:border-orange-500"
              />
            </div>

            {!isCreator && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Tu Rol</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUserRole("escort")}
                    className={cn(
                      "h-24 rounded-xl border-2 font-bold transition-all flex flex-col items-center justify-center gap-2",
                      userRole === "escort"
                        ? "border-orange-500 bg-orange-50 text-orange-600 shadow-lg scale-105"
                        : "border-gray-300 bg-white text-gray-600 hover:border-orange-300"
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
                        ? "border-green-500 bg-green-50 text-green-600 shadow-lg scale-105"
                        : "border-gray-300 bg-white text-gray-600 hover:border-green-300"
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
              className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-lg font-bold rounded-xl shadow-lg"
            >
              {isJoining ? "Uniéndose..." : isCreator ? "Crear Sala" : "Entrar al Chat"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO - CHAT PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  const escorts = participants.filter(p => p.role === "escort");
  const telefonistas = participants.filter(p => p.role === "telefonista");
  const topTelefonistas = getTopTelefonistas();

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[700px] rounded-2xl border-2 border-orange-200 bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🏢</div>
              <div>
                <h2 className="text-xl font-bold">Sala: {roomCode}</h2>
                <p className="text-xs text-orange-100">{participants.length} persona{participants.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowRankingModal(true)}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-xs px-3 py-1 rounded-lg"
              >
                🏆 Ranking
              </Button>

              {userRole === "admin" && (
                <>
                  <Button
                    onClick={() => setShowStatsModal(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs px-3 py-1 rounded-lg"
                  >
                    📊 Stats
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
                    className="bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs px-3 py-1 rounded-lg"
                  >
                    ⚙️ Config
                  </Button>
                </>
              )}

              <div className="text-right">
                <p className="text-sm font-bold">{userName}</p>
                <p className="text-xs text-orange-100">
                  {userRole === "telefonista" && `📞 ${myClientsSent} clientes`}
                  {userRole === "escort" && "💃 Escort"}
                  {userRole === "admin" && "👑 Admin"}
                </p>
                {myBadges.length > 0 && (
                  <p className="text-xs">{myBadges.map(badge => BADGES[badge as keyof typeof BADGES].icon).join(" ")}</p>
                )}
              </div>
              
              <Button
                onClick={handleLeaveChat}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-2"
              >
                🚪
              </Button>
            </div>
          </div>
        </div>

        {/* BANNER SEGURIDAD */}
        <div className="bg-red-50 border-b-2 border-red-200 p-2 text-center">
          <p className="text-xs text-red-600 font-medium">
            🚫 Prohibido compartir números, links o redes sociales
          </p>
        </div>

        {/* ESTADO ESCORTS */}
        {escorts.map(escort => (
          <div
            key={escort.id}
            className={cn(
              "flex items-center justify-between p-3 border-b-2",
              escortStatus === "disponible" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", escortStatus === "disponible" ? "bg-green-500 animate-pulse" : "bg-red-500")}></div>
              <span className="font-bold text-sm">
                {escort.name} {escortStatus === "disponible" ? "DISPONIBLE 🟢" : "OCUPADA 🔴"}
              </span>
            </div>

            {userRole === "escort" && escort.id === currentUserId && (
              <Button
                onClick={toggleEscortStatus}
                className={cn("h-8 text-sm font-bold rounded-lg", escortStatus === "disponible" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600")}
              >
                {escortStatus === "disponible" ? "Marcar Ocupada" : "Marcar Disponible"}
              </Button>
            )}
          </div>
        ))}

        {/* COLA */}
        {waitingClients.length > 0 && (
          <div className="p-4 bg-yellow-50 border-b-2 border-yellow-200">
            <p className="text-sm font-bold text-yellow-700 mb-2">
              ⏳ {waitingClients.length} Cliente{waitingClients.length !== 1 ? "s" : ""} en Espera
            </p>
            <div className="space-y-2">
              {waitingClients.map((code, index) => (
                <div key={index} className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border-2 border-yellow-300">
                  <span className="font-mono font-bold text-2xl text-gray-800">{code}</span>
                  {userRole === "escort" && (
                    <button
                      onClick={() => setSelectedClientForPrice(code)}
                      disabled={processingClient === code}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all",
                        processingClient === code ? "bg-gray-300 cursor-not-allowed" : "bg-green-500 hover:bg-green-600 text-white shadow-lg hover:scale-105"
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

        {/* MENSAJES */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
          {messages.map((msg) => {
            const isForMe = msg.recipientId === currentUserId || msg.senderId === currentUserId;
            if (msg.isPrivate && !isForMe && userRole !== "admin") return null;

            return (
              <div
                key={msg.id}
                className={cn("flex", msg.sender === userName && !msg.isSystem ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2 shadow",
                    msg.isSystem
                      ? msg.isWarning
                        ? "bg-red-100 text-red-700 border-2 border-red-300 w-full max-w-none text-center font-bold"
                        : "bg-gray-100 text-gray-600 w-full max-w-none text-center text-sm italic"
                      : msg.isClientCode
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold border-2 border-orange-300 animate-pulse"
                      : msg.isPrivate
                      ? "bg-purple-100 text-purple-800 border-2 border-purple-300"
                      : msg.sender === userName
                      ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white"
                      : "bg-white text-gray-800 border-2 border-gray-200"
                  )}
                >
                  {!msg.isSystem && (
                    <p className="text-xs font-bold mb-1 opacity-80">
                      {msg.sender}
                      {msg.isPrivate && " 🔒"}
                    </p>
                  )}
                  <p className="text-sm break-words">{msg.text}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="border-t-2 border-gray-200 p-4 bg-white space-y-3">
          {userRole === "telefonista" && (
            <div className="flex gap-2">
              <Input
                type="text"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyPress={(e) => e.key === "Enter" && sendClientCode()}
                placeholder="4 dígitos"
                className="flex-1 h-12 text-center text-lg font-mono font-bold border-2 border-gray-300"
                maxLength={4}
              />
              <Button
                onClick={sendClientCode}
                disabled={clientCode.length !== 4}
                className="h-12 px-6 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-lg shadow-lg"
              >
                📞 Enviar
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {QUICK_MESSAGES[userRole === "escort" ? "escort" : "telefonista"].map((msg, index) => (
              <button
                key={index}
                onClick={() => sendMessage(msg)}
                className="px-3 py-1.5 text-xs font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg border border-gray-300"
              >
                {msg}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Mensaje..."
              className="flex-1 h-10 border-2 border-gray-300"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!newMessage.trim()}
              className="h-10 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
            >
              📤
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL RANKING */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showRankingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border-2 border-orange-300 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-orange-600">🏆 Ranking Semanal</h3>
              <button onClick={() => setShowRankingModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="space-y-4">
              {topTelefonistas.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay telefonistas en el ranking</p>
              ) : (
                topTelefonistas.map((tel, index) => {
                  const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                  const bgColor = index === 0 ? "bg-yellow-50 border-yellow-300" : index === 1 ? "bg-gray-50 border-gray-300" : "bg-orange-50 border-orange-300";
                  
                  return (
                    <div key={tel.id} className={cn("flex items-center justify-between p-4 rounded-xl border-2", bgColor)}>
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{medal}</span>
                        <div>
                          <p className="font-bold text-lg">{tel.name}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>📞 {tel.clientsSent} clientes</span>
                            {tel.rating && tel.rating > 0 && <span>⭐ {tel.rating.toFixed(1)}</span>}
                          </div>
                          {tel.badges && tel.badges.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {tel.badges.map(badge => (
                                <span key={badge} className="text-lg">{BADGES[badge as keyof typeof BADGES].icon}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {userRole === "escort" && (
                        <Button
                          onClick={() => {
                            setSelectedTelefonistaToRate(tel.id);
                            setShowRankingModal(false);
                            setShowRatingModal(true);
                          }}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 rounded-lg"
                        >
                          ⭐ Calificar
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL ESTADÍSTICAS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showStatsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border-2 border-blue-300 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-blue-600">📊 Panel Admin</h3>
              <button onClick={() => setShowStatsModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-orange-50 p-4 rounded-xl border-2 border-orange-200">
                <p className="text-xs text-orange-600 font-medium mb-1">Total Clientes</p>
                <p className="text-3xl font-bold text-orange-600">
                  {participants.reduce((sum, p) => sum + (p.clientsSent || 0), 0)}
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-xl border-2 border-green-200">
                <p className="text-xs text-green-600 font-medium mb-1">Telefonistas</p>
                <p className="text-3xl font-bold text-green-600">{telefonistas.length}</p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
                <p className="text-xs text-blue-600 font-medium mb-1">Escorts</p>
                <p className="text-3xl font-bold text-blue-600">{escorts.length}</p>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-700 mb-3">📞 Telefonistas</h4>
              <div className="space-y-2">
                {telefonistas.map(tel => (
                  <div key={tel.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <p className="font-bold">{tel.name}</p>
                      <p className="text-xs text-gray-600">
                        {tel.clientsSent} clientes
                        {tel.badges && tel.badges.length > 0 && (
                          <span className="ml-2">{tel.badges.map(badge => BADGES[badge as keyof typeof BADGES].icon).join(" ")}</span>
                        )}
                      </p>
                    </div>
                    
                    <div className="text-right mr-3">
                      <p className="text-sm text-gray-600">Último cliente:</p>
                      <p className="text-xs font-medium text-orange-600">{getTimeSinceLastClient(tel.lastClientTime)}</p>
                    </div>

                    <Button
                      onClick={() => {
                        setPrivateChatRecipient(tel.id);
                        setShowStatsModal(false);
                        setShowPrivateChat(true);
                      }}
                      className="bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1 rounded-lg"
                    >
                      💬
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-lg font-bold text-gray-700 mb-3">💃 Escorts</h4>
              <div className="space-y-2">
                {escorts.map(esc => (
                  <div key={esc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="font-bold">{esc.name}</p>
                      <p className="text-xs text-gray-600">
                        {escortStatus === "disponible" ? "🟢 Disponible" : "🔴 Ocupada"}
                      </p>
                    </div>

                    <Button
                      onClick={() => {
                        setPrivateChatRecipient(esc.id);
                        setShowStatsModal(false);
                        setShowPrivateChat(true);
                      }}
                      className="bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1 rounded-lg"
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL CALIFICAR */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showRatingModal && selectedTelefonistaToRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-orange-300 p-6">
            <h3 className="text-2xl font-bold text-orange-600 mb-4">⭐ Calificar</h3>
            
            <p className="text-gray-600 mb-4">
              ¿Cómo fue tu experiencia con <span className="font-bold">{participants.find(p => p.id === selectedTelefonistaToRate)?.name}</span>?
            </p>

            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={cn("text-4xl transition-transform hover:scale-110", star <= rating ? "text-yellow-500" : "text-gray-300")}
                >
                  ⭐
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={rateTelefonista} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-3">
                Enviar
              </Button>
              <Button
                onClick={() => {
                  setShowRatingModal(false);
                  setSelectedTelefonistaToRate(null);
                  setRating(5);
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg py-3"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL CHAT PRIVADO */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showPrivateChat && privateChatRecipient && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-purple-300 p-6">
            <h3 className="text-2xl font-bold text-purple-600 mb-4">💬 Mensaje Privado</h3>
            
            <p className="text-gray-600 mb-4">
              Para: <span className="font-bold">{participants.find(p => p.id === privateChatRecipient)?.name}</span>
            </p>

            <textarea
              value={privateMessage}
              onChange={(e) => setPrivateMessage(e.target.value)}
              placeholder="Escribe..."
              className="w-full h-32 p-3 border-2 border-gray-300 rounded-lg resize-none focus:border-purple-500 outline-none"
            />

            <div className="flex gap-2 mt-4">
              <Button
                onClick={sendPrivateMessage}
                disabled={!privateMessage.trim()}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg py-3"
              >
                Enviar 📤
              </Button>
              <Button
                onClick={() => {
                  setShowPrivateChat(false);
                  setPrivateChatRecipient(null);
                  setPrivateMessage("");
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg py-3"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL CONFIGURACIÓN */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showSettingsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-purple-300 p-6">
            <h3 className="text-2xl font-bold text-purple-600 mb-4">⚙️ Configuración</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">💃 Máx Escorts</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={editingSettings.maxEscorts}
                  onChange={(e) => setEditingSettings({...editingSettings, maxEscorts: e.target.value})}
                  className="h-10"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">📞 Máx Telefonistas</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={editingSettings.maxTelefonistas}
                  onChange={(e) => setEditingSettings({...editingSettings, maxTelefonistas: e.target.value})}
                  className="h-10"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">💰 Precios</label>
                <div className="space-y-2">
                  {editingSettings.prices.map((price, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={price}
                        onChange={(e) => {
                          const newPrices = [...editingSettings.prices];
                          newPrices[index] = e.target.value;
                          setEditingSettings({...editingSettings, prices: newPrices});
                        }}
                        className="flex-1 h-10"
                      />
                      {editingSettings.prices.length > 1 && (
                        <button
                          onClick={() => setEditingSettings({
                            ...editingSettings,
                            prices: editingSettings.prices.filter((_, i) => i !== index)
                          })}
                          className="text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {editingSettings.prices.length < 5 && (
                    <Button
                      onClick={() => setEditingSettings({
                        ...editingSettings,
                        prices: [...editingSettings.prices, ""]
                      })}
                      className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700"
                    >
                      ➕ Precio
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={saveSettings} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
                Guardar
              </Button>
              <Button onClick={() => setShowSettingsModal(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL SELECCIONAR PRECIO */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {selectedClientForPrice && userRole === "escort" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-green-300 p-6">
            <h3 className="text-2xl font-bold text-green-600 mb-2">Cliente: {selectedClientForPrice}</h3>
            <p className="text-gray-600 mb-6">Precio que pagó:</p>
            
            <div className="space-y-3">
              {roomSettings.prices.map((price, index) => (
                <button
                  key={index}
                  onClick={() => markClientAttended(selectedClientForPrice, price)}
                  className="w-full h-16 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold text-2xl rounded-xl transition-all hover:scale-105 shadow-lg"
                >
                  ${price}
                </button>
              ))}
            </div>

            <Button
              onClick={() => setSelectedClientForPrice(null)}
              className="w-full mt-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg py-3"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
