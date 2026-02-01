"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CONTACT } from "@/lib/firebase";
import { MessageIcon, XIcon, SendIcon, LockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  text: string;
  sender: "user" | "bot";
}

// 🔒 CONFIGURACIÓN DE SEGURIDAD
const CHAT_PASSWORD = "megapersonals2025"; // ← Cambia esta contraseña

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [authError, setAuthError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Verificar si ya está autenticado (guardado en sessionStorage)
  useEffect(() => {
    const savedAuth = sessionStorage.getItem("chatAuth");
    if (savedAuth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0 && isAuthenticated) {
      setMessages([{ text: "¡Hola! ¿En qué puedo ayudarte?", sender: "bot" }]);
    }
  }, [isOpen, messages.length, isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = () => {
    if (password === CHAT_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError("");
      sessionStorage.setItem("chatAuth", "true");
    } else {
      setAuthError("Contraseña incorrecta");
      setPassword("");
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { text: input.trim(), sender: "user" }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          text: `Contacta con nosotros:\n📱 +1 ${CONTACT.whatsapp}\n📧 ${CONTACT.email}`,
          sender: "bot",
        },
      ]);
    }, 500);
  };

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/25 transition-transform hover:scale-110"
        >
          <MessageIcon className="h-6 w-6 text-primary-foreground" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[500px] w-96 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-primary to-accent p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/20">
                {isAuthenticated ? (
                  <MessageIcon className="h-5 w-5 text-primary-foreground" />
                ) : (
                  <LockIcon className="h-5 w-5 text-primary-foreground" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-primary-foreground">
                  {isAuthenticated ? "Soporte" : "Acceso Privado"}
                </h3>
                <p className="text-xs text-primary-foreground/80">
                  {isAuthenticated ? "Estamos aquí para ayudarte" : "Ingresa la contraseña"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <XIcon className="h-5 w-5" />
            </Button>
          </div>

          {/* Login Form */}
          {!isAuthenticated && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-sm space-y-4">
                <div className="text-center space-y-2">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <LockIcon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Chat Privado</h3>
                  <p className="text-sm text-muted-foreground">
                    Este chat es solo para personal autorizado
                  </p>
                </div>

                <div className="space-y-3">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setAuthError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="Contraseña"
                    className="bg-input text-foreground h-12"
                    autoFocus
                  />

                  {authError && (
                    <div className="text-sm text-destructive text-center bg-destructive/10 py-2 rounded-lg">
                      {authError}
                    </div>
                  )}

                  <Button 
                    onClick={handleLogin} 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12"
                  >
                    <LockIcon className="h-4 w-4 mr-2" />
                    Acceder
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  🔒 Protegido por contraseña
                </p>
              </div>
            </div>
          )}

          {/* Messages (solo si está autenticado) */}
          {isAuthenticated && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={cn("flex", msg.sender === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-input text-foreground"
                  />
                  <Button onClick={handleSend} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <SendIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
