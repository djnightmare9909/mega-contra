/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.3;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, slide?: number) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(slide, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume: number, filterFreq: number, filterQ: number) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
    filter.Q.setValueAtTime(filterQ, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  playSound(type: string) {
    try {
      switch (type) {
        case 'jump':
          this.playTone(150, 'square', 0.1, 0.2, 400);
          break;
        case 'shoot_pistol':
          this.playTone(800, 'sawtooth', 0.05, 0.1, 100);
          this.playNoise(0.05, 0.1, 1000, 1);
          break;
        case 'shoot_laser':
          this.playTone(1200, 'sine', 0.2, 0.1, 400);
          break;
        case 'shoot_spread':
          this.playTone(400, 'square', 0.1, 0.1, 100);
          this.playNoise(0.1, 0.1, 500, 2);
          break;
        case 'shoot_grenade':
          this.playTone(100, 'sine', 0.3, 0.3, 50);
          this.playNoise(0.3, 0.3, 200, 5);
          break;
        case 'hit_enemy':
          this.playTone(600, 'sawtooth', 0.05, 0.1, 200);
          break;
        case 'death_enemy':
          this.playNoise(0.2, 0.2, 400, 1);
          break;
        case 'hit_player':
          this.playTone(100, 'square', 0.2, 0.3, 50);
          this.playNoise(0.2, 0.3, 100, 1);
          break;
        case 'dash':
          this.playTone(200, 'sine', 0.15, 0.2, 800);
          this.playNoise(0.15, 0.1, 2000, 0.5);
          break;
        case 'upgrade':
          this.playTone(400, 'sine', 0.1, 0.2, 800);
          setTimeout(() => this.playTone(600, 'sine', 0.1, 0.2, 1200), 50);
          setTimeout(() => this.playTone(800, 'sine', 0.2, 0.2, 1600), 100);
          break;
        case 'boss_hit':
          this.playTone(200, 'square', 0.1, 0.3, 100);
          break;
        case 'boss_death':
          this.playNoise(1.0, 0.5, 100, 1);
          this.playTone(50, 'sine', 1.0, 0.5, 20);
          break;
        case 'game_over':
          this.playTone(200, 'sawtooth', 0.5, 0.3, 50);
          break;
      }
    } catch (e) {
      console.warn('Audio failed', e);
    }
  }
}

export const audioManager = new AudioManager();
