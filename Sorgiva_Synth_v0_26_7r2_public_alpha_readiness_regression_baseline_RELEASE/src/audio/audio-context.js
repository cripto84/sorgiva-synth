(function () {
  "use strict";

  const {
    DEFAULTS,
    TUNING_PARAM_IDS,
    OSC_PARAM_IDS,
    LFO_PARAM_IDS,
    NOISE_PARAM_IDS,
    RING_MOD_PARAM_IDS,
    FM_PARAM_IDS,
    OSC_SYNC_PARAM_IDS,
    UNISON_PARAM_IDS,
    ENV_PARAM_IDS,
    FILTER_ENV_PARAM_IDS,
    FILTER_DRIVE_PARAM_IDS,
    ADV_FILTER_PARAM_IDS,
    FILTER_ENABLE_PARAM_IDS,
    FILTER_LIVE_PARAM_IDS,
    FILTER_PARAM_TO_NAME,
    SAT_PARAM_IDS,
    SAT_CURVE_PARAM_IDS,
    EQ_PARAM_IDS,
    MOD_PARAM_IDS,
    DELAY_PARAM_IDS,
    REVERB_PARAM_IDS,
    SAFETY_PARAM_IDS,
    ARP_PARAM_IDS,
    SEQ_PARAM_IDS,
    VISUAL_PARAM_IDS,
    MOD_MATRIX_PARAM_IDS,
    FX_FAMILY_PARAM_IDS,
    EQ_BAND_DEFS
  } = window.SynthXAudioConfig;

  const {
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
    getEffectModeCharacter,
    computeEffectWetGain,
    computeEffectDryGain,
    makeSaturationCurve,
    effectCurveSignature,
    makeSafetyClipCurve,
    makeNoiseBuffer,
    reverbSignature,
    makeReverbImpulse
  } = window.SynthXAudioDsp;

  const DELAY_SYNC_BEATS = Object.freeze({
    "1/2": 2,
    "1/4": 1,
    "1/8": 0.5,
    "1/8d": 0.75,
    "1/8t": 1 / 3,
    "1/16": 0.25,
    "1/16d": 0.375,
    "1/16t": 1 / 6
  });
  const DELAY_FALLBACK_BPM = 120;
  const DELAY_MAX_SECONDS = 2.0;
  const FM_AMOUNT_MAX = 0.70;
  const FM_INDEX_MAX = 6.0;
  const FM_DEPTH_HZ_OLD_MAX = 5200;
  const FM_DEPTH_HZ_MAX = 6200;

  let context = null;
  let masterGain = null;
  let effectInput = null;
  let effectDryGain = null;
  let effectPreFilter = null;
  let effectPreGain = null;
  let effectShaper = null;
  let effectDcFilter = null;
  let effectToneFilter = null;
  let effectWetGain = null;
  let effectOutput = null;
  let eqInput = null;
  let eqBypassGain = null;
  let eqWetGain = null;
  let eqBands = [];
  let eqOutput = null;
  let modInput = null;
  let modDryGain = null;
  let modOutput = null;
  let modChorusDelay = null;
  let modChorusDelayR = null;
  let modChorusWetGain = null;
  let modChorusWetGainR = null;
  let modChorusFeedbackGain = null;
  let modChorusFeedbackGainR = null;
  let modChorusPanL = null;
  let modChorusPanR = null;
  let modPhaserFilters = [];
  let modPhaserWetGain = null;
  let modLfoOsc = null;
  let modLfoGain = null;
  let modLfoGainR = null;
  let modPhaserLfoGain = null;
  let delayInput = null;
  let delayDryGain = null;
  let delayNode = null;
  let delayFeedbackGain = null;
  let delayDampingFilter = null;
  let delayWetGain = null;
  let delayPingInputGain = null;
  let delayPingDelayL = null;
  let delayPingDelayR = null;
  let delayPingDampL = null;
  let delayPingDampR = null;
  let delayPingWetGainL = null;
  let delayPingWetGainR = null;
  let delayPingFeedbackL = null;
  let delayPingFeedbackR = null;
  let delayPingPanL = null;
  let delayPingPanR = null;
  let delayOutput = null;
  let reverbInput = null;
  let reverbDryGain = null;
  let reverbConvolver = null;
  let reverbDampingFilter = null;
  let reverbWetGain = null;
  let reverbOutput = null;
  let safetyInput = null;
  let safetyBypassGain = null;
  let safetyPreGain = null;
  let safetyLimiter = null;
  let safetyClipper = null;
  let safetyWetGain = null;
  let safetyOutput = null;
  let safetyAnalyser = null;
  let safetyMonitorTimer = null;
  let safetyClipHoldUntil = 0;
  let safetyLastReduction = 1;
  let reverbImpulseTimer = null;
  let lastReverbSignature = "";
  let effectCurveTimer = null;
  let filterDriveCurveTimer = null;
  let lastEffectCurveSignature = "";
  let isReady = false;
  let focusRecoveryTimer = null;
  let focusRecoveryInFlight = false;
  let lastFocusRecoveryAt = 0;
  let releaseTailVoiceCount = 0;
  const voices = new Map();
  const heldNotes = new Set(); // sounding MIDI notes after performance transpose
  const VOICE_MANAGEMENT_LIMITS = Object.freeze({
    releaseTailSafetyMs: 180,
    panicFxDamp: true
  });
  const FX_ROUTING_LIMITS = Object.freeze({
    epsilon: 0.0005,
    modulation: { dryReduction: 0.38, chorusWetTrim: 0.56, ensembleWetTrim: 0.50, phaserWetTrim: 0.62, flangerWetTrim: 0.36, outputTrim: 0.96 },
    delay: { dryReduction: 0.24, wetTrim: 0.66, outputTrim: 0.96 },
    reverb: { dryReduction: 0.20, roomWetTrim: 0.50, hallWetTrim: 0.44, plateWetTrim: 0.40, darkWetTrim: 0.38, outputTrim: 0.96 }
  });

  const VOICE_DECLICK_PROFILES = Object.freeze({
    // v0.23.3c: release-path de-click. La sinusoide rende evidente
    // soprattutto lo scalino di rilascio: usiamo code interne più lente
    // solo per sine/triangle pulite, lasciando più reattivi i timbri ricchi.
    // v0.26.6f: sine/triangle + noise resta click-prone perché il noise
    // maschera ma non elimina lo scalino; usa un profilo morbido dedicato.
    default: { attackMin: 0.005, decayMin: 0.004, releaseMin: 0.018, fastRelease: 0.060, noiseReleaseMin: 0.030 },
    lowHarmonic: { attackMin: 0.012, decayMin: 0.008, releaseMin: 0.090, fastRelease: 0.110, noiseReleaseMin: 0.090 },
    lowHarmonicNoise: { attackMin: 0.012, decayMin: 0.008, releaseMin: 0.075, fastRelease: 0.100, noiseReleaseMin: 0.085 }
  });

  function fxWetActive(enabled, mix) {
    return Boolean(enabled) && clamp(mix, 0, 1) > FX_ROUTING_LIMITS.epsilon;
  }

  function computeFxDryWet(enabled, mix, spec, wetTrim) {
    if (!fxWetActive(enabled, mix)) return { active: false, dry: 1, wet: 0, output: 1 };
    const safeMix = clamp(mix, 0, 1);
    const wet = clamp(safeMix * wetTrim, 0, wetTrim);
    const dry = clamp(1 - (safeMix * spec.dryReduction), 1 - spec.dryReduction, 1);
    const output = clamp(1 - (safeMix * (1 - spec.outputTrim)), spec.outputTrim, 1);
    return { active: true, dry, wet, output };
  }

  function getModulationCharacter(mode, depth) {
    const d = clamp(depth, 0, 1);
    const table = {
      chorus: {
        wetTrim: FX_ROUTING_LIMITS.modulation.chorusWetTrim,
        baseDelay: 0.010 + (d * 0.014),
        baseDelayR: 0.014 + (d * 0.016),
        lfoDepth: 0.0010 + (d * 0.0100),
        lfoDepthR: -(0.0012 + (d * 0.0090)),
        rateMul: 1.00,
        feedback: 0.00,
        pan: 0.46,
        phaserBase: 520 + (d * 680),
        phaserSweep: d * 920,
        phaserQ: 0.72 + (d * 1.15)
      },
      ensemble: {
        wetTrim: FX_ROUTING_LIMITS.modulation.ensembleWetTrim,
        baseDelay: 0.017 + (d * 0.020),
        baseDelayR: 0.024 + (d * 0.024),
        lfoDepth: 0.0015 + (d * 0.0125),
        lfoDepthR: -(0.0020 + (d * 0.0140)),
        rateMul: 0.58,
        feedback: 0.015 + (d * 0.035),
        pan: 0.72,
        phaserBase: 460 + (d * 520),
        phaserSweep: d * 680,
        phaserQ: 0.62 + (d * 0.80)
      },
      phaser: {
        wetTrim: FX_ROUTING_LIMITS.modulation.phaserWetTrim,
        baseDelay: 0.012,
        baseDelayR: 0.014,
        lfoDepth: 0,
        lfoDepthR: 0,
        rateMul: 0.86,
        feedback: 0,
        pan: 0.0,
        phaserBase: 420 + (d * 760),
        phaserSweep: d * 1120,
        phaserQ: 0.78 + (d * 1.65)
      },
      flanger: {
        wetTrim: FX_ROUTING_LIMITS.modulation.flangerWetTrim,
        baseDelay: 0.0022 + (d * 0.0045),
        baseDelayR: 0.0031 + (d * 0.0048),
        lfoDepth: 0.00035 + (d * 0.0036),
        lfoDepthR: -(0.00045 + (d * 0.0032)),
        rateMul: 0.78,
        feedback: clamp(0.04 + (d * 0.24), 0, 0.30),
        pan: 0.32,
        phaserBase: 540 + (d * 620),
        phaserSweep: d * 760,
        phaserQ: 0.70 + (d * 1.10)
      }
    };
    return table[mode] || table.chorus;
  }

  const heldNoteTargets = new Map(); // raw input MIDI note -> sounding MIDI note, protects Note Off when octave changes
  const noiseBuffers = new Map();
  let voiceSerial = 0;
  let sustainPedalDown = false;
  let lastMonoNote = null;
  let pitchBendNormalized = 0;
  let pitchBendRangeSemitones = 2;
  let modWheelNormalized = 0;
  let modWheelSource = null;
  const expressionControllerIds = Object.freeze(["aftertouch", "expression", "breath", "foot"]);
  const expressionControllerValues = { aftertouch: 0, expression: 0, breath: 0, foot: 0 };
  const expressionControllerSources = { aftertouch: null, expression: null, breath: null, foot: null };
  let globalFxModMatrixEntries = [];
  const GLOBAL_FX_MOD_DESTINATION_IDS = Object.freeze([
    "mod_fx_mix", "mod_fx_rate", "mod_fx_depth",
    "delay_mix", "delay_time", "delay_feedback", "delay_damp",
    "reverb_mix", "reverb_damp"
  ]);

  function clampPitchBendValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, -1, 1);
  }

  function clampPitchBendRange(value) {
    const n = Number(value);
    return [2, 7, 12].includes(n) ? n : 2;
  }

  function currentPitchBendCents() {
    return clampPitchBendValue(pitchBendNormalized) * clampPitchBendRange(pitchBendRangeSemitones) * 100;
  }

  function clampModWheelValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, 1);
  }

  function ensureModWheelSource() {
    if (!context || typeof context.createConstantSource !== "function") return null;
    if (modWheelSource) return modWheelSource;
    const t = now();
    modWheelSource = context.createConstantSource();
    modWheelSource.offset.setValueAtTime(clampModWheelValue(modWheelNormalized), t);
    modWheelSource.start(t);
    return modWheelSource;
  }

  function applyModWheelToSource(smooth) {
    if (!modWheelSource?.offset || !context) return false;
    const value = clampModWheelValue(modWheelNormalized);
    const t = now();
    try {
      if (smooth) modWheelSource.offset.setTargetAtTime(value, t, 0.018);
      else modWheelSource.offset.setValueAtTime(value, t);
      return true;
    } catch (_) {
      try { modWheelSource.offset.value = value; return true; } catch (__) { return false; }
    }
  }

  function normalizeExpressionControllerId(id) {
    const key = String(id || "").trim();
    return expressionControllerIds.includes(key) ? key : "";
  }

  function clampExpressionControllerValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, 1);
  }

  function ensureExpressionControllerSource(id) {
    const key = normalizeExpressionControllerId(id);
    if (!key || !context || typeof context.createConstantSource !== "function") return null;
    if (expressionControllerSources[key]) return expressionControllerSources[key];
    const t = now();
    const src = context.createConstantSource();
    src.offset.setValueAtTime(clampExpressionControllerValue(expressionControllerValues[key]), t);
    src.start(t);
    expressionControllerSources[key] = src;
    return src;
  }

  function applyExpressionControllerToSource(id, smooth) {
    const key = normalizeExpressionControllerId(id);
    const src = key ? expressionControllerSources[key] : null;
    if (!src?.offset || !context) return false;
    const value = clampExpressionControllerValue(expressionControllerValues[key]);
    const t = now();
    try {
      if (smooth) src.offset.setTargetAtTime(value, t, 0.018);
      else src.offset.setValueAtTime(value, t);
      return true;
    } catch (_) {
      try { src.offset.value = value; return true; } catch (__) { return false; }
    }
  }

  function setExpressionController(id, value) {
    const key = normalizeExpressionControllerId(id);
    if (!key) return null;
    expressionControllerValues[key] = clampExpressionControllerValue(value);
    applyExpressionControllerToSource(key, true);
    refreshPerformanceRuntime(`expression-controller:${key}`);
    return { id: key, value: expressionControllerValues[key] };
  }

  function resetExpressionControllers() {
    expressionControllerIds.forEach((id) => {
      expressionControllerValues[id] = 0;
      applyExpressionControllerToSource(id, true);
    });
    refreshPerformanceRuntime("expression-controller-reset");
    return getExpressionControllerStatus();
  }

  function getExpressionControllerStatus() {
    return {
      aftertouch: expressionControllerValues.aftertouch,
      expression: expressionControllerValues.expression,
      breath: expressionControllerValues.breath,
      foot: expressionControllerValues.foot
    };
  }

  function applyPitchBendToOscInfo(oscInfo, smooth) {
    if (!oscInfo?.osc?.detune && !Array.isArray(oscInfo?.unisonLayers)) return;
    const fine = Number.isFinite(Number(oscInfo.fine)) ? Number(oscInfo.fine) : 0;
    carrierLayersForOscInfo(oscInfo).forEach((layer) => {
      if (!layer?.osc?.detune) return;
      const target = clamp(fine + currentPitchBendCents() + (Number(layer.detuneOffsetCents) || 0), -2400, 2400);
      if (smooth) smoothAudioParam(layer.osc.detune, target, 0.010);
      else {
        try { layer.osc.detune.setValueAtTime(target, now()); } catch (_) { try { layer.osc.detune.value = target; } catch (__) {} }
      }
    });
    if (oscInfo.ringMod?.modOsc?.detune) {
      const sourceBFine = Number.isFinite(Number(oscInfo.ringMod.sourceBFine)) ? Number(oscInfo.ringMod.sourceBFine) : 0;
      const modTarget = clamp(sourceBFine + currentPitchBendCents(), -2400, 2400);
      if (smooth) smoothAudioParam(oscInfo.ringMod.modOsc.detune, modTarget, 0.010);
      else {
        try { oscInfo.ringMod.modOsc.detune.setValueAtTime(modTarget, now()); } catch (_) { try { oscInfo.ringMod.modOsc.detune.value = modTarget; } catch (__) {} }
      }
    }
    if (oscInfo.fm?.modOsc?.detune) {
      const sourceBFine = Number.isFinite(Number(oscInfo.fm.sourceBFine)) ? Number(oscInfo.fm.sourceBFine) : 0;
      const modTarget = clamp(sourceBFine + currentPitchBendCents(), -2400, 2400);
      if (smooth) smoothAudioParam(oscInfo.fm.modOsc.detune, modTarget, 0.010);
      else {
        try { oscInfo.fm.modOsc.detune.setValueAtTime(modTarget, now()); } catch (_) { try { oscInfo.fm.modOsc.detune.value = modTarget; } catch (__) {} }
      }
    }
    if (oscInfo.oscSync?.syncOsc?.detune) {
      const masterFine = Number.isFinite(Number(oscInfo.oscSync.masterFine)) ? Number(oscInfo.oscSync.masterFine) : 0;
      const syncTarget = clamp(masterFine + currentPitchBendCents(), -2400, 2400);
      if (smooth) smoothAudioParam(oscInfo.oscSync.syncOsc.detune, syncTarget, 0.010);
      else {
        try { oscInfo.oscSync.syncOsc.detune.setValueAtTime(syncTarget, now()); } catch (_) { try { oscInfo.oscSync.syncOsc.detune.value = syncTarget; } catch (__) {} }
      }
    }
  }

  function applyPitchBendToActiveVoices(smooth) {
    if (!context || !isReady) return false;
    let touched = 0;
    voices.forEach((voice) => {
      (voice.oscillators || []).forEach((oscInfo) => {
        applyPitchBendToOscInfo(oscInfo, smooth !== false);
        touched += 1;
      });
    });
    return touched > 0;
  }



  function setStatus(text) {
    const el = document.getElementById("audio-status");
    if (el) el.textContent = text;
  }

  function getParam(id, fallback) {
    const value = window.SynthXState?.getParameter?.(id);
    return value === undefined || value === null || Number.isNaN(value) ? fallback : value;
  }

  function getTuningConfig() {
    const d = DEFAULTS.tuning || { a4Hz: 440, noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si" };
    return {
      a4Hz: clampMasterTuningA4 ? clampMasterTuningA4(getParam("master-tuning-a4", d.a4Hz || 440)) : 440,
      noteNaming: d.noteNaming || "it-Do-Re-Mi-Fa-Sol-La-Si"
    };
  }

  function boolParam(id, fallback) {
    const value = getParam(id, fallback);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "on", "yes"].includes(normalized)) return true;
      if (["false", "0", "off", "no", ""].includes(normalized)) return false;
    }
    return Boolean(value);
  }

  function now() {
    return context?.currentTime || 0;
  }


  function clampPulseWidth(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return clamp(n, 0.05, 0.95);
  }

  function quantizePulseWidth(value) {
    return clampPulseWidth(Math.round(clampPulseWidth(value) * 200) / 200);
  }

  function normalizePwmSource(value) {
    const normalized = String(value || "off").toLowerCase();
    return ["off", "lfo1", "lfo2", "lfo3"].includes(normalized) ? normalized : "off";
  }

  function shouldUsePulseGenerator(wave, pulseWidth, pwmAmount) {
    const normalized = String(wave || "sine");
    const width = clampPulseWidth(pulseWidth);
    const amount = Math.max(0, Number(pwmAmount) || 0);
    // Compatibilità: square nativa resta identica quando PW = 50% e PWM = 0.
    // Pulse esplicita, oppure square con PW/PWM non neutri, usa invece il generatore pulse.
    return normalized === "pulse" || (normalized === "square" && (Math.abs(width - 0.5) > 0.0005 || amount > 0.0005));
  }

  function makePeriodicWave(kind) {
    if (!context) return null;
    const harmonics = 64;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);

    // Reverse saw pedagogica: rampa opposta alla sawtooth nativa.
    // Usiamo una serie di Fourier band-limited semplice. Il segno positivo
    // sulle armoniche sinusoidali inverte la direzione della rampa rispetto
    // alla sawtooth standard più comune.
    if (kind === "saw_rev") {
      for (let n = 1; n <= harmonics; n += 1) {
        imag[n] = 2 / (Math.PI * n);
      }
    }

    return context.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  const periodicWaveCache = new Map();
  function getPeriodicWave(kind) {
    if (!context) return null;
    const sampleRate = context.sampleRate || 44100;
    const key = `${kind}:${sampleRate}`;
    if (!periodicWaveCache.has(key)) periodicWaveCache.set(key, makePeriodicWave(kind));
    return periodicWaveCache.get(key);
  }

  const pulseShaperCurveCache = new Map();
  function getPulseShaperCurve() {
    const key = "zero-threshold";
    if (pulseShaperCurveCache.has(key)) return pulseShaperCurveCache.get(key);
    const length = 2048;
    const curve = new Float32Array(length);
    // v0.22.0c: soglia fissa a zero. Il duty-cycle non viene più simulato
    // riscrivendo la curva via timer JS, ma spostando il segnale in ingresso
    // con ConstantSource/LFO audio-rate. Così il rate dell'LFO è realmente udibile.
    for (let i = 0; i < length; i += 1) {
      const x = (i / (length - 1)) * 2 - 1;
      curve[i] = x <= 0 ? 1 : -1;
    }
    pulseShaperCurveCache.set(key, curve);
    return curve;
  }

  function createPulseShaper() {
    if (!context || typeof context.createWaveShaper !== "function") return null;
    const shaper = context.createWaveShaper();
    shaper.curve = getPulseShaperCurve();
    shaper.oversample = "2x";
    return shaper;
  }

  function pulseBiasOffsetFromWidth(pulseWidth) {
    return 1 - (2 * clampPulseWidth(pulseWidth));
  }

  function createPulseControlChain(oscCfg, lfoConfigs) {
    if (!context || typeof context.createConstantSource !== "function") return null;
    const t = now();
    const pulseShaper = createPulseShaper();
    if (!pulseShaper) return null;
    const baseWidth = clampPulseWidth(oscCfg.pulseWidth);
    const pulseBiasSource = context.createConstantSource();
    pulseBiasSource.offset.setValueAtTime(pulseBiasOffsetFromWidth(baseWidth), t);
    pulseBiasSource.connect(pulseShaper);
    pulseBiasSource.start(t);

    let pwmOsc = null;
    let pwmGain = null;
    let pwmLfoIndex = null;
    const sourceMatch = String(oscCfg.pwmSource || "off").match(/^lfo([123])$/);
    const amount = clamp(oscCfg.pwmAmount, 0, 0.45);
    if (sourceMatch && amount > 0) {
      const lfoIndex = Number(sourceMatch[1]);
      const lfoCfg = (lfoConfigs || [])[lfoIndex - 1] || getLfoConfig(lfoIndex);
      if (lfoCfg?.enabled) {
        pwmOsc = context.createOscillator();
        pwmGain = context.createGain();
        applyOscillatorWaveform(pwmOsc, lfoCfg.wave || "sine");
        pwmOsc.frequency.setValueAtTime(clamp(lfoCfg.effectiveRate || lfoCfg.rate || 1, 0.01, 40), t);
        // Offset PWM: width = base + LFO*amount; offset = 1 - 2*width.
        // Quindi il contributo LFO sul bias è -2*amount.
        pwmGain.gain.setValueAtTime(-2 * amount, t);
        pwmOsc.connect(pwmGain);
        pwmGain.connect(pulseShaper);
        pwmOsc.start(t);
        pwmLfoIndex = lfoIndex;
      }
    }

    return { pulseShaper, pulseBiasSource, pwmOsc, pwmGain, pwmLfoIndex, baseWidth, pwmAmount: amount };
  }

  function updatePulseShaper(shaper) {
    if (!shaper) return false;
    try {
      shaper.curve = getPulseShaperCurve();
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyOscillatorWaveform(oscillator, wave, pulseWidth, pwmAmount) {
    if (!oscillator) return;
    if (wave === "saw_rev") {
      const periodic = getPeriodicWave("saw_rev");
      if (periodic) {
        oscillator.setPeriodicWave(periodic);
        return;
      }
    }
    if (shouldUsePulseGenerator(wave, pulseWidth, pwmAmount)) {
      oscillator.type = "sawtooth";
      return;
    }
    oscillator.type = oscTypeFromUi(wave);
  }

  function getOscConfig(index) {
    const d = DEFAULTS.osc[index];
    return {
      index,
      enabled: boolParam(`osc${index}-enabled`, d.enabled),
      wave: String(getParam(`osc${index}-wave`, d.wave)),
      level: clamp(getParam(`osc${index}-level`, d.level), 0, 1),
      semi: clamp(getParam(`osc${index}-semi`, d.semi), -48, 48),
      fine: clamp(getParam(`osc${index}-fine`, d.fine || 0), -100, 100),
      pan: clamp(getParam(`osc${index}-pan`, d.pan || 0), -1, 1),
      pulseWidth: clampPulseWidth(getParam(`osc${index}-pulse-width`, d.pulseWidth ?? 0.5)),
      pwmAmount: clamp(getParam(`osc${index}-pwm-amount`, d.pwmAmount ?? 0), 0, 0.45),
      pwmSource: normalizePwmSource(getParam(`osc${index}-pwm-source`, d.pwmSource || "off"))
    };
  }

  function getNoiseConfig() {
    return {
      enabled: boolParam("noise-enabled", DEFAULTS.noise.enabled),
      type: String(getParam("noise-type", DEFAULTS.noise.type)),
      db: clamp(getParam("noise-db", DEFAULTS.noise.db), -48, 24)
    };
  }

  function normalizeRingModSource(value, fallback) {
    const normalized = String(value || fallback || "osc1").toLowerCase();
    return ["osc1", "osc2", "osc3"].includes(normalized) ? normalized : String(fallback || "osc1");
  }

  function getRingModConfig() {
    const d = DEFAULTS.ringMod || { enabled: false, sourceA: "osc1", sourceB: "osc2", amount: 0 };
    return {
      enabled: boolParam("ringmod-enabled", d.enabled),
      sourceA: normalizeRingModSource(getParam("ringmod-source-a", d.sourceA), d.sourceA),
      sourceB: normalizeRingModSource(getParam("ringmod-source-b", d.sourceB), d.sourceB),
      amount: clamp(getParam("ringmod-amount", d.amount), 0, 1)
    };
  }

  function normalizeFmSource(value, fallback) {
    const normalized = String(value || fallback || "osc1").toLowerCase();
    return ["osc1", "osc2", "osc3"].includes(normalized) ? normalized : String(fallback || "osc1");
  }

  function getFmConfig() {
    const d = DEFAULTS.fm || { enabled: false, carrier: "osc1", modulator: "osc2", amount: 0 };
    return {
      enabled: boolParam("fm-enabled", d.enabled),
      carrier: normalizeFmSource(getParam("fm-carrier", d.carrier), d.carrier),
      modulator: normalizeFmSource(getParam("fm-modulator", d.modulator), d.modulator),
      amount: clamp(getParam("fm-amount", d.amount), 0, FM_AMOUNT_MAX)
    };
  }

  function normalizeOscSyncSource(value, fallback) {
    const normalized = String(value || fallback || "osc1").toLowerCase();
    return ["osc1", "osc2", "osc3"].includes(normalized) ? normalized : String(fallback || "osc1");
  }

  function getOscSyncConfig() {
    const d = DEFAULTS.oscSync || { enabled: false, master: "osc1", slave: "osc2", amount: 0 };
    const master = normalizeOscSyncSource(getParam("oscsync-master", d.master), d.master);
    const slave = normalizeOscSyncSource(getParam("oscsync-slave", d.slave), d.slave);
    const amount = clamp(getParam("oscsync-amount", d.amount), 0, 1);
    const requestedEnabled = boolParam("oscsync-enabled", d.enabled);
    return {
      enabled: requestedEnabled && master !== slave,
      requestedEnabled,
      invalidPair: requestedEnabled && master === slave,
      master,
      slave,
      amount
    };
  }

  function getUnisonConfig() {
    const d = DEFAULTS.unison || { enabled: false, voices: 2, maxLayers: 3, detune: 7, spread: 0.45 };
    const requestedEnabled = boolParam("unison-enabled", d.enabled);
    const requestedVoices = Math.round(clamp(getParam("unison-voices", d.voices), 1, 12));
    const maxLayers = Math.round(clamp(getParam("unison-max-layers", d.maxLayers), 1, 12));
    const voices = Math.max(1, Math.min(maxLayers, requestedVoices));
    const detune = clamp(getParam("unison-detune", d.detune), 0, 18);
    const spread = clamp(getParam("unison-spread", d.spread), 0, 0.75);
    const enabled = Boolean(requestedEnabled && voices > 1 && (detune > 0.001 || spread > 0.001));
    return { enabled, requestedEnabled, requestedVoices, voices, maxLayers, limitClamped: requestedVoices > maxLayers, detune, spread };
  }

  function unisonDetuneOffsets(cfg) {
    const voices = Math.max(1, Math.min(12, Math.round(Number(cfg?.voices) || 1)));
    const detune = clamp(Number(cfg?.detune) || 0, 0, 18);
    if (voices <= 1 || detune <= 0.001) return new Array(voices).fill(0);
    if (voices === 2) return [-detune * 0.5, detune * 0.5];
    const center = (voices - 1) / 2;
    return Array.from({ length: voices }, (_, i) => ((i - center) / center) * detune);
  }

  function unisonPanOffsets(cfg) {
    const voices = Math.max(1, Math.min(12, Math.round(Number(cfg?.voices) || 1)));
    const spread = clamp(Number(cfg?.spread) || 0, 0, 0.75);
    if (voices <= 1 || spread <= 0.001) return new Array(voices).fill(0);
    if (voices === 2) return [-spread * 0.45, spread * 0.45];
    if (voices === 3) return [-spread * 0.55, 0, spread * 0.55];
    const center = (voices - 1) / 2;
    const span = Math.min(0.95, spread * 0.65);
    return Array.from({ length: voices }, (_, i) => ((i - center) / center) * span);
  }

  function unisonGainCompensation(voices) {
    const count = Math.max(1, Math.min(12, Math.round(Number(voices) || 1)));
    if (count <= 1) return 1;
    // v0.22.4b: il limite layer è configurabile, quindi la compensazione resta essenziale.
    return 1 / Math.sqrt(count);
  }

  function carrierLayersForOscInfo(oscInfo) {
    if (Array.isArray(oscInfo?.unisonLayers) && oscInfo.unisonLayers.length) return oscInfo.unisonLayers;
    return oscInfo?.osc ? [{ osc: oscInfo.osc, detuneOffsetCents: 0, panOffset: 0, panner: null }] : [];
  }

  function getLfoClockBpm() {
    const clock = window.SynthXMidiClock?.getStatus?.() || window.SynthXState?.data?.midiClock || {};
    const bpm = Number(clock.bpm);
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 300) return bpm;
    return 120;
  }

  function getLfoEffectiveRate(rateMode, syncValue, freeRate) {
    if (String(rateMode || "free") !== "sync") return clamp(freeRate, 0.01, 50);
    const bpm = getLfoClockBpm();
    const beatsPerCycle = clamp(syncValue, 0.0625, 16, 1);
    return clamp((bpm / 60) / beatsPerCycle, 0.01, 50);
  }

  function isFilterLfoDest(dest) {
    return ["vcf_cutoff", "hpf_cutoff", "bpf_cutoff", "notch_cutoff"].includes(String(dest || ""));
  }

  function filterNameFromLfoDest(dest) {
    const text = String(dest || "");
    if (text === "vcf_cutoff") return "vcf";
    if (text === "hpf_cutoff") return "hpf";
    if (text === "bpf_cutoff") return "bpf";
    if (text === "notch_cutoff") return "notch";
    return "";
  }

  function isAdvancedFilterLfoDest(dest) {
    return ["adv_filter_freq", "adv_filter_depth", "adv_filter_mix"].includes(String(dest || ""));
  }

  function getLfoConfig(index) {
    const d = DEFAULTS.lfo[index];
    const mode = String(getParam(`lfo${index}-mode`, d.mode));
    const rateMode = String(getParam(`lfo${index}-rate-mode`, d.rateMode || "free")) === "sync" ? "sync" : "free";
    const rate = clamp(getParam(`lfo${index}-rate`, d.rate), 0.01, 50);
    const sync = clamp(getParam(`lfo${index}-sync`, d.sync || 1), 0.0625, 16);
    const targets = {
      1: mode === "global" ? true : boolParam(`lfo${index}-t-osc1`, true),
      2: mode === "global" ? true : boolParam(`lfo${index}-t-osc2`, true),
      3: mode === "global" ? true : boolParam(`lfo${index}-t-osc3`, true)
    };
    return {
      index,
      enabled: boolParam(`lfo${index}-enabled`, d.enabled),
      wave: String(getParam(`lfo${index}-wave`, d.wave)),
      rateMode,
      rate,
      sync,
      effectiveRate: getLfoEffectiveRate(rateMode, sync, rate),
      depth: clamp(getParam(`lfo${index}-depth`, d.depth), 0, 1),
      dest: String(getParam(`lfo${index}-dest`, d.dest)),
      mode,
      targets
    };
  }

  function getFilterConfig(name, type) {
    const d = DEFAULTS.filters[name];
    const slopeRaw = Number(getParam(`${name}-slope`, d.slope || 12));
    const slope = (name === "hpf" || name === "vcf") && slopeRaw >= 24 ? 24 : 12;
    return {
      name,
      type,
      enabled: boolParam(`${name}-enabled`, d.enabled),
      cutoff: normalizedCutoffToHz(getParam(`${name}-cutoff`, freqToNormalizedCutoff(d.cutoff))),
      q: clamp(getParam(`${name}-q`, d.q), 0.1, 20),
      slope,
      keyTrack: name === "vcf" ? clamp(getParam("vcf-keytrack", d.keyTrack || 0), 0, 1) : 0,
      velocity: name === "vcf" ? clamp(getParam("vcf-velocity", d.velocity || 0), 0, 1) : 0
    };
  }

  function getFiltersConfig() {
    return [
      getFilterConfig("hpf", "highpass"),
      getFilterConfig("bpf", "bandpass"),
      getFilterConfig("notch", "notch"),
      getFilterConfig("vcf", "lowpass")
    ];
  }


  function getSaturationConfig() {
    const d = DEFAULTS.saturation;
    const mode = String(getParam("sat-mode", d.mode));
    return {
      enabled: boolParam("sat-enabled", d.enabled),
      mode,
      amount: clamp(getParam("sat-amt", d.amount), 0, 1),
      tone: toneControlToHz(getParam("sat-tone", d.tone)),
      mix: clamp(getParam("sat-mix", d.mix), 0, 1),
      preDb: clamp(getParam("sat-predb", d.preDb), 0, 24),
      voicingPreHz: clamp(getParam("sat-voxpre", d.voicingPreHz), 20, 500),
      dcBlockHz: clamp(getParam("sat-dc", d.dcBlockHz), 5, 60),
      asymmetry: clamp(getParam("sat-asym", d.asymmetry), -1, 1),
      hardness: clamp(getParam("sat-hard", d.hardness), 0, 1),
      bias: clamp(getParam("sat-bias", d.bias), -1, 1),
      gate: clamp(getParam("sat-gate", d.gate), 0, 0.5),
      octaveBlend: clamp(getParam("sat-oct", d.octaveBlend), 0, 1)
    };
  }

  function getEqConfig() {
    const d = DEFAULTS.eq;
    return {
      enabled: boolParam("eq-enabled", d.enabled),
      low: clamp(getParam("eq-low", d.low), -12, 12),
      lowmid: clamp(getParam("eq-lowmid", d.lowmid), -12, 12),
      mid: clamp(getParam("eq-mid", d.mid), -12, 12),
      highmid: clamp(getParam("eq-highmid", d.highmid), -12, 12),
      high: clamp(getParam("eq-high", d.high), -12, 12)
    };
  }


  function getModulationConfig() {
    const d = DEFAULTS.modulation;
    const modeRaw = String(getParam("mod-mode", d.mode));
    const modes = window.SynthXAudioConfig?.MODULATION_MODES || ["chorus", "ensemble", "phaser", "flanger"];
    const mode = modes.includes(modeRaw) ? modeRaw : "chorus";
    return {
      enabled: boolParam("mod-enabled", d.enabled),
      mode,
      rate: clamp(getParam("mod-rate", d.rate), 0.05, 8),
      depth: clamp(getParam("mod-depth", d.depth), 0, 1),
      mix: clamp(getParam("mod-mix", d.mix), 0, 1)
    };
  }

  function currentDelaySyncBpm() {
    try {
      const clock = window.SynthXMidiClock;
      const status = clock?.getStatus?.() || window.SynthXState?.snapshot?.()?.midiClock || {};
      const bpm = Number(status.bpm);
      if (clock?.isExternalUsable?.() && Number.isFinite(bpm) && bpm >= 20 && bpm <= 300) return bpm;
    } catch (__) {}
    return DELAY_FALLBACK_BPM;
  }

  function delaySyncToSeconds(syncValue) {
    const key = Object.prototype.hasOwnProperty.call(DELAY_SYNC_BEATS, String(syncValue)) ? String(syncValue) : DEFAULTS.delay.sync;
    const bpm = currentDelaySyncBpm();
    const quarterSeconds = 60 / clamp(bpm, 20, 300);
    return clamp(quarterSeconds * DELAY_SYNC_BEATS[key], 0.035, DELAY_MAX_SECONDS);
  }

  function getDelayConfig() {
    const d = DEFAULTS.delay;
    const modeRaw = String(getParam("delay-mode", d.mode));
    const timeModeRaw = String(getParam("delay-time-mode", d.timeMode));
    const syncRaw = String(getParam("delay-sync", d.sync));
    const timeMode = timeModeRaw === "sync" ? "sync" : "free";
    const sync = Object.prototype.hasOwnProperty.call(DELAY_SYNC_BEATS, syncRaw) ? syncRaw : d.sync;
    const freeTime = clamp(getParam("delay-time", d.time), 0.05, 1.20);
    return {
      enabled: boolParam("delay-enabled", d.enabled),
      mode: modeRaw === "pingpong" ? "pingpong" : "mono",
      timeMode,
      sync,
      freeTime,
      time: timeMode === "sync" ? delaySyncToSeconds(sync) : freeTime,
      feedback: clamp(getParam("delay-feedback", d.feedback), 0, 0.72),
      dampingHz: dampingControlToHz(getParam("delay-damp", d.damping)),
      mix: clamp(getParam("delay-mix", d.mix), 0, 1)
    };
  }

  function getReverbConfig() {
    const d = DEFAULTS.reverb;
    const modeRaw = String(getParam("rev-mode", d.mode));
    const modes = window.SynthXAudioConfig?.REVERB_MODES || ["room", "hall", "plate", "dark"];
    const mode = modes.includes(modeRaw) ? modeRaw : "room";
    return {
      enabled: boolParam("rev-enabled", d.enabled),
      mode,
      size: clamp(getParam("rev-size", d.size), 0, 1),
      decay: clamp(getParam("rev-decay", d.decay), 0.2, 6),
      dampingHz: dampingControlToHz(getParam("rev-damp", d.damping)),
      mix: clamp(getParam("rev-mix", d.mix), 0, 1)
    };
  }

  function getFxStackCompensation() {
    // v0.18.6: protezione musicale globale quando Modulazione + Delay + Reverb
    // sono tutti molto bagnati. Non cambia il routing e non spegne i singoli FX:
    // abbassa solo leggermente wet/output/feedback nei casi estremi per evitare
    // accumuli di volume o code troppo dense prima della Safety.
    const mod = getModulationConfig();
    const delay = getDelayConfig();
    const reverb = getReverbConfig();
    const modWet = fxWetActive(mod.enabled, mod.mix) ? mod.mix : 0;
    const delayWet = fxWetActive(delay.enabled, delay.mix) ? delay.mix : 0;
    const reverbWet = fxWetActive(reverb.enabled, reverb.mix) ? reverb.mix : 0;
    const activeCount = [modWet, delayWet, reverbWet].filter((v) => v > FX_ROUTING_LIMITS.epsilon).length;
    const load = clamp((modWet * 0.30) + (delayWet * 0.38) + (reverbWet * 0.32), 0, 1.25);
    const countPenalty = activeCount >= 3 ? 0.045 : activeCount === 2 ? 0.020 : 0;
    const wetScale = clamp(1 - Math.max(0, load - 0.52) * 0.20 - countPenalty, 0.82, 1);
    const feedbackScale = clamp(1 - Math.max(0, load - 0.45) * 0.18 - (activeCount >= 3 ? 0.035 : 0), 0.80, 1);
    const outputScale = clamp(1 - Math.max(0, load - 0.72) * 0.08, 0.94, 1);
    return { load, activeCount, wetScale, feedbackScale, outputScale };
  }

  function getSafetyConfig() {
    const d = DEFAULTS.safety;
    return {
      enabled: boolParam("safety-enabled", d.enabled),
      thresholdDb: clamp(getParam("safety-threshold", d.thresholdDb), -24, 0),
      releaseMs: clamp(getParam("safety-release", d.releaseMs), 20, 500),
      gainGuard: boolParam("safety-gain-guard", d.gainGuard),
      guardDepth: clamp(getParam("safety-guard-depth", d.guardDepth), 0, 0.50),
      feedbackGuard: boolParam("safety-feedback-guard", d.feedbackGuard)
    };
  }

  function getEnvelopeConfig() {
    const d = DEFAULTS.env;
    return {
      curve: String(getParam("env-curve", d.curve)),
      attack: msToSeconds(clamp(getParam("env-att", d.attackMs), 0, 2000)),
      decay: msToSeconds(clamp(getParam("env-dec", d.decayMs), 0, 3000)),
      sustain: clamp(getParam("env-sus", d.sustain), 0, 1),
      release: msToSeconds(clamp(getParam("env-rel", d.releaseMs), 0, 5000))
    };
  }

  function getFilterEnvConfig() {
    const d = DEFAULTS.filterEnv || { amount: 0, target: "vcf", polarity: "normal", attackMs: 10, decayMs: 180, sustain: 0.45, releaseMs: 240 };
    const targetRaw = String(getParam("filter-env-target", d.target || "vcf"));
    const target = ["vcf", "hpf", "bpf", "notch"].includes(targetRaw) ? targetRaw : "vcf";
    const polarityRaw = String(getParam("filter-env-polarity", d.polarity || "normal"));
    return {
      amount: clamp(getParam("filter-env-amount", d.amount || 0), 0, 1),
      target,
      polarity: polarityRaw === "inverted" ? "inverted" : "normal",
      attack: msToSeconds(clamp(getParam("filter-env-att", d.attackMs || 10), 0, 2000)),
      decay: msToSeconds(clamp(getParam("filter-env-dec", d.decayMs || 180), 0, 3000)),
      sustain: clamp(getParam("filter-env-sus", d.sustain ?? 0.45), 0, 1),
      release: msToSeconds(clamp(getParam("filter-env-rel", d.releaseMs || 240), 0, 5000))
    };
  }


  function getFilterDriveConfig() {
    const d = DEFAULTS.filterDrive || { enabled: false, mode: "clean", amount: 0, trimDb: 0 };
    const rawMode = String(getParam("filter-drive-mode", d.mode || "clean"));
    const mode = ["clean", "warm", "dirty"].includes(rawMode) ? rawMode : "clean";
    return {
      enabled: boolParam("filter-drive-enabled", d.enabled),
      mode,
      amount: clamp(getParam("filter-drive-amount", d.amount || 0), 0, 1),
      trimDb: clamp(getParam("filter-drive-trim", d.trimDb || 0), -12, 3)
    };
  }

  function getAdvancedFilterConfig() {
    const d = DEFAULTS.advancedFilter || { enabled: false, mode: "allpass", freq: 1200, depth: 0, mix: 0, vowel: "a", envFreq: 0, velocityDepth: 0, velocityMix: 0 };
    const modeRaw = String(getParam("adv-filter-mode", d.mode || "allpass"));
    const vowelRaw = String(getParam("adv-filter-vowel", d.vowel || "a"));
    const mode = ["allpass", "resonator", "vowel", "comb"].includes(modeRaw) ? modeRaw : "allpass";
    return {
      enabled: boolParam("adv-filter-enabled", d.enabled),
      mode,
      freq: normalizedCutoffToHz(getParam("adv-filter-freq", freqToNormalizedCutoff(d.freq || 1200))),
      depth: clamp(getParam("adv-filter-depth", d.depth || 0), 0, 1),
      mix: clamp(getParam("adv-filter-mix", d.mix || 0), 0, 1),
      vowel: ["a", "e", "i", "o", "u"].includes(vowelRaw) ? vowelRaw : "a",
      envFreq: clamp(getParam("adv-filter-env-freq", d.envFreq || 0), 0, 1),
      velocityDepth: clamp(getParam("adv-filter-vel-depth", d.velocityDepth || 0), 0, 1),
      velocityMix: clamp(getParam("adv-filter-vel-mix", d.velocityMix || 0), 0, 1)
    };
  }


  function getModMatrixConfig() {
    const helper = window.SynthXModulationMatrix;
    if (helper?.readMatrixFromParameters) {
      return helper.readMatrixFromParameters((id) => getParam(id, undefined));
    }
    return (DEFAULTS.modulationMatrix || []).map((slot, index) => ({
      index: index + 1,
      enabled: Boolean(slot?.enabled),
      source: String(slot?.source || "lfo1"),
      destination: String(slot?.destination || "vcf_cutoff"),
      amount: clamp(slot?.amount || 0, -1, 1)
    }));
  }

  function isModMatrixParam(id) {
    const key = String(id || "");
    return (Array.isArray(MOD_MATRIX_PARAM_IDS) && MOD_MATRIX_PARAM_IDS.includes(key)) || /^modmat-slot[1-8]-(enabled|source|destination|amount)$/.test(key);
  }

  function filterDriveCharacter(mode) {
    const table = {
      clean: { driveMul: 2.2, blend: 0.42, bias: 0.00, autoTrimDb: -1.4 },
      warm:  { driveMul: 4.2, blend: 0.66, bias: 0.045, autoTrimDb: -3.0 },
      dirty: { driveMul: 8.8, blend: 0.86, bias: 0.075, autoTrimDb: -5.8 }
    };
    return table[mode] || table.clean;
  }

  function makeFilterDriveCurve(cfg) {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const amount = cfg?.enabled ? clamp(cfg.amount || 0, 0, 1) : 0;
    const character = filterDriveCharacter(cfg?.mode || "clean");
    if (amount <= 0.0001) {
      for (let i = 0; i < samples; i += 1) curve[i] = (i / (samples - 1)) * 2 - 1;
      return curve;
    }
    const drive = 1 + (amount * character.driveMul);
    const blend = clamp(character.blend * (0.25 + amount * 0.75), 0, 0.95);
    const bias = character.bias * amount;
    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      let shaped;
      if (cfg.mode === "dirty") {
        const pushed = x + bias;
        const tanh = Math.tanh(pushed * drive) / Math.tanh(drive);
        const atan = Math.atan(pushed * (1 + amount * 12)) / Math.atan(1 + amount * 12);
        const edge = Math.sign(pushed || 1) * Math.pow(Math.abs(Math.max(-1, Math.min(1, pushed * (1 + amount * 2.0)))), 0.70);
        shaped = (tanh * 0.50) + (atan * 0.25) + (edge * 0.25) - (bias * 0.58);
      } else if (cfg.mode === "warm") {
        const pushed = x + bias;
        const tanh = Math.tanh(pushed * drive) / Math.tanh(drive);
        const even = (x * x - 0.33) * amount * 0.16;
        shaped = (tanh * 0.82) + (even * 0.18) - (bias * 0.52);
      } else {
        shaped = Math.atan(x * drive) / Math.atan(drive);
      }
      curve[i] = clamp((x * (1 - blend)) + (shaped * blend), -1, 1) * 0.985;
    }
    return curve;
  }

  function computeFilterDriveRiskTrimDb(cfg, filtersCfg) {
    if (!cfg?.enabled || cfg.amount <= 0) return 0;
    const amount = clamp(cfg.amount, 0, 1);
    const filters = Array.isArray(filtersCfg) ? filtersCfg : getFiltersConfig();
    let risk = 0;
    filters.forEach((filter) => {
      if (!filter?.enabled || !(filter.name === "hpf" || filter.name === "vcf")) return;
      if (Number(filter.slope) < 24) return;
      const qRisk = clamp((Number(filter.q || 0) - 1.4) / 7.5, 0, 1);
      risk = Math.max(risk, qRisk);
    });
    if (risk <= 0) return 0;
    const envRisk = clamp(getFilterEnvConfig().amount || 0, 0, 1) * 0.25;
    return -2.4 * amount * clamp(risk + envRisk, 0, 1);
  }

  function computeFilterDriveTrimGain(cfg, filtersCfg) {
    if (!cfg?.enabled || cfg.amount <= 0) return 1;
    const character = filterDriveCharacter(cfg.mode);
    const autoTrimDb = character.autoTrimDb * clamp(cfg.amount, 0, 1);
    const riskTrimDb = computeFilterDriveRiskTrimDb(cfg, filtersCfg);
    return dbToGain(clamp((cfg.trimDb || 0) + autoTrimDb + riskTrimDb, -20, 3));
  }


  function getPerformanceConfig() {
    const d = DEFAULTS.performance;
    const octave = Math.round(clamp(getParam("performance-octave", d.octave), -2, 2));
    const modeRaw = String(getParam("performance-mode", d.mode));
    const mode = modeRaw === "mono" ? "mono" : "poly";
    const hold = boolParam("performance-hold-enabled", d.hold);
    const glideEnabled = boolParam("performance-glide-enabled", d.glideEnabled);
    const glideMs = clamp(getParam("performance-glide-ms", d.glideMs), 0, 500);
    const keyVelocity = clamp(getParam("performance-key-velocity", d.keyVelocity ?? 1), 0.05, 1);
    const curveRaw = String(getParam("performance-velocity-curve", d.velocityCurve || "linear"));
    const velocityCurve = ["linear", "soft", "hard"].includes(curveRaw) ? curveRaw : "linear";
    return { octave, mode, hold, glideEnabled, glideMs, glideSeconds: glideEnabled ? msToSeconds(glideMs) : 0, keyVelocity, velocityCurve };
  }

  function getPerformanceNote(rawNote) {
    const note = Number(rawNote);
    if (!Number.isFinite(note)) return note;
    const cfg = getPerformanceConfig();
    return Math.round(clamp(note + (cfg.octave * 12), 0, 127));
  }

  function applyVelocityCurve(rawVelocity) {
    const cfg = getPerformanceConfig();
    const value = clamp(rawVelocity ?? 1, 0, 1);
    if (!boolParam("performance.velocityEnabled", DEFAULTS.performanceVelocity)) return 1;
    if (cfg.velocityCurve === "soft") return clamp(Math.sqrt(value), 0, 1);
    if (cfg.velocityCurve === "hard") return clamp(Math.pow(value, 1.7), 0, 1);
    return value;
  }

  function refreshPerformanceRuntime(action) {
    const cfg = getPerformanceConfig();
    window.SynthXState?.updatePerformance?.({
      octaveShift: cfg.octave,
      mode: cfg.mode,
      holdEnabled: cfg.hold,
      glideEnabled: cfg.glideEnabled,
      glideMs: cfg.glideMs,
      keyVelocity: cfg.keyVelocity,
      velocityCurve: cfg.velocityCurve,
      activeVoiceCount: voices.size,
      heldNoteCount: heldNotes.size,
      lastAction: action || ""
    });
    const tuning = getTuningConfig();
    window.SynthXState?.updateTuning?.({
      a4Hz: tuning.a4Hz,
      noteNaming: tuning.noteNaming,
      lastAction: action || "runtime"
    });
    window.SynthXControls?.updatePerformanceUiStatus?.();
  }

  function isLowHarmonicWave(wave) {
    const normalized = String(wave || "sine");
    return normalized === "sine" || normalized === "triangle";
  }

  function voiceHasAudibleNoise(voice) {
    return Boolean(voice?.noise) && Math.max(0, Number(voice.noise.baseGainValue) || 0) > 0.0001;
  }

  function voiceUsesLowHarmonicDeClick(voice) {
    if (!voice) return false;
    const active = (voice.oscillators || []).filter((info) => Math.max(0, Number(info?.baseGainValue) || 0) > 0.0001);
    if (!active.length) return false;
    return active.every((info) => isLowHarmonicWave(info?.wave));
  }

  function voiceDeClickProfile(voice) {
    if (voiceUsesLowHarmonicDeClick(voice)) {
      return voiceHasAudibleNoise(voice) ? VOICE_DECLICK_PROFILES.lowHarmonicNoise : VOICE_DECLICK_PROFILES.lowHarmonic;
    }
    return VOICE_DECLICK_PROFILES.default;
  }

  function holdAudioParam(param, t, fallbackValue) {
    if (!param) return;
    try {
      if (typeof param.cancelAndHoldAtTime === "function") {
        param.cancelAndHoldAtTime(t);
        return;
      }
    } catch (_) {}
    try {
      const current = Number.isFinite(fallbackValue) ? fallbackValue : (Number.isFinite(param.value) ? param.value : 0.0001);
      param.cancelScheduledValues(t);
      param.setValueAtTime(Math.max(0.0001, current), t);
    } catch (_) {}
  }

  function estimateAmpEnvelopeLevel(voice, at) {
    const env = voice?.ampEnvelope || null;
    if (!env) return Number.isFinite(voice?.output?.gain?.value) ? voice.output.gain.value : 0.0001;
    const elapsed = Math.max(0, at - (Number(env.startedAt) || at));
    const attack = Math.max(Number(env.attack) || 0, 0.0001);
    const decay = Math.max(Number(env.decay) || 0, 0.0001);
    const sustain = clamp(env.sustain ?? 1, 0.0001, 1);
    if (elapsed <= attack) return clamp(elapsed / attack, 0.0001, 1);
    if (elapsed <= attack + decay) {
      const phase = clamp((elapsed - attack) / decay, 0, 1);
      return clamp(1 + ((sustain - 1) * phase), 0.0001, 1);
    }
    return sustain;
  }

  function applyAmpEnvelope(voice, env) {
    if (!voice?.output || !context) return;
    const t = now();
    const profile = voiceDeClickProfile(voice);
    // v0.23.3c: il de-click resta selettivo per tipo d'onda.
    // La correzione principale è ora sul release path: la nota non deve
    // produrre uno scalino quando viene lasciato il tasto o quando una voce
    // viene sostituita/rilasciata mentre altre continuano a suonare.
    const attack = Math.max(Number(env.attack) || 0, profile.attackMin);
    const decay = Math.max(Number(env.decay) || 0, profile.decayMin);
    const sustain = Math.max(0.0001, env.sustain);
    const gain = voice.output.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0.0001, t);

    if (env.curve === "exp") {
      gain.exponentialRampToValueAtTime(1, t + attack);
      gain.exponentialRampToValueAtTime(sustain, t + attack + safeTime(decay, profile.decayMin));
    } else {
      gain.linearRampToValueAtTime(1, t + attack);
      gain.linearRampToValueAtTime(sustain, t + attack + decay);
    }
    voice.ampEnvelope = {
      startedAt: t,
      attack,
      decay,
      sustain,
      curve: env.curve === "exp" ? "exp" : "linear",
      profile: voiceUsesLowHarmonicDeClick(voice) ? (voiceHasAudibleNoise(voice) ? "lowHarmonicNoise" : "lowHarmonic") : "default"
    };
  }

  function applyAmpRelease(voice, fast) {
    if (!voice?.output || !context) return 0.05;
    const env = getEnvelopeConfig();
    const t = now();
    const profile = voiceDeClickProfile(voice);
    const lowHarmonic = voiceUsesLowHarmonicDeClick(voice);
    const release = fast ? profile.fastRelease : Math.max(env.release, profile.releaseMin);
    const gain = voice.output.gain;
    holdAudioParam(gain, t, estimateAmpEnvelopeLevel(voice, t));

    // v0.23.3c: con sine/triangle pure il click riferito dall'utente avviene
    // al rilascio del tasto. Per queste onde evitiamo rampe lineari troppo
    // secche e usiamo setTargetAtTime, che è più morbido sul punto di release.
    // Le onde ricche mantengono rampe più rapide per non perdere punch.
    if (lowHarmonic) {
      const tc = Math.max(0.018, release / 4);
      try { gain.setTargetAtTime(0.0001, t, tc); }
      catch (_) {
        const endAt = t + safeTime(release, profile.releaseMin);
        try { gain.linearRampToValueAtTime(0.0001, endAt); } catch (__) {}
      }
      return Math.max(0.090, release * 1.25);
    }

    const endAt = t + safeTime(release, fast ? Math.min(0.035, profile.fastRelease) : profile.releaseMin);
    if (env.curve === "exp") {
      try { gain.exponentialRampToValueAtTime(0.0001, endAt); } catch (_) { gain.setTargetAtTime(0.0001, t, Math.max(0.010, release / 4)); }
    } else {
      try { gain.linearRampToValueAtTime(0.0001, endAt); } catch (_) { gain.setTargetAtTime(0.0001, t, Math.max(0.010, release / 4)); }
    }
    return Math.max(0.050, release);
  }

  function estimateNoiseGainLevel(voice, at) {
    const info = voice?.noise;
    if (!info) return 0.0001;
    const target = clamp(Math.max(0, Number(info.baseGainValue) || 0), 0.0001, 1);
    const startedAt = Number(info.startedAt) || at;
    const tc = Math.max(0.001, Number(info.attackTimeConstant) || 0.012);
    const elapsed = Math.max(0, at - startedAt);
    // GainNode.setTargetAtTime(target, startedAt, tc) approaches the target
    // exponentially from 0.0001. This estimate avoids a fallback jump when
    // the note is released very quickly after key-down.
    return clamp(target + ((0.0001 - target) * Math.exp(-elapsed / tc)), 0.0001, target);
  }

  function applyNoiseRelease(voice, releaseSeconds, fast) {
    if (!voice?.noise?.gain?.gain || !context) return 0;
    const t = now();
    const profile = voiceDeClickProfile(voice);
    const minRelease = Math.max(0.012, Number(profile.noiseReleaseMin) || 0.030);
    const desired = fast ? Math.max(minRelease * 0.70, Math.min(Number(releaseSeconds) || minRelease, Number(profile.fastRelease) || minRelease)) : Math.max(Number(releaseSeconds) || minRelease, minRelease);
    const gain = voice.noise.gain.gain;
    holdAudioParam(gain, t, estimateNoiseGainLevel(voice, t));
    try {
      gain.setTargetAtTime(0.0001, t, Math.max(0.010, desired / 4));
    } catch (_) {
      const endAt = t + safeTime(desired, minRelease);
      try { gain.linearRampToValueAtTime(0.0001, endAt); } catch (__) {}
    }
    return Math.max(0.050, desired * 1.20);
  }

  function getGlobalConfig() {
    return {
      master: clamp(getParam("master", DEFAULTS.master), 0, 1),
      maxVoices: Math.max(1, Math.floor(clamp(getParam("voices", DEFAULTS.maxVoices), 1, 64))),
      performanceVelocity: boolParam("performance.velocityEnabled", DEFAULTS.performanceVelocity),
      performanceSustain: boolParam("performance.sustainEnabled", DEFAULTS.performanceSustain),
      performance: getPerformanceConfig(),
      envelope: getEnvelopeConfig(),
      filterEnvelope: getFilterEnvConfig(),
      filterDrive: getFilterDriveConfig(),
      advancedFilter: getAdvancedFilterConfig(),
      modulationMatrix: getModMatrixConfig(),
      oscillators: [getOscConfig(1), getOscConfig(2), getOscConfig(3)],
      noise: getNoiseConfig(),
      ringMod: getRingModConfig(),
      fm: getFmConfig(),
      oscSync: getOscSyncConfig(),
      unison: getUnisonConfig(),
      filters: getFiltersConfig(),
      saturation: getSaturationConfig(),
      eq: getEqConfig(),
      modulation: getModulationConfig(),
      delay: getDelayConfig(),
      reverb: getReverbConfig(),
      safety: getSafetyConfig(),
      lfos: [getLfoConfig(1), getLfoConfig(2), getLfoConfig(3)]
    };
  }

  function ensureNodes() {
    if (!context) return false;
    if (!masterGain) {
      masterGain = context.createGain();
      masterGain.gain.value = clamp(getParam("master", DEFAULTS.master), 0, 1);
      masterGain.connect(context.destination);
    }
    if (!effectInput) {
      const t = now();
      effectInput = context.createGain();
      effectDryGain = context.createGain();
      effectPreFilter = context.createBiquadFilter();
      effectPreGain = context.createGain();
      effectShaper = context.createWaveShaper();
      effectDcFilter = context.createBiquadFilter();
      effectToneFilter = context.createBiquadFilter();
      effectWetGain = context.createGain();
      effectOutput = context.createGain();
      eqInput = context.createGain();
      eqBypassGain = context.createGain();
      eqWetGain = context.createGain();
      eqOutput = context.createGain();
      modInput = context.createGain();
      modDryGain = context.createGain();
      modOutput = context.createGain();
      modChorusDelay = context.createDelay(0.09);
      modChorusDelayR = context.createDelay(0.09);
      modChorusWetGain = context.createGain();
      modChorusWetGainR = context.createGain();
      modChorusFeedbackGain = context.createGain();
      modChorusFeedbackGainR = context.createGain();
      modChorusPanL = context.createStereoPanner ? context.createStereoPanner() : null;
      modChorusPanR = context.createStereoPanner ? context.createStereoPanner() : null;
      modPhaserWetGain = context.createGain();
      modLfoOsc = context.createOscillator();
      modLfoGain = context.createGain();
      modLfoGainR = context.createGain();
      modPhaserLfoGain = context.createGain();
      delayInput = context.createGain();
      delayDryGain = context.createGain();
      delayNode = context.createDelay(2.2);
      delayFeedbackGain = context.createGain();
      delayDampingFilter = context.createBiquadFilter();
      delayWetGain = context.createGain();
      delayPingInputGain = context.createGain();
      delayPingDelayL = context.createDelay(2.2);
      delayPingDelayR = context.createDelay(2.2);
      delayPingDampL = context.createBiquadFilter();
      delayPingDampR = context.createBiquadFilter();
      delayPingWetGainL = context.createGain();
      delayPingWetGainR = context.createGain();
      delayPingFeedbackL = context.createGain();
      delayPingFeedbackR = context.createGain();
      delayPingPanL = context.createStereoPanner ? context.createStereoPanner() : null;
      delayPingPanR = context.createStereoPanner ? context.createStereoPanner() : null;
      delayOutput = context.createGain();
      reverbInput = context.createGain();
      reverbDryGain = context.createGain();
      reverbConvolver = context.createConvolver();
      reverbDampingFilter = context.createBiquadFilter();
      reverbWetGain = context.createGain();
      reverbOutput = context.createGain();
      safetyInput = context.createGain();
      safetyBypassGain = context.createGain();
      safetyPreGain = context.createGain();
      safetyLimiter = context.createDynamicsCompressor();
      safetyClipper = context.createWaveShaper();
      safetyWetGain = context.createGain();
      safetyOutput = context.createGain();
      safetyAnalyser = context.createAnalyser();
      eqBands = EQ_BAND_DEFS.map((band) => {
        const node = context.createBiquadFilter();
        node.type = band.type;
        node.frequency.setValueAtTime(band.frequency, t);
        node.Q.setValueAtTime(band.q, t);
        node.gain.setValueAtTime(0, t);
        return { ...band, node };
      });

      modPhaserFilters = [0, 1, 2, 3].map((_, index) => {
        const node = context.createBiquadFilter();
        node.type = "allpass";
        node.frequency.setValueAtTime(620 + (index * 360), t);
        node.Q.setValueAtTime(0.85, t);
        return node;
      });

      effectPreFilter.type = "highpass";
      effectDcFilter.type = "highpass";
      effectToneFilter.type = "lowpass";
      effectShaper.oversample = "4x";
      effectOutput.gain.setValueAtTime(0.85, t);
      modDryGain.gain.setValueAtTime(1, t);
      modOutput.gain.setValueAtTime(1, t);
      modChorusWetGain.gain.setValueAtTime(0, t);
      modChorusWetGainR.gain.setValueAtTime(0, t);
      modChorusFeedbackGain.gain.setValueAtTime(0, t);
      modChorusFeedbackGainR.gain.setValueAtTime(0, t);
      modPhaserWetGain.gain.setValueAtTime(0, t);
      modChorusDelay.delayTime.setValueAtTime(0.018, t);
      modChorusDelayR.delayTime.setValueAtTime(0.022, t);
      if (modChorusPanL) modChorusPanL.pan.setValueAtTime(-0.46, t);
      if (modChorusPanR) modChorusPanR.pan.setValueAtTime(0.46, t);
      modLfoOsc.type = "sine";
      modLfoOsc.frequency.setValueAtTime(DEFAULTS.modulation.rate, t);
      modLfoGain.gain.setValueAtTime(0.004, t);
      modLfoGainR.gain.setValueAtTime(-0.004, t);
      modPhaserLfoGain.gain.setValueAtTime(0, t);
      delayDryGain.gain.setValueAtTime(1, t);
      delayOutput.gain.setValueAtTime(1, t);
      delayWetGain.gain.setValueAtTime(0, t);
      delayFeedbackGain.gain.setValueAtTime(0, t);
      delayPingInputGain.gain.setValueAtTime(0, t);
      delayPingWetGainL.gain.setValueAtTime(0, t);
      delayPingWetGainR.gain.setValueAtTime(0, t);
      delayPingFeedbackL.gain.setValueAtTime(0, t);
      delayPingFeedbackR.gain.setValueAtTime(0, t);
      delayNode.delayTime.setValueAtTime(DEFAULTS.delay.time, t);
      delayPingDelayL.delayTime.setValueAtTime(DEFAULTS.delay.time, t);
      delayPingDelayR.delayTime.setValueAtTime(DEFAULTS.delay.time, t);
      delayDampingFilter.type = "lowpass";
      delayPingDampL.type = "lowpass";
      delayPingDampR.type = "lowpass";
      delayDampingFilter.frequency.setValueAtTime(dampingControlToHz(DEFAULTS.delay.damping), t);
      delayPingDampL.frequency.setValueAtTime(dampingControlToHz(DEFAULTS.delay.damping), t);
      delayPingDampR.frequency.setValueAtTime(dampingControlToHz(DEFAULTS.delay.damping), t);
      delayDampingFilter.Q.setValueAtTime(0.7, t);
      delayPingDampL.Q.setValueAtTime(0.66, t);
      delayPingDampR.Q.setValueAtTime(0.66, t);
      if (delayPingPanL) delayPingPanL.pan.setValueAtTime(-0.78, t);
      if (delayPingPanR) delayPingPanR.pan.setValueAtTime(0.78, t);
      reverbDryGain.gain.setValueAtTime(1, t);
      reverbOutput.gain.setValueAtTime(1, t);
      reverbWetGain.gain.setValueAtTime(0, t);
      reverbDampingFilter.type = "lowpass";
      reverbDampingFilter.frequency.setValueAtTime(dampingControlToHz(DEFAULTS.reverb.damping), t);
      reverbDampingFilter.Q.setValueAtTime(0.7, t);
      safetyBypassGain.gain.setValueAtTime(0, t);
      safetyPreGain.gain.setValueAtTime(1, t);
      safetyWetGain.gain.setValueAtTime(1, t);
      safetyOutput.gain.setValueAtTime(0.96, t);
      safetyLimiter.threshold.setValueAtTime(DEFAULTS.safety.thresholdDb, t);
      safetyLimiter.knee.setValueAtTime(6, t);
      safetyLimiter.ratio.setValueAtTime(12, t);
      safetyLimiter.attack.setValueAtTime(0.003, t);
      safetyLimiter.release.setValueAtTime(DEFAULTS.safety.releaseMs / 1000, t);
      safetyClipper.curve = makeSafetyClipCurve();
      safetyClipper.oversample = "4x";
      safetyAnalyser.fftSize = 512;
      safetyAnalyser.smoothingTimeConstant = 0.35;

      // voice output post-ADSR -> Drive/Saturation -> EQ -> Modulazione -> Delay -> Ambiente/Reverb -> Dynamics Safety -> Master.
      effectInput.connect(effectDryGain);
      effectDryGain.connect(effectOutput);
      effectInput.connect(effectPreFilter);
      effectPreFilter.connect(effectPreGain);
      effectPreGain.connect(effectShaper);
      effectShaper.connect(effectDcFilter);
      effectDcFilter.connect(effectToneFilter);
      effectToneFilter.connect(effectWetGain);
      effectWetGain.connect(effectOutput);
      effectOutput.connect(eqInput);
      eqInput.connect(eqBypassGain);
      eqBypassGain.connect(eqOutput);
      let previousEq = eqInput;
      eqBands.forEach((band) => {
        previousEq.connect(band.node);
        previousEq = band.node;
      });
      previousEq.connect(eqWetGain);
      eqWetGain.connect(eqOutput);

      eqOutput.connect(modInput);
      modInput.connect(modDryGain);
      modDryGain.connect(modOutput);
      modInput.connect(modChorusDelay);
      modInput.connect(modChorusDelayR);
      modChorusDelay.connect(modChorusWetGain);
      modChorusDelayR.connect(modChorusWetGainR);
      if (modChorusPanL) {
        modChorusWetGain.connect(modChorusPanL);
        modChorusPanL.connect(modOutput);
      } else {
        modChorusWetGain.connect(modOutput);
      }
      if (modChorusPanR) {
        modChorusWetGainR.connect(modChorusPanR);
        modChorusPanR.connect(modOutput);
      } else {
        modChorusWetGainR.connect(modOutput);
      }
      modChorusDelay.connect(modChorusFeedbackGain);
      modChorusFeedbackGain.connect(modChorusDelay);
      modChorusDelayR.connect(modChorusFeedbackGainR);
      modChorusFeedbackGainR.connect(modChorusDelayR);
      let previousPhaser = modInput;
      modPhaserFilters.forEach((filter) => {
        previousPhaser.connect(filter);
        previousPhaser = filter;
        modPhaserLfoGain.connect(filter.frequency);
      });
      previousPhaser.connect(modPhaserWetGain);
      modPhaserWetGain.connect(modOutput);
      modLfoOsc.connect(modLfoGain);
      modLfoGain.connect(modChorusDelay.delayTime);
      modLfoOsc.connect(modLfoGainR);
      modLfoGainR.connect(modChorusDelayR.delayTime);
      modLfoOsc.connect(modPhaserLfoGain);
      modLfoOsc.start(t);
      ensureModWheelSource();
      applyModWheelToSource(false);

      modOutput.connect(delayInput);
      delayInput.connect(delayDryGain);
      delayDryGain.connect(delayOutput);
      delayInput.connect(delayNode);
      delayNode.connect(delayDampingFilter);
      delayDampingFilter.connect(delayWetGain);
      delayWetGain.connect(delayOutput);
      delayDampingFilter.connect(delayFeedbackGain);
      delayFeedbackGain.connect(delayNode);

      // Ping-Pong v0.18.4: percorso wet separato e topology-stable.
      // Il modo Mono usa il ramo storico; Ping-Pong usa due delay cross-feedback L/R.
      delayInput.connect(delayPingInputGain);
      delayPingInputGain.connect(delayPingDelayL);
      delayPingDelayL.connect(delayPingDampL);
      delayPingDampL.connect(delayPingWetGainL);
      if (delayPingPanL) {
        delayPingWetGainL.connect(delayPingPanL);
        delayPingPanL.connect(delayOutput);
      } else {
        delayPingWetGainL.connect(delayOutput);
      }
      delayPingDampL.connect(delayPingFeedbackR);
      delayPingFeedbackR.connect(delayPingDelayR);
      delayPingDelayR.connect(delayPingDampR);
      delayPingDampR.connect(delayPingWetGainR);
      if (delayPingPanR) {
        delayPingWetGainR.connect(delayPingPanR);
        delayPingPanR.connect(delayOutput);
      } else {
        delayPingWetGainR.connect(delayOutput);
      }
      delayPingDampR.connect(delayPingFeedbackL);
      delayPingFeedbackL.connect(delayPingDelayL);

      delayOutput.connect(reverbInput);
      reverbInput.connect(reverbDryGain);
      reverbDryGain.connect(reverbOutput);
      reverbInput.connect(reverbConvolver);
      reverbConvolver.connect(reverbDampingFilter);
      reverbDampingFilter.connect(reverbWetGain);
      reverbWetGain.connect(reverbOutput);
      reverbOutput.connect(safetyInput);
      safetyInput.connect(safetyBypassGain);
      safetyBypassGain.connect(safetyOutput);
      safetyInput.connect(safetyPreGain);
      safetyPreGain.connect(safetyLimiter);
      safetyLimiter.connect(safetyClipper);
      safetyClipper.connect(safetyWetGain);
      safetyWetGain.connect(safetyOutput);
      safetyOutput.connect(safetyAnalyser);
      safetyAnalyser.connect(masterGain);

      updateEffectChain(null, { forceCurve: true });
      updateEqChain(null);
      updateModulationChain(null);
      updateDelayChain(null);
      updateReverbChain(null, { forceImpulse: true });
      updateSafetyChain(null);
      updateGlobalFxModMatrix("ensure-nodes");
    }
    return true;
  }

  async function unlock() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setStatus("Audio non supportato");
      window.SynthXLogger?.warn("WebAudio non supportato in questo browser.");
      return null;
    }
    if (!context) context = new AudioContextCtor();
    ensureNodes();
    if (context.state === "suspended" || context.state === "interrupted") await context.resume();
    isReady = true;
    if (window.SynthXState?.data) window.SynthXState.data.audioUnlocked = true;
    setStatus(`Audio: pronto (${context.state})`);
    updateMasterGain();
    updateSafetyChain(null);
    startSafetyMonitor();
    window.SynthXLogger?.log("AudioContext Performance Controls pronto", context.state);
    return context;
  }

  async function recoverAudioAfterFocus(reason) {
    // v0.26.6b: alcuni browser/OS possono sospendere o lasciare in stato
    // incompleto AudioContext, timer e rami wet FX quando la finestra perde
    // focus. Al rientro non ricostruiamo il synth e non tocchiamo le voci:
    // riprendiamo il context e riapplichiamo solo la configurazione corrente
    // della catena FX/master/safety, inclusa l'impulse response del reverb.
    if (!context || !isReady) return false;
    if (focusRecoveryInFlight) return false;
    const wallNow = Date.now();
    if (wallNow - lastFocusRecoveryAt < 120) return false;
    lastFocusRecoveryAt = wallNow;
    focusRecoveryInFlight = true;
    try {
      ensureNodes();
      if (context.state === "suspended" || context.state === "interrupted") {
        try { await context.resume(); } catch (resumeErr) { window.SynthXLogger?.warn("Audio focus resume error", reason || "focus", resumeErr); }
      }
      updateMasterGain();
      updateEffectChain(null, { forceCurve: true });
      updateEqChain(null);
      updateModulationChain(null);
      updateDelayChain(null);
      updateReverbChain(null, { forceImpulse: true });
      updateSafetyChain(null);
      updateGlobalFxModMatrix(reason || "focus-recovery");
      refreshPerformanceRuntime(reason || "focus-recovery");
      startSafetyMonitor();
      setStatus(`Audio: pronto (${context.state})`);
      window.SynthXLogger?.log("audio focus recovery", { reason: reason || "focus", state: context.state });
      return true;
    } catch (err) {
      window.SynthXLogger?.warn("Audio focus recovery error", reason || "focus", err);
      return false;
    } finally {
      focusRecoveryInFlight = false;
    }
  }

  function scheduleAudioFocusRecovery(reason, options) {
    if (!context || !isReady) return;
    if (document.hidden && !options?.forceWhenHidden) return;
    if (focusRecoveryTimer) window.clearTimeout(focusRecoveryTimer);
    focusRecoveryTimer = window.setTimeout(() => {
      focusRecoveryTimer = null;
      recoverAudioAfterFocus(reason);
    }, Math.max(0, Number(options?.delayMs) || 32));
  }

  function installAudioFocusRecoveryListeners() {
    const onVisible = () => {
      if (!document.hidden) scheduleAudioFocusRecovery("visibility-return", { delayMs: 48 });
    };
    const onFocus = () => scheduleAudioFocusRecovery("window-focus", { delayMs: 48 });
    const onPageShow = () => scheduleAudioFocusRecovery("pageshow", { delayMs: 64 });
    const onGesture = () => scheduleAudioFocusRecovery("user-gesture-focus-recovery", { delayMs: 0, forceWhenHidden: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture);
  }

  function updateMasterGain() {
    if (!masterGain || !context) return;
    const value = clamp(getParam("master", DEFAULTS.master), 0, 1);
    const t = now();
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(value, t, 0.012);
  }


  function getNoiseBuffer(type) {
    const key = String(type || "white");
    if (!noiseBuffers.has(key)) noiseBuffers.set(key, makeNoiseBuffer(context, key));
    return noiseBuffers.get(key);
  }

  function filterCutoffForVoice(filter, voice) {
    let cutoff = clamp(filter?.cutoff || 1000, 20, 20000);
    if (filter?.name === "vcf") {
      const keyTrack = clamp(filter.keyTrack || 0, 0, 1);
      const velocityDepth = clamp(filter.velocity || 0, 0, 1);
      const note = Number.isFinite(Number(voice?.note)) ? Number(voice.note) : 60;
      const vel = clamp(voice?.velocity ?? 1, 0, 1);
      if (keyTrack > 0) cutoff *= Math.pow(2, ((note - 60) / 12) * keyTrack);
      if (velocityDepth > 0) cutoff *= Math.pow(2, vel * velocityDepth * 3);
    }
    return clamp(cutoff, 20, 20000);
  }


  function createFilterDriveChain(voice, driveCfg, filtersCfg) {
    if (!voice?.input || !context) return;
    const t = now();
    const input = context.createGain();
    const preGain = context.createGain();
    const shaper = context.createWaveShaper();
    const trim = context.createGain();
    input.gain.setValueAtTime(1, t);
    preGain.gain.setValueAtTime(driveCfg?.enabled ? dbToGain(clamp((driveCfg.amount || 0) * 5.5, 0, 5.5)) : 1, t);
    shaper.curve = makeFilterDriveCurve(driveCfg || getFilterDriveConfig());
    shaper.oversample = driveCfg?.enabled && driveCfg.amount > 0.35 ? "4x" : "2x";
    trim.gain.setValueAtTime(computeFilterDriveTrimGain(driveCfg || getFilterDriveConfig(), filtersCfg), t);
    voice.input.connect(input);
    input.connect(preGain);
    preGain.connect(shaper);
    shaper.connect(trim);
    voice.filterDrive = { input, preGain, shaper, trim, output: trim, cfg: { ...(driveCfg || getFilterDriveConfig()) }, lastCurveSignature: filterDriveCurveSignature(driveCfg || getFilterDriveConfig()) };
    voice.filterInput = trim;
  }

  function filterDriveCurveSignature(cfg) {
    const safe = cfg || getFilterDriveConfig();
    return `${safe.enabled ? 1 : 0}|${safe.mode}|${Math.round(clamp(safe.amount || 0, 0, 1) * 1000)}`;
  }

  function applyFilterDriveCurveToVoices(cfg, paramId, smooth) {
    const apply = () => {
      const signature = filterDriveCurveSignature(cfg);
      voices.forEach((voice) => {
        const drive = voice.filterDrive;
        if (!drive?.shaper) return;
        try {
          if (drive.lastCurveSignature === signature) return;
          drive.shaper.curve = makeFilterDriveCurve(cfg);
          drive.shaper.oversample = cfg.enabled && cfg.amount > 0.35 ? "4x" : "2x";
          drive.lastCurveSignature = signature;
        } catch (err) {
          window.SynthXLogger?.warn("Filter Drive curve update error", paramId || "", err);
        }
      });
    };

    if (filterDriveCurveTimer) window.clearTimeout(filterDriveCurveTimer);
    if (!smooth || !context || voices.size === 0) {
      apply();
      filterDriveCurveTimer = null;
      return;
    }
    filterDriveCurveTimer = window.setTimeout(() => {
      apply();
      filterDriveCurveTimer = null;
    }, 34);
  }

  function updateActiveFilterDriveParams(paramId) {
    const cfg = getFilterDriveConfig();
    const filtersCfg = getFiltersConfig();
    if (!context || !isReady || voices.size === 0) return true;
    let touched = 0;
    const curveNeedsUpdate = !paramId || paramId === "filter-drive-mode" || paramId === "filter-drive-amount" || paramId === "filter-drive-enabled";
    voices.forEach((voice) => {
      const drive = voice.filterDrive;
      if (!drive?.shaper || !drive?.preGain || !drive?.trim) return;
      try {
        smoothAudioParam(drive.preGain.gain, cfg.enabled ? dbToGain(clamp(cfg.amount * 5.5, 0, 5.5)) : 1, 0.034);
        smoothAudioParam(drive.trim.gain, computeFilterDriveTrimGain(cfg, filtersCfg), 0.044);
        drive.cfg = { ...cfg };
        touched += 1;
      } catch (err) {
        window.SynthXLogger?.warn("Filter Drive live update error", paramId || "", err);
      }
    });
    if (curveNeedsUpdate) applyFilterDriveCurveToVoices(cfg, paramId, true);
    return touched > 0 || voices.size === 0;
  }

  function vowelFormantTable(vowel) {
    const table = {
      a: [730, 1090, 2440],
      e: [530, 1840, 2480],
      i: [270, 2290, 3010],
      o: [570, 840, 2410],
      u: [300, 870, 2240]
    };
    return table[String(vowel || "a")] || table.a;
  }

  const ADV_FILTER_DEPTH_EPS = 0.0005;
  const ADV_FILTER_MIX_EPS = 0.0005;

  function advancedFilterSafety(mode) {
    const table = {
      allpass: { wetTrim: 0.78, maxQ: 6.2, maxGainDb: 0, feedback: 0 },
      resonator: { wetTrim: 0.56, maxQ: 9.5, maxGainDb: 9.0, feedback: 0 },
      vowel: { wetTrim: 0.54, maxQ: 7.2, maxGainDb: 7.5, feedback: 0 },
      comb: { wetTrim: 0.68, maxQ: 0, maxGainDb: 0, feedback: 0.54 }
    };
    return table[String(mode || "allpass")] || table.allpass;
  }

  function effectiveAdvancedFilterMix(cfg) {
    // v0.18.0b: bypass musicale conservativo. OFF, Depth 0 o Mix 0 devono
    // rientrare a dry reale senza lasciare wet udibile o code interne pericolose.
    if (!cfg?.enabled) return 0;
    if (clamp(cfg.depth || 0, 0, 1) <= ADV_FILTER_DEPTH_EPS) return 0;
    if (clamp(cfg.mix || 0, 0, 1) <= ADV_FILTER_MIX_EPS) return 0;
    return clamp(cfg.mix || 0, 0, 1);
  }

  function effectiveAdvancedFilterDepth(cfg) {
    if (!cfg?.enabled) return 0;
    if (effectiveAdvancedFilterMix(cfg) <= ADV_FILTER_MIX_EPS) return 0;
    return clamp(cfg.depth || 0, 0, 1);
  }

  function advancedFilterConfigForVoice(cfg, voice) {
    const base = cfg || getAdvancedFilterConfig();
    const velocity = clamp(voice?.velocity ?? 1, 0, 1);
    const depthBase = clamp(base.depth || 0, 0, 1);
    const mixBase = clamp(base.mix || 0, 0, 1);
    return {
      ...base,
      depth: clamp(depthBase + (velocity * clamp(base.velocityDepth || 0, 0, 1) * (1 - depthBase)), 0, 1),
      mix: clamp(mixBase + (velocity * clamp(base.velocityMix || 0, 0, 1) * (1 - mixBase)), 0, 1)
    };
  }

  function advancedFilterMixGains(cfg) {
    const mix = effectiveAdvancedFilterMix(cfg);
    if (mix <= ADV_FILTER_MIX_EPS) return { dry: 1, wet: 0 };
    const safety = advancedFilterSafety(cfg?.mode);
    // Crossfade lineare con trim interno: Mix 0 resta dry pieno; Mix alto non
    // somma più dry residuo + wet pieno, riducendo picchi in Allpass/Formant/Peak.
    return { dry: 1 - mix, wet: mix * safety.wetTrim };
  }

  function createAdvancedFilterChain(voice, source, advCfg) {
    if (!voice?.output || !source || !context) return;
    const cfg = advCfg || getAdvancedFilterConfig();
    const effectiveMix = effectiveAdvancedFilterMix(cfg);
    if (effectiveMix <= ADV_FILTER_MIX_EPS) {
      source.connect(voice.output);
      voice.advancedFilter = null;
      return;
    }

    const t = now();
    const input = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const out = context.createGain();
    const gains = advancedFilterMixGains(cfg);
    dry.gain.setValueAtTime(gains.dry, t);
    wet.gain.setValueAtTime(gains.wet, t);
    out.gain.setValueAtTime(1, t);
    source.connect(input);
    input.connect(dry);
    dry.connect(out);

    const nodes = [];
    let firstWet = null;
    let lastWet = null;
    const freq = clamp(cfg.freq || 1200, 20, 20000);
    const depth = effectiveAdvancedFilterDepth(cfg);
    const safety = advancedFilterSafety(cfg.mode);

    if (cfg.mode === "comb") {
      const delay = context.createDelay(0.08);
      const damp = context.createBiquadFilter();
      const feedback = context.createGain();
      delay.delayTime.setValueAtTime(clamp(1 / clamp(freq, 20, 5000), 0.001, 0.05), t);
      damp.type = "lowpass";
      damp.frequency.setValueAtTime(clamp(4500 - depth * 2600, 900, 6000), t);
      feedback.gain.setValueAtTime(clamp(depth * safety.feedback, 0, safety.feedback), t);
      input.connect(delay);
      delay.connect(wet);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      nodes.push(delay, damp, feedback);
      firstWet = delay;
      lastWet = delay;
    } else {
      const makeBiquad = (type, f, q, gainDb) => {
        const node = context.createBiquadFilter();
        node.type = type;
        node.frequency.setValueAtTime(clamp(f, 20, 20000), t);
        node.Q.setValueAtTime(clamp(q, 0.1, 20), t);
        if (node.gain) node.gain.setValueAtTime(clamp(gainDb || 0, -18, 18), t);
        nodes.push(node);
        return node;
      };

      if (cfg.mode === "vowel") {
        const [f1, f2, f3] = vowelFormantTable(cfg.vowel).map((base, index) => clamp(base * Math.pow(freq / 1200, index === 0 ? 0.35 : 0.18), 80, 9000));
        const q = Math.min(safety.maxQ, 1.8 + depth * 5.4);
        const gainDb = Math.min(safety.maxGainDb, 2.0 + depth * 5.5);
        const n1 = makeBiquad("peaking", f1, q, gainDb);
        const n2 = makeBiquad("peaking", f2, q * 0.85, gainDb * 0.82);
        const n3 = makeBiquad("peaking", f3, q * 0.65, gainDb * 0.55);
        n1.connect(n2); n2.connect(n3); n3.connect(wet);
        firstWet = n1; lastWet = n3;
      } else if (cfg.mode === "resonator") {
        const q = Math.min(safety.maxQ, 0.8 + depth * 8.7);
        const gainDb = Math.min(safety.maxGainDb, depth * 9.0);
        const n1 = makeBiquad("peaking", freq, q, gainDb);
        const n2 = makeBiquad("peaking", clamp(freq * 2.01, 20, 20000), Math.max(0.5, q * 0.45), gainDb * 0.38);
        n1.connect(n2); n2.connect(wet);
        firstWet = n1; lastWet = n2;
      } else {
        const q = Math.min(safety.maxQ, 0.7 + depth * 5.5);
        const n1 = makeBiquad("allpass", freq, q, 0);
        const n2 = makeBiquad("allpass", clamp(freq * 2.15, 20, 20000), Math.max(0.5, q * 0.72), 0);
        n1.connect(n2); n2.connect(wet);
        firstWet = n1; lastWet = n2;
      }
      input.connect(firstWet);
    }

    wet.connect(out);
    out.connect(voice.output);
    voice.advancedFilter = { input, dry, wet, out, nodes, firstWet, lastWet, cfg: { ...cfg }, baseFreq: freq, lfoModulations: [] };
  }


  function advancedFilterFrequencyParams(adv) {
    if (!adv) return [];
    if (adv.cfg?.mode === "comb") return [];
    return (adv.nodes || []).map((node) => node?.frequency).filter(Boolean);
  }

  function advancedFilterDelayParam(adv) {
    if (!adv || adv.cfg?.mode !== "comb") return null;
    return (adv.nodes || []).find((node) => node?.delayTime)?.delayTime || null;
  }

  function advancedFilterEnvelopeFreqValues(baseFreq, amount, sustain, polarity) {
    const base = clamp(baseFreq, 20, 20000);
    const depthOctaves = clamp(amount, 0, 1) * 3.0;
    const sustainOctaves = depthOctaves * clamp(sustain, 0, 1);
    const direction = polarity === "inverted" ? -1 : 1;
    return {
      base,
      peak: clamp(base * Math.pow(2, direction * depthOctaves), 20, 20000),
      sustainValue: clamp(base * Math.pow(2, direction * sustainOctaves), 20, 20000)
    };
  }

  function freqToCombDelay(freq) {
    return clamp(1 / clamp(freq, 20, 5000), 0.001, 0.05);
  }

  function rampAdvancedFilterFrequencyParam(param, value, at, curve, isCombDelay) {
    const target = isCombDelay ? freqToCombDelay(value) : clamp(value, 20, 20000);
    try {
      if (!isCombDelay && curve === "exp") param.exponentialRampToValueAtTime(target, at);
      else param.linearRampToValueAtTime(target, at);
    } catch (_) {
      try { param.setTargetAtTime(target, Math.max(now(), at - 0.001), 0.018); } catch (__) {}
    }
  }

  function applyAdvancedFilterEnvelope(voice, advCfg, filterEnv, ampEnv) {
    const adv = voice?.advancedFilter;
    if (!adv || !context) return;
    const amount = clamp(advCfg?.envFreq || 0, 0, 1);
    if (amount <= 0) return;
    const t = now();
    const attack = safeTime(filterEnv?.attack || 0.01, 0.001);
    const decay = safeTime(filterEnv?.decay || 0.18, 0.001);
    const sustain = clamp(filterEnv?.sustain ?? 0.45, 0, 1);
    const polarity = filterEnv?.polarity === "inverted" ? "inverted" : "normal";
    const curve = ampEnv?.curve === "exp" ? "exp" : "linear";
    const values = advancedFilterEnvelopeFreqValues(adv.baseFreq || adv.cfg?.freq || 1200, amount, sustain, polarity);
    const isComb = adv.cfg?.mode === "comb";
    const params = isComb ? [advancedFilterDelayParam(adv)].filter(Boolean) : advancedFilterFrequencyParams(adv);
    if (!params.length) return;
    params.forEach((param) => {
      try {
        param.cancelScheduledValues(t);
        param.setValueAtTime(isComb ? freqToCombDelay(values.base) : values.base, t);
        if ((filterEnv?.attack || 0) <= 0.001) param.setValueAtTime(isComb ? freqToCombDelay(values.peak) : values.peak, t);
        else rampAdvancedFilterFrequencyParam(param, values.peak, t + attack, curve, isComb);
        if ((filterEnv?.decay || 0) <= 0.001) param.setValueAtTime(isComb ? freqToCombDelay(values.sustainValue) : values.sustainValue, t + attack + 0.001);
        else rampAdvancedFilterFrequencyParam(param, values.sustainValue, t + attack + decay, curve, isComb);
      } catch (_) {
        try { param.setTargetAtTime(isComb ? freqToCombDelay(values.sustainValue) : values.sustainValue, t, 0.030); } catch (__) {}
      }
    });
    voice.advancedFilterEnvelope = {
      baseFreq: values.base,
      amount,
      polarity,
      attack: filterEnv?.attack || 0.01,
      decay: filterEnv?.decay || 0.18,
      sustain,
      release: filterEnv?.release || 0.24,
      isComb
    };
  }

  function applyAdvancedFilterEnvelopeRelease(voice, fast) {
    const adv = voice?.advancedFilter;
    const env = voice?.advancedFilterEnvelope;
    if (!adv || !env || !context) return;
    const params = env.isComb ? [advancedFilterDelayParam(adv)].filter(Boolean) : advancedFilterFrequencyParams(adv);
    if (!params.length) return;
    const t = now();
    const release = safeTime(fast ? 0.05 : env.release, fast ? 0.02 : 0.005);
    const endAt = t + release;
    params.forEach((param) => {
      try {
        holdAudioParam(param, t);
        rampAdvancedFilterFrequencyParam(param, env.baseFreq || adv.baseFreq || adv.cfg?.freq || 1200, endAt, getEnvelopeConfig().curve === "exp" ? "exp" : "linear", env.isComb);
      } catch (_) {
        try { param.setTargetAtTime(env.isComb ? freqToCombDelay(env.baseFreq || 1200) : (env.baseFreq || 1200), t, Math.max(0.012, release / 4)); } catch (__) {}
      }
    });
  }

  function createLfoModulationNode(lfoOsc, amount) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(amount, now());
    lfoOsc.connect(gain);
    return gain;
  }

  function advancedFilterLfoGainPlan(voice, lfoCfg) {
    const adv = voice?.advancedFilter;
    if (!adv) return [];
    const cfg = adv.cfg || getAdvancedFilterConfig();
    const dest = String(lfoCfg?.dest || "");
    const lfoDepth = clamp(lfoCfg?.depth || 0, 0, 1);
    if (dest === "adv_filter_freq") {
      if (cfg.mode === "comb") {
        const param = advancedFilterDelayParam(adv);
        const baseDelay = freqToCombDelay(cfg.freq || adv.baseFreq || 1200);
        return param ? [{ param, amount: baseDelay * 0.32 * lfoDepth, kind: "adv_freq_delay" }] : [];
      }
      const params = advancedFilterFrequencyParams(adv);
      const baseFreq = clamp(cfg.freq || adv.baseFreq || 1200, 20, 20000);
      const amount = Math.min(baseFreq * 0.42, 7600) * lfoDepth;
      return params.map((param, index) => ({ param, amount: amount * (index === 0 ? 1 : index === 1 ? 0.62 : 0.38), kind: "adv_freq" }));
    }
    if (dest === "adv_filter_mix") {
      const gains = advancedFilterMixGains(cfg);
      const safety = advancedFilterSafety(cfg.mode);
      const wetRoom = Math.max(0, safety.wetTrim - gains.wet);
      const wetAmount = Math.max(0, Math.min(gains.wet * 0.75, wetRoom * 0.75, 0.28)) * lfoDepth;
      const dryAmount = Math.max(0, Math.min(gains.dry * 0.55, (1 - gains.dry) * 0.55, 0.22)) * lfoDepth;
      const plan = [];
      if (adv.wet?.gain && wetAmount > 0) plan.push({ param: adv.wet.gain, amount: wetAmount, kind: "adv_mix_wet" });
      if (adv.dry?.gain && dryAmount > 0) plan.push({ param: adv.dry.gain, amount: -dryAmount, kind: "adv_mix_dry" });
      return plan;
    }
    if (dest === "adv_filter_depth") {
      const depth = effectiveAdvancedFilterDepth(cfg);
      if (cfg.mode === "comb") {
        const safety = advancedFilterSafety(cfg.mode);
        const fb = (adv.nodes || []).find((node) => node?.gain && !node.frequency);
        const base = clamp(depth * safety.feedback, 0, safety.feedback);
        const room = Math.max(0, safety.feedback - base);
        const amount = Math.max(0, Math.min(base * 0.60, room * 0.75, 0.18)) * lfoDepth;
        return fb?.gain && amount > 0 ? [{ param: fb.gain, amount, kind: "adv_depth_feedback" }] : [];
      }
      const nodes = adv.nodes || [];
      const plan = [];
      const safety = advancedFilterSafety(cfg.mode);
      nodes.forEach((node) => {
        if (node?.Q) {
          const baseQ = clamp(node.Q.value || 1, 0.1, safety.maxQ || 12);
          const qRoom = Math.max(0, (safety.maxQ || 12) - baseQ);
          const qAmount = Math.max(0, Math.min(baseQ * 0.32, qRoom * 0.55, 2.2)) * lfoDepth;
          if (qAmount > 0) plan.push({ param: node.Q, amount: qAmount, kind: "adv_depth_q" });
        }
        if (node?.gain && cfg.mode !== "allpass") {
          const baseGain = Math.abs(node.gain.value || 0);
          const gainRoom = Math.max(0, (safety.maxGainDb || 9) - baseGain);
          const gainAmount = Math.max(0, Math.min(Math.max(0.5, baseGain * 0.35), gainRoom * 0.60, 2.0)) * lfoDepth;
          if (gainAmount > 0) plan.push({ param: node.gain, amount: gainAmount, kind: "adv_depth_gain" });
        }
      });
      return plan;
    }
    return [];
  }

  function applyLfoToAdvancedFilter(voice, lfoCfg) {
    if (!lfoCfg.enabled || lfoCfg.depth <= 0 || !isAdvancedFilterLfoDest(lfoCfg.dest) || !voice?.advancedFilter) return;
    const plan = advancedFilterLfoGainPlan(voice, lfoCfg);
    if (!plan.length) return;
    const t = now();
    const lfoOsc = context.createOscillator();
    applyOscillatorWaveform(lfoOsc, lfoCfg.wave);
    lfoOsc.frequency.setValueAtTime(lfoCfg.effectiveRate || lfoCfg.rate, t);
    const gains = plan.map((item) => {
      const gain = createLfoModulationNode(lfoOsc, item.amount);
      try { gain.connect(item.param); } catch (_) {}
      return { gain, param: item.param, kind: item.kind };
    });
    lfoOsc.start(t);
    const entry = { osc: lfoOsc, gain: gains[0]?.gain || null, gains, target: "advancedFilter", dest: lfoCfg.dest, lfo: lfoCfg.index, advancedFilter: voice.advancedFilter };
    voice.lfos.push(entry);
    voice.advancedFilter.lfoModulations.push(entry);
  }

  function updateAdvancedFilterLfoDepths(voice) {
    const adv = voice?.advancedFilter;
    if (!adv || !context) return;
    (voice.lfos || []).forEach((lfo) => {
      if (!isAdvancedFilterLfoDest(lfo.dest)) return;
      const lfoCfg = getLfoConfig(lfo.lfo);
      const plan = advancedFilterLfoGainPlan(voice, lfoCfg);
      const gains = lfo.gains || (lfo.gain ? [{ gain: lfo.gain }] : []);
      gains.forEach((entry, index) => {
        const next = plan[index]?.amount || 0;
        smoothAudioParam(entry.gain?.gain, next, 0.030);
      });
    });
  }

  function disconnectAdvancedFilter(voice) {
    const adv = voice?.advancedFilter;
    if (!adv) return;
    try { [adv.input, adv.dry, adv.wet, adv.out].forEach((node) => node?.disconnect?.()); } catch (_) {}
    try { (adv.nodes || []).forEach((node) => node?.disconnect?.()); } catch (_) {}
    voice.advancedFilter = null;
  }

  function updateActiveAdvancedFilterParams(paramId) {
    const baseCfg = getAdvancedFilterConfig();
    if (!context || !isReady || voices.size === 0) return true;
    let touched = 0;
    voices.forEach((voice) => {
      const adv = voice.advancedFilter;
      const cfg = advancedFilterConfigForVoice(baseCfg, voice);
      if (!adv) return;
      try {
        // Se il modo/vowel cambia senza rebuild per qualche evento esterno, non
        // forziamo una topologia sbagliata: segnaliamo al chiamante di ricostruire.
        if (adv.cfg?.mode && adv.cfg.mode !== cfg.mode) return;
        const depth = effectiveAdvancedFilterDepth(cfg);
        const safety = advancedFilterSafety(cfg.mode);
        const gains = advancedFilterMixGains(cfg);
        smoothAudioParam(adv.dry?.gain, gains.dry, 0.052);
        smoothAudioParam(adv.wet?.gain, gains.wet, 0.052);

        if (cfg.mode === "comb") {
          const delay = adv.nodes?.find((node) => node?.delayTime);
          const feedback = adv.nodes?.find((node) => node?.gain && !node.frequency);
          const damp = adv.nodes?.find((node) => node?.frequency && node?.type === "lowpass");
          if (delay?.delayTime) smoothAudioParam(delay.delayTime, clamp(1 / clamp(cfg.freq, 20, 5000), 0.001, 0.05), 0.045);
          if (feedback?.gain) smoothAudioParam(feedback.gain, clamp(depth * safety.feedback, 0, safety.feedback), 0.060);
          if (damp?.frequency) smoothAudioParam(damp.frequency, clamp(4500 - depth * 2600, 900, 6000), 0.060);
        } else {
          const nodes = adv.nodes || [];
          if (cfg.mode === "vowel") {
            const freqs = vowelFormantTable(cfg.vowel).map((base, index) => clamp(base * Math.pow(cfg.freq / 1200, index === 0 ? 0.35 : 0.18), 80, 9000));
            const q = Math.min(safety.maxQ, 1.8 + depth * 5.4);
            const gainDb = Math.min(safety.maxGainDb, 2.0 + depth * 5.5);
            nodes.forEach((node, index) => {
              if (node?.frequency) smoothAudioParam(node.frequency, freqs[index] || cfg.freq, 0.050);
              if (node?.Q) smoothAudioParam(node.Q, q * (index === 0 ? 1 : index === 1 ? 0.85 : 0.65), 0.060);
              if (node?.gain) smoothAudioParam(node.gain, gainDb * (index === 0 ? 1 : index === 1 ? 0.82 : 0.55), 0.060);
            });
          } else if (cfg.mode === "resonator") {
            const q = Math.min(safety.maxQ, 0.8 + depth * 8.7);
            const gainDb = Math.min(safety.maxGainDb, depth * 9.0);
            nodes.forEach((node, index) => {
              if (node?.frequency) smoothAudioParam(node.frequency, index === 0 ? cfg.freq : clamp(cfg.freq * 2.01, 20, 20000), 0.050);
              if (node?.Q) smoothAudioParam(node.Q, index === 0 ? q : Math.max(0.5, q * 0.45), 0.060);
              if (node?.gain) smoothAudioParam(node.gain, index === 0 ? gainDb : gainDb * 0.38, 0.060);
            });
          } else {
            const q = Math.min(safety.maxQ, 0.7 + depth * 5.5);
            nodes.forEach((node, index) => {
              if (node?.frequency) smoothAudioParam(node.frequency, index === 0 ? cfg.freq : clamp(cfg.freq * 2.15, 20, 20000), 0.050);
              if (node?.Q) smoothAudioParam(node.Q, index === 0 ? q : Math.max(0.5, q * 0.72), 0.060);
            });
          }
        }
        adv.cfg = { ...cfg };
        if (String(paramId || "").startsWith("filter-env:") || paramId === "adv-filter-env-freq") {
          applyAdvancedFilterEnvelope(voice, cfg, getFilterEnvConfig(), getEnvelopeConfig());
        }
        updateAdvancedFilterLfoDepths(voice);
        touched += 1;
      } catch (err) {
        window.SynthXLogger?.warn("Advanced Filter live update error", paramId || "", err);
      }
    });
    return touched > 0 || voices.size === 0;
  }

  function createFilterChain(voice, filtersCfg, advancedFilterCfg) {
    if (!voice?.input || !voice?.output || !context) return;
    const enabledFilters = (filtersCfg || []).filter((filter) => filter.enabled);
    if (!enabledFilters.length) {
      // v0.16.2a: se tutti i filtri sono spenti, il Filter Drive pre-filtro deve
      // comunque restare nel percorso audio. In v0.16.2 questo caso poteva
      // bypassare il drive collegando direttamente voice.input -> output.
      const dryOrDrivenInput = voice.filterInput || voice.input;
      createAdvancedFilterChain(voice, dryOrDrivenInput, advancedFilterConfigForVoice(advancedFilterCfg, voice));
      voice.filterNodes = [];
      return;
    }

    let previous = voice.filterInput || voice.input;
    voice.filterNodes = enabledFilters.map((filter) => {
      const nodes = [];
      const cutoff = filterCutoffForVoice(filter, voice);
      const baseCutoff = clamp(filter.cutoff, 20, 20000);
      const q = clamp(filter.q, 0.1, 20);
      const slope = (filter.name === "hpf" || filter.name === "vcf") && Number(filter.slope) >= 24 ? 24 : 12;
      const stageCount = slope >= 24 ? 2 : 1;
      for (let stage = 0; stage < stageCount; stage += 1) {
        const node = context.createBiquadFilter();
        node.type = filter.type;
        node.frequency.setValueAtTime(cutoff, now());
        node.Q.setValueAtTime(filterStageQ(q, slope, stage), now());
        previous.connect(node);
        previous = node;
        nodes.push(node);
      }
      return { name: filter.name, type: filter.type, node: nodes[0], nodes, cutoff, baseCutoff, q, slope, keyTrack: filter.keyTrack || 0, velocity: filter.velocity || 0 };
    });
    createAdvancedFilterChain(voice, previous, advancedFilterConfigForVoice(advancedFilterCfg, voice));
  }

  function filterFrequencyParams(entry) {
    const nodes = Array.isArray(entry?.nodes) && entry.nodes.length ? entry.nodes : (entry?.node ? [entry.node] : []);
    return nodes.map((node) => node?.frequency).filter(Boolean);
  }

  function filterQParams(entry) {
    const nodes = Array.isArray(entry?.nodes) && entry.nodes.length ? entry.nodes : (entry?.node ? [entry.node] : []);
    return nodes.map((node) => node?.Q).filter(Boolean);
  }

  function filterStageQ(rawQ, slope, stageIndex) {
    // v0.16.1a: in modalità 24 dB usiamo due biquad in cascata.
    // Dare lo stesso Q alto a entrambi gli stadi può rendere il filtro troppo
    // aggressivo e rumoroso quando cutoff, Filter Env o LFO si muovono live.
    // Il primo stadio conserva il carattere impostato; il secondo viene
    // leggermente smorzato per mantenere la pendenza senza sommare troppa
    // risonanza. La UI resta invariata e il preset conserva il valore utente.
    const q = clamp(rawQ, 0.1, 20);
    if (Number(slope) < 24) return q;
    if (Number(stageIndex) <= 0) return clamp(q, 0.1, 16);
    return clamp(0.7 + ((q - 0.7) * 0.55), 0.1, 12);
  }

  function applyFilterQToEntry(entry, rawQ, timeConstant) {
    const nodes = Array.isArray(entry?.nodes) && entry.nodes.length ? entry.nodes : (entry?.node ? [entry.node] : []);
    if (!nodes.length) return false;
    nodes.forEach((node, index) => smoothAudioParam(node?.Q, filterStageQ(rawQ, entry?.slope || 12, index), timeConstant || 0.024));
    entry.q = clamp(rawQ, 0.1, 20);
    return true;
  }

  function filterEnvelopeCutoff(baseCutoff, amount, sustain, polarity) {
    const base = clamp(baseCutoff, 20, 20000);
    const depthOctaves = clamp(amount, 0, 1) * 4;
    const sustainOctaves = depthOctaves * clamp(sustain, 0, 1);
    const direction = polarity === "inverted" ? -1 : 1;
    const peak = clamp(base * Math.pow(2, direction * depthOctaves), 20, 20000);
    const sustainValue = clamp(base * Math.pow(2, direction * sustainOctaves), 20, 20000);
    return { base, peak, sustainValue };
  }

  function rampFrequencyParam(param, value, at, curve) {
    const target = clamp(value, 20, 20000);
    try {
      if (curve === "exp") param.exponentialRampToValueAtTime(target, at);
      else param.linearRampToValueAtTime(target, at);
    } catch (_) {
      try { param.setTargetAtTime(target, Math.max(now(), at - 0.001), 0.012); } catch (__) {}
    }
  }

  function applyFilterEnvelope(voice, filterEnv, ampEnv) {
    if (!voice?.filterNodes?.length || !context || !filterEnv || filterEnv.amount <= 0) return;
    const entry = voice.filterNodes.find((filter) => filter.name === filterEnv.target);
    const params = filterFrequencyParams(entry);
    if (!params.length) return;
    const t = now();
    const attack = safeTime(filterEnv.attack, 0.001);
    const decay = safeTime(filterEnv.decay, 0.001);
    const sustain = clamp(filterEnv.sustain, 0, 1);
    const curve = ampEnv?.curve === "exp" ? "exp" : "linear";
    const values = filterEnvelopeCutoff(entry.cutoff, filterEnv.amount, sustain, filterEnv.polarity);
    params.forEach((param) => {
      try {
        param.cancelScheduledValues(t);
        param.setValueAtTime(values.base, t);
        if (filterEnv.attack <= 0.001) param.setValueAtTime(values.peak, t);
        else rampFrequencyParam(param, values.peak, t + attack, curve);
        if (filterEnv.decay <= 0.001) param.setValueAtTime(values.sustainValue, t + attack + 0.001);
        else rampFrequencyParam(param, values.sustainValue, t + attack + decay, curve);
      } catch (_) {
        try { param.setTargetAtTime(values.sustainValue, t, 0.025); } catch (__) {}
      }
    });
    voice.filterEnvelope = {
      filterName: entry.name,
      filterEntry: entry,
      baseCutoff: values.base,
      amount: filterEnv.amount,
      polarity: filterEnv.polarity,
      attack: filterEnv.attack,
      decay: filterEnv.decay,
      sustain: filterEnv.sustain,
      release: filterEnv.release
    };
  }

  function applyFilterEnvelopeRelease(voice, releaseSeconds, fast) {
    if (!voice?.filterEnvelope?.filterEntry || !context) return;
    const params = filterFrequencyParams(voice.filterEnvelope.filterEntry);
    if (!params.length) return;
    const base = clamp(voice.filterEnvelope.baseCutoff || voice.filterEnvelope.filterEntry.cutoff || params[0]?.value || 1000, 20, 20000);
    const t = now();
    const filterRelease = Number.isFinite(voice.filterEnvelope.release) ? voice.filterEnvelope.release : getFilterEnvConfig().release;
    const endAt = t + safeTime(fast ? 0.05 : filterRelease, fast ? 0.02 : 0.005);
    params.forEach((param) => {
      try {
        holdAudioParam(param, t);
        rampFrequencyParam(param, base, endAt, getEnvelopeConfig().curve === "exp" ? "exp" : "linear");
      } catch (_) {
        try { param.setTargetAtTime(base, t, Math.max(0.01, filterRelease / 4)); } catch (__) {}
      }
    });
  }

  function estimateEnvelopeLevel(voice, ampEnv, at) {
    const startedAt = Number.isFinite(voice?.startedAt) ? voice.startedAt : at;
    const elapsed = Math.max(0, at - startedAt);
    const attack = safeTime(ampEnv?.attack || 0, 0.001);
    const decay = safeTime(ampEnv?.decay || 0, 0.001);
    const sustain = clamp(ampEnv?.sustain ?? DEFAULTS.env.sustain, 0, 1);
    if (elapsed <= attack) return attack <= 0.001 ? 1 : clamp(elapsed / attack, 0, 1);
    if (elapsed <= attack + decay) {
      const phase = decay <= 0.001 ? 1 : clamp((elapsed - attack) / decay, 0, 1);
      return clamp(1 + ((sustain - 1) * phase), 0, 1);
    }
    return sustain;
  }

  function filterEnvelopeCurrentCutoff(voice, entry, filterEnv, ampEnv, at) {
    const base = clamp(entry?.cutoff || filterFrequencyParams(entry)[0]?.value || 1000, 20, 20000);
    const amount = clamp(filterEnv?.amount || 0, 0, 1);
    if (amount <= 0) return base;
    const envLevel = estimateEnvelopeLevel(voice, filterEnv || ampEnv, at);
    const direction = filterEnv?.polarity === "inverted" ? -1 : 1;
    const depthOctaves = amount * 4 * envLevel;
    return clamp(base * Math.pow(2, direction * depthOctaves), 20, 20000);
  }

  function resetFilterEnvelopeEntry(voice, filterName, timeConstant) {
    const entry = voice?.filterNodes?.find((filter) => filter.name === filterName);
    const params = filterFrequencyParams(entry);
    if (!params.length) return false;
    const base = clamp(entry.cutoff || params[0]?.value || 1000, 20, 20000);
    params.forEach((param) => smoothAudioParam(param, base, timeConstant || 0.040));
    return true;
  }

  function updateActiveFilterEnvelopeParam(paramId) {
    // v0.17.0: i controlli Filter ADSR separato non ricostruiscono le voci.
    // Amount/Target/Polarity/A-D-S-R aggiornano il cutoff già esistente con
    // smoothing, stimando il punto corrente dell'inviluppo filtro indipendente.
    if (!context || !isReady || voices.size === 0) return true;
    const filterEnv = getFilterEnvConfig();
    const ampEnv = getEnvelopeConfig();
    const t = now();
    let touched = 0;
    voices.forEach((voice) => {
      if (!voice?.filterNodes?.length || voice.released) return;
      const previousName = voice.filterEnvelope?.filterName || null;
      if (previousName && (filterEnv.amount <= 0 || previousName !== filterEnv.target)) {
        if (resetFilterEnvelopeEntry(voice, previousName, 0.040)) touched += 1;
      }
      if (filterEnv.amount <= 0) {
        voice.filterEnvelope = null;
        return;
      }
      const entry = voice.filterNodes.find((filter) => filter.name === filterEnv.target);
      const params = filterFrequencyParams(entry);
      if (!params.length) {
        voice.filterEnvelope = null;
        return;
      }
      const target = filterEnvelopeCurrentCutoff(voice, entry, filterEnv, ampEnv, t);
      params.forEach((param) => smoothAudioParam(param, target, paramId === "filter-env-amount" ? 0.045 : 0.055));
      voice.filterEnvelope = {
        filterName: entry.name,
        filterEntry: entry,
        baseCutoff: clamp(entry.cutoff || target, 20, 20000),
        amount: filterEnv.amount,
        polarity: filterEnv.polarity,
        attack: filterEnv.attack,
        decay: filterEnv.decay,
        sustain: filterEnv.sustain,
        release: filterEnv.release
      };
      touched += 1;
    });
    return true;
  }

  function smoothAudioParam(param, target, timeConstant) {
    if (!param || !context) return;
    const t = now();
    const value = Number(target);
    if (!Number.isFinite(value)) return;
    try {
      if (typeof param.cancelAndHoldAtTime === "function") {
        param.cancelAndHoldAtTime(t);
      } else {
        const current = Number.isFinite(param.value) ? param.value : value;
        param.cancelScheduledValues(t);
        param.setValueAtTime(current, t);
      }
      param.setTargetAtTime(value, t, Math.max(0.008, timeConstant || 0.018));
    } catch (_) {
      try { param.value = value; } catch (__) {}
    }
  }


  function applyEffectCurve(cfg, smoothCurve) {
    if (!effectShaper) return;
    const signature = effectCurveSignature(cfg);
    if (signature === lastEffectCurveSignature) return;

    const apply = () => {
      try {
        effectShaper.curve = makeSaturationCurve(cfg);
        lastEffectCurveSignature = signature;
      } catch (err) {
        window.SynthXLogger?.warn("Effect curve error", err);
      }
    };

    // v0.6.1: niente più abbassamento brutale del wet gain durante il drag.
    // La v0.6.0 silenziava quasi a zero il ramo wet ad ogni input: su Amount
    // e Asymmetry poteva produrre buchi/raschiamenti. Ora aggiorniamo la curva
    // con debounce breve, lasciando il mix stabile.
    if (effectCurveTimer) window.clearTimeout(effectCurveTimer);
    if (!smoothCurve || !context || voices.size === 0) {
      apply();
      effectCurveTimer = null;
      return;
    }
    effectCurveTimer = window.setTimeout(() => {
      apply();
      effectCurveTimer = null;
    }, 28);
  }

  function updateEffectRouteStatus(cfg) {
    const el = document.getElementById("effect-route-status");
    if (!el) return;
    const modeLabel = cfg.enabled ? `${cfg.mode} attivo` : "bypass dry";
    el.textContent = `Sorgenti voce → Filter Drive pre-filtro → Filtri in serie → Amp ADSR → Drive/Saturation globale (${modeLabel}) → EQ 5 bande → Modulazione → Delay → Ambiente/Reverb → Dynamics Safety → Master`;
  }

  function updateEffectChain(paramId, options) {
    const cfg = getSaturationConfig();
    updateEffectRouteStatus(cfg);
    if (!context || !effectInput || !effectShaper) return false;
    const t = now();
    try {
      effectPreFilter.type = "highpass";
      effectDcFilter.type = "highpass";
      effectToneFilter.type = "lowpass";
      smoothAudioParam(effectPreFilter.frequency, cfg.voicingPreHz, 0.024);
      smoothAudioParam(effectDcFilter.frequency, cfg.dcBlockHz, 0.024);
      smoothAudioParam(effectPreFilter.Q, 0.7, 0.024);
      smoothAudioParam(effectDcFilter.Q, 0.7, 0.024);
      smoothAudioParam(effectToneFilter.Q, 0.7, 0.024);
      const character = getEffectModeCharacter(cfg.mode);
      const effectivePreDb = cfg.enabled ? clamp(cfg.preDb + character.preDbOffset, 0, 24) : 0;
      const effectiveToneHz = clamp(cfg.tone * character.toneMul, 500, 20000);
      smoothAudioParam(effectToneFilter.frequency, effectiveToneHz, 0.026);
      smoothAudioParam(effectPreGain.gain, cfg.enabled ? dbToGain(effectivePreDb) : 1, 0.020);
      smoothAudioParam(effectDryGain.gain, computeEffectDryGain(cfg), 0.018);
      smoothAudioParam(effectWetGain.gain, computeEffectWetGain(cfg), 0.018);
      const curveNeedsUpdate = !paramId || SAT_CURVE_PARAM_IDS.includes(paramId) || options?.forceCurve;
      if (curveNeedsUpdate) applyEffectCurve(cfg, Boolean(paramId));
      // Mantiene valori validi anche se un browser inizializza parametri a zero.
      if (effectOutput?.gain) effectOutput.gain.setTargetAtTime(0.85, t, 0.04);
    } catch (err) {
      window.SynthXLogger?.warn("Effect chain update error", err);
    }
    return true;
  }

  function updateEqRouteStatus(cfg) {
    const el = document.getElementById("eq-route-status");
    if (!el) return;
    const mode = cfg.enabled ? "EQ attivo" : "bypass EQ";
    el.textContent = `Drive/Saturation globale → EQ 5 bande (${mode}) → Modulazione → Delay → Ambiente/Reverb → Dynamics Safety → Master`;
  }

  function updateEqChain(paramId) {
    const cfg = getEqConfig();
    updateEqRouteStatus(cfg);
    if (!context || !eqInput || !eqOutput || !eqBands.length) return false;
    try {
      const enabled = Boolean(cfg.enabled);
      smoothAudioParam(eqBypassGain.gain, enabled ? 0 : 1, 0.020);
      smoothAudioParam(eqWetGain.gain, enabled ? 1 : 0, 0.020);
      eqBands.forEach((band) => {
        const gainDb = clamp(cfg[band.key], -12, 12);
        band.node.type = band.type;
        smoothAudioParam(band.node.frequency, band.frequency, 0.030);
        smoothAudioParam(band.node.Q, band.q, 0.030);
        smoothAudioParam(band.node.gain, gainDb, 0.024);
      });
    } catch (err) {
      window.SynthXLogger?.warn("EQ chain update error", paramId || "", err);
    }
    return true;
  }


  function applyReverbImpulse(cfg, smooth) {
    if (!reverbConvolver || !context) return;
    const signature = reverbSignature(cfg);
    if (signature === lastReverbSignature && reverbConvolver.buffer) return;
    const apply = () => {
      try {
        reverbConvolver.buffer = makeReverbImpulse(context, cfg);
        lastReverbSignature = signature;
      } catch (err) {
        window.SynthXLogger?.warn("Reverb impulse error", err);
      }
    };
    if (reverbImpulseTimer) window.clearTimeout(reverbImpulseTimer);
    if (!smooth || voices.size === 0) {
      apply();
      reverbImpulseTimer = null;
      return;
    }
    reverbImpulseTimer = window.setTimeout(() => {
      apply();
      reverbImpulseTimer = null;
    }, 80);
  }

  function updateModulationChain(paramId) {
    const cfg = getModulationConfig();
    if (!context || !modInput || !modOutput) return false;
    try {
      const enabled = Boolean(cfg.enabled);
      const mode = cfg.mode;
      const isChorusLike = mode === "chorus" || mode === "ensemble" || mode === "flanger";
      const isPhaser = mode === "phaser";
      const spec = FX_ROUTING_LIMITS.modulation;
      const character = getModulationCharacter(mode, cfg.depth);
      const gains = computeFxDryWet(enabled, cfg.mix, spec, character.wetTrim);
      const stack = getFxStackCompensation();
      const rate = clamp(cfg.rate * character.rateMul, 0.035, 8);
      const leftWet = gains.active && isChorusLike ? gains.wet * 0.72 * stack.wetScale : 0;
      const rightWet = gains.active && isChorusLike ? gains.wet * (mode === "ensemble" ? 0.78 : 0.70) * stack.wetScale : 0;
      const phaserWet = gains.active && isPhaser ? gains.wet * stack.wetScale : 0;
      const feedbackCap = (mode === "flanger" ? 0.30 : 0.08) * stack.feedbackScale;
      const feedback = gains.active && isChorusLike ? clamp(character.feedback * (0.75 + cfg.mix * 0.25) * stack.feedbackScale, 0, feedbackCap) : 0;

      smoothAudioParam(modDryGain.gain, gains.dry, 0.020);
      smoothAudioParam(modOutput.gain, gains.active ? gains.output * stack.outputScale : gains.output, 0.024);
      smoothAudioParam(modChorusWetGain.gain, leftWet, 0.024);
      smoothAudioParam(modChorusWetGainR?.gain, rightWet, 0.024);
      smoothAudioParam(modPhaserWetGain.gain, phaserWet, 0.024);
      smoothAudioParam(modChorusDelay.delayTime, character.baseDelay, 0.035);
      smoothAudioParam(modChorusDelayR?.delayTime, character.baseDelayR, 0.035);
      smoothAudioParam(modChorusFeedbackGain?.gain, feedback, 0.030);
      smoothAudioParam(modChorusFeedbackGainR?.gain, feedback * (mode === "ensemble" ? 0.55 : 0.82), 0.030);
      smoothAudioParam(modLfoOsc.frequency, rate, 0.030);
      smoothAudioParam(modLfoGain.gain, gains.active && isChorusLike ? character.lfoDepth : 0, 0.030);
      smoothAudioParam(modLfoGainR?.gain, gains.active && isChorusLike ? character.lfoDepthR : 0, 0.030);
      smoothAudioParam(modPhaserLfoGain.gain, gains.active && isPhaser ? character.phaserSweep : 0, 0.030);
      smoothAudioParam(modChorusPanL?.pan, -character.pan, 0.035);
      smoothAudioParam(modChorusPanR?.pan, character.pan, 0.035);
      modPhaserFilters.forEach((filter, index) => {
        filter.type = "allpass";
        smoothAudioParam(filter.frequency, character.phaserBase + (index * (mode === "phaser" ? 420 : 390)), 0.034);
        smoothAudioParam(filter.Q, character.phaserQ, 0.034);
      });
    } catch (err) {
      window.SynthXLogger?.warn("Modulation chain update error", paramId || "", err);
    }
    return true;
  }

  function updateDelayChain(paramId) {
    const cfg = getDelayConfig();
    if (!context || !delayInput || !delayNode) return false;
    try {
      const enabled = Boolean(cfg.enabled);
      const isPingPong = cfg.mode === "pingpong";
      const syncLong = cfg.timeMode === "sync" && cfg.time >= 0.70;
      const wetTrim = isPingPong ? FX_ROUTING_LIMITS.delay.wetTrim * 0.86 : FX_ROUTING_LIMITS.delay.wetTrim;
      const gains = computeFxDryWet(enabled, cfg.mix, FX_ROUTING_LIMITS.delay, wetTrim);
      const stack = getFxStackCompensation();
      delayDampingFilter.type = "lowpass";
      if (delayPingDampL) delayPingDampL.type = "lowpass";
      if (delayPingDampR) delayPingDampR.type = "lowpass";
      smoothAudioParam(delayDryGain.gain, gains.dry, 0.020);
      smoothAudioParam(delayOutput.gain, gains.active ? gains.output * stack.outputScale : gains.output, 0.026);
      smoothAudioParam(delayWetGain.gain, gains.active && !isPingPong ? gains.wet * stack.wetScale : 0, 0.026);
      smoothAudioParam(delayPingInputGain?.gain, gains.active && isPingPong ? stack.wetScale : 0, 0.026);
      smoothAudioParam(delayPingWetGainL?.gain, gains.active && isPingPong ? gains.wet * 0.82 * stack.wetScale : 0, 0.030);
      smoothAudioParam(delayPingWetGainR?.gain, gains.active && isPingPong ? gains.wet * 0.82 * stack.wetScale : 0, 0.030);
      const time = clamp(cfg.time, 0.035, DELAY_MAX_SECONDS);
      smoothAudioParam(delayNode.delayTime, time, 0.040);
      smoothAudioParam(delayPingDelayL?.delayTime, time, 0.045);
      smoothAudioParam(delayPingDelayR?.delayTime, time, 0.045);
      const safety = getSafetyConfig();
      const reverbCfg = getReverbConfig();
      const baseCap = (safety.enabled && safety.feedbackGuard) ? 0.64 : 0.72;
      const wetLoad = (cfg.mix * 0.20) + (reverbCfg.enabled ? reverbCfg.mix * 0.16 : 0) + (isPingPong ? 0.045 : 0) + (syncLong ? 0.035 : 0);
      const feedbackCap = clamp((baseCap - wetLoad) * stack.feedbackScale, isPingPong ? 0.38 : 0.44, isPingPong ? 0.60 : 0.70);
      const feedback = gains.active ? clamp(cfg.feedback * stack.feedbackScale, 0, feedbackCap) : 0;
      smoothAudioParam(delayFeedbackGain.gain, gains.active && !isPingPong ? feedback : 0, 0.032);
      smoothAudioParam(delayPingFeedbackL?.gain, gains.active && isPingPong ? feedback : 0, 0.034);
      smoothAudioParam(delayPingFeedbackR?.gain, gains.active && isPingPong ? feedback : 0, 0.034);
      smoothAudioParam(delayDampingFilter.frequency, cfg.dampingHz, 0.040);
      smoothAudioParam(delayPingDampL?.frequency, cfg.dampingHz, 0.044);
      smoothAudioParam(delayPingDampR?.frequency, cfg.dampingHz, 0.044);
      smoothAudioParam(delayDampingFilter.Q, 0.7, 0.030);
      smoothAudioParam(delayPingDampL?.Q, 0.66, 0.030);
      smoothAudioParam(delayPingDampR?.Q, 0.66, 0.030);
      smoothAudioParam(delayPingPanL?.pan, isPingPong ? -0.78 : 0, 0.035);
      smoothAudioParam(delayPingPanR?.pan, isPingPong ? 0.78 : 0, 0.035);
    } catch (err) {
      window.SynthXLogger?.warn("Delay chain update error", paramId || "", err);
    }
    return true;
  }

  function updateReverbChain(paramId, options) {
    const cfg = getReverbConfig();
    if (!context || !reverbInput || !reverbConvolver) return false;
    try {
      const enabled = Boolean(cfg.enabled);
      const spec = FX_ROUTING_LIMITS.reverb;
      const wetTrim = cfg.mode === "hall" ? spec.hallWetTrim
        : cfg.mode === "plate" ? spec.plateWetTrim
        : cfg.mode === "dark" ? spec.darkWetTrim
        : spec.roomWetTrim;
      const gains = computeFxDryWet(enabled, cfg.mix, spec, wetTrim);
      const stack = getFxStackCompensation();
      const dampingMul = cfg.mode === "plate" ? 1.36 : cfg.mode === "dark" ? 0.48 : cfg.mode === "hall" ? 0.88 : 0.82;
      const dampingMax = cfg.mode === "dark" ? 6200 : cfg.mode === "room" ? 11500 : 18000;
      const dampingQ = cfg.mode === "plate" ? 0.62 : cfg.mode === "dark" ? 0.52 : 0.7;
      reverbDampingFilter.type = "lowpass";
      smoothAudioParam(reverbDryGain.gain, gains.dry, 0.024);
      smoothAudioParam(reverbOutput.gain, gains.active ? gains.output * stack.outputScale : gains.output, 0.034);
      smoothAudioParam(reverbWetGain.gain, gains.wet * stack.wetScale, 0.038);
      smoothAudioParam(reverbDampingFilter.frequency, clamp(cfg.dampingHz * dampingMul, 280, dampingMax), 0.040);
      smoothAudioParam(reverbDampingFilter.Q, dampingQ, 0.030);
      const impulseNeedsUpdate = !paramId || ["rev-mode", "rev-size", "rev-decay"].includes(paramId) || options?.forceImpulse;
      if (impulseNeedsUpdate) applyReverbImpulse(cfg, Boolean(paramId));
    } catch (err) {
      window.SynthXLogger?.warn("Reverb chain update error", paramId || "", err);
    }
    return true;
  }


  function computeGainGuardReduction(cfg) {
    if (!cfg.gainGuard) return 1;
    // v0.23.3c: non fare saltare il Gain Guard nel momento esatto in cui
    // una voce entra in release. La voce non è più in voices, ma la sua coda
    // audio esiste ancora; ignorarla può produrre un piccolo scalino globale
    // percepibile sulle sinusoidi o sui timbri puliti che continuano a suonare.
    const active = Math.max(0, voices.size + releaseTailVoiceCount);
    if (active <= 1) return 1;
    const reduction = 1 / (1 + ((active - 1) * cfg.guardDepth));
    return clamp(reduction, 0.55, 1);
  }

  function updateClipIndicator(level, clipped, reduction) {
    const clipEl = document.getElementById("safety-clip-status");
    const meterEl = document.getElementById("safety-meter-fill");
    const redEl = document.getElementById("safety-reduction-status");
    if (meterEl) meterEl.style.width = `${Math.round(clamp(level, 0, 1) * 100)}%`;
    if (clipEl) {
      clipEl.textContent = clipped ? "CLIP / LIMIT" : "OK";
      clipEl.classList.toggle("clip-hot", Boolean(clipped));
    }
    if (redEl) {
      const db = reduction >= 0.999 ? 0 : 20 * Math.log10(Math.max(0.0001, reduction));
      redEl.textContent = reduction >= 0.999 ? "Gain Guard: 0.0 dB" : `Gain Guard: ${db.toFixed(1)} dB`;
    }
  }

  function startSafetyMonitor() {
    if (!context || !safetyAnalyser || safetyMonitorTimer) return;
    const data = new Uint8Array(safetyAnalyser.fftSize);
    const tick = () => {
      if (!safetyAnalyser) {
        safetyMonitorTimer = null;
        return;
      }
      safetyAnalyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs((data[i] - 128) / 128);
        if (v > peak) peak = v;
      }
      const t = now();
      if (peak >= 0.94) safetyClipHoldUntil = Math.max(safetyClipHoldUntil, t + 0.45);
      updateClipIndicator(peak, t < safetyClipHoldUntil, safetyLastReduction);
      safetyMonitorTimer = window.requestAnimationFrame(tick);
    };
    safetyMonitorTimer = window.requestAnimationFrame(tick);
  }

  function updateSafetyChain(paramId) {
    const cfg = getSafetyConfig();
    if (!context || !safetyInput || !safetyLimiter || !safetyClipper) return false;
    const t = now();
    try {
      const enabled = Boolean(cfg.enabled);
      const reduction = computeGainGuardReduction(cfg);
      safetyLastReduction = reduction;
      smoothAudioParam(safetyBypassGain.gain, enabled ? 0 : 1, 0.020);
      smoothAudioParam(safetyWetGain.gain, enabled ? 1 : 0, 0.020);
      smoothAudioParam(safetyPreGain.gain, enabled ? reduction : 1, 0.030);
      smoothAudioParam(safetyOutput.gain, 0.96, 0.030);
      smoothAudioParam(safetyLimiter.threshold, cfg.thresholdDb, 0.030);
      smoothAudioParam(safetyLimiter.knee, 6, 0.030);
      smoothAudioParam(safetyLimiter.ratio, 12, 0.030);
      smoothAudioParam(safetyLimiter.attack, 0.003, 0.020);
      smoothAudioParam(safetyLimiter.release, cfg.releaseMs / 1000, 0.035);
      if (!safetyClipper.curve) safetyClipper.curve = makeSafetyClipCurve();
      updateClipIndicator(0, false, reduction);
    } catch (err) {
      window.SynthXLogger?.warn("Safety chain update error", paramId || "", err);
    }
    return true;
  }

  function updateActiveFilterParams(paramId) {
    if (!context || !isReady || voices.size === 0) return false;
    const filterName = FILTER_PARAM_TO_NAME[paramId];
    if (!filterName) return false;
    const cfg = getFiltersConfig().find((filter) => filter.name === filterName);
    if (!cfg || !cfg.enabled) return false;

    let touched = 0;
    voices.forEach((voice) => {
      const entry = voice.filterNodes?.find((filter) => filter.name === filterName);
      const freqParams = filterFrequencyParams(entry);
      if (!entry || !freqParams.length) return;
      const cutoff = filterCutoffForVoice(cfg, voice);
      const q = clamp(cfg.q, 0.1, 20);
      if (paramId.endsWith("-cutoff") || paramId === "vcf-keytrack" || paramId === "vcf-velocity") {
        entry.baseCutoff = clamp(cfg.cutoff, 20, 20000);
        entry.cutoff = cutoff;
        entry.keyTrack = cfg.keyTrack || 0;
        entry.velocity = cfg.velocity || 0;
        if (voice.filterEnvelope?.filterName === filterName && getFilterEnvConfig().amount > 0) {
          const target = filterEnvelopeCurrentCutoff(voice, entry, getFilterEnvConfig(), getEnvelopeConfig(), now());
          freqParams.forEach((param) => smoothAudioParam(param, target, 0.026));
          voice.filterEnvelope.baseCutoff = cutoff;
        } else {
          freqParams.forEach((param) => smoothAudioParam(param, cutoff, 0.018));
        }
        updateFilterLfoDepths(filterName);
      } else if (paramId.endsWith("-q")) {
        // Q alto può essere molto risonante: lo aggiorniamo live con smoothing
        // per evitare click/raschiamenti causati dalla ricostruzione della voce.
        // v0.16.1a: su slope 24 dB aggiorniamo i due stadi con Q compensato,
        // invece di duplicare brutalmente la stessa risonanza su entrambi.
        applyFilterQToEntry(entry, q, 0.024);
      }
      touched += 1;
    });
    return touched > 0;
  }

  function applyLfoToOscillator(voice, oscInfo, lfoCfg, baseGainValue) {
    if (!lfoCfg.enabled || lfoCfg.depth <= 0 || !lfoCfg.targets[oscInfo.index]) return;
    if (isFilterLfoDest(lfoCfg.dest) || isAdvancedFilterLfoDest(lfoCfg.dest)) return;
    const t = now();
    const lfoOsc = context.createOscillator();
    const lfoGain = context.createGain();
    applyOscillatorWaveform(lfoOsc, lfoCfg.wave);
    lfoOsc.frequency.setValueAtTime(lfoCfg.effectiveRate || lfoCfg.rate, t);

    if (lfoCfg.dest === "volume") {
      // Base pedagogica: depth=1 produce tremolo ampio ma evita di partire da gain negativo.
      const amount = Math.max(0, baseGainValue) * lfoCfg.depth * 0.5;
      oscInfo.gain.gain.setValueAtTime(Math.max(0.0001, baseGainValue - amount), t);
      lfoGain.gain.setValueAtTime(amount, t);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(oscInfo.gain.gain);
    } else {
      // Pitch: depth 1 = +/- 1200 cent, cioè circa una ottava. Default depth 0.
      lfoGain.gain.setValueAtTime(lfoCfg.depth * 1200, t);
      lfoOsc.connect(lfoGain);
      carrierLayersForOscInfo(oscInfo).forEach((layer) => {
        try { if (layer?.osc?.detune) lfoGain.connect(layer.osc.detune); } catch (_) {}
      });
    }

    lfoOsc.start(t);
    voice.lfos.push({ osc: lfoOsc, gain: lfoGain, target: `osc${oscInfo.index}`, targetIndex: oscInfo.index, dest: lfoCfg.dest, lfo: lfoCfg.index, baseGainValue, oscInfo });
  }

  function applyLfoToFilters(voice, lfoCfg) {
    if (!lfoCfg.enabled || lfoCfg.depth <= 0 || !isFilterLfoDest(lfoCfg.dest)) return;
    const filterName = filterNameFromLfoDest(lfoCfg.dest);
    const entry = voice.filterNodes?.find((filter) => filter.name === filterName);
    const params = filterFrequencyParams(entry);
    if (!params.length) return;
    const t = now();
    const lfoOsc = context.createOscillator();
    const lfoGain = context.createGain();
    const baseCutoff = clamp(entry.cutoff || params[0]?.value || 1000, 20, 20000);
    const amount = clamp(baseCutoff * lfoCfg.depth * 0.5, 5, 8000);
    applyOscillatorWaveform(lfoOsc, lfoCfg.wave);
    lfoOsc.frequency.setValueAtTime(lfoCfg.effectiveRate || lfoCfg.rate, t);
    lfoGain.gain.setValueAtTime(amount, t);
    lfoOsc.connect(lfoGain);
    params.forEach((param) => lfoGain.connect(param));
    lfoOsc.start(t);
    voice.lfos.push({ osc: lfoOsc, gain: lfoGain, target: filterName, filterName, dest: lfoCfg.dest, lfo: lfoCfg.index, baseCutoff, filterEntry: entry });
  }

  function lfoBipolarSample(wave, phase) {
    const p = ((Number(phase) || 0) % 1 + 1) % 1;
    const normalized = String(wave || "sine");
    if (normalized === "square") return p < 0.5 ? 1 : -1;
    if (normalized === "triangle") return 1 - (4 * Math.abs(p - 0.5));
    if (normalized === "saw") return (p * 2) - 1;
    if (normalized === "saw_rev") return 1 - (p * 2);
    return Math.sin(p * Math.PI * 2);
  }

  function startPulseWidthModulation() {
    // v0.22.0c: legacy no-op. PWM ora è audio-rate nella pulse control chain,
    // quindi non usa più setInterval né riscrittura periodica della curva.
  }

  const oscSyncPeriodicWaveCache = new Map();

  function sourceIndexFromName(value) {
    const match = String(value || "").match(/^osc([123])$/);
    return match ? Number(match[1]) : 0;
  }

  function waveformSample(kind, phase, pulseWidth) {
    const p = ((Number(phase) || 0) % 1 + 1) % 1;
    const wave = String(kind || "sine");
    if (wave === "triangle") return 1 - (4 * Math.abs(p - 0.5));
    if (wave === "square") return p < 0.5 ? 1 : -1;
    if (wave === "pulse") return p < clampPulseWidth(pulseWidth) ? 1 : -1;
    if (wave === "saw") return (p * 2) - 1;
    if (wave === "saw_rev") return 1 - (p * 2);
    return Math.sin(p * Math.PI * 2);
  }

  function oscSyncRatio(masterCfg, slaveCfg) {
    const masterSemi = Number(masterCfg?.semi) || 0;
    const slaveSemi = Number(slaveCfg?.semi) || 0;
    const masterFine = clamp(Number(masterCfg?.fine) || 0, -100, 100);
    const slaveFine = clamp(Number(slaveCfg?.fine) || 0, -100, 100);
    return clamp(Math.pow(2, ((slaveSemi - masterSemi) / 12) + ((slaveFine - masterFine) / 1200)), 0.25, 8);
  }

  function makeOscSyncPeriodicWave(slaveCfg, ratio) {
    if (!context || typeof context.createPeriodicWave !== "function") return null;
    const harmonics = 64;
    const samples = 2048;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    const values = new Float32Array(samples);
    let mean = 0;
    const syncWave = shouldUsePulseGenerator(slaveCfg?.wave, slaveCfg?.pulseWidth, 0) ? "pulse" : (slaveCfg?.wave || "saw");
    for (let i = 0; i < samples; i += 1) {
      const phase = i / samples;
      const v = waveformSample(syncWave, phase * ratio, slaveCfg?.pulseWidth ?? 0.5);
      values[i] = v;
      mean += v;
    }
    mean /= samples;
    for (let i = 0; i < samples; i += 1) values[i] -= mean;
    for (let h = 1; h <= harmonics; h += 1) {
      let a = 0;
      let b = 0;
      for (let i = 0; i < samples; i += 1) {
        const angle = Math.PI * 2 * h * i / samples;
        a += values[i] * Math.cos(angle);
        b += values[i] * Math.sin(angle);
      }
      real[h] = (2 / samples) * a;
      imag[h] = (2 / samples) * b;
    }
    try {
      return context.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch (err) {
      window.SynthXLogger?.warn("Osc Sync PeriodicWave unavailable", err);
      return null;
    }
  }

  function getOscSyncPeriodicWave(slaveCfg, ratio) {
    if (!context) return null;
    const sampleRate = context.sampleRate || 44100;
    const wave = String(slaveCfg?.wave || "saw");
    const pw = Math.round(clampPulseWidth(slaveCfg?.pulseWidth ?? 0.5) * 100) / 100;
    const r = Math.round(clamp(Number(ratio) || 1, 0.25, 8) * 1000) / 1000;
    const key = `${sampleRate}:${wave}:${pw}:${r}`;
    if (!oscSyncPeriodicWaveCache.has(key)) oscSyncPeriodicWaveCache.set(key, makeOscSyncPeriodicWave(slaveCfg, r));
    return oscSyncPeriodicWaveCache.get(key);
  }

  function createOscSyncChain(note, syncCfg, slaveOscCfg, allOscConfigs, drySource, glideFromNote, glideSeconds) {
    if (!context || !syncCfg?.enabled || syncCfg.amount <= 0 || !drySource) return null;
    if (normalizeOscSyncSource(syncCfg.slave, "osc2") !== `osc${slaveOscCfg.index}`) return null;
    const masterIndex = sourceIndexFromName(syncCfg.master);
    const masterCfg = (allOscConfigs || []).find((entry) => Number(entry.index) === masterIndex);
    if (!masterCfg || Number(masterCfg.index) === Number(slaveOscCfg.index)) return null;

    const t = now();
    const amount = clamp(syncCfg.amount, 0, 1);
    const ratio = oscSyncRatio(masterCfg, slaveOscCfg);
    const periodic = getOscSyncPeriodicWave(slaveOscCfg, ratio);
    if (!periodic) return null;

    const syncOsc = context.createOscillator();
    const dryGain = context.createGain();
    const syncGain = context.createGain();
    const mixGain = context.createGain();
    const masterSemiRatio = Math.pow(2, (Number(masterCfg.semi) || 0) / 12);
    const masterFreq = midiToFrequency(note) * masterSemiRatio;
    const masterFine = clamp(Number(masterCfg.fine) || 0, -100, 100);
    try { syncOsc.setPeriodicWave(periodic); } catch (_) { syncOsc.type = "sawtooth"; }
    const syncGlideFrom = Number(glideFromNote);
    const syncGlideSeconds = Math.max(0, Number(glideSeconds) || 0);
    if (Number.isFinite(syncGlideFrom) && syncGlideSeconds > 0) {
      const startFreq = midiToFrequency(syncGlideFrom) * masterSemiRatio;
      syncOsc.frequency.setValueAtTime(startFreq, t);
      syncOsc.frequency.linearRampToValueAtTime(masterFreq, t + syncGlideSeconds);
    } else {
      syncOsc.frequency.setValueAtTime(masterFreq, t);
    }
    syncOsc.detune.setValueAtTime(clamp(masterFine + currentPitchBendCents(), -2400, 2400), t);
    dryGain.gain.setValueAtTime(1 - amount, t);
    syncGain.gain.setValueAtTime(amount, t);
    drySource.connect(dryGain);
    dryGain.connect(mixGain);
    syncOsc.connect(syncGain);
    syncGain.connect(mixGain);
    syncOsc.start(t);

    return {
      syncOsc,
      dryGain,
      syncGain,
      mixGain,
      output: mixGain,
      amount,
      master: normalizeOscSyncSource(syncCfg.master, "osc1"),
      slave: normalizeOscSyncSource(syncCfg.slave, "osc2"),
      masterSemi: Number(masterCfg.semi) || 0,
      masterFine,
      slaveSemi: Number(slaveOscCfg.semi) || 0,
      slaveFine: Number(slaveOscCfg.fine) || 0,
      ratio
    };
  }

  function fmIndexFromAmount(amount) {
    // v0.26.6y: helper unico preservato per tenere coerenti audio, QA e metadata.
    // 0..35% conserva la risposta v0.22.2b; 35..50% conserva la coda v0.22.2d;
    // 50..70% aggiunge una nuova zona extreme/industrial controllata.
    const amt = clamp(Number(amount) || 0, 0, FM_AMOUNT_MAX);
    if (amt <= 0.35) return clamp((amt / 0.35) * 4.0, 0, 4.0);
    if (amt <= 0.50) return clamp(4.0 + (((amt - 0.35) / 0.15) * 1.0), 4.0, 5.0);
    return clamp(5.0 + (((amt - 0.50) / 0.20) * (FM_INDEX_MAX - 5.0)), 5.0, FM_INDEX_MAX);
  }

  function fmDepthHz(modulatorFreq, amount) {
    // v0.26.6y: FM Light fino al 70% preservata, con coda prudente oltre il vecchio 50%.
    const freq = Math.max(0, Number(modulatorFreq) || 0);
    const amt = clamp(Number(amount) || 0, 0, FM_AMOUNT_MAX);
    const cap = amt <= 0.50
      ? FM_DEPTH_HZ_OLD_MAX
      : FM_DEPTH_HZ_OLD_MAX + (((amt - 0.50) / 0.20) * (FM_DEPTH_HZ_MAX - FM_DEPTH_HZ_OLD_MAX));
    return clamp(freq * fmIndexFromAmount(amt), 0, cap);
  }

  function createFmChain(note, fmCfg, carrierOscCfg, allOscConfigs, carrierOsc, glideFromNote, glideSeconds) {
    const carrierOscs = Array.isArray(carrierOsc) ? carrierOsc.filter(Boolean) : [carrierOsc].filter(Boolean);
    if (!context || !carrierOscs.length || !fmCfg?.enabled || fmCfg.amount <= 0) return null;
    if (normalizeFmSource(fmCfg.carrier, "osc1") !== `osc${carrierOscCfg.index}`) return null;
    const modIndex = Number(String(fmCfg.modulator || "osc2").replace("osc", ""));
    const modCfg = (allOscConfigs || []).find((entry) => Number(entry.index) === modIndex);
    if (!modCfg) return null;

    const t = now();
    const amount = clamp(fmCfg.amount, 0, FM_AMOUNT_MAX);
    const modOsc = context.createOscillator();
    const modGain = context.createGain();
    const carrierSemiRatio = Math.pow(2, (Number(carrierOscCfg.semi) || 0) / 12);
    const modSemiRatio = Math.pow(2, (Number(modCfg.semi) || 0) / 12);
    const carrierFreq = midiToFrequency(note) * carrierSemiRatio;
    const modFreq = midiToFrequency(note) * modSemiRatio;
    const modFine = clamp(Number(modCfg.fine) || 0, -100, 100);
    const depthHz = fmDepthHz(modFreq, amount);
    const usesPulseModulator = shouldUsePulseGenerator(modCfg.wave, modCfg.pulseWidth, 0);
    const modPulseChain = usesPulseModulator ? createPulseControlChain({ ...modCfg, pwmAmount: 0, pwmSource: "off" }, []) : null;

    applyOscillatorWaveform(modOsc, modCfg.wave, modCfg.pulseWidth, 0);
    const modGlideFrom = Number(glideFromNote);
    const modGlideSeconds = Math.max(0, Number(glideSeconds) || 0);
    if (Number.isFinite(modGlideFrom) && modGlideSeconds > 0) {
      const modStartFreq = midiToFrequency(modGlideFrom) * modSemiRatio;
      modOsc.frequency.setValueAtTime(modStartFreq, t);
      modOsc.frequency.linearRampToValueAtTime(modFreq, t + modGlideSeconds);
    } else {
      modOsc.frequency.setValueAtTime(modFreq, t);
    }
    modOsc.detune.setValueAtTime(clamp(modFine + currentPitchBendCents(), -2400, 2400), t);
    modGain.gain.setValueAtTime(depthHz, t);

    if (modPulseChain?.pulseShaper) {
      modOsc.connect(modPulseChain.pulseShaper);
      modPulseChain.pulseShaper.connect(modGain);
    } else {
      modOsc.connect(modGain);
    }
    carrierOscs.forEach((carrier) => { try { modGain.connect(carrier.frequency); } catch (_) {} });
    modOsc.start(t);

    return {
      modOsc,
      modGain,
      carrier: normalizeFmSource(fmCfg.carrier, "osc1"),
      modulator: normalizeFmSource(fmCfg.modulator, "osc2"),
      carrierSemi: Number(carrierOscCfg.semi) || 0,
      sourceBSemi: Number(modCfg.semi) || 0,
      sourceBFine: modFine,
      depthHz,
      amount,
      carrierCount: carrierOscs.length,
      fmIndex: fmIndexFromAmount(amount),
      pulseShaper: modPulseChain?.pulseShaper || null,
      pulseBiasSource: modPulseChain?.pulseBiasSource || null
    };
  }

  function createRingModChain(note, ringCfg, carrierOscCfg, allOscConfigs, glideFromNote, glideSeconds) {
    if (!context || !ringCfg?.enabled || ringCfg.amount <= 0) return null;
    if (normalizeRingModSource(ringCfg.sourceA, "osc1") !== `osc${carrierOscCfg.index}`) return null;
    const sourceBIndex = Number(String(ringCfg.sourceB || "osc2").replace("osc", ""));
    const modCfg = (allOscConfigs || []).find((entry) => Number(entry.index) === sourceBIndex);
    if (!modCfg) return null;

    const t = now();
    const amount = clamp(ringCfg.amount, 0, 1);
    const ringGain = context.createGain();
    const modOsc = context.createOscillator();
    const modGain = context.createGain();
    const semiRatio = Math.pow(2, (Number(modCfg.semi) || 0) / 12);
    const freq = midiToFrequency(note) * semiRatio;
    const modFine = clamp(Number(modCfg.fine) || 0, -100, 100);
    const usesPulseModulator = shouldUsePulseGenerator(modCfg.wave, modCfg.pulseWidth, 0);
    const modPulseChain = usesPulseModulator ? createPulseControlChain({ ...modCfg, pwmAmount: 0, pwmSource: "off" }, []) : null;

    applyOscillatorWaveform(modOsc, modCfg.wave, modCfg.pulseWidth, 0);
    const modGlideFrom = Number(glideFromNote);
    const modGlideSeconds = Math.max(0, Number(glideSeconds) || 0);
    if (Number.isFinite(modGlideFrom) && modGlideSeconds > 0) {
      const modStartFreq = midiToFrequency(modGlideFrom) * semiRatio;
      modOsc.frequency.setValueAtTime(modStartFreq, t);
      modOsc.frequency.linearRampToValueAtTime(freq, t + modGlideSeconds);
    } else {
      modOsc.frequency.setValueAtTime(freq, t);
    }
    modOsc.detune.setValueAtTime(clamp(modFine + currentPitchBendCents(), -2400, 2400), t);
    ringGain.gain.setValueAtTime(1 - amount, t);
    modGain.gain.setValueAtTime(amount, t);

    if (modPulseChain?.pulseShaper) {
      modOsc.connect(modPulseChain.pulseShaper);
      modPulseChain.pulseShaper.connect(modGain);
    } else {
      modOsc.connect(modGain);
    }
    modGain.connect(ringGain.gain);
    modOsc.start(t);

    return {
      ringGain,
      modOsc,
      modGain,
      sourceA: normalizeRingModSource(ringCfg.sourceA, "osc1"),
      sourceB: normalizeRingModSource(ringCfg.sourceB, "osc2"),
      sourceBSemi: Number(modCfg.semi) || 0,
      sourceBFine: modFine,
      glideSeconds: modGlideSeconds,
      amount,
      pulseShaper: modPulseChain?.pulseShaper || null,
      pulseBiasSource: modPulseChain?.pulseBiasSource || null
    };
  }

  function createUnisonOscillatorSource(voice, note, velocity, oscCfg, lfoConfigs, ringModCfg, fmCfg, oscSyncCfg, allOscConfigs, unisonCfg) {
    if (!oscCfg.enabled || oscCfg.level <= 0 || !unisonCfg?.enabled) return null;
    const t = now();
    const layerCount = Math.max(2, Math.min(Math.min(12, Number(unisonCfg.maxLayers) || 3), Math.min(12, Math.round(Number(unisonCfg.voices) || 2))));
    const detuneOffsets = unisonDetuneOffsets({ ...unisonCfg, voices: layerCount });
    const panOffsets = unisonPanOffsets({ ...unisonCfg, voices: layerCount });
    const layerGainComp = unisonGainCompensation(layerCount);
    const sum = context.createGain();
    const gain = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const semiRatio = Math.pow(2, oscCfg.semi / 12);
    const freq = midiToFrequency(note) * semiRatio;
    const baseGainValue = oscCfg.level * velocity;
    const glideFrom = Number(voice.glideFromNote);
    const glideSeconds = Math.max(0, Number(voice.glideSeconds) || 0);
    const effectivePwmAmount = oscCfg.pwmSource === "off" ? 0 : oscCfg.pwmAmount;
    const usesPulseGenerator = shouldUsePulseGenerator(oscCfg.wave, oscCfg.pulseWidth, effectivePwmAmount);
    const layers = [];
    const pwmEntries = [];

    for (let i = 0; i < layerCount; i += 1) {
      const layerOsc = context.createOscillator();
      const layerGain = context.createGain();
      const layerPanner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
      const pulseChain = usesPulseGenerator ? createPulseControlChain(oscCfg, lfoConfigs) : null;
      const pulseShaper = pulseChain?.pulseShaper || null;
      applyOscillatorWaveform(layerOsc, oscCfg.wave, oscCfg.pulseWidth, effectivePwmAmount);
      const detuneOffsetCents = Number(detuneOffsets[i]) || 0;
      layerOsc.detune.setValueAtTime(clamp((oscCfg.fine || 0) + currentPitchBendCents() + detuneOffsetCents, -2400, 2400), t);
      if (Number.isFinite(glideFrom) && glideSeconds > 0) {
        const startFreq = midiToFrequency(glideFrom) * semiRatio;
        layerOsc.frequency.setValueAtTime(startFreq, t);
        layerOsc.frequency.linearRampToValueAtTime(freq, t + glideSeconds);
      } else {
        layerOsc.frequency.setValueAtTime(freq, t);
      }
      const layerOutput = pulseShaper || layerOsc;
      if (pulseShaper) layerOsc.connect(pulseShaper);
      layerGain.gain.setValueAtTime(layerGainComp, t);
      layerOutput.connect(layerGain);
      if (layerPanner) {
        const panOffset = Number(panOffsets[i]) || 0;
        layerPanner.pan.setValueAtTime(clamp(panOffset, -0.95, 0.95), t);
        layerGain.connect(layerPanner);
        layerPanner.connect(sum);
      } else {
        layerGain.connect(sum);
      }
      layerOsc.start(t);
      const layer = {
        osc: layerOsc,
        gain: layerGain,
        panner: layerPanner,
        detuneOffsetCents,
        panOffset: Number(panOffsets[i]) || 0,
        pulseShaper,
        pulseBiasSource: pulseChain?.pulseBiasSource || null,
        pwmOsc: pulseChain?.pwmOsc || null,
        pwmGain: pulseChain?.pwmGain || null,
        pwmLfoIndex: pulseChain?.pwmLfoIndex || null
      };
      layers.push(layer);
      if (pulseChain?.pwmOsc && pulseChain?.pwmGain && pulseChain?.pwmLfoIndex) {
        pwmEntries.push({ layer, pwmOsc: pulseChain.pwmOsc, pwmGain: pulseChain.pwmGain, pwmLfoIndex: pulseChain.pwmLfoIndex });
      }
    }

    const ringModChain = createRingModChain(note, ringModCfg, oscCfg, allOscConfigs, voice.glideFromNote, voice.glideSeconds);
    const ringModGain = ringModChain?.ringGain || null;
    const fmChain = createFmChain(note, fmCfg, oscCfg, allOscConfigs, layers.map((layer) => layer.osc), voice.glideFromNote, voice.glideSeconds);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.setTargetAtTime(baseGainValue, t, 0.012);

    let sourceOutput = sum;
    const oscSyncChain = createOscSyncChain(note, oscSyncCfg, oscCfg, allOscConfigs, sourceOutput, voice.glideFromNote, voice.glideSeconds);
    if (oscSyncChain?.output) sourceOutput = oscSyncChain.output;
    if (ringModGain) {
      sourceOutput.connect(ringModGain);
      ringModGain.connect(gain);
    } else {
      sourceOutput.connect(gain);
    }
    if (panner) {
      panner.pan.setValueAtTime(oscCfg.pan || 0, t);
      gain.connect(panner);
      panner.connect(voice.input);
    } else {
      gain.connect(voice.input);
    }

    const primaryLayer = layers[0];
    const oscInfo = {
      index: oscCfg.index,
      osc: primaryLayer.osc,
      gain,
      panner,
      baseGainValue,
      semi: oscCfg.semi,
      fine: oscCfg.fine || 0,
      pan: oscCfg.pan || 0,
      wave: oscCfg.wave,
      pulseWidth: oscCfg.pulseWidth,
      pwmAmount: oscCfg.pwmAmount,
      pwmSource: oscCfg.pwmSource,
      pulseShaper: primaryLayer.pulseShaper,
      pulseBiasSource: primaryLayer.pulseBiasSource,
      pwmOsc: primaryLayer.pwmOsc,
      pwmGain: primaryLayer.pwmGain,
      pwmLfoIndex: primaryLayer.pwmLfoIndex,
      ringMod: ringModChain || null,
      fm: fmChain || null,
      oscSync: oscSyncChain || null,
      unison: { enabled: true, voices: layerCount, requestedVoices: unisonCfg.requestedVoices, maxLayers: unisonCfg.maxLayers, detune: unisonCfg.detune, spread: unisonCfg.spread, gainCompensation: layerGainComp },
      unisonLayers: layers,
      unisonSum: sum,
      pwmTimer: null,
      pulseWidthCurrent: oscCfg.pulseWidth
    };
    pwmEntries.forEach((entry) => {
      voice.lfos.push({
        osc: entry.pwmOsc,
        gain: entry.pwmGain,
        target: `osc${oscCfg.index}-pwm`,
        targetIndex: oscCfg.index,
        dest: "pwm",
        lfo: entry.pwmLfoIndex,
        oscInfo,
        isPwm: true,
        unisonLayer: entry.layer
      });
    });
    startPulseWidthModulation(oscInfo, oscCfg, lfoConfigs);
    voice.oscillators.push(oscInfo);
    return oscInfo;
  }

  function createOscillatorSource(voice, note, velocity, oscCfg, lfoConfigs, ringModCfg, fmCfg, oscSyncCfg, allOscConfigs, unisonCfg) {
    if (!oscCfg.enabled || oscCfg.level <= 0) return null;
    if (unisonCfg?.enabled) return createUnisonOscillatorSource(voice, note, velocity, oscCfg, lfoConfigs, ringModCfg, fmCfg, oscSyncCfg, allOscConfigs, unisonCfg);
    const t = now();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const semiRatio = Math.pow(2, oscCfg.semi / 12);
    const freq = midiToFrequency(note) * semiRatio;
    const baseGainValue = oscCfg.level * velocity;
    const glideFrom = Number(voice.glideFromNote);
    const glideSeconds = Math.max(0, Number(voice.glideSeconds) || 0);

    const effectivePwmAmount = oscCfg.pwmSource === "off" ? 0 : oscCfg.pwmAmount;
    const usesPulseGenerator = shouldUsePulseGenerator(oscCfg.wave, oscCfg.pulseWidth, effectivePwmAmount);
    const pulseChain = usesPulseGenerator ? createPulseControlChain(oscCfg, lfoConfigs) : null;
    const pulseShaper = pulseChain?.pulseShaper || null;
    const ringModChain = createRingModChain(note, ringModCfg, oscCfg, allOscConfigs, voice.glideFromNote, voice.glideSeconds);
    const ringModGain = ringModChain?.ringGain || null;
    applyOscillatorWaveform(osc, oscCfg.wave, oscCfg.pulseWidth, effectivePwmAmount);
    osc.detune.setValueAtTime(clamp((oscCfg.fine || 0) + currentPitchBendCents(), -2400, 2400), t);
    if (Number.isFinite(glideFrom) && glideSeconds > 0) {
      const startFreq = midiToFrequency(glideFrom) * semiRatio;
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.linearRampToValueAtTime(freq, t + glideSeconds);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    const fmChain = createFmChain(note, fmCfg, oscCfg, allOscConfigs, osc, voice.glideFromNote, voice.glideSeconds);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.setTargetAtTime(baseGainValue, t, 0.012);

    let sourceOutput = pulseShaper || osc;
    if (pulseShaper) osc.connect(pulseShaper);
    const oscSyncChain = createOscSyncChain(note, oscSyncCfg, oscCfg, allOscConfigs, sourceOutput, voice.glideFromNote, voice.glideSeconds);
    if (oscSyncChain?.output) sourceOutput = oscSyncChain.output;
    if (ringModGain) {
      sourceOutput.connect(ringModGain);
      ringModGain.connect(gain);
    } else {
      sourceOutput.connect(gain);
    }
    if (panner) {
      panner.pan.setValueAtTime(oscCfg.pan || 0, t);
      gain.connect(panner);
      panner.connect(voice.input);
    } else {
      gain.connect(voice.input);
    }
    osc.start(t);

    const oscInfo = {
      index: oscCfg.index,
      osc,
      gain,
      panner,
      baseGainValue,
      semi: oscCfg.semi,
      fine: oscCfg.fine || 0,
      pan: oscCfg.pan || 0,
      wave: oscCfg.wave,
      pulseWidth: oscCfg.pulseWidth,
      pwmAmount: oscCfg.pwmAmount,
      pwmSource: oscCfg.pwmSource,
      pulseShaper,
      pulseBiasSource: pulseChain?.pulseBiasSource || null,
      pwmOsc: pulseChain?.pwmOsc || null,
      pwmGain: pulseChain?.pwmGain || null,
      pwmLfoIndex: pulseChain?.pwmLfoIndex || null,
      ringMod: ringModChain || null,
      fm: fmChain || null,
      oscSync: oscSyncChain || null,
      pwmTimer: null,
      pulseWidthCurrent: oscCfg.pulseWidth
    };
    if (pulseChain?.pwmOsc && pulseChain?.pwmGain && pulseChain?.pwmLfoIndex) {
      voice.lfos.push({
        osc: pulseChain.pwmOsc,
        gain: pulseChain.pwmGain,
        target: `osc${oscCfg.index}-pwm`,
        targetIndex: oscCfg.index,
        dest: "pwm",
        lfo: pulseChain.pwmLfoIndex,
        oscInfo,
        isPwm: true
      });
    }
    startPulseWidthModulation(oscInfo, oscCfg, lfoConfigs);
    voice.oscillators.push(oscInfo);
    return oscInfo;
  }

  function createNoiseSource(voice, velocity, noiseCfg) {
    if (!noiseCfg.enabled) return null;
    const t = now();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = getNoiseBuffer(noiseCfg.type);
    source.loop = true;
    const targetGain = dbToGain(noiseCfg.db) * velocity;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.setTargetAtTime(targetGain, t, 0.012);
    source.connect(gain);
    gain.connect(voice.input);
    source.start(t);
    const info = { source, gain, type: noiseCfg.type, baseGainValue: targetGain, startedAt: t, attackTimeConstant: 0.012 };
    voice.noise = info;
    return info;
  }

  function modMatrixFilterNameFromDestination(destination) {
    const key = String(destination || "");
    if (key === "vcf_cutoff") return "vcf";
    if (key === "hpf_cutoff") return "hpf";
    if (key === "bpf_center") return "bpf";
    if (key === "notch_center") return "notch";
    return "";
  }

  function makeModMatrixPlan(param, scale, limit, kind) {
    return {
      param,
      scale: Number.isFinite(scale) ? scale : 0,
      limit: Math.max(0, Number.isFinite(limit) ? limit : Math.abs(scale || 0)),
      kind: kind || "generic"
    };
  }

  function capModMatrixContribution(param, desired, limit, budget) {
    if (!param || !Number.isFinite(desired) || Math.abs(desired) < 0.000001) return 0;
    const cap = Math.max(0, Number.isFinite(limit) ? limit : Math.abs(desired));
    if (cap <= 0) return 0;
    const used = budget.get(param) || 0;
    const remaining = Math.max(0, cap - used);
    if (remaining <= 0.000001) return 0;
    const next = Math.sign(desired) * Math.min(Math.abs(desired), remaining);
    budget.set(param, used + Math.abs(next));
    return next;
  }

  function setModMatrixGainValue(audioParam, value, t) {
    if (!audioParam || !Number.isFinite(value)) return;
    const time = Number.isFinite(t) ? t : now();
    try {
      audioParam.cancelScheduledValues(time);
      audioParam.setTargetAtTime(value, time, 0.012);
    } catch (_) {
      try { audioParam.setValueAtTime(value, time); } catch (_) {}
    }
  }

  function isGlobalFxModMatrixDestination(destination) {
    return GLOBAL_FX_MOD_DESTINATION_IDS.includes(String(destination || ""));
  }

  function createGlobalFxModMatrixSource(slot, cfg) {
    const helper = window.SynthXModulationMatrix;
    if (!context || !slot?.enabled || Math.abs(slot.amount || 0) < 0.0001) return null;
    if (slot.validationStatus && slot.validationStatus !== helper?.VALIDATION_STATUS?.OK) return null;
    const t = now();
    const sourceName = String(slot.source || "lfo1");

    if (/^lfo[123]$/.test(sourceName)) {
      const index = Number(sourceName.slice(-1));
      const lfoCfg = (cfg?.lfos || [])[index - 1] || getLfoConfig(index);
      if (!lfoCfg.enabled || lfoCfg.depth <= 0) return null;
      const osc = context.createOscillator();
      applyOscillatorWaveform(osc, lfoCfg.wave || "sine");
      osc.frequency.setValueAtTime(clamp(lfoCfg.effectiveRate || lfoCfg.rate || 1, 0.01, 40), t);
      osc.start(t);
      return { source: osc, stopNode: osc, multiplier: clamp(lfoCfg.depth || 0, 0, 0.85), releaseMode: "global-stop" };
    }

    if (sourceName === "mod_wheel") {
      const src = ensureModWheelSource();
      if (!src) return null;
      applyModWheelToSource(true);
      return { source: src, stopNode: null, multiplier: 1, releaseMode: "persistent" };
    }

    if (expressionControllerIds.includes(sourceName)) {
      const src = ensureExpressionControllerSource(sourceName);
      if (!src) return null;
      applyExpressionControllerToSource(sourceName, true);
      return { source: src, stopNode: null, multiplier: 1, releaseMode: "persistent" };
    }

    // Velocity e Filter Env restano sorgenti per-voice: non vengono collegati ai parametri FX globali
    // perché non hanno un significato univoco fuori dalla singola voce/note-on.
    return null;
  }

  function frequencyModPlan(param, baseHz, kind) {
    const base = clamp(baseHz, 120, 20000);
    const downRoom = Math.max(0, base - 120);
    const upRoom = Math.max(0, 20000 - base);
    const symmetricRoom = Math.max(60, Math.min(downRoom, upRoom));
    return makeModMatrixPlan(param, clamp(symmetricRoom * 0.10, 24, 1600), clamp(symmetricRoom * 0.18, 48, 2600), kind || "fx-frequency");
  }

  function globalFxModMatrixDestinationPlan(destination) {
    const key = String(destination || "");
    const plans = [];
    if (!context) return plans;

    if (key.startsWith("mod_fx_")) {
      const cfg = getModulationConfig();
      if (!cfg.enabled) return plans;
      const mode = cfg.mode;
      const character = getModulationCharacter(mode, cfg.depth);
      const isChorusLike = mode === "chorus" || mode === "ensemble" || mode === "flanger";
      const isPhaser = mode === "phaser";
      if (key === "mod_fx_mix") {
        if (isChorusLike && modChorusWetGain?.gain) plans.push(makeModMatrixPlan(modChorusWetGain.gain, 0.045, 0.085, "mod-fx-mix"));
        if (isChorusLike && modChorusWetGainR?.gain) plans.push(makeModMatrixPlan(modChorusWetGainR.gain, 0.045, 0.085, "mod-fx-mix-r"));
        if (isPhaser && modPhaserWetGain?.gain) plans.push(makeModMatrixPlan(modPhaserWetGain.gain, 0.055, 0.095, "mod-fx-mix-phaser"));
        return plans;
      }
      if (key === "mod_fx_rate" && modLfoOsc?.frequency) {
        const rate = clamp((modLfoOsc.frequency.value || cfg.rate || 0.65) * (character.rateMul || 1), 0.05, 8);
        plans.push(makeModMatrixPlan(modLfoOsc.frequency, clamp(rate * 0.12, 0.015, 0.38), clamp(rate * 0.24, 0.030, 0.95), "mod-fx-rate"));
        return plans;
      }
      if (key === "mod_fx_depth") {
        if (isChorusLike && modLfoGain?.gain) {
          const amount = Math.max(0.00035, Math.abs(character.lfoDepth || 0.001));
          plans.push(makeModMatrixPlan(modLfoGain.gain, clamp(amount * 0.22, 0.00020, 0.0028), clamp(amount * 0.38, 0.00035, 0.0048), "mod-fx-depth-l"));
        }
        if (isChorusLike && modLfoGainR?.gain) {
          const amount = Math.max(0.00035, Math.abs(character.lfoDepthR || 0.001));
          plans.push(makeModMatrixPlan(modLfoGainR.gain, -clamp(amount * 0.22, 0.00020, 0.0028), clamp(amount * 0.38, 0.00035, 0.0048), "mod-fx-depth-r"));
        }
        if (isPhaser && modPhaserLfoGain?.gain) {
          const sweep = Math.max(80, Math.abs(character.phaserSweep || 120));
          plans.push(makeModMatrixPlan(modPhaserLfoGain.gain, clamp(sweep * 0.10, 18, 130), clamp(sweep * 0.18, 32, 220), "mod-fx-depth-phaser"));
        }
        return plans;
      }
      return plans;
    }

    if (key.startsWith("delay_")) {
      const cfg = getDelayConfig();
      if (!cfg.enabled) return plans;
      const isPingPong = cfg.mode === "pingpong";
      if (key === "delay_mix") {
        if (!isPingPong && delayWetGain?.gain) plans.push(makeModMatrixPlan(delayWetGain.gain, 0.055, 0.100, "delay-mix-mono"));
        if (isPingPong && delayPingWetGainL?.gain) plans.push(makeModMatrixPlan(delayPingWetGainL.gain, 0.045, 0.085, "delay-mix-ping-l"));
        if (isPingPong && delayPingWetGainR?.gain) plans.push(makeModMatrixPlan(delayPingWetGainR.gain, 0.045, 0.085, "delay-mix-ping-r"));
        return plans;
      }
      if (key === "delay_feedback") {
        if (!isPingPong && delayFeedbackGain?.gain) plans.push(makeModMatrixPlan(delayFeedbackGain.gain, 0.035, 0.070, "delay-feedback-mono"));
        if (isPingPong && delayPingFeedbackL?.gain) plans.push(makeModMatrixPlan(delayPingFeedbackL.gain, 0.030, 0.060, "delay-feedback-ping-l"));
        if (isPingPong && delayPingFeedbackR?.gain) plans.push(makeModMatrixPlan(delayPingFeedbackR.gain, 0.030, 0.060, "delay-feedback-ping-r"));
        return plans;
      }
      if (key === "delay_time") {
        const base = clamp(cfg.time, 0.035, DELAY_MAX_SECONDS);
        const headroom = Math.max(0.002, Math.min(base - 0.035, DELAY_MAX_SECONDS - base));
        const scale = clamp(headroom * 0.22, 0.001, 0.030);
        const limit = clamp(headroom * 0.40, 0.002, 0.055);
        if (!isPingPong && delayNode?.delayTime) plans.push(makeModMatrixPlan(delayNode.delayTime, scale, limit, "delay-time-mono"));
        if (isPingPong && delayPingDelayL?.delayTime) plans.push(makeModMatrixPlan(delayPingDelayL.delayTime, scale, limit, "delay-time-ping-l"));
        if (isPingPong && delayPingDelayR?.delayTime) plans.push(makeModMatrixPlan(delayPingDelayR.delayTime, scale, limit, "delay-time-ping-r"));
        return plans;
      }
      if (key === "delay_damp") {
        if (!isPingPong && delayDampingFilter?.frequency) plans.push(frequencyModPlan(delayDampingFilter.frequency, cfg.dampingHz, "delay-damp-mono"));
        if (isPingPong && delayPingDampL?.frequency) plans.push(frequencyModPlan(delayPingDampL.frequency, cfg.dampingHz, "delay-damp-ping-l"));
        if (isPingPong && delayPingDampR?.frequency) plans.push(frequencyModPlan(delayPingDampR.frequency, cfg.dampingHz, "delay-damp-ping-r"));
        return plans;
      }
      return plans;
    }

    if (key.startsWith("reverb_")) {
      const cfg = getReverbConfig();
      if (!cfg.enabled) return plans;
      if (key === "reverb_mix" && reverbWetGain?.gain) {
        plans.push(makeModMatrixPlan(reverbWetGain.gain, 0.052, 0.095, "reverb-mix"));
        return plans;
      }
      if (key === "reverb_damp" && reverbDampingFilter?.frequency) {
        plans.push(frequencyModPlan(reverbDampingFilter.frequency, cfg.dampingHz, "reverb-damp"));
        return plans;
      }
      return plans;
    }

    return plans;
  }

  function disconnectGlobalFxModMatrixEntries() {
    if (!globalFxModMatrixEntries.length) return;
    const t = now();
    globalFxModMatrixEntries.forEach((entry) => {
      const src = entry.sourceInfo?.source;
      if (entry.sourceInfo?.releaseMode !== "persistent") {
        try { entry.sourceInfo?.stopNode?.stop?.(t + 0.015); } catch (_) {}
      }
      try { (entry.gains || []).forEach((gain) => src?.disconnect?.(gain)); } catch (_) {}
      try { (entry.gains || []).forEach((gain) => gain?.disconnect?.()); } catch (_) {}
      if (entry.sourceInfo?.releaseMode !== "persistent") {
        try { src?.disconnect?.(); } catch (_) {}
      }
    });
    globalFxModMatrixEntries = [];
  }

  function updateGlobalFxModMatrix(reason) {
    if (!context || !modInput || !delayInput || !reverbInput) return false;
    disconnectGlobalFxModMatrixEntries();
    const helper = window.SynthXModulationMatrix;
    const cfg = getGlobalConfig();
    const safeSlots = helper?.normalizeMatrix ? helper.normalizeMatrix(cfg.modulationMatrix || []) : [];
    const contributionBudget = new Map();
    safeSlots.forEach((slot) => {
      if (!slot.enabled || Math.abs(slot.amount) < 0.0001) return;
      if (slot.validationStatus && slot.validationStatus !== helper?.VALIDATION_STATUS?.OK) return;
      if (!isGlobalFxModMatrixDestination(slot.destination)) return;
      const plan = globalFxModMatrixDestinationPlan(slot.destination);
      if (!plan.length) return;
      const sourceInfo = createGlobalFxModMatrixSource(slot, cfg);
      if (!sourceInfo?.source) return;
      const gains = [];
      plan.forEach(({ param, scale, limit }) => {
        if (!param || !Number.isFinite(scale) || Math.abs(scale) < 0.0000001) return;
        const rawAmount = clamp(slot.amount, -1, 1) * clamp(sourceInfo.multiplier ?? 1, -1, 1) * scale;
        const targetAmount = capModMatrixContribution(param, rawAmount, limit, contributionBudget);
        if (Math.abs(targetAmount) < 0.0000001) return;
        const gain = context.createGain();
        setModMatrixGainValue(gain.gain, targetAmount, now());
        try {
          sourceInfo.source.connect(gain);
          gain.connect(param);
          gains.push(gain);
        } catch (err) {
          try { gain.disconnect(); } catch (_) {}
          window.SynthXLogger?.warn("Global FX Mod Matrix connect skipped", slot.destination, err);
        }
      });
      if (!gains.length) {
        if (sourceInfo.releaseMode !== "persistent") {
          try { sourceInfo.stopNode?.stop?.(now() + 0.02); } catch (_) {}
          try { sourceInfo.source.disconnect?.(); } catch (_) {}
        }
        return;
      }
      globalFxModMatrixEntries.push({ slot, sourceInfo, gains });
    });
    window.SynthXLogger?.log?.("global fx mod matrix", { reason: reason || "sync", entries: globalFxModMatrixEntries.length });
    return true;
  }

  function createModMatrixSource(slot, cfg) {
    const helper = window.SynthXModulationMatrix;
    if (!context || !slot?.enabled || Math.abs(slot.amount || 0) < 0.0001) return null;
    if (slot.validationStatus && slot.validationStatus !== helper?.VALIDATION_STATUS?.OK) return null;
    const t = now();
    const sourceName = String(slot.source || "lfo1");

    if (/^lfo[123]$/.test(sourceName)) {
      const index = Number(sourceName.slice(-1));
      const lfoCfg = (cfg?.lfos || [])[index - 1] || getLfoConfig(index);
      if (!lfoCfg.enabled || lfoCfg.depth <= 0) return null;
      const osc = context.createOscillator();
      applyOscillatorWaveform(osc, lfoCfg.wave || "sine");
      osc.frequency.setValueAtTime(clamp(lfoCfg.effectiveRate || lfoCfg.rate || 1, 0.01, 40), t);
      osc.start(t);
      return { source: osc, stopNode: osc, multiplier: clamp(lfoCfg.depth || 0, 0, 0.85), releaseMode: "stop" };
    }

    if (sourceName === "filter_env") {
      if (typeof context.createConstantSource !== "function") return null;
      const env = cfg?.filterEnvelope || getFilterEnvConfig();
      const sign = env.polarity === "inverted" ? -1 : 1;
      const src = context.createConstantSource();
      const attack = safeTime(env.attack || 0, 0.001);
      const decay = safeTime(env.decay || 0, 0.001);
      const sustain = clamp(env.sustain ?? 0.45, 0, 1);
      src.offset.setValueAtTime(0, t);
      if (attack <= 0.001) src.offset.setValueAtTime(sign, t + 0.001);
      else src.offset.linearRampToValueAtTime(sign, t + attack);
      src.offset.linearRampToValueAtTime(sign * sustain, t + attack + decay);
      src.start(t);
      return { source: src, stopNode: src, multiplier: 1, releaseMode: "filter_env", env };
    }

    if (sourceName === "velocity") {
      if (typeof context.createConstantSource !== "function") return null;
      const src = context.createConstantSource();
      src.offset.setValueAtTime(clamp(cfg?.performanceVelocity ? cfg?.voiceVelocity ?? 1 : 1, 0, 1), t);
      src.start(t);
      return { source: src, stopNode: src, multiplier: 1, releaseMode: "stop" };
    }

    if (sourceName === "mod_wheel") {
      const src = ensureModWheelSource();
      if (!src) return null;
      applyModWheelToSource(true);
      return { source: src, stopNode: null, multiplier: 1, releaseMode: "persistent" };
    }

    if (expressionControllerIds.includes(sourceName)) {
      const src = ensureExpressionControllerSource(sourceName);
      if (!src) return null;
      applyExpressionControllerToSource(sourceName, true);
      return { source: src, stopNode: null, multiplier: 1, releaseMode: "persistent" };
    }

    return null;
  }

  function modMatrixAdvancedDepthTargets(voice) {
    const adv = voice?.advancedFilter;
    if (!adv) return [];
    const mode = adv.cfg?.mode || "allpass";
    const nodes = Array.isArray(adv.nodes) ? adv.nodes : [];
    if (mode === "comb") {
      return nodes
        .filter((node) => node?.gain && !node.frequency)
        .map((node) => makeModMatrixPlan(node.gain, 0.045, 0.08, "comb-depth"));
    }
    const params = [];
    nodes.forEach((node) => {
      if (node?.Q) {
        const scale = clamp((node.Q.value || 1) * 0.07, 0.05, 0.45);
        params.push(makeModMatrixPlan(node.Q, scale, Math.max(0.08, scale * 1.6), "advanced-q"));
      }
      if (node?.gain && mode !== "allpass") params.push(makeModMatrixPlan(node.gain, 0.8, 1.25, "advanced-gain"));
    });
    return params;
  }

  function modMatrixDestinationPlan(voice, destination) {
    const key = String(destination || "");
    const plans = [];

    if (isGlobalFxModMatrixDestination(key)) return plans;

    if (key === "pitch") {
      (voice?.oscillators || []).forEach((info) => {
        carrierLayersForOscInfo(info).forEach((layer) => { if (layer?.osc?.detune) plans.push(makeModMatrixPlan(layer.osc.detune, 120, 180, "pitch")); });
      });
      return plans;
    }

    if (key === "volume") {
      (voice?.oscillators || []).forEach((info) => {
        if (!info?.gain?.gain) return;
        const base = clamp(info.baseGainValue || 0.2, 0.0001, 1);
        plans.push(makeModMatrixPlan(info.gain.gain, clamp(base * 0.12, 0.003, 0.12), clamp(base * 0.18, 0.006, 0.18), "volume"));
      });
      if (voice?.noise?.gain?.gain) {
        const base = clamp(voice.noise.baseGainValue || 0.12, 0.0001, 1);
        plans.push(makeModMatrixPlan(voice.noise.gain.gain, clamp(base * 0.10, 0.003, 0.10), clamp(base * 0.16, 0.005, 0.16), "volume"));
      }
      return plans;
    }

    if (key === "pan") {
      (voice?.oscillators || []).forEach((info) => {
        if (!info?.panner?.pan) return;
        const headroom = Math.max(0.04, 1 - Math.abs(clamp(info.pan || 0, -1, 1)));
        const scale = Math.min(0.28, headroom * 0.56);
        plans.push(makeModMatrixPlan(info.panner.pan, scale, Math.min(0.38, headroom * 0.76), "pan"));
      });
      return plans;
    }

    const filterName = modMatrixFilterNameFromDestination(key);
    if (filterName) {
      const entry = voice?.filterNodes?.find((filter) => filter.name === filterName);
      const base = clamp(entry?.cutoff || entry?.baseCutoff || 1000, 20, 20000);
      filterFrequencyParams(entry).forEach((param) => plans.push(makeModMatrixPlan(param, clamp(base * 0.16, 4, 3000), clamp(base * 0.28, 8, 5200), "filter-frequency")));
      return plans;
    }

    const adv = voice?.advancedFilter;
    if (key === "adv_filter_freq" && adv) {
      if (adv.cfg?.mode === "comb") {
        const delay = advancedFilterDelayParam(adv);
        if (delay) {
          const base = Math.abs(delay.value || 0.001);
          plans.push(makeModMatrixPlan(delay, -clamp(base * 0.10, 0.00003, 0.004), clamp(base * 0.18, 0.00006, 0.008), "comb-delay"));
        }
      } else {
        const base = clamp(adv.baseFreq || adv.cfg?.freq || 1200, 20, 20000);
        advancedFilterFrequencyParams(adv).forEach((param) => plans.push(makeModMatrixPlan(param, clamp(base * 0.14, 4, 2600), clamp(base * 0.24, 8, 4600), "advanced-frequency")));
      }
      return plans;
    }

    if (key === "adv_filter_depth") return modMatrixAdvancedDepthTargets(voice);

    if (key === "adv_filter_mix" && adv) {
      if (adv.wet?.gain) plans.push(makeModMatrixPlan(adv.wet.gain, 0.10, 0.16, "mix"));
      if (adv.dry?.gain) plans.push(makeModMatrixPlan(adv.dry.gain, -0.08, 0.13, "mix"));
      return plans;
    }

    if (key === "filter_drive") {
      const drive = voice?.filterDrive;
      if (drive?.preGain?.gain) plans.push(makeModMatrixPlan(drive.preGain.gain, clamp((drive.preGain.gain.value || 1) * 0.07, 0.02, 0.22), clamp((drive.preGain.gain.value || 1) * 0.12, 0.04, 0.34), "drive"));
      if (drive?.trim?.gain) plans.push(makeModMatrixPlan(drive.trim.gain, -clamp((drive.trim.gain.value || 1) * 0.04, 0.012, 0.10), clamp((drive.trim.gain.value || 1) * 0.07, 0.02, 0.16), "drive-trim"));
      return plans;
    }

    return plans;
  }

  function applyModulationMatrixToVoice(voice, slots, cfg) {
    if (!context || !voice) return;
    const helper = window.SynthXModulationMatrix;
    const safeSlots = helper?.normalizeMatrix ? helper.normalizeMatrix(slots || []) : [];
    const contributionBudget = new Map();
    voice.modMatrix = [];
    safeSlots.forEach((slot) => {
      if (!slot.enabled || Math.abs(slot.amount) < 0.0001) return;
      if (slot.validationStatus && slot.validationStatus !== helper?.VALIDATION_STATUS?.OK) return;
      const plan = modMatrixDestinationPlan(voice, slot.destination);
      if (!plan.length) return;
      const sourceInfo = createModMatrixSource(slot, { ...(cfg || {}), voiceVelocity: voice.velocity });
      if (!sourceInfo?.source) return;
      const gains = [];
      plan.forEach(({ param, scale, limit }) => {
        if (!param || !Number.isFinite(scale) || Math.abs(scale) < 0.000001) return;
        const rawAmount = clamp(slot.amount, -1, 1) * clamp(sourceInfo.multiplier ?? 1, -1, 1) * scale;
        const targetAmount = capModMatrixContribution(param, rawAmount, limit, contributionBudget);
        if (Math.abs(targetAmount) < 0.000001) return;
        const gain = context.createGain();
        setModMatrixGainValue(gain.gain, targetAmount, now());
        try {
          sourceInfo.source.connect(gain);
          gain.connect(param);
          gains.push(gain);
        } catch (err) {
          try { gain.disconnect(); } catch (_) {}
          window.SynthXLogger?.warn("Mod Matrix connect skipped", slot.destination, err);
        }
      });
      if (!gains.length) {
        if (sourceInfo.releaseMode !== "persistent") {
          try { sourceInfo.stopNode?.stop?.(now() + 0.02); } catch (_) {}
          try { sourceInfo.source.disconnect?.(); } catch (_) {}
        }
        return;
      }
      voice.modMatrix.push({ slot, sourceInfo, gains });
    });
  }

  function releaseModulationMatrixSources(voice, fast, stopAt) {
    const entries = Array.isArray(voice?.modMatrix) ? voice.modMatrix : [];
    if (!entries.length || !context) return;
    const t = now();
    entries.forEach((entry) => {
      const src = entry.sourceInfo?.source;
      try {
        if (entry.sourceInfo?.releaseMode === "filter_env" && src?.offset) {
          const release = safeTime((entry.sourceInfo.env?.release || 0.18) * (fast ? 0.35 : 1), 0.015);
          holdAudioParam(src.offset, t);
          src.offset.setTargetAtTime(0, t, Math.max(0.006, release / 4));
        }
      } catch (_) {}
      if (entry.sourceInfo?.releaseMode !== "persistent") {
        try { entry.sourceInfo?.stopNode?.stop?.(stopAt); } catch (_) {}
      }
      const disconnect = () => {
        if (entry.sourceInfo?.releaseMode === "persistent") {
          try { (entry.gains || []).forEach((gain) => src?.disconnect?.(gain)); } catch (_) {}
        } else {
          try { src?.disconnect?.(); } catch (_) {}
        }
        try { (entry.gains || []).forEach((gain) => gain?.disconnect?.()); } catch (_) {}
      };
      if (entry.sourceInfo?.stopNode) entry.sourceInfo.stopNode.onended = disconnect;
      else window.setTimeout(disconnect, Math.max(1, Math.ceil((stopAt - t + 0.02) * 1000)));
    });
    voice.modMatrix = [];
  }

  function createVoice(note, rawVelocity, options) {
    const cfg = getGlobalConfig();
    const voiceOptions = options || {};
    const velocity = cfg.performanceVelocity ? clamp(rawVelocity, 0, 1) : 1;
    ensureNodes();

    const t = now();
    const input = context.createGain();
    const output = context.createGain();
    input.gain.setValueAtTime(1, t);
    output.gain.setValueAtTime(0.0001, t);
    output.connect(effectInput || masterGain);

    const voice = {
      id: ++voiceSerial,
      note: Number(note),
      velocity,
      input,
      output,
      filterDrive: null,
      filterInput: null,
      filterNodes: [],
      filterEnvelope: null,
      advancedFilter: null,
      advancedFilterEnvelope: null,
      modMatrix: [],
      oscillators: [],
      lfos: [],
      noise: null,
      startedAt: t,
      released: false,
      sustained: false,
      glideFromNote: voiceOptions.glideFromNote ?? null,
      glideSeconds: voiceOptions.glideSeconds ?? 0
    };

    createFilterDriveChain(voice, cfg.filterDrive, cfg.filters);
    createFilterChain(voice, cfg.filters, cfg.advancedFilter);
    applyFilterEnvelope(voice, cfg.filterEnvelope, cfg.envelope);
    applyAdvancedFilterEnvelope(voice, advancedFilterConfigForVoice(cfg.advancedFilter, voice), cfg.filterEnvelope, cfg.envelope);
    cfg.lfos.forEach((lfoCfg) => applyLfoToFilters(voice, lfoCfg));
    cfg.lfos.forEach((lfoCfg) => applyLfoToAdvancedFilter(voice, lfoCfg));

    cfg.oscillators.forEach((oscCfg) => {
      const oscInfo = createOscillatorSource(voice, note, velocity, oscCfg, cfg.lfos, cfg.ringMod, cfg.fm, cfg.oscSync, cfg.oscillators, cfg.unison);
      if (oscInfo) {
        cfg.lfos.forEach((lfoCfg) => applyLfoToOscillator(voice, oscInfo, lfoCfg, oscInfo.baseGainValue));
      }
    });
    createNoiseSource(voice, velocity, cfg.noise);

    if (!voice.oscillators.length && !voice.noise) {
      try { input.disconnect(); } catch (_) {}
      try { output.disconnect(); } catch (_) {}
      try { [voice.filterDrive?.input, voice.filterDrive?.preGain, voice.filterDrive?.shaper, voice.filterDrive?.trim].forEach((node) => node?.disconnect?.()); } catch (_) {}
      try { voice.filterNodes?.forEach((f) => (Array.isArray(f.nodes) ? f.nodes : [f.node]).forEach((node) => node?.disconnect?.())); } catch (_) {}
      disconnectAdvancedFilter(voice);
      setStatus("Audio: nessuna sorgente attiva");
      return null;
    }

    applyModulationMatrixToVoice(voice, cfg.modulationMatrix, cfg);
    applyAmpEnvelope(voice, cfg.envelope);
    return voice;
  }

  function releaseVoice(voice, reason, fast) {
    if (!voice || voice.released || !context) return;
    voice.released = true;
    const t = now();
    const releaseSeconds = applyAmpRelease(voice, fast);
    const noiseReleaseSeconds = applyNoiseRelease(voice, releaseSeconds, fast);
    const tailSeconds = Math.max(releaseSeconds, noiseReleaseSeconds);
    releaseTailVoiceCount += 1;
    window.setTimeout(() => {
      releaseTailVoiceCount = Math.max(0, releaseTailVoiceCount - 1);
      updateSafetyChain("release-tail-ended");
    }, Math.ceil((tailSeconds * 1000) + VOICE_MANAGEMENT_LIMITS.releaseTailSafetyMs));
    applyFilterEnvelopeRelease(voice, releaseSeconds, fast);
    applyAdvancedFilterEnvelopeRelease(voice, fast);
    const stopAt = t + tailSeconds + 0.08;
    releaseModulationMatrixSources(voice, fast, stopAt);
    try {
      if (voice.output) {
        // L'inviluppo di ampiezza viene rilasciato da applyAmpRelease().
      }
      voice.lfos.forEach((lfo) => {
        try { lfo.osc.stop(stopAt); } catch (_) {}
        lfo.osc.onended = () => {
          try { lfo.osc.disconnect(); } catch (_) {}
          try { lfo.gain?.disconnect?.(); } catch (_) {}
          try { (lfo.gains || []).forEach((entry) => entry.gain?.disconnect?.()); } catch (_) {}
        };
      });
      voice.oscillators.forEach((info) => {
        if (info.pwmTimer) { try { window.clearInterval(info.pwmTimer); } catch (_) {} info.pwmTimer = null; }
        try { info.pulseBiasSource?.stop?.(stopAt); } catch (_) {}
        try { info.ringMod?.modOsc?.stop?.(stopAt); } catch (_) {}
        try { info.ringMod?.pulseBiasSource?.stop?.(stopAt); } catch (_) {}
        try { info.fm?.modOsc?.stop?.(stopAt); } catch (_) {}
        try { info.fm?.pulseBiasSource?.stop?.(stopAt); } catch (_) {}
        try { info.oscSync?.syncOsc?.stop?.(stopAt); } catch (_) {}
        try {
          (info.unisonLayers || []).forEach((layer) => {
            if (layer.osc && layer.osc !== info.osc) layer.osc.stop(stopAt);
            layer.pulseBiasSource?.stop?.(stopAt);
            layer.pwmOsc?.stop?.(stopAt);
          });
        } catch (_) {}
        try { info.osc.stop(stopAt); } catch (_) {}
        info.osc.onended = () => {
          try { info.osc.disconnect(); } catch (_) {}
          try { (info.unisonLayers || []).forEach((layer) => {
            try { if (layer.osc && layer.osc !== info.osc) layer.osc.disconnect(); } catch (_) {}
            try { layer.gain?.disconnect?.(); } catch (_) {}
            try { layer.panner?.disconnect?.(); } catch (_) {}
            try { layer.pulseBiasSource?.disconnect?.(); } catch (_) {}
            try { layer.pwmGain?.disconnect?.(); } catch (_) {}
            try { layer.pwmOsc?.disconnect?.(); } catch (_) {}
            try { layer.pulseShaper?.disconnect?.(); } catch (_) {}
          }); } catch (_) {}
          try { info.unisonSum?.disconnect?.(); } catch (_) {}
          try { info.pulseBiasSource?.disconnect?.(); } catch (_) {}
          try { info.pwmGain?.disconnect?.(); } catch (_) {}
          try { info.pulseShaper?.disconnect?.(); } catch (_) {}
          try { info.ringMod?.modOsc?.disconnect?.(); } catch (_) {}
          try { info.ringMod?.modGain?.disconnect?.(); } catch (_) {}
          try { info.ringMod?.ringGain?.disconnect?.(); } catch (_) {}
          try { info.ringMod?.pulseBiasSource?.disconnect?.(); } catch (_) {}
          try { info.ringMod?.pulseShaper?.disconnect?.(); } catch (_) {}
          try { info.fm?.modOsc?.disconnect?.(); } catch (_) {}
          try { info.fm?.modGain?.disconnect?.(); } catch (_) {}
          try { info.fm?.pulseBiasSource?.disconnect?.(); } catch (_) {}
          try { info.fm?.pulseShaper?.disconnect?.(); } catch (_) {}
          try { info.oscSync?.syncOsc?.disconnect?.(); } catch (_) {}
          try { info.oscSync?.dryGain?.disconnect?.(); } catch (_) {}
          try { info.oscSync?.syncGain?.disconnect?.(); } catch (_) {}
          try { info.oscSync?.mixGain?.disconnect?.(); } catch (_) {}
          try { info.gain.disconnect(); } catch (_) {}
          try { info.panner?.disconnect(); } catch (_) {}
        };
      });
      if (voice.noise) {
        try { voice.noise.source.stop(stopAt); } catch (_) {}
        voice.noise.source.onended = () => {
          try { voice.noise.source.disconnect(); } catch (_) {}
          try { voice.noise.gain.disconnect(); } catch (_) {}
        };
      }
      window.setTimeout(() => {
        try { voice.input?.disconnect(); } catch (_) {}
        try { voice.filterNodes?.forEach((f) => (Array.isArray(f.nodes) ? f.nodes : [f.node]).forEach((node) => node?.disconnect())); } catch (_) {}
        disconnectAdvancedFilter(voice);
        try { [voice.filterDrive?.input, voice.filterDrive?.preGain, voice.filterDrive?.shaper, voice.filterDrive?.trim].forEach((node) => node?.disconnect?.()); } catch (_) {}
        try { voice.output.disconnect(); } catch (_) {}
      }, Math.ceil((tailSeconds + 0.12) * 1000));
    } catch (err) {
      window.SynthXLogger?.warn("Errore release voice", reason || "", err);
    }
  }

  function voiceIsPhysicallyHeld(voice) {
    return Boolean(voice && heldNotes.has(voice.note));
  }

  function voiceStealPriority(voice) {
    // v0.25.1: preferisci rubare prima voci sostenute/non più fisicamente
    // tenute, poi eventuali voci stale, e solo alla fine note ancora tenute.
    // Questo mantiene più naturale il comportamento con sustain/hold, arp latch
    // e sequencer tie/hold senza introdurre un nuovo voice allocator.
    if (!voice) return 99;
    const physicallyHeld = voiceIsPhysicallyHeld(voice);
    if (voice.sustained && !physicallyHeld) return 0;
    if (!physicallyHeld) return 1;
    if (voice.sustained) return 2;
    return 3;
  }

  function sortedVoiceStealCandidates() {
    return Array.from(voices.values()).sort((a, b) => {
      const rank = voiceStealPriority(a) - voiceStealPriority(b);
      if (rank !== 0) return rank;
      const ageA = Number.isFinite(a?.startedAt) ? a.startedAt : 0;
      const ageB = Number.isFinite(b?.startedAt) ? b.startedAt : 0;
      if (ageA !== ageB) return ageA - ageB;
      return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
  }

  function enforceVoiceLimit(reason) {
    const cfg = getGlobalConfig();
    const max = cfg.maxVoices;
    if (voices.size <= max) return 0;
    const ordered = sortedVoiceStealCandidates();
    let stolen = 0;
    while (voices.size > max && ordered.length) {
      const candidate = ordered.shift();
      if (!candidate || voices.get(candidate.note) !== candidate) continue;
      candidate.stolen = true;
      candidate.stolenAt = now();
      candidate.stealPriority = voiceStealPriority(candidate);
      voices.delete(candidate.note);
      releaseVoice(candidate, reason || "voice-stealing");
      stolen += 1;
    }
    if (stolen > 0) {
      updateSafetyChain("voice-limit");
      refreshPerformanceRuntime(reason || "voice-limit");
      window.SynthXLogger?.log("voice limit enforced", { max, stolen, active: voices.size, releaseTails: releaseTailVoiceCount });
    }
    return stolen;
  }

  function updateActiveTuningParam() {
    if (!context || !isReady || voices.size === 0) return true;
    let touched = 0;
    voices.forEach((voice) => {
      const note = Number(voice.note);
      if (!Number.isFinite(note)) return;
      (voice.oscillators || []).forEach((oscInfo) => {
        const semi = Number.isFinite(Number(oscInfo.semi)) ? Number(oscInfo.semi) : 0;
        const target = midiToFrequency(note) * Math.pow(2, semi / 12);
        carrierLayersForOscInfo(oscInfo).forEach((layer) => smoothAudioParam(layer.osc?.frequency, target, 0.020));
        if (oscInfo.ringMod?.modOsc?.frequency) {
          const sourceBSemi = Number.isFinite(Number(oscInfo.ringMod.sourceBSemi)) ? Number(oscInfo.ringMod.sourceBSemi) : 0;
          const modTarget = midiToFrequency(note) * Math.pow(2, sourceBSemi / 12);
          smoothAudioParam(oscInfo.ringMod.modOsc.frequency, modTarget, 0.020);
        }
        if (oscInfo.fm?.modOsc?.frequency) {
          const sourceBSemi = Number.isFinite(Number(oscInfo.fm.sourceBSemi)) ? Number(oscInfo.fm.sourceBSemi) : 0;
          const modTarget = midiToFrequency(note) * Math.pow(2, sourceBSemi / 12);
          smoothAudioParam(oscInfo.fm.modOsc.frequency, modTarget, 0.020);
          const nextDepth = fmDepthHz(modTarget, clamp(oscInfo.fm.amount, 0, FM_AMOUNT_MAX));
          smoothAudioParam(oscInfo.fm.modGain?.gain, nextDepth, 0.020);
          oscInfo.fm.depthHz = nextDepth;
        }
        if (oscInfo.oscSync?.syncOsc?.frequency) {
          const masterSemi = Number.isFinite(Number(oscInfo.oscSync.masterSemi)) ? Number(oscInfo.oscSync.masterSemi) : 0;
          const syncTarget = midiToFrequency(note) * Math.pow(2, masterSemi / 12);
          smoothAudioParam(oscInfo.oscSync.syncOsc.frequency, syncTarget, 0.020);
        }
        touched += 1;
      });
    });
    return touched > 0 || voices.size === 0;
  }

  function updateActiveOscillatorParam(id) {
    if (!context || !isReady || voices.size === 0) return false;
    const match = String(id).match(/^osc([123])-(level|semi|fine|pan)$/);
    if (!match) return false;
    const index = Number(match[1]);
    const kind = match[2];
    const cfg = getOscConfig(index);
    if (!cfg.enabled || cfg.level <= 0) {
      // Se l'oscillatore non è realmente udibile, Fine/Pan/Pitch non devono
      // forzare un rebuild delle note già tenute.
      const hasRunningOsc = Array.from(voices.values()).some((voice) => voice.oscillators?.some((info) => info.index === index));
      if (!hasRunningOsc) return true;
    }
    let touched = 0;
    let missing = false;
    voices.forEach((voice) => {
      const oscInfo = voice.oscillators?.find((info) => info.index === index);
      if (!oscInfo) { if (cfg.enabled && cfg.level > 0) missing = true; return; }
      if (kind === "level") {
        const targetGain = cfg.level * voice.velocity;
        oscInfo.baseGainValue = targetGain;
        const volumeLfos = (voice.lfos || []).filter((lfo) => lfo.targetIndex === index && lfo.dest === "volume");
        let maxAmount = 0;
        volumeLfos.forEach((lfo) => {
          const lfoCfg = getLfoConfig(lfo.lfo);
          const amount = Math.max(0, targetGain) * lfoCfg.depth * 0.5;
          maxAmount = Math.max(maxAmount, amount);
          lfo.baseGainValue = targetGain;
          smoothAudioParam(lfo.gain?.gain, amount, 0.018);
        });
        smoothAudioParam(oscInfo.gain?.gain, Math.max(0.0001, targetGain - maxAmount), 0.018);
      } else if (kind === "semi") {
        const freq = midiToFrequency(voice.note) * Math.pow(2, cfg.semi / 12);
        carrierLayersForOscInfo(oscInfo).forEach((layer) => smoothAudioParam(layer.osc?.frequency, freq, 0.018));
        oscInfo.semi = cfg.semi;
      } else if (kind === "fine") {
        oscInfo.fine = cfg.fine;
        applyPitchBendToOscInfo(oscInfo, true);
      } else if (kind === "pan") {
        if (oscInfo.panner?.pan) smoothAudioParam(oscInfo.panner.pan, cfg.pan, 0.018);
        carrierLayersForOscInfo(oscInfo).forEach((layer) => {
          if (layer?.panner?.pan) smoothAudioParam(layer.panner.pan, clamp(Number(layer.panOffset) || 0, -0.95, 0.95), 0.018);
        });
        oscInfo.pan = cfg.pan;
      }
      touched += 1;
    });
    return touched > 0 && !missing;
  }

  function updateActiveNoiseParam(id) {
    if (id !== "noise-db" || !context || !isReady || voices.size === 0) return false;
    const cfg = getNoiseConfig();
    if (!cfg.enabled && !Array.from(voices.values()).some((voice) => voice.noise)) return true;
    let touched = 0;
    let missing = false;
    voices.forEach((voice) => {
      if (!voice.noise) { if (cfg.enabled) missing = true; return; }
      const targetGain = dbToGain(cfg.db) * voice.velocity;
      voice.noise.baseGainValue = targetGain;
      smoothAudioParam(voice.noise.gain?.gain, targetGain, 0.018);
      touched += 1;
    });
    return touched > 0 && !missing;
  }

  function updateActiveFmAmountParam(id) {
    // v0.22.2d: FM Amount su note tenute aggiorna la profondità con smoothing
    // quando la catena FM esiste già. Se serve creare una nuova catena audio
    // (per esempio Amount da 0 a >0), il chiamante può ancora fare rebuild.
    if (id !== "fm-amount" || !context || !isReady || voices.size === 0) return true;
    const cfg = getFmConfig();
    let touched = 0;
    let missing = false;
    voices.forEach((voice) => {
      const note = Number(voice.note);
      if (!Number.isFinite(note)) return;
      (voice.oscillators || []).forEach((oscInfo) => {
        const isCarrier = cfg.enabled && cfg.amount > 0 && cfg.carrier === `osc${oscInfo.index}`;
        if (!oscInfo.fm?.modGain) {
          if (isCarrier) missing = true;
          return;
        }
        const sourceBSemi = Number.isFinite(Number(oscInfo.fm.sourceBSemi)) ? Number(oscInfo.fm.sourceBSemi) : 0;
        const modTarget = midiToFrequency(note) * Math.pow(2, sourceBSemi / 12);
        const nextDepth = cfg.enabled ? fmDepthHz(modTarget, cfg.amount) : 0;
        smoothAudioParam(oscInfo.fm.modGain.gain, nextDepth, 0.022);
        oscInfo.fm.amount = cfg.amount;
        oscInfo.fm.depthHz = nextDepth;
        oscInfo.fm.fmIndex = fmIndexFromAmount(cfg.amount);
        touched += 1;
      });
    });
    return !missing && (touched > 0 || !cfg.enabled || cfg.amount <= 0);
  }

  function oscSyncChainNeedsRebuildForConfig(oscInfo, cfg) {
    if (!cfg?.enabled || cfg.amount <= 0) return false;
    const chain = oscInfo?.oscSync;
    if (!chain?.dryGain || !chain?.syncGain) return true;
    const expectedMaster = normalizeOscSyncSource(cfg.master, "osc1");
    const expectedSlave = normalizeOscSyncSource(cfg.slave, "osc2");
    if (normalizeOscSyncSource(chain.master, "osc1") !== expectedMaster) return true;
    if (normalizeOscSyncSource(chain.slave, "osc2") !== expectedSlave) return true;

    const masterIndex = sourceIndexFromName(expectedMaster);
    const slaveIndex = sourceIndexFromName(expectedSlave);
    const masterCfg = masterIndex ? getOscConfig(masterIndex) : null;
    const slaveCfg = slaveIndex ? getOscConfig(slaveIndex) : null;
    if (!masterCfg || !slaveCfg) return true;

    const expectedRatio = oscSyncRatio(masterCfg, slaveCfg);
    if (Math.abs((Number(chain.ratio) || 0) - expectedRatio) > 0.0015) return true;
    if (Math.abs((Number(chain.masterSemi) || 0) - (Number(masterCfg.semi) || 0)) > 0.001) return true;
    if (Math.abs((Number(chain.slaveSemi) || 0) - (Number(slaveCfg.semi) || 0)) > 0.001) return true;
    if (Math.abs((Number(chain.masterFine) || 0) - clamp(Number(masterCfg.fine) || 0, -100, 100)) > 0.001) return true;
    if (Math.abs((Number(chain.slaveFine) || 0) - (Number(slaveCfg.fine) || 0)) > 0.001) return true;
    return false;
  }

  function updateActiveOscSyncAmountParam(id) {
    if (id !== "oscsync-amount" || !context || !isReady || voices.size === 0) return true;
    const cfg = getOscSyncConfig();
    let touched = 0;
    let missing = false;
    voices.forEach((voice) => {
      (voice.oscillators || []).forEach((oscInfo) => {
        const isSlave = cfg.enabled && cfg.amount > 0 && cfg.slave === `osc${oscInfo.index}`;
        if (isSlave && oscSyncChainNeedsRebuildForConfig(oscInfo, cfg)) {
          // v0.22.3b: se Master/Slave o ratio sono cambiati mentre Amount era 0/safe-off,
          // la vecchia catena silenziosa non va riusata quando Amount torna > 0.
          missing = true;
          return;
        }
        if (!oscInfo.oscSync?.dryGain || !oscInfo.oscSync?.syncGain) {
          if (isSlave) missing = true;
          return;
        }
        const nextAmount = cfg.enabled ? clamp(cfg.amount, 0, 1) : 0;
        // v0.22.3a/v0.22.3b: smoothing morbido per evitare zipper/click muovendo Amount.
        smoothAudioParam(oscInfo.oscSync.dryGain.gain, 1 - nextAmount, 0.030);
        smoothAudioParam(oscInfo.oscSync.syncGain.gain, nextAmount, 0.030);
        oscInfo.oscSync.amount = nextAmount;
        touched += 1;
      });
    });
    return !missing && (touched > 0 || !cfg.enabled || cfg.amount <= 0);
  }

  function updateActiveUnisonCharacterParam(id) {
    // v0.22.5: Detune e Stereo Spread non cambiano la topologia quando il numero
    // effettivo di layer resta identico. In quel caso aggiorniamo le note tenute
    // con smoothing invece di ricostruire tutta la voce. Enable/Voices/CPU Limit
    // restano rebuild prudente perché cambiano il grafo o il numero di sorgenti.
    if (!["unison-detune", "unison-spread"].includes(String(id)) || !context || !isReady || voices.size === 0) return false;
    const cfg = getUnisonConfig();
    if (!cfg.enabled) return false;
    let touched = 0;
    let missing = false;
    voices.forEach((voice) => {
      (voice.oscillators || []).forEach((oscInfo) => {
        const layers = Array.isArray(oscInfo.unisonLayers) ? oscInfo.unisonLayers : [];
        if (!layers.length) { missing = true; return; }
        if (layers.length !== cfg.voices) { missing = true; return; }
        const detuneOffsets = unisonDetuneOffsets({ ...cfg, voices: layers.length });
        const panOffsets = unisonPanOffsets({ ...cfg, voices: layers.length });
        layers.forEach((layer, i) => {
          const detuneOffsetCents = Number(detuneOffsets[i]) || 0;
          const panOffset = Number(panOffsets[i]) || 0;
          layer.detuneOffsetCents = detuneOffsetCents;
          layer.panOffset = panOffset;
          if (layer?.osc?.detune) {
            const fine = Number(oscInfo.fine) || 0;
            const target = clamp(fine + currentPitchBendCents() + detuneOffsetCents, -2400, 2400);
            smoothAudioParam(layer.osc.detune, target, 0.030);
          }
          if (layer?.panner?.pan) smoothAudioParam(layer.panner.pan, clamp(panOffset, -0.95, 0.95), 0.030);
        });
        if (oscInfo.unison) {
          oscInfo.unison.detune = cfg.detune;
          oscInfo.unison.spread = cfg.spread;
          oscInfo.unison.voices = cfg.voices;
          oscInfo.unison.requestedVoices = cfg.requestedVoices;
          oscInfo.unison.maxLayers = cfg.maxLayers;
        }
        touched += 1;
      });
    });
    return touched > 0 && !missing;
  }

  function updateActiveLfoRateParam(id) {
    const match = String(id).match(/^lfo([123])-(rate|rate-mode|sync)$/);
    if (!match || !context || !isReady || voices.size === 0) return false;
    const index = Number(match[1]);
    const cfg = getLfoConfig(index);
    let touched = 0;
    voices.forEach((voice) => {
      (voice.lfos || []).forEach((lfo) => {
        if (lfo.lfo !== index) return;
        smoothAudioParam(lfo.osc?.frequency, cfg.effectiveRate || cfg.rate, 0.018);
        touched += 1;
      });
    });
    return touched > 0;
  }

  function updateFilterLfoDepths(filterName) {
    if (!context || !isReady || voices.size === 0 || !filterName) return;
    voices.forEach((voice) => {
      (voice.lfos || []).forEach((lfo) => {
        if (lfo.filterName !== filterName) return;
        const lfoCfg = getLfoConfig(lfo.lfo);
        const entry = lfo.filterEntry || voice.filterNodes?.find((filter) => filter.name === filterName);
        const baseCutoff = clamp(entry?.cutoff || filterFrequencyParams(entry)[0]?.value || lfo.baseCutoff || 1000, 20, 20000);
        const amount = lfoCfg.depth <= 0 ? 0 : clamp(baseCutoff * lfoCfg.depth * 0.5, 5, 8000);
        lfo.baseCutoff = baseCutoff;
        smoothAudioParam(lfo.gain?.gain, amount, 0.020);
      });
    });
  }

  function hasPotentialLfoTarget(lfoCfg) {
    if (!lfoCfg?.enabled || lfoCfg.depth <= 0) return false;
    if (isFilterLfoDest(lfoCfg.dest)) {
      const filterName = filterNameFromLfoDest(lfoCfg.dest);
      return getFiltersConfig().some((filter) => filter.name === filterName && filter.enabled);
    }
    if (isAdvancedFilterLfoDest(lfoCfg.dest)) {
      const cfg = getAdvancedFilterConfig();
      return Boolean(cfg.enabled && effectiveAdvancedFilterMix(cfg) > ADV_FILTER_MIX_EPS);
    }
    return getGlobalConfig().oscillators.some((osc) => osc.enabled && osc.level > 0 && lfoCfg.targets[osc.index]);
  }

  function updateActiveLfoDepthParam(id) {
    const match = String(id).match(/^lfo([123])-depth$/);
    if (!match || !context || !isReady || voices.size === 0) return false;
    const index = Number(match[1]);
    const cfg = getLfoConfig(index);
    if (!cfg.enabled) return true;
    let touched = 0;
    voices.forEach((voice) => {
      (voice.lfos || []).forEach((lfo) => {
        if (lfo.lfo !== index) return;
        if (lfo.dest === "volume" && lfo.oscInfo) {
          const amount = Math.max(0, lfo.oscInfo.baseGainValue || lfo.baseGainValue || 0) * cfg.depth * 0.5;
          smoothAudioParam(lfo.gain?.gain, amount, 0.018);
          touched += 1;
          return;
        }
        if (lfo.dest === "pwm") {
          // PWM usa il controllo dedicato PWM Amount, non il Depth generale dell'LFO.
          touched += 1;
          return;
        }
        if (isFilterLfoDest(lfo.dest)) {
          const entry = lfo.filterEntry || voice.filterNodes?.find((filter) => filter.name === lfo.filterName);
          const baseCutoff = clamp(entry?.cutoff || filterFrequencyParams(entry)[0]?.value || lfo.baseCutoff || 1000, 20, 20000);
          const amount = cfg.depth <= 0 ? 0 : clamp(baseCutoff * cfg.depth * 0.5, 5, 8000);
          lfo.baseCutoff = baseCutoff;
          smoothAudioParam(lfo.gain?.gain, amount, 0.020);
          touched += 1;
          return;
        }
        if (isAdvancedFilterLfoDest(lfo.dest)) {
          updateAdvancedFilterLfoDepths(voice);
          touched += 1;
          return;
        }
        smoothAudioParam(lfo.gain?.gain, cfg.depth * 1200, 0.018);
        touched += 1;
      });

      // Tremolo: dopo aver aggiornato i gain degli LFO volume, riportiamo il gain base
      // dell'oscillatore a una zona sicura. Evita salti quando si muove Depth a nota tenuta.
      (voice.oscillators || []).forEach((oscInfo) => {
        const volumeLfos = (voice.lfos || []).filter((lfo) => lfo.targetIndex === oscInfo.index && lfo.dest === "volume");
        if (!volumeLfos.length) return;
        let maxAmount = 0;
        volumeLfos.forEach((lfo) => {
          const lfoCfg = getLfoConfig(lfo.lfo);
          const amount = Math.max(0, oscInfo.baseGainValue || lfo.baseGainValue || 0) * lfoCfg.depth * 0.5;
          maxAmount = Math.max(maxAmount, amount);
        });
        smoothAudioParam(oscInfo.gain?.gain, Math.max(0.0001, (oscInfo.baseGainValue || 0) - maxAmount), 0.018);
      });
    });
    return touched > 0 || !hasPotentialLfoTarget(cfg);
  }

  function rebuildActiveVoices(reason) {
    if (!context || !isReady || voices.size === 0) return;
    const active = Array.from(voices.values()).map((voice) => ({ note: voice.note, velocity: voice.velocity }));
    voices.forEach((voice) => releaseVoice(voice, reason || "rebuild", true));
    voices.clear();
    active.forEach(({ note, velocity }) => {
      if (!heldNotes.has(note)) return;
      const voice = createVoice(note, velocity);
      if (voice) voices.set(note, voice);
    });
    enforceVoiceLimit(reason || "rebuild");
    setStatus(voices.size ? `Audio: ${voices.size} note attive` : "Audio: pronto");
  }

  async function noteOn(note, velocity) {
    const rawMidi = Number(note);
    const velRaw = Number(velocity ?? 1);
    const vel = applyVelocityCurve(Number.isFinite(velRaw) ? velRaw : 1);
    if (!Number.isFinite(rawMidi)) return;

    const cfg = getPerformanceConfig();
    const midi = getPerformanceNote(rawMidi);
    heldNoteTargets.set(rawMidi, midi);
    heldNotes.add(midi);
    if (window.SynthXState?.data?.activeNotes) window.SynthXState.data.activeNotes[midi] = vel;
    await unlock();
    if (!context || !isReady || !heldNotes.has(midi)) return;

    let glideFromNote = null;
    if (cfg.mode === "mono") {
      const currentNotes = Array.from(voices.keys());
      if (cfg.glideSeconds > 0 && currentNotes.length) glideFromNote = currentNotes[currentNotes.length - 1];
      voices.forEach((voice) => releaseVoice(voice, "mono-retrigger", true));
      voices.clear();
      heldNotes.clear();
      heldNotes.add(midi);
      heldNoteTargets.clear();
      heldNoteTargets.set(rawMidi, midi);
    } else if (voices.has(midi)) {
      const old = voices.get(midi);
      voices.delete(midi);
      releaseVoice(old, "retrigger", true);
    }

    const voice = createVoice(midi, vel, { glideFromNote, glideSeconds: cfg.glideSeconds });
    if (voice) voices.set(midi, voice);
    if (cfg.mode === "mono") lastMonoNote = midi;
    enforceVoiceLimit("note-on");
    updateSafetyChain("voice-count");
    setStatus(`Audio: ${voices.size} note attive`);
    refreshPerformanceRuntime("note-on");
    window.SynthXLogger?.log("noteOn audio", { rawMidi, midi, velocity: vel, mode: cfg.mode });
  }

  function noteOff(note) {
    const rawMidi = Number(note);
    const midi = heldNoteTargets.has(rawMidi) ? heldNoteTargets.get(rawMidi) : getPerformanceNote(rawMidi);
    heldNoteTargets.delete(rawMidi);
    heldNotes.delete(midi);
    const voice = voices.get(midi);
    const sustainEnabled = boolParam("performance.sustainEnabled", DEFAULTS.performanceSustain);
    const holdEnabled = getPerformanceConfig().hold;
    let releasedNow = false;
    if (voice) {
      if (holdEnabled || (sustainEnabled && sustainPedalDown)) {
        // v0.23.3c: il rilascio fisico del tasto con Hold/Sustain attivo
        // non deve toccare parametri audio. La voce resta viva e viene solo
        // marcata come sostenuta per il successivo rilascio reale.
        voice.sustained = true;
      } else {
        voices.delete(midi);
        releasedNow = true;
        releaseVoice(voice, "noteOff");
      }
    }
    if (window.SynthXState?.data?.activeNotes) delete window.SynthXState.data.activeNotes[midi];
    if (releasedNow) updateSafetyChain("voice-count");
    setStatus(voices.size ? `Audio: ${voices.size} note attive` : "Audio: pronto");
    refreshPerformanceRuntime("note-off");
    window.SynthXLogger?.log("noteOff audio", { rawMidi, midi, sustained: Boolean(voice?.sustained), releasedNow });
  }

  function noteOffImmediate(note, reason) {
    const rawMidi = Number(note);
    if (!Number.isFinite(rawMidi)) return;
    const midi = heldNoteTargets.has(rawMidi) ? heldNoteTargets.get(rawMidi) : getPerformanceNote(rawMidi);
    heldNoteTargets.delete(rawMidi);
    heldNotes.delete(midi);
    const voice = voices.get(midi);
    if (voice) {
      voices.delete(midi);
      releaseVoice(voice, reason || "noteOffImmediate");
    }
    if (window.SynthXState?.data?.activeNotes) delete window.SynthXState.data.activeNotes[midi];
    updateSafetyChain("voice-count");
    setStatus(voices.size ? `Audio: ${voices.size} note attive` : "Audio: pronto");
    refreshPerformanceRuntime(reason || "note-off-immediate");
    window.SynthXLogger?.log("noteOffImmediate audio", { rawMidi, midi, reason: reason || "manual" });
  }

  function releaseSustainedNotes() {
    const toRelease = [];
    voices.forEach((voice, note) => {
      if (voice.sustained && !heldNotes.has(note)) toRelease.push([note, voice]);
      else if (voice.sustained && heldNotes.has(note)) voice.sustained = false;
    });
    toRelease.forEach(([note, voice]) => {
      voices.delete(note);
      releaseVoice(voice, "sustainRelease");
    });
    updateSafetyChain("voice-count");
    setStatus(voices.size ? `Audio: ${voices.size} note attive` : "Audio: pronto");
    refreshPerformanceRuntime("sustain-release");
  }

  function setSustainPedal(down) {
    const next = Boolean(down);
    if (next === sustainPedalDown) return;
    sustainPedalDown = next;
    if (!sustainPedalDown) releaseSustainedNotes();
    refreshPerformanceRuntime("sustain-pedal");
    window.SynthXLogger?.log("sustain pedal", sustainPedalDown ? "down" : "up");
  }

  function setPitchBend(value, range) {
    pitchBendNormalized = clampPitchBendValue(value);
    if (range !== undefined) pitchBendRangeSemitones = clampPitchBendRange(range);
    applyPitchBendToActiveVoices(true);
    refreshPerformanceRuntime("pitch-bend");
    return { value: pitchBendNormalized, range: pitchBendRangeSemitones, cents: currentPitchBendCents() };
  }

  function setPitchBendRange(range) {
    pitchBendRangeSemitones = clampPitchBendRange(range);
    applyPitchBendToActiveVoices(true);
    refreshPerformanceRuntime("pitch-bend-range");
    return { value: pitchBendNormalized, range: pitchBendRangeSemitones, cents: currentPitchBendCents() };
  }

  function resetPitchBend() {
    return setPitchBend(0, pitchBendRangeSemitones);
  }

  function getPitchBendStatus() {
    return { value: pitchBendNormalized, range: pitchBendRangeSemitones, cents: currentPitchBendCents() };
  }

  function setModWheel(value) {
    modWheelNormalized = clampModWheelValue(value);
    applyModWheelToSource(true);
    refreshPerformanceRuntime("mod-wheel");
    return { value: modWheelNormalized };
  }

  function resetModWheel() {
    return setModWheel(0);
  }

  function getModWheelStatus() {
    return { value: modWheelNormalized };
  }

  function setAftertouch(value) { return setExpressionController("aftertouch", value); }
  function setExpression(value) { return setExpressionController("expression", value); }
  function setBreath(value) { return setExpressionController("breath", value); }
  function setFoot(value) { return setExpressionController("foot", value); }

  function normalizeAllNotesOffOptions(options) {
    if (typeof options === "string") return { reason: options };
    if (options && typeof options === "object") return options;
    return {};
  }

  function allNotesOff(options) {
    const opts = normalizeAllNotesOffOptions(options);
    const reason = opts.reason || "allNotesOff";
    const fast = Boolean(opts.fast);
    sustainPedalDown = false;
    heldNotes.clear();
    heldNoteTargets.clear();
    lastMonoNote = null;
    voices.forEach((voice) => releaseVoice(voice, reason, fast));
    voices.clear();
    if (window.SynthXState?.data) window.SynthXState.data.activeNotes = {};
    document.querySelectorAll(".key.active").forEach((el) => el.classList.remove("active"));
    if (opts.dampFx) dampFxTails(reason);
    updateSafetyChain("voice-count");
    setStatus(context ? "Audio: pronto" : "Audio: non sbloccato");
    refreshPerformanceRuntime(reason || "all-notes-off");
    window.SynthXLogger?.log("allNotesOff audio", { reason, fast, dampFx: Boolean(opts.dampFx), releaseTails: releaseTailVoiceCount });
  }

  function panicAllNotesOff(reason) {
    allNotesOff({
      reason: reason || "panic",
      // v0.25.1a: Panic deve comportarsi da emergenza reale anche sui pad
      // con release lunga. Usiamo il fast-release già de-clicked invece di
      // lasciare code principali molto lunghe; le code FX vengono comunque
      // smorzate da dampFxTails().
      fast: true,
      dampFx: VOICE_MANAGEMENT_LIMITS.panicFxDamp
    });
  }

  function dampFxTails(reason) {
    // v0.7.2: utility prudente per i reset UI. Non distrugge il grafo audio:
    // abbassa rapidamente wet/feedback così delay e ambiente non restano in coda
    // quando l'utente usa Reset FX / All FX Off.
    if (!context) return;
    try {
      smoothAudioParam(modChorusWetGain?.gain, 0, 0.012);
      smoothAudioParam(modChorusWetGainR?.gain, 0, 0.012);
      smoothAudioParam(modChorusFeedbackGain?.gain, 0, 0.010);
      smoothAudioParam(modChorusFeedbackGainR?.gain, 0, 0.010);
      smoothAudioParam(modPhaserWetGain?.gain, 0, 0.012);
      smoothAudioParam(delayFeedbackGain?.gain, 0, 0.010);
      smoothAudioParam(delayWetGain?.gain, 0, 0.012);
      smoothAudioParam(delayPingInputGain?.gain, 0, 0.010);
      smoothAudioParam(delayPingFeedbackL?.gain, 0, 0.010);
      smoothAudioParam(delayPingFeedbackR?.gain, 0, 0.010);
      smoothAudioParam(delayPingWetGainL?.gain, 0, 0.012);
      smoothAudioParam(delayPingWetGainR?.gain, 0, 0.012);
      smoothAudioParam(reverbWetGain?.gain, 0, 0.018);
      window.SynthXLogger?.log("fx tails damped", reason || "manual");
    } catch (err) {
      window.SynthXLogger?.warn("FX tail damping error", reason || "", err);
    }
  }

  function ringModUsesChangedSourceB(id) {
    const match = String(id || "").match(/^osc([123])-(wave|semi|fine|pulse-width|pwm-amount|pwm-source)$/);
    if (!match) return false;
    const ringCfg = getRingModConfig();
    return ringCfg.enabled && ringCfg.amount > 0 && ringCfg.sourceB === `osc${match[1]}`;
  }

  function fmUsesChangedModulator(id) {
    const match = String(id || "").match(/^osc([123])-(wave|semi|fine|pulse-width)$/);
    if (!match) return false;
    const fmCfg = getFmConfig();
    return fmCfg.enabled && fmCfg.amount > 0 && fmCfg.modulator === `osc${match[1]}`;
  }

  function fmUsesChangedCarrierSemi(id) {
    const match = String(id || "").match(/^osc([123])-semi$/);
    if (!match) return false;
    const fmCfg = getFmConfig();
    return fmCfg.enabled && fmCfg.amount > 0 && fmCfg.carrier === `osc${match[1]}`;
  }

  function oscSyncUsesChangedOsc(id) {
    const match = String(id || "").match(/^osc([123])-(wave|semi|fine|pulse-width)$/);
    if (!match) return false;
    const syncCfg = getOscSyncConfig();
    if (!syncCfg.enabled || syncCfg.amount <= 0) return false;
    const source = `osc${match[1]}`;
    return syncCfg.master === source || syncCfg.slave === source;
  }


  function onParameterChange(id, value, meta) {
    // v0.18.4a: se un MIDI Clock esterno diventa stabile o cambia BPM, il delay sync deve
    // aggiornare il DelayNode anche senza muovere manualmente la divisione.
    if (id === "midiClock" && getDelayConfig().timeMode === "sync") {
      updateDelayChain("midi-clock-sync");
      return;
    }
    if (id === "master") updateMasterGain();
    if (id === "voices") enforceVoiceLimit("param:voices");
    if (["performance-octave", "performance-mode"].includes(id)) {
      window.SynthXSequencer?.handlePerformanceChange?.(id);
      window.SynthXArpeggiator?.handlePerformanceChange?.(id);
      allNotesOff();
      refreshPerformanceRuntime(`param:${id}`);
      return;
    }
    if (SEQ_PARAM_IDS.includes(id)) { window.SynthXSequencer?.onControlChange?.(id); return; }
    if (ARP_PARAM_IDS.includes(id)) { window.SynthXArpeggiator?.onControlChange?.(id); return; }
    if (VISUAL_PARAM_IDS.includes(id)) { window.SynthXOscilloscope?.onControlChange?.(id, value); window.SynthXSpectroscope?.onControlChange?.(id, value); return; }
    if (TUNING_PARAM_IDS.includes(id)) {
      updateActiveTuningParam();
      refreshPerformanceRuntime(`param:${id}`);
      return;
    }
    if (isModMatrixParam(id)) {
      window.SynthXModulationMatrix?.syncFromUi?.("audio-param");
      rebuildActiveVoices(`param:${id}`);
      updateGlobalFxModMatrix(`param:${id}`);
      return;
    }
    if (id === "performance-hold-enabled" && getPerformanceConfig().hold === false) releaseSustainedNotes();
    if (["performance-hold-enabled", "performance-glide-enabled", "performance-glide-ms", "performance-key-velocity", "performance-velocity-curve"].includes(id)) {
      window.SynthXSequencer?.handlePerformanceChange?.(id);
      window.SynthXArpeggiator?.handlePerformanceChange?.(id);
      refreshPerformanceRuntime(`param:${id}`);
    }
    if (id === "performance.sustainEnabled" && boolParam("performance.sustainEnabled", DEFAULTS.performanceSustain) === false) {
      sustainPedalDown = false;
      releaseSustainedNotes();
    }

    // v0.6.3: EQ globale post-drive. I parametri EQ aggiornano nodi globali
    // con smoothing e non ricostruiscono le voci attive.
    if (EQ_PARAM_IDS.includes(id)) {
      updateEqChain(id);
      return;
    }

    // v0.6.1: il blocco Drive/Saturation è globale post-ADSR.
    // I parametri effetto aggiornano nodi globali e curva WaveShaper senza ricostruire le voci.
    if (SAT_PARAM_IDS.includes(id)) {
      updateEffectChain(id);
      return;
    }

    // v0.18.6: famiglie effetti globali post-EQ. Ogni variazione FX aggiorna anche
    // gli altri rami, perché il gain staging musicale ora tiene conto del carico
    // complessivo Modulazione + Delay + Reverb.
    if (FX_FAMILY_PARAM_IDS.includes(id)) {
      updateModulationChain(MOD_PARAM_IDS.includes(id) ? id : "fx-stack");
      updateDelayChain(DELAY_PARAM_IDS.includes(id) ? id : "fx-stack");
      updateReverbChain(REVERB_PARAM_IDS.includes(id) ? id : "fx-stack");
      updateGlobalFxModMatrix(`param:${id}`);
      return;
    }

    // v0.7.1: safety dinamica globale post-ambiente. Non ricostruisce voci.
    if (SAFETY_PARAM_IDS.includes(id)) {
      updateSafetyChain(id);
      if (id === "safety-enabled" || id === "safety-feedback-guard") updateDelayChain(id);
      return;
    }

    // v0.16.2: Filter Drive/Character è pre-filtro ma topology-stable: aggiorna live
    // curva, pre-gain e trim senza ricostruire le voci attive.
    if (FILTER_DRIVE_PARAM_IDS.includes(id)) {
      updateActiveFilterDriveParams(id);
      return;
    }

    // v0.18.1: Advanced Filter / Resonator aggiorna live Freq/Depth/Mix,
    // Vowel e quantità di modulazione quando la topologia resta coerente.
    // Enabled e Mode ricostruiscono le voci attive perché cambiano il grafo interno.
    if (ADV_FILTER_PARAM_IDS.includes(id)) {
      if (["adv-filter-freq", "adv-filter-depth", "adv-filter-mix", "adv-filter-vowel", "adv-filter-env-freq", "adv-filter-vel-depth", "adv-filter-vel-mix"].includes(id)) {
        if (!updateActiveAdvancedFilterParams(id)) rebuildActiveVoices(`param:${id}`);
      } else {
        rebuildActiveVoices(`param:${id}`);
      }
      return;
    }

    // v0.5.3: cutoff e Q dei filtri non ricostruiscono più le voci attive.
    // La ricostruzione mentre una nota suona generava click/rumori strani,
    // soprattutto muovendo Q ad alta risonanza. Ora aggiorniamo i BiquadFilterNode
    // già esistenti con smoothing. L'on/off dei filtri resta invece rebuild,
    // perché cambia proprio la topologia della catena audio.
    if (FILTER_LIVE_PARAM_IDS.includes(id)) {
      updateActiveFilterParams(id);
      if (id === "hpf-q" || id === "vcf-q") updateActiveFilterDriveParams("filter-risk-q");
      return;
    }

    if (ringModUsesChangedSourceB(id)) {
      rebuildActiveVoices(`param:${id}:ringmod-source-b`);
      return;
    }
    if (fmUsesChangedModulator(id)) {
      rebuildActiveVoices(`param:${id}:fm-modulator`);
      return;
    }
    if (fmUsesChangedCarrierSemi(id)) {
      rebuildActiveVoices(`param:${id}:fm-carrier-depth`);
      return;
    }
    if (id === "fm-amount") {
      const fmCfg = getFmConfig();
      if (!fmCfg.enabled || fmCfg.amount <= 0) {
        updateActiveFmAmountParam(id);
        return;
      }
      if (!updateActiveFmAmountParam(id)) rebuildActiveVoices(`param:${id}:fm-amount-chain`);
      return;
    }
    if (UNISON_PARAM_IDS.includes(id)) {
      const unisonCfg = getUnisonConfig();
      // v0.22.5: Unison modifica la topologia per voce; ricostruisce solo quando è
      // richiesto o quando esistono layer attivi. Detune/Spread aggiornano live se
      // il numero effettivo di layer resta identico.
      const hasUnisonLayers = Array.from(voices.values()).some((voice) =>
        (voice.oscillators || []).some((info) => Array.isArray(info.unisonLayers) && info.unisonLayers.length > 1)
      );
      if (!unisonCfg.enabled && !hasUnisonLayers) return;
      if (["unison-detune", "unison-spread"].includes(String(id)) && updateActiveUnisonCharacterParam(id)) return;
      rebuildActiveVoices(`param:${id}:unison`);
      return;
    }
    if (OSC_SYNC_PARAM_IDS.includes(id)) {
      const syncCfg = getOscSyncConfig();
      if (id === "oscsync-amount") {
        if (!syncCfg.enabled || syncCfg.amount <= 0) {
          updateActiveOscSyncAmountParam(id);
          return;
        }
        if (!updateActiveOscSyncAmountParam(id)) rebuildActiveVoices(`param:${id}:oscsync-chain`);
        return;
      }
      // v0.22.3b: Enable/Master/Slave non ricostruiscono le voci se Osc Sync è safe-off
      // o se Amount è 0; in questi casi il percorso audio resta legacy.
      if (!syncCfg.enabled || syncCfg.amount <= 0) {
        updateActiveOscSyncAmountParam("oscsync-amount");
        return;
      }
      rebuildActiveVoices(`param:${id}:oscsync`);
      return;
    }
    if (oscSyncUsesChangedOsc(id)) {
      rebuildActiveVoices(`param:${id}:oscsync-source`);
      return;
    }
    if (/^osc[123]-(level|semi|fine|pan)$/.test(String(id))) {
      if (!updateActiveOscillatorParam(id)) rebuildActiveVoices(`param:${id}`);
      return;
    }
    if (id === "noise-db") {
      if (!updateActiveNoiseParam(id)) rebuildActiveVoices(`param:${id}`);
      return;
    }
    if (/^lfo[123]-depth$/.test(String(id))) {
      if (!updateActiveLfoDepthParam(id)) rebuildActiveVoices(`param:${id}`);
      updateGlobalFxModMatrix(`param:${id}`);
      return;
    }
    if (/^lfo[123]-(rate|rate-mode|sync)$/.test(String(id))) {
      updateActiveLfoRateParam(id);
      updateGlobalFxModMatrix(`param:${id}`);
      return;
    }
    if (/^lfo[123]-(enabled|wave)$/.test(String(id))) {
      // v0.26.6m: quando un LFO guida destinazioni FX globali, anche Enable e Wave
      // devono rigenerare il layer Global FX Mod Matrix. Prima il refresh avveniva
      // solo su Depth/Rate/Sync o su cambio slot Matrix, lasciando un caso dinamico
      // incoerente fino al successivo movimento di un altro controllo.
      rebuildActiveVoices(`param:${id}`);
      updateGlobalFxModMatrix(`param:${id}`);
      return;
    }
    if (FILTER_ENV_PARAM_IDS.includes(id)) {
      updateActiveFilterEnvelopeParam(id);
      updateActiveAdvancedFilterParams(`filter-env:${id}`);
      if (id === "filter-env-amount") updateActiveFilterDriveParams("filter-env-risk");
      return;
    }
    if (OSC_PARAM_IDS.includes(id) || NOISE_PARAM_IDS.includes(id) || RING_MOD_PARAM_IDS.includes(id) || FM_PARAM_IDS.includes(id) || OSC_SYNC_PARAM_IDS.includes(id) || UNISON_PARAM_IDS.includes(id) || LFO_PARAM_IDS.includes(id) || ENV_PARAM_IDS.includes(id) || FILTER_ENABLE_PARAM_IDS.includes(id) || id === "performance.velocityEnabled") {
      rebuildActiveVoices(`param:${id}`);
    }
  }

  window.SynthXAudio = {
    unlock,
    noteOn,
    noteOff,
    noteOffImmediate,
    allNotesOff,
    panicAllNotesOff,
    setSustainPedal,
    setPitchBend,
    setPitchBendRange,
    resetPitchBend,
    getPitchBendStatus,
    setModWheel,
    resetModWheel,
    getModWheelStatus,
    setAftertouch,
    setExpression,
    setBreath,
    setFoot,
    setExpressionController,
    resetExpressionControllers,
    getExpressionControllerStatus,
    getPerformanceNote,
    getPerformanceConfig,
    getTuningConfig,
    onParameterChange,
    getContext: () => context,
    getMasterGain: () => masterGain,
    getEffectInput: () => effectInput,
    getEffectOutput: () => effectOutput,
    getEqInput: () => eqInput,
    getEqOutput: () => eqOutput,
    getModulationInput: () => modInput,
    getDelayInput: () => delayInput,
    getReverbInput: () => reverbInput,
    getSafetyInput: () => safetyInput,
    getSafetyOutput: () => safetyOutput,
    getSafetyAnalyser: () => safetyAnalyser,
    getScopeAnalyser: () => safetyAnalyser,
    dampFxTails,
    getEffectConfig: () => getSaturationConfig(),
    getEqConfig: () => getEqConfig(),
    getModulationConfig: () => getModulationConfig(),
    getDelayConfig: () => getDelayConfig(),
    getReverbConfig: () => getReverbConfig(),
    getSafetyConfig: () => getSafetyConfig(),
    getVoiceCount: () => voices.size,
    getReleaseTailVoiceCount: () => releaseTailVoiceCount,
    getVoiceManagementStatus: () => ({
      activeVoices: voices.size,
      heldNotes: heldNotes.size,
      heldTargets: heldNoteTargets.size,
      releaseTails: releaseTailVoiceCount,
      sustainPedalDown,
      maxVoices: getGlobalConfig().maxVoices
    }),
    getHeldNoteCount: () => heldNotes.size,
    isSustainPedalDown: () => sustainPedalDown,
    getPitchBendValue: () => pitchBendNormalized,
    getPitchBendRange: () => pitchBendRangeSemitones,
    getModWheelValue: () => modWheelNormalized,
    getAftertouchValue: () => expressionControllerValues.aftertouch,
    getExpressionValue: () => expressionControllerValues.expression,
    getBreathValue: () => expressionControllerValues.breath,
    getFootValue: () => expressionControllerValues.foot,
    getGlobalFxModMatrixStatus: () => ({ entries: globalFxModMatrixEntries.length, destinations: Array.from(GLOBAL_FX_MOD_DESTINATION_IDS) }),
    getNoiseBufferTypes: () => Array.from(noiseBuffers.keys()),
    recoverAudioAfterFocus
  };

  installAudioFocusRecoveryListeners();
})();
