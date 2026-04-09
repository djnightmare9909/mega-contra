/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GBA_WIDTH, GBA_HEIGHT, COLORS, DEFAULT_INPUT_MAP, InputMap, GameAction, GameState, TILE_SIZE, PlayerStats } from '../lib/constants';
import { createInitialState, updateGame, getHitbox } from '../lib/gameEngine';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Pause, Heart, Zap, Shield, ArrowUpCircle, Target, Settings, Keyboard } from 'lucide-react';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem('mega_contra_stats');
    const stats = saved ? JSON.parse(saved) : undefined;
    return createInitialState(Date.now(), stats);
  });
  const [inputMap, setInputMap] = useState<InputMap>(() => {
    const saved = localStorage.getItem('mega_contra_input_map');
    return saved ? JSON.parse(saved) : DEFAULT_INPUT_MAP;
  });
  const [remappingAction, setRemappingAction] = useState<GameAction | null>(null);
  const [inputs] = useState<Set<string>>(new Set());
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(0);

  // Save stats on change
  useEffect(() => {
    localStorage.setItem('mega_contra_stats', JSON.stringify(gameState.playerStats));
  }, [gameState.playerStats]);

  // Handle Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (remappingAction) {
        const newMap = { ...inputMap };
        // Remove any existing key that maps to this action
        Object.keys(newMap).forEach(k => {
          if (newMap[k] === remappingAction) delete newMap[k];
        });
        // Assign new key
        newMap[e.code] = remappingAction;
        setInputMap(newMap);
        localStorage.setItem('mega_contra_input_map', JSON.stringify(newMap));
        setRemappingAction(null);
        e.preventDefault();
        return;
      }

      const gbaKey = inputMap[e.code];
      if (gbaKey) {
        inputs.add(gbaKey);
        if (gbaKey === 'START') {
          setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const gbaKey = inputMap[e.code];
      if (gbaKey) {
        inputs.delete(gbaKey);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputs, inputMap, remappingAction]);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = time - lastTimeRef.current;
      
      setGameState(prev => {
        if (prev.isPaused || prev.isTitle || prev.isGameOver) {
          render(prev);
          return prev;
        }
        const next = updateGame(prev, inputs, deltaTime);
        render(next);
        return next;
      });
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const render = (state: GameState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    // Screen Shake
    if (state.cameraShake > 0) {
      const shakeX = (Math.random() - 0.5) * state.cameraShake;
      const shakeY = (Math.random() - 0.5) * state.cameraShake;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Clear & Sky
    ctx.fillStyle = COLORS.BG_SKY;
    ctx.fillRect(0, 0, GBA_WIDTH, GBA_HEIGHT);

    // Stars (if score > 10k)
    if (state.score > 10000) {
      ctx.fillStyle = 'white';
      for (let i = 0; i < 20; i++) {
        const sx = (Math.sin(i * 123.45) * 0.5 + 0.5) * GBA_WIDTH;
        const sy = (Math.cos(i * 678.90) * 0.5 + 0.5) * 60;
        const op = 0.5 + Math.sin(state.score * 0.05 + i) * 0.5;
        ctx.globalAlpha = op;
        ctx.fillRect(sx, sy, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Parallax Sky (Clouds)
    ctx.fillStyle = COLORS.BG_SKY_DARK;
    const skyX = (state.scrollX * 0.2) % GBA_WIDTH;
    ctx.fillRect(GBA_WIDTH - skyX, 20, 30, 10);
    ctx.fillRect(GBA_WIDTH - skyX - 100, 40, 40, 15);
    ctx.fillRect(GBA_WIDTH - skyX + 100, 30, 50, 12);

    // Parallax Layer 3 (Distant Mountains)
    ctx.fillStyle = '#1e3a3a'; // Darker teal
    const distMountainX = (state.scrollX * 0.3) % GBA_WIDTH;
    for (let i = -1; i < 2; i++) {
      const x = i * GBA_WIDTH - distMountainX;
      ctx.beginPath();
      ctx.moveTo(x, GBA_HEIGHT - 16);
      ctx.lineTo(x + 100, GBA_HEIGHT - 120);
      ctx.lineTo(x + 200, GBA_HEIGHT - 16);
      ctx.fill();
    }

    // 2. Parallax Midground (Hills)
    ctx.fillStyle = COLORS.BG_MID;
    const midX = (state.scrollX * 0.5) % GBA_WIDTH;
    for (let i = -1; i < 2; i++) {
      const x = i * GBA_WIDTH - midX;
      ctx.beginPath();
      ctx.moveTo(x, GBA_HEIGHT - 16);
      ctx.lineTo(x + 60, GBA_HEIGHT - 80);
      ctx.lineTo(x + 120, GBA_HEIGHT - 16);
      ctx.fill();
    }

    // 3. Level Tiles
    const scrollOffset = Math.floor(state.scrollX);
    const fractionalOffset = state.scrollX - scrollOffset;
    
    for (let yIdx = 0; yIdx < state.levelChunks.length; yIdx++) {
      for (let x = -TILE_SIZE; x < GBA_WIDTH + TILE_SIZE; x += TILE_SIZE) {
        const worldX = scrollOffset + x;
        const tileX = Math.floor(worldX / TILE_SIZE);
        const drawX = x - (fractionalOffset);
        
        if (tileX >= 0 && tileX < state.levelChunks[0].length) {
          if (state.levelChunks[yIdx][tileX] === 1) {
            ctx.fillStyle = COLORS.GROUND;
            ctx.fillRect(Math.floor(drawX), yIdx * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // Draw top highlight if no tile above
            if (yIdx > 0 && state.levelChunks[yIdx - 1][tileX] === 0) {
              ctx.fillStyle = COLORS.GROUND_TOP;
              ctx.fillRect(Math.floor(drawX), yIdx * TILE_SIZE, TILE_SIZE, 2);
            }
          }
        }
      }
    }

    // 4. Particles
    state.particles.forEach(p => {
      ctx.fillStyle = p.color || 'white';
      ctx.globalAlpha = p.hp / p.maxHp;
      ctx.fillRect(Math.floor(p.pos.x), Math.floor(p.pos.y), p.size.x, p.size.y);
    });
    ctx.globalAlpha = 1.0;

    // 4.5 Items
    state.items.forEach(item => {
      if (item.type === 'heart') {
        ctx.fillStyle = '#FF0000';
        // Draw a simple heart shape
        const hx = Math.floor(item.pos.x);
        const hy = Math.floor(item.pos.y);
        ctx.fillRect(hx + 2, hy, 4, 2);
        ctx.fillRect(hx, hy + 2, 8, 2);
        ctx.fillRect(hx + 2, hy + 4, 4, 2);
        ctx.fillRect(hx + 3, hy + 6, 2, 2);
      }
    });
    ctx.globalAlpha = 1;

    // 5. Upgrades
    state.upgrades.forEach(u => {
      ctx.fillStyle = u.color || '#00FF00';
      ctx.beginPath();
      ctx.arc(u.pos.x + 4, u.pos.y + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 5.5 Items (Hearts)
    state.items.forEach(item => {
      if (item.type === 'heart') {
        ctx.fillStyle = '#FF0000';
        const hx = Math.floor(item.pos.x);
        const hy = Math.floor(item.pos.y);
        // Draw heart shape
        ctx.fillRect(hx + 2, hy, 4, 2);
        ctx.fillRect(hx, hy + 2, 8, 2);
        ctx.fillRect(hx + 2, hy + 4, 4, 2);
        ctx.fillRect(hx + 3, hy + 6, 2, 2);
      }
    });

    // 6. Enemies
    state.enemies.forEach(e => {
      ctx.fillStyle = e.color || COLORS.ENEMY_WALKER;
      ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
      // Details based on type
      ctx.fillStyle = 'black';
      ctx.fillRect(e.pos.x + 2, e.pos.y + 2, 2, 2);

      // Hit Flash
      if (e.hitFlash && e.hitFlash > 0) {
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y);
        ctx.globalAlpha = 1.0;
      }
    });

    // 7. Enemy Bullets
    state.enemyBullets.forEach(b => {
      ctx.fillStyle = b.color || COLORS.BULLET_ENEMY;
      ctx.fillRect(b.pos.x, b.pos.y, b.size.x, b.size.y);
    });

    // 8. Player
    if (!state.player.invincibleTimer || state.player.invincibleTimer % 4 < 2) {
      const p = state.player;
      const isRunning = p.vel.y === 0 && !p.dashTimer;
      const isJumping = p.vel.y < 0;
      const isFalling = p.vel.y > 0;
      const isDashing = p.dashTimer && p.dashTimer > 0;

      ctx.fillStyle = COLORS.PLAYER;
      
      // Animated Run Cycle (4 frames)
      let offsetY = 0;
      if (isRunning) {
        const frame = Math.floor(state.score / 5) % 4;
        if (frame === 1 || frame === 3) offsetY = -1;
      }

      ctx.fillRect(p.pos.x, p.pos.y + offsetY, p.size.x, p.size.y);
      
      // Bandana (Animated)
      ctx.fillStyle = COLORS.PLAYER_ACCENT;
      const bandanaOffset = isRunning ? (Math.floor(state.score / 5) % 2) : 0;
      ctx.fillRect(p.pos.x - 2 - bandanaOffset, p.pos.y + 2 + offsetY, 4, 2);
      ctx.fillRect(p.pos.x, p.pos.y + offsetY, p.size.x, 2);
      
      // Eye
      ctx.fillStyle = 'white';
      ctx.fillRect(p.pos.x + 8, p.pos.y + 4 + offsetY, 2, 2);

      // Dash Blur
      if (isDashing) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.4)';
        ctx.fillRect(p.pos.x - 8, p.pos.y, p.size.x, p.size.y);
        ctx.fillRect(p.pos.x - 16, p.pos.y, p.size.x, p.size.y);
      }

      // Hit Flash
      if (p.hitFlash && p.hitFlash > 0) {
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(p.pos.x, p.pos.y, p.size.x, p.size.y);
        ctx.globalAlpha = 1.0;
      }
    }

    // 9. Bullets
    ctx.fillStyle = COLORS.BULLET;
    state.bullets.forEach(b => {
      ctx.fillRect(b.pos.x, b.pos.y, b.size.x, b.size.y);
    });

    // 10. Boss
    if (state.bossActive && state.boss) {
      const b = state.boss;
      ctx.fillStyle = b.color || '#888888';
      ctx.fillRect(b.pos.x, b.pos.y, b.size.x, b.size.y);

      // Hit Flash
      if (b.hitFlash && b.hitFlash > 0) {
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(b.pos.x, b.pos.y, b.size.x, b.size.y);
        ctx.globalAlpha = 1.0;
      }
      
      // Rotating Shield Arms
      const rotation = (state.score * 0.05);
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const angle = rotation + (i * Math.PI * 2) / 3;
        const armX = b.pos.x + 24 + Math.cos(angle) * 30;
        const armY = b.pos.y + 24 + Math.sin(angle) * 30;
        ctx.beginPath();
        ctx.moveTo(b.pos.x + 24, b.pos.y + 24);
        ctx.lineTo(armX, armY);
        ctx.stroke();
        // Spike at end
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(armX - 2, armY - 2, 4, 4);
      }

      // Boss HP Bar
      const hpWidth = (b.hp / b.maxHp) * 100;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(GBA_WIDTH / 2 - 50, 10, 100, 4);
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(GBA_WIDTH / 2 - 50, 10, hpWidth, 4);
    }

    // 11. HUD
    renderHUD(ctx, state);

    // 12. Debug Hitboxes
    if (state.debug) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      
      // Player
      const ph = getHitbox(state.player);
      ctx.strokeRect(ph.x, ph.y, ph.w, ph.h);
      
      // Enemies
      state.enemies.forEach(e => {
        const eh = getHitbox(e);
        ctx.strokeRect(eh.x, eh.y, eh.w, eh.h);
      });
      
      // Bullets
      state.bullets.forEach(b => {
        const bh = getHitbox(b);
        ctx.strokeRect(bh.x, bh.y, bh.w, bh.h);
      });
      
      state.enemyBullets.forEach(b => {
        const bh = getHitbox(b);
        ctx.strokeRect(bh.x, bh.y, bh.w, bh.h);
      });
      
      // Boss
      if (state.bossActive && state.boss) {
        const bh = getHitbox(state.boss);
        ctx.strokeRect(bh.x, bh.y, bh.w, bh.h);
        
        // Boss Arm Tips
        const rotation = (state.score * 0.05);
        for (let i = 0; i < 3; i++) {
          const angle = (rotation + (i * Math.PI * 2) / 3) % (Math.PI * 2);
          const armX = state.boss.pos.x + 24 + Math.cos(angle) * 30;
          const armY = state.boss.pos.y + 24 + Math.sin(angle) * 30;
          ctx.strokeRect(armX - 4, armY - 4, 8, 8);
        }
      }
    }

    ctx.restore();
  };

  const renderHUD = (ctx: CanvasRenderingContext2D, state: GameState) => {
    // Score (Ticking)
    ctx.font = '8px monospace';
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.fillText(`SCORE: ${state.displayScore.toString().padStart(6, '0')}`, 10, 15);
    ctx.fillText(`HI: ${state.playerStats.highScore.toString().padStart(6, '0')}`, GBA_WIDTH - 70, 15);

    // Health (Hearts)
    for (let i = 0; i < state.player.maxHp; i++) {
      const x = 10 + i * 12;
      const y = 20;
      
      // Heart Shadow/Container
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, y, 10, 10);

      if (i < state.player.hp) {
        ctx.fillStyle = '#FF0000';
        // Pulse heart if low health
        const pulse = state.player.hp === 1 ? Math.sin(state.score * 0.2) * 2 : 0;
        
        // Draw heart shape
        ctx.fillRect(x + 2, y - pulse/2, 2, 2 + pulse);
        ctx.fillRect(x + 6, y - pulse/2, 2, 2 + pulse);
        ctx.fillRect(x, y + 2 - pulse/2, 10, 4 + pulse);
        ctx.fillRect(x + 2, y + 6 - pulse/2, 6, 2 + pulse);
        ctx.fillRect(x + 4, y + 8 - pulse/2, 2, 2 + pulse);
        
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x + 2, y + 2, 2, 2);
      }
    }

    // Gun Icon
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(GBA_WIDTH - 30, 20, 20, 20);
    ctx.font = '6px monospace';
    ctx.fillStyle = 'white';
    ctx.fillText(state.playerStats.currentGun.toUpperCase(), GBA_WIDTH - 28, 32);

    // Combo
    if (state.combo > 2) {
      const pulse = 1 + Math.sin(state.score * 0.1) * 0.1;
      ctx.save();
      ctx.translate(10, 45);
      ctx.scale(pulse, pulse);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#FFFF00';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(`${state.combo} COMBO!`, 0, 0);
      ctx.restore();
    }

    // Kill Zone Warning (Crumbling Wall)
    if (state.player.pos.x < 48) {
      const opacity = 0.2 + Math.sin(state.score * 0.2) * 0.1;
      ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
      // Draw a "crumbling" pattern
      for (let i = 0; i < GBA_HEIGHT; i += 8) {
        const wobble = Math.sin(state.score * 0.1 + i) * 4;
        ctx.fillRect(0, i, 16 + wobble, 8);
      }
    }
  };

  const startGame = () => {
    setGameState(prev => ({ ...prev, isTitle: false }));
  };

  const resetGame = () => {
    setGameState(prev => {
      const next = createInitialState(Date.now(), prev.playerStats);
      next.isTitle = false;
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 p-4 font-mono overflow-hidden">
      <div className="relative group scale-75 md:scale-100 transition-transform duration-500">
        {/* GBA Frame Simulation */}
        <div className="bg-neutral-900 p-8 rounded-[40px] shadow-[0_0_50px_rgba(0,0,0,0.5)] border-8 border-neutral-800 relative">
          {/* L/R Buttons */}
          <div className="absolute -top-2 left-16 w-16 h-4 bg-neutral-700 rounded-t-lg" />
          <div className="absolute -top-2 right-16 w-16 h-4 bg-neutral-700 rounded-t-lg" />

          <div className="bg-black p-3 rounded-xl border-4 border-neutral-700 shadow-inner">
            <canvas
              ref={canvasRef}
              width={GBA_WIDTH}
              height={GBA_HEIGHT}
              className="image-render-pixel w-[480px] h-[320px] md:w-[720px] md:h-[480px] bg-black cursor-none"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* GBA Controls */}
          <div className="mt-10 flex justify-between items-center px-6">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute w-20 h-6 bg-neutral-800 rounded-full" />
              <div className="absolute w-6 h-20 bg-neutral-800 rounded-full" />
              <div className="z-10 grid grid-cols-3 gap-0">
                <div /> <div className="w-7 h-7 bg-neutral-700 rounded-sm shadow-lg" /> <div />
                <div className="w-7 h-7 bg-neutral-700 rounded-sm shadow-lg" /> <div className="w-7 h-7 bg-neutral-700" /> <div className="w-7 h-7 bg-neutral-700 rounded-sm shadow-lg" />
                <div /> <div className="w-7 h-7 bg-neutral-700 rounded-sm shadow-lg" /> <div />
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-4">
                <div className="w-12 h-3 bg-neutral-800 rounded-full rotate-[-20deg] shadow-inner" />
                <div className="w-12 h-3 bg-neutral-800 rounded-full rotate-[-20deg] shadow-inner" />
              </div>
              <div className="flex gap-8 text-[8px] text-neutral-500 font-bold uppercase tracking-widest">
                <span>Select</span>
                <span>Start</span>
              </div>
            </div>

            <div className="flex gap-6 -translate-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-red-600 rounded-full shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4)] border-b-4 border-red-900 active:translate-y-1 transition-transform cursor-pointer" />
                <span className="text-xs text-neutral-400 font-bold">B</span>
              </div>
              <div className="flex flex-col items-center gap-2 -translate-y-4">
                <div className="w-14 h-14 bg-red-600 rounded-full shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4)] border-b-4 border-red-900 active:translate-y-1 transition-transform cursor-pointer" />
                <span className="text-xs text-neutral-400 font-bold">A</span>
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-neutral-600 font-bold tracking-[0.2em] uppercase">
            Mega Contra GBA
          </div>
        </div>

        {/* Overlays */}
        <AnimatePresence>
          {gameState.isTitle && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-[40px] z-20 p-12 text-center"
            >
              <h1 className="text-6xl font-black text-white mb-2 italic tracking-tighter uppercase">
                Mega <span className="text-red-600">Contra</span>
              </h1>
              <p className="text-neutral-400 mb-12 uppercase tracking-[0.3em] text-sm">Infinite Roguelite</p>
              
              <div className="grid grid-cols-2 gap-8 mb-12 w-full max-w-sm">
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <p className="text-[10px] text-neutral-500 uppercase">High Score</p>
                  <p className="text-xl font-bold text-white">{gameState.playerStats.highScore}</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <Target className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <p className="text-[10px] text-neutral-500 uppercase">Bosses Killed</p>
                  <p className="text-xl font-bold text-white">{gameState.playerStats.bossesKilledTotal}</p>
                </div>
              </div>

              <button
                onClick={startGame}
                className="group relative px-12 py-4 bg-white text-black font-black uppercase tracking-widest rounded-full hover:bg-red-600 hover:text-white transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Play className="w-5 h-5 fill-current" />
                  Start Mission
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </button>
            </motion.div>
          )}

          {gameState.isPaused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-[40px] z-20 p-6"
            >
              <div className="bg-neutral-900 w-full max-w-sm p-6 rounded-3xl border-2 border-neutral-700 shadow-2xl overflow-y-auto max-h-[90%] custom-scrollbar">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Pause className="w-8 h-8 text-white" />
                  <h2 className="text-2xl font-black text-white uppercase italic">Paused</h2>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mb-8">
                  <div className="bg-black/40 p-2 rounded-lg border border-neutral-800 text-center">
                    <Zap className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
                    <p className="text-[8px] text-neutral-500 uppercase">Damage</p>
                    <p className="text-sm font-bold text-white">{gameState.playerStats.damage}</p>
                  </div>
                  <div className="bg-black/40 p-2 rounded-lg border border-neutral-800 text-center">
                    <Shield className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <p className="text-[8px] text-neutral-500 uppercase">Armor</p>
                    <p className="text-sm font-bold text-white">{gameState.playerStats.armor}</p>
                  </div>
                  <div className="bg-black/40 p-2 rounded-lg border border-neutral-800 text-center">
                    <ArrowUpCircle className="w-4 h-4 text-green-500 mx-auto mb-1" />
                    <p className="text-[8px] text-neutral-500 uppercase">Jump</p>
                    <p className="text-sm font-bold text-white">{gameState.playerStats.jumpHeight.toFixed(1)}</p>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4 text-neutral-400 text-[10px] uppercase tracking-widest font-bold">
                    <Keyboard className="w-4 h-4" />
                    <span>Button Remapping</span>
                  </div>
                  <div className="space-y-2">
                    {(['A', 'B', 'DASH', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'START', 'SELECT'] as GameAction[]).map(action => {
                      const currentKey = Object.keys(inputMap).find(k => inputMap[k] === action);
                      const isRemapping = remappingAction === action;
                      
                      return (
                        <div key={action} className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-neutral-800">
                          <span className="text-[10px] text-neutral-400 uppercase font-bold">
                            {action === 'A' ? 'Jump' : action === 'B' ? 'Shoot' : action}
                          </span>
                          <button
                            onClick={() => setRemappingAction(action)}
                            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                              isRemapping 
                                ? 'bg-red-600 text-white animate-pulse' 
                                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                            }`}
                          >
                            {isRemapping ? 'Press Key...' : (currentKey?.replace('Key', '') || 'None')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button 
                    onClick={() => {
                      setInputMap(DEFAULT_INPUT_MAP);
                      localStorage.setItem('mega_contra_input_map', JSON.stringify(DEFAULT_INPUT_MAP));
                    }}
                    className="mt-4 w-full py-2 text-[8px] text-neutral-500 uppercase font-bold hover:text-white transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>

                <button
                  onClick={() => setGameState(prev => ({ ...prev, isPaused: false }))}
                  className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-red-600 hover:text-white transition-all duration-300 shadow-lg"
                >
                  Resume Mission
                </button>
              </div>
            </motion.div>
          )}

          {gameState.isGameOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 rounded-[40px] z-20 p-12 text-center"
            >
              <h2 className="text-7xl font-black text-white mb-2 italic uppercase tracking-tighter">
                Game <span className="text-black">Over</span>
              </h2>
              <p className="text-red-200 mb-8 uppercase tracking-widest">Mission Failed</p>
              
              <div className="bg-black/40 p-6 rounded-2xl mb-8 w-full max-w-xs">
                <p className="text-neutral-400 text-[10px] uppercase mb-1">Final Score</p>
                <p className="text-4xl font-black text-white mb-4">{gameState.score}</p>
                <div className="h-px bg-red-900/50 mb-4" />
                <p className="text-neutral-400 text-[10px] uppercase mb-1">Best Score</p>
                <p className="text-xl font-bold text-red-400">{gameState.playerStats.highScore}</p>
              </div>

              <button
                onClick={resetGame}
                className="flex items-center gap-3 px-10 py-4 bg-white text-black font-black uppercase tracking-widest rounded-full hover:bg-black hover:text-white transition-all duration-300"
              >
                <RotateCcw className="w-6 h-6" />
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Control Legend */}
      <div className="mt-12 flex flex-wrap justify-center gap-8 text-neutral-500 text-[10px] uppercase font-bold tracking-widest">
        <div className="flex items-center gap-2">
          <span className="min-w-[1.5rem] h-6 px-2 flex items-center justify-center bg-neutral-800 rounded border border-neutral-700 text-white">
            {Object.keys(inputMap).find(k => inputMap[k] === 'A')?.replace('Key', '') || '?'}
          </span>
          Jump
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[1.5rem] h-6 px-2 flex items-center justify-center bg-neutral-800 rounded border border-neutral-700 text-white">
            {Object.keys(inputMap).find(k => inputMap[k] === 'B')?.replace('Key', '') || '?'}
          </span>
          Shoot
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[1.5rem] h-6 px-2 flex items-center justify-center bg-neutral-800 rounded border border-neutral-700 text-white">
            {Object.keys(inputMap).find(k => inputMap[k] === 'DASH')?.replace('Space', 'SPC') || '?'}
          </span>
          Dash
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[1.5rem] h-6 px-2 flex items-center justify-center bg-neutral-800 rounded border border-neutral-700 text-white">
            {Object.keys(inputMap).find(k => inputMap[k] === 'START')?.replace('Enter', 'ENT') || '?'}
          </span>
          Pause
        </div>
      </div>
    </div>
  );
}
