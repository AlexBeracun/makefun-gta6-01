// Synthesised sound with WebAudio: no audio files, everything is generated.
// Engine hum, sirens, gunshots, pickups, jingles and a simple bassline radio loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicOn = false;
  let muted = false;
  let beat = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.2;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  const api = {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    setEngine(speedRatio, driving) {
      if (!ctx || muted) return;
      engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.06 : 0.0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 160, ctx.currentTime, 0.1);
    },
    setSiren(on, time) {
      if (!ctx) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.035, ctx.currentTime, 0.1);
      sirenOsc.frequency.setTargetAtTime(time % 1 < 0.5 ? 720 : 960, ctx.currentTime, 0.05);
    },
    shoot() {
      noise(0.12, 0.3, 3000);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    punch() {
      noise(0.08, 0.18, 700);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.18);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.18), 70);
    },
    cash() {
      tone(660, 0.08, 'triangle', 0.2);
      setTimeout(() => tone(880, 0.08, 'triangle', 0.2), 80);
      setTimeout(() => tone(1320, 0.14, 'triangle', 0.2), 160);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.2), i * 110));
    },
    busted() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.12), i * 160));
    },
    crash() {
      noise(0.25, 0.3, 500);
    },
    startMusic() {
      if (!ensure() || musicOn) return;
      musicOn = true;
      // Simple sun-soaked bassline loop: A minor groove, 112 BPM.
      const bass = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 82.41, 73.42, 0, 65.41, 49, 0];
      const stepMs = 60000 / 112 / 2;
      musicTimer = setInterval(() => {
        if (muted || !ctx) return;
        const note = bass[beat % bass.length];
        if (note) tone(note, 0.22, 'triangle', 0.1);
        if (beat % 4 === 2) noise(0.03, 0.05, 6000);
        beat += 1;
      }, stepMs);
    },
    stopMusic() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      musicOn = false;
    },
  };
  return api;
}
