export type Difficulty = 'easy' | 'normal' | 'hard';
export type AppTheme = 'classic' | 'neon';
export type SnakeVisualMode = 'classic' | 'neon';

export interface AppSettings {
  soundEnabled: boolean;
  theme: AppTheme;
  difficulty: Difficulty;
}

export type GameStatus = 'playable' | 'coming_soon';

export interface GameDefinition {
  id: string;
  title: string;
  description: string;
  status: GameStatus;
  color: string; // Tailwind glow / accent color class
  iconName: string;
}

export interface Position {
  x: number;
  y: number;
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

