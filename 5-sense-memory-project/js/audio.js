/* ============================================================================
   NEUROQUEST: SYNTH SOUND ENGINE (Zero External Sound Files)
   High fidelity procedural 8-bit / 16-bit arcade audio synthesizer
   BGM generative chord progressions, punchy attack SFX, victory jingles
============================================================================ */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.bgmTimer = null;
    this.currentTrack = null;
    this.step = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.muted;
  }

  // --- Sound Effects ---
  playSfx(type) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    switch (type) {
      case 'click': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.05);
        break;
      }

      case 'collect': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t); // C5
        osc.frequency.setValueAtTime(659.25, t + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, t + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, t + 0.24); // C6
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.4);
        break;
      }

      case 'laser': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.19);
        break;
      }

      case 'hit': {
        // Noise burst + low kick
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.2);
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.21);
        break;
      }

      case 'crit': {
        // Double punch impact
        [440, 880, 1320].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + idx * 0.04);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.25 + idx * 0.04);
          g.gain.setValueAtTime(0.35, t + idx * 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3 + idx * 0.04);
          osc.connect(g);
          g.connect(this.sfxGain);
          osc.start(t + idx * 0.04);
          osc.stop(t + 0.35 + idx * 0.04);
        });
        break;
      }

      case 'victory': {
        // 8-bit fanfare
        const notes = [
          { f: 523.25, d: 0.12 }, // C
          { f: 659.25, d: 0.12 }, // E
          { f: 783.99, d: 0.12 }, // G
          { f: 1046.50, d: 0.35 }, // C (high)
          { f: 880.00, d: 0.12 }, // A
          { f: 1046.50, d: 0.5 }   // C final
        ];
        let offset = 0;
        notes.forEach(n => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(n.f, t + offset);
          g.gain.setValueAtTime(0.25, t + offset);
          g.gain.exponentialRampToValueAtTime(0.001, t + offset + n.d);
          osc.connect(g);
          g.connect(this.sfxGain);
          osc.start(t + offset);
          osc.stop(t + offset + n.d + 0.02);
          offset += n.d;
        });
        break;
      }

      case 'powerup': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(1040, t + 0.35);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.36);
        break;
      }

      case 'error': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.setValueAtTime(110, t + 0.1);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.26);
        break;
      }

      case 'bubble': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300 + Math.random() * 200, t);
        osc.frequency.exponentialRampToValueAtTime(800 + Math.random() * 200, t + 0.08);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.09);
        break;
      }
    }
  }

  // --- Dynamic Generative Chiptune / Ambient Loop ---
  startBgm(theme = 'adventure') {
    if (this.currentTrack === theme) return;
    this.stopBgm();
    this.currentTrack = theme;
    this.ensureContext();
    if (!this.ctx) return;

    let bpm = 124;
    let scale = [261.63, 293.66, 329.63, 392.00, 440.00]; // Pentatonic C
    let bass = [130.81, 146.83, 164.81, 196.00];

    if (theme === 'citadel') {
      bpm = 115;
      scale = [329.63, 392.00, 440.00, 493.88, 587.33]; // E minor mystical
      bass = [82.41, 110.00, 123.47, 98.00];
    } else if (theme === 'space') {
      bpm = 95;
      scale = [220.00, 261.63, 293.66, 349.23, 392.00]; // Cosmic D min
      bass = [55.00, 65.41, 73.42, 87.31];
    } else if (theme === 'sub') {
      bpm = 130;
      scale = [261.63, 311.13, 349.23, 392.00, 466.16]; // Pulse rush
      bass = [65.41, 77.78, 87.31, 98.00];
    }

    const stepDuration = 60 / bpm / 2; // eighth notes
    this.step = 0;

    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;

      // Bass on every quarter note
      if (this.step % 2 === 0) {
        const bassFreq = bass[Math.floor(this.step / 8) % bass.length];
        const oscB = this.ctx.createOscillator();
        const gB = this.ctx.createGain();
        oscB.type = 'triangle';
        oscB.frequency.setValueAtTime(bassFreq, t);
        gB.gain.setValueAtTime(0.2, t);
        gB.gain.exponentialRampToValueAtTime(0.001, t + stepDuration * 1.8);
        oscB.connect(gB);
        gB.connect(this.bgmGain);
        oscB.start(t);
        oscB.stop(t + stepDuration * 1.9);
      }

      // Arp melody
      if (Math.random() > 0.3) {
        const note = scale[(this.step * 3 + Math.floor(Math.random() * 2)) % scale.length];
        const oscM = this.ctx.createOscillator();
        const gM = this.ctx.createGain();
        oscM.type = 'sine';
        oscM.frequency.setValueAtTime(note, t);
        gM.gain.setValueAtTime(0.12, t);
        gM.gain.exponentialRampToValueAtTime(0.0001, t + stepDuration * 0.9);
        oscM.connect(gM);
        gM.connect(this.bgmGain);
        oscM.start(t);
        oscM.stop(t + stepDuration);
      }

      this.step++;
    }, stepDuration * 1000);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.currentTrack = null;
  }

  // Convenient facades
  startAmbientBgm() {
    this.playBgm('ambient');
  }

  playVictoryFanfare() {
    this.playJingle('victory');
  }

  playLevelUp() {
    this.playJingle('levelup');
  }

  playCoin() {
    this.playSfx('coin');
  }

  playHit() {
    this.playSfx('hit');
  }

  playPowerup() {
    this.playSfx('powerup');
  }

  playReward() {
    this.playSfx('powerup');
  }
}

window.soundEngine = new SoundEngine();
window.GameAudio = window.soundEngine;
