// Neuro-Acoustic Engine (Web Audio API)

let audioCtx: AudioContext | null = null;
let mainGain: GainNode | null = null;
let bgOscillators: OscillatorNode[] = [];
let bgNoiseNode: AudioBufferSourceNode | null = null;
let bgNoiseGainNode: GainNode | null = null;
let melodyTimer: any = null;
let nextNoteTime = 0;
let activeBinauralType: 'gamma' | 'alpha' = 'gamma';

export const initAudio = (): AudioContext | null => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.warn('Audio init warning:', e);
  }
  return audioCtx;
};

export const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.1) => {
  const ctx = initAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
};

export const playClick = () => playTone(600, 'sine', 0.08, 0.05);

export const playFlipTone = () => {
  const ctx = initAudio();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(580, t + 0.12);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch {}
};

export const playSparkleTone = () => {
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 'sine', 0.18, 0.06), i * 55);
  });
};

export const playMasteredTone = () => {
  const notes = [440, 554.37, 659.25, 880];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 'triangle', 0.25, 0.09), i * 90);
  });
};

export const playStreakTone = (streakCount = 2) => {
  const base = 440 + Math.min(streakCount * 60, 400);
  playTone(base, 'triangle', 0.12, 0.1);
  setTimeout(() => playTone(base * 1.25, 'triangle', 0.15, 0.12), 80);
  setTimeout(() => playTone(base * 1.5, 'sine', 0.3, 0.15), 160);
};

const memoryChords = [
  [261.63, 392.00],
  [293.66, 440.00],
  [329.63, 493.88],
  [349.23, 523.25],
  [392.00, 587.33]
];

export const playMemoryAnchor = (seedIndex = 0) => {
  const ctx = initAudio();
  if (!ctx) return;
  try {
    const chord = memoryChords[Math.abs(seedIndex) % memoryChords.length];
    const t = ctx.currentTime;
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.045, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 1.2 + idx * 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  } catch {}
};

export const playCorrect = () => {
  playTone(523.25, 'sine', 0.1, 0.12);
  setTimeout(() => playTone(659.25, 'sine', 0.1, 0.12), 100);
  setTimeout(() => playTone(783.99, 'sine', 0.3, 0.15), 200);
};

export const playWrong = () => {
  playTone(300, 'triangle', 0.15, 0.12);
  setTimeout(() => playTone(240, 'triangle', 0.25, 0.12), 120);
};

export const playWin = () => {
  playTone(523.25, 'triangle', 0.18, 0.12);
  setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.12), 180);
  setTimeout(() => playTone(783.99, 'triangle', 0.18, 0.12), 360);
  setTimeout(() => playTone(1046.50, 'triangle', 0.5, 0.18), 540);
};

const createPinkNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
    b6 = white * 0.115926;
  }
  return buffer;
};

export const startAmbientMusic = (mode: 'gamma' | 'alpha' = 'gamma') => {
  const ctx = initAudio();
  if (!ctx) return;
  if (mainGain) stopAmbientMusic();
  activeBinauralType = mode;

  try {
    mainGain = ctx.createGain();
    mainGain.gain.value = 0.22;
    mainGain.connect(ctx.destination);

    const delayNode = ctx.createDelay();
    delayNode.delayTime.value = 0.8;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.38;
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(mainGain);

    const createLayer = (freq: number, panValue: number, type: OscillatorType, vol: number, useDelay = false) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      let panner: StereoPannerNode | GainNode = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if ('pan' in panner) (panner as StereoPannerNode).pan.value = panValue;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(mainGain!);
      if (useDelay) panner.connect(delayNode);
      osc.start();
      bgOscillators.push(osc);
      return osc;
    };

    if (mode === 'gamma') {
      createLayer(200.0, -0.9, 'sine', 0.28);
      createLayer(240.0, 0.9, 'sine', 0.28);
      createLayer(100.0, 0.0, 'triangle', 0.14);
    } else {
      createLayer(261.63, -0.9, 'sine', 0.30);
      createLayer(271.63, 0.9, 'sine', 0.30);
      createLayer(130.81, -0.3, 'triangle', 0.16);
    }

    // Pink Noise
    try {
      const noiseBuffer = createPinkNoiseBuffer(ctx);
      bgNoiseNode = ctx.createBufferSource();
      bgNoiseNode.buffer = noiseBuffer;
      bgNoiseNode.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 550;
      bgNoiseGainNode = ctx.createGain();
      const currentNoiseVol = parseFloat(localStorage.getItem('pink_noise_volume') || '0.08');
      const isNoiseEnabled = localStorage.getItem('pink_noise_enabled') !== 'false';
      bgNoiseGainNode.gain.value = isNoiseEnabled ? currentNoiseVol : 0;
      bgNoiseNode.connect(noiseFilter);
      noiseFilter.connect(bgNoiseGainNode);
      bgNoiseGainNode.connect(mainGain);
      bgNoiseNode.start();
    } catch (noiseErr) {
      console.warn('Pink noise init skipped:', noiseErr);
    }

    const scale = mode === 'gamma'
      ? [261.63, 329.63, 392.00, 523.25, 659.25]
      : [220.00, 261.63, 293.66, 329.63, 440.00];
    nextNoteTime = ctx.currentTime + 0.8;

    const scheduleMelody = () => {
      if (!mainGain || !audioCtx) return;
      while (nextNoteTime < audioCtx.currentTime + 0.15) {
        const freq = scale[Math.floor(Math.random() * scale.length)];
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, nextNoteTime);
        gain.gain.linearRampToValueAtTime(0.16, nextNoteTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 4.2);
        osc.connect(gain);
        gain.connect(mainGain);
        gain.connect(delayNode);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + 4.2);
        nextNoteTime += 2.0 + Math.random() * 2.5;
      }
      melodyTimer = setTimeout(scheduleMelody, 120);
    };
    scheduleMelody();
  } catch (e) {
    console.warn('Ambient music error:', e);
  }
};

export const stopAmbientMusic = () => {
  try {
    bgOscillators.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    bgOscillators = [];
    if (bgNoiseNode) {
      try { bgNoiseNode.stop(); } catch {}
      bgNoiseNode = null;
    }
    bgNoiseGainNode = null;
    if (melodyTimer) clearTimeout(melodyTimer);
    if (mainGain) {
      mainGain.disconnect();
      mainGain = null;
    }
  } catch {}
};

export const isAmbientPlaying = (): boolean => mainGain !== null;

let currentSpeechRate = 1.0;

export const setSpeechRate = (rate: number) => {
  currentSpeechRate = Math.max(0.5, Math.min(2.0, rate));
};

export const getSpeechRate = () => currentSpeechRate;

// Speech Narration helper (Web Speech API)
export const speakText = (text: string, voiceName?: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    // Detect language of the text
    const isArabic = /[\u0600-\u06FF]/.test(text);
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';
    utterance.rate = currentSpeechRate;

    const voices = window.speechSynthesis.getVoices();
    if (voiceName) {
      const match = voices.find(v => v.name === voiceName);
      if (match) utterance.voice = match;
    } else if (isArabic) {
      const arVoice = voices.find(v => v.lang.startsWith('ar'));
      if (arVoice) utterance.voice = arVoice;
    } else {
      const enVoice = voices.find(v => v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
};

export const stopSpeech = () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const toggleBinaural = (type: 'gamma' | 'alpha' = 'gamma') => {
  if (isAmbientPlaying()) {
    stopAmbientMusic();
  } else {
    startAmbientMusic(type);
  }
};

export const audioEngine = {
  initAudio,
  playTone,
  playClick,
  playFlipTone,
  playCorrect,
  playWrong,
  playWin,
  playSparkleTone,
  playMasteredTone,
  playStreakTone,
  playMemoryAnchor,
  startAmbientMusic,
  stopAmbientMusic,
  isAmbientPlaying,
  speakText,
  stopSpeech,
  setSpeechRate,
  getSpeechRate,
  toggleBinaural
};

