"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { RocketIcon, DiamondIcon, BoltIcon, CheckIcon, BotIcon } from "@/components/icons";
import { MegaBotPanel } from "@/components/megabot-panel";

interface ServiceCardProps {
  service: {
    id: string;
    icon: string;
    title: string;
    subtitle: string;
    description: string;
    features: string[];
    price: string;
    stock: number;
    gradient: string;
  };
}

const iconMap = {
  rocket: RocketIcon,
  diamond: DiamondIcon,
  bolt: BoltIcon,
  bot: BotIcon,
};

export function ServiceCard({ service }: ServiceCardProps) {
  const [isMegaBotOpen, setIsMegaBotOpen] = useState(false);
  const IconComponent = iconMap[service.icon as keyof typeof iconMap] || RocketIcon;
  
  const handleClick = () => {
    if (service.id === "megabot") {
      setIsMegaBotOpen(true);
    }
  };

  return (
    <>
      <div 
        onClick={handleClick}
        className={cn(
          "group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/50 transition-all duration-500 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1",
          service.id === "megabot" && "cursor-pointer"
        )}
      >
        {/* Background glow effect */}
        <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-primary/20 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        
        {/* Gradient accent line */}
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r rounded-t-3xl", service.gradient)} />
        
        {/* NEW Badge for MegaBot */}
        {service.id === "megabot" && (
          <div className="absolute top-4 right-4 z-10">
            <span className="px-2 py-1 text-[10px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full uppercase tracking-wide animate-pulse">
              Nuevo
            </span>
          </div>
        )}
        
        {/* Content */}
        <div className="relative p-7">
          {/* Icon with glow */}
          <div className="relative mb-5">
            <div className={cn("absolute inset-0 rounded-2xl blur-xl opacity-40", service.gradient)} />
            <div className={cn("relative inline-flex rounded-2xl p-4 bg-gradient-to-br text-white shadow-lg", service.gradient)}>
              <IconComponent className="h-7 w-7" />
            </div>
          </div>
          
          {/* Title & Subtitle */}
          <h3 className="mb-2 text-xl font-bold text-foreground group-hover:text-primary transition-colors">{service.title}</h3>
          <p className="mb-2 text-sm font-medium text-primary/70">{service.subtitle}</p>
          <p className="mb-5 text-sm text-muted-foreground leading-relaxed">{service.description}</p>
          
          {/* Features */}
          <div className="mb-6 space-y-3">
            {service.features.map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <CheckIcon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">{feature}</span>
              </div>
            ))}
          </div>
          
          {/* Price & Stock */}
          <div className="flex items-end justify-between border-t border-border/50 pt-5">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Precio</p>
              <p className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{service.price}</p>
            </div>
            <div className="text-right">
              {service.id === "megabot" ? (
                <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                  Acceder →
                </button>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-1">Disponibles</p>
                  <div className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                    service.stock > 10 
                      ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                      : service.stock > 5 
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" 
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      service.stock > 10 ? "bg-green-400" : service.stock > 5 ? "bg-yellow-400" : "bg-red-400"
                    )} />
                    {service.stock}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MegaBot Modal */}
      {service.id === "megabot" && (
        <MegaBotPanel isOpen={isMegaBotOpen} onClose={() => setIsMegaBotOpen(false)} />
      )}
    </>
  );
}
