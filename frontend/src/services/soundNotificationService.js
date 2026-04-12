// src/services/soundNotificationService.js
// Web Audio API — no external files, works fully offline

class SoundNotificationService {
  constructor() {
    this.audioCtx  = null;
    this.volume    = 0.6;
    this.isPlaying = false;
    this._stopFlag = false;
  }

  _getContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  // ── One siren tone (1 second) ─────────────────────────────────
  _playTone(ctx, startTime, frequency = 1000, vibratoHz = 6, vol = null) {
    try {
      const v       = vol ?? this.volume;
      const osc     = ctx.createOscillator();
      const lfo     = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain    = ctx.createGain();

      lfo.frequency.value = vibratoHz;
      lfoGain.gain.value  = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(frequency, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(v, startTime + 0.05);
      gain.gain.setValueAtTime(v, startTime + 0.82);
      gain.gain.linearRampToValueAtTime(0, startTime + 1.0);

      osc.connect(gain);
      gain.connect(ctx.destination);

      lfo.start(startTime); osc.start(startTime);
      lfo.stop(startTime + 1.0); osc.stop(startTime + 1.0);
    } catch (e) { console.warn('tone error:', e); }
  }

  // ── Standard SOS alert (manual SOS) ──────────────────────────
  // 2 tones, medium volume, 880 Hz
  playAlert(type = 'sos', repeatCount = 2, onDone) {
    try {
      this._stopFlag = false;
      const ctx = this._getContext();
      this.isPlaying = true;

      const freqs = { sos:1000, fire:880, medical:660, security:1100, flood:550 };
      const freq  = freqs[type] || freqs.sos;

      for (let i = 0; i < repeatCount; i++) {
        this._playTone(ctx, ctx.currentTime + i * 2.0, freq);
      }

      setTimeout(() => {
        this.isPlaying = false;
        if (!this._stopFlag && typeof onDone === 'function') onDone();
      }, repeatCount * 2000);
    } catch (err) {
      console.warn('playAlert error:', err);
      this.isPlaying = false;
    }
  }

  // ── Silent SOS alert (staff-side only, LOUDER + more urgent) ──
  // 4 tones, max volume 0.9, alternating high/low frequencies
  // This is the STAFF alarm — the guest hears nothing
  playSilentSOSAlert(onDone) {
    try {
      this._stopFlag = false;
      const ctx = this._getContext();
      this.isPlaying = true;

      const HIGH_FREQ  = 1200;  // high urgent tone
      const LOW_FREQ   = 600;   // low alarm tone
      const LOUD       = 0.9;   // louder than normal alert

      // Alternating high-low pattern — more alarming than single tone
      const schedule = [HIGH_FREQ, LOW_FREQ, HIGH_FREQ, LOW_FREQ];
      schedule.forEach((freq, i) => {
        this._playTone(ctx, ctx.currentTime + i * 1.5, freq, 8, LOUD);
      });

      setTimeout(() => {
        this.isPlaying = false;
        if (!this._stopFlag && typeof onDone === 'function') onDone();
      }, schedule.length * 1500);

    } catch (err) {
      console.warn('playSilentSOSAlert error:', err);
      this.isPlaying = false;
    }
  }

  // ── Stop all audio immediately ────────────────────────────────
  stop() {
    this._stopFlag = true;
    this.isPlaying = false;
    try {
      if (this.audioCtx) {
        this.audioCtx.close();
        this.audioCtx = null;
      }
    } catch (e) { console.warn('stop error:', e); }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }
}

const soundService = new SoundNotificationService();
export default soundService;