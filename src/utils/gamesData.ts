import { GameDefinition } from '../types';

export const GAMES_DATA: GameDefinition[] = [
  {
    id: 'snake',
    title: 'Snake Classic',
    description: 'Relive the retro arcade experience. Guide the growing snake to eat food while avoiding walls and your own tail!',
    status: 'playable',
    color: 'emerald',
    iconName: 'Activity',
  },
  {
    id: 'shooter',
    title: 'Tactical 3D Shooter',
    description: 'A true 3D first-person stickman shooter. Fire an automatic M4A1 rifle with visible tracers, falling sparks, and smart AI bot tracking.',
    status: 'playable',
    color: 'rose',
    iconName: 'Crosshair',
  },
  {
    id: 'action',
    title: 'New Action Game',
    description: 'Command futuristic battlefields in a premium side-scrolling intense skirmish combat. Commencing construction.',
    status: 'coming_soon',
    color: 'zinc',
    iconName: 'Swords',
  },
  {
    id: 'rider',
    title: 'Neo Rider',
    description: 'Ride a glowing neon stunt bike across endless procedural slopes, loops, ramps, gaps, and obstacle fields at breakneck speeds.',
    status: 'playable',
    color: 'amber',
    iconName: 'Flame',
  },
  {
    id: 'parkour',
    title: 'Parkour Run',
    description: 'Choreograph high-stakes leaps, slides, and wall-runs across infinite skyscraper scaffolding fields.',
    status: 'coming_soon',
    color: 'purple',
    iconName: 'Flame',
  }
];


