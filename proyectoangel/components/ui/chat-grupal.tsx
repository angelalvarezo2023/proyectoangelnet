"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIcon } from "@/components/icons";

type UserRole = "escort" | "telefonista" | "admin";
type EscortStatus = "disponible" | "ocupada";

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isSystem: boolean;
  isClientCode?: boolean;
  clientCode?: string;
}

interface Participant {
  id: string;
  name: string;
  role: UserRole;
  joinedAt: number;
  lastActive: number;
}

interface RoomData {
  messages: Record<string, Message>;
  participants: Record<string, Participant>;
  escortStatus: EscortStatus;
  waitingClients: string[];
  createdAt: number;
}

const FIREBASE_URL = "https://megapersonals-4f24c-default-rtdb.firebaseio.com";

const QUICK_MESSAGES = {
  telefonista: [
    "Cliente abajo",
    "Cliente llegando en 5 min",
    "Cliente esperando",
    "Cliente canceló",
  ],
  escort: [
    "En camino",
    "Ya estoy lista",
    "Dame 5 minutos",
    "Cliente atendido",
  ],
};

export function ChatGrupal() {
  const [step, setStep] = useState<"room-select" | "join" | "chat">("room-select");
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("telefonista");
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [escortStatus, setEscortStatus] = useState<EscortStatus>("disponible");
  const [waitingClients, setWaitingClients] = useState<string[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Sonido de notificación
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMpBSh+zPLaizsIGGS57OihUhELTKXh8bllHAU2jdXzzn0vBSCAzPDajjwIF2i56+mjThAMUKjj8LhjHQU5k9bzyn4vBSF+zPDaizwIF2i66+mjThAMUKjj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjThAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjThAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjThAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8LhjHAU5k9bzyn4tBSF+zPDajDwIF2i66+mjTRAMT6jj8A==");
    }
  }, []);

  // Sincronización con Firebase
  useEffect(() => {
    if (step !== "chat" || !roomCode) return;

    const syncChat = async () => {
      try {
        const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`);
        const data: RoomData | null = await response.json();

        if (data) {
          // Actualizar mensajes
          const messagesArray = data.messages 
            ? Object.values(data.messages).sort((a, b) => a.timestamp - b.timestamp)
            : [];
          
          // Detectar nuevo cliente si soy escort
          if (userRole === "escort" && messagesArray.length > messages.length) {
            const newMsg = messagesArray[messagesArray.length - 1];
            if (newMsg.isClientCode && audioRef.current) {
              audioRef.current.play().catch(() => {});
            }
          }
          
          setMessages(messagesArray);

          // Actualizar participantes
          const participantsArray = data.participants 
            ? Object.values(data.participants)
            : [];
          setParticipants(participantsArray);

          // Actualizar estado escort
          if (data.escortStatus) {
            setEscortStatus(data.escortStatus);
          }

          // Actualizar clientes en espera
          if (data.waitingClients) {
            setWaitingClients(data.waitingClients);
          }
        }
      } catch (error) {
        console.error("Error syncing chat:", error);
      }
    };

    syncChat();
    syncIntervalRef.current = setInterval(syncChat, 2000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [step, roomCode, messages.length, userRole]);

  // Generar código de sala
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Crear sala
  const handleCreateRoom = () => {
    const newRoomCode = generateRoomCode();
    setRoomCode(newRoomCode);
    setStep("join");
  };

  // Unirse a sala existente
  const handleJoinExistingRoom = () => {
    if (!roomCode.trim()) {
      alert("Por favor ingresa el código de la sala");
      return;
    }
    setStep("join");
  };

  // Unirse al chat
  const handleJoin = async () => {
    if (!userName.trim()) {
      alert("Por favor ingresa tu nombre");
      return;
    }

    if (isJoining) return;
    setIsJoining(true);

    try {
      // Verificar si la sala existe
      const checkResponse = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`);
      const existingRoom: RoomData | null = await checkResponse.json();

      // Verificar si el usuario ya está en la sala
      if (existingRoom && existingRoom.participants) {
        const existingUser = Object.values(existingRoom.participants).find(
          p => p.name.toLowerCase() === userName.trim().toLowerCase()
        );
        
        if (existingUser) {
          alert("Este nombre ya está en uso en la sala. Por favor elige otro nombre.");
          setIsJoining(false);
          return;
        }
      }

      // Verificar si ya hay una escort y estamos intentando unirnos como escort
      if (userRole === "escort" && existingRoom && existingRoom.participants) {
        const hasEscort = Object.values(existingRoom.participants).some(p => p.role === "escort");
        if (hasEscort) {
          alert("Ya hay una escort en esta sala. Solo puede haber una escort por sala.");
          setIsJoining(false);
          return;
        }
      }

      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentUserId(userId);

      const newParticipant: Participant = {
        id: userId,
        name: userName.trim(),
        role: userRole,
        joinedAt: Date.now(),
        lastActive: Date.now(),
      };

      const welcomeMsg: Message = {
        id: `msg_${Date.now()}`,
        text: `${userName.trim()} se ha unido (${getRoleLabel(userRole)})`,
        sender: "Sistema",
        timestamp: Date.now(),
        isSystem: true,
      };

      if (!existingRoom) {
        // Crear sala nueva
        const initialData: RoomData = {
          messages: { [welcomeMsg.id]: welcomeMsg },
          participants: { [userId]: newParticipant },
          escortStatus: "disponible",
          waitingClients: [],
          createdAt: Date.now(),
        };

        await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initialData),
        });
      } else {
        // Agregar a sala existente
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

      setStep("chat");
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Error al unirse a la sala");
    } finally {
      setIsJoining(false);
    }
  };

  // Obtener etiqueta de rol
  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case "escort": return "Escort";
      case "telefonista": return "Telefonista";
      case "admin": return "Admin";
    }
  };

  // Enviar mensaje
  const sendMessage = async (customText?: string) => {
    const text = customText || newMessage.trim();
    if (!text) return;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      sender: userName,
      timestamp: Date.now(),
      isSystem: false,
    };

    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!customText) {
        setNewMessage("");
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Enviar código de cliente
  const sendClientCode = async () => {
    if (clientCode.length !== 4 || !/^\d{4}$/.test(clientCode)) {
      alert("El código debe ser exactamente 4 dígitos");
      return;
    }

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: `🔔 CLIENTE ABAJO - Terminal: ${clientCode}`,
      sender: userName,
      timestamp: Date.now(),
      isSystem: false,
      isClientCode: true,
      clientCode: clientCode,
    };

    try {
      // Agregar mensaje
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      // Agregar a lista de espera
      const response = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`);
      const currentWaiting = await response.json() || [];
      const updatedWaiting = [...currentWaiting, clientCode];

      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/waitingClients.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedWaiting),
      });

      setClientCode("");
    } catch (error) {
      console.error("Error sending client code:", error);
    }
  };

  // Cambiar estado de escort
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

  // Marcar cliente como atendido
  const markClientAttended = async (code: string) => {
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
        text: `✅ Cliente ${code} atendido por ${userName}`,
        sender: "Sistema",
        timestamp: Date.now(),
        isSystem: true,
      };

      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${message.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error("Error marking client:", error);
    }
  };

  // Salir del chat
  const handleLeaveChat = async () => {
    try {
      // Eliminar participante
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/participants/${currentUserId}.json`, {
        method: "DELETE",
      });

      // Mensaje de salida
      const leaveMsg: Message = {
        id: `msg_${Date.now()}`,
        text: `${userName} ha salido del chat`,
        sender: "Sistema",
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

    setStep("room-select");
    setRoomCode("");
    setUserName("");
    setMessages([]);
    setParticipants([]);
  };

  // Pantalla de selección de sala
  if (step === "room-select") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/10 mb-4">
                <span className="text-4xl">👥</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Coordinación</h1>
              <p className="text-muted-foreground">Sistema de gestión de clientes</p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleCreateRoom}
                className="w-full h-14 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-lg"
              >
                ➕ Crear Sala Nueva
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-card text-muted-foreground">o</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Código de sala
                </label>
                <Input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === "Enter" && handleJoinExistingRoom()}
                  placeholder="Ej: ABC123"
                  className="h-12 bg-input text-foreground text-center text-lg tracking-wider uppercase"
                  maxLength={6}
                />
              </div>

              <Button
                onClick={handleJoinExistingRoom}
                disabled={!roomCode.trim()}
                className="w-full h-12 bg-gradient-to-r from-chart-4 to-chart-5 hover:from-chart-4/90 hover:to-chart-5/90"
              >
                🔑 Unirse a Sala
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla de ingreso
  if (step === "join") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

          <div className="p-8">
            <button
              onClick={() => setStep("room-select")}
              className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Volver
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/10 mb-4">
                <span className="text-4xl">👤</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Sala: {roomCode}</h1>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  alert("¡Código copiado!");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
              >
                <span className="text-sm text-muted-foreground">Copiar código</span>
                <span className="text-lg font-bold font-mono text-primary">{roomCode}</span>
                <span>📋</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tu nombre
                </label>
                <Input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Ej: Maria"
                  className="h-12 bg-input text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tu rol
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setUserRole("escort")}
                    className={cn(
                      "h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                      userRole === "escort"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <span className="text-2xl">💃</span>
                    <span className="text-xs font-medium">Escort</span>
                  </button>
                  
                  <button
                    onClick={() => setUserRole("telefonista")}
                    className={cn(
                      "h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                      userRole === "telefonista"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <span className="text-2xl">📞</span>
                    <span className="text-xs font-medium">Telefonista</span>
                  </button>
                  
                  <button
                    onClick={() => setUserRole("admin")}
                    className={cn(
                      "h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                      userRole === "admin"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <span className="text-2xl">👑</span>
                    <span className="text-xs font-medium">Admin</span>
                  </button>
                </div>
              </div>

              <Button
                onClick={handleJoin}
                disabled={!userName.trim() || isJoining}
                className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
              >
                {isJoining ? "Uniéndose..." : "Entrar al Chat"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat principal
  const escort = participants.find(p => p.role === "escort");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[700px] rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden flex flex-col relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

        {/* Header */}
        <div className="border-b border-border/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="text-2xl">👥</div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Sala: {roomCode}</h2>
                <p className="text-xs text-muted-foreground">
                  {participants.length} persona{participants.length !== 1 ? "s" : ""} conectada{participants.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right mr-2">
                <p className="text-sm font-medium text-foreground">{userName}</p>
                <p className="text-xs text-primary">{getRoleLabel(userRole)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLeaveChat}
                className="rounded-xl h-9 w-9"
                title="Salir"
              >
                🚪
              </Button>
            </div>
          </div>

          {/* Estado de la escort */}
          {escort && (
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border-2",
              escortStatus === "disponible"
                ? "bg-green-500/10 border-green-500/30"
                : "bg-red-500/10 border-red-500/30"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  escortStatus === "disponible" ? "bg-green-500 animate-pulse" : "bg-red-500"
                )}></div>
                <span className="font-medium text-sm">
                  {escort.name} está {escortStatus === "disponible" ? "DISPONIBLE" : "OCUPADA"}
                </span>
              </div>

              {userRole === "escort" && (
                <Button
                  onClick={toggleEscortStatus}
                  size="sm"
                  className={cn(
                    "h-8",
                    escortStatus === "disponible"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-green-500 hover:bg-green-600"
                  )}
                >
                  {escortStatus === "disponible" ? "Marcar Ocupada" : "Marcar Disponible"}
                </Button>
              )}
            </div>
          )}

          {/* Cola de espera */}
          {waitingClients.length > 0 && (
            <div className="mt-2 p-3 rounded-xl bg-warning/10 border-2 border-warning/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-warning">
                  ⏳ Clientes en espera: {waitingClients.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {waitingClients.map((code, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 bg-card px-3 py-1 rounded-lg border border-border"
                  >
                    <span className="font-mono font-bold">{code}</span>
                    {userRole === "escort" && (
                      <button
                        onClick={() => markClientAttended(code)}
                        className="text-green-500 hover:text-green-600"
                        title="Marcar como atendido"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-secondary/20">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.sender === userName && !msg.isSystem ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[70%] rounded-2xl px-4 py-2",
                  msg.isSystem
                    ? "bg-secondary/50 text-muted-foreground text-center text-sm italic w-full max-w-none"
                    : msg.isClientCode
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold border-2 border-orange-300 shadow-lg"
                    : msg.sender === userName
                    ? "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                    : "bg-card text-foreground border border-border/50"
                )}
              >
                {!msg.isSystem && (
                  <p className="text-xs font-semibold mb-1 opacity-80">
                    {msg.sender}
                  </p>
                )}
                <p className="text-sm break-words">{msg.text}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString("es", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input área */}
        <div className="border-t border-border/50 p-4 bg-card space-y-3">
          {/* Código de cliente (solo telefonistas) */}
          {userRole === "telefonista" && (
            <div className="flex gap-2">
              <Input
                type="text"
                value={clientCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setClientCode(value);
                }}
                onKeyPress={(e) => e.key === "Enter" && sendClientCode()}
                placeholder="Últimos 4 dígitos (ej: 7695)"
                className="flex-1 h-12 bg-input text-foreground font-mono text-lg text-center"
                maxLength={4}
              />
              <Button
                onClick={sendClientCode}
                disabled={clientCode.length !== 4}
                className="h-12 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              >
                📞 Enviar Cliente
              </Button>
            </div>
          )}

          {/* Mensajes rápidos */}
          <div className="flex flex-wrap gap-2">
            {QUICK_MESSAGES[userRole === "escort" ? "escort" : "telefonista"].map((msg, index) => (
              <button
                key={index}
                onClick={() => sendMessage(msg)}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded-lg border border-border transition-colors"
              >
                {msg}
              </button>
            ))}
          </div>

          {/* Mensaje normal */}
          <div className="flex gap-2">
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Escribe un mensaje..."
              className="flex-1 h-10 bg-input text-foreground"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!newMessage.trim()}
              className="h-10 px-4 bg-primary"
            >
              📤
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
