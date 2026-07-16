(function () {
  "use strict";

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function clampMasterTuningA4(value) {
    const defaults = window.SynthXAudioConfig?.DEFAULTS?.tuning || {};
    const min = Number(defaults.minA4Hz) || 400;
    const max = Number(defaults.maxA4Hz) || 480;
    const fallback = Number(defaults.a4Hz) || 440;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, min, max);
  }

  function getMasterTuningA4() {
    const defaults = window.SynthXAudioConfig?.DEFAULTS?.tuning || {};
    const fallback = Number(defaults.a4Hz) || 440;
    const value = window.SynthXState?.getParameter?.("master-tuning-a4");
    return clampMasterTuningA4(value === undefined || value === null ? fallback : value);
  }

  function midiToFrequency(midi, a4Hz) {
    const reference = a4Hz === undefined || a4Hz === null ? getMasterTuningA4() : clampMasterTuningA4(a4Hz);
    return reference * Math.pow(2, (Number(midi) - 69) / 12);
  }

  function dbToGain(db) {
    return Math.pow(10, Number(db) / 20);
  }

  function msToSeconds(ms) {
    return Math.max(0, Number(ms) || 0) / 1000;
  }

  function safeTime(seconds, minimum) {
    const value = Number(seconds);
    return Number.isFinite(value) ? Math.max(minimum || 0.001, value) : (minimum || 0.001);
  }

  function oscTypeFromUi(value) {
    if (value === "saw") return "sawtooth";
    if (value === "square") return "square";
    if (value === "pulse") return "square"; // fallback sicuro: il PW reale viene gestito dal generatore pulse in audio-context.
    if (value === "triangle") return "triangle";
    return "sine";
  }

  function freqToNormalizedCutoff(freq) {
    const min = Math.log10(20);
    const max = Math.log10(20000);
    const value = (Math.log10(clamp(freq, 20, 20000)) - min) / (max - min);
    return clamp(value, 0, 1);
  }

  function normalizedCutoffToHz(value) {
    const normalized = clamp(value, 0, 1);
    const min = Math.log10(20);
    const max = Math.log10(20000);
    return Math.pow(10, min + ((max - min) * normalized));
  }

  function toneControlToHz(value) {
    const raw = Number(value);
    // Compatibilità prudente: se in futuro/da preset arriva un valore > 1,
    // lo trattiamo come vecchio valore in Hz della v0.6.0.
    if (Number.isFinite(raw) && raw > 1) return clamp(raw, 500, 20000);
    const fallback = window.SynthXAudioConfig?.DEFAULTS?.saturation?.tone ?? 0.86;
    const normalized = clamp(Number.isFinite(raw) ? raw : fallback, 0, 1);
    const min = Math.log10(500);
    const max = Math.log10(20000);
    return Math.round(Math.pow(10, min + ((max - min) * normalized)));
  }

  function dampingControlToHz(value) {
    const normalized = clamp(value, 0, 1);
    const min = Math.log10(650);
    const max = Math.log10(18000);
    return Math.round(Math.pow(10, min + ((max - min) * normalized)));
  }

  function saturateDrive(x, drive) {
    const d = Math.max(1.0001, drive);
    return Math.tanh(x * d) / Math.tanh(d);
  }

  function atanDrive(x, drive) {
    const d = Math.max(1.0001, drive);
    return Math.atan(x * d) / Math.atan(d);
  }

  function clampUnit(x) {
    return Math.max(-1, Math.min(1, x));
  }

  function getEffectModeCharacter(mode) {
    // v0.6.2: differenziazione prudente pensata per sorgenti synth.
    // Su un synth le forme d'onda sono già stabili e armoniche: solo cambiare
    // una curva tanh/atan spesso produce differenze meno evidenti che su chitarra.
    // Questa matrice aggiunge un carattere interno per modalità senza cambiare UI.
    const table = {
      drive:      { wetTrim: 0.74, preDbOffset: -1.0, toneMul: 1.00, outputTrim: 0.98 },
      overdrive:  { wetTrim: 0.72, preDbOffset:  1.5, toneMul: 0.88, outputTrim: 0.95 },
      tube:       { wetTrim: 0.70, preDbOffset:  0.5, toneMul: 0.78, outputTrim: 0.96 },
      tape:       { wetTrim: 0.68, preDbOffset: -0.5, toneMul: 0.55, outputTrim: 0.97 },
      distortion: { wetTrim: 0.60, preDbOffset:  3.0, toneMul: 1.05, outputTrim: 0.86 },
      fuzz:       { wetTrim: 0.48, preDbOffset:  4.0, toneMul: 0.68, outputTrim: 0.78 }
    };
    return table[mode] || table.drive;
  }

  function computeEffectWetGain(cfg) {
    if (!cfg.enabled) return 0;
    const character = getEffectModeCharacter(cfg.mode);
    // Wet controllato: le modalità più dure hanno trim più basso perché generano
    // armoniche e volume percepito più forti.
    return clamp(cfg.mix * character.wetTrim * (0.99 - (cfg.amount * 0.10)), 0, 0.82);
  }

  function computeEffectDryGain(cfg) {
    if (!cfg.enabled) return 1;
    // Mix dry/wet reale: a mix 100% il segnale dry può sparire, così le modalità si distinguono meglio.
    return clamp(1 - cfg.mix, 0, 1);
  }

  function makeSaturationCurve(cfg) {
    const samples = 16384;
    const curve = new Float32Array(samples);
    const amount = clamp(cfg.amount, 0, 1);
    const asym = clamp(cfg.asymmetry, -1, 1);
    const hard = clamp(cfg.hardness, 0, 1);
    const bias = clamp(cfg.bias, -1, 1) * 0.46;
    const gate = clamp(cfg.gate, 0, 0.5);
    const octave = clamp(cfg.octaveBlend, 0, 1);
    const character = getEffectModeCharacter(cfg.mode);

    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      let y = x;

      if (cfg.mode === "overdrive") {
        // Overdrive: soft clipping più ruvido del drive, con risposta positiva e negativa diverse.
        const shifted = x + (asym * 0.075);
        const posDrive = 1 + amount * (18 + Math.max(0, asym) * 16);
        const negDrive = 1 + amount * (9 + Math.max(0, -asym) * 14);
        const shaped = shifted >= 0 ? saturateDrive(shifted, posDrive) : atanDrive(shifted, negDrive);
        const edge = Math.sign(shifted || 1) * Math.pow(Math.abs(shifted), 1.0 + amount * 0.55);
        y = (shaped * 0.82) + (edge * 0.18) - (asym * 0.05);
      } else if (cfg.mode === "tube") {
        // Tube: rotondo, pari-armonico e meno tagliente. L'asimmetria produce seconda armonica.
        const tubeBias = asym * 0.10;
        const evenHarmonic = (x * x - 0.33) * (0.20 + amount * 0.22) * (asym >= 0 ? 1 : -1);
        const triodeLike = atanDrive(x + tubeBias + evenHarmonic, 1 + amount * 9.5);
        const round = saturateDrive(x, 1 + amount * 5.5);
        y = (triodeLike * 0.72) + (round * 0.28) - (tubeBias * 0.55);
      } else if (cfg.mode === "tape") {
        // Tape: soft-knee compresso, più scuro a valle tramite toneMul, con leggero arrotondamento.
        const knee = 0.82 - amount * 0.42;
        const ax = Math.abs(x);
        const overshoot = Math.max(0, ax - knee);
        const compressed = ax < knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh(overshoot * (2.2 + amount * 8.0)));
        const sag = x * (1 - (Math.min(1, ax) * amount * 0.18));
        const soft = atanDrive(sag, 1 + amount * 4.8);
        y = (compressed * 0.58) + (soft * 0.42);
      } else if (cfg.mode === "distortion") {
        // Distortion: più squadrata/hard, con soglia controllata da Hardness.
        const drive = 1 + amount * 34;
        const threshold = 0.78 - (hard * 0.58);
        const driven = x * drive;
        const clipped = clampUnit(driven / Math.max(0.10, threshold));
        const crushed = Math.sign(clipped || 1) * Math.pow(Math.abs(clipped), 0.72 - hard * 0.30);
        const soft = saturateDrive(x, 1 + amount * 9.0);
        y = (soft * (1 - hard) * 0.55) + (crushed * (0.45 + hard * 0.55));
      } else if (cfg.mode === "fuzz") {
        // Fuzz: sporco, gated, compresso, con possibile componente octave.
        let v = x + bias;
        if (Math.abs(v) < gate) v *= 0.08;
        const slammed = clampUnit(v * (1 + amount * 42));
        const power = 0.18 + ((1 - amount) * 0.34);
        const fuzzy = Math.sign(slammed || 1) * Math.pow(Math.abs(slammed), power);
        const octaveComponent = ((Math.abs(fuzzy) * 2) - 1) * (bias >= 0 ? 1 : -1);
        const broken = (fuzzy * (1 - octave)) + (octaveComponent * octave);
        y = clampUnit((broken * 0.92) + (Math.sign(broken || 1) * amount * 0.08));
      } else {
        // Drive/Saturation base: tanh simmetrica, pulita, stabile e pedagogica.
        const clean = saturateDrive(x, 1 + (amount * 8.5));
        const warm = atanDrive(x, 1 + (amount * 4.0));
        y = (clean * 0.78) + (warm * 0.22);
      }

      curve[i] = clampUnit(y * 0.96 * character.outputTrim);
    }
    return curve;
  }

  function effectCurveSignature(cfg) {
    return [
      cfg.mode,
      cfg.amount.toFixed(3),
      cfg.asymmetry.toFixed(3),
      cfg.hardness.toFixed(3),
      cfg.bias.toFixed(3),
      cfg.gate.toFixed(3),
      cfg.octaveBlend.toFixed(3)
    ].join(":");
  }

  function makeSafetyClipCurve() {
    const samples = 4096;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      // Soft clipper finale molto prudente: quasi lineare sotto i picchi,
      // arrotonda solo quando la catena effetti accumula troppa energia.
      curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45) * 0.985;
    }
    return curve;
  }

  function makeNoiseBuffer(context, type) {
    if (!context) return null;
    const sampleRate = context.sampleRate || 44100;
    const length = Math.max(sampleRate * 2, 1);
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Stati separati per i vari colori.
    // La v0.4.1 usava una sola variabile "last" anche per il violet noise:
    // per il violet veniva salvata la derivata precedente invece del campione
    // white precedente. Il risultato era instabile/troppo aggressivo e poco
    // coerente con la famiglia blue/violet. Qui blue e violet hanno stati
    // separati e il violet è una seconda differenza band-limited semplice.
    let brownLast = 0;
    let bluePrevWhite = 0;
    let violetPrevWhite = 0;
    let violetPrevPrevWhite = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let peak = 0;

    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      let sample = white;

      if (type === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === "brown") {
        brownLast = (brownLast + (0.02 * white)) / 1.02;
        sample = brownLast * 3.5;
      } else if (type === "blue") {
        // Blue noise: prima differenza, quindi più energia sugli acuti.
        sample = (white - bluePrevWhite) * 0.5;
        bluePrevWhite = white;
      } else if (type === "violet") {
        // Violet noise: seconda differenza, più ripido del blue noise.
        // Formula: x[n] - 2*x[n-1] + x[n-2].
        sample = (white - (2 * violetPrevWhite) + violetPrevPrevWhite) * 0.25;
        violetPrevPrevWhite = violetPrevWhite;
        violetPrevWhite = white;
      }

      data[i] = sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }

    // Normalizzazione di sicurezza solo se serve: evita campioni troppo caldi
    // senza cambiare il volume percepito quando il colore è già nel range.
    if (peak > 0.98) {
      const scale = 0.98 / peak;
      for (let i = 0; i < length; i += 1) data[i] *= scale;
    }

    return buffer;
  }

  function reverbSignature(cfg) {
    // Damping resta nel low-pass dedicato: l'impulso viene rigenerato solo quando
    // cambiano carattere, size o decay, così il movimento live del damping resta leggero.
    return [cfg.mode, cfg.size.toFixed(3), cfg.decay.toFixed(3)].join(":");
  }

  function makeReverbImpulse(context, cfg) {
    if (!context) return null;
    const sampleRate = context.sampleRate || 44100;
    const mode = ["room", "hall", "plate", "dark"].includes(cfg.mode) ? cfg.mode : "room";

    // v0.18.3a: i quattro caratteri restano nello stesso blocco leggero,
    // ma ora usano profili più separati. L'obiettivo non è simulare un vero
    // riverbero convolutivo da studio, bensì dare differenze musicali udibili:
    // Room = secco/vicino, Hall = ampio/lungo, Plate = denso/brillante,
    // Dark = lungo ma scuro e meno invadente.
    const profile = {
      room: {
        timeMul: 0.42, spread: 0.035, envPow: 4.35, earlyMs: 62,
        earlyGain: 0.58, bodyGain: 0.27, diffusion: 0.055,
        toneMemory: 0.18, shimmer: 0.00, darkTilt: 0.04, floor: 0.00
      },
      hall: {
        timeMul: 1.92, spread: 0.34, envPow: 1.28, earlyMs: 86,
        earlyGain: 0.12, bodyGain: 0.31, diffusion: 0.38,
        toneMemory: 0.34, shimmer: 0.010, darkTilt: 0.10, floor: 0.035
      },
      plate: {
        timeMul: 0.96, spread: 0.16, envPow: 1.06, earlyMs: 16,
        earlyGain: 0.20, bodyGain: 0.24, diffusion: 0.72,
        toneMemory: 0.065, shimmer: 0.072, darkTilt: -0.10, floor: 0.018
      },
      dark: {
        timeMul: 1.55, spread: 0.24, envPow: 2.85, earlyMs: 52,
        earlyGain: 0.10, bodyGain: 0.30, diffusion: 0.30,
        toneMemory: 0.84, shimmer: -0.018, darkTilt: 0.62, floor: 0.012
      }
    }[mode];

    const sizeMul = mode === "room" ? 0.36 + (cfg.size * 1.08) : 0.52 + (cfg.size * 1.82);
    const maxDuration = mode === "room" ? 2.35 : mode === "hall" ? 8.0 : mode === "plate" ? 5.6 : 7.2;
    const duration = clamp(cfg.decay * profile.timeMul * sizeMul, 0.12, maxDuration);
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = context.createBuffer(2, length, sampleRate);
    const earlyLen = Math.max(1, Math.floor(sampleRate * (profile.earlyMs / 1000)));
    const earlyTaps = mode === "room" ? [0.010, 0.017, 0.026, 0.039, 0.054]
      : mode === "hall" ? [0.021, 0.037, 0.061, 0.089, 0.127]
      : mode === "plate" ? [0.006, 0.011, 0.019, 0.031, 0.047]
      : [0.018, 0.034, 0.057, 0.083];

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      let diffuser = 0;
      let toneState = 0;
      let peak = 0;
      const stereo = channel ? 1 - profile.spread : 1 + profile.spread;
      const tapSideShift = channel ? 1.13 : 0.91;

      for (let i = 0; i < length; i += 1) {
        const tNorm = i / Math.max(1, length - 1);
        const env = Math.pow(1 - tNorm, profile.envPow) + (profile.floor * (1 - tNorm));
        let early = i < earlyLen ? (1.0 - (i / earlyLen)) * profile.earlyGain : 0;
        for (let tapIndex = 0; tapIndex < earlyTaps.length; tapIndex += 1) {
          const tapSample = Math.floor(sampleRate * earlyTaps[tapIndex] * tapSideShift);
          if (i === tapSample) early += profile.earlyGain * (0.58 / (tapIndex + 1));
        }

        const noise = (Math.random() * 2 - 1) * stereo;
        diffuser = (diffuser * profile.diffusion) + (noise * (1 - profile.diffusion));
        toneState = (toneState * profile.toneMemory) + (diffuser * (1 - profile.toneMemory));

        const plateTap = mode === "plate" ? Math.sin(i * 0.021 + (channel * 1.7)) * profile.shimmer * env : 0;
        const hallBloom = mode === "hall" ? Math.sin(i * 0.00021 + channel) * profile.shimmer * env : 0;
        const darkTilt = clamp(1 - (tNorm * profile.darkTilt), 0.22, 1.18);
        const brightLift = mode === "plate" ? 1 + (tNorm * 0.18) : 1;
        const body = toneState * (env + early) * profile.bodyGain;
        const sample = (body + plateTap + hallBloom) * darkTilt * brightLift;
        data[i] = sample;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
      }

      // Piccola normalizzazione solo del singolo impulso: mantiene i profili sicuri
      // anche quando size/decay sono alti, senza cambiare il gain staging esterno.
      if (peak > 0.92) {
        const scale = 0.92 / peak;
        for (let i = 0; i < length; i += 1) data[i] *= scale;
      }
    }
    return buffer;
  }

  window.SynthXAudioDsp = Object.freeze({
    clamp,
    clampMasterTuningA4,
    getMasterTuningA4,
    midiToFrequency,
    dbToGain,
    msToSeconds,
    safeTime,
    oscTypeFromUi,
    freqToNormalizedCutoff,
    normalizedCutoffToHz,
    toneControlToHz,
    dampingControlToHz,
    saturateDrive,
    atanDrive,
    clampUnit,
    getEffectModeCharacter,
    computeEffectWetGain,
    computeEffectDryGain,
    makeSaturationCurve,
    effectCurveSignature,
    makeSafetyClipCurve,
    makeNoiseBuffer,
    reverbSignature,
    makeReverbImpulse
  });
})();
