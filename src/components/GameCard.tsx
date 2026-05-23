import React, { useState } from 'react';
import { 
  Activity, 
  Crosshair, 
  Car, 
  Flame, 
  Compass, 
  Swords, 
  Lock, 
  Play,
  Sparkles,
  Users,
  User,
  Zap,
  Cpu
} from 'lucide-react';
import { GameDefinition, AppTheme } from '../types';
import { playClickSound } from '../utils/audio';

interface GameCardProps {
  game: GameDefinition;
  appTheme: AppTheme;
  soundEnabled: boolean;
  onPlay: (gameId: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  appTheme,
  soundEnabled,
  onPlay,
}) => {
  const isPlayable = game.status === 'playable';

  // Map icon names to local Lucide elements
  const renderIcon = () => {
    const iconProps = {
      size: 28,
      className: `transition-transform duration-300 group-hover:scale-110 ${
        isPlayable 
          ? appTheme === 'neon'
            ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]'
            : 'text-neutral-750'
          : 'text-neutral-500'
      }`
    };

    switch (game.iconName) {
      case 'Activity': return <Activity {...iconProps} />;
      case 'Crosshair': return <Crosshair {...iconProps} />;
      case 'Car': return <Car {...iconProps} />;
      case 'Flame': return <Flame {...iconProps} />;
      case 'Compass': return <Compass {...iconProps} />;
      case 'Swords': return <Swords {...iconProps} />;
      default: return <Activity {...iconProps} />;
    }
  };

  // Get color configurations based on theme and game color spec
  const getThemeStyles = () => {
    if (appTheme === 'neon') {
      if (isPlayable) {
        return {
          card: 'glass bg-cyan-950/10 border-cyan-500/50 hover:border-cyan-400 border-2 shadow-[0_4px_25px_rgba(6,182,212,0.15)] hover:shadow-[0_0_35px_rgba(6,182,212,0.35)]',
          badge: 'bg-cyan-500 text-black font-black px-2 py-0.5 rounded text-[10px]',
          title: 'text-white group-hover:text-cyan-400 font-extrabold',
          desc: 'text-white/70',
          button: 'bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all',
        };
      } else {
        return {
          card: 'glass border-white/10 opacity-60 flex flex-col justify-between cursor-not-allowed',
          badge: 'bg-white/10 text-white/40 border border-white/10 px-2 py-1',
          title: 'text-white/40 font-bold',
          desc: 'text-white/30',
          button: 'bg-white/10 text-white/40 font-bold rounded-xl cursor-not-allowed border border-white/5',
        };
      }
    } else {
      // Classic theme
      if (isPlayable) {
        return {
          card: 'bg-white border-2 border-neutral-800 hover:border-neutral-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5',
          badge: 'bg-neutral-100 text-neutral-800 border-2 border-neutral-800 font-semibold',
          title: 'text-neutral-900 font-extrabold',
          desc: 'text-neutral-600',
          button: 'bg-neutral-900 hover:bg-neutral-800 text-white font-bold border-2 border-neutral-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]',
        };
      } else {
        return {
          card: 'bg-neutral-50 border-2 border-dashed border-neutral-300 opacity-60',
          badge: 'bg-transparent text-neutral-400 border border-dashed border-neutral-300',
          title: 'text-neutral-400 font-bold',
          desc: 'text-neutral-400',
          button: 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed',
        };
      }
    }
  };

  const styles = getThemeStyles();

  const handleAction = () => {
    if (isPlayable) {
      playClickSound(soundEnabled);
      onPlay(game.id);
    }
  };

  const selectClick = () => {
    playClickSound(soundEnabled);
  };

  return (
    <div 
      className={`group flex flex-col justify-between rounded-2xl p-6 transition-all duration-300 relative overflow-hidden ${styles.card}`}
      id={`game-card-${game.id}`}
    >
      {/* Visual highlights for playability */}
      {isPlayable && appTheme === 'neon' && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
      )}

      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 bg-neutral-900/10 rounded-xl border border-neutral-800/10 group-hover:scale-105 transition-transform">
            {renderIcon()}
          </div>
          <span className={`text-[10px] uppercase font-mono px-2.5 py-1 rounded-full ${styles.badge}`}>
            {isPlayable ? (
              <span className="flex items-center gap-1.5 font-bold">
                {appTheme === 'neon' && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                Playable
              </span>
            ) : (
              'Coming Soon'
            )}
          </span>
        </div>

        {/* Title & Description */}
        <h3 className={`text-xl font-bold mb-2 tracking-tight transition-colors duration-200 ${styles.title}`}>
          {game.title}
        </h3>
        <p className={`text-sm leading-relaxed mb-6 font-sans ${styles.desc}`}>
          {game.description}
        </p>
      </div>

      {/* Action Area */}
      <div>
        {isPlayable ? (
          <button
            onClick={handleAction}
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer text-sm font-semibold tracking-wide ${styles.button}`}
            id={`play-btn-${game.id}`}
          >
            <Play size={16} fill="currentColor" />
            <span>START PLAYING</span>
          </button>
        ) : (
          <button
            disabled
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed text-sm font-semibold tracking-wide ${styles.button}`}
          >
            <Lock size={14} />
            <span>COMING SOON</span>
          </button>
        )}
      </div>
    </div>
  );
};

