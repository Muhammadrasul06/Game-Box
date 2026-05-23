import React, { useState, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Settings, 
  Maximize2, 
  Minimize2, 
  Gamepad2,
  Sparkles,
  Zap,
  HardDrive
} from 'lucide-react';
import { AppSettings, Difficulty, AppTheme } from '../types';
import { GameCard } from './GameCard';
import { GAMES_DATA } from '../utils/gamesData';
import { playClickSound } from '../utils/audio';

interface MainMenuProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onSelectGame: (gameId: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  settings,
  onUpdateSettings,
  onSelectGame,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Monitor fullscreen state change
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleFullscreenToggle = () => {
    playClickSound(settings.soundEnabled);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request blocked or not permitted in iframe sandbox:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleDifficultyChange = (level: Difficulty) => {
    playClickSound(settings.soundEnabled);
    onUpdateSettings({ difficulty: level });
  };

  const handleThemeChange = (theme: AppTheme) => {
    playClickSound(settings.soundEnabled);
    onUpdateSettings({ theme });
  };

  const handleSoundToggle = () => {
    const nextVal = !settings.soundEnabled;
    playClickSound(nextVal);
    onUpdateSettings({ soundEnabled: nextVal });
  };

  const isNeon = settings.theme === 'neon';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-10 animate-fade-in" id="main-menu-root">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-center pb-6 mb-8 border-b border-white/10 relative">
        {isNeon && (
          <div className="absolute top-0 left-0 w-64 h-24 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        )}

        <div className="flex flex-col text-center md:text-left mb-6 md:mb-0">
          <h1 className={`text-4xl md:text-5xl font-black tracking-tighter italic ${
            isNeon 
              ? 'text-cyan-400 neon-glow drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
              : 'text-neutral-900 uppercase font-black'
          }`}>
            GAME BOX
          </h1>
          <p className={`text-xs uppercase tracking-widest mt-1 font-bold ${
            isNeon ? 'text-white/60' : 'text-neutral-600'
          }`}>
            Choose a game and start playing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 ${
            isNeon ? 'glass rounded-xl' : 'bg-neutral-900/10 rounded-full border border-neutral-800/15'
          }`}>
            <Gamepad2 size={14} className={isNeon ? 'text-cyan-400 animate-pulse' : 'text-neutral-800'} />
            <span className={`text-[10px] uppercase font-mono tracking-widest font-bold ${
              isNeon ? 'text-cyan-300' : 'text-neutral-750'
            }`}>
              STATION ZERO ONE
            </span>
          </div>
        </div>
      </div>

      {/* SETTINGS CONTROL CARD (MAIN MENU TOP DOCK) */}
      <div 
        className={`mb-10 p-5 md:p-6 rounded-2xl border transition-all duration-300 ${
          isNeon
            ? 'glass bg-white/5 border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
            : 'bg-white border-2 border-neutral-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
        }`}
        id="settings-overlay-panel"
      >
        <div className="flex items-center gap-2 mb-4 border-b pb-3 border-white/10">
          <Settings size={15} className={isNeon ? 'text-cyan-400' : 'text-neutral-800'} />
          <h2 className={`text-xs uppercase font-mono tracking-widest font-bold ${
            isNeon ? 'text-white/70' : 'text-neutral-800'
          }`}>
            Arcade Console Dashboard
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {/* CONTROL: SOUND */}
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${
              isNeon ? 'text-white/40' : 'text-neutral-500'
            }`}>Sound Output</span>
            
            <button
              onClick={handleSoundToggle}
              className={`py-3 px-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer text-xs font-mono font-bold ${
                isNeon
                  ? settings.soundEnabled
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/15'
                  : settings.soundEnabled
                    ? 'bg-neutral-900 border-2 border-neutral-900 text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.15)]'
                    : 'bg-neutral-50 border-2 border-dashed border-neutral-300 text-neutral-400'
              }`}
              id="dashboard-sound-btn"
            >
              <span className="uppercase">Sound FX</span>
              <div className="flex items-center gap-1.5">
                {settings.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{settings.soundEnabled ? 'ENABLED' : 'MUTED'}</span>
              </div>
            </button>
          </div>

          {/* CONTROL: DIFFICULTY */}
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${
              isNeon ? 'text-white/40' : 'text-neutral-500'
            }`}>Game Speed Difficulty</span>
            
            <div className={`grid grid-cols-3 rounded-xl p-1 gap-1 border ${
              isNeon ? 'bg-white/5 border-white/10' : 'bg-neutral-50 border-2 border-neutral-800'
            }`}>
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((level) => {
                const isActive = settings.difficulty === level;
                return (
                  <button
                    key={level}
                    onClick={() => handleDifficultyChange(level)}
                    className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg cursor-pointer transition-all text-center ${
                      isActive
                        ? isNeon
                          ? 'bg-cyan-500 text-black font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                          : 'bg-neutral-900 text-white font-black'
                        : isNeon
                          ? 'text-white/60 hover:text-white hover:bg-white/5'
                          : 'text-neutral-600 hover:bg-neutral-200/50'
                    }`}
                    id={`diff-btn-${level}`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONTROL: VISUAL THEME */}
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${
              isNeon ? 'text-white/40' : 'text-neutral-500'
            }`}>Cabinet Theme</span>
            
            <div className={`grid grid-cols-2 rounded-xl p-1 gap-1 border ${
              isNeon ? 'bg-white/5 border-white/10' : 'bg-neutral-50 border-2 border-neutral-800'
            }`}>
              {(['classic', 'neon'] as AppTheme[]).map((themeType) => {
                const isActive = settings.theme === themeType;
                return (
                  <button
                    key={themeType}
                    onClick={() => handleThemeChange(themeType)}
                    className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg cursor-pointer transition-all ${
                      isActive
                        ? isNeon
                          ? 'bg-cyan-500 text-black font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                          : 'bg-neutral-900 text-white font-black'
                        : isNeon
                          ? 'text-white/60 hover:text-white hover:bg-white/5'
                          : 'text-neutral-600 hover:bg-neutral-200/50'
                    }`}
                    id={`theme-btn-${themeType}`}
                  >
                    {themeType}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONTROL: SCREEN MODE */}
          <div className="flex flex-col gap-1.5 flex-1">
            <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${
              isNeon ? 'text-white/40' : 'text-neutral-500'
            }`}>Symmetric Scale</span>

            <button
              onClick={handleFullscreenToggle}
              className={`py-3 px-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer text-xs font-mono font-bold ${
                isNeon
                  ? 'bg-white/5 border-white/10 text-slate-300 hover:border-cyan-500 hover:text-cyan-400'
                  : 'bg-neutral-50 border-2 border-neutral-800 hover:bg-neutral-100 text-neutral-800 shadow-[2px_2px_0_0_rgba(0,0,0,0.06)]'
              }`}
              id="dashboard-fullscreen-btn"
            >
              <span>FULLSCREEN</span>
              <div className="flex items-center gap-1.5">
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span>{isFullscreen ? 'ACTIVE' : 'TOGGLE'}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* GAME GRID */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Zap size={18} className={isNeon ? 'text-amber-400' : 'text-neutral-900'} />
          <h2 className={`text-lg font-black tracking-tight ${
            isNeon ? 'text-slate-200' : 'text-neutral-900 font-extrabold uppercase'
          }`}>
            Available Games
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GAMES_DATA.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              appTheme={settings.theme}
              soundEnabled={settings.soundEnabled}
              onPlay={onSelectGame}
            />
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-16 text-center border-t py-6 border-neutral-800/10">
        <p className={`text-[10px] uppercase tracking-wider font-mono ${
          isNeon ? 'text-slate-600' : 'text-neutral-400'
        }`}>
          Game Box Cabinet Engine. Made with strict responsive ergonomics.
        </p>
      </div>

    </div>
  );
};
