"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UserRole = "escort" | "telefonista" | "admin";
type EscortStatus = "disponible" | "ocupada";
type ThemeName = "scarface" | "elpatron";

interface ChatTheme {
  name: string; icon: string; bgImage: string; primary: string; secondary: string; text: string; accent: string; cardBg: string;
}

const THEMES: Record<ThemeName, ChatTheme> = {
  scarface: { name: "SCARFACE", icon: "🎬", bgImage: "/temas/scarface.png", primary: "from-amber-600 to-yellow-700", secondary: "from-gray-900 to-black", text: "text-amber-400", accent: "bg-amber-500", cardBg: "bg-black/85" },
  elpatron: { name: "EL PATRÓN", icon: "💎", bgImage: "/temas/elpatron.png", primary: "from-yellow-500 to-amber-600", secondary: "from-orange-600 to-red-700", text: "text-yellow-400", accent: "bg-yellow-500", cardBg: "bg-black/90" },
};

interface Message { id: string; text: string; sender: string; senderId: string; timestamp: number; isSystem: boolean; isClientCode?: boolean; clientCode?: string; isWarning?: boolean; isPrivate?: boolean; recipientId?: string; }
interface Participant { id: string; name: string; role: UserRole; joinedAt: number; lastActive: number; violations: number; clientsSent: number; lastClientTime?: number; rating?: number; totalRatings?: number; badges?: string[]; }
interface RoomSettings { maxEscorts: number; maxTelefonistas: number; prices: number[]; turnsEnabled: boolean; soundEnabled: boolean; notificationsEnabled: boolean; theme: ThemeName; }
interface RoomData { messages: Record<string, Message>; participants: Record<string, Participant>; escortStatus: EscortStatus; waitingClients: string[]; settings: RoomSettings; createdAt: number; creatorId: string; }

const FIREBASE_URL = "https://megapersonals-4f24c-default-rtdb.firebaseio.com";
const QUICK_MESSAGES = { telefonista: ["Cliente abajo", "Cliente llegando en 5 min", "Cliente esperando", "Cliente canceló"], escort: ["En camino", "Ya estoy lista", "Dame 5 minutos"] };
const BADGES = { gold: { name: "Oro", icon: "🥇", requirement: 100 }, silver: { name: "Plata", icon: "🥈", requirement: 50 }, bronze: { name: "Bronce", icon: "🥉", requirement: 25 } };

const detectProhibitedContent = (text: string): { isProhibited: boolean; reason: string } => {
  const lowerText = text.toLowerCase(); const cleanText = text.replace(/[\s\-_.()]/g, "");
  const phonePatterns = [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, /\b\d{10,11}\b/g, /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g, /\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3}[-.\s]?\d{4}/g];
  for (const pattern of phonePatterns) { if (pattern.test(text)) return { isProhibited: true, reason: "números de teléfono" }; }
  const urlPatterns = [/https?:\/\//gi, /www\./gi, /\b\w+\.(com|net|org|edu|gov|io|co|me|info)\b/gi];
  for (const pattern of urlPatterns) { if (pattern.test(text)) return { isProhibited: true, reason: "links o URLs" }; }
  const socialPatterns = [/\bwhatsapp\b|\bwpp\b/gi, /\binstagram\b|\binsta\b/gi, /\bfacebook\b|\bface\b/gi, /\btelegram\b/gi];
  for (const pattern of socialPatterns) { if (pattern.test(lowerText)) return { isProhibited: true, reason: "redes sociales" }; }
  const longNumbers = cleanText.match(/\d{7,}/g); if (longNumbers) return { isProhibited: true, reason: "números de teléfono" };
  return { isProhibited: false, reason: "" };
};

export function ChatGrupal() {
  const [step, setStep] = useState<"room-select" | "join" | "chat">("room-select");
  const [roomCode, setRoomCode] = useState(""); const [userName, setUserName] = useState(""); const [userRole, setUserRole] = useState<UserRole>("telefonista");
  const [isCreator, setIsCreator] = useState(false); const [messages, setMessages] = useState<Message[]>([]); const [newMessage, setNewMessage] = useState("");
  const [clientCode, setClientCode] = useState(""); const [escortStatus, setEscortStatus] = useState<EscortStatus>("disponible");
  const [waitingClients, setWaitingClients] = useState<string[]>([]); const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState(""); const [isJoining, setIsJoining] = useState(false);
  const [processingClient, setProcessingClient] = useState<string | null>(null); const [selectedTheme, setSelectedTheme] = useState<ThemeName>("scarface");
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({ maxEscorts: 1, maxTelefonistas: 10, prices: [100, 150, 200], turnsEnabled: false, soundEnabled: true, notificationsEnabled: true, theme: "scarface" });
  const [showSettingsModal, setShowSettingsModal] = useState(false); const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false); const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedTelefonistaToRate, setSelectedTelefonistaToRate] = useState<string | null>(null); const [rating, setRating] = useState(5);
  const [selectedClientForPrice, setSelectedClientForPrice] = useState<string | null>(null); const [myViolations, setMyViolations] = useState(0);
  const [myClientsSent, setMyClientsSent] = useState(0); const [myBadges, setMyBadges] = useState<string[]>([]);
  const [showPrivateChat, setShowPrivateChat] = useState(false); const [privateChatRecipient, setPrivateChatRecipient] = useState<string | null>(null);
  const [privateMessage, setPrivateMessage] = useState(""); const [editingSettings, setEditingSettings] = useState({ maxEscorts: "1", maxTelefonistas: "10", prices: ["100", "150", "200"] });
  
  const messagesEndRef = useRef<HTMLDivElement>(null); const messagesContainerRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null); const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false); const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentTheme = THEMES[selectedTheme];

  // ✅ SCROLL INTELIGENTE ARREGLADO - NO baja si estás leyendo arriba
  const scrollToBottom = (force: boolean = false) => {
    if (!messagesEndRef.current || !messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Solo hacer scroll si: (1) se fuerza O (2) estás a menos de 100px del final Y no estás scrolleando manualmente
    if (force || (distanceFromBottom < 100 && !isUserScrolling)) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Detectar cuando el usuario hace scroll manual
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setIsUserScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setIsUserScrolling(distanceFromBottom > 100);
      }, 150);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { scrollToBottom(false); }, [messages]);

  useEffect(() => {
    if (step === "chat") localStorage.setItem("chatSession", JSON.stringify({ roomCode, userName, userRole, currentUserId, isCreator, timestamp: Date.now() }));
  }, [step, roomCode, userName, userRole, currentUserId, isCreator]);

  useEffect(() => {
    const savedSession = localStorage.getItem("chatSession");
    if (savedSession) {
      const session = JSON.parse(savedSession); const isOld = Date.now() - session.timestamp > 24 * 60 * 60 * 1000;
      if (!isOld) { setRoomCode(session.roomCode); setUserName(session.userName); setUserRole(session.userRole); setCurrentUserId(session.currentUserId); setIsCreator(session.isCreator); setStep("chat"); }
      else { localStorage.removeItem("chatSession"); }
    }
  }, []);

  const playNotification = () => {
    if (!roomSettings.soundEnabled) return;
    const beep = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator(); const gainNode = audioContext.createGain();
        oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 1000; oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {}
    };
    beep(); setTimeout(beep, 250); setTimeout(beep, 500);
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    if (roomSettings.notificationsEnabled && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        const notification = new Notification("🔔 NUEVO CLIENTE ABAJO", { body: "Un telefonista ha enviado un cliente", requireInteraction: true, vibrate: [300, 100, 300] });
        setTimeout(() => notification.close(), 10000);
      } else if (Notification.permission !== "denied") { Notification.requestPermission(); }
    }
  };

  useEffect(() => {
    if (step !== "chat" || !roomCode || !currentUserId) return;
    const updateHeartbeat = async () => {
      try { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/lastActive.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Date.now()) }); } catch (error) {}
    };
    updateHeartbeat(); heartbeatIntervalRef.current = setInterval(updateHeartbeat, 5000);
    return () => { if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current); };
  }, [step, roomCode, currentUserId]);

  useEffect(() => {
    if (step !== "chat" || !roomCode) return;
    const syncChat = async () => {
      try {
        const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`); const data: RoomData | null = await response.json();
        if (data) {
          const messagesArray = data.messages ? Object.values(data.messages).sort((a, b) => a.timestamp - b.timestamp) : [];
          if (userRole === "escort" && messagesArray.length > messages.length) { const newMsg = messagesArray[messagesArray.length - 1]; if (newMsg.isClientCode) playNotification(); }
          setMessages(messagesArray);
          if (data.participants) {
            const now = Date.now(); const activeParticipants: Record<string, Participant> = {}; let hasInactive = false;
            for (const [id, participant] of Object.entries(data.participants)) {
              if (now - participant.lastActive < 30000) { activeParticipants[id] = participant; } else { hasInactive = true; }
            }
            if (hasInactive) { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(activeParticipants) }); }
            setParticipants(Object.values(activeParticipants)); const myData = activeParticipants[currentUserId];
            if (myData) { setMyViolations(myData.violations || 0); setMyClientsSent(myData.clientsSent || 0); setMyBadges(myData.badges || []); }
          }
          if (data.escortStatus) setEscortStatus(data.escortStatus);
          if (data.waitingClients) setWaitingClients(data.waitingClients);
          if (data.settings) { setRoomSettings(data.settings); setSelectedTheme(data.settings.theme); }
        }
      } catch (error) {}
    };
    syncChat(); syncIntervalRef.current = setInterval(syncChat, 2000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [step, roomCode, messages.length, userRole, currentUserId]);

  useEffect(() => {
    if (step === "chat" && userRole === "escort" && typeof Notification !== "undefined") { if (Notification.permission === "default") Notification.requestPermission(); }
  }, [step, userRole]);

  const changeTheme = async (newTheme: ThemeName) => {
    setSelectedTheme(newTheme);
    try { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings/theme.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTheme) }); } catch (error) {}
  };

  const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const handleCreateRoom = () => { const newRoomCode = generateRoomCode(); setRoomCode(newRoomCode); setIsCreator(true); setStep("join"); };

  const handleJoinExistingRoom = () => { if (!roomCode.trim()) { alert("Por favor ingresa el código de la sala"); return; } setIsCreator(false); setStep("join"); };

  const handleJoin = async () => {
    if (!userName.trim()) { alert("Por favor ingresa tu nombre"); return; }
    if (isJoining) return; setIsJoining(true);
    try {
      const checkResponse = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`); const existingRoom: RoomData | null = await checkResponse.json();
      if (existingRoom?.participants) {
        const existingUser = Object.values(existingRoom.participants).find(p => p.name.toLowerCase() === userName.trim().toLowerCase());
        if (existingUser) { alert("Este nombre ya está en uso. Elige otro."); setIsJoining(false); return; }
        if (!isCreator) {
          const currentRoles = Object.values(existingRoom.participants);
          const escortCount = currentRoles.filter(p => p.role === "escort").length; const telefonistaCount = currentRoles.filter(p => p.role === "telefonista").length;
          if (userRole === "escort" && escortCount >= existingRoom.settings.maxEscorts) { alert(`Máximo de escorts alcanzado (${existingRoom.settings.maxEscorts})`); setIsJoining(false); return; }
          if (userRole === "telefonista" && telefonistaCount >= existingRoom.settings.maxTelefonistas) { alert(`Máximo de telefonistas alcanzado (${existingRoom.settings.maxTelefonistas})`); setIsJoining(false); return; }
        }
      }
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; setCurrentUserId(userId);
      const finalRole: UserRole = isCreator ? "admin" : userRole;
      const newParticipant: Participant = { id: userId, name: userName.trim(), role: finalRole, joinedAt: Date.now(), lastActive: Date.now(), violations: 0, clientsSent: 0, lastClientTime: 0, rating: 0, totalRatings: 0, badges: [] };
      const getRoleLabel = (role: UserRole) => { switch (role) { case "escort": return "Escort"; case "telefonista": return "Telefonista"; case "admin": return "Administrador"; } };
      const welcomeMsg: Message = { id: `msg_${Date.now()}`, text: `${userName.trim()} se ha unido (${getRoleLabel(finalRole)})`, sender: "Sistema", senderId: "system", timestamp: Date.now(), isSystem: true };
      if (!existingRoom) {
        const initialData: RoomData = { messages: { [welcomeMsg.id]: welcomeMsg }, participants: { [userId]: newParticipant }, escortStatus: "disponible", waitingClients: [], settings: { maxEscorts: 1, maxTelefonistas: 10, prices: [100, 150, 200], turnsEnabled: false, soundEnabled: true, notificationsEnabled: true, theme: selectedTheme }, createdAt: Date.now(), creatorId: userId };
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialData) });
      } else {
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${userId}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newParticipant) });
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${welcomeMsg.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(welcomeMsg) });
      }
      if (isCreator) setUserRole("admin"); setStep("chat");
    } catch (error) { alert("Error al unirse a la sala"); } finally { setIsJoining(false); }
  };

  const getTopTelefonistas = () => { const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; return participants.filter(p => p.role === "telefonista" && p.joinedAt > oneWeekAgo).sort((a, b) => b.clientsSent - a.clientsSent).slice(0, 3); };

  const getTimeSinceLastClient = (timestamp?: number) => { if (!timestamp) return "Nunca"; const diff = Date.now() - timestamp; const minutes = Math.floor(diff / 60000); if (minutes < 1) return "Ahora mismo"; if (minutes < 60) return `Hace ${minutes} min`; const hours = Math.floor(minutes / 60); if (hours < 24) return `Hace ${hours}h`; const days = Math.floor(hours / 24); return `Hace ${days}d`; };

  const calculateBadges = (clientsSent: number): string[] => { const earnedBadges: string[] = []; if (clientsSent >= 100) earnedBadges.push("gold"); else if (clientsSent >= 50) earnedBadges.push("silver"); else if (clientsSent >= 25) earnedBadges.push("bronze"); return earnedBadges; };

  const registerViolation = async (reason: string) => {
    try {
      const newViolations = myViolations + 1;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/violations.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newViolations) });
      setMyViolations(newViolations); let warningText = `⚠️ ADVERTENCIA: No está permitido enviar ${reason} en el chat.`;
      if (newViolations >= 3) {
        warningText += `\n\n🚨 Has sido advertido ${newViolations} veces. El administrador ha sido notificado.`;
        const adminAlert: Message = { id: `msg_${Date.now()}_alert`, text: `🚨 ALERTA: ${userName} ha intentado enviar ${reason} (${newViolations} infracciones)`, sender: "Sistema", senderId: "system", timestamp: Date.now(), isSystem: true, isWarning: true };
        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${adminAlert.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adminAlert) });
      }
      alert(warningText);
    } catch (error) {}
  };

  const sendMessage = async (customText?: string) => {
    const text = customText || newMessage.trim(); if (!text) return;
    const { isProhibited, reason } = detectProhibitedContent(text); if (isProhibited) { await registerViolation(reason); setNewMessage(""); return; }
    const message: Message = { id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, text, sender: userName, senderId: currentUserId, timestamp: Date.now(), isSystem: false };
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      if (!customText) setNewMessage(""); setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {}
  };

  const sendPrivateMessage = async () => {
    if (!privateMessage.trim() || !privateChatRecipient) return;
    const message: Message = { id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, text: privateMessage.trim(), sender: userName, senderId: currentUserId, timestamp: Date.now(), isSystem: false, isPrivate: true, recipientId: privateChatRecipient };
    try { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) }); setPrivateMessage(""); setShowPrivateChat(false); alert("Mensaje privado enviado"); } catch (error) {}
  };

  const sendClientCode = async () => {
    if (clientCode.length !== 4 || !/^\d{4}$/.test(clientCode)) { alert("El código debe ser 4 dígitos"); return; }
    const message: Message = { id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, text: `🔔 CLIENTE ABAJO - Terminal: ${clientCode}`, sender: userName, senderId: currentUserId, timestamp: Date.now(), isSystem: false, isClientCode: true, clientCode: clientCode };
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`); const currentWaiting = await response.json() || []; const updatedWaiting = [...currentWaiting, clientCode];
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedWaiting) });
      const newCount = myClientsSent + 1;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/clientsSent.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCount) });
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/lastClientTime.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Date.now()) });
      const newBadges = calculateBadges(newCount); if (newBadges.length > 0) { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}/badges.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBadges) }); }
      setMyClientsSent(newCount); setClientCode(""); setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {}
  };

  const toggleEscortStatus = async () => {
    const newStatus: EscortStatus = escortStatus === "disponible" ? "ocupada" : "disponible";
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/escortStatus.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStatus) });
      const message: Message = { id: `msg_${Date.now()}`, text: `🚦 ${userName} ahora está ${newStatus === "ocupada" ? "OCUPADA" : "DISPONIBLE"}`, sender: "Sistema", senderId: "system", timestamp: Date.now(), isSystem: true };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      setEscortStatus(newStatus);
    } catch (error) {}
  };

  const markClientAttended = async (code: string, price: number) => {
    if (processingClient === code) return; setProcessingClient(code);
    try {
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`); const currentWaiting = await response.json() || []; const updatedWaiting = currentWaiting.filter((c: string) => c !== code);
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedWaiting) });
      const message: Message = { id: `msg_${Date.now()}`, text: `✅ Cliente ${code} atendido por ${userName} - PAGÓ $${price}`, sender: "Sistema", senderId: "system", timestamp: Date.now(), isSystem: true };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      setSelectedClientForPrice(null);
    } catch (error) {} finally { setTimeout(() => setProcessingClient(null), 2000); }
  };

  const rateTelefonista = async () => {
    if (!selectedTelefonistaToRate || rating < 1 || rating > 5) return;
    try {
      const telefonistaData = participants.find(p => p.id === selectedTelefonistaToRate); if (!telefonistaData) return;
      const currentRating = telefonistaData.rating || 0; const currentTotal = telefonistaData.totalRatings || 0; const newTotal = currentTotal + 1; const newRating = ((currentRating * currentTotal) + rating) / newTotal;
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${selectedTelefonistaToRate}/rating.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRating) });
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${selectedTelefonistaToRate}/totalRatings.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTotal) });
      setShowRatingModal(false); setSelectedTelefonistaToRate(null); setRating(5); alert("Calificación enviada");
    } catch (error) {}
  };

  const saveSettings = async () => {
    const maxEscorts = parseInt(editingSettings.maxEscorts); const maxTelefonistas = parseInt(editingSettings.maxTelefonistas); const newPrices = editingSettings.prices.map(p => parseInt(p)).filter(p => !isNaN(p) && p > 0);
    if (isNaN(maxEscorts) || maxEscorts < 1 || maxEscorts > 10) { alert("Escorts: 1-10"); return; }
    if (isNaN(maxTelefonistas) || maxTelefonistas < 1 || maxTelefonistas > 20) { alert("Telefonistas: 1-20"); return; }
    if (newPrices.length === 0) { alert("Configura al menos un precio"); return; }
    const newSettings: RoomSettings = { ...roomSettings, maxEscorts, maxTelefonistas, prices: newPrices, theme: selectedTheme };
    try { await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newSettings) }); setRoomSettings(newSettings); setShowSettingsModal(false); alert("Configuración actualizada"); } catch (error) { alert("Error al guardar"); }
  };

  const handleLeaveChat = async () => {
    const confirmLeave = confirm("¿Seguro que quieres salir?"); if (!confirmLeave) return;
    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}.json`, { method: "DELETE" });
      const leaveMsg: Message = { id: `msg_${Date.now()}`, text: `${userName} ha salido del chat`, sender: "Sistema", senderId: "system", timestamp: Date.now(), isSystem: true };
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${leaveMsg.id}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leaveMsg) });
    } catch (error) {}
    localStorage.removeItem("chatSession"); setStep("room-select"); setRoomCode(""); setUserName(""); setMessages([]); setParticipants([]);
  };

  const escorts = participants.filter(p => p.role === "escort"); const telefonistas = participants.filter(p => p.role === "telefonista"); const topTelefonistas = getTopTelefonistas();

  if (step === "room-select") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border-2 border-amber-500/50 bg-black/90 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className={`bg-gradient-to-r ${currentTheme.primary} p-6 text-center`}>
            <h1 className="text-3xl font-bold text-white mb-1">{currentTheme.name}</h1>
            <p className="text-amber-100 text-sm">Sistema de Gestión</p>
          </div>
          <div className="p-6 space-y-4">
            <Button onClick={handleCreateRoom} className={`w-full h-12 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white font-bold rounded-lg`}>➕ Crear Sala</Button>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-600"></div></div><div className="relative flex justify-center text-sm"><span className="px-3 bg-black text-gray-400">o</span></div></div>
            <div><label className="block text-xs font-bold text-amber-400 mb-1">Código de Sala</label><Input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} onKeyPress={(e) => e.key === "Enter" && handleJoinExistingRoom()} placeholder="ABC123" className="h-10 text-center text-lg uppercase font-bold bg-black/50 border-2 border-amber-500 text-amber-300" maxLength={6} /></div>
            <Button onClick={handleJoinExistingRoom} disabled={!roomCode.trim()} className={`w-full h-10 bg-gradient-to-r ${currentTheme.secondary} hover:opacity-90 text-white font-bold rounded-lg`}>🔑 Unirse</Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "join") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border-2 border-amber-500/50 bg-black/90 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className={`bg-gradient-to-r ${currentTheme.primary} p-4`}>
            <button onClick={() => setStep("room-select")} className="text-white hover:opacity-80 mb-2">← Volver</button>
            <h1 className="text-2xl font-bold text-white text-center">Sala: {roomCode}</h1>
            {isCreator && <p className="text-center text-amber-100 text-xs mt-1">👑 Admin</p>}
          </div>
          <div className="p-6 space-y-4">
            <div><label className="block text-xs font-bold text-amber-400 mb-1">Tu Nombre</label><Input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej: Maria" className="h-10 bg-black/50 border-2 border-amber-500 text-amber-300" /></div>
            {!isCreator && (
              <div>
                <label className="block text-xs font-bold text-amber-400 mb-2">Tu Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setUserRole("escort")} className={cn("h-16 rounded-lg border-2 font-bold transition-all flex flex-col items-center justify-center", userRole === "escort" ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-gray-600 bg-black/30 text-gray-400")}><span className="text-2xl">💃</span><span className="text-xs">Escort</span></button>
                  <button onClick={() => setUserRole("telefonista")} className={cn("h-16 rounded-lg border-2 font-bold transition-all flex flex-col items-center justify-center", userRole === "telefonista" ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-gray-600 bg-black/30 text-gray-400")}><span className="text-2xl">📞</span><span className="text-xs">Telefonista</span></button>
                </div>
              </div>
            )}
            <Button onClick={handleJoin} disabled={!userName.trim() || isJoining} className={`w-full h-12 bg-gradient-to-r ${currentTheme.primary} hover:opacity-90 text-white font-bold rounded-lg`}>{isJoining ? "..." : isCreator ? "Crear" : "Entrar"}</Button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ CHAT PRINCIPAL - DISEÑO MÓVIL FULLSCREEN TIPO WHATSAPP
  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header compacto */}
      <div className={`bg-gradient-to-r ${currentTheme.primary} px-3 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{currentTheme.icon}</span>
          <div><p className="text-white font-bold text-sm">{roomCode}</p><p className="text-amber-100 text-xs">{participants.length} online</p></div>
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={() => setShowRankingModal(true)} className="bg-yellow-500/90 hover:bg-yellow-600 text-black text-xs px-2 py-1 h-7 rounded">🏆</Button>
          {userRole === "admin" && (
            <>
              <Button onClick={() => setShowStatsModal(true)} className="bg-blue-500/90 hover:bg-blue-600 text-white text-xs px-2 py-1 h-7 rounded">📊</Button>
              <Button onClick={() => { setEditingSettings({ maxEscorts: roomSettings.maxEscorts.toString(), maxTelefonistas: roomSettings.maxTelefonistas.toString(), prices: roomSettings.prices.map(p => p.toString()) }); setShowSettingsModal(true); }} className="bg-purple-500/90 hover:bg-purple-600 text-white text-xs px-2 py-1 h-7 rounded">⚙️</Button>
            </>
          )}
          <Button onClick={handleLeaveChat} className="bg-red-500/90 hover:bg-red-600 text-white px-2 py-1 h-7 rounded">🚪</Button>
        </div>
      </div>

      {/* Alerta */}
      <div className="bg-red-900/80 px-3 py-1 text-center"><p className="text-[10px] text-red-200">🚫 Prohibido números, links o redes sociales</p></div>

      {/* Estado Escort */}
      {escorts.map(escort => (
        <div key={escort.id} className={cn("px-3 py-2 flex items-center justify-between text-sm", escortStatus === "disponible" ? "bg-green-900/30" : "bg-red-900/30")}>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", escortStatus === "disponible" ? "bg-green-500 animate-pulse" : "bg-red-500")}></div>
            <span className="font-bold text-white text-xs">{escort.name} {escortStatus === "disponible" ? "🟢" : "🔴"}</span>
          </div>
          {userRole === "escort" && escort.id === currentUserId && (
            <Button onClick={toggleEscortStatus} className={cn("h-6 text-[10px] font-bold rounded px-2", escortStatus === "disponible" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600")}>{escortStatus === "disponible" ? "Ocupada" : "Disponible"}</Button>
          )}
        </div>
      ))}

      {/* Clientes en espera */}
      {waitingClients.length > 0 && (
        <div className="px-3 py-2 bg-yellow-900/30">
          <p className="text-xs font-bold text-yellow-300 mb-2">⏳ {waitingClients.length} en espera</p>
          <div className="space-y-2">
            {waitingClients.map((code, index) => (
              <div key={index} className="flex items-center justify-between bg-black/50 p-2 rounded border border-yellow-600">
                <span className="font-mono font-bold text-lg text-yellow-300">{code}</span>
                {userRole === "escort" && (
                  <button onClick={() => setSelectedClientForPrice(code)} disabled={processingClient === code} className={cn("px-3 py-1 rounded font-bold text-xs transition-all", processingClient === code ? "bg-gray-600 cursor-not-allowed" : "bg-green-500 hover:bg-green-600 text-white")}>✓ Atendido</button>
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
        {/* Overlay oscuro */}
        <div className="absolute inset-0 bg-black/70 pointer-events-none"></div>
        
        {/* Mensajes */}
        <div className="relative z-10 space-y-2">
          {messages.map((msg) => {
            const isForMe = msg.recipientId === currentUserId || msg.senderId === currentUserId;
            if (msg.isPrivate && !isForMe && userRole !== "admin") return null;
            return (
              <div key={msg.id} className={cn("flex", msg.sender === userName && !msg.isSystem ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-lg px-3 py-2 shadow-lg", msg.isSystem ? msg.isWarning ? "bg-red-900/90 text-red-200 text-center text-xs font-bold mx-auto" : "bg-gray-800/90 text-gray-300 text-center text-[10px] italic mx-auto" : msg.isClientCode ? "bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold animate-pulse" : msg.isPrivate ? "bg-purple-900/90 text-purple-200" : msg.sender === userName ? `bg-gradient-to-r ${currentTheme.primary} text-white` : "bg-gray-800/90 text-gray-200")}>
                  {!msg.isSystem && <p className="text-[10px] font-bold mb-1 opacity-80">{msg.sender}{msg.isPrivate && " 🔒"}</p>}
                  <p className="text-sm break-words">{msg.text}</p>
                  <p className="text-[9px] opacity-70 mt-1">{new Date(msg.timestamp).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input de mensajes */}
      <div className="bg-gray-900 px-2 py-2 space-y-2">
        {userRole === "telefonista" && (
          <div className="flex gap-2">
            <Input type="text" value={clientCode} onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyPress={(e) => e.key === "Enter" && sendClientCode()} placeholder="4 dígitos" className="flex-1 h-10 text-center text-base font-mono font-bold bg-black border-2 border-amber-500 text-amber-300" maxLength={4} />
            <Button onClick={sendClientCode} disabled={clientCode.length !== 4} className={`h-10 px-4 bg-gradient-to-r ${currentTheme.primary} text-white font-bold rounded-lg`}>📞</Button>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {QUICK_MESSAGES[userRole === "escort" ? "escort" : "telefonista"].map((msg, index) => (
            <button key={index} onClick={() => sendMessage(msg)} className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-full whitespace-nowrap">{msg}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === "Enter" && sendMessage()} placeholder="Mensaje..." className="flex-1 h-10 bg-gray-800 border border-gray-700 text-white rounded-full px-4" />
          <Button onClick={() => sendMessage()} disabled={!newMessage.trim()} className={`h-10 w-10 rounded-full ${currentTheme.accent} text-white flex items-center justify-center`}>📤</Button>
        </div>
      </div>

      {/* MODALES */}
      {showRankingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md bg-gray-900 rounded-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-amber-400">🏆 TOP 3</h3>
              <button onClick={() => setShowRankingModal(false)} className="text-gray-400 text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {topTelefonistas.map((tel, index) => (
                <div key={tel.id} className={cn("p-3 rounded-xl flex items-center justify-between", index === 0 && "bg-yellow-900/20", index === 1 && "bg-gray-700/20", index === 2 && "bg-orange-900/20")}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</span>
                    <div><p className="font-bold text-white">{tel.name}</p><p className="text-sm text-gray-400">{tel.clientsSent} clientes</p></div>
                  </div>
                </div>
              ))}
              {topTelefonistas.length === 0 && <p className="text-center text-gray-500 py-8">No hay datos</p>}
            </div>
          </div>
        </div>
      )}

      {showStatsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md bg-gray-900 rounded-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-amber-400">📊 Stats</h3>
              <button onClick={() => setShowStatsModal(false)} className="text-gray-400 text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {telefonistas.map(tel => (
                <div key={tel.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div><p className="font-bold text-white">{tel.name}</p><p className="text-xs text-gray-400">{tel.clientsSent} clientes</p></div>
                  <Button onClick={() => { setPrivateChatRecipient(tel.id); setShowPrivateChat(true); setShowStatsModal(false); }} className="bg-purple-600 text-white text-xs px-3 py-1 rounded">💬</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && userRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md bg-gray-900 rounded-2xl border-2 border-amber-500 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-amber-400">⚙️ Config</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 text-2xl">✕</button>
            </div>
            <div className="mb-4">
              <h4 className="text-sm font-bold text-amber-400 mb-2">🎬 Tema</h4>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(THEMES) as ThemeName[]).map((themeKey) => {
                  const theme = THEMES[themeKey];
                  return (
                    <button key={themeKey} onClick={() => changeTheme(themeKey)} className={cn("relative h-24 rounded-lg border-2 overflow-hidden", selectedTheme === themeKey ? "border-yellow-400 ring-2 ring-yellow-400/50" : "border-gray-600")}>
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${theme.bgImage})` }}></div>
                      <div className="absolute inset-0 bg-black/50"></div>
                      {selectedTheme === themeKey && <div className="absolute top-1 right-1 bg-yellow-500 text-black font-bold px-1 py-0.5 rounded text-xs">✓</div>}
                      <div className="relative h-full flex flex-col items-center justify-center"><span className="text-2xl">{theme.icon}</span><p className="text-xs font-bold text-white">{theme.name}</p></div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-bold text-gray-400 mb-1">Escorts</label><Input type="number" value={editingSettings.maxEscorts} onChange={(e) => setEditingSettings({...editingSettings, maxEscorts: e.target.value})} className="h-9 bg-gray-800 border-gray-700 text-white" /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">Telefonistas</label><Input type="number" value={editingSettings.maxTelefonistas} onChange={(e) => setEditingSettings({...editingSettings, maxTelefonistas: e.target.value})} className="h-9 bg-gray-800 border-gray-700 text-white" /></div>
              <Button onClick={saveSettings} className={`w-full h-10 bg-gradient-to-r ${currentTheme.primary} text-white font-bold rounded-lg`}>💾 Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {showRatingModal && selectedTelefonistaToRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl border-2 border-amber-500 p-6">
            <h3 className="text-lg font-bold text-amber-400 mb-4">⭐ Calificar</h3>
            <div className="flex justify-center gap-2 mb-4">{[1, 2, 3, 4, 5].map((star) => (<button key={star} onClick={() => setRating(star)} className={cn("text-3xl", star <= rating ? "text-yellow-500" : "text-gray-600")}>★</button>))}</div>
            <Button onClick={rateTelefonista} className={`w-full h-10 bg-gradient-to-r ${currentTheme.primary} text-white font-bold rounded-lg`}>Enviar</Button>
          </div>
        </div>
      )}

      {showPrivateChat && privateChatRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl border-2 border-purple-500 p-6">
            <h3 className="text-lg font-bold text-purple-400 mb-3">💬 Privado</h3>
            <textarea value={privateMessage} onChange={(e) => setPrivateMessage(e.target.value)} placeholder="Mensaje..." className="w-full h-24 p-3 bg-gray-800 border-gray-700 text-white rounded-lg resize-none mb-3" />
            <Button onClick={sendPrivateMessage} disabled={!privateMessage.trim()} className="w-full h-10 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg">📤 Enviar</Button>
          </div>
        </div>
      )}

      {selectedClientForPrice && userRole === "escort" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl border-2 border-green-500 p-6">
            <h3 className="text-lg font-bold text-green-400 mb-3">💵 Cliente {selectedClientForPrice}</h3>
            <div className="grid grid-cols-2 gap-2">{roomSettings.prices.map((price) => (<button key={price} onClick={() => markClientAttended(selectedClientForPrice, price)} className="h-16 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg">${price}</button>))}</div>
          </div>
        </div>
      )}
    </div>
  );
}
