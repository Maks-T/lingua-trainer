class AudioManager {
  constructor() {
    this.speechAudio = new Audio();
    this.playbackRate = 1.0;
    this.audioContext = null;
    this.isSpeechPlaying = false;
    this.speechCallbacks = { onStart: null, onEnd: null };
    this.pendingFallbackText = null;
    this.pendingFallbackLang = null;

    this.speechAudio.addEventListener('ended', () => {
      this.isSpeechPlaying = false;
      if (this.speechCallbacks.onEnd) this.speechCallbacks.onEnd();
    });

    this.speechAudio.addEventListener('error', (e) => {
      // Если локальный MP3 не найден (404), автоматически переключаемся на браузерный Web Speech API
      if (this.pendingFallbackText) {
        this._speakFallback(this.pendingFallbackText, this.pendingFallbackLang, this.speechCallbacks.onStart, this.speechCallbacks.onEnd);
        this.pendingFallbackText = null;
        this.pendingFallbackLang = null;
        return;
      }
      this.isSpeechPlaying = false;
      if (this.speechCallbacks.onEnd) this.speechCallbacks.onEnd(e);
    });
  }

  _getAudioContext() {
    if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  _speakFallback(text, lang = 'de-DE', onStart = null, onEnd = null) {
    if (!('speechSynthesis' in window)) {
      this.isSpeechPlaying = false;
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = lang.includes('-') ? lang : (lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'pl-PL');
    utterance.lang = targetLang;
    utterance.rate = this.playbackRate;

    utterance.onstart = () => {
      this.isSpeechPlaying = true;
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isSpeechPlaying = false;
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.warn('[WebSpeech Fallback Warn]:', err);
      this.isSpeechPlaying = false;
      if (onEnd) onEnd(err);
    };

    window.speechSynthesis.speak(utterance);
  }

  playSpeech(url, onStart = null, onEnd = null, fallbackText = '', lang = 'de-DE') {
    this.stopSpeech();
    this.speechCallbacks = { onStart, onEnd };
    this.pendingFallbackText = fallbackText;
    this.pendingFallbackLang = lang;

    if (!url && fallbackText) {
      return this._speakFallback(fallbackText, lang, onStart, onEnd);
    }

    const resolvedUrl = url.startsWith('http') || url.startsWith('/') ? url : `/${url}`;
    this.speechAudio.src = resolvedUrl;
    this.speechAudio.playbackRate = this.playbackRate;

    const playPromise = this.speechAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isSpeechPlaying = true;
          this.pendingFallbackText = null;
          this.pendingFallbackLang = null;
          if (onStart) onStart();
        })
        .catch((err) => {
          console.warn('[Audio Playback Warn]:', err.message);
          if (fallbackText) {
            this._speakFallback(fallbackText, lang, onStart, onEnd);
            this.pendingFallbackText = null;
            this.pendingFallbackLang = null;
          } else {
          this.isSpeechPlaying = false;
          if (onEnd) onEnd(err);
          }
        });
    }
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (!this.speechAudio.paused) {
      this.speechAudio.pause();
      this.speechAudio.currentTime = 0;
    }
    this.isSpeechPlaying = false;
    this.pendingFallbackText = null;
    this.pendingFallbackLang = null;
  }

  setRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    this.speechAudio.playbackRate = this.playbackRate;
  }

  playClick() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  playSuccess() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  }

  playMistake() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [260, 220].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.2, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.18);
    });
  }

  playWin() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.25, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.4);
    });
  }
}

export const audio = new AudioManager();