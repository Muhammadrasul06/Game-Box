import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Gamepad2, 
  ArrowLeft, 
  Trophy, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Monitor,
  Sparkles
} from 'lucide-react';
import { Direction, Position, SnakeVisualMode, AppSettings } from '../types';
import { 
  playEatSound, 
  playGameOverSound, 
  playMoveSound, 
  playClickSound, 
  playPauseSound 
} from '../utils/audio';

interface SnakeGameProps {
  settings: AppSettings;
  onBackToMenu: () => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

const GRID_SIZE = 20;

export const SnakeGame: React.FC<SnakeGameProps> = ({
  settings,
  onBackToMenu,
  onUpdateSettings,
}) => {
  // Game Setup state vs. Active gameplay state
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [visualMode, setVisualMode] = useState<SnakeVisualMode>(settings.theme);

  // Core gameplay states
  const [snake, setSnake] = useState<Position[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [nextDirection, setNextDirection] = useState<Direction>('RIGHT');
  const [food, setFood] = useState<Position>({ x: 14, y: 10 });
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('gamebox_snake_highscore') || '0');
    } catch {
      return 0;
    }
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);

  // Swipe gesture tracking coords
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Speed mapping based on selected difficulties
  const getSpeedMs = (): number => {
    switch (settings.difficulty) {
      case 'easy': return 160;
      case 'hard': return 65;
      case 'normal':
      default: return 105;
    }
  };

  const speedMs = getSpeedMs();

  // Generate a random food position outside of the snake's body
  const generateRandomFood = useCallback((currentSnake: Position[]): Position => {
    let attempts = 0;
    while (attempts < 200) {
      const x = Math.floor(Math.random() * GRID_SIZE);
      const y = Math.floor(Math.random() * GRID_SIZE);
      const isOnSnake = currentSnake.some(segment => segment.x === x && segment.y === y);
      if (!isOnSnake) {
        return { x, y };
      }
      attempts++;
    }
    // Fallback if full board is filled (nearly impossible)
    return { x: 0, y: 0 };
  }, []);

  // Soft startup / reset
  const handleResetGame = useCallback(() => {
    playClickSound(settings.soundEnabled);
    const initialSnake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    setSnake(initialSnake);
    setDirection('RIGHT');
    setNextDirection('RIGHT');
    setScore(0);
    setFood(generateRandomFood(initialSnake));
    setIsGameOver(false);
    setIsPaused(false);
    setIsPlaying(true);
  }, [settings.soundEnabled, generateRandomFood]);

  // Handle Play trigger
  const handleStartPlaying = () => {
    playClickSound(settings.soundEnabled);
    setHasStarted(true);
    handleResetGame();
  };

  const handlePauseToggle = useCallback(() => {
    playPauseSound(settings.soundEnabled);
    setIsPaused(prev => !prev);
  }, [settings.soundEnabled]);

  // Handle direct movement triggers
  const changeDirection = useCallback((newDir: Direction) => {
    setNextDirection(prevNext => {
      // Prevent immediate opposite turnbacks
      if (newDir === 'UP' && direction === 'DOWN') return prevNext;
      if (newDir === 'DOWN' && direction === 'UP') return prevNext;
      if (newDir === 'LEFT' && direction === 'RIGHT') return prevNext;
      if (newDir === 'RIGHT' && direction === 'LEFT') return prevNext;
      
      playMoveSound(settings.soundEnabled);
      return newDir;
    });
  }, [direction, settings.soundEnabled]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasStarted || isPaused || isGameOver) return;

      const key = e.key;
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          changeDirection('UP');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          changeDirection('DOWN');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          changeDirection('LEFT');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          changeDirection('RIGHT');
          break;
        case ' ': // Spacebar for play/pause
          e.preventDefault();
          handlePauseToggle();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasStarted, isPaused, isGameOver, changeDirection, handlePauseToggle]);

  // Swipe gesturers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!hasStarted || isPaused || isGameOver) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !hasStarted || isPaused || isGameOver) return;

    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;
    
    // Minimum distance threshold to register swipe (e.g. 25px)
    const threshold = 30;

    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Horizontal swipe
      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          changeDirection('RIGHT');
        } else {
          changeDirection('LEFT');
        }
        touchStartRef.current = null; // Reset after capture
      }
    } else {
      // Vertical swipe
      if (Math.abs(diffY) > threshold) {
        if (diffY > 0) {
          changeDirection('DOWN');
        } else {
          changeDirection('UP');
        }
        touchStartRef.current = null; // Reset after capture
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  // Main game tick loop
  useEffect(() => {
    if (!hasStarted || !isPlaying || isPaused || isGameOver) return;

    const moveSnake = () => {
      setDirection(nextDirection);

      setSnake(prevSnake => {
        const head = prevSnake[0];
        let newHead = { ...head };

        switch (nextDirection) {
          case 'UP': newHead.y -= 1; break;
          case 'DOWN': newHead.y += 1; break;
          case 'LEFT': newHead.x -= 1; break;
          case 'RIGHT': newHead.x += 1; break;
        }

        // 1. Collision Check: Wall limits
        if (
          newHead.x < 0 || 
          newHead.x >= GRID_SIZE || 
          newHead.y < 0 || 
          newHead.y >= GRID_SIZE
        ) {
          setIsGameOver(true);
          playGameOverSound(settings.soundEnabled);
          return prevSnake;
        }

        // 2. Collision Check: Self eating
        const hitsSelf = prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y);
        if (hitsSelf) {
          setIsGameOver(true);
          playGameOverSound(settings.soundEnabled);
          return prevSnake;
        }

        const updatedSnake = [newHead, ...prevSnake];

        // 3. Feeding Check
        if (newHead.x === food.x && newHead.y === food.y) {
          // Snake grows: do not pop the tail segment
          playEatSound(settings.soundEnabled);
          
          setScore(prevScore => {
            const currentNew = prevScore + 10;
            if (currentNew > highScore) {
              setHighScore(currentNew);
              try {
                localStorage.setItem('gamebox_snake_highscore', String(currentNew));
              } catch (_) {}
            }
            return currentNew;
          });

          // Generate food outside updated body points
          setFood(generateRandomFood(updatedSnake));
        } else {
          // Remove tail block
          updatedSnake.pop();
        }

        return updatedSnake;
      });
    };

    const intervalId = setInterval(moveSnake, speedMs);
    return () => clearInterval(intervalId);
  }, [hasStarted, isPlaying, isPaused, isGameOver, nextDirection, food, speedMs, generateRandomFood, settings.soundEnabled, highScore]);

  // Setup layout specifications for rendering elements inside the viewport
  const isNeon = visualMode === 'neon';

  return (
    <div 
      className={`min-h-[85vh] flex flex-col justify-between p-4 md:p-6 w-full max-w-5xl mx-auto transition-colors duration-500 rounded-3xl ${
        isNeon 
          ? 'bg-[#060a12]/95 border border-cyan-500/10 shadow-[0_4px_30px_rgba(0,0,0,0.8)]' 
          : 'bg-[#bce6b0] text-[#0f380f] border-4 border-[#0f380f] shadow-[8px_8px_0_0_rgba(15,56,15,1)]'
      }`}
      style={{
        boxShadow: isNeon ? 'inset 0 0 100px rgba(6,182,212,0.06)' : undefined
      }}
      id="snake-container-root"
    >
      
      {/* 1. Setup / Selection screen (prior to start) */}
      {!hasStarted ? (
        <div className="flex-1 flex flex-col justify-center items-center py-8 text-center px-4 max-w-lg mx-auto">
          <div className="mb-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs uppercase rounded-full ${
              isNeon 
                ? 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/50' 
                : 'bg-[#58804c] text-[#bce6b0] border-2 border-[#0f380f]'
            }`}>
              <Sparkles size={12} className={isNeon ? 'animate-pulse' : ''} />
              Snake Classic
            </span>
          </div>

          <h2 className={`text-3xl md:text-4xl font-extrabold mb-3 tracking-tight ${
            isNeon ? 'text-white font-sans' : 'text-[#0f380f] uppercase'
          }`}>
            Ready To Play?
          </h2>

          <p className={`text-sm mb-8 leading-relaxed ${
            isNeon ? 'text-slate-400' : 'text-[#306230] font-medium'
          }`}>
            Swipe or use WASD/Arrows to maneuver. Gather food segments to grow, avoid edges, and beat your personal record!
          </p>

          {/* Style parameters for starting */}
          <div className="w-full mb-8">
            <h4 className={`text-xs uppercase font-mono tracking-wider mb-3 font-semibold ${
              isNeon ? 'text-slate-300' : 'text-[#0f380f]'
            }`}>
              Select Board Aesthetics
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {/* Classic button selector */}
              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  setVisualMode('classic');
                }}
                className={`py-6 px-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  !isNeon 
                    ? 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] font-bold shadow-[4px_4px_0_0_rgba(15,56,15,1)] translate-y-[-2px]' 
                    : 'bg-neutral-900/40 border-neutral-800 text-neutral-400 font-medium hover:border-neutral-700'
                }`}
                id="select-style-classic"
              >
                <div className="w-8 h-8 rounded bg-[#306230] flex items-center justify-center text-[#9bbc0f] text-xs font-mono font-bold">
                  90s
                </div>
                <div className="text-xs uppercase font-mono mt-1">Nokia LCD</div>
              </button>

              {/* Neon button selector */}
              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  setVisualMode('neon');
                }}
                className={`py-6 px-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  isNeon 
                    ? 'bg-cyan-950/30 border-cyan-400/80 text-cyan-300 font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
                    : 'bg-[#58804c] border-[#0f380f] text-[#0f380f]/40 font-medium hover:bg-[#6c9860]'
                }`}
                id="select-style-neon"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-900 border border-cyan-400 animate-pulse flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.6)]">
                  <div className="w-2 h-2 rounded-full bg-cyan-300" />
                </div>
                <div className="text-xs uppercase font-mono mt-1">Vibrant Neon</div>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 w-full">
            <button
              onClick={() => {
                playClickSound(settings.soundEnabled);
                onBackToMenu();
              }}
              className={`flex-1 py-4.5 rounded-xl text-sm font-semibold tracking-wide border-2 transition-all cursor-pointer flex items-center justify-center gap-2 ${
                isNeon 
                  ? 'bg-transparent border-slate-700 text-slate-300 hover:bg-slate-900/60' 
                  : 'bg-transparent border-[#0f380f] text-[#0f380f] hover:bg-[#58804c]/10'
              }`}
              id="back-btn-setup"
            >
              <ArrowLeft size={16} />
              <span>EXIT TO MENU</span>
            </button>

            <button
              onClick={handleStartPlaying}
              className={`flex-1 py-4.5 rounded-xl text-sm font-bold tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                isNeon 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-[0_4px_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]' 
                  : 'bg-[#0f380f] text-[#bce6b0] font-extrabold border-2 border-[#0f380f] shadow-[4px_4px_0_0_rgba(15,56,15,0.4)] hover:shadow-[6px_6px_0_0_rgba(15,56,15,0.4)]'
              }`}
              id="start-playing-btn"
            >
              <Play size={16} fill="currentColor" />
              <span>PLAY NOW</span>
            </button>
          </div>
        </div>
      ) : (
        /* 2. Active Screen Layout (HUD, Board, Footer Actions, D-pad controllers) */
        <div className="flex-1 flex flex-col md:flex-row gap-6 lg:gap-8 justify-center items-center h-full">
          
          {/* Left panel / HUD Info */}
          <div className="w-full md:w-56 flex flex-row md:flex-col justify-between md:justify-start gap-4 md:gap-6 shrink-0">
            {/* Header info / Return arrow button */}
            <div className="hidden md:flex items-center gap-3 mb-2">
              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  setIsPlaying(false);
                  setHasStarted(false);
                }}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isNeon 
                    ? 'bg-neutral-900/80 border-neutral-800 text-slate-400 hover:text-white' 
                    : 'bg-[#58804c] border-[#0f380f] text-[#0f380f] hover:bg-[#306230]/20'
                }`}
                id="back-to-setup-btn"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h3 className={`text-base font-bold ${isNeon ? 'text-white' : 'text-[#0f380f] uppercase'}`}>
                  Snake Grid
                </h3>
                <p className={`text-[10px] uppercase font-mono font-medium ${isNeon ? 'text-cyan-400' : 'text-[#306230]'}`}>
                  {settings.difficulty} MODE
                </p>
              </div>
            </div>

            {/* Scores summary */}
            <div className="flex flex-row md:flex-col gap-4 flex-1 justify-around md:justify-start">
              {/* Score card */}
              <div className={`p-4 rounded-xl flex-1 md:flex-none transition-all duration-350 ${
                isNeon 
                  ? 'glass bg-white/5 border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' 
                  : 'bg-[#8bac0f] border-2 border-[#0f380f]'
              }`}>
                <div className={`text-[10px] uppercase font-mono tracking-wider mb-0.5 font-bold ${
                  isNeon ? 'text-white/50' : 'text-[#306230]'
                }`}>Score</div>
                <div className={`text-2xl md:text-4xl font-black font-mono tracking-tight leading-none ${
                  isNeon ? 'text-cyan-400 neon-glow' : 'text-[#0f380f]'
                }`}>
                  {String(score).padStart(3, '0')}
                </div>
              </div>

              {/* Best score card */}
              <div className={`p-4 rounded-xl flex-1 md:flex-none transition-all duration-350 ${
                isNeon 
                  ? 'glass bg-white/5 border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' 
                  : 'bg-[#8bac0f] border-2 border-[#0f380f]'
              }`}>
                <div className={`text-[10px] uppercase font-mono tracking-wider mb-0.5 font-bold md:flex items-center gap-1 ${
                  isNeon ? 'text-white/50' : 'text-[#306230]'
                }`}>
                  <Trophy size={11} /> <span>Best</span>
                </div>
                <div className={`text-xl md:text-2xl font-bold font-mono tracking-tight leading-none ${
                  isNeon ? 'text-white' : 'text-[#0f380f]'
                }`}>
                  {String(highScore).padStart(3, '0')}
                </div>
              </div>
            </div>

            {/* Mobile Title View */}
            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  setIsPlaying(false);
                  setHasStarted(false);
                }}
                className={`p-2 rounded-xl border cursor-pointer ${
                  isNeon 
                    ? 'bg-neutral-900/80 border-neutral-800 text-slate-400' 
                    : 'bg-[#58804c] border-2 border-[#0f380f] text-[#0f380f]'
                }`}
              >
                <ArrowLeft size={16} />
              </button>
              <div className="text-left">
                <div className={`text-xs font-bold leading-tight ${isNeon ? 'text-white' : 'text-[#0f380f]'}`}>
                  Snake Grid
                </div>
                <div className={`text-[9px] font-mono leading-none ${isNeon ? 'text-cyan-400' : 'text-[#306230]'}`}>
                  {settings.difficulty.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Center Stage Game Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-0.5 relative max-w-sm md:max-w-md lg:max-w-lg w-full">
            {/* The SVG Game Board */}
            <div 
              className={`relative w-full aspect-square border-4 rounded-2xl overflow-hidden shadow-2xl ${
                isNeon 
                  ? 'bg-[#04080f] border-cyan-500/25 shadow-cyan-950/40' 
                  : 'bg-[#9bbc0f] border-[#0f380f]'
              }`}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              id="game-board-viewport"
            >
              <svg 
                viewBox="0 0 400 400" 
                className="w-full h-full select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* SVG glowing filters for neon Mode */}
                {isNeon && (
                  <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                )}

                {/* Grid Background Lines */}
                {isNeon ? (
                  // Neon grid lines
                  Array.from({ length: GRID_SIZE - 1 }).map((_, idx) => {
                    const coord = (idx + 1) * (400 / GRID_SIZE);
                    return (
                      <g key={`grid-${idx}`}>
                        <line 
                          x1={coord} y1="0" x2={coord} y2="400" 
                          stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" 
                        />
                        <line 
                          x1="0" y1={coord} x2="400" y2={coord} 
                          stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" 
                        />
                      </g>
                    );
                  })
                ) : (
                  // Classic Grid Nokia pattern lines helper
                  Array.from({ length: GRID_SIZE - 1 }).map((_, idx) => {
                    const coord = (idx + 1) * (400 / GRID_SIZE);
                    return (
                      <g key={`grid-classic-${idx}`} opacity="0.12">
                        <line 
                          x1={coord} y1="0" x2={coord} y2="400" 
                          stroke="#0f380f" strokeWidth="0.5" 
                        />
                        <line 
                          x1="0" y1={coord} x2="400" y2={coord} 
                          stroke="#0f380f" strokeWidth="0.5" 
                        />
                      </g>
                    );
                  })
                )}

                {/* Snake rendering */}
                {snake.map((segment, idx) => {
                  const size = (400 / GRID_SIZE);
                  const pad = isNeon ? 2 : 1.5;
                  const width = size - pad * 2;
                  const height = size - pad * 2;
                  const x = segment.x * size + pad;
                  const y = segment.y * size + pad;
                  const isHead = idx === 0;

                  // Snake aesthetic colors
                  if (isNeon) {
                    const colorFill = isHead ? '#06b6d4' : 'rgba(6, 182, 212, 0.65)';
                    const glowFilter = isHead ? 'url(#glow)' : 'url(#soft-glow)';
                    const radius = isHead ? 6 : 4;
                    return (
                      <rect
                        key={`snake-${idx}`}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={radius}
                        ry={radius}
                        fill={colorFill}
                        filter={glowFilter}
                        className="transition-all duration-75"
                        opacity={isHead ? 1 : Math.max(0.4, 1 - idx * 0.04)}
                      />
                    );
                  } else {
                    // Nokia classic brick bricklets
                    return (
                      <g key={`snake-classic-${idx}`}>
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill="#0f380f"
                        />
                        {/* Make a black-block detail frame pattern inside */}
                        <rect
                          x={x + 2}
                          y={y + 2}
                          width={width - 4}
                          height={height - 4}
                          fill="none"
                          stroke="#9bbc0f"
                          strokeWidth="1"
                        />
                      </g>
                    );
                  }
                })}

                {/* Food rendering */}
                {(() => {
                  const cellSize = 400 / GRID_SIZE;
                  const r = (cellSize - (isNeon ? 5 : 4)) / 2;
                  const cx = food.x * cellSize + cellSize / 2;
                  const cy = food.y * cellSize + cellSize / 2;

                  if (isNeon) {
                    return (
                      <g>
                        {/* Food cherry pulsing outer drop-shadow glow */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 3}
                          fill="#ec4899"
                          opacity="0.3"
                          filter="url(#glow)"
                          className="food-glow origin-center"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill="#ec4899"
                          filter="url(#glow)"
                          className="food-glow origin-center"
                        />
                        {/* core highlight */}
                        <circle
                          cx={cx - 1.5}
                          cy={cy - 1.5}
                          r={1.5}
                          fill="#ffffff"
                        />
                      </g>
                    );
                  } else {
                    // Classic Nokia circular target blocks
                    return (
                      <g>
                        <rect
                          x={food.x * cellSize + 3}
                          y={food.y * cellSize + 3}
                          width={cellSize - 6}
                          height={cellSize - 6}
                          fill="#0f380f"
                          rx={cellSize / 2}
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill="#9bbc0f"
                        />
                      </g>
                    );
                  }
                })()}
              </svg>

              {/* In-game Pause overlay display */}
              {isPaused && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col justify-center items-center text-center animate-fade-in pointer-events-none">
                  <div className={`p-4 rounded-full mb-3 ${isNeon ? 'bg-cyan-950/60 border border-cyan-500/30' : 'bg-[#58804c]'}`}>
                    <Pause size={32} className={isNeon ? 'text-cyan-400 animate-pulse' : 'text-[#0f380f]'} />
                  </div>
                  <h3 className={`text-xl font-bold font-mono tracking-wider ${isNeon ? 'text-white' : 'text-[#0f380f] uppercase'}`}>
                    PAUSED
                  </h3>
                  <p className={`text-xs ${isNeon ? 'text-slate-400' : 'text-[#306230]'}`}>
                    Press SPACE or tap PAUSE to resume
                  </p>
                </div>
              )}
            </div>

            {/* Mobile Touch Arrow Controllers (Shown beneath board on mobile / smaller touch screens) */}
            <div className="w-full mt-6 md:hidden flex justify-center py-2">
              <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                {/* Center Core node */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 ${
                  isNeon 
                    ? 'bg-[#0f172a] border-slate-800 text-slate-500 shadow-[inset_0_0_12px_rgba(0,0,0,0.8)]' 
                    : 'bg-[#58804c] border-[#0f380f] text-[#0f380f]'
                }`}>
                  <Gamepad2 size={24} />
                </div>

                {/* Arrow UP */}
                <button
                  onClick={() => changeDirection('UP')}
                  className={`absolute top-0 w-13 h-13 rounded-2xl flex items-center justify-center border-3 transition-active active:scale-95 cursor-pointer ${
                    isNeon
                      ? 'bg-neutral-900 border-slate-700 hover:border-cyan-500 text-slate-200'
                      : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-[1px_1px_0_0_rgba(15,56,15,1)]'
                  }`}
                  aria-label="Move Up"
                >
                  <ChevronUp size={28} />
                </button>

                {/* Arrow RIGHT */}
                <button
                  onClick={() => changeDirection('RIGHT')}
                  className={`absolute right-0 w-13 h-13 rounded-2xl flex items-center justify-center border-3 transition-active active:scale-95 cursor-pointer ${
                    isNeon
                      ? 'bg-neutral-900 border-slate-700 hover:border-cyan-500 text-slate-200'
                      : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-[1px_1px_0_0_rgba(15,56,15,1)]'
                  }`}
                  aria-label="Move Right"
                >
                  <ChevronRight size={28} />
                </button>

                {/* Arrow DOWN */}
                <button
                  onClick={() => changeDirection('DOWN')}
                  className={`absolute bottom-0 w-13 h-13 rounded-2xl flex items-center justify-center border-3 transition-active active:scale-95 cursor-pointer ${
                    isNeon
                      ? 'bg-neutral-900 border-slate-700 hover:border-cyan-500 text-slate-200'
                      : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-[1px_1px_0_0_rgba(15,56,15,1)]'
                  }`}
                  aria-label="Move Down"
                >
                  <ChevronDown size={28} />
                </button>

                {/* Arrow LEFT */}
                <button
                  onClick={() => changeDirection('LEFT')}
                  className={`absolute left-0 w-13 h-13 rounded-2xl flex items-center justify-center border-3 transition-active active:scale-95 cursor-pointer ${
                    isNeon
                      ? 'bg-neutral-900 border-slate-700 hover:border-cyan-500 text-slate-200'
                      : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-[1px_1px_0_0_rgba(15,56,15,1)]'
                  }`}
                  aria-label="Move Left"
                >
                  <ChevronLeft size={28} />
                </button>
              </div>
            </div>
          </div>

          {/* Right Action side actions panel (Pause, Restart, Sound togglers) */}
          <div className="w-full md:w-56 flex flex-row md:flex-col gap-3 justify-between md:justify-end shrink-0 py-2">
            
            {/* Play/Pause Button */}
            <button
              onClick={handlePauseToggle}
              className={`flex-1 md:flex-none py-3 px-4 rounded-xl text-center text-xs font-bold font-mono tracking-wider border-2 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                isNeon
                  ? isPaused 
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
                    : 'bg-neutral-900/80 border-slate-700 hover:border-slate-500 text-slate-300'
                  : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
              }`}
              id="game-pause-btn"
            >
              <Pause size={14} />
              <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
            </button>

            {/* Restart Button */}
            <button
              onClick={handleResetGame}
              className={`flex-1 md:flex-none py-3 px-4 rounded-xl text-center text-xs font-bold font-mono tracking-wider border-2 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                isNeon
                  ? 'bg-neutral-900/80 border-slate-700 hover:border-cyan-500 hover:text-cyan-400 text-slate-300'
                  : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
              }`}
              id="game-restart-btn"
            >
              <RotateCcw size={14} />
              <span>RESTART</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => {
                onUpdateSettings({ soundEnabled: !settings.soundEnabled });
                // Instantly play a feedback click sound
                playClickSound(!settings.soundEnabled);
              }}
              className={`py-3 px-4 rounded-xl text-center text-xs font-bold font-mono border-2 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                isNeon
                  ? 'bg-neutral-900/80 border-slate-700 hover:border-slate-500 text-slate-300'
                  : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
              }`}
              id="game-sound-toggle"
            >
              {settings.soundEnabled ? (
                <>
                  <Volume2 size={14} />
                  <span>SOUND: ON</span>
                </>
              ) : (
                <>
                  <VolumeX size={14} />
                  <span>SOUND: OFF</span>
                </>
              )}
            </button>

            {/* Visual theme Switcher (In-game switchable) */}
            <button
              onClick={() => {
                playClickSound(settings.soundEnabled);
                setVisualMode(prev => prev === 'neon' ? 'classic' : 'neon');
              }}
              className={`hidden md:flex py-3 px-4 rounded-xl text-center text-xs font-bold font-mono border-2 items-center justify-center gap-2 cursor-pointer transition-all ${
                isNeon
                  ? 'bg-neutral-900/80 border-slate-700 hover:border-slate-500 text-slate-300'
                  : 'bg-[#8bac0f] border-[#0f380f] text-[#0f380f] shadow-[2px_2px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
              }`}
              id="game-theme-switcher"
            >
              <Monitor size={14} />
              <span>STYLE: {visualMode.toUpperCase()}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Game Over Screen Modal (Styled overlays) */}
      {isGameOver && (
        <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-[4px] z-50 flex items-center justify-center p-4">
          <div 
            className={`w-full max-w-sm rounded-2xl p-6 md:p-8 text-center animate-scale-up ${
              isNeon 
                ? 'bg-neutral-900 border border-emerald-500/30 shadow-[0_10px_40px_rgba(16,185,129,0.15)]' 
                : 'bg-[#9bbc0f] border-4 border-[#0f380f] shadow-[6px_6px_0_0_rgba(15,56,15,1)] text-[#0f380f]'
            }`}
            id="gameover-modal-body"
          >
            <div className="inline-flex p-4 rounded-full mb-4 bg-[#0f380f]/10 text-[#0f380f]">
              <Trophy size={42} className={isNeon ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'text-[#0f380f]'} />
            </div>

            <h3 className={`text-2xl md:text-3xl font-black mb-1 letter-tracking-wide tracking-tight ${
              isNeon ? 'text-white' : 'text-[#0f380f] uppercase'
            }`}>
              Game Over
            </h3>
            
            <p className={`text-xs mb-6 font-mono ${
              isNeon ? 'text-slate-400' : 'text-[#306230]'
            }`}>
              SNAKE COLLISION TRIGGERED
            </p>

            {/* Score logs list */}
            <div className={`rounded-xl p-4 mb-8 grid grid-cols-2 gap-4 ${
              isNeon ? 'bg-neutral-950/70 border border-neutral-800' : 'bg-[#8bac0f] border-2 border-[#0f380f]'
            }`}>
              <div className="text-center border-r border-[#0f380f]/20">
                <span className={`text-[10px] uppercase font-mono block mb-0.5 ${isNeon ? 'text-slate-400' : 'text-[#306230]'}`}>
                  Final Score
                </span>
                <span className={`text-2xl md:text-3xl font-black font-mono leading-none ${isNeon ? 'text-white' : 'text-[#0f380f]'}`}>
                  {score}
                </span>
              </div>

              <div className="text-center">
                <span className={`text-[10px] uppercase font-mono block mb-0.5 ${isNeon ? 'text-slate-400' : 'text-[#306230]'}`}>
                  Best Score
                </span>
                <span className={`text-2xl md:text-3xl font-black font-mono leading-none ${isNeon ? 'text-emerald-400' : 'text-[#0f380f]'}`}>
                  {highScore}
                </span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleResetGame}
                className={`py-3.5 rounded-xl font-bold text-sm tracking-wider cursor-pointer duration-200 transition-all ${
                  isNeon
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                    : 'bg-[#0f380f] text-[#bce6b0] font-extrabold border-2 border-[#0f380f] shadow-[3px_3px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
                }`}
                id="modal-restart-btn"
              >
                PLAY AGAIN
              </button>

              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  setIsPlaying(false);
                  setHasStarted(false);
                }}
                className={`py-3.5 rounded-xl font-semibold text-sm tracking-wide cursor-pointer transition-all border-2 ${
                  isNeon
                    ? 'bg-transparent border-slate-700 hover:border-slate-500 text-slate-300 hover:bg-slate-800/40'
                    : 'bg-[#8bac0f] text-[#0f380f] border-[#0f380f] shadow-[3px_3px_0_0_rgba(15,56,15,1)] active:translate-y-0.5 active:shadow-none'
                }`}
                id="modal-menu-btn"
              >
                CHOOSE STYLES
              </button>

              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  onBackToMenu();
                }}
                className={`text-xs underline font-sans mt-2 cursor-pointer ${
                  isNeon ? 'text-slate-500 hover:text-slate-300' : 'text-[#306230] hover:text-[#0f380f]'
                }`}
                id="modal-backtohome-btn"
              >
                Back to main gamebox hub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
