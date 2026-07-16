(function () {
  "use strict";

  const DEFAULTS = {
    master: 0.65,
    maxVoices: 12,
    performanceVelocity: true,
    performanceSustain: true,
    tuning: { a4Hz: 440, minA4Hz: 400, maxA4Hz: 480, noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si" },
    performance: { octave: 0, mode: "poly", hold: false, glideEnabled: false, glideMs: 0, keyVelocity: 1, velocityCurve: "linear" },
    arpeggiator: { enabled: false, mode: "up", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true },
    sequencer: { enabled: false, length: 8, rate: 2, gate: 65 },
    visuals: { oscilloscopeEnabled: true, oscilloscopeMode: "wave", oscilloscopeFps: 30, spectroscopeEnabled: true, spectroscopeMode: "spectrum", spectroscopeFps: 20 },
    env: { curve: "linear", attackMs: 10, decayMs: 120, sustain: 0.6, releaseMs: 200 },
    filterEnv: { amount: 0, target: "vcf", polarity: "normal", attackMs: 10, decayMs: 180, sustain: 0.45, releaseMs: 240 },
    filterDrive: { enabled: false, mode: "clean", amount: 0, trimDb: 0 },
    advancedFilter: { enabled: false, mode: "allpass", freq: 1200, depth: 0, mix: 0, vowel: "a", envFreq: 0, velocityDepth: 0, velocityMix: 0 },
    osc: {
      1: { enabled: true, wave: "sine", level: 0.8, semi: 0, fine: 0, pan: 0, pulseWidth: 0.5, pwmAmount: 0, pwmSource: "off" },
      2: { enabled: false, wave: "saw", level: 0.0, semi: 0, fine: 0, pan: 0, pulseWidth: 0.5, pwmAmount: 0, pwmSource: "off" },
      3: { enabled: false, wave: "square", level: 0.0, semi: 0, fine: 0, pan: 0, pulseWidth: 0.5, pwmAmount: 0, pwmSource: "off" }
    },
    noise: { enabled: false, type: "white", db: -12 },
    ringMod: { enabled: false, sourceA: "osc1", sourceB: "osc2", amount: 0 },
    fm: { enabled: false, carrier: "osc1", modulator: "osc2", amount: 0 },
    oscSync: { enabled: false, master: "osc1", slave: "osc2", amount: 0 },
    unison: { enabled: false, voices: 2, maxLayers: 3, detune: 7, spread: 0.45 },
    filters: {
      hpf: { enabled: false, cutoff: 200, q: 0.7, slope: 12 },
      bpf: { enabled: false, cutoff: 1200, q: 1.0 },
      notch: { enabled: false, cutoff: 1200, q: 1.0 },
      vcf: { enabled: true, cutoff: 10000, q: 0.8, slope: 12, keyTrack: 0, velocity: 0 }
    },
    saturation: {
      enabled: false,
      mode: "drive",
      amount: 0.25,
      tone: 0.86, // controllo normalizzato 0..1, mappato logaritmicamente a circa 12 kHz
      mix: 0.35,
      preDb: 6,
      voicingPreHz: 30,
      dcBlockHz: 12,
      asymmetry: 0.2,
      hardness: 0.6,
      bias: 0,
      gate: 0.02,
      octaveBlend: 0
    },
    eq: {
      enabled: true,
      low: 0,
      lowmid: 0,
      mid: 0,
      highmid: 0,
      high: 0
    },
    modulation: { enabled: false, mode: "chorus", rate: 0.65, depth: 0.32, mix: 0.25 },
    modulationMatrix: [
      { enabled: false, source: "lfo1", destination: "vcf_cutoff", amount: 0 },
      { enabled: false, source: "lfo2", destination: "vcf_cutoff", amount: 0 },
      { enabled: false, source: "lfo3", destination: "adv_filter_freq", amount: 0 },
      { enabled: false, source: "velocity", destination: "vcf_cutoff", amount: 0 },
      { enabled: false, source: "filter_env", destination: "filter_drive", amount: 0 },
      { enabled: false, source: "lfo1", destination: "pan", amount: 0 },
      { enabled: false, source: "lfo2", destination: "volume", amount: 0 },
      { enabled: false, source: "lfo3", destination: "pitch", amount: 0 }
    ],
    delay: { enabled: false, mode: "mono", timeMode: "free", sync: "1/8", time: 0.28, feedback: 0.24, damping: 0.70, mix: 0.22 },
    reverb: { enabled: false, mode: "room", size: 0.45, decay: 1.8, damping: 0.62, mix: 0.18 },
    safety: { enabled: true, thresholdDb: -6, releaseMs: 120, gainGuard: true, guardDepth: 0.18, feedbackGuard: true },
    lfo: {
      1: { enabled: false, wave: "sine", rate: 5.0, rateMode: "free", sync: 1, depth: 0.0, dest: "pitch", mode: "global" },
      2: { enabled: false, wave: "sine", rate: 5.0, rateMode: "free", sync: 1, depth: 0.0, dest: "pitch", mode: "global" },
      3: { enabled: false, wave: "sine", rate: 5.0, rateMode: "free", sync: 1, depth: 0.0, dest: "pitch", mode: "global" }
    }
  };

  const OSC_PARAM_IDS = [];
  const LFO_PARAM_IDS = [];
  [1, 2, 3].forEach((i) => {
    OSC_PARAM_IDS.push(`osc${i}-enabled`, `osc${i}-wave`, `osc${i}-level`, `osc${i}-semi`, `osc${i}-fine`, `osc${i}-pan`, `osc${i}-pulse-width`, `osc${i}-pwm-amount`, `osc${i}-pwm-source`);
    LFO_PARAM_IDS.push(`lfo${i}-enabled`, `lfo${i}-wave`, `lfo${i}-rate-mode`, `lfo${i}-rate`, `lfo${i}-sync`, `lfo${i}-depth`, `lfo${i}-dest`, `lfo${i}-mode`, `lfo${i}-t-osc1`, `lfo${i}-t-osc2`, `lfo${i}-t-osc3`);
  });

  const TUNING_PARAM_IDS = ["master-tuning-a4"];
  const NOISE_PARAM_IDS = ["noise-enabled", "noise-type", "noise-db"];
  const RING_MOD_PARAM_IDS = ["ringmod-enabled", "ringmod-source-a", "ringmod-source-b", "ringmod-amount"];
  const FM_PARAM_IDS = ["fm-enabled", "fm-carrier", "fm-modulator", "fm-amount"];
  const OSC_SYNC_PARAM_IDS = ["oscsync-enabled", "oscsync-master", "oscsync-slave", "oscsync-amount"];
  const UNISON_PARAM_IDS = ["unison-enabled", "unison-voices", "unison-max-layers", "unison-detune", "unison-spread"];
  const ENV_PARAM_IDS = ["env-curve", "env-att", "env-dec", "env-sus", "env-rel"];
  const FILTER_ENV_PARAM_IDS = ["filter-env-amount", "filter-env-target", "filter-env-polarity", "filter-env-att", "filter-env-dec", "filter-env-sus", "filter-env-rel"];
  const FILTER_DRIVE_PARAM_IDS = ["filter-drive-enabled", "filter-drive-mode", "filter-drive-amount", "filter-drive-trim"];
  const ADV_FILTER_PARAM_IDS = ["adv-filter-enabled", "adv-filter-mode", "adv-filter-freq", "adv-filter-depth", "adv-filter-mix", "adv-filter-vowel", "adv-filter-env-freq", "adv-filter-vel-depth", "adv-filter-vel-mix"];
  const FILTER_PARAM_IDS = [
    "hpf-enabled", "hpf-cutoff", "hpf-q", "hpf-slope",
    "bpf-enabled", "bpf-cutoff", "bpf-q",
    "notch-enabled", "notch-cutoff", "notch-q",
    "vcf-enabled", "vcf-cutoff", "vcf-q", "vcf-slope", "vcf-keytrack", "vcf-velocity"
  ];
  const FILTER_ENABLE_PARAM_IDS = ["hpf-enabled", "bpf-enabled", "notch-enabled", "vcf-enabled", "hpf-slope", "vcf-slope"];
  const FILTER_LIVE_PARAM_IDS = [
    "hpf-cutoff", "hpf-q",
    "bpf-cutoff", "bpf-q",
    "notch-cutoff", "notch-q",
    "vcf-cutoff", "vcf-q", "vcf-keytrack", "vcf-velocity"
  ];
  const FILTER_PARAM_TO_NAME = {
    "hpf-cutoff": "hpf", "hpf-q": "hpf",
    "bpf-cutoff": "bpf", "bpf-q": "bpf",
    "notch-cutoff": "notch", "notch-q": "notch",
    "vcf-cutoff": "vcf", "vcf-q": "vcf", "vcf-keytrack": "vcf", "vcf-velocity": "vcf"
  };
  const SAT_PARAM_IDS = [
    "sat-enabled", "sat-mode", "sat-amt", "sat-tone", "sat-mix",
    "sat-predb", "sat-voxpre", "sat-dc", "sat-asym", "sat-hard",
    "sat-bias", "sat-gate", "sat-oct"
  ];
  const SAT_CURVE_PARAM_IDS = ["sat-mode", "sat-amt", "sat-asym", "sat-hard", "sat-bias", "sat-gate", "sat-oct"];
  const EQ_PARAM_IDS = ["eq-enabled", "eq-low", "eq-lowmid", "eq-mid", "eq-highmid", "eq-high"];
  const MOD_PARAM_IDS = ["mod-enabled", "mod-mode", "mod-rate", "mod-depth", "mod-mix"];
  const MOD_MATRIX_PARAM_IDS = [];
  for (let index = 1; index <= 8; index += 1) {
    MOD_MATRIX_PARAM_IDS.push(`modmat-slot${index}-enabled`, `modmat-slot${index}-source`, `modmat-slot${index}-destination`, `modmat-slot${index}-amount`);
  }
  const MODULATION_MODES = ["chorus", "ensemble", "phaser", "flanger"];
  const DELAY_PARAM_IDS = ["delay-enabled", "delay-mode", "delay-time-mode", "delay-sync", "delay-time", "delay-feedback", "delay-damp", "delay-mix"];
  const REVERB_PARAM_IDS = ["rev-enabled", "rev-mode", "rev-size", "rev-decay", "rev-damp", "rev-mix"];
  const REVERB_MODES = ["room", "hall", "plate", "dark"];
  const SAFETY_PARAM_IDS = ["safety-enabled", "safety-threshold", "safety-release", "safety-gain-guard", "safety-guard-depth", "safety-feedback-guard"];
  const ARP_PARAM_IDS = ["arp-enabled", "arp-mode", "arp-rate", "arp-octaves", "arp-gate", "arp-swing", "arp-motion-pattern", "arp-latch-enabled", "arp-reset-on-change", "arp-random-no-repeat"];
  const SEQ_PARAM_IDS = ["seq-enabled", "seq-length", "seq-rate", "seq-gate"];
  const SEQ_STEP_PARAM_SUFFIXES = Object.freeze([
    "active", "note", "octave", "velocity", "gate", "accent", "tie", "chord",
    "chord-custom", "chord-inversion", "chord-spread", "chord-strum", "chord-velocity-mode"
  ]);
  for (let index = 1; index <= 32; index += 1) {
    SEQ_STEP_PARAM_SUFFIXES.forEach((suffix) => SEQ_PARAM_IDS.push(`seq-step-${index}-${suffix}`));
  }
  const VISUAL_PARAM_IDS = ["scope-enabled", "spectrum-enabled"];
  const FX_FAMILY_PARAM_IDS = MOD_PARAM_IDS.concat(DELAY_PARAM_IDS, REVERB_PARAM_IDS);
  const EQ_BAND_DEFS = [
    { id: "eq-low", key: "low", label: "Low 80 Hz", type: "lowshelf", frequency: 80, q: 0.7 },
    { id: "eq-lowmid", key: "lowmid", label: "Low-mid 250 Hz", type: "peaking", frequency: 250, q: 0.95 },
    { id: "eq-mid", key: "mid", label: "Mid 1 kHz", type: "peaking", frequency: 1000, q: 1.0 },
    { id: "eq-highmid", key: "highmid", label: "High-mid 4 kHz", type: "peaking", frequency: 4000, q: 0.95 },
    { id: "eq-high", key: "high", label: "High 12 kHz", type: "highshelf", frequency: 12000, q: 0.7 }
  ];

  window.SynthXAudioConfig = Object.freeze({
    DEFAULTS,
    OSC_PARAM_IDS,
    LFO_PARAM_IDS,
    TUNING_PARAM_IDS,
    NOISE_PARAM_IDS,
    RING_MOD_PARAM_IDS,
    FM_PARAM_IDS,
    OSC_SYNC_PARAM_IDS,
    UNISON_PARAM_IDS,
    ENV_PARAM_IDS,
    FILTER_ENV_PARAM_IDS,
    FILTER_DRIVE_PARAM_IDS,
    ADV_FILTER_PARAM_IDS,
    FILTER_PARAM_IDS,
    FILTER_ENABLE_PARAM_IDS,
    FILTER_LIVE_PARAM_IDS,
    FILTER_PARAM_TO_NAME,
    SAT_PARAM_IDS,
    SAT_CURVE_PARAM_IDS,
    EQ_PARAM_IDS,
    MOD_PARAM_IDS,
    MOD_MATRIX_PARAM_IDS,
    DELAY_PARAM_IDS,
    REVERB_PARAM_IDS,
    MODULATION_MODES,
    REVERB_MODES,
    SAFETY_PARAM_IDS,
    ARP_PARAM_IDS,
    SEQ_PARAM_IDS,
    VISUAL_PARAM_IDS,
    FX_FAMILY_PARAM_IDS,
    EQ_BAND_DEFS
  });
})();
