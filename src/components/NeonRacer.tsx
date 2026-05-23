import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Award, 
  Battery, 
  Gauge, 
  Sparkles, 
  Zap, 
  Compass,
  Trophy,
  MousePointer,
  Car
} from 'lucide-react';
import { AppSettings } from '../types';

interface NeonRacerProps {
  settings: AppSettings;
  onBackToMenu: () => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

interface Segment {
  index: number;
  world: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
  curve: number;
  color: {
    road: string;
    grass: string;
    rumble: string;
    line: string;
  };
}

interface Obstacle {
  id: string;
  type: 'barrier' | 'cone' | 'laser';
  lane: number; // x position (-0.8 to 0.8)
  z: number; // position along track
  size: number;
}

interface Collectible {
  id: string;
  type: 'energy' | 'boost';
  lane: number;
  z: number;
  active: boolean;
  pulse: number;
}

interface TrafficCar {
  id: string;
  lane: number;
  z: number;
  speed: number;
  type: number; // visual index
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

// Cars selection definitions
const RETRO_CARS = [
  {
    id: 'interceptor',
    name: 'X-1 ALPHA JET',
    color: '#06b6d4',
    glow: 'rgba(6,182,212,0.4)',
    stats: { speed: 85, accel: 90, handling: 80, magnet: 60 },
    icon: '⚡',
    desc: 'Lightweight tactical interceptor with supreme neon micro-thrust.'
  },
  {
    id: 'hyperdrive',
    name: 'SYNTH SPECTRAL',
    color: '#a855f7',
    glow: 'rgba(168,85,247,0.4)',
    stats: { speed: 100, accel: 70, handling: 75, magnet: 70 },
    icon: '🔥',
    desc: 'Heavy cyber touring engine tuned for highest raw terminal velocity.'
  },
  {
    id: 'quantum',
    name: 'FUSION GLOW-Z',
    color: '#eab308',
    glow: 'rgba(234,179,8,0.4)',
    stats: { speed: 75, accel: 80, handling: 95, magnet: 100 },
    icon: '🔘',
    desc: 'Magnetic shield generator that draws distant power cells automatically.'
  }
];

export const NeonRacer: React.FC<NeonRacerProps> = ({
  settings,
  onBackToMenu,
  onUpdateSettings
}) => {
  const isSoundEnabled = settings.soundEnabled;

  // React State
  const [gameState, setGameState] = useState<'selection' | 'playing' | 'gameover'>('selection');
  const [selectedCarIndex, setSelectedCarIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('neoracer_highscore');
      return saved ? parseInt(saved) : 5000;
    } catch {
      return 5000;
    }
  });

  const [speed, setSpeed] = useState<number>(0);
  const [battery, setBattery] = useState<number>(100);
  const [distance, setDistance] = useState<number>(0);
  const [isWarping, setIsWarping] = useState<boolean>(false);
  const [showWarpAlert, setShowWarpAlert] = useState<boolean>(false);

  // Canvas and sizing refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Engine audio oscillators
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  // High velocity states using refs to bypass closures and state delay
  const stateRef = useRef({
    position: 0, // distance traveled along track
    playerX: 0, // left/right off-center road coordinate (-1.0 to 1.0)
    currentSpeed: 0, // actual driving speed
    batteryLevel: 100, // actual fuel energy pool
    accumulatedScore: 0, // game score
    camRumble: 0, // screen shake offset
    warpCooldown: 0, // lock booster trigger times
    warpActive: false, // is warp mode currently running
    activeCar: RETRO_CARS[0],
    sparks: [] as Spark[],
    traffic: [] as TrafficCar[],
    collectibles: [] as Collectible[],
    obstacles: [] as Obstacle[],
    segments: [] as Segment[],
    trackLength: 0,
    segmentLength: 200, // scale factor
    currentTrackCurve: 0, // feedback shift
    distanceDriven: 0
  });

  const keysPressed = useRef<Record<string, boolean>>({});

  // Lazy initialize Browser Engine Sound
  const initEngineSound = () => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(45, ctx.currentTime);

      gain.gain.setValueAtTime(0.012, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(0);

      engineOscRef.current = osc;
      engineGainRef.current = gain;
    } catch (err) {
      console.warn('Failed to construct client-side driving audio synthesizer node:', err);
    }
  };

  const updateEngineSoundPitch = (speedValue: number) => {
    if (!isSoundEnabled || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    try {
      const targetFreq = 42 + (speedValue / 200) * 110;
      const targetGain = 0.008 + (speedValue / 200) * 0.024;

      if (engineOscRef.current) {
        engineOscRef.current.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.1);
      }
      if (engineGainRef.current) {
        engineGainRef.current.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1);
      }
    } catch {}
  };

  const stopEngineSound = () => {
    try {
      if (engineOscRef.current) {
        engineOscRef.current.stop();
        engineOscRef.current.disconnect();
      }
      if (engineGainRef.current) {
        engineGainRef.current.disconnect();
      }
    } catch {}
    engineOscRef.current = null;
    engineGainRef.current = null;
    audioCtxRef.current = null;
  };

  // Sound triggers
  const playSfxBeep = (freq: number, dur = 0.1) => {
    if (!isSoundEnabled) return;
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  };

  const playSfxCrash = () => {
    if (!isSoundEnabled) return;
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(30, ctx.currentTime + 0.45);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {}
  };

  const playSfxWarp = () => {
    if (!isSoundEnabled) return;
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.6);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  // Generate perfect track geometry (infinite looped circuit)
  const buildTrackSegments = () => {
    const segments: Segment[] = [];
    const numSegments = 1200; // Track length
    const segLength = stateRef.current.segmentLength;

    for (let i = 0; i < numSegments; i++) {
      let curve = 0;
      // Introduce sweeping curves at indices
      if (i > 150 && i < 280) curve = 2.4; // Curving right
      if (i > 380 && i < 520) curve = -3.2; // Winding left S-curve
      if (i > 530 && i < 620) curve = 1.8; // Brief right hook
      if (i > 780 && i < 950) curve = -2.8; // Long sweeping carousel left
      if (i > 1050 && i < 1150) curve = 3.5; // Final hairpin curve straight back

      // Alternating grid colors
      const isEven = Math.floor(i / 4) % 2 === 0;
      const themeColors = isEven
        ? {
            road: '#12121e', // deep grid surface
            grass: '#06060c', // black grass fields
            rumble: '#06b6d4', // cyan fluorescent glow edge
            line: '#ffffff'
          }
        : {
            road: '#1a1a2b', 
            grass: '#020205', 
            rumble: '#ec4899', // bright pink pulse borders
            line: 'rgba(0,0,0,0)'
          };

      segments.push({
        index: i,
        world: { x: 0, y: 0, z: i * segLength },
        screen: { x: 0, y: 0, w: 0, scale: 0 },
        curve,
        color: themeColors
      });
    }

    stateRef.current.segments = segments;
    stateRef.current.trackLength = numSegments * segLength;
  };

  // Place interactive traffic, batteries and barriers along course
  const populateEnvironment = () => {
    const collectibles: Collectible[] = [];
    const obstacles: Obstacle[] = [];
    const traffic: TrafficCar[] = [];

    const numSegments = 1200;
    const segLength = stateRef.current.segmentLength;
    const colors = ['#eab308', '#22c55e', '#ef4444', '#3b82f6'];

    for (let i = 40; i < numSegments - 10; i += 32) {
      const designSeed = Math.sin(i * 0.45);
      
      // Collectibles: Glowing power battery tokens
      collectibles.push({
        id: `collect-${i}`,
        type: 'energy',
        lane: designSeed * 0.75, // distributes lanes based on curve
        z: i * segLength,
        active: true,
        pulse: 0
      });

      // Ambient Laser barriers and cyber cones warning signs
      if (i % 64 === 0) {
        obstacles.push({
          id: `obs-${i}`,
          type: Math.cos(i) > 0 ? 'barrier' : 'cone',
          lane: -designSeed * 0.65, // alternate sides
          z: (i + 12) * segLength,
          size: 20
        });
      }

      // Fast/Slow enemy driver traffic cyber cars
      if (i % 48 === 0) {
        traffic.push({
          id: `traffic-${i}`,
          lane: designSeed * 0.5,
          z: (i + 18) * segLength,
          speed: 40 + Math.abs(designSeed) * 55,
          type: Math.floor(Math.abs(designSeed) * 3) % 2,
          color: colors[i % colors.length]
        });
      }
    }

    stateRef.current.collectibles = collectibles;
    stateRef.current.obstacles = obstacles;
    stateRef.current.traffic = traffic;
  };

  // Launch the game engine
  const handleStartGame = () => {
    const selectedCar = RETRO_CARS[selectedCarIndex];
    stateRef.current.activeCar = selectedCar;
    stateRef.current.position = 0;
    stateRef.current.playerX = 0;
    stateRef.current.currentSpeed = 0;
    stateRef.current.batteryLevel = 100;
    stateRef.current.accumulatedScore = 0;
    stateRef.current.sparks = [];
    stateRef.current.distanceDriven = 0;
    stateRef.current.warpActive = false;

    setScore(0);
    setSpeed(0);
    setBattery(100);
    setDistance(0);
    setIsWarping(false);
    setShowWarpAlert(false);

    buildTrackSegments();
    populateEnvironment();
    initEngineSound();

    setGameState('playing');
  };

  // End match wrap calculations
  const handleEndMatch = () => {
    stopEngineSound();
    setGameState('gameover');

    setHighScore(prev => {
      const latest = Math.max(prev, stateRef.current.accumulatedScore);
      try {
        localStorage.setItem('neoracer_highscore', latest.toString());
      } catch {}
      return latest;
    });
  };

  // Keyboard and dynamic movements state tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysPressed.current[k] = true;

      // Prevent window scrolling on key strokes inside frame
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysPressed.current[k] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopEngineSound();
    };
  }, [isSoundEnabled]);

  // Main canvas animation loop at 60fps
  useEffect(() => {
    let animId: number;
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      if (containerRef.current && canvas) {
        const dpr = window.devicePixelRatio || 1;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    // Frame level game ticker
    const frameLoop = () => {
      const data = stateRef.current;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      if (width === 0 || height === 0) {
        animId = requestAnimationFrame(frameLoop);
        return;
      }

      const carSpec = data.activeCar;
      const speedThreshold = carSpec.stats.speed * 2.2; // base top speed

      // 1. COMPUTE PLAYER CONTROLS & MOVEMENTS
      const isAccelerating = keysPressed.current['w'] || keysPressed.current['arrowup'];
      const isBraking = keysPressed.current['s'] || keysPressed.current['arrowdown'];
      const isSteeringLeft = keysPressed.current['a'] || keysPressed.current['arrowleft'];
      const isSteeringRight = keysPressed.current['d'] || keysPressed.current['arrowright'];
      const isWarpTrigger = keysPressed.current[' '] || keysPressed.current['x'];

      // Warp Hyperdrive Boosting validation check
      if (isWarpTrigger && !data.warpActive && data.batteryLevel > 35 && data.warpCooldown <= 0) {
        data.warpActive = true;
        data.warpCooldown = 180; // duration
        setIsWarping(true);
        playSfxWarp();
        
        // Spawn awesome initial light flare sparks
        for (let s = 0; s < 25; s++) {
          data.sparks.push({
            x: width / 2,
            y: height * 0.74,
            vx: (Math.random() * 2 - 1) * 8,
            vy: (Math.random() * 2 - 1) * 8,
            color: '#a855f7',
            size: 3 + Math.random() * 4,
            life: 0,
            maxLife: 30 + Math.random() * 30
          });
        }
      }

      // Handle offroad sliding rules: driving off track limits (playerX > 1.0 or < -1.0)
      const isOffroad = data.playerX < -1.0 || data.playerX > 1.0;
      const actualLimit = data.warpActive 
        ? speedThreshold * 1.6 
        : isOffroad 
          ? speedThreshold * 0.35 
          : speedThreshold;

      // Speed acceleration physics
      if (isAccelerating && data.batteryLevel > 0) {
        const accelFactor = (carSpec.stats.accel / 100) * (data.warpActive ? 1.8 : 1.2);
        data.currentSpeed = Math.min(actualLimit, data.currentSpeed + accelFactor);
        data.batteryLevel = Math.max(0, data.batteryLevel - (data.warpActive ? 0.28 : 0.045));
      } else {
        // Natural rolling friction resistance
        data.currentSpeed = Math.max(0, data.currentSpeed - 0.95);
      }

      if (isBraking) {
        data.currentSpeed = Math.max(0, data.currentSpeed - 3.2);
      }

      // Passive battery drain even if idling or offroad friction sparks generator
      if (isOffroad && data.currentSpeed > 20) {
        data.batteryLevel = Math.max(0, data.batteryLevel - 0.08); // faster offroad battery decay
        data.currentSpeed = Math.max(10, data.currentSpeed - 1.25); // direct dragging friction

        // Spawn dynamic yellow friction sparks streaming from the cybercar bottom
        if (Math.random() > 0.4) {
          const offroadSide = data.playerX < 0 ? width * 0.35 : width * 0.65;
          data.sparks.push({
            x: offroadSide + (Math.random() * 12 - 6),
            y: height * 0.85,
            vx: (Math.random() * 2 - 1) * 3,
            vy: -1 - Math.random() * 35,
            color: '#eab308',
            size: 2 + Math.random() * 3,
            life: 0,
            maxLife: 15 + Math.random() * 15
          });
        }
      }

      // Steering dynamics based on speed context (cannot steer while stationary!)
      if (data.currentSpeed > 10) {
        const steerFactor = (carSpec.stats.handling / 100) * 0.038 * (1.1 - data.currentSpeed / 450);
        if (isSteeringLeft) {
          data.playerX -= steerFactor;
        }
        if (isSteeringRight) {
          data.playerX += steerFactor;
        }
      }

      // 2. PARALLAX ROAD BENDING ALIGNING
      // Access matching segments relative to current distance position
      data.position += data.currentSpeed;
      if (data.position >= data.trackLength) {
        data.position -= data.trackLength; // loop track indefinitely
      }

      const activeSegIndex = Math.floor(data.position / data.segmentLength);
      const activeSegment = data.segments[activeSegIndex];

      // Auto curve gravity pull: camera moves when making heavy fast turns
      if (activeSegment) {
        const curveGrav = activeSegment.curve * 0.0028 * (data.currentSpeed / 130);
        data.playerX -= curveGrav;
        data.currentTrackCurve = activeSegment.curve;
      }

      // Active warp cooldown ticker
      if (data.warpActive) {
        data.warpCooldown -= 1;
        if (data.warpCooldown <= 0 || data.batteryLevel <= 0) {
          data.warpActive = false;
          setIsWarping(false);
        }
      }

      // Tick score metrics
      data.accumulatedScore += Math.round(data.currentSpeed / 12);
      data.distanceDriven += data.currentSpeed * 0.0003; // km progress meter

      // Check battery exhaustion limits
      if (data.batteryLevel <= 0 && data.currentSpeed === 0) {
        handleEndMatch();
        return;
      }

      // 3. ENEMY TRAFFIC PHYSICS
      data.traffic.forEach((car) => {
        car.z += car.speed * 0.85;
        if (car.z >= data.trackLength) car.z -= data.trackLength;

        // Player Collision analysis bound mapping
        // Check if player position matching and lane alignment match
        const zDiff = Math.abs(car.z - data.position);
        if (zDiff < 180 && Math.abs(car.lane - data.playerX) < 0.28) {
          // Absolute crash!
          playSfxCrash();
          data.currentSpeed = Math.max(10, data.currentSpeed * 0.15); // dramatic deceleration
          data.batteryLevel = Math.max(10, data.batteryLevel - 15); // shield depletion
          data.accumulatedScore = Math.max(0, data.accumulatedScore - 500); // score penalty
          data.camRumble = 30; // camera shake trigger
          car.lane += car.lane > data.playerX ? 0.45 : -0.45; // knocks car off track lane

          // Spawn vibrant collision debris explosions
          for (let p = 0; p < 20; p++) {
            data.sparks.push({
              x: width / 2,
              y: height * 0.82,
              vx: (Math.random() * 2 - 1) * 11,
              vy: -2 - Math.random() * 12,
              color: '#f43f5e',
              size: 3 + Math.random() * 5,
              life: 0,
              maxLife: 25 + Math.random() * 25
            });
          }
        }
      });

      // 4. PICKUPS & COLLECTIBLES DYNAMICS
      // Quantum car magnetic radius
      const magneticRadius = carSpec.id === 'quantum' ? 0.72 : 0.28;

      data.collectibles.forEach((col) => {
        if (!col.active) return;
        col.pulse += 0.1;

        // Check distance collision bounds
        const zDiff = Math.abs(col.z - data.position);
        const lDiff = Math.abs(col.lane - data.playerX);

        // Magnetic Attraction
        if (zDiff < 450 && lDiff < magneticRadius * 2.5) {
          // Attract towards player
          col.lane += (data.playerX - col.lane) * 0.12;
        }

        if (zDiff < 150 && lDiff < 0.3) {
          col.active = false;
          playSfxBeep(640, 0.15);

          data.batteryLevel = Math.min(100, data.batteryLevel + 16);
          data.accumulatedScore += 800;

          // Respawn collect token further down the track loop
          setTimeout(() => {
            col.active = true;
          }, 4500);

          // Spawn bright digital golden collecting sparkles
          for (let c = 0; c < 8; c++) {
            data.sparks.push({
              x: width / 2 + (col.lane - data.playerX) * 150,
              y: height * 0.78,
              vx: (Math.random() * 2 - 1) * 3,
              vy: -Math.random() * 5 - 1,
              color: '#f59e0b',
              size: 2.5 + Math.random() * 2,
              life: 0,
              maxLife: 15 + Math.random() * 12
            });
          }
        }
      });

      // Obstacle impacts
      data.obstacles.forEach((obs) => {
        const zDiff = Math.abs(obs.z - data.position);
        const lDiff = Math.abs(obs.lane - data.playerX);
        if (zDiff < 150 && lDiff < 0.24) {
          playSfxCrash();
          data.currentSpeed = Math.max(15, data.currentSpeed * 0.25);
          data.batteryLevel = Math.max(0, data.batteryLevel - 8);
          data.camRumble = 18;

          obs.lane += Math.random() > 0.5 ? 0.8 : -0.8; // scatter barrier

          // Red sparks
          for (let o = 0; o < 12; o++) {
            data.sparks.push({
              x: width / 2,
              y: height * 0.84,
              vx: (Math.random() * 2 - 1) * 6,
              vy: -Math.random() * 7 - 1,
              color: '#ef4444',
              size: 3 + Math.random() * 3,
              life: 0,
              maxLife: 20 + Math.random() * 10
            });
          }
        }
      });

      // Sparklers frame updater
      for (let s = data.sparks.length - 1; s >= 0; s--) {
        const sp = data.sparks[s];
        sp.life += 1;
        sp.x += sp.vx;
        sp.y += sp.vy;
        if (sp.life >= sp.maxLife) {
          data.sparks.splice(s, 1);
        }
      }

      // Sync React HUD state values
      setScore(data.accumulatedScore);
      setSpeed(Math.round(data.currentSpeed * 1.5));
      setBattery(Math.round(data.batteryLevel));
      setDistance(parseFloat(data.distanceDriven.toFixed(2)));

      // Trigger Alert showing warp mode availability
      setShowWarpAlert(data.batteryLevel > 35 && !data.warpActive && data.warpCooldown <= 0);

      // Render actual tone pitch shifts
      updateEngineSoundPitch(data.currentSpeed);

      // ---------------- PERSPECTIVE ROAD DRAW ENGINE ----------------
      ctx.clearRect(0, 0, width, height);

      // A. Dynamic Retro Sun & Cosmic Synthwave Sunset Background
      // Horizontal linear background sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
      skyGrad.addColorStop(0, '#04020a'); // black cosmic
      skyGrad.addColorStop(0.4, '#15102a'); // deep violet/indigo
      skyGrad.addColorStop(0.75, '#2b104c'); // pink aura
      skyGrad.addColorStop(1.0, '#421a5a'); // bright core magenta horizon top
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height * 0.55);

      // Center horizon anchor point
      const horizonY = height * 0.52;
      const xBasisOffset = (width / 2) - (data.playerX * 120);

      // Giant Parallax glowing Neon Sun
      const sunR = Math.max(50, height * 0.25);
      const sunX = width / 2 + (data.currentTrackCurve * 2.8) - (data.playerX * 12);
      const sunY = horizonY - sunR * 0.15;

      const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sunGrad.addColorStop(0, '#f43f5e'); // fiery hot pink
      sunGrad.addColorStop(0.5, '#fca5a5');
      sunGrad.addColorStop(1, '#eab308'); // gold sunset
      ctx.fillStyle = sunGrad;

      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, Math.PI, 0); // half sun
      ctx.lineTo(sunX + sunR, sunY);
      ctx.closePath();
      ctx.fill();

      // Horizontal retro line slots overlay on Sun
      ctx.strokeStyle = '#2b0c48';
      ctx.lineWidth = 3.5;
      for (let sl = sunY - sunR; sl < sunY; sl += 12) {
        // Increases thickness towards the sunset horizon
        ctx.lineWidth = 1 + (sl - (sunY - sunR)) / 30;
        ctx.beginPath();
        ctx.moveTo(sunX - sunR - 10, sl);
        ctx.lineTo(sunX + sunR + 10, sl);
        ctx.stroke();
      }

      // Parallax glowing cyber wireframe outline mountains
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.0;
      ctx.fillStyle = '#06050b';
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      // peaks
      ctx.lineTo(width * 0.15, horizonY - 45 + Math.sin(data.position * 0.0001) * 5);
      ctx.lineTo(width * 0.28, horizonY - 15);
      ctx.lineTo(width * 0.42, horizonY - 65 - Math.sin(data.position * 0.0001) * 3);
      ctx.lineTo(width * 0.56, horizonY - 25);
      ctx.lineTo(width * 0.72, horizonY - 80 + Math.sin(data.position * 0.0002) * 6);
      ctx.lineTo(width * 0.85, horizonY - 30);
      ctx.lineTo(width, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // B. 3D Road Calculations list loop
      // Horizon curve tracking
      let dx = 0;
      let dy = 0;

      // Keep screen size buffer of segments
      const maxDrawSegments = 160;
      const cameraDepth = 0.84;
      const baseRoadWidth = 2400; // virtual road gauge width units

      // Create screen-projection database maps
      const startSeg = Math.floor(data.position / data.segmentLength);

      for (let n = 0; n < maxDrawSegments; n++) {
        // Wrap around track correctly
        const index = (startSeg + n) % data.segments.length;
        const segment = data.segments[index];

        // 3D placement math
        // Relative coordinates offset of segment center relative to look-around horizontal angle camera
        const absoluteZ = segment.world.z + (index < startSeg ? data.trackLength : 0);
        const segmentRelZ = absoluteZ - data.position;

        if (segmentRelZ <= 10) continue; // behind engine camera clip

        // Cumulative path bend transformations
        if (n > 0) {
          dx += segment.curve * 1.5;
          // Hill vertical sine elevation mapping
          dy += Math.sin((index * 0.02) + (data.position * 0.00002)) * 3;
        }

        const worldX = -dx - (data.playerX * baseRoadWidth * 0.5) + (data.currentTrackCurve * 2.5);
        const worldY = -dy - 200; // altitude drop beneath look eye grid line

        const scale = cameraDepth / segmentRelZ;
        const projectedX = width / 2 + (worldX * scale * width * 0.65);
        const projectedY = horizonY - (worldY * scale * height * 0.45);
        const projectedW = baseRoadWidth * scale * width * 0.48;

        segment.screen = {
          x: projectedX,
          y: projectedY,
          w: projectedW,
          scale: scale
        };
      }

      // Draw perspective polygons back-to-front down track
      for (let i = maxDrawSegments - 2; i > 0; i--) {
        const curIdx = (startSeg + i) % data.segments.length;
        const prevIdx = (startSeg + i - 1) % data.segments.length;

        const curr = data.segments[curIdx];
        const prev = data.segments[prevIdx];

        if (!curr.screen || !prev.screen || curr.screen.scale === 0 || prev.screen.scale === 0) continue;
        if (curr.screen.y < horizonY || prev.screen.y < horizonY) continue; // sky clipper boundaries

        const cX = curr.screen.x;
        const cY = curr.screen.y;
        const cW = curr.screen.w;

        const pX = prev.screen.x;
        const pY = prev.screen.y;
        const pW = prev.screen.w;

        // 1. Draw glowing cyberpunk grass backdrop side bands
        ctx.fillStyle = curr.color.grass;
        ctx.beginPath();
        ctx.moveTo(0, pY);
        ctx.lineTo(pX - pW, pY);
        ctx.lineTo(cX - cW, cY);
        ctx.lineTo(0, cY);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(width, pY);
        ctx.lineTo(pX + pW, pY);
        ctx.lineTo(cX + cW, cY);
        ctx.lineTo(width, cY);
        ctx.closePath();
        ctx.fill();

        // 2. Draw outer Rumble Strips boundaries
        const rFactor = 0.12; // strip thickness percentage
        ctx.fillStyle = curr.color.rumble;
        
        ctx.beginPath();
        ctx.moveTo(pX - pW - pW * rFactor, pY);
        ctx.lineTo(pX - pW, pY);
        ctx.lineTo(cX - cW, cY);
        ctx.lineTo(cX - cW - cW * rFactor, cY);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pX + pW, pY);
        ctx.lineTo(pX + pW + pW * rFactor, pY);
        ctx.lineTo(cX + cW + cW * rFactor, cY);
        ctx.lineTo(cX + cW, cY);
        ctx.closePath();
        ctx.fill();

        // 3. Draw main asphalt freeway track
        ctx.fillStyle = curr.color.road;
        ctx.beginPath();
        ctx.moveTo(pX - pW, pY);
        ctx.lineTo(pX + pW, pY);
        ctx.lineTo(cX + cW, cY);
        ctx.lineTo(cX - cW, cY);
        ctx.closePath();
        ctx.fill();

        // 4. Draw neat digital dashing center micro dash lanes
        if (curr.color.line !== 'rgba(0,0,0,0)') {
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = Math.max(1, pW * 0.015);
          ctx.beginPath();
          ctx.moveTo(pX, pY);
          ctx.lineTo(cX, cY);
          ctx.stroke();
        }
      }

      // C. Draw glowing environment batteries and warning conicals
      const drawCollectibles = () => {
        data.collectibles.forEach((col) => {
          if (!col.active) return;
          const colSegIdx = Math.floor(col.z / data.segmentLength);
          const relativeZ = col.z - data.position;

          if (relativeZ < 100 || relativeZ > 24000) return; // out visual scope

          // Render coordinate projection mapping
          const screenSeg = data.segments[colSegIdx % data.segments.length];
          if (!screenSeg || !screenSeg.screen || screenSeg.screen.scale === 0) return;

          const scale = screenSeg.screen.scale;
          const roadWidth = screenSeg.screen.w;
          const colX = screenSeg.screen.x + (col.lane * roadWidth);
          const colY = screenSeg.screen.y - (Math.sin(col.pulse) * 4); // hovering
          const size = Math.max(2, 6500 * scale);

          // Glowing diamond
          ctx.shadowBlur = Math.max(4, 1500 * scale);
          ctx.shadowColor = '#eab308';
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(colX, colY - size * 0.95);
          ctx.lineTo(colX + size * 0.7, colY);
          ctx.lineTo(colX, colY + size * 0.95);
          ctx.lineTo(colX - size * 0.7, colY);
          ctx.closePath();
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = `black ${Math.max(5, Math.round(size * 0.8))}px font-mono`;
          ctx.textAlign = 'center';
          ctx.fillText('⚡', colX, colY + size * 0.3);
        });
      };
      drawCollectibles();

      const drawObstacles = () => {
        data.obstacles.forEach((obs) => {
          const obsSegIdx = Math.floor(obs.z / data.segmentLength);
          const relativeZ = obs.z - data.position;

          if (relativeZ < 100 || relativeZ > 24000) return;

          const screenSeg = data.segments[obsSegIdx % data.segments.length];
          if (!screenSeg || !screenSeg.screen || screenSeg.screen.scale === 0) return;

          const scale = screenSeg.screen.scale;
          const roadWidth = screenSeg.screen.w;
          const obsX = screenSeg.screen.x + (obs.lane * roadWidth);
          const obsY = screenSeg.screen.y;
          const sizeW = Math.max(3, 8500 * scale);
          const sizeH = sizeW * 1.35;

          // Glowing hazard barricade or conoid
          if (obs.type === 'barrier') {
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.0;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';

            ctx.fillRect(obsX - sizeW, obsY - sizeH, sizeW * 2, sizeH);
            ctx.strokeRect(obsX - sizeW, obsY - sizeH, sizeW * 2, sizeH);

            // Stripes
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = Math.max(1, sizeW * 0.15);
            ctx.beginPath();
            ctx.moveTo(obsX - sizeW, obsY - sizeH * 0.7);
            ctx.lineTo(obsX + sizeW * 0.5, obsY);
            ctx.stroke();

            ctx.shadowBlur = 0;
          } else {
            // Neon safety conical
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.moveTo(obsX - sizeW * 0.5, obsY);
            ctx.lineTo(obsX + sizeW * 0.5, obsY);
            ctx.lineTo(obsX, obsY - sizeH * 1.15);
            ctx.closePath();
            ctx.fill();

            // Strips
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(obsX - sizeW * 0.25, obsY - sizeH * 0.5);
            ctx.lineTo(obsX + sizeW * 0.25, obsY - sizeH * 0.5);
            ctx.lineTo(obsX + sizeW * 0.18, obsY - sizeH * 0.75);
            ctx.lineTo(obsX - sizeW * 0.18, obsY - sizeH * 0.75);
            ctx.closePath();
            ctx.fill();
          }
        });
      };
      drawObstacles();

      // D. Draw forward moving enemy AI cars
      const drawTraffic = () => {
        data.traffic.forEach((car) => {
          const carSegIdx = Math.floor(car.z / data.segmentLength);
          const relativeZ = car.z - data.position;

          if (relativeZ < 100 || relativeZ > 24000) return;

          const screenSeg = data.segments[carSegIdx % data.segments.length];
          if (!screenSeg || !screenSeg.screen || screenSeg.screen.scale === 0) return;

          const scale = screenSeg.screen.scale;
          const roadWidth = screenSeg.screen.w;
          const carX = screenSeg.screen.x + (car.lane * roadWidth);
          const carY = screenSeg.screen.y;
          const carW = Math.max(4, 9500 * scale);
          const carH = carW * 0.65;

          // Glowing solid chassis polygons
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = car.color;
          ctx.lineWidth = 2.0;
          ctx.shadowBlur = 10;
          ctx.shadowColor = car.color;

          ctx.beginPath();
          ctx.rect(carX - carW, carY - carH, carW * 2, carH);
          ctx.fill();
          ctx.stroke();

          // Tail neon spoiler wing
          ctx.fillStyle = car.color;
          ctx.fillRect(carX - carW * 1.15, carY - carH - 2, carW * 2.3, 3);

          // Brake tail lights
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(carX - carW * 0.8, carY - carH * 0.8, 3, 3);
          ctx.fillRect(carX + carW * 0.6, carY - carH * 0.8, 3, 3);

          ctx.shadowBlur = 0;
        });
      };
      drawTraffic();

      // E. Draw interactive player cybercar vector frames (at bottom center area)
      const drawPlayerCar = () => {
        // Player rumble shaking factor
        let shakeX = 0;
        let shakeY = 0;
        if (data.camRumble > 0) {
          shakeX = (Math.random() * 2 - 1) * data.camRumble;
          shakeY = (Math.random() * 2 - 1) * data.camRumble;
          data.camRumble = Math.max(0, data.camRumble - 1.2);
        }

        const baseCarX = width / 2 + shakeX;
        const baseCarY = height * 0.82 + shakeY;

        const carW = width * 0.165;
        const carH = carW * 0.58;

        ctx.shadowBlur = 24;
        ctx.shadowColor = carSpec.color;

        // Vector cyberpunk chassis
        ctx.fillStyle = '#01050d';
        ctx.strokeStyle = carSpec.color;
        ctx.lineWidth = 3.5;

        // Front bumper splitter cockpit design
        ctx.beginPath();
        ctx.moveTo(baseCarX - carW * 0.85, baseCarY);
        ctx.lineTo(baseCarX - carW * 0.65, baseCarY - carH * 0.8);
        ctx.lineTo(baseCarX + carW * 0.65, baseCarY - carH * 0.8);
        ctx.lineTo(baseCarX + carW * 0.85, baseCarY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // High gloss glass cyber cabin
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        const cabinW = carW * 0.38;
        const cabinH = carH * 0.45;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
        ctx.beginPath();
        ctx.moveTo(baseCarX - cabinW, baseCarY - carH * 0.42);
        ctx.lineTo(baseCarX - cabinW * 0.6, baseCarY - carH * 0.78);
        ctx.lineTo(baseCarX + cabinW * 0.6, baseCarY - carH * 0.78);
        ctx.lineTo(baseCarX + cabinW, baseCarY - carH * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Rear brake lighting glows
        ctx.fillStyle = data.currentSpeed > 50 ? '#10b981' : '#f43f5e';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 15;
        ctx.fillRect(baseCarX - carW * 0.68, baseCarY - carH * 0.38, 14, 4);
        ctx.fillRect(baseCarX + carW * 0.54, baseCarY - carH * 0.38, 14, 4);

        // Exhaust thruster fires (dynamic based on accelerated speed and warp state)
        if (isAccelerating && data.currentSpeed > 20) {
          ctx.shadowBlur = 28;
          ctx.shadowColor = data.warpActive ? '#a855f7' : '#06b6d4';
          ctx.fillStyle = data.warpActive ? '#c084fc' : '#22d3ee';
          const flameH = (data.currentSpeed / maxWarpLimit) * 32;

          ctx.beginPath();
          ctx.moveTo(baseCarX - 12, baseCarY);
          ctx.lineTo(baseCarX, baseCarY + flameH);
          ctx.lineTo(baseCarX + 12, baseCarY);
          ctx.closePath();
          ctx.fill();
        }

        ctx.shadowBlur = 0;
      };
      drawPlayerCar();

      // F. Render active exhaust and space-speed warp sparks
      data.sparks.forEach((sp) => {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Warp Hyper speed wormhole effect overlays
      if (data.warpActive) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.16)';
        ctx.lineWidth = 2.0;
        for (let l = 0; l < 8; l++) {
          const depthL = (l * 40 + (Date.now() / 3) % 40) / 10;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, depthL * 15, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(frameLoop);
    };

    const maxWarpLimit = RETRO_CARS[0].stats.speed * 3.5; // for scaling math

    animId = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [gameState, selectedCarIndex]);

  return (
    <div 
      className="w-full flex flex-col gap-4 relative animate-fade-in text-slate-100" 
      id="neoracer-root"
      ref={containerRef}
      style={{ height: 'calc(100vh - 80px)', minHeight: '520px' }}
    >
      
      {/* 1. SELECTION / PRE-GAME MENU */}
      {gameState === 'selection' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#07060a]/92" id="racer-selection-overlay">
          <div className="w-full max-w-2xl glass bg-white/5 border border-white/10 p-6 md:p-8 rounded-2xl flex flex-col gap-6 shadow-2xl relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Title banner */}
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <ArrowLeft onClick={onBackToMenu} className="text-white/60 hover:text-cyan-400 cursor-pointer transition-colors" size={20} />
                <h1 className="text-2xl md:text-3xl font-black tracking-tighter italic text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.35)]">NEON RACER HIGHWAY</h1>
              </div>
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl">
                <Trophy size={13} className="text-amber-400" />
                <span className="text-[10px] font-mono tracking-widest uppercase font-bold text-white/70">BEST: {highScore}</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs uppercase tracking-widest font-black text-white/50 mb-1">CHOOSE YOUR HYPER CYBER-CAR</p>
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">Different chassis possess unique handling tolerances and magnetic pull to power capsules.</p>
            </div>

            {/* Grid selections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {RETRO_CARS.map((car, idx) => {
                const isSelected = selectedCarIndex === idx;
                return (
                  <div 
                    key={car.id}
                    onClick={() => { playSfxBeep(440, 0.08); setSelectedCarIndex(idx); }}
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 relative ${
                      isSelected 
                        ? 'bg-white/10 border-cyan-400 shadow-[0_4px_25px_rgba(6,182,212,0.18)] hover:-translate-y-0.5' 
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                  >
                    {/* Title & Icon */}
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs uppercase font-black tracking-tight" style={{ color: car.color }}>{car.name}</h3>
                      <span className="text-xs">{car.icon}</span>
                    </div>

                    <p className="text-[9px] text-zinc-400 leading-relaxed font-mono italic">{car.desc}</p>

                    {/* Performance Progress indicators */}
                    <div className="flex flex-col gap-1 pr-1">
                      {/* STAT 1: SPEED */}
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-zinc-500">SPD:</span>
                        <div className="w-16 h-1 bg-white/10 rounded overflow-hidden">
                          <div className="h-full bg-cyan-400" style={{ width: `${car.stats.speed}%` }} />
                        </div>
                      </div>
                      {/* STAT 2: ACCEL */}
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-zinc-500">ACC:</span>
                        <div className="w-16 h-1 bg-white/10 rounded overflow-hidden">
                          <div className="h-full bg-cyan-400" style={{ width: `${car.stats.accel}%` }} />
                        </div>
                      </div>
                      {/* STAT 3: MAG RADIUS */}
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-zinc-500">MAG:</span>
                        <div className="w-16 h-1 bg-white/10 rounded overflow-hidden">
                          <div className="h-full bg-amber-400" style={{ width: `${car.stats.magnet}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Launch Action */}
            <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-3">
              <button 
                onClick={handleStartGame}
                className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase text-xs rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] tracking-widest cursor-pointer flex items-center justify-center gap-2 transition-all"
              >
                <Play size={14} fill="currentColor" />
                INITIATE RACING GRID
              </button>
              
              <div className="flex flex-wrap gap-4 items-center justify-center text-[9px] font-mono text-zinc-400 uppercase">
                <span className="flex items-center gap-1">🎮 <b className="text-white">A / D</b> OR <b className="text-white">← / →</b> STEER</span>
                <span className="flex items-center gap-1">🔺 <b className="text-white">W</b> OR <b className="text-white">↑</b> ACCELERATE</span>
                <span className="flex items-center gap-1">⚡ <b className="text-white">SPACE</b> HYPER-DRIVE BOOSTER</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. GAME HUD BAR */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 right-4 z-20 flex gap-4 md:gap-6 pointer-events-none font-mono" id="racer-playing-hud">
          {/* SENSOR A: SPEED tachometer style */}
          <div className="glass bg-slate-950/80 border border-white/10 py-2.5 px-4 rounded-xl flex items-center gap-3">
            <Gauge className="text-cyan-400 animate-pulse" size={18} />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">Velocity</span>
              <span className="text-lg font-black tracking-tight text-cyan-300">{speed} <span className="text-[10px] font-normal text-zinc-400">MPH</span></span>
            </div>
          </div>

          {/* SENSOR B: SHIELD FUEL BAR */}
          <div className="glass bg-slate-950/80 border border-white/10 py-2.5 px-4 rounded-xl flex-1 max-w-xs flex items-center gap-3">
            <Battery className={battery < 30 ? 'text-rose-500 animate-bounce' : 'text-amber-400'} size={18} />
            <div className="flex flex-col flex-1 gap-0.5">
              <div className="flex justify-between items-center text-[8px] uppercase font-bold text-zinc-400">
                <span>Cyber Battery Pool</span>
                <span>{battery}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded overflow-hidden">
                <div 
                  className={`h-full transition-all duration-150 ${battery < 30 ? 'bg-rose-500' : 'bg-amber-400'}`}
                  style={{ width: `${battery}%` }} 
                />
              </div>
            </div>
          </div>

          {/* SENSOR C: SCORE */}
          <div className="glass bg-slate-950/80 border border-white/10 py-2.5 px-4 rounded-xl ml-auto flex items-center gap-3">
            <Award className="text-emerald-400" size={18} />
            <div className="flex flex-col text-right">
              <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">Grid Rank Score</span>
              <span className="text-lg font-black text-emerald-300">{score}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. WARP HYPER BOOSTER ALERTS */}
      {gameState === 'playing' && isWarping && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 pointer-events-none animate-bounce" id="warp-active-banner">
          <div className="bg-purple-600/90 border border-purple-400 text-white font-black uppercase text-[10px] tracking-widest px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.7)] flex items-center gap-2">
            <Zap size={11} className="text-yellow-300 fill-yellow-300" />
            HYPER WARP BOOSTER ACTIVE
          </div>
        </div>
      )}

      {gameState === 'playing' && showWarpAlert && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 pointer-events-none animate-pulse" id="warp-alert-banner">
          <div className="bg-white/5 border border-white/10 text-cyan-300 font-bold uppercase text-[9px] tracking-widest px-3 py-1 rounded-xl">
            PRESS [SPACEBAR] FOR WARP JET SPEED UP
          </div>
        </div>
      )}

      {/* 4. GAME OVER SCORE DUMP */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#0a080f]/95 animate-fade-in" id="racer-gameover-overlay">
          <div className="w-full max-w-sm glass bg-white/5 border border-white/10 p-6 md:p-8 rounded-2xl flex flex-col gap-5 shadow-2xl text-center relative border-rose-500/30">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="text-rose-500 font-black text-2xl tracking-tighter uppercase italic drop-shadow-[0_0_10px_rgba(244,63,94,0.35)]">
              GRID EXHAUSTED CATASTROPHY
            </div>
            
            <p className="text-zinc-400 text-[11px] leading-relaxed max-w-xs mx-auto">
              Your jet fuel pool fully drained or structural integrity compromised off-road. Keep collecting golden energy batteries!
            </p>

            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col gap-2 font-mono text-[11px]">
              <div className="flex justify-between items-center text-zinc-500 border-b border-white/5 pb-1.5">
                <span>CHASSIS TYPE:</span>
                <span className="text-zinc-300 uppercase font-black">{RETRO_CARS[selectedCarIndex].name}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-500 border-b border-white/5 pb-1.5">
                <span>DISTANCE CONQUERED:</span>
                <span className="text-cyan-300 font-black">{distance} KM</span>
              </div>
              <div className="flex justify-between items-center text-zinc-500 border-b border-white/5 pb-1.5">
                <span>FINAL RUN SCORE:</span>
                <span className="text-emerald-300 font-black">{score}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-500">
                <span>STATION RECORD:</span>
                <span className="text-amber-300 font-bold flex items-center gap-1">🥇 {highScore}</span>
              </div>
            </div>

            <button 
              onClick={handleStartGame}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.35)] tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCcw size={13} />
              RESPAWN GRID ENGINE
            </button>

            <button 
              onClick={() => { playSfxBeep(320); setGameState('selection'); }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white font-black border border-white/10 uppercase text-[10px] rounded-xl tracking-wider transition-all cursor-pointer"
            >
              BACK TO HARBOR SELECTION
            </button>
          </div>
        </div>
      )}

      {/* RENDER VIEWPORT VIEW */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block rounded-2xl relative shadow-2xl border border-white/10 cursor-crosshair bg-neutral-950" 
        onClick={() => { if (gameState === 'playing') playSfxBeep(440, 0.05); }}
        id="neonroad-canvas-element"
      />

    </div>
  );
};
