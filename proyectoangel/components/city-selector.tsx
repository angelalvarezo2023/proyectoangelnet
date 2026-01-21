"use client";

import { useState } from "react";
import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Estados de USA organizados alfabéticamente (igual que megapersonals.eu)
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 
  'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

interface CitySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCity: (city: string) => void;
  currentCity?: string;
}

export function CitySelector({ 
  isOpen, 
  onClose, 
  onSelectCity,
  currentCity 
}: CitySelectorProps) {
  const [showStates, setShowStates] = useState(false);

  if (!isOpen) return null;

  const handleStateClick = (state: string) => {
    onSelectCity(state);
    onClose();
    setShowStates(false);
  };

  const handleBackToCountries = () => {
    setShowStates(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden border-2 border-cyan-500/30">
        {/* Header - Estilo megapersonals.eu */}
        <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            Choose a Location
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full bg-black/30 hover:bg-black/50 text-white h-8 w-8"
          >
            <XIcon className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-800">
          {!showStates ? (
            /* Solo United States */
            <div className="p-3">
              <button
                onClick={() => setShowStates(true)}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
              >
                United States
              </button>
            </div>
          ) : (
            /* States List - Estilo megapersonals.eu */
            <div className="p-2 space-y-2">
              {/* Botón de regreso */}
              <button
                onClick={handleBackToCountries}
                className="w-full text-left py-2 px-4 rounded-lg font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all text-sm"
              >
                ← Back
              </button>
              
              {US_STATES.map((state) => (
                <button
                  key={state}
                  onClick={() => handleStateClick(state)}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-between group",
                    currentCity === state 
                      ? "bg-gradient-to-r from-pink-500 to-pink-600 text-white" 
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700"
                  )}
                >
                  <span>{state}</span>
                  <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">
                    +
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
