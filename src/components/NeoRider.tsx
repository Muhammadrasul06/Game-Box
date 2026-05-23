import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Volume2, 
  VolumeX, 
  Info,
  Sparkles,
  Zap,
  Play,
  RotateCw,
  Pause,
  ShieldAlert,
} from 'lucide-react';
import { AppSettings } from '../types';

interface NeoRiderProps {
  settings: AppSettings;
  onBackToMenu: () => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

interface TrackPoint {
  x: number;
  y: number;
  angle: number;
  type: 'normal' | 'ramp' | 'gap' | 'spike' | 'boost';
}

interface Coin {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  value: number;
  pulseOffset: number;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface TrickAnimation {
  text: string;
  x: number;
  y: number;
  life: number;
}

export const NeoRider: React.FC<NeoRiderProps> = ({
  settings,
  onBackToMenu,
  onUpdateSettings
}) => {
  const [gameState, setGameState] = useState<'start' | 'controls' | 'playing' | 'paused' | 'gameover'>('start');
  const [soundOn, setSoundOn] = useState<boolean>(settings.soundEnabled);
  const [scoreCoins, setScoreCoins] = useState<number>(0);
  const [distance, setDistance] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [boostGauge, setBoostGauge] = useState<number>(100);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('neorider_best_dist');
      return saved ? parseFloat(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [activeTrick, setActiveTrick] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // High-performance game loop state container
  const engineRef = useRef({
    bike: {
      x: 100,
      y: 320,
      vx: 2.5,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
    },
    camera: {
      x: 100,
      y: 320,
      zoom: 1.0,
      shake: 0,
    },
    frontGrounded: false,
    rearGrounded: false,
    cumulativeRotation: 0,
    lastGroundedAngle: 0,
    flipTrickLogged: false,
    boostCharge: 100,

    // Keyboard inputs
    keys: {} as Record<string, boolean>,

    // Mobil controls state flags
    throttleActive: false,
    rotatingLeft: false,
    rotatingRight: false,
    boostActive: false,

    trackPoints: [] as TrackPoint[],
    coins: [] as Coin[],
    particles: [] as Particle[],
    trickAnims: [] as TrickAnimation[],

    trackStepDistance: 16,
    generatedUpToX: 0,
    distanceTraveled: 0,
    coinsCount: 0,
    startTime: 0,
    upsideDownTimer: 0,
    trail: [] as { x: number; y: number }[],
  });

  const playSoundTimer = useRef<any>(null);

  // Audio helper synths
  const initAudioCtx = () => {
    if (!soundOn) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (_) {}
  };

  const playSynthesizedSfx = (type: 'coin' | 'crash' | 'land' | 'boost' | 'rotate' | 'trick') => {
    if (!soundOn) return;
    initAudioCtx();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      if (type === 'coin') {
        const osc = ctx.createOscillator();
        const gainVal = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
        gainVal.gain.setValueAtTime(0.05, now);
        gainVal.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gainVal);
        gainVal.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'crash') {
        const osc = ctx.createOscillator();
        const gainVal = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.4);
        gainVal.gain.setValueAtTime(0.3, now);
        gainVal.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gainVal);
        gainVal.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'land') {
        const osc = ctx.createOscillator();
        const gainVal = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.08);
        gainVal.gain.setValueAtTime(0.15, now);
        gainVal.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gainVal);
        gainVal.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'boost') {
        const osc = ctx.createOscillator();
        const gainVal = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.25);
        gainVal.gain.setValueAtTime(0.08, now);
        gainVal.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gainVal);
        gainVal.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'rotate') {
        const osc = ctx.createOscillator();
        const gainVal = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(360, now + 0.06);
        gainVal.gain.setValueAtTime(0.02, now);
        gainVal.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gainVal);
        gainVal.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'trick') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gainVal = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);
          gainVal.gain.setValueAtTime(0.04, now + idx * 0.04);
          gainVal.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.15);
          osc.connect(gainVal);
          gainVal.connect(ctx.destination);
          osc.start(now + idx * 0.04);
          osc.stop(now + idx * 0.04 + 0.16);
        });
      }
    } catch (_) {}
  };

  const handleSoundToggle = () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    onUpdateSettings({ soundEnabled: nextVal });
    
    if (playSoundTimer.current) clearTimeout(playSoundTimer.current);
    playSoundTimer.current = setTimeout(() => {
      if (nextVal) {
        initAudioCtx();
        playSynthesizedSfx('coin');
      }
    }, 50);
  };

  useEffect(() => {
    return () => {
      if (playSoundTimer.current) clearTimeout(playSoundTimer.current);
    };
  }, []);

  // 1D Heightfield Sampler: Fast, modular, and extremely consistent height detection!
  const getGroundInfo = (x: number) => {
    const data = engineRef.current;
    if (data.trackPoints.length === 0) {
      return { y: 350, angle: 0, type: 'normal' as const, exists: false };
    }

    const firstPt = data.trackPoints[0];
    const lastPt = data.trackPoints[data.trackPoints.length - 1];

    if (x < firstPt.x) {
      return { y: firstPt.y, angle: 0, type: firstPt.type, exists: true };
    }
    if (x > lastPt.x) {
      return { y: lastPt.y, angle: 0, type: lastPt.type, exists: true };
    }

    const index = Math.floor((x - firstPt.x) / data.trackStepDistance);
    if (index < 0 || index >= data.trackPoints.length - 1) {
      return { y: 350, angle: 0, type: 'normal' as const, exists: false };
    }

    const p1 = data.trackPoints[index];
    const p2 = data.trackPoints[index + 1];

    if (p1.type === 'gap' || p2.type === 'gap') {
      return { y: 850, angle: 0, type: 'gap' as const, exists: false };
    }

    const t = (x - p1.x) / (p2.x - p1.x);
    const interpolatedY = p1.y + t * (p2.y - p1.y);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    return { 
      y: interpolatedY, 
      angle, 
      type: p1.type, 
      exists: true 
    };
  };

  // Safe procedural generation of hills, ramps, speedboosts, and gap catchments
  const generateTrackSegment = (startX: number, pointsCount: number, zoneType: 'easy' | 'medium') => {
    const data = engineRef.current;
    const spacing = data.trackStepDistance;
    let lastY = data.trackPoints.length > 0 ? data.trackPoints[data.trackPoints.length - 1].y : 350;
    let lastX = startX;

    const spawnCoin = (cx: number, cy: number, val = 10) => {
      data.coins.push({
        id: `coin_${cx}_${Date.now()}_${Math.random()}`,
        x: cx,
        y: cy,
        collected: false,
        value: val,
        pulseOffset: Math.random() * Math.PI
      });
    };

    const spawnCoinArc = (sX: number, eX: number, peakY: number, count = 5, val = 10) => {
      for (let c = 0; c < count; c++) {
        const ct = c / (count - 1);
        const cx = sX + ct * (eX - sX);
        const cy = peakY - Math.sin(ct * Math.PI) * 55;
        spawnCoin(cx, cy, val);
      }
    };

    const dist = startX / 10;
    let pool: string[] = [];

    // Progressive level templates selected by travel distance
    if (dist < 150) {
      // Relaxing early gameplay flow: waves, flat boost tunnels, downhill runs
      pool = ['smooth_hills', 'long_downhill', 'speed_tunnels', 'wave_tracks'];
    } else if (dist < 400) {
      // Fun-filled stunt ramps, speed pads, secondary loop ridges
      pool = ['smooth_hills', 'steep_ramps', 'long_downhill', 'speed_tunnels', 'loop_like_curve', 'wave_tracks', 'split_terrain'];
    } else if (dist < 800) {
      // Technical flow: danger gaps, vertical drops, spike valleys, speed ramps
      pool = ['steep_ramps', 'long_downhill', 'loop_like_curve', 'danger_gaps', 'spike_zones', 'vertical_drops', 'split_terrain'];
    } else {
      // Extreme stunt master challenges: steep cliffs, long gaps, dense hazards
      pool = ['steep_ramps', 'loop_like_curve', 'danger_gaps', 'spike_zones', 'vertical_drops', 'split_terrain'];
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];

    if (chosen === 'smooth_hills') {
      // 1. Smooth rolling scenic hills
      const len = 30;
      const amp = 18;
      for (let i = 0; i < len; i++) {
        const px = lastX + spacing;
        const py = lastY + Math.sin((i / len) * Math.PI * 2) * amp;
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
        if (i % 6 === 0) {
          spawnCoin(px, py - 32, 10);
        }
      }

    } else if (chosen === 'steep_ramps') {
      // 2. High-launch kicker ramps for flips
      const climbLen = 14;
      const height = -105;
      for (let i = 0; i < climbLen; i++) {
        const px = lastX + spacing;
        const t = i / (climbLen - 1);
        const py = lastY + height * (1 - Math.cos(t * Math.PI * 0.5));
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'ramp' });
        lastX = px;
      }
      spawnCoinArc(lastX - 100, lastX + 180, lastY + height - 55, 6, 20);

    } else if (chosen === 'long_downhill') {
      // 3. Steady long downhill slide to build extreme speeds
      const len = 38;
      const decline = 140;
      for (let i = 0; i < len; i++) {
        const px = lastX + spacing;
        const t = i / (len - 1);
        const py = lastY + decline * (0.5 - 0.5 * Math.cos(t * Math.PI));
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
        if (i % 6 === 0) {
          spawnCoin(px, py - 32, 10);
        }
      }

    } else if (chosen === 'speed_tunnels') {
      // 4. Flat tunnels lined with glowing boosters
      const len = 25;
      for (let i = 0; i < len; i++) {
        const px = lastX + spacing;
        const type = (i % 5 === 0) ? 'boost' as const : 'normal' as const;
        data.trackPoints.push({ x: px, y: lastY, angle: 0, type });
        lastX = px;
        if (i % 4 === 1) {
          spawnCoin(px, lastY - 32, 15);
        }
      }

    } else if (chosen === 'loop_like_curve') {
      // 5. Epic stunt wave resembling loopings
      const len = 42;
      const hAmt = 140;
      for (let i = 0; i < len; i++) {
        const px = lastX + spacing;
        const t = i / (len - 1);
        const py = lastY - Math.sin(t * Math.PI) * hAmt;
        const type = (t > 0.25 && t < 0.75) ? 'ramp' as const : 'normal' as const;
        data.trackPoints.push({ x: px, y: py, angle: 0, type });
        lastX = px;
        if (i % 4 === 0) {
          spawnCoin(px, py - 32, 10);
        }
      }

    } else if (chosen === 'danger_gaps') {
      // 6. Classic hazard chasms with precision coin guides
      const flat = 10;
      const gap = dist < 600 ? 6 : 8;
      const catcher = 16;
      for (let i = 0; i < flat; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: lastY, angle: 0, type: 'normal' });
        lastX = px;
      }
      for (let i = 0; i < gap; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: 850, angle: 0, type: 'gap' });
        lastX = px;
      }
      const catchY = lastY + 30;
      for (let i = 0; i < catcher; i++) {
        const px = lastX + spacing;
        const t = i / (catcher - 1);
        const py = catchY + 40 * (1 - t);
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
      }
      spawnCoinArc(lastX - (catcher + gap) * spacing, lastX - catcher * spacing, lastY - 60, 6, 20);

    } else if (chosen === 'spike_zones') {
      // 7. Hazardous spikes valleys with sweet gold rewards at high arcs
      const climb = 10;
      const hazard = 5;
      const escape = 12;
      for (let i = 0; i < climb; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: lastY, angle: 0, type: 'normal' });
        lastX = px;
      }
      const dipY = lastY + 28;
      for (let i = 0; i < hazard; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: dipY, angle: 0, type: 'spike' });
        lastX = px;
      }
      for (let i = 0; i < escape; i++) {
        const px = lastX + spacing;
        const t = i / (escape - 1);
        const py = dipY + (lastY - dipY) * (0.5 - 0.5 * Math.cos(t * Math.PI));
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
      }
      spawnCoinArc(lastX - (escape + hazard + climb) * spacing, lastX - escape * spacing, lastY - 50, 6, 20);

    } else if (chosen === 'vertical_drops') {
      // 8. Mega drop transitions into beautiful catch slopes
      const flat = 8;
      const dropHeight = 125;
      for (let i = 0; i < flat; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: lastY, angle: 0, type: 'normal' });
        lastX = px;
      }
      const gap = 6;
      for (let i = 0; i < gap; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: 850, angle: 0, type: 'gap' });
        lastX = px;
      }
      const endY = lastY + dropHeight;
      const blend = 18;
      for (let i = 0; i < blend; i++) {
        const px = lastX + spacing;
        const t = i / (blend - 1);
        const py = endY - 50 * (1 - t);
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
        if (i % 4 === 0) {
          spawnCoin(px, py - 32, 10);
        }
      }

    } else if (chosen === 'wave_tracks') {
      // 9. Alternating fast wave rhythm tracks
      const len = 35;
      const amp = 24;
      for (let i = 0; i < len; i++) {
        const px = lastX + spacing;
        const py = lastY + Math.sin((i / len) * Math.PI * 6) * amp;
        data.trackPoints.push({ x: px, y: py, angle: 0, type: 'normal' });
        lastX = px;
        if (i % 5 === 0) {
          spawnCoin(px, py - 32, 10);
        }
      }

    } else {
      // 10. Split Terrain Rhythm steps
      const step = 8;
      for (let i = 0; i < step; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: lastY - 30, angle: 0, type: 'normal' });
        lastX = px;
      }
      for (let i = 0; i < 4; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: 850, angle: 0, type: 'gap' });
        lastX = px;
      }
      for (let i = 0; i < step; i++) {
        const px = lastX + spacing;
        data.trackPoints.push({ x: px, y: lastY - 15, angle: 0, type: 'normal' });
        lastX = px;
        if (i % 3 === 0) {
          spawnCoin(px, lastY - 47, 10);
        }
      }
    }

    data.generatedUpToX = lastX;
  };

  const handleRestartGame = () => {
    const data = engineRef.current;
    
    data.bike = {
      x: 100,
      y: 320,
      vx: 2.5,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
    };

    data.camera = {
      x: 100,
      y: 320,
      zoom: 1.0,
      shake: 0,
    };
    
    data.frontGrounded = false;
    data.rearGrounded = false;
    data.cumulativeRotation = 0;
    data.lastGroundedAngle = 0;
    data.flipTrickLogged = false;
    data.boostCharge = 100;

    data.throttleActive = false;
    data.rotatingLeft = false;
    data.rotatingRight = false;
    data.boostActive = false;

    data.trackPoints = [];
    data.coins = [];
    data.particles = [];
    data.trickAnims = [];
    data.trail = [];
    data.generatedUpToX = 0;
    data.distanceTraveled = 0;
    data.coinsCount = 0;
    data.startTime = performance.now();
    data.upsideDownTimer = 0;

    // Build solid flat starter platform
    const spacing = data.trackStepDistance;
    for (let i = 0; i < 30; i++) {
      data.trackPoints.push({
        x: i * spacing,
        y: 350,
        angle: 0,
        type: 'normal'
      });
    }
    data.generatedUpToX = 30 * spacing;

    // Generate early easy courses
    for (let i = 0; i < 4; i++) {
      generateTrackSegment(data.generatedUpToX, 35, 'easy');
    }

    setScoreCoins(0);
    setDistance(0);
    setCurrentSpeed(0);
    setBoostGauge(100);
    setGameState('playing');
    setActiveTrick(null);

    playSynthesizedSfx('land');
  };

  // Keyboard Event Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      engineRef.current.keys[k] = true;

      // Prevent scrolling gestures in the iframe container
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (k === 'p' && gameState === 'playing') {
        initAudioCtx();
        setGameState('paused');
      } else if (k === 'p' && gameState === 'paused') {
        setGameState('playing');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      engineRef.current.keys[k] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Unified Pointer/Hold Event Hook for Click-and-Hold / Touch-and-Hold on screen
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (gameState === 'playing') {
        const target = e.target as HTMLElement;
        if (target && (target.closest('button') || target.closest('a') || target.tagName === 'BUTTON')) {
          // Ignore clicks on UI buttons like Pause / Back or Mobile tilt controllers
          return;
        }
        initAudioCtx();
        engineRef.current.keys['lmb'] = true;
      }
    };

    const handlePointerUp = () => {
      engineRef.current.keys['lmb'] = false;
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [gameState]);

  // Main game tick and physics loop controller
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const data = engineRef.current;
      
      if (gameState === 'playing') {
        // Maintain procedural tracking buffer
        if (data.bike.x > data.generatedUpToX - 800) {
          const diff = data.distanceTraveled;
          const rating = diff < 300 ? 'easy' : 'medium';
          generateTrackSegment(data.generatedUpToX, 40, rating);
        }

        // Free memory overhead from distant points
        if (data.trackPoints.length > 250 && data.bike.x > 1500) {
          const threshold = data.bike.x - 400;
          data.trackPoints = data.trackPoints.filter(pt => pt.x > threshold);
          data.coins = data.coins.filter(c => c.x > threshold && !c.collected);
        }

        // Sub-stepping loops to prevent clipping issues
        const subSteps = 3;
        const dt = 1.0 / (60 * subSteps);
        for (let i = 0; i < subSteps; i++) {
          runPhysicsIteration(dt);
        }

        // Smooth camera lerping with floating airborne speed dampening
        const b = data.bike;
        const cam = data.camera;
        if (cam) {
          const targetCamX = b.x;
          const eitherGrounded = data.frontGrounded || data.rearGrounded;
          const verticalLerpRate = eitherGrounded ? 0.085 : 0.042;
          
          cam.x += (targetCamX - cam.x) * 0.09;
          cam.y += (b.y - cam.y) * verticalLerpRate;
          
          // Slight speed based dynamic zoom
          const speedRatio = Math.abs(b.vx * 3) / 14;
          const targetZoom = 1.0 - Math.min(0.24, speedRatio * 0.22);
          cam.zoom += (targetZoom - cam.zoom) * 0.05;
          
          // Smooth decay landing shake
          if (cam.shake > 0.1) {
            cam.shake *= 0.88;
          } else {
            cam.shake = 0;
          }
        }

        // Update display metrics
        setScoreCoins(data.coinsCount);
        setDistance(Math.floor(data.distanceTraveled));
        setCurrentSpeed(Math.round(Math.abs(data.bike.vx * 3) * 22));
        setBoostGauge(Math.round(data.boostCharge));

        // Partic tick timer
        for (let i = data.particles.length - 1; i >= 0; i--) {
          const p = data.particles[i];
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          p.alpha = 1.0 - (p.life / p.maxLife);
          if (p.life >= p.maxLife) {
            data.particles.splice(i, 1);
          }
        }

        // Float trick animations titles
        for (let i = data.trickAnims.length - 1; i >= 0; i--) {
          const ta = data.trickAnims[i];
          ta.life -= 16.6;
          ta.y -= 0.6;
          if (ta.life <= 0) {
            data.trickAnims.splice(i, 1);
          }
        }
      }

      drawFrame();
      animId = requestAnimationFrame(tick);
    };

    const runPhysicsIteration = (dt: number) => {
      const data = engineRef.current;
      const b = data.bike;

      // Inputs (Hold LMB anywhere, Space, or W to accelerate and rotate counterclockwise/backward)
      const isHoldingMain = data.keys['w'] || data.keys['arrowup'] || data.keys[' '] || data.keys['lmb'] || data.throttleActive;
      const inputLeft = data.keys['a'] || data.keys['arrowleft'] || data.rotatingLeft;
      const inputRight = data.keys['d'] || data.keys['arrowright'] || data.rotatingRight;
      const inputBoost = data.keys[' '] || data.boostActive;

      // Sub-step physical parameters mapped from frame values
      const stepGravity = 0.32 / 3;
      const stepNormalMaxSpeed = 9.5 / 3;
      const stepBoostMaxSpeed = 14 / 3;
      const stepBaseAccel = 0.18 / 3;
      const stepAirAccel = 0.08 / 3;

      // Gravity pulls it down naturally
      b.vy += stepGravity;

      // Apply drag factors
      const isBoosting = inputBoost && data.boostCharge > 0;
      const activeMaxSpeed = isBoosting ? stepBoostMaxSpeed : stepNormalMaxSpeed;

      // Gentle realistic speeds decay drag
      b.vx *= 0.9973; // Math.pow(0.992, 1/3)
      b.vy *= 0.9983; // Math.pow(0.995, 1/3)

      // Clamp vx between 0 and active limits
      b.vx = Math.max(0, Math.min(b.vx, activeMaxSpeed));

      // Wheels world calculation relative to bike chassis
      const fwOffset = 27;
      const rwOffset = -27;
      const wheelR = 17; // Larger wheels for a more substantial motorcycle look

      const fOffsetRotX = fwOffset * Math.cos(b.angle) - 10 * Math.sin(b.angle);
      const fOffsetRotY = fwOffset * Math.sin(b.angle) + 10 * Math.cos(b.angle);
      const rOffsetRotX = rwOffset * Math.cos(b.angle) - 10 * Math.sin(b.angle);
      const rOffsetRotY = rwOffset * Math.sin(b.angle) + 10 * Math.cos(b.angle);

      const fwx = b.x + fOffsetRotX;
      const fwy = b.y + fOffsetRotY;
      const rwx = b.x + rOffsetRotX;
      const rwy = b.y + rOffsetRotY;

      // Add rear wheel position to trailing line ribbon
      if (!data.trail) {
        data.trail = [];
      }
      data.trail.push({ x: rwx, y: rwy });
      if (data.trail.length > 25) {
        data.trail.shift();
      }

      // Ground samplings
      const frontInf = getGroundInfo(fwx);
      const rearInf = getGroundInfo(rwx);

      const frontPenetration = frontInf.exists && fwy > frontInf.y - wheelR;
      const rearPenetration = rearInf.exists && rwy > rearInf.y - wheelR;

      data.frontGrounded = frontPenetration;
      data.rearGrounded = rearPenetration;

      const eitherGrounded = data.frontGrounded || data.rearGrounded;

      // Hard landing camera shake and high vertical speed dampening suspension
      const stiffness = 0.28; 
      if (frontPenetration) {
        const depth = (frontInf.y - wheelR) - fwy;
        b.vy += depth * stiffness;

        // Hard landing shake trigger
        if (b.vy > 3.0) {
          const fallImpact = b.vy;
          if (data.camera) {
            data.camera.shake = Math.min(14, fallImpact * 4.5);
          }
          playSynthesizedSfx('land');

          // Spawn heavy tire dust particles
          for (let j = 0; j < 12; j++) {
            data.particles.push({
              id: `p_dust_${Math.random()}`,
              x: fwx,
              y: fwy,
              vx: (Math.random() - 0.5) * 6 - b.vx * 0.1,
              vy: -1 - Math.random() * 3,
              size: 2 + Math.random() * 2,
              color: '#06b6d4',
              alpha: 0.8,
              life: 0,
              maxLife: 25 + Math.random() * 15
            });
          }
        }

        if (b.vy > 0) b.vy *= 0.65; // absorb impact heavily

        // Align bike angle nicely with the ground normal
        let diff = frontInf.angle - b.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        b.angularVelocity += (diff * 0.03) / 3;

        b.y += depth * 0.35;

        if (frontInf.type === 'boost') {
          b.vx += Math.cos(frontInf.angle) * 0.8;
          b.vy += Math.sin(frontInf.angle) * 0.8;
          playSynthesizedSfx('boost');
        }
      }

      if (rearPenetration) {
        const depth = (rearInf.y - wheelR) - rwy;
        b.vy += depth * stiffness;

        // Hard landing shake trigger
        if (b.vy > 3.0) {
          const fallImpact = b.vy;
          if (data.camera) {
            data.camera.shake = Math.min(14, fallImpact * 4.5);
          }
          playSynthesizedSfx('land');

          // Spawn heavy tire dust particles
          for (let j = 0; j < 12; j++) {
            data.particles.push({
              id: `p_dust_${Math.random()}`,
              x: rwx,
              y: rwy,
              vx: (Math.random() - 0.5) * 6 - b.vx * 0.1,
              vy: -1 - Math.random() * 3,
              size: 2 + Math.random() * 2,
              color: '#06b6d4',
              alpha: 0.8,
              life: 0,
              maxLife: 25 + Math.random() * 15
            });
          }
        }

        if (b.vy > 0) b.vy *= 0.65; // absorb impact heavily

        // Align bike angle nicely with the ground normal
        let diff = rearInf.angle - b.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        b.angularVelocity += (diff * 0.03) / 3;

        b.y += depth * 0.35;

        // Satisfying landing alignment damping - absorbs heavy rolling momentum without flipping instantly
        let rollDiff = rearInf.angle - b.angle;
        while (rollDiff < -Math.PI) rollDiff += Math.PI * 2;
        while (rollDiff > Math.PI) rollDiff -= Math.PI * 2;
        b.angle += rollDiff * 0.08;

        if (rearInf.type === 'boost') {
          b.vx += Math.cos(rearInf.angle) * 0.8;
          b.vy += Math.sin(rearInf.angle) * 0.8;
          playSynthesizedSfx('boost');
        }
      }

      // Projected Velocity Landing Momentum - redirects vertical down force into forward thrust slope speed!
      if (eitherGrounded) {
        const activeAngle = data.rearGrounded ? rearInf.angle : frontInf.angle;
        const currentSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        
        if (currentSpeed > 0.5) {
          const slopeCos = Math.cos(activeAngle);
          const slopeSin = Math.sin(activeAngle);
          const dot = b.vx * slopeCos + b.vy * slopeSin;
          
          if (dot > 0) {
            b.vx = slopeCos * dot * 0.95 + b.vx * 0.05;
            b.vy = slopeSin * dot * 0.95 + b.vy * 0.05;
          }
        }
      }

      // Forward Thrust / Gas (moves forward and feels responsive)
      if (isHoldingMain) {
        if (eitherGrounded) {
          const activeAngle = data.rearGrounded ? rearInf.angle : frontInf.angle;
          b.vx += Math.cos(activeAngle) * stepBaseAccel;
          b.vy += Math.sin(activeAngle) * stepBaseAccel;

          // Smoke trail wheel particles
          if (Math.random() < 0.2) {
            data.particles.push({
              id: `p_smoke_${Math.random()}`,
              x: rwx,
              y: rwy + 8,
              vx: -Math.cos(activeAngle) * 3 + (Math.random() - 0.5),
              vy: -Math.sin(activeAngle) * 1.5 - Math.random(),
              size: 1.5 + Math.random() * 2,
              color: '#06b6d4',
              alpha: 0.8,
              life: 0,
              maxLife: 20
            });
          }
        } else {
          // slight rocket power acceleration in air
          b.vx += Math.cos(b.angle) * stepAirAccel;
          b.vy += Math.sin(b.angle) * stepAirAccel;
        }
      }

      // Torques/Rotational mechanics
      let torque = 0;
      if (!eitherGrounded) {
        // Air controlled rotation - rotates backward with main hold (-0.018)
        if (isHoldingMain) {
          torque += -0.018;
          if (Math.random() < 0.06) playSynthesizedSfx('rotate');
        }
        // Fine secondary adjustments (A / D)
        if (inputLeft) {
          torque += -0.012;
          if (Math.random() < 0.06) playSynthesizedSfx('rotate');
        }
        if (inputRight) {
          torque += 0.012;
          if (Math.random() < 0.06) playSynthesizedSfx('rotate');
        }
      } else {
        // on ground, angular torque is very weak (0.004)
        if (isHoldingMain) torque += -0.004;
        if (inputLeft) torque += -0.004;
        if (inputRight) torque += 0.004;
      }

      b.angularVelocity += torque / 3;

      // Active gyroscope alignment - when no buttons are held, stabilizer aligns with travel vector
      const hasSteeringInput = isHoldingMain || inputLeft || inputRight;
      if (!eitherGrounded && !hasSteeringInput) {
        const flightAngle = Math.atan2(b.vy, Math.max(0.1, b.vx));
        let diff = (flightAngle * 0.4) - b.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        b.angularVelocity += (diff * 0.012) / 3;
      }

      // Angular damping to prevent runaway loops
      const currentAngDamping = eitherGrounded ? 0.88 : 0.965;
      b.angularVelocity *= currentAngDamping;

      // Max angular velocity clamp
      const maxAngVel = 0.13;
      if (b.angularVelocity > maxAngVel) b.angularVelocity = maxAngVel;
      if (b.angularVelocity < -maxAngVel) b.angularVelocity = -maxAngVel;

      // Space Booster / Nitro
      if (inputBoost && data.boostCharge > 0) {
        const boostAmt = 0.15;
        b.vx += Math.cos(b.angle) * boostAmt;
        b.vy += Math.sin(b.angle) * boostAmt;
        data.boostCharge = Math.max(0, data.boostCharge - 1);

        if (Math.random() < 0.5) {
          const rx = b.x - 25 * Math.cos(b.angle);
          const ry = b.y - 25 * Math.sin(b.angle);
          data.particles.push({
            id: `p_nitro_${Math.random()}`,
            x: rx,
            y: ry,
            vx: -Math.cos(b.angle) * 6 + (Math.random() - 0.5) * 2,
            vy: -Math.sin(b.angle) * 2 - Math.random(),
            size: 3 + Math.random() * 2,
            color: '#d946ef', // purple energy
            alpha: 0.9,
            life: 0,
            maxLife: 15
          });
        }
      } else if (!inputBoost && eitherGrounded) {
        // Slow recovery when on track
        data.boostCharge = Math.min(100, data.boostCharge + 0.15);
      }

      // Final speeds apply
      b.x += b.vx;
      b.y += b.vy;
      b.angle += b.angularVelocity;

      // Track distance traveled smoothly
      if (b.x > data.distanceTraveled * 10) {
        data.distanceTraveled = b.x / 10;
      }

      // Stunt / Aerial loops checks
      if (eitherGrounded) {
        if (!data.flipTrickLogged && Math.abs(data.cumulativeRotation) >= Math.PI * 1.6) {
          const flips = Math.round(Math.abs(data.cumulativeRotation) / (Math.PI * 2));
          if (flips > 0) {
            const isBack = data.cumulativeRotation < 0;
            const text = `${isBack ? 'BACKFLIP' : 'FRONTFLIP'} x${flips}!`;
            const bonus = flips * 100;
            
            data.coinsCount += bonus;
            data.boostCharge = Math.min(100, data.boostCharge + 40);

            data.trickAnims.push({
              text: `${text} +${bonus} COINS`,
              x: b.x,
              y: b.y - 65,
              life: 2500
            });

            setActiveTrick(`${text} (+${bonus})`);
            playSynthesizedSfx('trick');
            setTimeout(() => setActiveTrick(null), 2000);
          }
        }
        data.cumulativeRotation = 0;
        data.lastGroundedAngle = b.angle;
        data.flipTrickLogged = true;
      } else {
        data.flipTrickLogged = false;
        data.cumulativeRotation += b.angularVelocity;
      }

      // Collide Coin Gems
      data.coins.forEach(c => {
        if (c.collected) return;
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        if (dx*dx + dy*dy < 1200) {
          c.collected = true;
          data.coinsCount += c.value;
          playSynthesizedSfx('coin');

          for (let i = 0; i < 6; i++) {
            data.particles.push({
              id: `p_gem_${Math.random()}`,
              x: c.x,
              y: c.y,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              size: 2,
              color: '#f59e0b',
              alpha: 0.9,
              life: 0,
              maxLife: 12
            });
          }
        }
      });

      // Rigid crash sensors
      let crashed = false;
      let reason = '';


      // Grace period check
      const nowMs = performance.now();
      const inGracePeriod = (nowMs - data.startTime) < 1500;

      // 1. Spikes trigger on grounded wheels
      if ((frontInf.exists && frontInf.type === 'spike' && frontPenetration) ||
          (rearInf.exists && rearInf.type === 'spike' && rearPenetration)) {
        crashed = true;
        reason = 'Puncture Spikes';
      }

      // 2. Head Strike contact
      const localHeadX = 8;
      const localHeadY = -26;
      const headX = b.x + localHeadX * Math.cos(b.angle) - localHeadY * Math.sin(b.angle);
      const headY = b.y + localHeadX * Math.sin(b.angle) + localHeadY * Math.cos(b.angle);
      const headInf = getGroundInfo(headX);
      if (!inGracePeriod && headInf.exists && headY > headInf.y && Math.abs(b.vy) > 3.6) {
        crashed = true;
        reason = 'Rider Head Strike';
      }

      // 3. Flipped or completely upside down ground strike (touches ground for 0.35s)
      const normalizedAngle = Math.abs(b.angle % (Math.PI * 2));
      const boundAngle = normalizedAngle > Math.PI ? Math.PI * 2 - normalizedAngle : normalizedAngle;
      const isUpsideDown = boundAngle > Math.PI * 0.65;

      if (isUpsideDown && eitherGrounded) {
        data.upsideDownTimer += dt;
      } else {
        data.upsideDownTimer = 0;
      }

      if (!inGracePeriod && data.upsideDownTimer > 0.35) {
        crashed = true;
        reason = 'Overturned Bike';
      }

      // 4. Fall off Screen below chasm
      if (b.y > 670) {
        crashed = true;
        reason = 'Fell Off Horizon';
      }

      if (crashed) {
        console.debug('Neo Rider crash:', reason);
        triggerFatalCrash();
      }
    };

    const triggerFatalCrash = () => {
      const data = engineRef.current;
      setGameState('gameover');
      playSynthesizedSfx('crash');

      for (let i = 0; i < 35; i++) {
        data.particles.push({
          id: `p_expl_${Math.random()}`,
          x: data.bike.x,
          y: data.bike.y,
          vx: (Math.random() - 0.5) * 12,
          vy: -3 - Math.random() * 8,
          size: 3 + Math.random() * 4,
          color: Math.random() > 0.4 ? '#f43f5e' : '#fb923c',
          alpha: 1,
          life: 0,
          maxLife: 30 + Math.random() * 20
        });
      }

      const finalDist = Math.floor(data.distanceTraveled);
      try {
        const saved = localStorage.getItem('neorider_best_dist');
        const bestVal = saved ? parseFloat(saved) : 0;
        if (finalDist > bestVal) {
          localStorage.setItem('neorider_best_dist', finalDist.toString());
          setHighScore(finalDist);
        }
      } catch (_) {}
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [gameState]);

  // Handle Resize Event perfectly matching container size with crisp ratio
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const gameArea = gameAreaRef.current;
      if (!canvas || !gameArea) return;

      const rect = gameArea.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && gameAreaRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(gameAreaRef.current);
    }
    
    const timeout = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(timeout);
    };
  }, [gameState]);

  // Full Vector Frame Painter
  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = engineRef.current;
    const b = data.bike;

    // These values are used by the rider drawing code. They must be computed
    // inside drawFrame(), not borrowed from runPhysicsIteration().
    const eitherGrounded = data.frontGrounded || data.rearGrounded;
    const isHoldingMain = Boolean(
      data.keys['w'] ||
      data.keys['arrowup'] ||
      data.keys[' '] ||
      data.keys['lmb'] ||
      data.throttleActive
    );

    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cam = data.camera || { x: b.x, y: b.y, zoom: 1.0, shake: 0 };
    const shakeRefX = (Math.random() - 0.5) * cam.shake;
    const shakeRefY = (Math.random() - 0.5) * cam.shake;
    const zoom = cam.zoom || 1.0;

    // Smooth dynamic scroll camera coordinates
    const scrollX = cam.x - (logicalW * 0.28) / zoom + shakeRefX;
    const scrollY = cam.y - (logicalH * 0.58) / zoom + shakeRefY;

    // 1. Cosmic dark sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
    skyGrad.addColorStop(0, '#0a0518'); // deep dark purple sky
    skyGrad.addColorStop(1, '#05020c'); // near black background
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, logicalW, logicalH);

    // Subtle pulsing star clusters
    const timeMs = Date.now();
    for (let s = 0; s < 45; s++) {
      const starX = (s * 197) % logicalW;
      const starY = (s * 83) % (logicalH * 0.7);
      const pulse = 0.35 + Math.sin(timeMs * 0.002 + s) * 0.2;
      ctx.fillStyle = `rgba(244, 63, 94, ${pulse})`; // pulsing hot pink stars
      ctx.fillRect(starX, starY, 1.5, 1.5);
    }

    // Parallax Sun / Cyber Star
    const sunR = 35;
    const sunX = logicalW * 0.82 - (scrollX * 0.05) % (logicalW + sunR * 2);
    const sunY = logicalH * 0.22;

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = 'rgba(236, 72, 153, 0.45)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // High speed streak lines in background sky when zooming down the freeway
    if (Math.abs(b.vx * 3) > 7.0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)'; // faint cyan streaks
      ctx.lineWidth = 1.5;
      const speedStreakAmt = Math.min(10, Math.floor(Math.abs(b.vx * 3) * 1.2));
      for (let s = 0; s < speedStreakAmt; s++) {
        const sy = (s * 87) % (logicalH * 0.5) + 30;
        const sx = (s * 253 - scrollX * (2.8 + s * 0.1)) % (logicalW + 200);
        ctx.beginPath();
        ctx.moveTo(sx - 100, sy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Layer 1: Distant futuristic neon city parallax background (factor 0.04)
    ctx.fillStyle = '#0b061d';
    const cityOffset = (scrollX * 0.04) % 600;
    for (let c = -1; c < (logicalW / 60) + 2; c++) {
      const cx = c * 60 - cityOffset;
      const ch = 70 + (Math.sin(c * 17) * 25) + 30; // procedural height
      ctx.fillRect(cx, logicalH - ch, 48, ch);
      
      // Little glowing neon window dots
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)'; // cyber green window dots
      if (ch > 80 && c % 2 === 0) {
        ctx.fillRect(cx + 8, logicalH - ch + 15, 3, 3);
        ctx.fillRect(cx + 24, logicalH - ch + 15, 3, 3);
        ctx.fillRect(cx + 8, logicalH - ch + 35, 3, 3);
        ctx.fillRect(cx + 24, logicalH - ch + 35, 3, 3);
      }
      ctx.fillStyle = '#0b061d'; // restore city color for subsequent bars
    }

    // Layer 2: Intermediate mountains (Parallax factor 0.08)
    ctx.fillStyle = '#11092b';
    ctx.beginPath();
    ctx.moveTo(0, logicalH);
    for (let m = 0; m <= logicalW + 40; m += 40) {
      const h = logicalH - (85 + Math.sin((m + scrollX * 0.08) * 0.015) * 35);
      ctx.lineTo(m, h);
    }
    ctx.lineTo(logicalW, logicalH);
    ctx.closePath();
    ctx.fill();

    // Layer 3: Closer ridgeline hills (Parallax factor 0.16)
    ctx.fillStyle = '#160d38';
    ctx.beginPath();
    ctx.moveTo(0, logicalH);
    for (let m = 0; m <= logicalW + 40; m += 40) {
      const h = logicalH - (60 + Math.sin((m + scrollX * 0.16) * 0.007) * 25);
      ctx.lineTo(m, h);
    }
    ctx.lineTo(logicalW, logicalH);
    ctx.closePath();
    ctx.fill();

    // Apply the active camera zoom transform matrix for gameplay layer
    ctx.save();
    ctx.translate(logicalW * 0.28, logicalH * 0.58);
    ctx.scale(zoom, zoom);
    ctx.translate(-logicalW * 0.28, -logicalH * 0.58);

    // 1.5 Rear wheel trailing ribbon history
    if (data.trail && data.trail.length > 1) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ec4899';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      for (let i = 0; i < data.trail.length - 1; i++) {
        const pt1 = data.trail[i];
        const pt2 = data.trail[i + 1];
        ctx.lineWidth = ((i + 1) / data.trail.length) * 5.0; // Grows thicker towards the bike
        ctx.strokeStyle = `rgba(236, 72, 153, ${((i + 1) / data.trail.length) * 0.75})`;
        ctx.beginPath();
        ctx.moveTo(pt1.x - scrollX, pt1.y - scrollY);
        ctx.lineTo(pt2.x - scrollX, pt2.y - scrollY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Thick Glowing Neon Track (Pink road)
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#f43f5e'; // Hot pink road glow
    ctx.strokeStyle = '#ec4899'; // Vibrant pink road lines
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    let isDrawing = false;
    data.trackPoints.forEach((pt) => {
      const sx = pt.x - scrollX;
      const sy = pt.y - scrollY;

      if (sx >= -100 && sx <= logicalW + 100) {
        if (pt.type === 'gap') {
          isDrawing = false;
        } else {
          if (!isDrawing) {
            ctx.moveTo(sx, sy);
            isDrawing = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
      } else {
        isDrawing = false;
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // reset glow

    // Render spikes and boosts on track
    data.trackPoints.forEach((pt) => {
      const sx = pt.x - scrollX;
      const sy = pt.y - scrollY;

      if (sx < -40 || sx > logicalW + 40) return;

      if (pt.type === 'spike') {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy);
        ctx.lineTo(sx, sy - 11);
        ctx.lineTo(sx + 8, sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (pt.type === 'boost') {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#06b6d4'; // teal secondary effect glow
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy - 3);
        ctx.lineTo(sx + 8, sy);
        ctx.lineTo(sx - 8, sy + 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });

    // 3. Floating Coins (gold glowing yellow rings)
    data.coins.forEach(c => {
      if (c.collected) return;
      const sx = c.x - scrollX;
      const sy = c.y - scrollY;

      if (sx < -40 || sx > logicalW + 40) return;

      const bounceY = Math.sin((Date.now() / 140) + c.pulseOffset) * 3.5;
      
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#f59e0b';
      ctx.strokeStyle = '#fbbf24'; // Gold ring contours
      ctx.lineWidth = 2.5;
      
      ctx.beginPath();
      ctx.arc(sx, sy + bounceY, 6.5, 0, Math.PI * 2);
      ctx.stroke();
      
      // inner subtle reflect core
      ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.beginPath();
      ctx.arc(sx, sy + bounceY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    });

    // 4. Render particles
    data.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - scrollX, p.y - scrollY, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 5. Draw Cybercycle bike & Rider figure (side-view styling)
    const sxBikeX = b.x - scrollX;
    const sxBikeY = b.y - scrollY;

    ctx.save();
    ctx.translate(sxBikeX, sxBikeY);
    ctx.rotate(b.angle);

    const wheelRot = (b.x * 0.12) % (Math.PI * 2);
    const wheelR = 14; // Bigger wheels matching design instructions

    const drawWheel = (cx: number, cy: number, r: number) => {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#06b6d4';
      ctx.strokeStyle = '#06b6d4'; // Teal glowing hubs
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
      ctx.fill();

      // spokes wheel spin lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let s = 0; s < 3; s++) {
        const spokeRot = wheelRot + (s * Math.PI * 2 / 3);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (r - 2) * Math.cos(spokeRot), cy + (r - 2) * Math.sin(spokeRot));
      }
      ctx.stroke();
    };

    // Wheels sit locally (longer body wheelbase to match updated physics)
    const localFwx = 27;
    const localFwy = 10;
    const localRwx = -27;
    const localRwy = 10;

    drawWheel(localFwx, localFwy, wheelR);
    drawWheel(localRwx, localRwy, wheelR);

    // Thick neon chassis core silhouette wrapper (solid glowing cyan/pink theme block)
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#0f172a'; // dark solid engine container base
    ctx.strokeStyle = '#06b6d4'; // cyan glowing outer frame
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(localRwx + 7, localRwy - 4);
    ctx.lineTo(-14, -7); // low seat outline
    ctx.lineTo(8, -13); // fuel module
    ctx.lineTo(localFwx - 10, localFwy - 8);
    ctx.lineTo(2, localFwy + 5);
    ctx.lineTo(-12, localRwy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Solid Glowing pink chassis body panel accent
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(-10, -7);
    ctx.lineTo(4, -13);
    ctx.lineTo(9, -7);
    ctx.lineTo(0, localFwy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // White core structural frame tubes for heavy motorcycle feel
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(localRwx, localRwy);
    ctx.lineTo(0, localFwy);
    ctx.lineTo(localFwx - 4, localFwy);
    ctx.stroke();

    // Strong thick front fork fork tube
    ctx.strokeStyle = '#71717a';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(localFwx, localFwy);
    ctx.lineTo(13, -19);
    ctx.stroke();

    // Detailed handlebar bar grasp
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.0;
    ctx.beginPath();
    ctx.moveTo(9, -20);
    ctx.lineTo(15, -19);
    ctx.stroke();

    // Cyber Rider Leaning Forward/Backward dynamically based on input and physics rotation
    const compression = eitherGrounded ? Math.min(5, Math.max(0, Math.abs(b.vy) * 2.2)) : 0;
    
    let baseLean = 0;
    if (isHoldingMain) {
      baseLean = 0.25; // lean forward under acceleration
    } else if (!eitherGrounded && b.vy > 1.0) {
      baseLean = -0.15; // lean back during down flight
    }
    baseLean += b.angularVelocity * 1.5; // mechanical shift balance

    const hipX = -12;
    const hipY = -10 + compression; // compress on impact

    const leanCos = Math.cos(baseLean);
    const leanSin = Math.sin(baseLean);
    const defaultShX = 16;
    const defaultShY = -8;

    const shoulderX = hipX + (defaultShX * leanCos - defaultShY * leanSin);
    const shoulderY = hipY + (defaultShX * leanSin + defaultShY * leanCos);

    const headX = shoulderX + 4;
    const headY = shoulderY - 8;

    // Rear exhaust booster exhaust element (glowing pink)
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ec4899';
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(localRwx + 2, localRwy - 6);
    ctx.lineTo(-24, -2);
    ctx.stroke();
    ctx.restore();

    // Suspension Spring Drawing Helper
    const drawSuspensionSpring = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.save();
      ctx.strokeStyle = '#9ca3af'; // metallic silver chromium spring coil
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      
      const segments = 6;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const sx = x1 + (x2 - x1) * t;
        const sy = y1 + (y2 - y1) * t;
        const perpX = -(y2 - y1);
        const perpY = (x2 - x1);
        const len = Math.sqrt(perpX * perpX + perpY * perpY);
        const offset = (s % 2 === 0 ? 3.5 : -3.5) * (s === 0 || s === segments ? 0 : 1);
        ctx.lineTo(sx + (perpX / len) * offset, sy + (perpY / len) * offset);
      }
      ctx.stroke();
      ctx.restore();
    };

    // Draw active functional working spring shocks
    drawSuspensionSpring(12, -13, localFwx, localFwy);
    drawSuspensionSpring(-14, -7, localRwx, localRwy);

    // Rider Body spine
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();

    // Rider Arms to handlebars
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(13, -19);
    ctx.stroke();

    // Rider Legs to pegs near chassis center
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(-2, 3);
    ctx.stroke();

    // Helmet (sleek glowing cyan visor overlay)
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#06b6d4'; 
    ctx.beginPath();
    ctx.arc(headX, headY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX + 2, headY - 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // 5.5 Visual debug mode: displays the bike's ground-collision box as a custom outline
    if (debugEnabled) {
      ctx.save();
      ctx.strokeStyle = '#22c55e'; // vibrant neon green
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]); // dashed line style
      
      ctx.beginPath();
      ctx.moveTo(localRwx - wheelR, localRwy);
      ctx.lineTo(localRwx, localRwy + wheelR);
      ctx.lineTo(localFwx, localFwy + wheelR);
      ctx.lineTo(localFwx + wheelR, localFwy);
      ctx.lineTo(headX + 10, headY - 8);
      ctx.lineTo(headX - 10, headY - 8);
      ctx.closePath();
      ctx.stroke();

      // Highlight sensor contact positions with circles
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 9px font-mono, system-ui, monospace';
      ctx.fillText('HEAD', headX + 11, headY - 2);
      ctx.fillText('RW_COLL', localRwx - 15, localRwy + wheelR + 13);
      ctx.fillText('FW_COLL', localFwx - 15, localFwy + wheelR + 13);
      ctx.restore();
    }

    ctx.restore(); // restore local bike transform

    // 6. Draw floating trick text overlays
    data.trickAnims.forEach(ta => {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'black italic 13px font-mono, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(ta.text, ta.x - scrollX, ta.y - scrollY);
    });

    ctx.restore(); // restore active camera gameplay zoom transform

    ctx.restore(); // restore global scale dpr
  };

  // State touch handlers: optimized to avoid scrolling zoom conflicts
  const setThrottleState = (flag: boolean) => {
    initAudioCtx();
    engineRef.current.throttleActive = flag;
  };
  const setRotateLeftState = (flag: boolean) => {
    initAudioCtx();
    engineRef.current.rotatingLeft = flag;
  };
  const setRotateRightState = (flag: boolean) => {
    initAudioCtx();
    engineRef.current.rotatingRight = flag;
  };
  const triggerBoostState = () => {
    initAudioCtx();
    const data = engineRef.current;
    if (data.boostCharge > 10) {
      data.boostActive = true;
      playSynthesizedSfx('boost');
      setTimeout(() => data.boostActive = false, 350);
    }
  };

  return (
    <div 
      className="w-full flex flex-col bg-[#050409] text-zinc-100 select-none overflow-hidden relative" 
      style={{
        height: 'calc(100vh - 80px)',
        minHeight: '520px',
        maxHeight: 'calc(100vh - 80px)',
        width: '100%',
        overflow: 'hidden'
      }}
      ref={containerRef}
    >
      
      {/* 1. TOP HEADER NAVIGATION STATUS BAR */}
      <div className="p-3 md:p-4 bg-[#0a0812]/90 border-b border-white/[0.04] flex items-center justify-between z-20 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMenu}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer text-white/80 select-none transition-all"
            id="neorider-back-hub-btn"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Rider Game</span>
            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-1">
              Neo Rider
            </span>
          </div>
        </div>

        {/* Live scores */}
        {gameState === 'playing' && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-mono text-white/40">Distance</span>
              <span className="text-base md:text-lg font-black italic text-cyan-400">{distance}m</span>
            </div>

            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-mono text-white/40">Coins</span>
              <span className="text-base md:text-lg font-black italic text-amber-300 flex items-center gap-1">
                <Sparkles size={11} className="text-amber-300 animate-pulse" />
                {scoreCoins}
              </span>
            </div>

            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[9px] uppercase font-mono text-white/40">Speed</span>
              <span className="text-base md:text-lg font-black italic text-lime-400">{currentSpeed} km/h</span>
            </div>
          </div>
        )}

        {/* Action controls */}
        <div className="flex items-center gap-2">
          {activeTrick && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-rose-500 rounded-lg font-mono font-black text-[10px] uppercase text-black animate-bounce">
              {activeTrick}
            </div>
          )}

          <div className="flex flex-col px-3 py-1 bg-white/[0.03] border border-white/5 rounded-lg text-right hidden xs:flex">
            <span className="text-[8px] uppercase font-mono text-white/40">Best</span>
            <span className="text-xs font-bold text-indigo-300">{highScore}m</span>
          </div>

          <button
            onClick={() => setDebugEnabled(prev => !prev)}
            className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-1 text-xs font-mono font-bold ${
              debugEnabled 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            }`}
            title="Toggle Physics Bounding Box Debug"
            id="neorider-debug-btn"
          >
            <ShieldAlert size={14} />
            <span className="hidden sm:inline">DEBUG</span>
          </button>

          <button
            onClick={handleSoundToggle}
            className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white cursor-pointer transition-all"
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {gameState === 'playing' && (
            <button
              onClick={() => setGameState('paused')}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white cursor-pointer transition-all"
            >
              <Pause size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 2. THE GAMEPLAY AREA CONTAINER */}
      <div ref={gameAreaRef} className="flex-1 w-full relative overflow-hidden rounded-2xl bg-black flex items-center justify-center">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full block"
          style={{ cursor: 'crosshair' }}
        />

        {/* NITRO LEVEL GAUGE BAR */}
        {gameState === 'playing' && (
          <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 w-36 sm:w-44 bg-black/60 border border-white/10 p-2 rounded-xl pointer-events-none">
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase font-mono text-purple-400 font-extrabold flex items-center gap-0.5">
                <Zap size={9} className="fill-purple-400" />
                Nitro
              </span>
              <span className="text-[8px] font-mono text-zinc-400">{boostGauge}%</span>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-150"
                style={{ width: `${boostGauge}%` }}
              />
            </div>
          </div>
        )}

        {/* START MENU OVERLAY HERO */}
        {gameState === 'start' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
            <div 
              style={{ width: 'min(420px, 92vw)', padding: '24px' }}
              className="bg-[#12101e]/80 border border-white/[0.08] rounded-2xl text-center shadow-2xl flex flex-col gap-5"
            >
              <div className="flex flex-col gap-1">
                <h1 className="text-[28px] md:text-[36px] font-extrabold italic tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-300 leading-tight">
                  NEO RIDER
                </h1>
                <p className="text-xs text-zinc-400 tracking-wider uppercase font-mono">
                  Cyber Cycle Stunt Pilot
                </p>
              </div>

              <div className="py-2.5 px-4 bg-white/[0.03] border border-white/5 rounded-xl text-left flex flex-col gap-1.5">
                <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                  ★ Ride forward, accelerate through cyber ramps, collect brilliant coin gems, and pull marvelous flips in mid-air to super-charge your nitro boost fuel!
                </p>
                <div className="text-[10px] text-indigo-400 font-bold flex justify-between font-mono mt-1 pt-1 border-t border-white/5">
                  <span>Best Distance Record:</span>
                  <span>{highScore}m</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 mt-1">
                <button
                  onClick={handleRestartGame}
                  style={{ minHeight: '44px' }}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black uppercase rounded-xl tracking-wider cursor-pointer text-xs transition-transform transform active:scale-95 flex items-center justify-center animate-pulse"
                >
                  START RIDE
                </button>
                <button
                  onClick={() => setGameState('controls')}
                  style={{ minHeight: '44px' }}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/90 font-bold uppercase rounded-xl border border-white/10 cursor-pointer text-xs flex items-center justify-center"
                >
                  HOW TO PLAY
                </button>
                <button
                  onClick={handleSoundToggle}
                  style={{ minHeight: '44px' }}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/80 font-medium uppercase rounded-xl border border-white/5 cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  <span>Sound: {soundOn ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={onBackToMenu}
                  style={{ minHeight: '36px' }}
                  className="w-full py-2 bg-transparent hover:text-white text-zinc-500 font-semibold uppercase text-[10px] tracking-widest cursor-pointer mt-1"
                >
                  BACK TO HUB
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONTROLS LIST INFO MODULE */}
        {gameState === 'controls' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-md">
            <div className="w-full max-w-sm bg-[#12101e]/95 border border-white/[0.08] p-5 rounded-2xl shadow-2xl flex flex-col gap-4 text-left">
              <div className="flex items-center gap-1.5 border-b border-white/10 pb-2">
                <Info size={15} className="text-cyan-400" />
                <h3 className="text-xs font-mono font-black uppercase tracking-widest text-cyan-400">GAMEPLAY CONTROLS</h3>
              </div>

              <div className="flex flex-col gap-3 font-mono text-zinc-300">
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">▲ DESKTOP KEYBOARD:</span>
                  <div className="grid grid-cols-2 gap-y-1 text-xs border-b border-white/5 pb-2">
                    <span className="text-zinc-500">W / Up Arrow</span>
                    <span className="text-lime-400 font-extrabold">Gas / Accelerate</span>
                    <span className="text-zinc-500">A / Left Arrow</span>
                    <span className="text-cyan-400">Spin backward (air)</span>
                    <span className="text-zinc-500">D / Right Arrow</span>
                    <span className="text-cyan-400">Spin forward (air)</span>
                    <span className="text-zinc-500">Spacebar</span>
                    <span className="text-pink-400 font-extrabold">Nitro Booster jet</span>
                    <span className="text-zinc-500">P Key</span>
                    <span className="text-indigo-300">Pause Match</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">▼ MOBILE TOUCHPAD:</span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Interactive layout buttons appear on the left and right corners of the screens when playing on smartphones or tablets:
                  </p>
                  <ul className="text-[10px] text-cyan-300 flex flex-col gap-0.5 list-disc pl-4 mt-1">
                    <li><strong className="text-white">GAS:</strong> Hold to ride forward</li>
                    <li><strong className="text-white">SPIN L/R:</strong> Rotate your cyberpunk bike safely in mid-air</li>
                    <li><strong className="text-white">NITRO:</strong> Trigger extreme speeds after stunts</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setGameState('start')}
                className="w-full mt-2 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold uppercase rounded-xl text-xs cursor-pointer text-center select-none"
              >
                GOT IT
              </button>
            </div>
          </div>
        )}

        {/* PAUSE OVERLAY MATCH */}
        {gameState === 'paused' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
            <div className="w-full max-w-xs bg-[#0b0a12]/95 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 text-center shadow-2xl">
              <h2 className="text-xl font-bold tracking-tight text-white italic">MATCH PAUSED</h2>
              
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => setGameState('playing')}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold uppercase rounded-lg text-xs cursor-pointer"
                >
                  RESUME RIDE
                </button>
                <button
                  onClick={handleRestartGame}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white font-semibold uppercase rounded-lg border border-white/10 text-xs cursor-pointer"
                >
                  RESTART
                </button>
                <button
                  onClick={onBackToMenu}
                  className="w-full py-2 text-zinc-500 hover:text-white font-medium uppercase text-xs cursor-pointer"
                >
                  QUIT TO HUB
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CRASHED RETRY PANEL */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/92 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#180a0a]/90 border border-red-500/20 p-6 rounded-2xl text-center shadow-2xl flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-black italic text-red-500 tracking-tight uppercase">
                  CRASHED. TRY AGAIN.
                </h1>
                <p className="text-xs text-zinc-400 font-mono">
                  You lost control of your active cybercycle
                </p>
              </div>

              {/* Stats card */}
              <div className="grid grid-cols-3 gap-2.5 my-1">
                <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col">
                  <span className="text-[9px] uppercase font-mono text-zinc-500">Distance</span>
                  <span className="text-base font-bold italic text-cyan-400">{distance}m</span>
                </div>
                <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col">
                  <span className="text-[9px] uppercase font-mono text-zinc-500">Gems</span>
                  <span className="text-base font-bold italic text-amber-300">{scoreCoins}</span>
                </div>
                <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col">
                  <span className="text-[9px] uppercase font-mono text-zinc-500">Best Seat</span>
                  <span className="text-base font-bold italic text-indigo-300">{highScore}m</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleRestartGame}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase rounded-xl text-xs tracking-wider cursor-pointer"
                >
                  RESTART MATCH
                </button>
                <button
                  onClick={() => setGameState('start')}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold uppercase rounded-xl border border-white/10 cursor-pointer text-xs"
                >
                  MAIN MENU
                </button>
                <button
                  onClick={onBackToMenu}
                  className="w-full py-2 bg-transparent hover:text-white text-zinc-500 font-semibold uppercase text-xs cursor-pointer mt-1"
                >
                  QUIT TO MAIN HUB
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE PORT TOUCHPAD CONTROLS */}
        {gameState === 'playing' && (
          <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between pointer-events-none select-none sm:hidden">
            {/* Spinning Rotations Left */}
            <div className="flex gap-2 pointer-events-auto">
              <button
                onTouchStart={(e) => { e.preventDefault(); setRotateLeftState(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setRotateLeftState(false); }}
                onMouseDown={() => setRotateLeftState(true)}
                onMouseUp={() => setRotateLeftState(false)}
                className="w-16 h-16 rounded-xl bg-white/5 border border-cyan-500/20 text-cyan-400 active:bg-cyan-500/20 touch-none flex flex-col items-center justify-center font-mono font-bold text-[9px] gap-0.5"
              >
                <RotateCw size={18} className="-scale-x-100 rotate-180" />
                <span>SPIN L</span>
              </button>
              
              <button
                onTouchStart={(e) => { e.preventDefault(); setRotateRightState(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setRotateRightState(false); }}
                onMouseDown={() => setRotateRightState(true)}
                onMouseUp={() => setRotateRightState(false)}
                className="w-16 h-16 rounded-xl bg-white/5 border border-cyan-500/20 text-cyan-400 active:bg-cyan-500/20 touch-none flex flex-col items-center justify-center font-mono font-bold text-[9px] gap-0.5"
              >
                <RotateCw size={18} />
                <span>SPIN R</span>
              </button>
            </div>

            {/* Accelerator Gas & Boost on Right */}
            <div className="flex gap-2 pointer-events-auto">
              <button
                onTouchStart={(e) => { e.preventDefault(); triggerBoostState(); }}
                onMouseDown={triggerBoostState}
                className="w-16 h-16 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 active:bg-purple-500/25 touch-none flex flex-col items-center justify-center font-mono font-bold text-[9px] gap-0.5"
              >
                <Zap size={18} className="fill-purple-400" />
                <span>NITRO</span>
              </button>

              <button
                onTouchStart={(e) => { e.preventDefault(); setThrottleState(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setThrottleState(false); }}
                onMouseDown={() => setThrottleState(true)}
                onMouseUp={() => setThrottleState(false)}
                className="w-16 h-16 rounded-xl bg-lime-500/10 border border-lime-500/30 text-lime-400 active:bg-lime-500/25 touch-none flex flex-col items-center justify-center font-mono font-extrabold text-[9px] gap-0.5"
              >
                <Play size={18} className="fill-lime-400 rotate-270" />
                <span>GAS</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
