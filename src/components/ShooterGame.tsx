import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { 
  ArrowLeft, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Crosshair, 
  Heart, 
  Shield, 
  Info,
  Compass,
  Zap,
  Play,
  RotateCw,
  Sliders,
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react';
import { AppSettings } from '../types';

interface ShooterGameProps {
  settings: AppSettings;
  onBackToMenu: () => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

// 16x16 Training Yard configuration map layout.
// W = Tall red brick wall
// C = Heavy wooden crate (Cover)
// B = Steel fuel barrel (Cover)
// . = Empty training space
const MAP_GRID = [
  "WWWWWWWWWWWWWWWW",
  "W................W",
  "W..C....B....C...W",
  "W.....W.W.W......W",
  "W..B..W...W......W",
  "W.....W...W...B..W",
  "WWWW..W...W......W",
  "W.....WWWWW......W",
  "W.C..........C...W",
  "W................W",
  "W....WW...WW.....W",
  "W.B..W.....W..B..W",
  "W....W..C..W.....W",
  "W..C.W.....W.C...W",
  "W................W",
  "WWWWWWWWWWWWWWWW"
];

const GRID_SIZE = 16;
const CELL_SCALE = 3.5; // Scale multiplier for grid cells to make yard spacious

interface Bot3D {
  id: string;
  name: string;
  team: 'red' | 'blue';
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  yaw: number;
  state: 'wandering' | 'aiming' | 'cooldown';
  shootTimer: number;
  walkAnimTime: number;
  isDead: boolean;
  meshGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  stickMat: THREE.MeshPhongMaterial; // specific to this bot for flashy hit indicators
  
  // Unstuck mechanics
  prevX: number;
  prevZ: number;
  stuckTimer: number;
  isStuckMode: boolean;
  stuckYaw: number;
  stuckDuration: number;

  // Visual recoil timers
  flashTimer: number;
  hitRecoilTimer: number;
}

interface BulletTracer {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
  birth: number;
  duration: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  birth: number;
  life: number;
}

interface CollidableAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface FloatingDamage {
  id: string;
  text: string;
  worldPos: THREE.Vector3;
  age: number;
}

export const ShooterGame: React.FC<ShooterGameProps> = ({
  settings,
  onBackToMenu,
  onUpdateSettings
}) => {
  // Setup Mode defaults
  const [setupMode, setSetupMode] = useState<boolean>(true);
  const [gameMode, setGameMode] = useState<'solo' | 'team'>('solo');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [botCount, setBotCount] = useState<number>(6);
  const [mouseSensitivity, setMouseSensitivity] = useState<'low' | 'normal' | 'high'>('normal');
  const [invertMouseY, setInvertMouseY] = useState<boolean>(false);
  const [soundOn, setSoundOn] = useState<boolean>(settings.soundEnabled);

  // In-Game pause mode toggle states
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [graphicsQuality, setGraphicsQuality] = useState<'low' | 'medium' | 'high'>('high');

  // Gameplay state values
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'victory'>('playing');
  const [playerHp, setPlayerHp] = useState<number>(1000);
  const [ammo, setAmmo] = useState<number>(30);
  const [reserveAmmo, setReserveAmmo] = useState<number>(120);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [kills, setKills] = useState<number>(0);
  const [activeEnemiesCount, setActiveEnemiesCount] = useState<number>(4);
  const [gameTime, setGameTime] = useState<number>(480);
  const [hitmarkerFlash, setHitmarkerFlash] = useState<boolean>(false);
  const [pointerLocked, setPointerLocked] = useState<boolean>(false);

  // React local states for rendering Projected 3D elements once loaded
  const [gameBots, setGameBots] = useState<{ id: string; name: string; team: 'red' | 'blue' }[]>([]);
  const [floats, setFloats] = useState<{ id: string; text: string }[]>([]);

  // Canvas and HTML container refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio Context tracking
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Core shooter engine data
  const dataRef = useRef({
    playerX: 5.25, 
    playerY: 1.6, // Eye height
    playerZ: 5.25,
    playerYaw: -Math.PI / 4, 
    playerPitch: 0.0,
    playerHp: 1000,
    ammo: 30,
    reserveAmmo: 120,
    isReloading: false,
    reloadTimer: 0.0,
    recoilTimer: 0.0,
    lastShootTime: 0,
    vignetteIntensity: 0.0,
    killsCount: 0,
    
    // Dynamic settings reference to avoid stale closures inside event listeners
    mouseSens: 'normal',
    invertMouseY: false,
    soundOn: true,
    difficulty: 'medium',
    gameMode: 'solo',
    botCount: 6,
    isPaused: false,

    keys: {} as Record<string, boolean>,
    mouseLookActive: false,
    prevMouseX: 0,
    prevMouseY: 0,
    
    bots: [] as Bot3D[],
    collidables: [] as CollidableAABB[],
    tracers: [] as BulletTracer[],
    sparks: [] as SparkParticle[],
    damageFloats: [] as FloatingDamage[],
    wallMeshes: [] as THREE.Mesh[],
    
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    playerGunGroup: null as THREE.Group | null,
    muzzleFlash: null as THREE.Mesh | null,
    muzzleLight: null as THREE.PointLight | null,
  });

  // Keep Ref settings in sync with states to prevent Closure stale issues
  useEffect(() => {
    dataRef.current.mouseSens = mouseSensitivity;
    dataRef.current.invertMouseY = invertMouseY;
    dataRef.current.soundOn = soundOn;
    dataRef.current.difficulty = difficulty;
    dataRef.current.gameMode = gameMode;
    dataRef.current.botCount = botCount;
    dataRef.current.isPaused = isPaused;
  }, [mouseSensitivity, invertMouseY, soundOn, difficulty, gameMode, botCount, isPaused]);

  const toggleSound = () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    onUpdateSettings({ soundEnabled: nextVal });
    playSynthSfx('reload');
  };

  const playSynthSfx = (type: 'shoot' | 'dry' | 'reload' | 'hit' | 'kill' | 'damage') => {
    if (!dataRef.current.soundOn) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtxClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      if (type === 'shoot') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.15);

        // White noise layer for combat explosive realism
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const dataBytes = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          dataBytes[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start();
      } else if (type === 'dry') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.05);
      } else if (type === 'reload') {
        const playClack = (offset: number, f: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + offset);
          gain.gain.setValueAtTime(0.15, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.09);
        };
        playClack(0, 350);
        playClack(0.2, 180);
        playClack(0.4, 440);
      } else if (type === 'hit') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.setValueAtTime(150, now + 0.04);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.08);
      } else if (type === 'kill') {
        const root = 440;
        [0, 4, 7, 12].forEach((interval, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = root * Math.pow(2, interval / 12);
          gain.gain.setValueAtTime(0.08, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.25);
        });
      } else if (type === 'damage') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.21);
      }
    } catch (_) {}
  };

  // Helper procedural builder: Brick texture
  const createBrickTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#651a14'; // Dark crimson brick color
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#450a06'; 
    for (let y = 0; y < 128; y += 16) {
      ctx.fillRect(0, y, 128, 2);
      const isEven = (y / 16) % 2 === 0;
      for (let x = isEven ? 0 : 16; x < 128; x += 32) {
        ctx.fillRect(x, y, 2, 16);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  };

  // Helper procedural builder: Crate texture
  const createCrateTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#a16224'; // Wood dark khaki
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#603813';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(118, 118);
    ctx.moveTo(118, 10);
    ctx.lineTo(10, 118);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  };

  // Helper procedural builder: Concrete ground
  const createConcreteTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2d2e33'; // Deep tactical slab slate grey
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#1e1f24';
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }
    ctx.strokeStyle = '#1e1f24';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  };

  // Generate tactical red or blue Stickman Bot Group
  const buildStickmanMesh = (team: 'red' | 'blue') => {
    const group = new THREE.Group();
    const colorHex = team === 'red' ? 0xef4444 : 0x3b82f6;
    const stickMat = new THREE.MeshPhongMaterial({ 
      color: colorHex, 
      emissive: 0x000000, 
      shininess: 30 
    });
    const gunMat = new THREE.MeshPhongMaterial({ color: 0x1f2937, shininess: 50 }); // Steel grey

    // Head
    const headGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const head = new THREE.Mesh(headGeo, stickMat);
    head.position.y = 1.45;
    group.add(head);

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.72, 8);
    const torso = new THREE.Mesh(torsoGeo, stickMat);
    torso.position.y = 0.95;
    group.add(torso);

    // Pelvis/Lower joint block
    const pelvisGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const pelvis = new THREE.Mesh(pelvisGeo, stickMat);
    pelvis.position.y = 0.6;
    group.add(pelvis);

    // Leg Groups
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.12, 0.58, 0);
    const legMeshGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.62, 8);
    legMeshGeo.translate(0, -0.3, 0); // shift pivot
    const leftLegMesh = new THREE.Mesh(legMeshGeo, stickMat);
    leftLeg.add(leftLegMesh);
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.12, 0.58, 0);
    const rightLegMesh = new THREE.Mesh(legMeshGeo, stickMat);
    rightLeg.add(rightLegMesh);
    group.add(rightLeg);

    // Arm Groups
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.18, 1.25, 0);
    const armMeshGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.56, 8);
    armMeshGeo.translate(0, -0.25, 0);
    const leftArmMesh = new THREE.Mesh(armMeshGeo, stickMat);
    leftArm.add(leftArmMesh);
    group.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.18, 1.25, 0);
    const rightArmMesh = new THREE.Mesh(armMeshGeo, stickMat);
    rightArm.add(rightArmMesh);
    group.add(rightArm);

    // Bot rifle (black cylinders)
    const botRifle = new THREE.Group();
    botRifle.position.set(0.1, 1.1, 0.18);
    botRifle.rotation.x = -Math.PI / 2.2;
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.35);
    const bodyMesh = new THREE.Mesh(bodyGeo, gunMat);
    botRifle.add(bodyMesh);
    
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6);
    barrelGeo.translate(0, 0.2, 0);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, gunMat);
    botRifle.add(barrelMesh);
    
    group.add(botRifle);

    return { group, leftLeg, rightLeg, leftArm, rightArm, stickMat };
  };

  // Build First Person HUD visible weapon: highly realistic modular M4A1
  const buildPlayerRifle = () => {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x111827, shininess: 80 }); // Slate tactical receiver black
    const handMat = new THREE.MeshPhongMaterial({ color: 0xe0a996 }); // Peach hand shape texture
    const metalMat = new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 90 }); // Metallic high gloss

    // Receiver (main carcass)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.28), bodyMat);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Hand Guard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.16), bodyMat);
    handguard.position.set(0, 0.01, -0.2);
    group.add(handguard);

    // Barrel Extension
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.35, 8), metalMat);
    barrel.rotateX(Math.PI / 2);
    barrel.position.set(0, 0.015, -0.38);
    group.add(barrel);

    // Tactical Mag (curved box)
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.06), bodyMat);
    mag.position.set(0, -0.09, -0.04);
    mag.rotation.x = -Math.PI / 10;
    group.add(mag);

    // Pistol grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.08, 0.04), bodyMat);
    grip.position.set(0, -0.07, 0.08);
    grip.rotation.x = Math.PI / 8;
    group.add(grip);

    // Scope attachment (ACOG style)
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.12), bodyMat);
    scope.position.set(0, 0.052, -0.02);
    group.add(scope);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.08, 0.16), bodyMat);
    stock.position.set(0, -0.01, 0.18);
    group.add(stock);

    // Muzzle compensator tip (point tracer source)
    const muzzleTip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6), metalMat);
    muzzleTip.rotateX(Math.PI / 2);
    muzzleTip.position.set(0, 0.015, -0.56);
    group.add(muzzleTip);

    // Left hand holding handguard
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), handMat);
    leftHand.position.set(-0.04, -0.02, -0.22);
    group.add(leftHand);

    // Right hand gripping trigger
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), handMat);
    rightHand.position.set(0.04, -0.05, 0.09);
    group.add(rightHand);

    return group;
  };

  // Re-initialize match state
  const handleInitiateGame = () => {
    const data = dataRef.current;
    data.playerX = 5.25;
    data.playerY = 1.6;
    data.playerZ = 5.25;
    data.playerYaw = -Math.PI / 4;
    data.playerPitch = 0.0;
    data.playerHp = 1000;
    data.ammo = 30;
    data.reserveAmmo = 120;
    data.isReloading = false;
    data.vignetteIntensity = 0;
    data.killsCount = 0;
    data.tracers.forEach(t => {
      if (data.scene) data.scene.remove(t.mesh);
    });
    data.tracers = [];
    data.sparks.forEach(s => {
      if (data.scene) data.scene.remove(s.mesh);
    });
    data.sparks = [];

    // Clear damage floats
    data.damageFloats = [];
    setFloats([]);

    // Clear old bots and recreate them to place them in fresh open cells!
    data.bots.forEach(bot => {
      if (data.scene) data.scene.remove(bot.meshGroup);
    });
    data.bots = [];

    // Spawning new ones based on active count and mode
    const openCells: { r: number, c: number }[] = [];
    for (let r = 1; r < GRID_SIZE - 1; r++) {
      for (let c = 1; c < GRID_SIZE - 1; c++) {
        if (MAP_GRID[r][c] === '.') {
          if (r > 3 || c > 3) {
            openCells.push({ r, c });
          }
        }
      }
    }
    const shuffled = [...openCells].sort(() => Math.random() - 0.5);
    const activeBotsArr: Bot3D[] = [];
    const enemyCount = gameMode === 'solo' ? botCount : Math.ceil(botCount / 2);

    for (let i = 0; i < botCount; i++) {
      const cell = shuffled[i % shuffled.length];
      const botX = cell.c * CELL_SCALE + CELL_SCALE / 2;
      const botZ = cell.r * CELL_SCALE + CELL_SCALE / 2;
      
      const isRed = i < enemyCount;
      const team: 'red' | 'blue' = isRed ? 'red' : 'blue';
      const botId = `bot_${team}_${i}`;
      
      let botName = '';
      if (team === 'red') {
        const redNames = ['Red_Alpha', 'Red_Bravo', 'Red_Charlie', 'Red_Delta', 'Red_Echo', 'Red_Foxtrot', 'Red_Golf', 'Red_Hotel', 'Red_India', 'Red_Juliett', 'Red_Kilo', 'Red_Lima'];
        botName = redNames[i] || `Red_Bot_${i}`;
      } else {
        const blueNames = ['Blue_One', 'Blue_Two', 'Blue_Three', 'Blue_Four', 'Blue_Five', 'Blue_Six'];
        botName = blueNames[i - enemyCount] || `Blue_Bot_${i}`;
      }

      const art = buildStickmanMesh(team);
      art.group.position.set(botX, 0, botZ);
      art.group.userData = { botId };
      if (data.scene) data.scene.add(art.group);

      activeBotsArr.push({
        id: botId,
        name: botName,
        team,
        x: botX,
        z: botZ,
        hp: 1000,
        maxHp: 1000,
        yaw: Math.random() * Math.PI * 2,
        state: 'wandering',
        shootTimer: Math.random() * 1.5,
        walkAnimTime: Math.random() * 100,
        isDead: false,
        meshGroup: art.group,
        leftLeg: art.leftLeg,
        rightLeg: art.rightLeg,
        leftArm: art.leftArm,
        rightArm: art.rightArm,
        stickMat: art.stickMat,
        prevX: botX,
        prevZ: botZ,
        stuckTimer: 0,
        isStuckMode: false,
        stuckYaw: 0,
        stuckDuration: 0,
        flashTimer: 0,
        hitRecoilTimer: 0,
      });
    }

    data.bots = activeBotsArr;
    setGameBots(activeBotsArr.map(b => ({ id: b.id, name: b.name, team: b.team })));

    setPlayerHp(1000);
    setAmmo(30);
    setReserveAmmo(120);
    setIsReloading(false);
    setKills(0);
    setActiveEnemiesCount(enemyCount);
    setGameTime(480);
    setGameState('playing');
    setIsPaused(false);

    playSynthSfx('reload');
    
    // Attempt cursor lock
    setTimeout(() => {
      canvasRef.current?.requestPointerLock();
    }, 100);
  };

  const handleStartMatch = () => {
    setSetupMode(false);
  };

  // Run Graphics Quality updates directly on renderer
  useEffect(() => {
    const data = dataRef.current;
    if (!data.renderer) return;
    
    if (graphicsQuality === 'low') {
      data.renderer.shadowMap.enabled = false;
      data.renderer.setPixelRatio(1.0);
    } else if (graphicsQuality === 'medium') {
      data.renderer.shadowMap.enabled = true;
      data.renderer.shadowMap.type = THREE.BasicShadowMap;
      data.renderer.setPixelRatio(1.2);
    } else {
      data.renderer.shadowMap.enabled = true;
      data.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      data.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }, [graphicsQuality, setupMode]);

  // Handle pointer lock change inside playing state
  const togglePause = () => {
    if (setupMode || gameState !== 'playing') return;
    setIsPaused(prev => {
      const next = !prev;
      if (next) {
        document.exitPointerLock();
      } else {
        canvasRef.current?.requestPointerLock();
      }
      return next;
    });
  };

  const checkMatchResult = () => {
    const data = dataRef.current;
    // Red team is always enemy target
    const livingEnemies = data.bots.filter(b => b.team === 'red' && !b.isDead);
    setActiveEnemiesCount(livingEnemies.length);
    if (livingEnemies.length === 0) {
      setGameState('victory');
      document.exitPointerLock();
    }
  };

  // Core Game Loop and canvas setup
  useEffect(() => {
    if (setupMode) return; // Wait until player hits START MATCH

    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Construction
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c); // Tactical night background
    scene.fog = new THREE.FogExp2(0x0a0a0c, 0.035); // Visual volumetric depth
    dataRef.current.scene = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(5.25, 1.6, 5.25);
    dataRef.current.camera = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    dataRef.current.renderer = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xc084fc, 0.85); // Neon ultraviolet courtyard wash glow
    dirLight.position.set(20, 35, 15);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Ground point accent lights for cyber yard ambiance
    const glowLight = new THREE.PointLight(0x06b6d4, 1.2, 25);
    glowLight.position.set(28, 0.5, 28);
    scene.add(glowLight);

    // 5. Materials & Grid Loading
    const brickTex = createBrickTexture();
    const crateTex = createCrateTexture();
    const concreteTex = createConcreteTexture();

    const brickMat = new THREE.MeshPhongMaterial({ map: brickTex, bumpScale: 0.05, shininess: 10 });
    const crateMat = new THREE.MeshPhongMaterial({ map: crateTex, shininess: 5 });
    const concreteMat = new THREE.MeshPhongMaterial({ map: concreteTex, shininess: 5 });
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 85 });
    const barrelRingMat = new THREE.MeshPhongMaterial({ color: 0x0f172a });

    const wallMeshes: THREE.Mesh[] = [];
    const collidables: CollidableAABB[] = [];

    // Procedural generation of the 3D map meshes based on the parsed MAP_GRID
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const char = MAP_GRID[row][col];
        const cellX = col * CELL_SCALE + CELL_SCALE / 2;
        const cellZ = row * CELL_SCALE + CELL_SCALE / 2;

        if (char === 'W') {
          // Solid Red Brick Wall Blocks
          const wallGeo = new THREE.BoxGeometry(CELL_SCALE, 4.5, CELL_SCALE);
          const wall = new THREE.Mesh(wallGeo, brickMat);
          wall.position.set(cellX, 2.25, cellZ);
          scene.add(wall);
          wallMeshes.push(wall);
          collidables.push({
            minX: cellX - CELL_SCALE/2,
            maxX: cellX + CELL_SCALE/2,
            minY: 0,
            maxY: 4.5,
            minZ: cellZ - CELL_SCALE/2,
            maxZ: cellZ + CELL_SCALE/2
          });
        } else if (char === 'C') {
          // Wooden crates
          const crateGeo = new THREE.BoxGeometry(2.0, 2.0, 2.0);
          const crate = new THREE.Mesh(crateGeo, crateMat);
          crate.position.set(cellX, 1.0, cellZ);
          scene.add(crate);
          wallMeshes.push(crate);
          collidables.push({
            minX: cellX - 1.0,
            maxX: cellX + 1.0,
            minY: 0,
            maxY: 2.0,
            minZ: cellZ - 1.0,
            maxZ: cellZ + 1.0
          });
        } else if (char === 'B') {
          // Steel barrels
          const barrelGrp = new THREE.Group();
          barrelGrp.position.set(cellX, 0, cellZ);

          const barrelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12), barrelMat);
          barrelBody.position.y = 0.7;
          barrelGrp.add(barrelBody);

          const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.06, 12), barrelRingMat);
          ring1.position.y = 0.35;
          barrelGrp.add(ring1);

          const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.06, 12), barrelRingMat);
          ring2.position.y = 1.05;
          barrelGrp.add(ring2);

          scene.add(barrelGrp);
          collidables.push({
            minX: cellX - 0.6,
            maxX: cellX + 0.6,
            minY: 0,
            maxY: 1.4,
            minZ: cellZ - 0.6,
            maxZ: cellZ + 0.6
          });
        }
      }
    }

    dataRef.current.wallMeshes = wallMeshes;
    dataRef.current.collidables = collidables;

    // Grid Floor Area
    const floorGeo = new THREE.PlaneGeometry(GRID_SIZE * CELL_SCALE, GRID_SIZE * CELL_SCALE);
    const floor = new THREE.Mesh(floorGeo, concreteMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((GRID_SIZE * CELL_SCALE) / 2, 0, (GRID_SIZE * CELL_SCALE) / 2);
    scene.add(floor);

    // Boundary cage to ensure nobody falls into outer void bounds
    collidables.push({ minX: -5.0, maxX: 0.0, minY: 0, maxY: 10, minZ: -5.0, maxZ: GRID_SIZE * CELL_SCALE + 5 });
    collidables.push({ minX: GRID_SIZE * CELL_SCALE, maxX: GRID_SIZE * CELL_SCALE + 5, minY: 0, maxY: 10, minZ: -5.0, maxZ: GRID_SIZE * CELL_SCALE + 5 });
    collidables.push({ minX: -5.0, maxX: GRID_SIZE * CELL_SCALE + 5, minY: 0, maxY: 10, minZ: -5.0, maxZ: 0.0 });
    collidables.push({ minX: -5.0, maxX: GRID_SIZE * CELL_SCALE + 5, minY: 0, maxY: 10, minZ: GRID_SIZE * CELL_SCALE, maxZ: GRID_SIZE * CELL_SCALE + 5 });

    // Spawn Player weapon
    const gunGroup = buildPlayerRifle();
    gunGroup.position.set(0.18, -0.25, -0.4); // Standard FPS offset coords
    scene.add(gunGroup);
    dataRef.current.playerGunGroup = gunGroup;

    // Simple physical muzzle flash glow bulb
    const mFlashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), mFlashMat);
    muzzleFlash.position.set(0, 0.015, -0.58);
    gunGroup.add(muzzleFlash);
    dataRef.current.muzzleFlash = muzzleFlash;

    const muzzleLight = new THREE.PointLight(0xffaa00, 0, 8);
    muzzleLight.position.set(0, 0, -0.6);
    gunGroup.add(muzzleLight);
    dataRef.current.muzzleLight = muzzleLight;

    // Re-trigger actual match spawns to dynamically respect the setup configurations
    handleInitiateGame();

    // Window Resize setup
    const handleResize = () => {
      if (!mountRef.current || !dataRef.current.renderer) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dataRef.current.renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Keyboard events
    const keys = dataRef.current.keys;
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      
      // Pause Toggle check
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }

      keys[k] = true;
      if (k === 'r') {
        triggerReload();
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setPointerLocked(isLocked);
      // Auto pause if unlocked while game active
      if (!isLocked && !dataRef.current.isPaused) {
        setIsPaused(true);
      }
    };

    // Yaw & Pitch Camera Steering
    const handleMouseMove = (e: MouseEvent) => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      const data = dataRef.current;
      if (data.isPaused) return;

      const sensSetting = data.mouseSens || 'normal';
      const invertY = data.invertMouseY;
      const sensScale = sensSetting === 'low' ? 0.4 : sensSetting === 'high' ? 1.8 : 1.0;
      const baseYawSens = 0.0022 * sensScale;
      const basePitchSens = 0.0018 * sensScale;
      const invertMultiplier = invertY ? -1 : 1;
      
      if (isLocked) {
        // Standard FP Mouse Look: e.movementX/Y
        data.playerYaw += e.movementX * baseYawSens;
        data.playerPitch -= e.movementY * basePitchSens * invertMultiplier;
      } else if (data.mouseLookActive) {
        // Fallback press-drag mouse steering
        const deltaX = e.clientX - data.prevMouseX;
        const deltaY = e.clientY - data.prevMouseY;
        data.playerYaw += deltaX * 0.004 * sensScale;
        data.playerPitch -= deltaY * 0.003 * sensScale * invertMultiplier;
        data.prevMouseX = e.clientX;
        data.prevMouseY = e.clientY;
      }
      
      // Clamp eye vertical limits to prevent flipping backwards
      data.playerPitch = Math.max(-1.3, Math.min(1.3, data.playerPitch));
    };

    const handleMouseDown = (e: MouseEvent) => {
      const data = dataRef.current;
      if (data.isPaused) return;

      if (e.button === 0) { // Left-click to fire
        if (document.pointerLockElement !== canvasRef.current) {
          canvasRef.current?.requestPointerLock();
          data.mouseLookActive = true;
          data.prevMouseX = e.clientX;
          data.prevMouseY = e.clientY;
        }
        keys['shoot_primary'] = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const data = dataRef.current;
      if (e.button === 0) {
        keys['shoot_primary'] = false;
        data.mouseLookActive = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // Clock Game Time timer
    const timerInterval = setInterval(() => {
      if (dataRef.current.isPaused) return;
      setGameTime((prev) => {
        if (prev <= 1) {
          setGameState('gameover');
          clearInterval(timerInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timerInterval);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // Release Three resources
      scene.clear();
      renderer.dispose();
      brickTex.dispose();
      crateTex.dispose();
      concreteTex.dispose();
    };
  }, [setupMode]);

  // Bullet collision checks with buffer distance to prevent clips
  const checkPlayerCollision = (x: number, z: number, radius = 0.45): boolean => {
    const pMinX = x - radius;
    const pMaxX = x + radius;
    const pMinZ = z - radius;
    const pMaxZ = z + radius;

    for (const box of dataRef.current.collidables) {
      if (pMinX < box.maxX && pMaxX > box.minX && pMinZ < box.maxZ && pMaxZ > box.minZ) {
        return true;
      }
    }
    return false;
  };

  const checkBotCollision = (x: number, z: number, radius = 0.55): boolean => {
    const minX = x - radius;
    const maxX = x + radius;
    const minZ = z - radius;
    const maxZ = z + radius;

    for (const box of dataRef.current.collidables) {
      if (minX < box.maxX && maxX > box.minX && minZ < box.maxZ && maxZ > box.minZ) {
        return true;
      }
    }
    return false;
  };

  const triggerReload = () => {
    const data = dataRef.current;
    if (data.isReloading || data.ammo === 30 || data.reserveAmmo <= 0) return;

    data.isReloading = true;
    data.reloadTimer = 1.4; // reload delay
    setIsReloading(true);
    playSynthSfx('reload');
  };

  const handleShootPrimaryWeapon = () => {
    const data = dataRef.current;
    const now = Date.now();
    if (now - data.lastShootTime < 130) return; // 460 RPM rate of fire
    if (data.isReloading) return;

    if (data.ammo <= 0) {
      playSynthSfx('dry');
      data.lastShootTime = now;
      triggerReload();
      return;
    }

    // Spend bullets
    data.ammo -= 1;
    setAmmo(data.ammo);
    data.lastShootTime = now;
    data.recoilTimer = 4.0; // Gun kickback jump

    playSynthSfx('shoot');

    // Muzzle flash glow trigger
    if (data.muzzleFlash && data.muzzleLight) {
      (data.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0.95;
      data.muzzleLight.intensity = 1.8;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), data.camera!);

    const targetMeshes: THREE.Object3D[] = [];
    const botMapping: Record<string, Bot3D> = {};

    data.bots.forEach(b => {
      if (!b.isDead) {
        // Red bots are always hostile, Blue teammates can also be hit or targeted in training yard
        targetMeshes.push(b.meshGroup);
        botMapping[b.meshGroup.id] = b;
      }
    });

    const botIntersects = raycaster.intersectObjects(targetMeshes, true);
    const terrainIntersects = raycaster.intersectObjects(data.wallMeshes, true);

    let finalHitPoint = new THREE.Vector3();
    let hitObjectBot: Bot3D | null = null;
    let hitSomething = false;

    let nearestBotDist = Infinity;
    let nearestBotPoint = new THREE.Vector3();

    if (botIntersects.length > 0) {
      const firstHit = botIntersects[0];
      nearestBotDist = firstHit.distance;
      nearestBotPoint = firstHit.point;
      
      let curObj: THREE.Object3D | null = firstHit.object;
      while (curObj) {
        if (botMapping[curObj.id]) {
          hitObjectBot = botMapping[curObj.id];
          break;
        }
        curObj = curObj.parent;
      }
    }

    let nearestTerrainDist = Infinity;
    let nearestTerrainPoint = new THREE.Vector3();
    if (terrainIntersects.length > 0) {
      nearestTerrainDist = terrainIntersects[0].distance;
      nearestTerrainPoint = terrainIntersects[0].point;
    }

    // Evaluate what got hit first
    if (nearestBotDist < nearestTerrainDist) {
      finalHitPoint.copy(nearestBotPoint);
      hitSomething = true;
      if (hitObjectBot) {
        // Dynamic Player weapon damage per hit based on Difficulty chosen
        const playerDamage = difficulty === 'easy' ? 150 : difficulty === 'hard' ? 100 : 125;
        
        hitObjectBot.hp = Math.max(0, hitObjectBot.hp - playerDamage);
        hitObjectBot.flashTimer = 0.12; 
        hitObjectBot.hitRecoilTimer = 0.15;

        // Apply visual emissive flash feedback
        hitObjectBot.stickMat.emissive.setHex(0xffffff);

        playSynthSfx('hit');
        triggerHitmarker();

        // Standard blood particles
        spawnTargetFeedbackParticles(finalHitPoint, 0xef4444);

        // Project Floating Damage Splash above head
        const popPos = finalHitPoint.clone();
        popPos.y += 0.8;
        const popId = 'dmg_' + Math.random() + '_' + Date.now();
        data.damageFloats.push({
          id: popId,
          text: `-${playerDamage}`,
          worldPos: popPos,
          age: 0.0
        });
        setFloats(prev => [...prev, { id: popId, text: `-${playerDamage}` }]);

        if (hitObjectBot.hp <= 0) {
          hitObjectBot.isDead = true;
          
          // Dead Animation: fall down elegantly
          hitObjectBot.meshGroup.rotation.z = Math.PI / 2;
          hitObjectBot.meshGroup.position.y = 0.18; // touches brick ground level
          
          playSynthSfx('kill');

          if (hitObjectBot.team === 'red') {
            data.killsCount += 1;
            setKills(data.killsCount);
          }

          checkMatchResult();
        }
      }
    } else if (nearestTerrainDist < Infinity) {
      finalHitPoint.copy(nearestTerrainPoint);
      hitSomething = true;
      spawnTargetFeedbackParticles(finalHitPoint, 0xffaa00); // Sparks for terrain
    } else {
      const dirVec = new THREE.Vector3();
      data.camera!.getWorldDirection(dirVec);
      finalHitPoint.copy(data.camera!.position).addScaledVector(dirVec, 40);
    }

    const muzzleOffset = new THREE.Vector3(0.18, -0.21, -0.56);
    muzzleOffset.applyQuaternion(data.camera!.quaternion);
    const originPoint = data.camera!.position.clone().add(muzzleOffset);

    // Dynamic Tracer: Teal tracer for player, bright amber
    drawBulletTracer(originPoint, finalHitPoint, 0x10b981);
  };

  const spawnTargetFeedbackParticles = (location: THREE.Vector3, colorVal: number) => {
    const scene = dataRef.current.scene!;
    const geo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    const mat = new THREE.MeshBasicMaterial({ color: colorVal, transparent: true });

    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(location);
      scene.add(m);
      dataRef.current.sparks.push({
        mesh: m,
        vx: (Math.random() * 2 - 1) * 2.5,
        vy: Math.random() * 3.5 + 1.2,
        vz: (Math.random() * 2 - 1) * 2.5,
        birth: Date.now(),
        life: 450
      });
    }
  };

  const triggerHitmarker = () => {
    setHitmarkerFlash(true);
    setTimeout(() => {
      setHitmarkerFlash(false);
    }, 120);
  };

  const drawBulletTracer = (start: THREE.Vector3, end: THREE.Vector3, color: number) => {
    const data = dataRef.current;
    const dist = start.distanceTo(end);
    const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4);
    tracerGeo.rotateX(Math.PI / 2); // Axis stretch Z orientation
    // Brighter & longer-lived material properties
    const tracerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.lookAt(end);
    mesh.scale.set(1, 1, dist);

    data.scene!.add(mesh);
    data.tracers.push({
      mesh,
      start,
      end,
      birth: Date.now(),
      duration: 250 // Stay visible slightly longer (250ms) for high visual capture
    });
  };

  // Projection logic for labels and damage floaters
  const projectLabelsAndFloats = (camera: THREE.PerspectiveCamera, width: number, height: number) => {
    const data = dataRef.current;
    const tempV = new THREE.Vector3();

    // 1. Bot HP and name tags
    data.bots.forEach((bot) => {
      const hudEl = document.getElementById(`bot-hud-${bot.id}`);
      if (!hudEl) return;

      if (bot.isDead) {
        hudEl.style.display = 'none';
        return;
      }

      tempV.set(bot.x, 1.85, bot.z);
      tempV.project(camera);

      const inFront = tempV.z <= 1.0;
      const screenX = (tempV.x * 0.5 + 0.5) * width;
      const screenY = (-(tempV.y * 0.5) + 0.5) * height;

      if (inFront && screenX > 0 && screenX < width && screenY > 0 && screenY < height) {
        hudEl.style.display = 'block';
        hudEl.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -100%)`;
        const barEl = document.getElementById(`bot-bar-${bot.id}`);
        if (barEl) {
          const pct = (bot.hp / bot.maxHp) * 100;
          barEl.style.width = `${Math.max(0, pct)}%`;
        }
      } else {
        hudEl.style.display = 'none';
      }
    });

    // 2. Damage Float texts
    data.damageFloats.forEach((f) => {
      const floatEl = document.getElementById(`float-${f.id}`);
      if (!floatEl) return;

      const animatedPos = f.worldPos.clone();
      animatedPos.y += f.age * 1.5; // Float upwards
      animatedPos.project(camera);

      const inFront = animatedPos.z <= 1.0;
      const screenX = (animatedPos.x * 0.5 + 0.5) * width;
      const screenY = (-(animatedPos.y * 0.5) + 0.5) * height;

      if (inFront && screenX > 0 && screenX < width && screenY > 0 && screenY < height) {
        floatEl.style.display = 'block';
        floatEl.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;
        floatEl.style.opacity = (1.0 - f.age / 0.8).toString();
      } else {
        floatEl.style.display = 'none';
      }
    });
  };

  // Primary animation ticking frames
  useEffect(() => {
    if (setupMode) return;
    let animId: number;
    const data = dataRef.current;
    let lastTime = performance.now();

    const frameTicker = (timeMs: number) => {
      animId = requestAnimationFrame(frameTicker);
      
      const camera = data.camera;
      const renderer = data.renderer;
      const scene = data.scene;

      if (!camera || !renderer || !scene) return;

      // Skip scene updates if paused, but keep rendering the static scene image behind panel!
      if (data.isPaused || gameState !== 'playing') {
        renderer.render(scene, camera);
        return;
      }

      const delta = Math.min((timeMs - lastTime) / 1000, 0.1); // Clamp extreme frames
      lastTime = timeMs;

      const moveSpeed = 5.6 * delta; // standard movement velocity
      const rotateSpeed = 2.4 * delta;

      // Controls Checks
      const isW = data.keys['w'] || data.keys['arrowup'];
      const isS = data.keys['s'] || data.keys['arrowdown'];
      const isA = data.keys['a'];
      const isD = data.keys['d'];

      // Supplementary look keys fallback
      const isLeftArrow = data.keys['arrowleft'];
      const isRightArrow = data.keys['arrowright'];

      if (isLeftArrow) data.playerYaw -= rotateSpeed; // looking left decreases yaw
      if (isRightArrow) data.playerYaw += rotateSpeed; // looking right increases yaw

      let dx = 0;
      let dz = 0;

      if (isW) {
        dx += Math.cos(data.playerYaw) * moveSpeed;
        dz += Math.sin(data.playerYaw) * moveSpeed;
      }
      if (isS) {
        dx -= Math.cos(data.playerYaw) * moveSpeed;
        dz -= Math.sin(data.playerYaw) * moveSpeed;
      }
      if (isA) {
        // Strafe Left (-PI/2)
        dx += Math.cos(data.playerYaw - Math.PI / 2) * moveSpeed;
        dz += Math.sin(data.playerYaw - Math.PI / 2) * moveSpeed;
      }
      if (isD) {
        // Strafe Right (+PI/2)
        dx += Math.cos(data.playerYaw + Math.PI / 2) * moveSpeed;
        dz += Math.sin(data.playerYaw + Math.PI / 2) * moveSpeed;
      }

      // Physics Sliding Collision checks
      const candidateX = data.playerX + dx;
      const candidateZ = data.playerZ + dz;

      if (!checkPlayerCollision(candidateX, data.playerZ)) {
        data.playerX = candidateX;
      }
      if (!checkPlayerCollision(data.playerX, candidateZ)) {
        data.playerZ = candidateZ;
      }

      // Restrict to sandbox frame bounds
      data.playerX = Math.max(1, Math.min(GRID_SIZE * CELL_SCALE - 1, data.playerX));
      data.playerZ = Math.max(1, Math.min(GRID_SIZE * CELL_SCALE - 1, data.playerZ));

      camera.position.set(data.playerX, 1.6, data.playerZ);

      // Standard Eye vectors
      const targetVec = new THREE.Vector3();
      targetVec.set(
        data.playerX + Math.cos(data.playerYaw) * Math.cos(data.playerPitch),
        1.6 + Math.sin(data.playerPitch),
        data.playerZ + Math.sin(data.playerYaw) * Math.cos(data.playerPitch)
      );
      camera.lookAt(targetVec);

      // Weapon reload routines
      if (data.isReloading) {
        data.reloadTimer -= delta;
        if (data.reloadTimer <= 0) {
          data.isReloading = false;
          setIsReloading(false);
          const deficit = 30 - data.ammo;
          const transfer = Math.min(deficit, data.reserveAmmo);
          data.ammo += transfer;
          data.reserveAmmo -= transfer;
          setAmmo(data.ammo);
          setReserveAmmo(data.reserveAmmo);
        }
      }

      if (data.recoilTimer > 0) {
        data.recoilTimer = Math.max(0, data.recoilTimer - delta * 30.0);
      }

      // Shoot trigger
      if (data.keys['shoot_primary']) {
        handleShootPrimaryWeapon();
      }

      // Bullet tracer decay logic
      const now = Date.now();
      for (let i = data.tracers.length - 1; i >= 0; i--) {
        const tracer = data.tracers[i];
        const age = now - tracer.birth;
        if (age >= tracer.duration) {
          scene.remove(tracer.mesh);
          tracer.mesh.geometry.dispose();
          (tracer.mesh.material as THREE.Material).dispose();
          data.tracers.splice(i, 1);
        } else {
          const pct = age / tracer.duration;
          (tracer.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1.0 - pct);
        }
      }

      // Muzzle glow decay
      if (data.muzzleFlash && data.muzzleLight) {
        const mFlashMat = data.muzzleFlash.material as THREE.MeshBasicMaterial;
        mFlashMat.opacity = Math.max(0.0, mFlashMat.opacity - delta * 15.0);
        data.muzzleLight.intensity = Math.max(0, data.muzzleLight.intensity - delta * 15.0);
      }

      // Gravity spark particles decay
      for (let i = data.sparks.length - 1; i >= 0; i--) {
        const spark = data.sparks[i];
        const age = now - spark.birth;
        if (age >= spark.life) {
          scene.remove(spark.mesh);
          spark.mesh.geometry.dispose();
          (spark.mesh.material as THREE.Material).dispose();
          data.sparks.splice(i, 1);
        } else {
          spark.vy -= 9.8 * delta;
          spark.mesh.position.x += spark.vx * delta;
          spark.mesh.position.y += spark.vy * delta;
          spark.mesh.position.z += spark.vz * delta;

          const pct = age / spark.life;
          (spark.mesh.material as THREE.MeshBasicMaterial).opacity = 1.0 - pct;
        }
      }

      // Floating damage texts decay timer check
      const remainingFloats = data.damageFloats.filter(f => {
        f.age += delta;
        return f.age < 0.8;
      });
      if (remainingFloats.length !== data.damageFloats.length) {
        data.damageFloats = remainingFloats;
        // Sync React state
        setFloats(remainingFloats.map(f => ({ id: f.id, text: f.text })));
      } else {
        data.damageFloats = remainingFloats;
      }

      // Gun bobbing/sway relative to camera viewport
      if (data.playerGunGroup) {
        const speedFactor = (isW || isS || isA || isD) ? 1.0 : 0.0;
        const swayTime = timeMs * 0.008;
        const bobX = Math.cos(swayTime) * 0.005 * speedFactor;
        const bobY = Math.sin(swayTime * 2.0) * 0.006 * speedFactor;

        const pivotOffset = new THREE.Vector3(0.18 + bobX, -0.25 + bobY, -0.4);
        if (data.recoilTimer > 0) {
          pivotOffset.z += data.recoilTimer * 0.015;
          pivotOffset.y += data.recoilTimer * 0.008;
        }
        
        pivotOffset.applyQuaternion(camera.quaternion);
        data.playerGunGroup.position.copy(camera.position).add(pivotOffset);
        data.playerGunGroup.quaternion.copy(camera.quaternion);
      }

      // Intelligence Bot Decision-making
      data.bots.forEach((bot) => {
        if (bot.isDead) return;

        bot.walkAnimTime += delta;

        // Visual flash overlay timer decay
        if (bot.flashTimer > 0) {
          bot.flashTimer -= delta;
          if (bot.flashTimer <= 0) {
            bot.stickMat.emissive.setHex(0x000000); // clear glow
          }
        }

        // Recoil tilt rotation decay
        if (bot.hitRecoilTimer > 0) {
          bot.hitRecoilTimer -= delta;
          // Apply slight backward hit kick torque
          bot.meshGroup.rotation.x = Math.sin(bot.hitRecoilTimer * 12) * 0.25;
        } else {
          bot.meshGroup.rotation.x = 0;
        }

        const dx = data.playerX - bot.x;
        const dz = data.playerZ - bot.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Select targeting objectives: Solo vs Team
        let botTargetX = data.playerX;
        let botTargetZ = data.playerZ;
        let botTargetHp = data.playerHp;
        let isPlayerTarget = true;
        let targetBot: Bot3D | null = null;

        if (bot.team === 'red') {
          // Red targets player or nearest Blue teammate
          let nearestBlue: Bot3D | null = null;
          let minBlueDist = Infinity;
          data.bots.forEach(other => {
            if (other.team === 'blue' && !other.isDead) {
              const dxO = other.x - bot.x;
              const dzO = other.z - bot.z;
              const distO = Math.sqrt(dxO * dxO + dzO * dzO);
              if (distO < minBlueDist) {
                minBlueDist = distO;
                nearestBlue = other;
              }
            }
          });

          if (nearestBlue && minBlueDist < dist) {
            botTargetX = (nearestBlue as Bot3D).x;
            botTargetZ = (nearestBlue as Bot3D).z;
            botTargetHp = (nearestBlue as Bot3D).hp;
            isPlayerTarget = false;
            targetBot = nearestBlue;
          }
        } else {
          // Blue targets nearest Red enemy
          let nearestRed: Bot3D | null = null;
          let minRedDist = Infinity;
          data.bots.forEach(other => {
            if (other.team === 'red' && !other.isDead) {
              const dxO = other.x - bot.x;
              const dzO = other.z - bot.z;
              const distO = Math.sqrt(dxO * dxO + dzO * dzO);
              if (distO < minRedDist) {
                minRedDist = distO;
                nearestRed = other;
              }
            }
          });

          if (nearestRed) {
            botTargetX = (nearestRed as Bot3D).x;
            botTargetZ = (nearestRed as Bot3D).z;
            botTargetHp = (nearestRed as Bot3D).hp;
            isPlayerTarget = false;
            targetBot = nearestRed;
          } else {
            bot.state = 'wandering';
          }
        }

        // Sight checks
        const botEye = new THREE.Vector3(bot.x, 1.45, bot.z);
        const targetEye = new THREE.Vector3(botTargetX, isPlayerTarget ? 1.6 : 1.45, botTargetZ);
        const rayDir = new THREE.Vector3().subVectors(targetEye, botEye);
        const targetDistance = rayDir.length();
        rayDir.normalize();

        const losRay = new THREE.Raycaster(botEye, rayDir, 0, targetDistance);
        const obstructions = losRay.intersectObjects(data.wallMeshes, true);
        const hasLOS = obstructions.length === 0 && targetDistance < 22;

        // Speeds based on difficulty choosing
        const chaseSpeed = difficulty === 'easy' ? 1.5 : difficulty === 'hard' ? 3.3 : 2.4;
        const wanderSpeed = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 2.1 : 1.5;
        const botBaseSpeed = (bot.state === 'aiming') ? chaseSpeed : wanderSpeed;

        const maxShootCooldown = difficulty === 'easy' ? 1.9 : difficulty === 'hard' ? 0.85 : 1.35;

        // Stuck Detection System
        const distMoved = Math.sqrt(Math.pow(bot.x - bot.prevX, 2) + Math.pow(bot.z - bot.prevZ, 2));
        
        // Every 1.2s, evaluate if stuck
        if (Math.abs(bot.walkAnimTime % 1.2) < delta) {
          if (distMoved < 0.15 && !bot.isStuckMode) {
            bot.isStuckMode = true;
            bot.stuckYaw = bot.yaw + Math.PI * 0.8 + (Math.random() - 0.5) * Math.PI * 0.4;
            bot.stuckDuration = 1.4; // Redirect path for 1.4 seconds
          }
          bot.prevX = bot.x;
          bot.prevZ = bot.z;
        }

        let stepX = 0;
        let stepZ = 0;

        if (bot.isStuckMode) {
          bot.stuckDuration -= delta;
          if (bot.stuckDuration <= 0) {
            bot.isStuckMode = false;
          } else {
            bot.yaw = bot.stuckYaw;
            stepX = Math.sin(bot.stuckYaw) * botBaseSpeed * delta;
            stepZ = Math.cos(bot.stuckYaw) * botBaseSpeed * delta;
          }
        } else if (hasLOS && bot.state !== 'cooldown') {
          bot.state = 'aiming';
          bot.yaw = Math.atan2(dx, dz);
          
          if (dist > 3.0) {
            stepX = Math.sin(bot.yaw) * botBaseSpeed * delta;
            stepZ = Math.cos(bot.yaw) * botBaseSpeed * delta;
          }
        } else {
          // Patrol wander
          stepX = Math.sin(bot.yaw) * botBaseSpeed * delta;
          stepZ = Math.cos(bot.yaw) * botBaseSpeed * delta;
        }

        // Apply obstacle avoidance steps
        if (stepX !== 0 || stepZ !== 0) {
          const targetX = bot.x + stepX;
          const targetZ = bot.z + stepZ;
          const botColRadius = 0.55;

          if (!checkBotCollision(targetX, targetZ, botColRadius)) {
            bot.x = targetX;
            bot.z = targetZ;
          } else {
            // Forward check blocked, try sidesteps left/right
            let avoidanceWorked = false;
            
            const leftAngle = bot.yaw - Math.PI / 2;
            const tryL_X = bot.x + Math.sin(leftAngle) * botBaseSpeed * delta;
            const tryL_Z = bot.z + Math.cos(leftAngle) * botBaseSpeed * delta;
            if (!checkBotCollision(tryL_X, tryL_Z, botColRadius)) {
              bot.x = tryL_X;
              bot.z = tryL_Z;
              bot.yaw = leftAngle;
              avoidanceWorked = true;
            } else {
              const rightAngle = bot.yaw + Math.PI / 2;
              const tryR_X = bot.x + Math.sin(rightAngle) * botBaseSpeed * delta;
              const tryR_Z = bot.z + Math.cos(rightAngle) * botBaseSpeed * delta;
              if (!checkBotCollision(tryR_X, tryR_Z, botColRadius)) {
                bot.x = tryR_X;
                bot.z = tryR_Z;
                bot.yaw = rightAngle;
                avoidanceWorked = true;
              }
            }

            if (!avoidanceWorked) {
              // Both paths blocked: choose new random yaw
              bot.yaw = bot.yaw + Math.PI * 0.75 + Math.random() * Math.PI * 0.5;
            }
          }

          bot.meshGroup.position.set(bot.x, 0, bot.z);
          bot.meshGroup.rotation.y = bot.yaw;
        }

        if (hasLOS) {
          bot.shootTimer += delta;
          if (bot.shootTimer >= maxShootCooldown) {
            bot.shootTimer = 0.0;

            const botMuzzle = new THREE.Vector3(0.1, 1.15, 0.4);
            botMuzzle.applyMatrix4(bot.meshGroup.matrixWorld);

            // Difficulty accuracy multiplier
            const aimOffset = difficulty === 'easy' ? 0.45 : difficulty === 'hard' ? 0.08 : 0.25;
            const scatterTarget = targetEye.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * aimOffset,
              (Math.random() - 0.5) * aimOffset,
              (Math.random() - 0.5) * aimOffset
            ));

            drawBulletTracer(botMuzzle, scatterTarget, bot.team === 'red' ? 0xef4444 : 0x3b82f6);

            const hitOdds = difficulty === 'easy' ? 0.35 : difficulty === 'hard' ? 0.75 : 0.55;
            if (Math.random() < hitOdds) {
              if (isPlayerTarget) {
                const botDamageToPlayer = difficulty === 'easy' ? 35 : difficulty === 'hard' ? 85 : 60;
                data.playerHp = Math.max(0, data.playerHp - botDamageToPlayer);
                setPlayerHp(data.playerHp);
                playSynthSfx('damage');

                data.vignetteIntensity = 0.85;

                if (data.playerHp <= 0) {
                  setGameState('gameover');
                }
              } else if (targetBot) {
                const targetBotRef = targetBot as Bot3D;
                targetBotRef.hp = Math.max(0, targetBotRef.hp - 150);
                targetBotRef.flashTimer = 0.12;
                targetBotRef.hitRecoilTimer = 0.15;
                targetBotRef.stickMat.emissive.setHex(0xffffff);

                spawnTargetFeedbackParticles(scatterTarget, 0xef4444);

                if (targetBotRef.hp <= 0) {
                  targetBotRef.isDead = true;
                  targetBotRef.meshGroup.rotation.z = Math.PI / 2;
                  targetBotRef.meshGroup.position.y = 0.18;
                  playSynthSfx('kill');

                  checkMatchResult();
                }
              }
            }
          }

          // Arms point forward on target acquisition
          bot.leftArm.rotation.x = -Math.PI / 2;
          bot.rightArm.rotation.x = -Math.PI / 2;
        } else {
          bot.shootTimer = 0;

          // Standard walk kinematics: Swing arms & legs
          const swingSpeed = 8.0;
          const walkFactor = Math.sin(bot.walkAnimTime * swingSpeed);
          
          bot.leftLeg.rotation.x = walkFactor * 0.72; // swing legs clearly
          bot.rightLeg.rotation.x = -walkFactor * 0.72;

          bot.leftArm.rotation.x = -walkFactor * 0.35; // arms move slightly
          bot.rightArm.rotation.x = walkFactor * 0.35;

          // Body bobbing up and down
          bot.meshGroup.position.y = Math.abs(Math.sin(bot.walkAnimTime * swingSpeed)) * 0.1;
        }
      });

      // Decay player damage screen vignette
      if (data.vignetteIntensity > 0) {
        data.vignetteIntensity = Math.max(0, data.vignetteIntensity - delta * 2.5);
        const vignEl = document.getElementById('damage-vignette-overlay');
        if (vignEl) {
          vignEl.style.opacity = `${data.vignetteIntensity}`;
        }
      }

      // Update screen projections
      const containerDiv = mountRef.current;
      const width = containerDiv ? containerDiv.clientWidth : 640;
      const height = containerDiv ? containerDiv.clientHeight : 400;
      projectLabelsAndFloats(camera, width, height);

      // WebGL Render
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(frameTicker);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [setupMode, gameState]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="w-full flex flex-col gap-4 relative text-slate-100 font-sans" 
      id="shooter-root-container"
      style={{ height: 'calc(100vh - 80px)', minHeight: '520px' }}
    >
      {/* 1. SETUP MATCH SCREEN */}
      {setupMode ? (
        <div className="flex-1 rounded-2xl overflow-y-auto bg-gradient-to-br from-[#0c0a12] via-[#08060c] to-[#040407] border border-white/10 shadow-2xl flex flex-col items-center justify-center p-6 md:p-12 relative select-none">
          
          {/* Neon Grid Decorative Elements */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none opacity-80">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono tracking-widest uppercase">
              <Sparkles size={11} className="animate-pulse" /> SYSTEM ACTIVE
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mt-3 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-indigo-500 uppercase italic">
              TACTICAL ARENA 3D
            </h1>
            <p className="text-zinc-400 font-mono text-xs uppercase tracking-wider mt-1 border-b border-white/5 pb-2">FIRST PERSON TRAINING SIMULATOR</p>
          </div>

          <div className="w-full max-w-2xl bg-slate-950/80 border border-white/10 p-6 md:p-8 rounded-3xl mt-44 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row gap-8">
            {/* Setting Side Controls */}
            <div className="flex-1 flex flex-col gap-5 text-left">
              <h2 className="text-xs font-mono font-bold tracking-widest text-[#22d3ee] border-b border-white/15 pb-2 uppercase flex items-center gap-2">
                <Sliders size={13} /> COMBAT SETTINGS
              </h2>

              {/* Game Mode */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Game Mode</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setGameMode('solo')}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${gameMode === 'solo' ? 'bg-emerald-600/15 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    SOLO DEATHMATCH
                  </button>
                  <button 
                    onClick={() => setGameMode('team')}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${gameMode === 'team' ? 'bg-[#3b82f6]/15 border-[#3b82f6] text-blue-300' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    TEAM BATTLE
                  </button>
                </div>
              </div>

              {/* Difficulty */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Difficulty</label>
                <div className="flex gap-1.5">
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <button 
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${difficulty === d ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Count */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Total Bot Count</label>
                <div className="flex gap-1">
                  {([2, 4, 6, 8, 12] as const).map(count => (
                    <button 
                      key={count}
                      onClick={() => setBotCount(count)}
                      className={`flex-1 py-1.5 text-xs font-mono rounded-lg border transition-all cursor-pointer ${botCount === count ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mouse & Sound Side Controls */}
            <div className="flex-1 flex flex-col gap-5 text-left">
              <h2 className="text-xs font-mono font-bold tracking-widest text-[#22d3ee] border-b border-white/15 pb-2 uppercase flex items-center gap-2">
                🎮 PERIPHERAL SETTINGS
              </h2>

              {/* Sensitivity */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Mouse Sensitivity</label>
                <div className="flex gap-1.5">
                  {(['low', 'normal', 'high'] as const).map(sens => (
                    <button 
                      key={sens}
                      onClick={() => setMouseSensitivity(sens)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${mouseSensitivity === sens ? 'bg-amber-600/15 border-amber-500 text-amber-300 font-black' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      {sens}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invert Mouse Y */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Invert Mouse Y Axis</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setInvertMouseY(false)}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${!invertMouseY ? 'bg-emerald-600/15 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 text-zinc-400'}`}
                  >
                    OFF (NORMAL)
                  </button>
                  <button 
                    onClick={() => setInvertMouseY(true)}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${invertMouseY ? 'bg-red-600/15 border-red-500 text-red-300' : 'bg-white/5 border-white/5 text-zinc-400'}`}
                  >
                    ON (INVERTED)
                  </button>
                </div>
              </div>

              {/* Sound Option Toggle */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Synthesizer Sounds</label>
                <button 
                  onClick={toggleSound}
                  className={`w-full py-1.5 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-2 ${soundOn ? 'bg-teal-600/15 border-teal-500 text-teal-300' : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-500'}`}
                >
                  {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  SOUNDS {soundOn ? 'ENABLED' : 'MUTED'}
                </button>
              </div>
            </div>
          </div>

          {/* Start Actions */}
          <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-3 mt-6">
            <button 
              onClick={handleStartMatch}
              className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl cursor-pointer shadow-[0_0_35px_rgba(16,185,129,0.3)] transition-transform active:scale-98 flex items-center justify-center gap-2"
            >
              <Play size={13} fill="currentColor" /> START CORE SIMULATOR
            </button>
            <button 
              onClick={onBackToMenu}
              className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-2xl cursor-pointer transition-all border border-zinc-800"
            >
              BACK TO HUB
            </button>
          </div>
        </div>
      ) : (
        /* 2. THREE.JS GAMEPLAY PORT MOUNT BOX */
        <div 
          ref={mountRef}
          className="relative flex-1 rounded-2xl overflow-hidden bg-[#07050d] border border-white/10 shadow-2xl flex items-center justify-center select-none"
          id="battle-ground-canvas-box"
        >
          <canvas 
            ref={canvasRef} 
            className="block cursor-crosshair w-full h-full"
          />

          {/* Central Tactical Reticle / Crosshair */}
          <div className="absolute pointer-events-none z-20 flex items-center justify-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className={`relative transition-all duration-75 ${hitmarkerFlash ? 'scale-125' : 'scale-100'}`}>
              <Crosshair 
                size={26} 
                className={`transition-colors duration-100 ${hitmarkerFlash ? 'text-rose-500 font-bold' : 'text-emerald-400'}`} 
              />
              {/* Hitmarker ticks indicator */}
              {hitmarkerFlash && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-rose-500 rotate-45 scale-110 opacity-90 animate-ping absolute" />
                </div>
              )}
            </div>
          </div>

          {/* Tactical Red Vignette Damage Flasher */}
          <div 
            id="damage-vignette-overlay"
            className="absolute inset-0 pointer-events-none z-10 opacity-0 transition-opacity duration-75 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(220,38,38,0.3)_75%,rgba(153,27,27,0.75)_100%)] border border-red-500/20"
          />

          {/* Floating Damage pop-ups */}
          {floats.map((f) => (
            <div 
              key={f.id}
              id={`float-${f.id}`}
              className="absolute pointer-events-none text-rose-400 font-black text-sm drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] z-30 font-mono select-none"
              style={{ display: 'none' }}
            >
              {f.text}
            </div>
          ))}

          {/* Projected stickmen metadata Health bars (Created dynamically based on count) */}
          {gameBots.map((bot) => (
            <div 
              key={bot.id}
              id={`bot-hud-${bot.id}`}
              className={`absolute pointer-events-none z-25 font-mono text-[9px] bg-slate-950/90 px-2 py-1 border ${bot.team === 'red' ? 'border-red-500/30' : 'border-blue-500/30'} rounded shadow-md hidden leading-none`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`${bot.team === 'red' ? 'text-rose-400' : 'text-sky-400'} font-extrabold uppercase tracking-wide`}>
                  {bot.name}
                </span>
                <span className="text-[7.5px] text-zinc-500">
                  {bot.team === 'red' ? 'HOSTILE' : 'ALLIED'}
                </span>
              </div>
              <div className="w-14 h-1.5 bg-black/50 border border-white/10 rounded overflow-hidden mt-1 text-left inline-block align-middle">
                <div 
                  id={`bot-bar-${bot.id}`} 
                  className={`h-full ${bot.team === 'red' ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-100`} 
                  style={{ width: '100%' }} 
                />
              </div>
            </div>
          ))}

          {/* HUD Statistics, Objectives, and Active Target Tally */}
          <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none font-mono text-left" id="battle-stats-overlay">
            
            {/* Compass Map Card */}
            <div className="bg-slate-950/90 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3.5 shadow-lg backdrop-blur-md">
              <Compass size={14} className="text-[#3b82f6] animate-spin" style={{ animationDuration: '10s' }} />
              <div className="flex flex-col">
                <span className="text-[7.5px] text-zinc-400 uppercase tracking-widest leading-none">TRAINING YARD</span>
                <span className="text-xs text-indigo-300 font-bold mt-0.5 uppercase tracking-wide">
                  {gameMode === 'solo' ? 'SOLO DM' : 'TEAM BATTLE'}
                </span>
              </div>
            </div>

            {/* Scoreboard block */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-950/95 border border-white/15 px-4.5 py-1.5 rounded-xl flex items-center gap-4.5 shadow-xl backdrop-blur-md">
                <span className="text-emerald-400 font-black text-[10px] tracking-wider">KILLS <b className="text-white text-sm ml-1">{kills}</b></span>
                <span className="text-white font-black px-2.8 py-0.8 bg-white/10 rounded-lg text-xs leading-none">{formatTimer(gameTime)}</span>
                <span className="text-red-400 font-black text-[10px] tracking-wider">
                  <b className="text-white text-sm mr-1">{activeEnemiesCount}</b> ENEMY
                </span>
              </div>
              <span className="bg-slate-900/80 text-[8px] text-zinc-400 uppercase tracking-widest px-2.5 py-0.5 mt-1 rounded-full border border-white/5 font-extrabold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> OBJECTIVE: ELIMINATE HOSTILE FORCE
              </span>
            </div>

            {/* Feed Stream */}
            <div className="bg-slate-950/90 border border-white/10 px-3.5 py-2 rounded-xl shadow-lg backdrop-blur-md max-w-[150px] leading-tight text-[8px] text-zinc-400 uppercase">
              <div className="text-[9px] text-white font-bold border-b border-white/10 pb-0.8 mb-0.8 tracking-widest">FEED</div>
              <div className="text-sky-300">• {gameMode === 'solo' ? 'PLAYER DEPLOYED' : 'BLUE SQUAD DEPLOYED'}</div>
              <div className="text-purple-300">• DIFFICULTY: {difficulty}</div>
            </div>
          </div>

          {/* Pause Button (Clicking anywhere also captures, but this unlocks and triggers Pause Menu) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePause();
            }}
            className="absolute top-16 right-4 z-20 px-3 py-1.5 bg-slate-950/95 hover:bg-zinc-900 text-zinc-300 font-mono text-[9px] rounded-lg border border-white/10 pointer-events-auto cursor-pointer font-bold uppercase transition-transform active:scale-95"
          >
            || PAUSE SIMULATION
          </button>

          {/* Dynamic Controller Instructions */}
          {showControls && !pointerLocked && (
            <div className="absolute left-4 top-20 z-20 p-2.5 bg-slate-950/85 rounded-xl text-left text-[8.5px] font-mono leading-relaxed text-zinc-300 pointer-events-none select-none border border-white/10 max-w-[170px] shadow-lg backdrop-blur-md">
              <div className="text-white font-black mb-1.5 border-b border-white/10 pb-1 flex items-center justify-between gap-1.5 pointer-events-auto">
                <span className="flex items-center gap-1.5"><Info size={11} className="text-emerald-400" /> CONTROLS</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowControls(false);
                  }}
                  className="p-0.5 text-zinc-500 hover:text-white cursor-pointer"
                >
                  [X]
                </button>
              </div>
              <div className="flex justify-between gap-2.5"><span>W / A / S / D:</span><span className="text-emerald-300">Move</span></div>
              <div className="flex justify-between gap-2.5"><span>LEFT / RIGHT:</span><span className="text-emerald-300">Turn Cam</span></div>
              <div className="flex justify-between gap-2.5"><span>MOUSE LOOK:</span><span className="text-emerald-300">Pitch/Yaw</span></div>
              <div className="flex justify-between gap-2.5"><span>LEFT CLICK:</span><span className="text-cyan-400 font-bold">Fire M4A1</span></div>
              <div className="flex justify-between gap-2.5"><span>R KEY:</span><span className="text-amber-400 font-bold">Reload</span></div>
              <p className="text-[7.5px] text-purple-400 leading-normal mt-1.5 uppercase border-t border-white/10 pt-1">click screen to lock cursor and shoot</p>
            </div>
          )}

          {/* Bottom Vitallink indicator HUD */}
          <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-between items-end pointer-events-none font-mono" id="battle-vitals-overlay">
            <div className="bg-slate-950/95 border border-white/15 p-3 rounded-xl flex items-center gap-3.5 shadow-lg backdrop-blur-md">
              <div className="p-2 bg-emerald-500/15 rounded-lg text-emerald-400">
                <Heart size={20} fill="currentColor" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[7.5px] uppercase text-zinc-400 tracking-wider">Player Vital Link</span>
                <span className="text-2xl font-black text-emerald-400 leading-none mt-1">{playerHp} <span className="text-[10px] text-zinc-500 font-normal">/ 1000 HP</span></span>
                <div className="w-32 h-1.5 bg-white/15 rounded-full overflow-hidden mt-1.5 text-left">
                  <div className="h-full bg-emerald-400 transition-all duration-150" style={{ width: `${(playerHp / 1000) * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-slate-950/95 border border-white/15 p-3 rounded-xl flex items-center gap-3.5 shadow-lg backdrop-blur-md">
              <div className="p-2 bg-amber-500/15 rounded-lg text-amber-400">
                <Zap size={20} />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[7.5px] uppercase text-zinc-400 tracking-wider">M4A1 Assault Rifle</span>
                <span className="text-2xl font-black text-amber-300 leading-none mt-1">
                  {isReloading ? "RELOAD" : ammo} <span className="text-[10px] text-zinc-500 font-normal">/ {reserveAmmo}</span>
                </span>
                <div className="text-[7px] uppercase font-bold tracking-widest text-[#22d3ee] mt-1.5">AUTOMATIC AR-V</div>
              </div>
            </div>
          </div>

          {/* 3. CENTERED TRANSLUCENT PAUSE MENU */}
          {isPaused && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md" id="pause-overlay">
              <div className="w-full max-w-md bg-zinc-950/95 border border-white/10 p-6 md:p-8 rounded-2xl flex flex-col gap-5 shadow-2xl relative text-center">
                
                {/* Header */}
                <div className="text-left border-b border-white/10 pb-3">
                  <h3 className="text-[#3b82f6] text-[10px] font-mono tracking-widest uppercase">TACTICAL SIMULATOR</h3>
                  <h2 className="text-xl font-black uppercase text-white mt-1">SYSTEM PAUSED</h2>
                </div>

                {/* Configurations Toggles inside Pause */}
                <div className="flex flex-col gap-4 text-left">
                  {/* Sound on/off */}
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-xs font-mono text-zinc-300 uppercase">Acoustic Feedback</span>
                    <button 
                      onClick={toggleSound}
                      className={`px-4 py-1.5 text-[10px] uppercase font-bold rounded-md border cursor-pointer transition-all ${soundOn ? 'bg-teal-600/15 border-teal-500 text-teal-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}
                    >
                      {soundOn ? <Volume2 size={11} className="inline mr-1" /> : <VolumeX size={11} className="inline mr-1" />}
                      {soundOn ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Mouse Sensitivity */}
                  <div className="flex flex-col gap-1.5 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Mouse Sensitivity</span>
                    <div className="flex gap-1.5">
                      {(['low', 'normal', 'high'] as const).map(sens => (
                        <button 
                          key={sens}
                          onClick={() => setMouseSensitivity(sens)}
                          className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-all cursor-pointer ${mouseSensitivity === sens ? 'bg-amber-600/25 border-amber-500 text-amber-300 font-extrabold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                          {sens}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Invert Mouse Y */}
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-xs font-mono text-zinc-300 uppercase">Invert Mouse Y Axis</span>
                    <button 
                      onClick={() => setInvertMouseY(!invertMouseY)}
                      className={`px-4 py-1.5 text-[10px] uppercase font-bold rounded-md border cursor-pointer transition-all ${invertMouseY ? 'bg-red-600/20 border-red-500 text-red-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                    >
                      {invertMouseY ? 'INVERTED' : 'NORMAL'}
                    </button>
                  </div>

                  {/* Graphics Quality */}
                  <div className="flex flex-col gap-1.5 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Graphics Quality</span>
                    <div className="flex gap-1.5">
                      {(['low', 'medium', 'high'] as const).map(quality => (
                        <button 
                          key={quality}
                          onClick={() => setGraphicsQuality(quality)}
                          className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-all cursor-pointer ${graphicsQuality === quality ? 'bg-indigo-600/25 border-indigo-500 text-indigo-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                          {quality}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show Hide Controls Switch */}
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-xs font-mono text-zinc-300 uppercase">Show UI Instruction HUD</span>
                    <button 
                      onClick={() => setShowControls(!showControls)}
                      className={`px-4 py-1.5 text-[10px] uppercase font-bold rounded-md border cursor-pointer transition-all ${showControls ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                    >
                      {showControls ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex flex-col gap-2 mt-2">
                  <button 
                    onClick={() => {
                      setIsPaused(false);
                      setTimeout(() => {
                        canvasRef.current?.requestPointerLock();
                      }, 100);
                    }}
                    className="w-full py-3 bg-[#3b82f6] hover:bg-blue-500 text-white font-black uppercase text-xs rounded-xl tracking-widest cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-transform active:scale-98"
                  >
                    RESUME SIMULATION
                  </button>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleInitiateGame}
                      className="flex-1 py-2.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 font-mono text-[9px] rounded-lg tracking-wide uppercase cursor-pointer"
                    >
                      RESTART MATCH
                    </button>
                    <button 
                      onClick={onBackToMenu}
                      className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-rose-500 font-mono text-[9px] rounded-lg border border-zinc-800 tracking-wide uppercase cursor-pointer"
                    >
                      BACK TO HUB
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. YOU DIED SCREEN LOSS MENU */}
          {gameState === 'gameover' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#0d0202]/95 backdrop-blur-md" id="game-over-overlay">
              <div className="w-full max-w-sm bg-gradient-to-b from-red-950/40 to-black/90 border border-red-500/35 p-7 md:p-9 rounded-2xl flex flex-col items-center gap-6 shadow-2xl relative text-center">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/40 rounded-full flex items-center justify-center text-red-500 text-3xl drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse">
                  💀
                </div>

                <div>
                  <h2 className="text-3xl font-black tracking-tighter text-red-500 uppercase italic">YOU DIED. START AGAIN.</h2>
                  <p className="text-[9.5px] text-zinc-400 font-mono mt-1.5 uppercase tracking-wider">A red stickman bot eliminated you in the training yard corridor.</p>
                </div>

                <div className="bg-black/60 p-4 rounded-xl border border-white/5 w-full font-mono text-xs flex justify-around shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase text-zinc-500 tracking-wider font-extrabold pb-0.5">Your Kills</span>
                    <span className="text-xl font-bold text-red-400">{kills}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase text-zinc-500 tracking-wider font-extrabold pb-0.5">Remaining Enemies</span>
                    <span className="text-xl font-bold text-white">{activeEnemiesCount}</span>
                  </div>
                </div>

                <button 
                  onClick={handleInitiateGame}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10px] rounded-xl tracking-widest cursor-pointer shadow-[0_0_25px_rgba(239,68,68,0.45)] flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <RotateCcw size={13} />
                  RESTART MATCH
                </button>

                <button 
                  onClick={onBackToMenu}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold uppercase text-[9px] rounded-lg tracking-wider cursor-pointer transition-all border border-white/5"
                >
                  BACK TO HUB
                </button>
              </div>
            </div>
          )}

          {/* 5. VICTORY MATCH WIN MENU */}
          {gameState === 'victory' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#020d05]/95 backdrop-blur-md" id="victory-overlay">
              <div className="w-full max-w-sm bg-gradient-to-b from-emerald-950/40 to-black/90 border border-emerald-500/35 p-7 md:p-9 rounded-2xl flex flex-col items-center gap-6 shadow-2xl relative text-center">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-400 text-3xl drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-bounce">
                  🏆
                </div>

                <div>
                  <h2 className="text-2xl font-black tracking-tight text-emerald-400 uppercase italic">
                    {gameMode === 'solo' ? 'VICTORY. ALL BOTS ELIMINATED.' : 'VICTORY. ENEMY FORCE ELIMINATED.'}
                  </h2>
                  <p className="text-[9.5px] text-zinc-400 font-mono mt-1.5 uppercase tracking-wider">
                    You cleared the courtyard training session successfully on {difficulty} difficulty!
                  </p>
                </div>

                <div className="bg-black/60 p-4 rounded-xl border border-white/5 w-full font-mono text-xs flex justify-around shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase text-zinc-500 tracking-wider font-extrabold pb-0.5">Total Kills</span>
                    <span className="text-xl font-bold text-emerald-400">{kills}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase text-zinc-500 tracking-wider font-extrabold pb-0.5">Time Logged</span>
                    <span className="text-xl font-bold text-white">{formatTimer(480 - gameTime)}</span>
                  </div>
                </div>

                <button 
                  onClick={handleInitiateGame}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black uppercase text-[10px] rounded-xl tracking-widest cursor-pointer shadow-[0_0_25px_rgba(16,185,129,0.45)] flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <RotateCcw size={13} />
                  PLAY AGAIN
                </button>

                <button 
                  onClick={onBackToMenu}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold uppercase text-[9px] rounded-lg tracking-wider cursor-pointer transition-all border border-white/5"
                >
                  BACK TO HUB
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Footer system active bar */}
      <div className="flex justify-between items-center bg-slate-950/10 px-4 py-2 rounded-xl text-[9px] font-mono text-zinc-500" id="shooter-engine-footer">
        <span>TACTICAL ARENA: BRICK training YARD</span>
        <span className="flex items-center gap-1.5">
          <Shield size={10} /> THREE.JS RENDERER ACTIVE - V1.2 (SENS LOOK FIX)
        </span>
      </div>

    </div>
  );
};
