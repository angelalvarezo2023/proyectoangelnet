"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIcon } from "@/components/icons";

interface Message {
  id: number;
  text: string;
  sender: string;
  timestamp: string;
  isSystem: boolean;
}

interface Participant {
  id: number;
  name: string;
  joinedAt: string;
  isAdmin: boolean;
}

interface ChatSettings {
  hideNames: boolean;
  rules: string[];
}

const STORAGE_KEY = "escort-chat-data";

export function ChatGrupal() {
  const [userName, setUserName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cargar datos
  useEffect(() => {
    if (!isJoined) return;

    const loadChat = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          setMessages(data.messages || []);
          setParticipants(data.participants || []);
          setChatSettings(data.settings || chatSettings);
        }
      } catch (e) {
        console.error("Error loading chat:", e);
      }
    };

    loadChat();
    const interval = setInterval(loadChat, 2000);
    return () => clearInterval(interval);
  }, [isJoined]);

  // Guardar datos
  const saveToStorage = (data: any) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : {};
      const updated = { ...current, ...data, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving chat:", e);
    }
  };

  // Unirse al chat
  const handleJoin = (asAdmin: boolean) => {
    if (!userName.trim()) {
      alert("Por favor ingresa tu nombre");
      return;
    }

    const newParticipant: Participant = {
      id: Date.now(),
      name: userName.trim(),
      joinedAt: new Date().toISOString(),
      isAdmin: asAdmin,
    };

    const stored = localStorage.getItem(STORAGE_KEY);
    const current = stored ? JSON.parse(stored) : { participants: [], messages: [] };

    current.participants = [...(current.participants || []), newParticipant];

    const welcomeMsg: Message = {
      id: Date.now() + 1,
      text: `${userName.trim()} se ha unido al chat ${asAdmin ? "(Administrador)" : ""}`,
      sender: "Sistema",
      timestamp: new Date().toISOString(),
      isSystem: true,
    };

    current.messages = [...(current.messages || []), welcomeMsg];
    saveToStorage(current);

    setParticipants(current.participants);
    setMessages(current.messages);
    setIsJoined(true);
    setIsAdmin(asAdmin);
  };

  // Enviar mensaje
  const sendMessage = () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now(),
      text: newMessage.trim(),
      sender: userName,
      timestamp: new Date().toISOString(),
      isSystem: false,
    };

    const stored = localStorage.getItem(STORAGE_KEY);
    const current = stored ? JSON.parse(stored) : {};
    current.messages = [...(current.messages || []), message];
    saveToStorage(current);

    setMessages(current.messages);
    setNewMessage("");
  };

  // Obtener nombre para mostrar
  const getDisplayName = (name: string) => {
    if (!chatSettings.hideNames || name === "Sistema") return name;

    const index = participants.findIndex((p) => p.name === name);
    return index !== -1 ? `Telefonista ${index + 1}` : name;
  };

  // Toggle ocultar nombres
  const toggleHideNames = () => {
    const newSettings = { ...chatSettings, hideNames: !chatSettings.hideNames };
    setChatSettings(newSettings);

    const stored = localStorage.getItem(STORAGE_KEY);
    const current = stored ? JSON.parse(stored) : {};
    current.settings = newSettings;

    const msg: Message = {
      id: Date.now(),
      text: `Nombres ${newSettings.hideNames ? "ocultados" : "visibles"}. ${
        newSettings.hideNames
          ? 'Los participantes ahora aparecen como "Telefonista #"'
          : "Los nombres reales ahora son visibles"
      }`,
      sender: "Sistema",
      timestamp: new Date().toISOString(),
      isSystem: true,
    };

    current.messages = [...(current.messages || []), msg];
    saveToStorage(current);
    setMessages(current.messages);
  };

  // Agregar regla
  const addRule = () => {
    if (!newRule.trim()) return;

    const newSettings = {
      ...chatSettings,
      rules: [...chatSettings.rules, newRule.trim()],
    };
    setChatSettings(newSettings);

    const stored = localStorage.getItem(STORAGE_KEY);
    const current = stored ? JSON.parse(stored) : {};
    current.settings = newSettings;

    const msg: Message = {
      id: Date.now(),
      text: `Nueva regla agregada: "${newRule.trim()}"`,
      sender: "Sistema",
      timestamp: new Date().toISOString(),
      isSystem: true,
    };

    current.messages = [...(current.messages || []), msg];
    saveToStorage(current);
    setMessages(current.messages);
    setNewRule("");
  };

  // Eliminar regla
  const removeRule = (index: number) => {
    const rule = chatSettings.rules[index];
    const newSettings = {
      ...chatSettings,
      rules: chatSettings.rules.filter((_, i) => i !== index),
    };
    setChatSettings(newSettings);

    const stored = localStorage.getItem(STORAGE_KEY);
    const current = stored ? JSON.parse(stored) : {};
    current.settings = newSettings;

    const msg: Message = {
      id: Date.now(),
      text: `Regla eliminada: "${rule}"`,
      sender: "Sistema",
      timestamp: new Date().toISOString(),
      isSystem: true,
    };

    current.messages = [...(current.messages || []), msg];
    saveToStorage(current);
    setMessages(current.messages);
  };

  // Pantalla de ingreso
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/10 mb-4">
                <span className="text-4xl">💬</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Chat Grupal</h1>
              <p className="text-muted-foreground">Coordinación de servicios</p>
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
      <div className="w-full max-w-5xl h-[700px] rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10 overflow-hidden flex flex-col">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/10">
              <div className="absolute inset-0 rounded-2xl opacity-50 animate-pulse bg-primary/10" />
              <span className="relative text-2xl">💬</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Chat Grupal</h2>
              <p className="text-sm text-muted-foreground">
                {participants.length} participante{participants.length !== 1 ? "s" : ""} conectado
                {participants.length !== 1 ? "s" : ""}
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