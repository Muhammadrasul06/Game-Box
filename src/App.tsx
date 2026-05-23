import React, { useState, useEffect } from 'react';
import { AppSettings } from './types';
import { MainMenu } from './components/MainMenu';
import { SnakeGame } from './components/SnakeGame';
import { NeoRider } from './components/NeoRider';
import { ShooterGame } from './components/ShooterGame';

export default function App() {
  // Sync state settings with local storage
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('gamebox_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (_) {}
    return {
      soundEnabled: true,
      theme: 'neon',
      difficulty: 'normal',
    };
  });

  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // Sync settings updates to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gamebox_settings', JSON.stringify(settings));
    } catch (_) {}
  }, [settings]);

  // Dynamically update document background to fit the active visual theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'neon') {
      root.style.backgroundColor = '#0a0a0c';
      document.body.style.backgroundColor = '#0a0a0c';
    } else {
      root.style.backgroundColor = '#f7f4eb';
      document.body.style.backgroundColor = '#f7f4eb';
    }
  }, [settings.theme]);

  const handleUpdateSettings = (updated: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updated }));
  };

  const isNeon = settings.theme === 'neon';

  return (
    <div 
      className={`min-h-screen transition-colors duration-500 overflow-x-hidden ${
        isNeon 
          ? 'bg-[#0a0a0c] text-slate-100 font-sans' 
          : 'bg-[#f7f4eb] text-neutral-850 font-sans'
      }`}
      style={{
        backgroundImage: isNeon 
          ? 'radial-gradient(circle at 10% 20%, rgba(6,182,212,0.04) 0%, transparent 60%), radial-gradient(circle at 90% 80%, rgba(16,185,129,0.04) 0%, transparent 60%)' 
          : 'radial-gradient(circle at 20% 30%, rgba(0,0,0,0.01) 0%, transparent 70%)'
      }}
      id="app-theme-root"
    >
      {/* Decorative Neon top grid line */}
      {isNeon && (
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-600 shadow-[0_2px_15px_rgba(6,182,212,0.4)]" />
      )}

      <main className="max-w-7xl mx-auto py-4 md:py-8" id="viewport-main-element">
        {activeGameId === 'snake' ? (
          <SnakeGame
            settings={settings}
            onBackToMenu={() => setActiveGameId(null)}
            onUpdateSettings={handleUpdateSettings}
          />
        ) : activeGameId === 'rider' ? (
          <NeoRider
            settings={settings}
            onBackToMenu={() => setActiveGameId(null)}
            onUpdateSettings={handleUpdateSettings}
          />
        ) : activeGameId === 'shooter' ? (
          <ShooterGame
            settings={settings}
            onBackToMenu={() => setActiveGameId(null)}
            onUpdateSettings={handleUpdateSettings}
          />
        ) : (
          <MainMenu
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onSelectGame={(gameId) => {
              setActiveGameId(gameId);
            }}
          />
        )}
      </main>
    </div>
  );
}
