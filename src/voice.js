// Lance's talk engine.
//
// One microphone stream stays open for the whole conversation. Lance listens to
// the sound level himself instead of relying on the browser's speech
// recognition, which on iPhone stops on its own after short pauses and cannot
// run while audio plays. That gives three things the old setup could not:
//   1. He keeps hearing you for the whole session, pauses and all.
//   2. He notices when you talk over him and stops right away.
//   3. Nothing you say gets lost at the start, because the last half second of
//      sound is always kept in a small buffer before speech is detected.
// What you said is sent as a short WAV clip to lance-stt for the words.
// Lance's replies play through the same audio engine, one sentence at a time,
// starting as soon as the first sentence of his reply exists.

const TARGET_RATE = 16000;
const PREROLL_MS = 500;      // sound kept from just before you start talking
const END_SILENCE_MS = 900;  // pause that ends your turn
const MIN_SPEECH_MS = 280;   // shorter blips are ignored (coughs, taps)
const MAX_TURN_MS = 60000;   // one turn never runs longer than this
const BARGE_MS = 220;        // how long you must talk over Lance to cut in

export class VoiceEngine {
  constructor({ onLevel, onState, onUtterance, onBargeIn, onError } = {}) {
    this.cb = { onLevel, onState, onUtterance, onBargeIn, onError };
    this.ctx = null; this.stream = null; this.proc = null; this.src = null; this.sink = null;
    this.mode = "off";          // off | listening | capturing | paused | speaking
    this.noise = 0.008;         // running estimate of room noise
    this.ring = [];             // preroll buffer (Float32 chunks at device rate)
    this.ringLen = 0;
    this.turn = [];             // chunks of the current turn
    this.speechMs = 0; this.silenceMs = 0; this.turnMs = 0; this.bargeMs = 0;
    this.lastLevelAt = 0;
    // playback
    this.queue = []; this.playing = null; this.playToken = 0; this.gain = null;
  }

  // Call inside the tap that starts talk mode, so iPhone allows the mic and audio.
  async start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx) this.ctx = new AC();
    try { await this.ctx.resume(); } catch (e) {}
    try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    }
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(2048, 1, 1);
    this.sink = this.ctx.createGain(); this.sink.gain.value = 0; // keeps the processor running, makes no sound
    this.src.connect(this.proc); this.proc.connect(this.sink); this.sink.connect(this.ctx.destination);
    this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
    this.proc.onaudioprocess = (e) => this._onAudio(e.inputBuffer.getChannelData(0));
    this._setMode("listening");
  }

  stop() {
    this.stopSpeaking();
    this._setMode("off");
    try { this.proc && (this.proc.onaudioprocess = null); } catch (e) {}
    try { this.src && this.src.disconnect(); } catch (e) {}
    try { this.proc && this.proc.disconnect(); } catch (e) {}
    try { this.sink && this.sink.disconnect(); } catch (e) {}
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.ring = []; this.ringLen = 0; this.turn = [];
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {}
  }

  // listening = waiting for you; paused = Lance is thinking and ignores sound.
  listen() { if (this.mode !== "off") { this._resetTurn(); this._setMode("listening"); } }
  pause() { if (this.mode !== "off") { this._resetTurn(); this._setMode("paused"); } }
  get active() { return this.mode !== "off"; }

  _setMode(m) { if (m !== "speaking") this.speakStart = 0; this.mode = m; this.cb.onState && this.cb.onState(m); }
  _resetTurn() { this.turn = []; this.speechMs = 0; this.silenceMs = 0; this.turnMs = 0; this.bargeMs = 0; }

  _onAudio(data) {
    if (this.mode === "off") return;
    const chunk = new Float32Array(data);
    const ms = (chunk.length / this.ctx.sampleRate) * 1000;
    let sum = 0; for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);

    // Learn the room's noise level while nobody is talking.
    if (this.mode === "listening" && rms < this.noise * 2.5) this.noise = this.noise * 0.95 + rms * 0.05;
    const speakLevel = Math.max(0.012, this.noise * 3.2);

    const now = performance.now();
    if (this.cb.onLevel && now - this.lastLevelAt > 50) { this.lastLevelAt = now; this.cb.onLevel(this.muted ? 0 : Math.min(1, rms * 9)); }
    if (this.muted) {
      if (this.mode === "capturing" || this.mode === "listening") { this._resetTurn(); this._setMode("paused"); }
      return;
    }

    // Keep a short rolling buffer so the first syllable is never cut off.
    this.ring.push(chunk); this.ringLen += ms;
    while (this.ringLen > PREROLL_MS && this.ring.length > 1) {
      const old = this.ring.shift(); this.ringLen -= (old.length / this.ctx.sampleRate) * 1000;
    }

    if (this.mode === "speaking") {
      // Talking over Lance. His own voice is mostly removed by echo cancellation,
      // so the bar is set higher here to avoid him interrupting himself.
      // Whatever of his voice still leaks into the mic sets the bar: you have to be
      // clearly louder than the echo, and the first moment of each reply is skipped
      // while that echo level is learned.
      if (!this.speakStart) { this.speakStart = now; this.echo = 0.015; }
      const bargeLevel = Math.max(0.03, this.noise * 6, this.echo * 2.4);
      if (rms < bargeLevel) this.echo = this.echo * 0.97 + rms * 0.03;
      if (now - this.speakStart < 450) return;
      if (rms > bargeLevel) this.bargeMs += ms; else this.bargeMs = Math.max(0, this.bargeMs - ms / 2);
      if (this.bargeMs >= BARGE_MS) {
        this.stopSpeaking();
        this.turn = [...this.ring]; this.speechMs = this.bargeMs; this.silenceMs = 0; this.turnMs = this.ringLen;
        this._setMode("capturing");
        this.cb.onBargeIn && this.cb.onBargeIn();
      }
      return;
    }

    if (this.mode === "listening") {
      if (rms > speakLevel) {
        this.turn = [...this.ring]; this.speechMs = ms; this.silenceMs = 0; this.turnMs = this.ringLen;
        this._setMode("capturing");
      }
      return;
    }

    if (this.mode === "capturing") {
      this.turn.push(chunk); this.turnMs += ms;
      if (rms > speakLevel * 0.8) { this.speechMs += ms; this.silenceMs = 0; } else { this.silenceMs += ms; }
      const ended = (this.silenceMs >= END_SILENCE_MS) || this.turnMs >= MAX_TURN_MS;
      if (!ended) return;
      if (this.speechMs < MIN_SPEECH_MS) { this._resetTurn(); this._setMode("listening"); return; }
      const wav = this._toWav(this.turn, this.ctx.sampleRate);
      this._resetTurn();
      this._setMode("paused");
      this.cb.onUtterance && this.cb.onUtterance(wav);
    }
  }

  _toWav(chunks, rate) {
    let total = 0; for (const c of chunks) total += c.length;
    const ratio = rate / TARGET_RATE;
    const outLen = Math.floor(total / ratio);
    const pcm = new Int16Array(outLen);
    // Flatten then average down to 16 kHz.
    const flat = new Float32Array(total); let o = 0;
    for (const c of chunks) { flat.set(c, o); o += c.length; }
    let peak = 0.0001; for (let i = 0; i < flat.length; i++) { const a = Math.abs(flat[i]); if (a > peak) peak = a; }
    const boost = Math.min(4, 0.9 / peak);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio), end = Math.min(flat.length, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = start; j < end; j++) s += flat[j];
      const v = Math.max(-1, Math.min(1, (s / Math.max(1, end - start)) * boost));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = new ArrayBuffer(44 + pcm.length * 2); const dv = new DataView(buf);
    const w = (p, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, TARGET_RATE, true); dv.setUint32(28, TARGET_RATE * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: "audio/wav" });
  }

  // ─── Playback ───────────────────────────────────────────────────────
  // Lance's reply arrives as a series of audio clips (one per sentence group).
  // enqueue() accepts a promise for each clip so they can download in parallel
  // and still play in order.
  beginSpeech() { this.playToken++; this.queue = []; this.playing = null; this._speechDone = false; return this.playToken; }
  enqueue(token, clipPromise, meta) {
    if (token !== this.playToken || this.mode === "off") return;
    this.queue.push({ clipPromise, meta });
    if (!this.playing) this._playNext(token);
  }
  // Tell the engine no more clips are coming for this reply.
  finishSpeech(token, onAllDone) {
    if (token !== this.playToken) return;
    this._speechDone = true; this._onAllDone = onAllDone;
    if (!this.playing && !this.queue.length) this._allDone(token);
  }
  _allDone(token) {
    if (token !== this.playToken) return;
    const f = this._onAllDone; this._onAllDone = null;
    if (this.mode === "speaking") this._setMode("listening");
    f && f();
  }
  async _playNext(token) {
    if (token !== this.playToken) return;
    const item = this.queue.shift();
    if (!item) { this.playing = null; if (this._speechDone) this._allDone(token); return; }
    this.playing = item;
    let buffer = null;
    try {
      const bytes = await item.clipPromise;
      if (token !== this.playToken) return;
      if (bytes) buffer = await this.ctx.decodeAudioData(bytes.slice(0));
    } catch (e) { buffer = null; }
    if (token !== this.playToken) return;
    if (!buffer) { this.playing = null; this._playNext(token); return; }
    if (this.mode !== "speaking") { this._resetTurn(); this._setMode("speaking"); }
    item.meta && item.meta.onStart && item.meta.onStart();
    const node = this.ctx.createBufferSource();
    node.buffer = buffer; node.connect(this.gain);
    this.playing.node = node;
    node.onended = () => { if (token !== this.playToken) return; this.playing = null; this._playNext(token); };
    node.start();
  }
  stopSpeaking() {
    this.playToken++;
    if (this.playing && this.playing.node) { try { this.playing.node.onended = null; this.playing.node.stop(); } catch (e) {} }
    this.playing = null; this.queue = []; this._onAllDone = null;
    if (this.mode === "speaking") this._setMode("listening");
  }
  get isSpeaking() { return this.mode === "speaking" || !!this.playing || this.queue.length > 0; }
}

// Splits text that is still arriving into speakable pieces. Feed it the whole
// reply so far each time; it hands back only pieces that are complete.
export class SpeechChunker {
  constructor() { this.sent = 0; this.count = 0; }
  static clean(t) {
    return String(t)
      .replace(/\[(MEMORY|PROFILE|FLYER|TEXT|VIDEO|TASK|STAFF_EVENT|STAFF_NOTE|BRAIN):[^\]]*\]/gi, " ")
      .replace(/\[[A-Z_]+:[^\]]*$/, "") // a tag still being written
      .replace(/[#*_`>]/g, "")
      .replace(/^\s*[-•]\s+/gm, "");
  }
  // Returns new complete pieces. final=true flushes whatever is left.
  take(fullText, final = false) {
    const text = SpeechChunker.clean(fullText);
    const rest = text.slice(this.sent);
    const out = [];
    let cursor = 0;
    const re = /[.!?]["')\]]?(\s+|$)|\n{2,}/g;
    let m; let lastEnd = 0;
    while ((m = re.exec(rest))) {
      const end = m.index + m[0].length;
      if (m.index + m[0].length === rest.length && !final && !/\s$/.test(m[0])) break; // sentence may continue
      const piece = rest.slice(lastEnd, end);
      const n = this.count + out.length;
      const limit = n === 0 ? 1 : n === 1 ? 60 : 140; // first clip alone, then short, then natural lengths
      // Group short sentences so each clip has a natural length; first clip goes out alone, fast.
      if (piece.trim().length < limit && end < rest.length && (this.count + out.length) > 0) continue;
      out.push(piece.trim()); lastEnd = end;
    }
    cursor = lastEnd;
    if (final && rest.slice(cursor).trim()) { out.push(rest.slice(cursor).trim()); cursor = rest.length; }
    this.sent += cursor;
    const pieces = out.filter(p => /[A-Za-z0-9]/.test(p));
    this.count += pieces.length;
    return pieces;
  }
}
