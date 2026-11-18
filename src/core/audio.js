import { LANG_LOCALES } from './utils.js';

const RATE_KEY = 'lingua_audio_rate';

/**
 * Озвучка: сначала локальный MP3, при ошибке — Web Speech API.
 * Каждый вызов playSpeech получает свой «токен»: колбэки устаревших
 * воспроизведений (прерванных новым вызовом) игнорируются, а фолбэк
 * на синтез речи запускается ровно один раз.
 */
class AudioManager {
  constructor() {
    this.speechAudio = new Audio();
    this.speechAudio.preload = 'auto';
    this.playbackRate = this._loadRate();
    this.audioContext = null;
    this.isSpeechPlaying = false;
    this.token = 0;
    this.current = null; // { token, onStart, onEnd, fallbackText, lang, rate, fellBack, finished }

    this.speechAudio.addEventListener('ended', () => this._finish(this.current?.token));
    this.speechAudio.addEventListener('error', () => this._fallback(this.current?.token));
  }

  _loadRate() {
    try {
      const saved = parseFloat(localStorage.getItem(RATE_KEY));
      return Number.isFinite(saved) ? saved : 1.0;
    } catch {
      return 1.0;
    }
  }

  _getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext && AudioCtx) {
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  _resolveLang(lang) {
    if (!lang) return 'de-DE';
    return lang.includes('-') ? lang : LANG_LOCALES[lang] || lang;
  }

  _start(token) {
    const cur = this.current;
    if (!cur || cur.token !== token || cur.started) return;
    cur.started = true;
    this.isSpeechPlaying = true;
    cur.onStart?.();
  }

  _finish(token, err) {
    const cur = this.current;
    if (!cur || cur.token !== token || cur.finished) return;
    cur.finished = true;
    this.isSpeechPlaying = false;
    cur.onEnd?.(err);
  }

  _fallback(token) {
    const cur = this.current;
    if (!cur || cur.token !== token || cur.finished) return;
    if (cur.fellBack || !cur.fallbackText) {
      this._finish(token, new Error('audio unavailable'));
      return;
    }
    cur.fellBack = true;
    this._speakSynth(token);
  }

  _speakSynth(token) {
    const cur = this.current;
    if (!('speechSynthesis' in window)) {
      this._finish(token, new Error('speechSynthesis unsupported'));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cur.fallbackText);
    utterance.lang = this._resolveLang(cur.lang);
    utterance.rate = cur.rate;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang?.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()));
    if (voice) utterance.voice = voice;

    utterance.onstart = () => this._start(token);
    utterance.onend = () => this._finish(token);
    utterance.onerror = (e) => this._finish(token, e);
    window.speechSynthesis.speak(utterance);
  }

  /**
   * @param {string} url путь к mp3 (может быть пустым)
   * @param {Function|null} onStart
   * @param {Function|null} onEnd
   * @param {string} fallbackText текст для синтеза речи, если mp3 недоступен
   * @param {string} lang код языка (de, en, pl …)
   * @param {{rate?: number}} options
   */
  playSpeech(url, onStart = null, onEnd = null, fallbackText = '', lang = 'de', options = {}) {
    this.stopSpeech();
    const token = ++this.token;
    const rate = options.rate ?? this.playbackRate;
    this.current = { token, onStart, onEnd, fallbackText, lang, rate, fellBack: false, finished: false, started: false };

    if (!url) {
      if (fallbackText) {
        this.current.fellBack = true;
        this._speakSynth(token);
      } else {
        this._finish(token);
      }
      return;
    }

    const resolvedUrl = /^(https?:|\.\/|blob:|data:)/.test(url) ? url : `./${url.replace(/^\/+/, '')}`;
    this.speechAudio.src = resolvedUrl;
    this.speechAudio.playbackRate = rate;

    const playPromise = this.speechAudio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => this._start(token))
        .catch((err) => {
          // AbortError — воспроизведение прервано новым вызовом; это не ошибка
          if (err?.name === 'AbortError') return;
          this._fallback(token);
        });
    }
  }

  stopSpeech() {
    // Сначала «отвязываем» текущее воспроизведение, чтобы его колбэки не сработали
    const prev = this.current;
    this.current = null;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (!this.speechAudio.paused) {
      this.speechAudio.pause();
    }
    try {
      this.speechAudio.currentTime = 0;
    } catch {
      /* не загружено — игнорируем */
    }
    this.isSpeechPlaying = false;
    if (prev && !prev.finished) {
      prev.finished = true;
      prev.onEnd?.(new Error('stopped'));
    }
  }

  setRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    this.speechAudio.playbackRate = this.playbackRate;
    try {
      localStorage.setItem(RATE_KEY, String(this.playbackRate));
    } catch {
      /* приватный режим */
    }
  }

  _tone(notes, type, step, length, volume) {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * step;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + length);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + length);
    });
  }

  playClick() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  playSuccess() {
    this._tone([523.25, 659.25, 783.99], 'triangle', 0.08, 0.25, 0.18);
  }

  playMistake() {
    this._tone([260, 220], 'sawtooth', 0.12, 0.18, 0.12);
  }

  playWin() {
    this._tone([440, 554.37, 659.25, 880], 'triangle', 0.1, 0.4, 0.2);
  }
}

export const audio = new AudioManager();
