import confetti from 'canvas-confetti';
import { getContentLanguage } from '../domain/questions.cjs';
import { requestAiCompletion, activeMaterialContext } from './api.js';
import { createByteCache, MAX_AUDIO_RESPONSE_BYTES, playHtmlAudio, installOneTimeUnlock } from './resources.cjs';
const getSpeechLocale = content => { const language = getContentLanguage(content); return language === 'ar' ? 'ar-SA' : language === 'en' ? 'en-US' : language; };
    // === محرك المؤثرات الصوتية والموسيقى العصبية التوليدية (Neuro-Acoustic Engine - Web Audio API) ===
    let audioCtx = null;
    let mainGain = null;
    let bgOscillators = [];
    let bgNoiseNode = null;
    let melodyTimer = null;
    let nextNoteTime = 0;
    let activeBinauralType = 'gamma'; // 'gamma' (40Hz) | 'alpha' (10Hz)

    const initAudio = () => {
      try {
        if (!audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      } catch (e) {
        console.warn("Audio init warning:", e);
      }
    };

    // فك قيود الصوت نهائياً في Safari على أجهزة iPad / iPhone عند أول لمس أو نقر للمستخدم
    let audioUnlocked = false;
    const unlockAudio = () => {
      if (audioUnlocked) return;
      try {
        initAudio();
        if (audioCtx) {
          if (audioCtx.state === 'suspended') {
            audioCtx.resume();
          }
          const silentBuffer = audioCtx.createBuffer(1, 1, 22050);
          const source = audioCtx.createBufferSource();
          source.buffer = silentBuffer;
          source.connect(audioCtx.destination);
          source.start(0);
          audioUnlocked = true;
          // The shared one-time gesture installer removes every registered event.
        }
      } catch (_) {}
    };

    // The app installs one gesture group and removes the whole group after unlock.
    const installAudioUnlock = () => installOneTimeUnlock(document, () => { unlockAudio(); return audioUnlocked; });

    const playTone = (freq, type, duration, vol = 0.1) => {
      if (!audioCtx) return;
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    };

    const playClick = () => playTone(600, 'sine', 0.08, 0.05);
    
    // نغمة كشف البطاقة (Card Flip & Reveal Tone)
    const playFlipTone = () => {
      if (!audioCtx) return;
      try {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(580, t + 0.12);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      } catch(e){}
    };

    // نغمة السحر والوميض لمفتاح الحفظ (Mnemonic Magic Sparkle)
    const playSparkleTone = () => {
      if (!audioCtx) return;
      try {
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((f, i) => {
          setTimeout(() => playTone(f, 'sine', 0.18, 0.06), i * 55);
        });
      } catch(e){}
    };

    // نغمة التثبيت الدائم في الذاكرة (Memory Mastered Level-Up)
    const playMasteredTone = () => {
      if (!audioCtx) return;
      try {
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((f, i) => {
          setTimeout(() => playTone(f, 'triangle', 0.25, 0.09), i * 90);
        });
      } catch(e){}
    };

    // نغمة سلاسل الإتقان المتتالية (Streak Multiplier Chime)
    const playStreakTone = (streakCount = 2) => {
      if (!audioCtx) return;
      try {
        const base = 440 + Math.min(streakCount * 60, 400);
        playTone(base, 'triangle', 0.12, 0.1);
        setTimeout(() => playTone(base * 1.25, 'triangle', 0.15, 0.12), 80);
        setTimeout(() => playTone(base * 1.5, 'sine', 0.3, 0.15), 160);
      } catch(e){}
    };

    // نغمة الرنين الذاكرتي التوافقي (Targeted Memory Reactivation - TMR Acoustic Anchor)
    // نغمات خماسية عذبة ترتبط بكل سؤال لا شعورياً وتُعاد برقة أثناء الاختبار لتحفيز التذكر الفوري
    const memoryChords = [
      [261.63, 392.00], // C4 - G4
      [293.66, 440.00], // D4 - A4
      [329.63, 493.88], // E4 - B4
      [349.23, 523.25], // F4 - C5
      [392.00, 587.33]  // G4 - D5
    ];
    const playMemoryAnchor = (seedIndex = 0) => {
      if (!audioCtx) return;
      try {
        const chord = memoryChords[Math.abs(seedIndex) % memoryChords.length];
        const t = audioCtx.currentTime;
        chord.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.045, t + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + 1.2 + idx * 0.2);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(t);
          osc.stop(t + 1.5);
        });
      } catch(e){}
    };

    const playCorrect = () => {
      playTone(523.25, 'sine', 0.1, 0.12);
      setTimeout(() => playTone(659.25, 'sine', 0.1, 0.12), 100);
      setTimeout(() => playTone(783.99, 'sine', 0.3, 0.15), 200);
    };
    const playWrong = () => {
      playTone(300, 'triangle', 0.15, 0.12);
      setTimeout(() => playTone(240, 'triangle', 0.25, 0.12), 120);
    };
    const playWin = () => {
      playTone(523.25, 'triangle', 0.18, 0.12);
      setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.12), 180);
      setTimeout(() => playTone(783.99, 'triangle', 0.18, 0.12), 360);
      setTimeout(() => playTone(1046.50, 'triangle', 0.5, 0.18), 540);
    };

    // توليد ضوضاء وردية ناعمة لعزل الضوضاء المحيطة وتصفية الذهن (Soothing Pink Noise Floor)
    const createPinkNoiseBuffer = (ctx) => {
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

    // موسيقى التركيز العلمي: موجات غاما (40Hz Gamma Focus) وموجات ألفا (10Hz Alpha Flow) مع الضوضاء الوردية المهدئة
    const startAmbientMusic = (mode = 'gamma') => {
      initAudio();
      if (!audioCtx) return;
      if (mainGain) stopAmbientMusic();
      activeBinauralType = mode;
      try {
        mainGain = audioCtx.createGain();
        mainGain.gain.value = 0.22;
        mainGain.connect(audioCtx.destination);

        const delayNode = audioCtx.createDelay();
        delayNode.delayTime.value = 0.8;
        const delayFeedback = audioCtx.createGain();
        delayFeedback.gain.value = 0.38;
        delayNode.connect(delayFeedback);
        delayFeedback.connect(delayNode);
        delayNode.connect(mainGain);

        const createLayer = (freq, panValue, type, vol, useDelay = false) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          let panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
          if (panner.pan) panner.pan.value = panValue;
          osc.type = type;
          osc.frequency.value = freq;
          gain.gain.value = vol;
          osc.connect(gain);
          gain.connect(panner);
          panner.connect(mainGain);
          if (useDelay) panner.connect(delayNode);
          osc.start();
          bgOscillators.push(osc);
          return osc;
        };

        if (mode === 'gamma') {
          // موجات غاما 40Hz: أثبتت الأبحاث دورها في الربط العصبي (Feature Binding) وتثبيت الذاكرة وسرعة المعالجة
          // الأذن اليسرى 200Hz والأذن اليمنى 240Hz (فارق 40Hz دقيق)
          createLayer(200.0, -0.9, 'sine', 0.28);
          createLayer(240.0, 0.9, 'sine', 0.28);
          createLayer(100.0, 0.0, 'triangle', 0.14);
        } else {
          // موجات ألفا 10Hz: للاسترخاء والتدفق الذهني الخالي من التوتر
          // الأذن اليسرى 261.63Hz والأذن اليمنى 271.63Hz (فارق 10Hz)
          createLayer(261.63, -0.9, 'sine', 0.30);
          createLayer(271.63, 0.9, 'sine', 0.30);
          createLayer(130.81, -0.3, 'triangle', 0.16);
        }

        // تشغيل عازل الضوضاء الوردية الناعمة (Pink Noise Floor) بدرجة مسموعة ومريحة (مثل صوت المطر الهادئ)
        try {
          const noiseBuffer = createPinkNoiseBuffer(audioCtx);
          bgNoiseNode = audioCtx.createBufferSource();
          bgNoiseNode.buffer = noiseBuffer;
          bgNoiseNode.loop = true;
          const noiseFilter = audioCtx.createBiquadFilter();
          noiseFilter.type = 'lowpass';
          noiseFilter.frequency.value = 550; // تردد دافئ ومريح
          bgNoiseGainNode = audioCtx.createGain();
          const currentNoiseVol = parseFloat(localStorage.getItem('pink_noise_volume') || '0.08');
          const isNoiseEnabled = localStorage.getItem('pink_noise_enabled') !== 'false';
          bgNoiseGainNode.gain.value = isNoiseEnabled ? currentNoiseVol : 0;
          bgNoiseNode.connect(noiseFilter);
          noiseFilter.connect(bgNoiseGainNode);
          bgNoiseGainNode.connect(mainGain);
          bgNoiseNode.start();
        } catch(noiseErr) {
          console.warn("Pink noise init skipped:", noiseErr);
        }

        // ألحان تأملية خماسية لطيفة متباعدة
        const scale = mode === 'gamma' 
          ? [261.63, 329.63, 392.00, 523.25, 659.25] // نغمات مشرقة
          : [220.00, 261.63, 293.66, 329.63, 440.00]; // نغمات هادئة
        nextNoteTime = audioCtx.currentTime + 0.8;

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
        console.warn("Ambient music error:", e);
      }
    };

    const stopAmbientMusic = () => {
      try {
        bgOscillators.forEach(osc => { try { osc.stop(); } catch(e){} });
        bgOscillators = [];
        if (bgNoiseNode) {
          try { bgNoiseNode.stop(); } catch(e){}
          bgNoiseNode = null;
        }
        bgNoiseGainNode = null;
        if (melodyTimer) clearTimeout(melodyTimer);
        if (mainGain) { mainGain.disconnect(); mainGain = null; }
      } catch (e) {}
    };

    // إطلاق الاحتفالات
    const triggerConfetti = () => {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#3b82f6']
        });
      }
    };

    // === محرك الصوت والذاكرة المؤقتة الذكية والتسريع الفائق (Ultra-Fast TTS Engine) ===
    const boundedVoiceCache = createByteCache();
    const voiceCache = new Proxy({}, { get: (_, key) => boundedVoiceCache.get(key) });
    const voiceCacheKeys = []; // compatibility only; byte accounting belongs to the cache
    const setVoiceCacheEntry = (key, value) => boundedVoiceCache.set(key, value);
    const inFlightAudioFetches = {}; // cacheKey -> { promise, controller }
    let currentAudioSource = null;
    let currentHtmlAudio = null;
    let currentHtmlBlobUrl = null;
    let activeSpeechId = 0;
    let activeAbortController = null;

    // إيقاف أي صوت أو نطق جاري فوراً لمنع التداخل (Overlap) وتحرير الذاكرة
    const stopAllSpeech = () => {
      activeSpeechId += 1;
      if (activeAbortController) {
        try { activeAbortController.abort(); } catch(e){}
        activeAbortController = null;
      }
      if (currentAudioSource) {
        try { currentAudioSource.stop(); } catch(e){}
        currentAudioSource = null;
      }
      if (currentHtmlAudio) {
        try { currentHtmlAudio.pause(); currentHtmlAudio.currentTime = 0; } catch(e){}
        currentHtmlAudio = null;
      }
      if (currentHtmlBlobUrl) {
        try { URL.revokeObjectURL(currentHtmlBlobUrl); } catch(e){}
        currentHtmlBlobUrl = null;
      }
      if ('speechSynthesis' in window) {
        try {
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
          window.speechSynthesis.cancel();
        } catch(e){}
      }
      try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
    };

    let bgNoiseGainNode = null;
    const updatePinkNoiseLive = (enabled, vol) => {
      localStorage.setItem('pink_noise_enabled', enabled ? 'true' : 'false');
      localStorage.setItem('pink_noise_volume', String(vol));
      if (bgNoiseGainNode && audioCtx && audioCtx.state !== 'suspended') {
        try {
          bgNoiseGainNode.gain.setValueAtTime(enabled ? vol : 0, audioCtx.currentTime);
        } catch(e){}
      }
    };

    // خوارزمية ذكية لاكتشاف واستئصال ذيل التشويش والهمس (Anti-Hiss Vocoder Truncation & Cosine Fade-out)
    const processPcmBytesAntiHiss = (pcmBytes, sampleRate = 24000) => {
      let len = pcmBytes.length;
      if (len % 2 !== 0) len -= 1;
      const totalSamples = len / 2;
      if (totalSamples < sampleRate * 0.2) return { pcmBytes, len };

      const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, len);

      // مسح عكسي دقيق لاكتشاف موضع انتهاء الصوت البشري الفعلي
      // عتبة حساسة تلتقط أدق الهمسات والروابط اللغوية الساكنة (مثل: ة، ت، س، هـ) لمنع قطع أي كلمة
      const windowSize = Math.floor(sampleRate * 0.01); // 10ms = 240 عينة
      const maxScanSamples = Math.min(Math.floor(sampleRate * 0.45), Math.floor(totalSamples * 0.3));

      let lastSpeechSample = -1;
      for (let s = totalSamples - windowSize; s >= totalSamples - maxScanSamples; s -= windowSize) {
        let sum = 0;
        let maxVal = 0;
        for (let k = 0; k < windowSize; k++) {
          const v = Math.abs(view.getInt16((s + k) * 2, true));
          sum += v;
          if (v > maxVal) maxVal = v;
        }
        const avg = sum / windowSize;
        // طاقة الصوت البشري (فوق أرضية التشويش والهمس الرقمي)
        if (avg >= 200 || maxVal >= 550) {
          lastSpeechSample = s + windowSize;
          break;
        }
      }

      let cutSample = totalSamples;
      if (lastSpeechSample !== -1) {
        // حماية تامة لنهاية الكلمة: نضيف هامش أمان مريح لا يقل عن 100ms ليخرج الحرف الأخير كاملاً وطبيعياً دون أي بتر
        const safeMargin = Math.floor(sampleRate * 0.10);
        cutSample = Math.min(totalSamples, lastSpeechSample + safeMargin);
      }

      // تطبيق خفوت ناعم متدرج على آخر 30ms فقط من الملف لمنع أي طقطقة عتادية دون التأثير على الكلمات
      const fadeSamples = Math.min(Math.floor(sampleRate * 0.03), Math.floor(cutSample * 0.1));
      const fadeStart = cutSample - fadeSamples;
      for (let i = 0; i < fadeSamples; i++) {
        const s = fadeStart + i;
        const orig = view.getInt16(s * 2, true);
        const gain = 0.5 * (1 + Math.cos((Math.PI * i) / fadeSamples));
        view.setInt16(s * 2, Math.round(orig * gain), true);
      }

      // تصفير آخر 4ms فقط لضمان الهبوط إلى الصفر المطلق
      const zeroSamples = Math.min(Math.floor(sampleRate * 0.004), fadeSamples);
      for (let s = cutSample - zeroSamples; s < cutSample; s++) {
        view.setInt16(s * 2, 0, true);
      }

      const cleanLen = cutSample * 2;
      const cleanBytes = new Uint8Array(pcmBytes.buffer, pcmBytes.byteOffset, cleanLen);
      return { pcmBytes: cleanBytes, len: cleanLen };
    };

    // تحويل سريع مباشر من Base64 PCM 16-bit 24kHz إلى ArrayBuffer WAV بصيغة RIFF بعد استئصال التشويش
    const base64PcmToWavArrayBuffer = (base64Pcm, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
      try {
        const binaryString = atob(base64Pcm);
        let len = binaryString.length;
        if (len % 2 !== 0) len -= 1; // محاذاة عينات 16-bit
        const pcmBytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) pcmBytes[i] = binaryString.charCodeAt(i);

        const { pcmBytes: cleanPcm, len: cleanLen } = processPcmBytesAntiHiss(pcmBytes, sampleRate);

        const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const totalBuffer = new ArrayBuffer(44 + cleanLen);
        const view = new DataView(totalBuffer);

        // "RIFF"
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + cleanLen, true);
        view.setUint32(8, 0x57415645, false);

        // "fmt "
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // "data"
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, cleanLen, true);

        new Uint8Array(totalBuffer, 44).set(cleanPcm);
        return totalBuffer;
      } catch (err) {
        console.warn("base64PcmToWavArrayBuffer error:", err);
        return null;
      }
    };

    // تحويل Base64 إلى ArrayBuffer عام
    const base64ToArrayBuffer = (base64) => {
      try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
      } catch (e) {
        return null;
      }
    };

    // فك تشفير الصوت مسبقاً وتجهيز AudioBuffer للتشغيل الفوري (<1ms) مع دعم موثوق لـ Safari على iPad
    const decodeAudioDataSafely = async (arrayBuffer) => {
      try {
        initAudio();
        if (!audioCtx) return null;
        if (audioCtx.state === 'suspended') {
          try { await audioCtx.resume(); } catch (_) {}
        }
        const copy = arrayBuffer.slice(0);
        return await new Promise((resolve) => {
          let resolved = false;
          const onSuccess = (decoded) => {
            if (!resolved) { resolved = true; resolve(decoded); }
          };
          const onError = () => {
            if (!resolved) { resolved = true; resolve(null); }
          };
          try {
            const promise = audioCtx.decodeAudioData(copy, onSuccess, onError);
            if (promise && typeof promise.then === 'function') {
              promise.then(onSuccess).catch(onError);
            }
          } catch (e) {
            onError();
          }
          setTimeout(() => {
            if (!resolved) { resolved = true; resolve(null); }
          }, 3500);
        });
      } catch (err) {
        return null;
      }
    };

    // تحويل دفق PCM 16-bit 24kHz الخام إلى ملف WAV قياسي برأس RIFF صالح ليعمل فورياً في جميع المتصفحات مع استئصال التشويش
    const pcmBase64ToWavBase64 = (base64Pcm, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
      try {
        const binaryString = atob(base64Pcm);
        let len = binaryString.length;
        if (len % 2 !== 0) len -= 1;
        const pcmBytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) pcmBytes[i] = binaryString.charCodeAt(i);

        const { pcmBytes: cleanPcm, len: cleanLen } = processPcmBytesAntiHiss(pcmBytes, sampleRate);

        const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);

        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + cleanLen, true);
        view.setUint32(8, 0x57415645, false);

        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, cleanLen, true);

        const fullBytes = new Uint8Array(44 + cleanLen);
        fullBytes.set(new Uint8Array(wavHeader), 0);
        fullBytes.set(cleanPcm, 44);

        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < fullBytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, fullBytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      } catch (err) {
        console.warn("PCM to WAV conversion error:", err);
        return base64Pcm;
      }
    };

    // تشغيل الصوت من Base64 أو AudioBuffer بدون أي تأخير مع دعم أصيل ومضمون لأجهزة iPad و Safari
    const playBase64Audio = async (base64Data, mimeType = 'audio/wav', speechId = null, preDecodedBuffer = null, spokenText = null) => {
      try {
        initAudio();
        if (speechId !== null && speechId !== activeSpeechId) return;

        // إيقاف أي صوت سابق فوراً
        if (currentAudioSource) {
          try { currentAudioSource.stop(); } catch(e){}
          currentAudioSource = null;
        }
        if (currentHtmlAudio) {
          try { currentHtmlAudio.pause(); currentHtmlAudio.currentTime = 0; } catch(e){}
          currentHtmlAudio = null;
        }
        if (currentHtmlBlobUrl) {
          try { URL.revokeObjectURL(currentHtmlBlobUrl); } catch(e){}
          currentHtmlBlobUrl = null;
        }

        try { window.__onSpeechStateChange?.({ status: 'speaking', text: spokenText }); } catch(e){}

        if (audioCtx && audioCtx.state === 'suspended') {
          try { await audioCtx.resume(); } catch(e){}
        }

        const playViaWebAudio = (buf) => {
          try {
            if (!audioCtx) return false;
            if (audioCtx.state === 'suspended') {
              try { audioCtx.resume(); } catch(e){}
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buf;
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
            // غلاف هبوط عتادي دقيق على آخر 70ms لضمان صفر طقطقة أو تشويش
            const fadeStart = Math.max(0, buf.duration - 0.02);
            gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime + fadeStart);
            gainNode.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + buf.duration);
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            source.onended = () => {
              if (currentAudioSource === source) {
                currentAudioSource = null;
                try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
              }
            };
            source.start();
            currentAudioSource = source;
            return true;
          } catch (e) {
            console.warn("playViaWebAudio failed:", e);
            return false;
          }
        };

        if (speechId !== null && speechId !== activeSpeechId) return;
        // 1. إذا كان الـ AudioBuffer مفكوكاً مسبقاً، نشغله فوراً بزمن 0ms
        if (preDecodedBuffer && playViaWebAudio(preDecodedBuffer)) {
          return;
        }

        let audioDataB64 = base64Data;
        let finalMime = mimeType || 'audio/wav';
        let arrayBuf = null;

        if (finalMime.toLowerCase().includes('pcm') || finalMime.toLowerCase().includes('l16')) {
          arrayBuf = base64PcmToWavArrayBuffer(base64Data, 24000);
          finalMime = 'audio/wav';
        } else {
          arrayBuf = base64ToArrayBuffer(base64Data);
        }

        // 2. محاولة فك التشفير وتشغيله عبر Web Audio API
        if (arrayBuf) {
          const audioBuffer = await decodeAudioDataSafely(arrayBuf);
          if (speechId !== null && speechId !== activeSpeechId) return;
          if (audioBuffer && playViaWebAudio(audioBuffer)) {
            return;
          }
        }

        if (speechId !== null && speechId !== activeSpeechId) return;

        // 3. البديل عبر HTML5 Audio باستخدام Blob URL (متوافق تماماً مع iOS Safari)
        try {
          if (finalMime.toLowerCase().includes('pcm') || finalMime.toLowerCase().includes('l16')) {
            audioDataB64 = pcmBase64ToWavBase64(base64Data, 24000);
            finalMime = 'audio/wav';
          }
          const rawBytes = arrayBuf || base64ToArrayBuffer(audioDataB64);
          if (rawBytes) {
            const blob = new Blob([rawBytes], { type: finalMime });
            const blobUrl = URL.createObjectURL(blob);
            currentHtmlBlobUrl = blobUrl;
            const audio = new Audio(blobUrl);
            currentHtmlAudio = audio;
            audio.onended = () => {
              URL.revokeObjectURL(blobUrl);
              if (currentHtmlBlobUrl === blobUrl) currentHtmlBlobUrl = null;
              if (currentHtmlAudio === audio) {
                currentHtmlAudio = null;
                try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
              }
            };
            audio.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              if (currentHtmlBlobUrl === blobUrl) currentHtmlBlobUrl = null;
              if (currentHtmlAudio === audio) {
                currentHtmlAudio = null;
                try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
              }
            };
            const played = await playHtmlAudio({ audio, url: blobUrl, revoke: url => {
              URL.revokeObjectURL(url);
              if (currentHtmlBlobUrl === url) currentHtmlBlobUrl = null;
              if (currentHtmlAudio === audio) {
                currentHtmlAudio = null;
                window.__onSpeechStateChange?.({ status: 'idle', text: null });
              }
            }, isCurrent: () => speechId === null || speechId === activeSpeechId });
            if (played) return;
          }
        } catch (htmlErr) {
          console.warn("HTML Audio playback fallback failed on iPad/Safari:", htmlErr);
        }

        // 4. في حال تعذر تشغيل ملف الصوت بالكامل على الجهاز: لا يتم إضافة أي صوت روبوتي آلي
        if (speechId === null || speechId === activeSpeechId) {
          try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
        }
      } catch (e) {
        console.warn("Audio playback failed:", e);
        try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
      }
    };

    // جلب ومعالجة الصوت من API مع التخزين المؤقت وفك التشفير في خطوة واحدة
    // تنظيف وضبط النص لتوليد صوت فصيح نقي ومتقن 100% بدون أي تعتعة أو رموز
    const cleanTextForTts = (text, language = getContentLanguage(text)) => {
      if (!text || typeof text !== 'string') return '';
      return text
        .replace(/\[\s*_{2,}\s*\]|_{2,}|\[\s*\.{3,}\s*\]/g, language.startsWith('ar') ? ' فَـرَاغ ' : ' ... ')
        .replace(/\.{3,}/g, '، ')
        .replace(/[*_#`~\[\]\(\)\{\}<>]/g, ' ')
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const fetchTtsAudio = async (text, signal = null, language = getContentLanguage(text)) => {
      if (!text) return null;
      const spokenCleanText = cleanTextForTts(text, language) || text;
      const cacheKey = `${language}_${spokenCleanText}`;
      if (voiceCache[cacheKey]) return voiceCache[cacheKey];

      if (signal?.aborted) return null;
      try {
        const payload = {
          contents: [{ role: 'user', parts: [{ text: spokenCleanText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { languageCode: getSpeechLocale({ language }) }
          }
        };
        const contextParams = {
          ...(activeMaterialContext?.materialId ? { materialId: activeMaterialContext.materialId } : {}),
          ...(activeMaterialContext?.generationId ? { generationId: activeMaterialContext.generationId } : {}),
          ...(activeMaterialContext?.isDemo ? { isDemo: true } : {})
        };
        const data = await requestAiCompletion({ purpose: 'tts', payload, ...contextParams, signal });
        const inlineAudio = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
        if (!inlineAudio?.data || typeof inlineAudio.data !== 'string') return null;
        // Bound encoded input before atob and decoded buffers before retaining either.
        if (inlineAudio.data.length > Math.ceil(MAX_AUDIO_RESPONSE_BYTES * 4 / 3)) return null;
        let audioData = inlineAudio.data;
        let mimeType = inlineAudio.mimeType || 'audio/pcm;rate=24000';
        let arrayBuffer;
        if (/pcm|l16/i.test(mimeType)) {
          const sampleRate = Number(mimeType.match(/rate=(\d+)/i)?.[1]) || 24000;
          arrayBuffer = base64PcmToWavArrayBuffer(audioData, sampleRate);
          audioData = pcmBase64ToWavBase64(audioData, sampleRate);
          mimeType = 'audio/wav';
        } else {
          const binary = atob(audioData);
          arrayBuffer = Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
        }
        if (signal?.aborted || (arrayBuffer && arrayBuffer.byteLength > MAX_AUDIO_RESPONSE_BYTES)) return null;
        const buffer = arrayBuffer ? await decodeAudioDataSafely(arrayBuffer) : null;
        if (buffer && buffer.length * buffer.numberOfChannels * 4 > MAX_AUDIO_RESPONSE_BYTES * 2) return null;
        if (signal?.aborted) return null;
        const result = { data: audioData, mimeType, buffer };
        setVoiceCacheEntry(cacheKey, result);
        return result;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Server narration unavailable:', err.message || err);
        }
        return null;
      }
    };

    const prefetchVoice = (text, voiceEnabled = true, language = getContentLanguage(text)) => {
      if (!voiceEnabled || !text) return;
      const cacheKey = `${language}_${cleanTextForTts(text, language) || text}`;
      if (voiceCache[cacheKey] || inFlightAudioFetches[cacheKey] || Object.keys(inFlightAudioFetches).length >= 3) return;

      const controller = new AbortController();
      const entry = { controller, promise: null };
      entry.promise = fetchTtsAudio(text, controller.signal, language)
        .catch(() => null)
        .finally(() => {
          if (inFlightAudioFetches[cacheKey] === entry) delete inFlightAudioFetches[cacheKey];
        });
      inFlightAudioFetches[cacheKey] = entry;
    };

    // توليد الصوت الذكي بنبرة المساعد الصوتي وتشغيله فوراً وبدون أي تأخير
    const speakText = async (text, voiceEnabled = true, language = getContentLanguage(text)) => {
      if (!voiceEnabled || !text) {
        stopAllSpeech();
        return;
      }

      stopAllSpeech();
      const currentSpeechId = ++activeSpeechId;
      activeAbortController = new AbortController();
      const abortSignal = activeAbortController.signal;

      const cacheKey = `${language}_${cleanTextForTts(text, language) || text}`;

      const playDirectBuffer = (buf) => {
        try {
          if (currentAudioSource) { try { currentAudioSource.stop(); } catch(e){} }
          const source = audioCtx.createBufferSource();
          source.buffer = buf;
          const gainNode = audioCtx.createGain();
          gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.015);
          const fadeStart = Math.max(0, buf.duration - 0.02);
          gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime + fadeStart);
          gainNode.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + buf.duration);
          source.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          source.onended = () => {
            if (currentAudioSource === source) {
              currentAudioSource = null;
              try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
            }
          };
          try { window.__onSpeechStateChange?.({ status: 'speaking', text }); } catch(e){}
          source.start();
          currentAudioSource = source;
          return true;
        } catch(e) {
          return false;
        }
      };

      if (!audioCtx) initAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch(e){}
      }

      if (currentSpeechId !== activeSpeechId || abortSignal.aborted) return;
      // 1. إذا كان الصوت مخزناً وجاهزاً في الذاكرة (من التحميل المسبق): تشغيل فوري بدون أي انتظار (<1ms)
      if (voiceCache[cacheKey]) {
        if (currentSpeechId !== activeSpeechId) return;
        const item = voiceCache[cacheKey];
        if (item.buffer && playDirectBuffer(item.buffer)) return;
        await playBase64Audio(item.data, item.mimeType, currentSpeechId, item.buffer, text);
        return;
      }

      // 2. إذا كان الصوت قيد التحميل المسبق حالياً: انتظار نفس الطلب الجاري بدلاً من تكرار الطلب
      if (inFlightAudioFetches[cacheKey]) {
        try {
          try { window.__onSpeechStateChange?.({ status: 'loading', text }); } catch(e){}
          const item = await inFlightAudioFetches[cacheKey].promise;
          if (currentSpeechId !== activeSpeechId) return;
          if (item) {
            if (item.buffer && playDirectBuffer(item.buffer)) return;
            await playBase64Audio(item.data, item.mimeType, currentSpeechId, item.buffer, text);
            return;
          }
        } catch(e){}
      }

      // 3. جلب الصوت المباشر من الـ API مع إشعار واجهة المستخدم بحالة التحميل (Loading / Spinning)
      try { window.__onSpeechStateChange?.({ status: 'loading', text }); } catch(e){}
      const result = await fetchTtsAudio(text, abortSignal, language);
      if (currentSpeechId !== activeSpeechId) return;

      if (result) {
        if (result.buffer && playDirectBuffer(result.buffer)) return;
        await playBase64Audio(result.data, result.mimeType, currentSpeechId, result.buffer, text);
        return;
      }

      // 4. في حال عدم توفر صوت الذكاء الاصطناعي أو فشل الاتصال: لا يتم تشغيل أي صوت آلي روبوتي نهائياً
      if (currentSpeechId === activeSpeechId) {
        try { window.__onSpeechStateChange?.({ status: 'idle', text: null }); } catch(e){}
      }
    };

const isShortAnswerQuestion = q => q?.type === 'short_answer';
const isFillBlankQuestion = q => q?.type === 'fill_blank';
const getMagicalMemorySecretSpeech = q => [q?.hint, q?.visualSketch, q?.whyExplanation].filter(Boolean).join('، ');

const clearNarration = () => {
  stopAllSpeech();
  for (const [key, entry] of Object.entries(inFlightAudioFetches)) {
    delete inFlightAudioFetches[key];
    entry.controller.abort();
  }
  boundedVoiceCache.clear();
};
export { installAudioUnlock, clearNarration, playSparkleTone, initAudio, unlockAudio, playClick, playFlipTone, playMasteredTone, playStreakTone, playMemoryAnchor, playCorrect, playWrong, playWin, startAmbientMusic, stopAmbientMusic, triggerConfetti, stopAllSpeech, speakText, prefetchVoice, updatePinkNoiseLive };
export const audioRuntime = { get audioCtx() { return audioCtx; }, get mainGain() { return mainGain; }, get activeBinauralType() { return activeBinauralType; }, get inFlightAudioFetches() { return inFlightAudioFetches; }, get voiceCache() { return voiceCache; }, get voiceCacheKeys() { return voiceCacheKeys; } };
