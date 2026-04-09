/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GBA_WIDTH, GBA_HEIGHT, TILE_SIZE, GameState, Entity, Vector2, PlayerStats, GunType, EnemyType } from './constants';
import { audioManager } from './audio';

// Simple PRNG
export class Random {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  nextInt(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

const DEFAULT_STATS: PlayerStats = {
  damage: 1,
  fireRate: 0.8, // seconds between shots
  armor: 0,
  jumpHeight: 8.0,
  currentGun: 'pistol',
  bossesKilledTotal: 0,
  highScore: 0,
};

export const createInitialState = (seed: number, savedStats?: PlayerStats): GameState => {
  const stats = savedStats || { ...DEFAULT_STATS };
  
  const player: Entity = {
    id: 'player',
    type: 'player',
    pos: { x: 40, y: GBA_HEIGHT - 40 },
    vel: { x: 0, y: 0 },
    size: { x: 12, y: 16 },
    hp: 2 + stats.armor,
    maxHp: 2 + stats.armor,
    active: true,
    invincibleTimer: 0,
    shootCooldown: 0,
    state: 'idle',
    frame: 0,
  };

  return {
    score: 0,
    combo: 0,
    comboTimer: 0,
    scrollX: 0,
    scrollSpeed: 1.2,
    isGameOver: false,
    isPaused: false,
    isTitle: true,
    player,
    playerStats: stats,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    upgrades: [],
    particles: [],
    items: [],
    levelChunks: generateInitialChunks(seed),
    bossActive: false,
    lastHeartScore: 0,
    lastBossScore: 0,
    cameraShake: 0,
    displayScore: 0,
    bufferedJump: 0,
    jumpKeyWasDown: false,
    debug: false,
    seed,
  };
};

const generateInitialChunks = (seed: number): number[][] => {
  const rng = new Random(seed);
  const rows: number[][] = [];
  const totalWidth = 3000; 
  const height = GBA_HEIGHT / TILE_SIZE;
  const floorY = height - 2;

  for (let y = 0; y < height; y++) {
    rows[y] = new Array(totalWidth).fill(0);
  }

  let x = 0;
  let anchorY = floorY;
  const MAX_GAP = 10; // Maximum jumpable gap in tiles

  // Initial safe zone
  for (let i = 0; i < 40; i++) {
    rows[floorY][x] = 1;
    rows[floorY + 1][x] = 1;
    x++;
  }

  while (x < totalWidth - 50) {
    const roll = rng.next();
    
    if (roll < 0.4) {
      // 40% Chance: Flat ground
      const len = rng.nextInt(20, 40);
      anchorY = floorY;
      for (let i = 0; i < len && x < totalWidth; i++) {
        rows[floorY][x] = 1;
        rows[floorY + 1][x] = 1;
        x++;
      }
    } else if (roll < 0.7) {
      // 30% Chance: Multi-level platforms (staggered heights)
      const numPlats = rng.nextInt(3, 5);
      for (let p = 0; p < numPlats; p++) {
        const platLen = rng.nextInt(8, 15);
        // Max vertical delta: JumpHeight * 0.85 approx 7 tiles
        const deltaY = rng.nextInt(-5, 3); 
        let newY = anchorY + deltaY;
        newY = Math.max(6, Math.min(floorY, newY));
        
        for (let i = 0; i < platLen && x < totalWidth; i++) {
          rows[newY][x] = 1;
          x++;
        }
        anchorY = newY;
        x += Math.min(MAX_GAP, rng.nextInt(2, 5)); // Gap
      }
    } else if (roll < 0.9) {
      // 20% Chance: Large gaps
      const gapLen = Math.min(MAX_GAP, rng.nextInt(6, 10));
      x += gapLen;
      anchorY = floorY;
      const platLen = rng.nextInt(15, 25);
      for (let i = 0; i < platLen && x < totalWidth; i++) {
        rows[floorY][x] = 1;
        rows[floorY + 1][x] = 1;
        x++;
      }
    } else {
      // 10% Chance: High-altitude flyers with stepping stones
      const numSteps = rng.nextInt(4, 6);
      for (let s = 0; s < numSteps; s++) {
        const stepLen = rng.nextInt(5, 7);
        const deltaY = rng.nextInt(-6, -4); // Steep climb
        let newY = anchorY + deltaY;
        newY = Math.max(4, newY);
        
        for (let i = 0; i < stepLen && x < totalWidth; i++) {
          rows[newY][x] = 1;
          x++;
        }
        anchorY = newY;
        x += Math.min(MAX_GAP - 2, rng.nextInt(3, 6)); // Gap between steps
      }
      // Drop back to floor
      x += 4;
      anchorY = floorY;
    }
  }

  return rows;
};

export const updateGame = (state: GameState, inputs: Set<string>, deltaTime: number): GameState => {
  if (state.isGameOver || state.isPaused || state.isTitle) return state;

  const newState = { ...state };
  const { player, playerStats } = newState;

  if (inputs.has('SELECT')) {
    newState.debug = !state.debug;
    // Debounce or just toggle
  }

  // 1. Difficulty Scaling
  newState.scrollSpeed = 1.2 + (newState.score / 20000) * 1.2;
  if (newState.scrollSpeed > 2.4) newState.scrollSpeed = 2.4;

  // Score Interpolation
  if (newState.displayScore < newState.score) {
    newState.displayScore += Math.ceil((newState.score - newState.displayScore) * 0.1);
  }
  
  // 2. Auto-scroll & Camera Chasing
  let extraScroll = 0;
  const targetX = 60; // Moved slightly more to the right for better visibility
  const isDashing = player.dashTimer && player.dashTimer > 0;
  
  if (player.pos.x > targetX && !isDashing) {
    // Elastic catch-up: the further ahead the player is, the faster the camera "chases" them
    // Softened the pull-back to allow for "leaping" forward
    extraScroll = (player.pos.x - targetX) * 0.05; 
    player.pos.x -= extraScroll;
  }
  
  newState.scrollX += newState.scrollSpeed + extraScroll;
  newState.score += 1;

  // 3. Player Physics & Input
  const GRAVITY = 0.25;
  const MOVE_ACCEL = 0.4;
  const MAX_MOVE_SPEED = 2.5;
  const FRICTION = 0.85;
  const AIR_CONTROL = 0.6;
  const TERMINAL_VELOCITY = 6.0;

  const isOnGround = checkGroundCollision(player, newState);

  // Horizontal Movement Input
  if (inputs.has('LEFT')) {
    player.vel.x -= (isOnGround ? MOVE_ACCEL : MOVE_ACCEL * AIR_CONTROL);
  } else if (inputs.has('RIGHT')) {
    player.vel.x += (isOnGround ? MOVE_ACCEL : MOVE_ACCEL * AIR_CONTROL);
  } else {
    player.vel.x *= FRICTION;
  }

  // Cap horizontal speed
  if (player.vel.x > MAX_MOVE_SPEED) player.vel.x = MAX_MOVE_SPEED;
  if (player.vel.x < -MAX_MOVE_SPEED) player.vel.x = -MAX_MOVE_SPEED;

  player.pos.x += player.vel.x;

  // Hit Flash Decay
  if (player.hitFlash && player.hitFlash > 0) player.hitFlash -= 1;
  newState.enemies.forEach(e => {
    if (e.hitFlash && e.hitFlash > 0) e.hitFlash -= 1;
  });
  if (newState.boss && newState.boss.hitFlash && newState.boss.hitFlash > 0) {
    newState.boss.hitFlash -= 1;
  }

  // Dash Logic
  if (player.dashTimer && player.dashTimer > 0) {
    player.dashTimer -= 1;
    // Split dash speed: player lunges forward, but camera also speeds up to "follow"
    const dashSpeed = 4;
    const playerLunge = dashSpeed * 0.6;
    const cameraFollow = dashSpeed * 0.4;
    
    player.pos.x += playerLunge;
    newState.scrollX += cameraFollow;
    player.vel.y = 0; // Hover during dash
    
    // Dash particles (Speed Lines)
    if (player.dashTimer % 2 === 0) {
      spawnParticle(newState, player.pos.x, player.pos.y + Math.random() * player.size.y, 'dash');
    }
  } else {
    player.vel.y += GRAVITY;
    if (player.vel.y > TERMINAL_VELOCITY) player.vel.y = TERMINAL_VELOCITY;
  }

  if (player.dashCooldown && player.dashCooldown > 0) {
    player.dashCooldown -= 1;
  }

  if (inputs.has('DASH') && (!player.dashCooldown || player.dashCooldown === 0)) {
    player.dashTimer = 10;
    player.dashCooldown = 40;
    spawnParticle(newState, player.pos.x, player.pos.y + 8, 'flash');
    audioManager.playSound('dash');
  }

  // Jump Input Buffering
  const jumpPressed = inputs.has('A');
  if (jumpPressed && !state.jumpKeyWasDown) {
    newState.bufferedJump = 10; // Buffer for 10 frames
  }
  newState.jumpKeyWasDown = jumpPressed;

  // Jump Execution
  if (newState.bufferedJump > 0) {
    if (isOnGround || (player.coyoteTimer && player.coyoteTimer > 0)) {
      // First Jump (Ground or Coyote)
      player.vel.y = -playerStats.jumpHeight;
      if (inputs.has('RIGHT')) {
        player.vel.x += 1.0;
      }
      player.coyoteTimer = 0;
      newState.bufferedJump = 0;
      player.canDoubleJump = true; // Reset double jump availability
      player.state = 'jumping'; // Track jump state
      player.hasJumpedInAir = false; // Reset air jump tracker
      spawnParticle(newState, player.pos.x + player.size.x / 2, player.pos.y + player.size.y, 'dust');
      audioManager.playSound('jump');
    } else if (!player.hasJumpedInAir) {
      // First Jump in Air (e.g. walked off ledge)
      player.vel.y = -playerStats.jumpHeight;
      player.hasJumpedInAir = true;
      player.canDoubleJump = true; // Still have double jump available
      newState.bufferedJump = 0;
      spawnParticle(newState, player.pos.x + player.size.x / 2, player.pos.y + player.size.y, 'dust');
      audioManager.playSound('jump');
    } else if (player.canDoubleJump) {
      // Double Jump (In Air)
      // Reset velocity completely to ensure the jump always feels the same regardless of fall speed
      player.vel.y = -playerStats.jumpHeight * 1.1; // Make double jump slightly stronger (110%)
      
      if (inputs.has('RIGHT')) {
        player.vel.x += 1.5;
      }
      player.canDoubleJump = false; // Consume double jump
      player.state = 'double_jumping'; // Track double jump state
      newState.bufferedJump = 0;
      spawnParticle(newState, player.pos.x + player.size.x / 2, player.pos.y + player.size.y, 'flash');
      audioManager.playSound('jump');
    }
  }

  // Update Coyote Timer & Double Jump availability
  if (isOnGround) {
    player.canDoubleJump = true;
    player.hasJumpedInAir = false;
    player.coyoteTimer = 30; // Coyote Time: 30 frames (0.5s)
    player.state = 'idle';
  } else if (player.coyoteTimer && player.coyoteTimer > 0) {
    player.coyoteTimer -= 1;
  }

  if (newState.bufferedJump > 0) newState.bufferedJump -= 1;

  // Variable Jump Height: If button released while moving up, cut velocity
  // Only cut if it's a regular jump, and don't cut if we just started jumping
  if (!jumpPressed && player.vel.y < -3 && player.state !== 'double_jumping') {
    player.vel.y *= 0.6; // Less aggressive cut
  }

  // Horizontal target position (Handled by Camera Chasing above)
  if (player.pos.x < targetX && !inputs.has('LEFT') && !inputs.has('RIGHT')) {
    player.pos.x += 0.2; // Slightly faster return to target position when not moving
  }

  player.pos.y += player.vel.y;

  // Ground & Tile collision resolution (Multi-level support)
  if (player.vel.y >= 0) {
    const points = [
      { x: player.pos.x + 2, y: player.pos.y + player.size.y },
      { x: player.pos.x + player.size.x - 2, y: player.pos.y + player.size.y }
    ];
    
    let bestY = -1;
    points.forEach(p => {
      const worldX = newState.scrollX + p.x;
      const tileX = Math.floor(worldX / TILE_SIZE);
      const tileY = Math.floor(p.y / TILE_SIZE);
      
      if (tileX >= 0 && tileX < newState.levelChunks[0].length && tileY >= 0 && tileY < newState.levelChunks.length) {
        if (newState.levelChunks[tileY][tileX] === 1) {
          const top = tileY * TILE_SIZE;
          if (bestY === -1 || top < bestY) bestY = top;
        }
      }
    });

    if (bestY !== -1 && player.pos.y + player.size.y >= bestY && player.pos.y + player.size.y - player.vel.y <= bestY + 8) {
      player.pos.y = bestY - player.size.y;
      player.vel.y = 0;
    }
  }

  // Left Wall (Kill Zone)
  if (player.pos.x < 0) {
    newState.isGameOver = true;
  }
  // Push player forward if they are too far left? 
  // Design says: "If you hesitate or get pushed to the left edge, you die instantly."
  // So player position is relative to screen. 
  // If scrollX increases, player.pos.x effectively decreases if we don't move them.
  // But wait, in my engine, scrollX is the world offset. 
  // Player.pos.x is screen position. 
  // So if player doesn't move, they stay at same screen pos.
  // But enemies move left. 
  // Let's stick to: player.pos.x is screen position. 
  // If an enemy hits player, they recoil left.
  
  if (player.invincibleTimer && player.invincibleTimer > 0) {
    player.invincibleTimer -= 1;
  }

  // 4. Shooting
  if (player.shootCooldown && player.shootCooldown > 0) {
    player.shootCooldown -= 1;
  }

  if (inputs.has('B') && player.shootCooldown === 0) {
    fireWeapon(newState);
    player.shootCooldown = Math.floor(playerStats.fireRate * 60);
  }

  // 5. Update Bullets
  newState.bullets = newState.bullets.filter(b => b.active).map(b => {
    b.pos.x += b.vel.x;
    b.pos.y += b.vel.y;
    if (b.pos.x > GBA_WIDTH || b.pos.x < 0 || b.pos.y > GBA_HEIGHT || b.pos.y < 0) b.active = false;
    return b;
  });

  newState.enemyBullets = newState.enemyBullets.filter(b => b.active).map(b => {
    b.pos.x += b.vel.x;
    b.pos.y += b.vel.y;
    if (b.pos.x > GBA_WIDTH || b.pos.x < 0 || b.pos.y > GBA_HEIGHT || b.pos.y < 0) b.active = false;
    
    // Collision with player
    if (checkCollision(b, player) && !player.invincibleTimer) {
      takeDamage(newState);
      b.active = false;
    }
    return b;
  });

  // 6. Enemies
  spawnEnemies(newState);
  updateEnemies(newState);

  // 7. Boss
  updateBoss(newState);

  // 7.5 Items (Hearts)
  spawnItems(newState);
  updateItems(newState);

  // 8. Particles
  newState.particles = newState.particles.filter(p => p.active).map(p => {
    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;
    p.hp -= 1;
    if (p.hp <= 0) p.active = false;
    return p;
  });

  // 9. Combo Timer
  if (newState.comboTimer > 0) {
    newState.comboTimer -= 1;
  } else {
    newState.combo = 0;
  }

  // 10. High Score & Death Check
  if (newState.score > playerStats.highScore) {
    playerStats.highScore = newState.score;
  }

  // Camera Shake Decay
  if (newState.cameraShake > 0) {
    newState.cameraShake *= 0.9;
    if (newState.cameraShake < 0.1) newState.cameraShake = 0;
  }

  if (player.pos.y > GBA_HEIGHT) {
    newState.isGameOver = true;
  }

  return newState;
};

const checkGroundCollision = (entity: Entity, state: GameState): boolean => {
  if (entity.vel.y < 0) return false;

  // Use a 2px detection box below the entity to prevent flickering
  const points = [
    { x: entity.pos.x + 2, y: entity.pos.y + entity.size.y + 2 },
    { x: entity.pos.x + entity.size.x - 2, y: entity.pos.y + entity.size.y + 2 }
  ];

  return points.some(p => {
    const worldX = state.scrollX + p.x;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(p.y / TILE_SIZE);
    
    if (tileX < 0 || tileX >= state.levelChunks[0].length) return false;
    if (tileY < 0 || tileY >= state.levelChunks.length) return false;
    
    return state.levelChunks[tileY][tileX] === 1;
  });
};

const checkCollision = (a: Entity, b: Entity): boolean => {
  const ha = getHitbox(a);
  const hb = getHitbox(b);
  return (
    ha.x < hb.x + hb.w &&
    ha.x + ha.w > hb.x &&
    ha.y < hb.y + hb.h &&
    ha.y + ha.h > hb.y
  );
};

export const getHitbox = (entity: Entity) => {
  let { x, y } = entity.pos;
  let { x: w, y: h } = entity.size;

  if (entity.type === 'player') {
    // 60% size, centered
    const nw = w * 0.6;
    const nh = h * 0.6;
    x += (w - nw) / 2;
    y += (h - nh) / 2;
    w = nw;
    h = nh;
  } else if (entity.type === 'enemy' || entity.type === 'bullet' || entity.type === 'boss') {
    // 4px padding
    const padding = 4;
    // For small bullets, don't over-pad
    const actualPadding = Math.min(padding, w / 4, h / 4);
    x += actualPadding;
    y += actualPadding;
    w -= actualPadding * 2;
    h -= actualPadding * 2;
  }

  return { x, y, w, h };
};

const takeDamage = (state: GameState) => {
  const { player } = state;
  player.hp -= 1;
  player.invincibleTimer = 90; // 1.5 seconds
  player.pos.x -= 20; // Recoil
  player.hitFlash = 10;
  state.cameraShake = 5;
  spawnParticle(state, player.pos.x, player.pos.y, 'hit');
  audioManager.playSound('hit_player');
  if (player.hp <= 0) {
    state.isGameOver = true;
    audioManager.playSound('game_over');
  }
};

const spawnParticle = (state: GameState, x: number, y: number, type: string) => {
  let color = '#FFFFFF';
  let size = { x: 2, y: 2 };
  let hp = 20;
  let vel = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 };

  switch (type) {
    case 'dust':
      color = '#CCCCCC';
      vel = { x: (Math.random() - 0.5) * 1, y: -Math.random() * 1 };
      break;
    case 'hit':
      color = '#FF0000';
      hp = 30;
      vel = { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 };
      break;
    case 'flash':
      color = '#FFFF00';
      size = { x: 4, y: 4 };
      hp = 5;
      vel.y = (Math.random() - 0.5);
      break;
    case 'dash':
      color = '#60a5fa'; // Blue speed lines
      size = { x: 8, y: 1 };
      hp = 10;
      vel = { x: -4, y: 0 };
      break;
    case 'debris':
      color = '#4ade80'; // Default green
      size = { x: 2, y: 2 };
      hp = 40;
      vel = { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 };
      break;
    case 'explosion':
      color = '#fbbf24'; // Amber
      size = { x: 4, y: 4 };
      hp = 20;
      vel = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5 };
      break;
  }

  state.particles.push({
    id: Math.random().toString(),
    type: 'particle',
    pos: { x, y },
    vel,
    size,
    hp,
    maxHp: hp,
    active: true,
    color
  });
};

const fireWeapon = (state: GameState) => {
  const { player, playerStats } = state;
  const gun = playerStats.currentGun;
  
  // Muzzle flash
  spawnParticle(state, player.pos.x + player.size.x, player.pos.y + 6, 'flash');

  if (gun === 'pistol') {
    audioManager.playSound('shoot_pistol');
    state.bullets.push({
      id: Math.random().toString(),
      type: 'bullet',
      subType: 'pistol',
      pos: { x: player.pos.x + player.size.x, y: player.pos.y + 6 },
      vel: { x: 8, y: 0 },
      size: { x: 6, y: 3 },
      hp: 1,
      maxHp: 1,
      active: true,
      damage: playerStats.damage,
    });
  } else if (gun === 'spread') {
    audioManager.playSound('shoot_spread');
    for (let i = -1; i <= 1; i++) {
      state.bullets.push({
        id: Math.random().toString(),
        type: 'bullet',
        subType: 'spread',
        pos: { x: player.pos.x + player.size.x, y: player.pos.y + 6 },
        vel: { x: 7, y: i * 1.5 },
        size: { x: 5, y: 5 },
        hp: 1,
        maxHp: 1,
        active: true,
        damage: playerStats.damage,
      });
    }
  } else if (gun === 'laser') {
    audioManager.playSound('shoot_laser');
    state.bullets.push({
      id: Math.random().toString(),
      type: 'bullet',
      subType: 'laser',
      pos: { x: player.pos.x + player.size.x, y: player.pos.y + 7 },
      vel: { x: 10, y: 0 },
      size: { x: 16, y: 2 },
      hp: 2, // Piercing
      maxHp: 2,
      active: true,
      damage: playerStats.damage,
    });
  } else if (gun === 'grenade') {
    audioManager.playSound('shoot_grenade');
    state.bullets.push({
      id: Math.random().toString(),
      type: 'bullet',
      subType: 'grenade',
      pos: { x: player.pos.x + player.size.x, y: player.pos.y + 4 },
      vel: { x: 4, y: -3 },
      size: { x: 6, y: 6 },
      hp: 1,
      maxHp: 1,
      active: true,
      damage: playerStats.damage * 2,
    });
  }
};

const spawnEnemies = (state: GameState) => {
  if (state.bossActive) return;

  // DDA: Adjust spawn rate based on player performance
  // If player is low on HP, slow down spawns
  const hpFactor = state.player.hp / state.player.maxHp;
  const ddaSpawnDelay = hpFactor < 0.5 ? 60 : 0; // Extra frames delay if low HP

  const spawnRate = (240 - Math.min(120, Math.floor(state.score / 2000) * 15)) + ddaSpawnDelay;
  if (state.score % spawnRate === 0) {
    const rng = new Random(state.seed + state.score);
    
    // Safety Check: Don't spawn if there's already an enemy too close to the spawn point
    const tooClose = state.enemies.some(e => e.pos.x > GBA_WIDTH - 40);
    if (tooClose) return;

    // Diversity Logic: Create a pool of available types
    const availableTypes: EnemyType[] = ['walker', 'shooter', 'flyer', 'runner'];
    if (state.score > 8000) availableTypes.push('heavy');
    
    // Pick a type, avoiding the last one if possible to ensure diversity
    let subType = availableTypes[rng.nextInt(0, availableTypes.length - 1)];
    if (subType === state.lastEnemyType && availableTypes.length > 1) {
      subType = availableTypes[(availableTypes.indexOf(subType) + 1) % availableTypes.length];
    }
    state.lastEnemyType = subType;

    let hp = 1;
    let color = '#00FF00';
    let size = { x: 8, y: 12 };
    let vel = { x: -1.0, y: 0 };

    // Anchor System: Find ground at spawn point
    const worldX = state.scrollX + GBA_WIDTH;
    const tileX = Math.floor(worldX / TILE_SIZE);
    let anchorY = -1;
    
    if (tileX >= 0 && tileX < state.levelChunks[0].length) {
      for (let yIdx = 0; yIdx < state.levelChunks.length; yIdx++) {
        if (state.levelChunks[yIdx][tileX] === 1) {
          anchorY = yIdx * TILE_SIZE;
          break;
        }
      }
    }

    // If no anchor, check nearby to avoid spawning over gaps
    if (anchorY === -1) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = tileX + dx;
        if (tx >= 0 && tx < state.levelChunks[0].length) {
          for (let yIdx = 0; yIdx < state.levelChunks.length; yIdx++) {
            if (state.levelChunks[yIdx][tx] === 1) {
              anchorY = yIdx * TILE_SIZE;
              break;
            }
          }
        }
        if (anchorY !== -1) break;
      }
    }

    if (anchorY === -1 && subType !== 'flyer') return;

    // Base stats per type
    switch (subType) {
      case 'walker':
        color = '#4ade80'; // Emerald
        break;
      case 'shooter':
        hp = 1;
        color = '#f87171'; // Red
        break;
      case 'flyer':
        hp = 1;
        color = '#fbbf24'; // Amber
        break;
      case 'runner':
        hp = 1;
        color = '#60a5fa'; // Blue
        vel.x = -1.8;
        break;
      case 'heavy':
        hp = 1;
        color = '#94a3b8'; // Slate
        size = { x: 16, y: 16 };
        break;
    }

    let y = anchorY !== -1 ? anchorY - size.y : GBA_HEIGHT / 2;

    if (subType === 'flyer') {
      const maxDelta = 7 * TILE_SIZE; // JumpHeight * 0.85
      const targetY = (anchorY !== -1 ? anchorY : GBA_HEIGHT / 2) - rng.nextInt(20, 60);
      y = Math.max(20, targetY);
      if (anchorY !== -1 && anchorY - y > maxDelta) {
        y = anchorY - maxDelta;
      }
    }

    // Elite Variation: 15% chance for an "Elite" enemy with distinct color
    const isElite = rng.next() > 0.85;
    if (isElite) {
      color = '#a855f7'; // Purple for Elites
      size.x *= 1.2;
      size.y *= 1.2;
    }

    state.enemies.push({
      id: Math.random().toString(),
      type: 'enemy',
      subType,
      pos: { x: GBA_WIDTH, y },
      vel,
      size,
      hp,
      maxHp: hp,
      active: true,
      color,
    });
  }
};

const updateEnemies = (state: GameState) => {
  const { player } = state;
  
  state.enemies = state.enemies.filter(e => e.active).map(e => {
    if (e.subType === 'flyer') {
      e.pos.y += Math.sin(state.score * 0.1) * 1;
    }
    
    e.pos.x += e.vel.x;
    if (e.pos.x < -40) e.active = false;

    // Shooting for Shooter type
    if (e.subType === 'shooter' && state.score % 90 === 0) {
      state.enemyBullets.push({
        id: Math.random().toString(),
        type: 'bullet',
        pos: { x: e.pos.x, y: e.pos.y + 4 },
        vel: { x: -2, y: 0 },
        size: { x: 4, y: 4 },
        hp: 1,
        maxHp: 1,
        active: true,
        color: '#FF4444',
      });
    }

    // Collision with player
    if (checkCollision(e, player) && !player.invincibleTimer) {
      // Goomba Stomp Logic
      const isFalling = player.vel.y > 0;
      const isAbove = player.pos.y + player.size.y < e.pos.y + e.size.y / 2;
      
      if (isFalling && isAbove) {
        // Stomp!
        e.hp = 0;
        e.active = false;
        player.vel.y = -state.playerStats.jumpHeight * 0.8; // Bounce
        player.canDoubleJump = true; // Refresh double jump
        player.hasJumpedInAir = false;
        
        state.score += 200; // Bonus for stomping
        state.combo += 1;
        state.comboTimer = 120;
        
        for (let i = 0; i < 6; i++) spawnParticle(state, e.pos.x, e.pos.y, 'debris');
        spawnParticle(state, e.pos.x, e.pos.y, 'explosion');
        audioManager.playSound('death_enemy');
        audioManager.playSound('jump'); // Bounce sound
      } else {
        takeDamage(state);
      }
    }

    // Collision with bullets
    state.bullets.forEach(b => {
      if (checkCollision(b, e)) {
        e.hp -= b.damage || 1;
        e.hitFlash = 5;
        if (b.subType !== 'laser') b.active = false;
        audioManager.playSound('hit_enemy');
        if (e.hp <= 0) {
          e.active = false;
          state.score += 100;
          state.combo += 1;
          state.comboTimer = 120;
          for (let i = 0; i < 6; i++) spawnParticle(state, e.pos.x, e.pos.y, 'debris');
          spawnParticle(state, e.pos.x, e.pos.y, 'explosion');
          audioManager.playSound('death_enemy');
        }
      }
    });

    return e;
  });
};

const updateBoss = (state: GameState) => {
  const BOSS_THRESHOLD = 5000;
  if (state.score > 0 && state.score % BOSS_THRESHOLD === 0 && !state.bossActive && (state.lastBossScore || 0) < state.score) {
    state.bossActive = true;
    state.lastBossScore = state.score;
    state.boss = {
      id: 'boss',
      type: 'boss',
      pos: { x: GBA_WIDTH + 40, y: 40 },
      vel: { x: -0.5, y: 0.5 },
      size: { x: 48, y: 48 },
      hp: 15 + Math.floor(state.score / 2000) * 5,
      maxHp: 15 + Math.floor(state.score / 2000) * 5,
      active: true,
      color: '#888888',
      state: 'phase1',
    };
    state.cameraShake = 10;
  }

  if (state.bossActive && state.boss) {
    const b = state.boss;
    b.pos.y += Math.sin(state.score * 0.05) * 1;
    if (b.pos.x > GBA_WIDTH - 60) b.pos.x -= 0.5;

    // Phase transitions
    const hpPercent = b.hp / b.maxHp;
    if (hpPercent < 0.33) b.state = 'phase3';
    else if (hpPercent < 0.66) b.state = 'phase2';

    // Player-Boss collision
    if (checkCollision(state.player, b) && !state.player.invincibleTimer) {
      takeDamage(state);
    }

    // Player-Boss Arm collision (Actual Shield Collision)
    const rotation = (state.score * 0.05);
    const armAngles: number[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = (rotation + (i * Math.PI * 2) / 3) % (Math.PI * 2);
      armAngles.push(angle);
      const armX = b.pos.x + 24 + Math.cos(angle) * 30;
      const armY = b.pos.y + 24 + Math.sin(angle) * 30;
      
      const armPart = { 
        pos: { x: armX - 4, y: armY - 4 }, 
        size: { x: 8, y: 8 }, 
        type: 'enemy' 
      } as Entity;
      
      if (checkCollision(state.player, armPart) && !state.player.invincibleTimer) {
        takeDamage(state);
      }
    }

    // Boss Attacks
    const attackRate = b.state === 'phase3' ? 60 : b.state === 'phase2' ? 90 : 120;
    if (state.score % attackRate === 0) {
      const numMissiles = b.state === 'phase3' ? 2 : 1;
      for (let i = 0; i < numMissiles; i++) {
        state.enemyBullets.push({
          id: Math.random().toString(),
          type: 'bullet',
          pos: { x: b.pos.x, y: b.pos.y + 24 + (i * 10 - 5) },
          vel: { x: -3, y: (state.player.pos.y - b.pos.y - 24) / 60 + (i * 0.5 - 0.25) },
          size: { x: 8, y: 4 },
          hp: 1,
          maxHp: 1,
          active: true,
          color: '#FF0000',
        });
      }
    }

    // Collision with bullets
    state.bullets.forEach(bullet => {
      if (checkCollision(bullet, b)) {
        // Shield logic: check if bullet angle hits an arm
        const bulletAngle = Math.atan2(bullet.pos.y - (b.pos.y + 24), bullet.pos.x - (b.pos.x + 24));
        const normalizedBulletAngle = (bulletAngle + Math.PI * 2) % (Math.PI * 2);
        
        let hitShield = false;
        for (const armAngle of armAngles) {
          const diff = Math.abs(normalizedBulletAngle - armAngle);
          const wrappedDiff = Math.min(diff, Math.PI * 2 - diff);
          if (wrappedDiff < 0.4) { // Shield width
            hitShield = true;
            break;
          }
        }

        if (hitShield) {
          bullet.active = false;
          audioManager.playSound('boss_hit');
          spawnParticle(state, bullet.pos.x, bullet.pos.y, 'flash');
        } else {
          b.hp -= bullet.damage || 1;
          b.hitFlash = 5;
          bullet.active = false;
          audioManager.playSound('hit_enemy');
          if (b.hp <= 0) {
            b.active = false;
            state.bossActive = false;
            state.score += 1000;
            state.playerStats.bossesKilledTotal += 1;
            state.cameraShake = 20;
            audioManager.playSound('boss_death');
            for (let i = 0; i < 20; i++) spawnParticle(state, b.pos.x + 24, b.pos.y + 24, 'explosion');
            // Drop upgrade
            state.upgrades.push({
              id: 'upgrade',
              type: 'upgrade',
              pos: { x: b.pos.x, y: b.pos.y },
              vel: { x: -1, y: 1 },
              size: { x: 8, y: 8 },
              hp: 1,
              maxHp: 1,
              active: true,
              color: '#00FF00',
            });
          }
        }
      }
    });
  }
};

const applyUpgrade = (state: GameState) => {
  const stats = state.playerStats;
  const rng = new Random(Date.now());
  const roll = rng.nextInt(0, 3);
  
  if (roll === 0) stats.damage = Math.min(5, stats.damage + 1);
  else if (roll === 1) stats.fireRate = Math.max(0.15, stats.fireRate - 0.1);
  else if (roll === 2) stats.armor = Math.min(3, stats.armor + 1);
  else if (roll === 3) stats.jumpHeight = Math.min(9, stats.jumpHeight + 0.5);

  state.player.maxHp = 2 + stats.armor;
  if (state.player.hp > state.player.maxHp) state.player.hp = state.player.maxHp;
};

const spawnItems = (state: GameState) => {
  // DDA: Spawn hearts more frequently if player is low on HP
  const hpFactor = state.player.hp / state.player.maxHp;
  const ddaIntervalReduction = hpFactor < 0.4 ? 4000 : 0;

  const HEART_INTERVAL = 10000 - ddaIntervalReduction;
  if (state.score - (state.lastHeartScore || 0) >= HEART_INTERVAL) {
    state.lastHeartScore = state.score;
    
    const worldX = state.scrollX + GBA_WIDTH;
    const tileX = Math.floor(worldX / TILE_SIZE);
    let anchorY = -1;
    
    if (tileX >= 0 && tileX < state.levelChunks[0].length) {
      for (let y = 0; y < state.levelChunks.length; y++) {
        if (state.levelChunks[y][tileX] === 1) {
          anchorY = y * TILE_SIZE;
          break;
        }
      }
    }

    if (anchorY === -1) return; // Don't spawn hearts over pits

    state.items.push({
      id: 'heart-' + state.score,
      type: 'heart',
      pos: { x: GBA_WIDTH, y: anchorY - 12 },
      vel: { x: -state.scrollSpeed, y: 0 },
      size: { x: 8, y: 8 },
      hp: 1,
      maxHp: 1,
      active: true,
      color: '#FF0000'
    });
  }
};

const updateItems = (state: GameState) => {
  state.items = state.items.filter(i => i.active).map(i => {
    i.pos.x += i.vel.x;
    if (i.pos.x < -20) i.active = false;

    if (checkCollision(i, state.player)) {
      i.active = false;
      if (i.type === 'heart') {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
        audioManager.playSound('upgrade');
        spawnParticle(state, i.pos.x, i.pos.y, 'flash');
      }
    }
    return i;
  });

  // Update Upgrades
  state.upgrades = state.upgrades.filter(u => u.active).map(u => {
    u.pos.x += u.vel.x;
    u.pos.y += u.vel.y;
    if (u.pos.y > GBA_HEIGHT - 24) {
      u.pos.y = GBA_HEIGHT - 24;
      u.vel.y = 0;
    }
    
    if (checkCollision(u, state.player)) {
      u.active = false;
      audioManager.playSound('upgrade');
      applyUpgrade(state);
    }
    return u;
  });
};
