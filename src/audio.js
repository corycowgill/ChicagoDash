// Tiny synthesized sound effects + a procedural chiptune loop (WebAudio, no assets).
export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.musicTimer = null;
    this.step = 0;
    this.nextTime = 0;
    this.intensity = 0; // 0..1, drives tempo/hats as the run speeds up
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, { type = 'square', vol = 0.3, slide = 0, delay = 0, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseHit(dur, { vol = 0.3, freq = 1000, delay = 0, dest = null, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfxGain);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.sfxOn || !this.ctx) return;
    switch (name) {
      case 'coin':
        this.tone(988, 0.07, { vol: 0.12 });
        this.tone(1319, 0.12, { vol: 0.12, delay: 0.05 });
        break;
      case 'jump':
        this.tone(300, 0.18, { type: 'triangle', vol: 0.3, slide: 500 });
        break;
      case 'slide':
        this.noiseHit(0.25, { vol: 0.25, freq: 700 });
        break;
      case 'lane':
        this.noiseHit(0.08, { vol: 0.12, freq: 2500 });
        break;
      case 'land':
        this.noiseHit(0.06, { vol: 0.15, freq: 300, type: 'lowpass' });
        break;
      case 'power':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, { vol: 0.15, delay: i * 0.06, type: 'square' }));
        break;
      case 'life':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, { vol: 0.15, delay: i * 0.07, type: 'triangle' }));
        break;
      case 'shield':
        this.tone(220, 0.35, { type: 'sawtooth', vol: 0.2, slide: 600 });
        this.noiseHit(0.3, { vol: 0.2, freq: 3000 });
        break;
      case 'hit':
        this.tone(160, 0.4, { type: 'sawtooth', vol: 0.35, slide: -120 });
        this.noiseHit(0.35, { vol: 0.4, freq: 400, type: 'lowpass' });
        break;
      case 'bump':
        this.tone(120, 0.15, { type: 'square', vol: 0.2, slide: -40 });
        break;
      case 'over':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, { vol: 0.2, delay: i * 0.16, type: 'triangle' }));
        break;
      case 'click':
        this.tone(660, 0.05, { vol: 0.12, type: 'triangle' });
        break;
      case 'buy':
        [660, 880, 1320].forEach((f, i) => this.tone(f, 0.1, { vol: 0.15, delay: i * 0.05 }));
        break;
      case 'achieve':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, { vol: 0.14, delay: i * 0.08, type: 'triangle' }));
        break;
      case 'horn':
        this.tone(311, 0.6, { type: 'sawtooth', vol: 0.12 });
        this.tone(370, 0.6, { type: 'sawtooth', vol: 0.12 });
        break;
      case 'bell':
        this.tone(1760, 0.3, { type: 'sine', vol: 0.15 });
        this.tone(1760, 0.3, { type: 'sine', vol: 0.15, delay: 0.15 });
        break;
      default:
        break;
    }
  }

  // --- Music -----------------------------------------------------------------
  startMusic() {
    if (!this.ctx || !this.musicOn || this.musicTimer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.musicTimer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  schedule() {
    if (!this.ctx) return;
    const bpm = 132 + this.intensity * 24;
    const stepDur = 60 / bpm / 4;
    // I–vi–IV–V in C, bouncy bass + pentatonic hook
    const roots = [130.81, 110.0, 174.61, 196.0];
    const hook = [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 2];
    const semis = (n) => Math.pow(2, n / 12);
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s = this.step % 64;
      const bar = Math.floor(s / 16);
      const beat = s % 16;
      const t = this.nextTime - this.ctx.currentTime;
      const root = roots[bar];
      if (beat % 4 === 0) this.noiseHit(0.12, { vol: 0.35, freq: 120, type: 'lowpass', delay: t, dest: this.musicGain }); // kick
      if (beat % 8 === 4) this.noiseHit(0.1, { vol: 0.22, freq: 1800, delay: t, dest: this.musicGain }); // snare
      if (beat % 2 === 1 || this.intensity > 0.5) this.noiseHit(0.03, { vol: 0.08, freq: 8000, type: 'highpass', delay: t, dest: this.musicGain });
      if (beat % 2 === 0) this.tone(root / 2 * (beat % 4 === 2 ? 2 : 1), stepDur * 1.6, { type: 'triangle', vol: 0.35, delay: t, dest: this.musicGain });
      if (beat % 2 === 0 && (this.step >> 6) % 2 === 1 || beat % 4 === 0) {
        const n = hook[(beat + bar * 3) % 16];
        this.tone(261.63 * semis(n), stepDur * 1.8, { type: 'square', vol: 0.07, delay: t, dest: this.musicGain });
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }
}
