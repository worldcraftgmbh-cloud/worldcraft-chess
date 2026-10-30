/**
 * Procedural Wooden Chess Sound Effects via Web Audio API
 * Generates tactile, acoustic wooden piece sounds without external audio assets.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SoundManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class SoundManager {
    constructor() {
      this.enabled = true;
      this.audioCtx = null;
    }

    initContext() {
      if (!this.audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    /**
     * Standard quiet move: Warm wooden block tap
     */
    playMove() {
      if (!this.enabled) return;
      this.initContext();
      if (!this.audioCtx) return;

      const ctx = this.audioCtx;
      const t = ctx.currentTime;

      // High transient click
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(380, t);
      osc1.frequency.exponentialRampToValueAtTime(110, t + 0.04);
      gain1.gain.setValueAtTime(0.4, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Low wood resonance body
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(140, t);
      osc2.frequency.exponentialRampToValueAtTime(65, t + 0.09);
      gain2.gain.setValueAtTime(0.6, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(t);
      osc1.stop(t + 0.05);
      osc2.start(t);
      osc2.stop(t + 0.1);
    }

    /**
     * Capture move: Heavy wood-on-wood knock with snappy impact
     */
    playCapture() {
      if (!this.enabled) return;
      this.initContext();
      if (!this.audioCtx) return;

      const ctx = this.audioCtx;
      const t = ctx.currentTime;

      // Sharp strike click
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(620, t);
      osc1.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      gain1.gain.setValueAtTime(0.7, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Secondary clack
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(240, t + 0.015);
      osc2.frequency.exponentialRampToValueAtTime(90, t + 0.07);
      gain2.gain.setValueAtTime(0.3, t + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      // Deep table thump
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(180, t);
      osc3.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      gain3.gain.setValueAtTime(0.8, t);
      gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);

      osc1.start(t); osc1.stop(t + 0.08);
      osc2.start(t + 0.015); osc2.stop(t + 0.09);
      osc3.start(t); osc3.stop(t + 0.14);
    }

    /**
     * Check notification: Refined resonant bell/harmonic chime
     */
    playCheck() {
      if (!this.enabled) return;
      this.initContext();
      if (!this.audioCtx) return;

      const ctx = this.audioCtx;
      const t = ctx.currentTime;

      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.06);
        gain.gain.setValueAtTime(0.3, t + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.06);
        osc.stop(t + idx * 0.06 + 0.36);
      });
    }

    /**
     * Castle move: Quick double wood slide
     */
    playCastle() {
      this.playMove();
      setTimeout(() => this.playMove(), 120);
    }

    /**
     * Game End fanfare or gong
     */
    playGameEnd() {
      if (!this.enabled) return;
      this.initContext();
      if (!this.audioCtx) return;

      const ctx = this.audioCtx;
      const t = ctx.currentTime;
      const chord = [392.00, 493.88, 587.33, 783.99]; // G Major

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0.25, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.65);
      });
    }
  }

  return SoundManager;
});
