/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GBA_WIDTH = 240;
export const GBA_HEIGHT = 160;
export const TILE_SIZE = 8;
export const FPS = 60;

export const COLORS = {
  BG_SKY: '#87CEEB',
  BG_SKY_DARK: '#4682B4',
  BG_MID: '#2F4F4F',
  GROUND: '#8B4513',
  GROUND_TOP: '#228B22',
  PLAYER: '#704214', // Potato Brown
  PLAYER_ACCENT: '#FF0000', // Bandana
  ENEMY_WALKER: '#00FF00',
  ENEMY_SHOOTER: '#FF0000',
  ENEMY_FLYER: '#FFFF00',
  ENEMY_RUNNER: '#0000FF',
  ENEMY_HEAVY: '#808080',
  BULLET: '#FFFFFF',
  BULLET_ENEMY: '#FF4444',
  UI_TEXT: '#FFFFFF',
  UI_BG: 'rgba(0, 0, 0, 0.7)',
  WARNING: '#FF0000',
};

export type EntityType = 'player' | 'enemy' | 'bullet' | 'boss' | 'upgrade' | 'particle' | 'crate' | 'spike' | 'heart';
export type GunType = 'pistol' | 'spread' | 'laser' | 'grenade';
export type EnemyType = 'walker' | 'shooter' | 'flyer' | 'runner' | 'heavy';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  subType?: EnemyType | GunType;
  pos: Vector2;
  vel: Vector2;
  size: Vector2;
  hp: number;
  maxHp: number;
  damage?: number;
  active: boolean;
  color?: string;
  invincibleTimer?: number;
  shootCooldown?: number;
  dashTimer?: number;
  dashCooldown?: number;
  canDoubleJump?: boolean;
  hasJumpedInAir?: boolean;
  coyoteTimer?: number;
  state?: string;
  frame?: number;
  animationTimer?: number;
  hitFlash?: number;
}

export interface PlayerStats {
  damage: number;
  fireRate: number;
  armor: number;
  jumpHeight: number;
  currentGun: GunType;
  bossesKilledTotal: number;
  highScore: number;
}

export interface GameState {
  score: number;
  combo: number;
  comboTimer: number;
  scrollX: number;
  scrollSpeed: number;
  isGameOver: boolean;
  isPaused: boolean;
  isTitle: boolean;
  player: Entity;
  playerStats: PlayerStats;
  enemies: Entity[];
  bullets: Entity[];
  enemyBullets: Entity[];
  upgrades: Entity[];
  particles: Entity[];
  items: Entity[];
  levelChunks: number[][];
  bossActive: boolean;
  boss?: Entity;
  lastEnemyType?: EnemyType;
  lastHeartScore?: number;
  lastBossScore?: number;
  cameraShake: number;
  displayScore: number;
  bufferedJump: number;
  jumpKeyWasDown: boolean;
  debug: boolean;
  seed: number;
}

export type GameAction = 'A' | 'B' | 'START' | 'SELECT' | 'DASH';

export type InputMap = Record<string, GameAction>;

export const DEFAULT_INPUT_MAP: InputMap = {
  KeyX: 'A', // Jump
  KeyZ: 'B', // Shoot
  Enter: 'START',
  ShiftLeft: 'SELECT',
  Space: 'DASH',
};
