"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIcon } from "@/components/icons";

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isSystem: boolean;
}

interface Participant {
  id: string;
  name: string;
  joinedAt: number;
  isAdmin: boolean;
}

interface ChatSettings {
  hideNames: boolean;
  rules: string[];
}

interface RoomData {
  messages: Record<string, Message>;
  participants: Record<string, Participant>;
  settings: ChatSettings;
  createdAt: number;
}

const FIREBASE_URL = "https://megapersonals-4f24c-default-rtdb.firebaseio.com";

export function ChatGrupal() {
  const [step, setStep] = useState<"room-select" | "join" | "chat">("room-select");
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    hideNames: false,
    rules: [
      "Mantener el respeto en todo momento",
      "No compartir información personal sensible",
    ],
  });
  const [newRule, setNewRule] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          setMessages(messagesArray);

          // Actualizar participantes
          const participantsArray = data.participants 
            ? Object.values(data.participants)
            : [];
          setParticipants(participantsArray);

          // Actualizar configuración
          if (data.settings) {
            setChatSettings(data.settings);
          }
        }
      } catch (error) {
        console.error("Error syncing chat:", error);
      }
    };

    // Sincronizar inmediatamente
    syncChat();

    // Sincronizar cada 2 segundos
    syncIntervalRef.current = setInterval(syncChat, 2000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [step, roomCode]);

  // Generar código de sala aleatorio
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Crear sala nueva
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
  const handleJoin = async (asAdmin: boolean) => {
    if (!userName.trim()) {
      alert("Por favor ingresa tu nombre");
      return;
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentUserId(userId);

    const newParticipant: Participant = {
      id: userId,
      name: userName.trim(),
      joinedAt: Date.now(),
      isAdmin: asAdmin,
    };

    const welcomeMsg: Message = {
      id: `msg_${Date.now()}`,
      text: `${userName.trim()} se ha unido al chat ${asAdmin ? "(Administrador)" : ""}`,
      sender: "Sistema",
      timestamp: Date.now(),
      isSystem: true,
    };

    try {
      // Verificar si la sala existe
      const checkResponse = await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}.json`);
      const existingRoom = await checkResponse.json();

      if (!existingRoom) {
        // Crear sala nueva
        const initialData: RoomData = {
          messages: { [welcomeMsg.id]: welcomeMsg },
          participants: { [userId]: newParticipant },
          settings: chatSettings,
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

      setIsAdmin(asAdmin);
      setStep("chat");
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Error al unirse a la sala");
    }
  };

  // Enviar mensaje
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: newMessage.trim(),
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

      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Obtener nombre para mostrar
  const getDisplayName = (name: string) => {
    if (!chatSettings.hideNames || name === "Sistema") return name;

    const index = participants.findIndex((p) => p.name === name);
    return index !== -1 ? `Telefonista ${index + 1}` : name;
  };

  // Toggle ocultar nombres
  const toggleHideNames = async () => {
    const newSettings = { ...chatSettings, hideNames: !chatSettings.hideNames };
    setChatSettings(newSettings);

    const msg: Message = {
      id: `msg_${Date.now()}`,
      text: `Nombres ${newSettings.hideNames ? "ocultados" : "visibles"}. ${
        newSettings.hideNames
          ? 'Los participantes ahora aparecen como "Telefonista #"'
          : "Los nombres reales ahora son visibles"
      }`,
      sender: "Sistema",
      timestamp: Date.now(),
      isSystem: true,
    };

    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });

      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${msg.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
    } catch (error) {
      console.error("Error updating settings:", error);
    }
  };

  // Agregar regla
  const addRule = async () => {
    if (!newRule.trim()) return;

    const newSettings = {
      ...chatSettings,
      rules: [...chatSettings.rules, newRule.trim()],
    };
    setChatSettings(newSettings);

    const msg: Message = {
      id: `msg_${Date.now()}`,
      text: `Nueva regla agregada: "${newRule.trim()}"`,
      sender: "Sistema",
      timestamp: Date.now(),
      isSystem: true,
    };

    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });

      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${msg.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });

      setNewRule("");
    } catch (error) {
      console.error("Error adding rule:", error);
    }
  };

  // Eliminar regla
  const removeRule = async (index: number) => {
    const rule = chatSettings.rules[index];
    const newSettings = {
      ...chatSettings,
      rules: chatSettings.rules.filter((_, i) => i !== index),
    };
    setChatSettings(newSettings);

    const msg: Message = {
      id: `msg_${Date.now()}`,
      text: `Regla eliminada: "${rule}"`,
      sender: "Sistema",
      timestamp: Date.now(),
      isSystem: true,
    };

    try {
      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/settings.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });

      await fetch(`${FIREBASE_URL}/chat-rooms/${roomCode}/messages/${msg.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
    } catch (error) {
      console.error("Error removing rule:", error);
    }
  };

  // Salir del chat
  const handleLeaveChat = () => {
    setStep("room-select");
    setRoomCode("");
    setUserName("");
    setIsAdmin(false);
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
                <span className="text-4xl">🚪</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Salas de Chat</h1>
              <p className="text-muted-foreground">Crea una sala o únete a una existente</p>
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
                <span className="text-4xl">💬</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Sala: {roomCode}</h1>
              <p className="text-muted-foreground mb-4">Comparte este código con otros usuarios</p>
              
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
                  Ingresa tu nombre
                </label>
                <Input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleJoin(false)}
                  placeholder="Tu nombre..."
                  className="h-12 bg-input text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handleJoin(false)}
                  disabled={!userName.trim()}
                  className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                >
                  Unirse al Chat
                </Button>

                <Button
                  onClick={() => handleJoin(true)}
                  disabled={!userName.trim()}
                  className="w-full h-12 bg-gradient-to-r from-chart-4 to-chart-5 hover:from-chart-4/90 hover:to-chart-5/90 flex items-center justify-center gap-2"
                >
                  <span>🛡️</span>
                  Unirse como Administrador
                </Button>
              </div>

              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
                <p className="text-sm font-semibold text-warning mb-2">📋 Reglas del grupo:</p>
                <ul className="text-xs text-warning/80 space-y-1">
                  {chatSettings.rules.map((rule, i) => (
                    <li key={i}>• {rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat principal  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[700px] rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden flex flex-col relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/10">
              <div className="absolute inset-0 rounded-2xl opacity-50 animate-pulse bg-primary/10" />
              <span className="relative text-2xl">💬</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Sala: {roomCode}</h2>
              <p className="text-sm text-muted-foreground">
                {participants.length} participante{participants.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="rounded-xl h-10 w-10"
              >
                ⚙️
              </Button>
            )}
            <div className="text-right">
              <p className="font-medium text-foreground">{getDisplayName(userName)}</p>
              {isAdmin && <p className="text-xs text-primary">Admin</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeaveChat}
              className="rounded-xl h-10 w-10"
              title="Salir"
            >
              🚪
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Área de mensajes */}
          <div className="flex-1 flex flex-col">
            {/* Reglas */}
            {chatSettings.rules.length > 0 && (
              <div className="bg-warning/10 border-b border-warning/30 p-3">
                <p className="text-xs font-bold text-warning mb-1">📋 REGLAS DEL GRUPO:</p>
                <div className="space-y-1">
                  {chatSettings.rules.map((rule, i) => (
                    <p key={i} className="text-xs text-warning/80">
                      • {rule}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/20">
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
                        : msg.sender === userName
                        ? "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                        : "bg-card text-foreground border border-border/50"
                    )}
                  >
                    {!msg.isSystem && (
                      <p className="text-xs font-semibold mb-1 opacity-80">
                        {getDisplayName(msg.sender)}
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

            {/* Input */}
            <div className="border-t border-border/50 p-4 bg-card">
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 h-12 bg-input text-foreground"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-primary to-accent"
                >
                  📤
                </Button>
              </div>
            </div>
          </div>

          {/* Panel de admin */}
          {isAdmin && showSettings && (
            <div className="w-80 border-l border-border/50 p-4 overflow-y-auto bg-secondary/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <span>🛡️</span>
                  Panel Admin
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Ocultar nombres */}
                <div className="bg-card p-4 rounded-xl border border-border/50">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {chatSettings.hideNames ? "👁️‍🗨️" : "👁️"} Ocultar nombres
                    </span>
                    <button
                      onClick={toggleHideNames}
                      className={cn(
                        "relative w-12 h-6 rounded-full transition",
                        chatSettings.hideNames ? "bg-primary" : "bg-secondary"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition transform",
                          chatSettings.hideNames ? "translate-x-6" : ""
                        )}
                      />
                    </button>
                  </label>
                  {chatSettings.hideNames && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Nombres como "Telefonista #"
                    </p>
                  )}
                </div>

                {/* Reglas */}
                <div className="bg-card p-4 rounded-xl border border-border/50">
                  <h4 className="font-semibold text-sm text-foreground mb-3">Reglas del Grupo</h4>

                  <div className="space-y-2 mb-3">
                    {chatSettings.rules.map((rule, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-secondary/50 p-2 rounded-lg"
                      >
                        <span className="text-xs text-accent flex-shrink-0 mt-0.5">✓</span>
                        <p className="text-xs text-foreground flex-1">{rule}</p>
                        <button
                          onClick={() => removeRule(i)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Input
                      type="text"
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && addRule()}
                      placeholder="Nueva regla..."
                      className="text-sm h-9 bg-input"
                    />
                    <Button
                      onClick={addRule}
                      disabled={!newRule.trim()}
                      className="w-full h-9 text-sm bg-primary"
                    >
                      Agregar Regla
                    </Button>
                  </div>
                </div>

                {/* Participantes */}
                <div className="bg-card p-4 rounded-xl border border-border/50">
                  <h4 className="font-semibold text-sm text-foreground mb-3">
                    Participantes ({participants.length})
                  </h4>
                  <div className="space-y-2">
                    {participants.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs bg-secondary/50 p-2 rounded-lg"
                      >
                        <span className="font-medium text-foreground">
                          {chatSettings.hideNames ? `Telefonista ${i + 1}` : p.name}
                        </span>
                        {p.isAdmin && (
                          <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs">
                            Admin
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
