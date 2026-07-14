(function () {
  "use strict";

  const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const STEP_LENGTH_VALUES = Object.freeze(Array.from({ length: 30 }, (_, i) => i + 3));
  const STEP_LENGTH_VALUE_STRINGS = new Set(STEP_LENGTH_VALUES.map(String));
  const CHORD_PRESETS = Object.freeze({
    off: { label: "Off", short: "", intervals: [0] },
    octave: { label: "Octave", short: "+8", intervals: [0, 12] },
    power5: { label: "Power 5th", short: "5", intervals: [0, 7] },
    major: { label: "Major", short: "Maj", intervals: [0, 4, 7] },
    minor: { label: "Minor", short: "min", intervals: [0, 3, 7] },
    sus2: { label: "Sus2", short: "sus2", intervals: [0, 2, 7] },
    sus4: { label: "Sus4", short: "sus4", intervals: [0, 5, 7] },
    dim: { label: "Dim", short: "dim", intervals: [0, 3, 6] },
    aug: { label: "Aug", short: "aug", intervals: [0, 4, 8] },
    maj7: { label: "Maj7", short: "maj7", intervals: [0, 4, 7, 11] },
    min7: { label: "Min7", short: "min7", intervals: [0, 3, 7, 10] },
    dom7: { label: "Dom7", short: "7", intervals: [0, 4, 7, 10] },
    custom: { label: "Custom", short: "Cus", intervals: [0, 4, 7] }
  });
  const CHORD_IDS = Object.freeze(Object.keys(CHORD_PRESETS));
  const CHORD_VALUE_STRINGS = new Set(CHORD_IDS);
  const CHORD_INVERSION_VALUES = Object.freeze(["0", "1", "2", "3"]);
  const CHORD_INVERSION_VALUE_STRINGS = new Set(CHORD_INVERSION_VALUES);
  const CHORD_SPREAD_VALUES = Object.freeze(["close", "open", "wide"]);
  const CHORD_SPREAD_VALUE_STRINGS = new Set(CHORD_SPREAD_VALUES);
  const CHORD_VELOCITY_MODES = Object.freeze(["balanced", "flat", "natural", "softTop"]);
  const CHORD_VELOCITY_MODE_STRINGS = new Set(CHORD_VELOCITY_MODES);
  const CHORD_ALIASES = Object.freeze({
    none: "off", false: "off", 0: "off", triad: "major", maj: "major", min: "minor", m: "minor",
    fifth: "power5", p5: "power5", power: "power5", powerchord: "power5", "5": "power5", "8": "octave",
    major7: "maj7", m7: "min7", minor7: "min7", dominant7: "dom7", dom: "dom7",
    custom: "custom", user: "custom", interval: "custom", intervals: "custom"
  });
  const STEP_CHORD_SAFETY_EXPECTATIONS = Object.freeze({
    presetCount: 13,
    maxNotes: 4,
    totalSteps: 32,
    maxLength: 32,
    maxStrumMs: 120,
    legacyDefault: "off",
    patternFormatVersion: "1.2",
    requiredPresets: ["off", "octave", "power5", "major", "minor", "sus2", "sus4", "dim", "aug", "maj7", "min7", "dom7", "custom"],
    requiredSeqParamSuffixes: ["active", "note", "octave", "velocity", "gate", "accent", "tie", "chord", "chord-custom", "chord-inversion", "chord-spread", "chord-strum", "chord-velocity-mode"]
  });

  const LIMITS = Object.freeze({
    lengthValues: new Set(STEP_LENGTH_VALUES),
    rateMin: 0.5,
    rateMax: 16,
    gateMin: 10,
    gateMax: 95,
    minIntervalMs: 40,
    minGateMs: 8,
    gateTailSafetyMs: 4,
    steps: 32,
    noteMin: 0,
    noteMax: 11,
    octaveMin: 2,
    octaveMax: 6,
    velocityMin: 0,
    velocityMax: 100,
    velocityDefault: 100,
    stepGateValues: new Set([25, 50, 75, 100]),
    stepGateDefault: 100,
    accentBoost: 1.2,
    maxChordNotes: 4,
    maxChordStrumMs: 120,
    customIntervalMin: -24,
    customIntervalMax: 36
  });
  const STEP_PATTERN_SCHEMA = "sorgiva-synth-step-pattern-v1";
  const STEP_PATTERN_FORMAT_ID = "sorgiva-synth-sequencer-pattern";
  const STEP_PATTERN_FORMAT_VERSION = "1.2";
  const APP_VERSION = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || "0.26.7r2-public-alpha-readiness-regression-baseline";
  function exportPatternMetadata() {
    if (window.SorgivaSynth?.buildExportMetadata) return window.SorgivaSynth.buildExportMetadata("sequencerPattern", { format: STEP_PATTERN_FORMAT_ID, schema: STEP_PATTERN_SCHEMA, formatVersion: STEP_PATTERN_FORMAT_VERSION });
    return { project: "Sorgiva Synth", format: STEP_PATTERN_FORMAT_ID, schema: STEP_PATTERN_SCHEMA, formatVersion: STEP_PATTERN_FORMAT_VERSION, appVersion: APP_VERSION, sorgivaVersion: APP_VERSION, sorgivaSynthVersion: APP_VERSION, synthxVersion: APP_VERSION, exportedBy: "Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline", exportedAt: new Date().toISOString(), compatibility: { legacySynthXImport: true, legacyTypesAccepted: ["SynthX Pattern Preset"] } };
  }
  const DEFAULT_PATTERN = Object.freeze([
    { active: true, note: 0, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 9, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: true, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 0, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 9, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false },
    { active: false, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false }
  ]);
  function step(note, octave, velocity = 100, gate = 100, accent = false, tie = false) {
    return { active: true, note, octave, velocity, gate, accent, tie };
  }

  function rest(note = 0, octave = 4, velocity = 100, gate = 100) {
    return { active: false, note, octave, velocity, gate, accent: false, tie: false };
  }

  function chordStep(note, octave, velocity = 92, gate = 75, accent = false, tie = false, chord = "minor", chordInversion = 0, chordSpread = "close", chordStrum = 0, chordVelocityMode = "balanced", chordCustom = "0,3,7") {
    return { active: true, note, octave, velocity, gate, accent, tie, chord, chordCustom, chordInversion, chordSpread, chordStrum, chordVelocityMode };
  }

  const PATTERN_PRESETS = Object.freeze({
    seqk_berlin_gate_8: {
      label: "Berlin · Gate Matrix 8",
      category: "Berlin School",
      description: "Ottavi ipnotici con accenti regolari, pensati per delay sincronizzato e bassi analogici.",
      length: 8,
      steps: [step(0,3,96,75,true,false), step(7,3,82,50,false,false), step(10,3,88,75,false,false), step(0,4,90,50,false,false), step(3,4,84,75,false,false), step(0,4,88,50,false,false), step(10,3,82,75,false,false), step(7,3,86,50,false,false)]
    },
    seqk_berlin_ladder_16: {
      label: "Berlin · Minor Ladder 16",
      category: "Berlin School",
      description: "Scala spezzata minore su 16 step, leggibile ma non troppo quadrata.",
      length: 16,
      steps: [step(0,3,96,75,true,false), step(3,3,80,50,false,false), step(7,3,88,75,false,false), step(10,3,78,50,false,false), step(0,4,94,75,true,false), step(3,4,80,50,false,false), step(7,4,88,75,false,false), step(10,4,78,50,false,false), step(7,4,88,75,true,false), step(3,4,80,50,false,false), step(0,4,92,75,false,false), step(10,3,78,50,false,false), step(7,3,88,75,true,false), step(3,3,80,50,false,false), step(0,3,96,75,false,false), rest(0,3,90,75)]
    },
    seqk_berlin_octave_pulse_16: {
      label: "Berlin · Octave Pulse 16",
      category: "Berlin School",
      description: "Fondamentale e ottave alternate per sequenze pulsanti e stabili.",
      length: 16,
      steps: [step(0,3,98,100,true,false), step(0,4,76,50,false,false), step(7,3,86,75,false,false), step(0,4,76,50,false,false), step(3,3,92,75,true,false), step(3,4,74,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(0,3,96,100,true,false), step(0,4,76,50,false,false), step(7,3,86,75,false,false), step(0,4,76,50,false,false), step(5,3,90,75,true,false), step(5,4,74,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75)]
    },
    seqk_berlin_space_12: {
      label: "Berlin · Space 12",
      category: "Berlin School",
      description: "Dodici step con salti aperti, utile per delay ping-pong e sequenze ariose.",
      length: 12,
      steps: [step(0,3,94,75,true,false), step(7,3,78,50,false,false), step(2,4,88,75,false,false), step(7,3,78,50,false,false), step(5,4,90,75,true,false), step(2,4,78,50,false,false), step(10,3,86,75,false,false), rest(2,4,90,75), step(0,4,94,75,true,false), step(7,3,78,50,false,false), step(2,4,88,75,false,false), rest(2,4,90,75)]
    },
    seqk_berlin_delay_24: {
      label: "Berlin · Delay Rail 24",
      category: "Berlin School",
      description: "Linea lunga a 24 step con ripetizioni controllate, pensata per delay e sequenze evolutive.",
      length: 24,
      steps: [step(0,3,96,75,true,false), step(7,3,78,50,false,false), step(10,3,84,75,false,false), step(0,4,82,50,false,false), step(3,4,90,75,true,false), step(0,4,78,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(5,3,92,75,true,false), step(0,4,78,50,false,false), step(7,3,84,75,false,false), step(2,4,80,50,false,false), step(0,3,96,75,true,false), step(7,3,78,50,false,false), step(10,3,84,75,false,false), step(0,4,82,50,false,false), step(8,3,90,75,true,false), step(3,4,78,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(7,3,92,75,true,false), step(0,4,78,50,false,false), step(3,4,84,75,false,false), rest(0,3,90,75)]
    },
    seqk_berlin_fifth_matrix_16: {
      label: "Berlin · Fifth Matrix 16",
      category: "Berlin School",
      description: "Quinte e ottave per pattern old-school con poco rischio armonico.",
      length: 16,
      steps: [chordStep(0,3,94,75,true,false,"power5",0,"close",0,"balanced","0,3,7"), step(7,3,78,50,false,false), chordStep(10,3,84,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(0,4,80,50,false,false), chordStep(3,3,90,75,true,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,3,78,50,false,false), step(7,3,84,75,false,false), rest(7,3,90,75), chordStep(0,3,94,75,true,false,"octave",0,"close",0,"balanced","0,3,7"), step(7,3,78,50,false,false), chordStep(10,3,84,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(0,4,80,50,false,false), chordStep(5,3,90,75,true,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,3,78,50,false,false), step(7,3,84,75,false,false), rest(7,3,90,75)]
    },
    seqk_berlin_low_high_32: {
      label: "Berlin · Low High 32",
      category: "Berlin School",
      description: "Pattern esteso a 32 step per verificare copertura completa e movimento su registri bassi/alti.",
      length: 32,
      steps: [step(0,3,96,75,true,false), step(7,3,76,50,false,false), step(10,3,84,75,false,false), step(0,4,78,50,false,false), step(3,4,90,75,true,false), step(0,4,76,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(5,3,92,75,true,false), step(0,4,76,50,false,false), step(7,3,84,75,false,false), step(2,4,78,50,false,false), step(0,3,96,75,true,false), step(7,3,76,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(0,2,98,100,true,false), step(7,2,76,50,false,false), step(10,2,84,75,false,false), step(0,3,78,50,false,false), step(3,3,90,75,true,false), step(0,3,76,50,false,false), step(10,2,84,75,false,false), rest(10,2,90,75), step(5,2,92,75,true,false), step(0,3,76,50,false,false), step(7,2,84,75,false,false), step(2,3,78,50,false,false), step(0,2,98,100,true,false), step(7,2,76,50,false,false), step(10,2,84,75,false,false), rest(10,2,90,75)]
    },
    seqk_berlin_mirror_16: {
      label: "Berlin · Mirror 16",
      category: "Berlin School",
      description: "Frase speculare salita/discesa con accenti misurati.",
      length: 16,
      steps: [step(0,3,96,75,true,false), step(2,3,80,50,false,false), step(3,3,84,75,false,false), step(7,3,82,50,false,false), step(10,3,90,75,true,false), step(0,4,78,50,false,false), step(3,4,84,75,false,false), step(7,4,82,50,false,false), step(7,4,90,75,true,false), step(3,4,78,50,false,false), step(0,4,84,75,false,false), step(10,3,82,50,false,false), step(7,3,88,75,true,false), step(3,3,78,50,false,false), step(2,3,84,75,false,false), step(0,3,92,50,false,false)]
    },
    seqk_acid_snap_16: {
      label: "Acid · Snap 16",
      category: "Acid / Bassline",
      description: "Sedicesimi acidi con gate corti, accenti e piccoli tie sicuri.",
      length: 16,
      steps: [step(0,2,98,50,true,false), step(0,2,76,25,false,true), step(3,2,84,50,false,false), rest(3,2,90,75), step(7,2,96,50,true,false), step(10,2,76,25,false,false), step(7,2,84,50,false,false), rest(7,2,90,75), step(0,3,98,50,true,false), step(10,2,76,25,false,false), step(7,2,86,50,false,false), step(3,2,76,25,false,false), step(0,2,98,50,true,false), rest(0,2,90,75), step(7,2,86,50,false,false), step(10,2,76,25,false,false)]
    },
    seqk_acid_tie_slide_16: {
      label: "Acid · Tie Slide 16",
      category: "Acid / Bassline",
      description: "Linea acida con tie controllati e ritmo meno duplicato rispetto ad Acid Snap.",
      length: 16,
      steps: [step(0,2,100,50,true,true), step(0,2,76,25,false,false), step(3,2,84,50,false,false), rest(3,2,90,75), step(7,2,96,50,true,false), rest(7,2,90,75), step(10,2,78,25,false,true), step(7,2,84,50,false,false), step(0,3,98,50,true,false), rest(0,3,90,75), step(3,2,82,50,false,false), step(7,2,78,25,false,false), step(10,2,92,50,true,false), rest(10,2,90,75), step(0,2,86,25,false,false), step(7,2,82,50,false,false)]
    },
    seqk_bass_root_fifth_8: {
      label: "Bassline · Root Fifth 8",
      category: "Acid / Bassline",
      description: "Basso essenziale su fondamentale e quinta, ottimo per preset bass/filter bass.",
      length: 8,
      steps: [step(0,2,100,100,true,false), step(0,2,80,50,false,false), rest(0,2,90,75), step(7,2,92,75,false,false), step(0,2,98,100,true,false), rest(0,2,90,75), step(10,2,86,75,false,false), step(7,2,88,50,false,false)]
    },
    seqk_bass_dub_12: {
      label: "Bassline · Dub 12",
      category: "Acid / Bassline",
      description: "Pattern lento con pause e note pesanti, pensato per bassi lunghi e scuri.",
      length: 12,
      steps: [step(0,2,100,100,true,false), rest(0,2,90,75), rest(0,2,90,75), step(7,2,86,75,false,false), rest(7,2,90,75), step(10,2,88,75,false,false), step(0,2,98,100,true,false), rest(0,2,90,75), step(3,2,84,75,false,false), rest(3,2,90,75), step(7,2,88,75,false,false), rest(7,2,90,75)]
    },
    seqk_bass_electro_offbeat_16: {
      label: "Bassline · Electro Offbeat 16",
      category: "Acid / Bassline",
      description: "Sincopi offbeat per electro/industrial leggero.",
      length: 16,
      steps: [rest(0,2,90,75), step(0,2,98,75,true,false), rest(0,2,90,75), step(7,2,82,50,false,false), step(0,2,94,75,true,false), rest(0,2,90,75), step(10,2,84,50,false,false), rest(10,2,90,75), rest(0,2,90,75), step(0,2,98,75,true,false), step(3,2,82,50,false,false), rest(3,2,90,75), step(7,2,94,75,true,false), rest(7,2,90,75), step(10,2,84,50,false,false), step(7,2,80,50,false,false)]
    },
    seqk_bass_dark_walk_16: {
      label: "Bassline · Dark Walk 16",
      category: "Acid / Bassline",
      description: "Camminata scura differenziata dagli acid pattern: più pause, passaggi cromatici e risposta migliore su bassi industriali.",
      length: 16,
      steps: [step(0,2,100,75,true,false), rest(0,2,90,75), step(3,2,82,50,false,false), step(5,2,84,75,false,false), step(6,2,94,75,true,false), rest(6,2,90,75), step(7,2,86,50,false,false), step(10,2,80,50,false,false), step(0,3,98,75,true,false), rest(0,3,90,75), step(10,2,82,50,false,false), step(7,2,86,75,false,false), step(6,2,92,75,true,false), rest(6,2,90,75), step(5,2,82,50,false,false), step(3,2,86,75,false,false)]
    },
    seqk_acid_octave_8: {
      label: "Acid · Octave Bite 8",
      category: "Acid / Bassline",
      description: "Pattern a ottave con gate corti, rapido da suonare con cutoff manuale.",
      length: 8,
      steps: [step(0,2,100,50,true,false), step(0,3,78,25,false,false), step(3,2,84,50,false,false), step(7,2,82,25,false,false), step(0,2,98,50,true,false), step(0,3,78,25,false,false), step(10,2,84,50,false,false), rest(10,2,90,75)]
    },
    seqk_bass_rolling_32: {
      label: "Bassline · Rolling 32",
      category: "Acid / Bassline",
      description: "Basso rolling a 32 step per stressare lunghezza completa senza chord stack.",
      length: 32,
      steps: [step(0,2,98,75,true,false), step(0,2,76,50,false,false), rest(0,2,90,75), step(7,2,86,50,false,false), step(0,2,94,75,true,false), rest(0,2,90,75), step(10,2,82,50,false,false), step(7,2,80,50,false,false), step(0,2,98,75,true,false), step(3,2,76,50,false,false), rest(3,2,90,75), step(7,2,86,50,false,false), step(0,3,94,75,true,false), step(10,2,76,50,false,false), step(7,2,82,50,false,false), rest(7,2,90,75), step(0,2,98,75,true,false), step(0,2,76,50,false,false), rest(0,2,90,75), step(7,2,86,50,false,false), step(3,2,94,75,true,false), rest(3,2,90,75), step(10,2,82,50,false,false), step(7,2,80,50,false,false), step(0,2,98,75,true,false), step(3,2,76,50,false,false), rest(3,2,90,75), step(7,2,86,50,false,false), step(0,3,94,75,true,false), step(10,2,76,50,false,false), step(7,2,82,50,false,false), rest(7,2,90,75)]
    },
    seqk_chord_minor_pulse_8: {
      label: "Chord Pulse · Minor 8",
      category: "Chord Pulse",
      description: "Accordi minori compatti con pause utili per pad e lead poly.",
      length: 8,
      steps: [chordStep(0,3,88,75,true,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(7,3,82,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), chordStep(3,3,86,75,true,false,"minor",1,"close",10,"balanced","0,3,7"), rest(3,3,90,75), chordStep(10,3,82,50,false,false,"sus2",0,"close",0,"balanced","0,3,7"), rest(10,3,90,75)]
    },
    seqk_chord_sus_wave_12: {
      label: "Chord Pulse · Sus Wave 12",
      category: "Chord Pulse",
      description: "Sus2/sus4 alternati su 12 step, con inversioni leggere.",
      length: 12,
      steps: [chordStep(0,3,86,75,true,false,"sus2",0,"open",10,"balanced","0,3,7"), rest(0,3,90,75), chordStep(5,3,80,75,false,false,"sus4",1,"open",10,"balanced","0,3,7"), rest(5,3,90,75), chordStep(7,3,84,75,true,false,"sus2",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), chordStep(10,3,80,75,false,false,"sus4",1,"open",20,"balanced","0,3,7"), rest(10,3,90,75), chordStep(0,4,86,75,true,false,"sus2",0,"open",10,"balanced","0,3,7"), rest(0,4,90,75), chordStep(7,3,82,75,false,false,"sus4",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75)]
    },
    seqk_chord_major7_grid_16: {
      label: "Chord Pulse · Major7 Grid 16",
      category: "Chord Pulse",
      description: "Maj7 e sus alternati, più luminoso e stabile.",
      length: 16,
      steps: [chordStep(0,3,84,75,true,false,"maj7",0,"close",0,"natural","0,3,7"), rest(0,3,90,75), chordStep(5,3,78,75,false,false,"sus2",0,"open",10,"balanced","0,3,7"), rest(5,3,90,75), chordStep(7,3,82,75,true,false,"maj7",1,"open",20,"natural","0,3,7"), rest(7,3,90,75), chordStep(4,3,78,75,false,false,"sus4",0,"close",0,"balanced","0,3,7"), rest(4,3,90,75), chordStep(0,3,84,75,true,false,"maj7",0,"open",10,"natural","0,3,7"), rest(0,3,90,75), chordStep(9,3,78,75,false,false,"sus2",1,"open",20,"balanced","0,3,7"), rest(9,3,90,75), chordStep(7,3,82,75,true,false,"maj7",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), chordStep(5,3,78,75,false,false,"sus4",0,"open",10,"balanced","0,3,7"), rest(5,3,90,75)]
    },
    seqk_chord_power_stabs_8: {
      label: "Chord Pulse · Power Stabs 8",
      category: "Chord Pulse",
      description: "Stab di power chord compatti, utili per synth guitar e industrial.",
      length: 8,
      steps: [chordStep(0,3,94,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(7,3,86,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), chordStep(10,3,88,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(10,3,90,75), chordStep(3,3,86,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), rest(3,3,90,75), chordStep(0,3,94,75,true,false,"octave",0,"close",0,"balanced","0,3,7")]
    },
    seqk_chord_strum_short_16: {
      label: "Chord Pulse · Short Strum 16",
      category: "Chord Pulse",
      description: "Accordi brevi con strum contenuto per movimento senza accumulo.",
      length: 16,
      steps: [chordStep(0,3,84,75,true,false,"minor",0,"open",20,"balanced","0,3,7"), rest(0,3,90,75), chordStep(5,3,78,50,false,false,"sus2",0,"open",10,"balanced","0,3,7"), rest(5,3,90,75), chordStep(7,3,82,75,true,false,"minor",1,"open",30,"balanced","0,3,7"), rest(7,3,90,75), chordStep(10,3,78,50,false,false,"sus4",0,"open",10,"balanced","0,3,7"), rest(10,3,90,75), chordStep(0,4,84,75,true,false,"minor",0,"open",20,"balanced","0,3,7"), rest(0,4,90,75), chordStep(7,3,78,50,false,false,"sus2",1,"open",10,"balanced","0,3,7"), rest(7,3,90,75), chordStep(5,3,82,75,true,false,"minor",0,"open",30,"balanced","0,3,7"), rest(5,3,90,75), chordStep(10,3,78,50,false,false,"sus4",0,"open",10,"balanced","0,3,7"), rest(10,3,90,75)]
    },
    seqk_chord_inversion_walk_16: {
      label: "Chord Pulse · Inversion Walk 16",
      category: "Chord Pulse",
      description: "Progressione con inversioni 0/1/2, ora con ritmo più asimmetrico rispetto agli strum alternati.",
      length: 16,
      steps: [chordStep(0,3,84,75,true,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(3,3,80,75,false,false,"minor",1,"close",0,"balanced","0,3,7"), chordStep(5,3,78,50,false,false,"sus2",2,"open",10,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), chordStep(7,3,82,75,true,false,"minor",2,"open",20,"natural","0,3,7"), rest(7,3,90,75), chordStep(10,3,78,75,false,false,"min7",1,"open",20,"balanced","0,3,7"), rest(10,3,90,75), chordStep(0,4,84,75,true,false,"minor",0,"open",10,"balanced","0,3,7"), chordStep(7,3,80,50,false,false,"sus4",1,"open",20,"balanced","0,3,7"), rest(7,3,90,75), chordStep(5,3,82,75,true,false,"sus2",2,"close",0,"balanced","0,3,7"), rest(5,3,90,75), rest(10,3,90,75)]
    },
    seqk_chord_custom_fourths_12: {
      label: "Chord Pulse · Custom Fourths 12",
      category: "Chord Pulse",
      description: "Accordi custom a quarte, utili per colore moderno e non troppo maggiore/minore.",
      length: 12,
      steps: [chordStep(0,3,84,75,true,false,"custom",0,"open",10,"balanced","0,5,10"), rest(0,3,90,75), chordStep(5,3,78,75,false,false,"custom",1,"open",20,"balanced","0,5,10"), rest(5,3,90,75), chordStep(10,3,82,75,true,false,"custom",0,"wide",30,"softTop","0,5,10,15"), rest(10,3,90,75), chordStep(3,3,78,75,false,false,"custom",1,"open",20,"balanced","0,5,10"), rest(3,3,90,75), chordStep(0,4,84,75,true,false,"custom",0,"open",10,"balanced","0,5,10"), rest(0,4,90,75), chordStep(7,3,78,75,false,false,"custom",1,"open",20,"balanced","0,5,10"), rest(7,3,90,75)]
    },
    seqk_chord_gate_stack_24: {
      label: "Chord Pulse · Gate Stack 24",
      category: "Chord Pulse",
      description: "Sequenza lunga di accordi corti con micro-stutter e pause irregolari, meno simile ai pulse alternati 1/0.",
      length: 24,
      steps: [chordStep(0,3,86,50,true,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(7,3,78,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), chordStep(10,3,82,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(10,3,90,75), rest(10,3,90,75), chordStep(3,3,84,50,true,false,"minor",1,"open",20,"balanced","0,3,7"), rest(3,3,90,75), chordStep(10,3,78,50,false,false,"sus2",0,"close",0,"balanced","0,3,7"), chordStep(0,4,82,50,true,false,"minor",0,"open",20,"natural","0,3,7"), rest(0,4,90,75), chordStep(7,3,78,50,false,false,"sus4",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), chordStep(5,3,84,50,true,false,"minor",2,"open",30,"balanced","0,3,7"), rest(5,3,90,75), chordStep(10,3,78,50,false,false,"min7",1,"open",20,"softTop","0,3,7"), chordStep(0,3,84,50,true,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(7,3,78,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), chordStep(3,3,82,50,true,false,"minor",1,"open",10,"balanced","0,3,7"), rest(3,3,90,75), rest(3,3,90,75)]
    },
    seqk_ambient_tide_16: {
      label: "Ambient Motion · Tide 16",
      category: "Ambient Chord Motion",
      description: "Accordi larghi e pause, movimento lento per pad e droni morbidi.",
      length: 16,
      steps: [chordStep(0,3,74,100,false,true,"minor",0,"wide",60,"softTop","0,3,7"), chordStep(0,3,70,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), chordStep(5,3,72,100,false,true,"sus2",1,"wide",80,"softTop","0,3,7"), chordStep(5,3,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), chordStep(7,3,74,100,false,true,"min7",0,"wide",60,"natural","0,3,7"), chordStep(7,3,70,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), chordStep(3,3,72,100,false,false,"sus4",1,"wide",80,"softTop","0,3,7"), rest(3,3,90,75), rest(3,3,90,75), rest(3,3,90,75)]
    },
    seqk_ambient_open_fifths_8: {
      label: "Ambient Motion · Open Fifths 8",
      category: "Ambient Chord Motion",
      description: "Quinte aperte con molto spazio, sicure su quasi tutti i preset.",
      length: 8,
      steps: [chordStep(0,3,78,100,false,false,"power5",0,"wide",40,"balanced","0,3,7"), rest(0,3,90,75), chordStep(7,3,72,100,false,false,"power5",0,"wide",60,"balanced","0,3,7"), rest(7,3,90,75), chordStep(5,3,76,100,false,false,"power5",0,"wide",40,"balanced","0,3,7"), rest(5,3,90,75), chordStep(10,3,72,100,false,false,"power5",0,"wide",60,"balanced","0,3,7"), rest(10,3,90,75)]
    },
    seqk_ambient_glass_12: {
      label: "Ambient Motion · Glass 12",
      category: "Ambient Chord Motion",
      description: "Motion cristallina su 12 step con sus e maj7.",
      length: 12,
      steps: [chordStep(0,4,72,100,false,false,"maj7",0,"open",40,"softTop","0,3,7"), rest(0,4,90,75), step(7,4,64,75,false,false), rest(7,4,90,75), chordStep(5,4,70,100,false,false,"sus2",0,"open",50,"softTop","0,3,7"), rest(5,4,90,75), step(9,4,64,75,false,false), rest(9,4,90,75), chordStep(2,4,72,100,false,false,"maj7",1,"open",60,"softTop","0,3,7"), rest(2,4,90,75), step(7,4,64,75,false,false), rest(7,4,90,75)]
    },
    seqk_ambient_drift_24: {
      label: "Ambient Motion · Drift 24",
      category: "Ambient Chord Motion",
      description: "Pattern lungo con poche aperture armoniche e tie sicuri.",
      length: 24,
      steps: [chordStep(0,3,74,100,false,true,"minor",0,"wide",60,"softTop","0,3,7"), chordStep(0,3,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), step(7,3,64,75,false,false), rest(7,3,90,75), chordStep(5,3,72,100,false,true,"sus2",1,"wide",80,"balanced","0,3,7"), chordStep(5,3,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), step(9,3,64,75,false,false), rest(9,3,90,75), chordStep(7,3,74,100,false,true,"min7",0,"wide",60,"natural","0,3,7"), chordStep(7,3,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), step(3,3,64,75,false,false), rest(3,3,90,75), chordStep(10,3,72,100,false,false,"sus4",1,"wide",80,"balanced","0,3,7"), rest(10,3,90,75), rest(10,3,90,75), step(5,3,64,75,false,false), rest(5,3,90,75), rest(5,3,90,75)]
    },
    seqk_ambient_custom_cloud_16: {
      label: "Ambient Motion · Custom Cloud 16",
      category: "Ambient Chord Motion",
      description: "Accordi custom aperti per nuvole armoniche sintetiche.",
      length: 16,
      steps: [chordStep(0,3,72,100,false,false,"custom",0,"wide",80,"softTop","0,7,14"), rest(0,3,90,75), rest(0,3,90,75), step(7,3,62,75,false,false), chordStep(5,3,70,100,false,false,"custom",1,"wide",80,"softTop","0,5,10,15"), rest(5,3,90,75), rest(5,3,90,75), step(10,3,62,75,false,false), chordStep(3,3,72,100,false,false,"custom",0,"wide",60,"softTop","0,3,10,17"), rest(3,3,90,75), rest(3,3,90,75), step(7,3,62,75,false,false), chordStep(10,3,70,100,false,false,"custom",1,"wide",80,"softTop","0,5,10,15"), rest(10,3,90,75), rest(10,3,90,75), rest(10,3,90,75)]
    },
    seqk_ambient_min7_breath_32: {
      label: "Ambient Motion · Min7 Breath 32",
      category: "Ambient Chord Motion",
      description: "Respiri min7 su 32 step per stressare pattern lunghi e chord spread.",
      length: 32,
      steps: [chordStep(0,3,72,100,false,true,"min7",0,"wide",60,"natural","0,3,7"), chordStep(0,3,66,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), step(7,3,62,75,false,false), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), chordStep(5,3,70,100,false,true,"min7",1,"wide",80,"natural","0,3,7"), chordStep(5,3,66,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), step(10,3,62,75,false,false), rest(10,3,90,75), rest(10,3,90,75), rest(10,3,90,75), chordStep(3,3,72,100,false,true,"min7",0,"wide",60,"natural","0,3,7"), chordStep(3,3,66,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(3,3,90,75), rest(3,3,90,75), step(7,3,62,75,false,false), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), chordStep(10,3,70,100,false,false,"min7",1,"wide",80,"natural","0,3,7"), rest(10,3,90,75), rest(10,3,90,75), rest(10,3,90,75), step(5,3,62,75,false,false), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75)]
    },
    seqk_ambient_sparse_sus_16: {
      label: "Ambient Motion · Sparse Sus 16",
      category: "Ambient Chord Motion",
      description: "Pochi eventi sospesi, utile per suoni lunghi senza intasare.",
      length: 16,
      steps: [chordStep(0,3,74,100,false,false,"sus2",0,"wide",70,"softTop","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), chordStep(7,3,70,100,false,false,"sus4",1,"wide",80,"softTop","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), chordStep(5,3,72,100,false,false,"sus2",0,"wide",70,"softTop","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75), chordStep(10,3,70,100,false,false,"sus4",1,"wide",80,"softTop","0,3,7"), rest(10,3,90,75), rest(10,3,90,75), rest(10,3,90,75)]
    },
    seqk_ambient_reverse_breath_16: {
      label: "Ambient Motion · Reverse Breath 16",
      category: "Ambient Chord Motion",
      description: "Respiro discendente più asimmetrico: note fantasma prima degli accordi e maggiore spazio per riverberi lunghi.",
      length: 16,
      steps: [rest(0,4,90,75), step(10,3,62,75,false,false), chordStep(0,4,74,100,false,false,"minor",0,"wide",60,"balanced","0,3,7"), rest(0,4,90,75), rest(0,4,90,75), step(5,3,62,75,false,false), chordStep(7,3,72,100,false,false,"sus2",1,"wide",70,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), step(0,3,62,75,false,false), chordStep(3,3,70,100,false,false,"min7",0,"wide",80,"softTop","0,3,7"), rest(3,3,90,75), rest(3,3,90,75), chordStep(10,2,72,100,false,false,"sus4",1,"wide",80,"balanced","0,3,7"), step(7,2,60,75,false,false), rest(10,2,90,75)]
    },
    seqk_industrial_iron_16: {
      label: "Industrial · Iron 16",
      category: "Industrial / Dark",
      description: "Pattern duro con tritoni, pause e accenti forti.",
      length: 16,
      steps: [step(0,2,100,75,true,false), rest(0,2,90,75), step(1,2,82,50,false,false), step(6,2,92,50,true,false), rest(6,2,90,75), step(7,2,88,75,false,false), step(10,2,82,50,false,false), rest(10,2,90,75), step(0,3,100,75,true,false), rest(0,3,90,75), step(3,2,82,50,false,false), step(6,2,92,50,true,false), rest(6,2,90,75), step(7,2,88,75,false,false), step(10,2,82,50,false,false), rest(10,2,90,75)]
    },
    seqk_industrial_alarm_8: {
      label: "Industrial · Alarm 8",
      category: "Industrial / Dark",
      description: "Motivo d’allarme con semitono e tritono, breve e aggressivo.",
      length: 8,
      steps: [step(0,3,100,50,true,false), step(1,3,82,25,false,false), rest(1,3,90,75), step(6,3,94,50,true,false), step(7,3,82,25,false,false), rest(7,3,90,75), step(10,2,90,50,false,false), rest(10,2,90,75)]
    },
    seqk_industrial_stomp_16: {
      label: "Industrial · Stomp 16",
      category: "Industrial / Dark",
      description: "Stomp sincopato per preset noise/drive, senza chord densi.",
      length: 16,
      steps: [step(0,2,100,100,true,false), rest(0,2,90,75), rest(0,2,90,75), step(6,2,90,50,true,false), step(0,2,96,75,false,false), rest(0,2,90,75), step(1,2,82,50,false,false), rest(1,2,90,75), step(0,2,100,100,true,false), rest(0,2,90,75), step(10,2,84,50,false,false), step(6,2,92,50,true,false), rest(6,2,90,75), step(7,2,88,75,false,false), rest(7,2,90,75), step(0,3,94,75,true,false)]
    },
    seqk_industrial_tritone_8: {
      label: "Industrial · Tritone 8",
      category: "Industrial / Dark",
      description: "Tritoni e quinte sporche, utile per timbri metallici.",
      length: 8,
      steps: [chordStep(0,2,96,50,true,false,"custom",0,"close",0,"balanced","0,6"), rest(0,2,90,75), step(6,2,90,50,false,false), rest(6,2,90,75), chordStep(1,2,94,50,true,false,"custom",0,"close",0,"balanced","0,6,10"), rest(1,2,90,75), step(7,2,86,50,false,false), rest(7,2,90,75)]
    },
    seqk_industrial_machine_16: {
      label: "Industrial · Machine 16",
      category: "Industrial / Dark",
      description: "Pattern meccanico con cellule ripetute e pause.",
      length: 16,
      steps: [step(0,2,98,50,true,false), step(0,2,78,25,false,false), rest(0,2,90,75), step(6,2,90,50,false,false), step(0,2,96,50,true,false), step(0,2,78,25,false,false), rest(0,2,90,75), step(10,2,84,50,false,false), step(3,2,94,50,true,false), step(3,2,76,25,false,false), rest(3,2,90,75), step(6,2,90,50,false,false), step(0,2,98,50,true,false), rest(0,2,90,75), step(7,2,86,50,false,false), rest(7,2,90,75)]
    },
    seqk_industrial_crush_12: {
      label: "Industrial · Crush 12",
      category: "Industrial / Dark",
      description: "Dodici step pesanti per groove instabile ma leggibile.",
      length: 12,
      steps: [step(0,2,100,75,true,false), rest(0,2,90,75), step(6,2,90,50,true,false), step(7,2,82,50,false,false), rest(7,2,90,75), step(1,2,86,50,false,false), step(0,3,96,75,true,false), rest(0,3,90,75), step(10,2,84,50,false,false), step(6,2,92,50,true,false), rest(6,2,90,75), step(3,2,86,50,false,false)]
    },
    seqk_industrial_dark_chord_16: {
      label: "Industrial · Dark Chord 16",
      category: "Industrial / Dark",
      description: "Power/dim chord brevi per suoni estremi, con strum minimo.",
      length: 16,
      steps: [chordStep(0,2,92,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(0,2,90,75), chordStep(6,2,86,50,true,false,"dim",0,"close",5,"balanced","0,3,7"), rest(6,2,90,75), step(1,2,82,50,false,false), rest(1,2,90,75), chordStep(10,2,86,50,false,false,"minor",0,"close",5,"balanced","0,3,7"), rest(10,2,90,75), chordStep(0,3,92,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), chordStep(6,2,86,50,true,false,"dim",0,"close",5,"balanced","0,3,7"), rest(6,2,90,75), step(7,2,82,50,false,false), rest(7,2,90,75), chordStep(3,2,86,50,false,false,"minor",0,"close",5,"balanced","0,3,7"), rest(3,2,90,75)]
    },
    seqk_industrial_hammer_32: {
      label: "Industrial · Hammer 32",
      category: "Industrial / Dark",
      description: "Stress pattern a 32 step: accenti, pause e note basse senza tie rischiosi.",
      length: 32,
      steps: [step(0,2,100,75,true,false), rest(0,2,90,75), step(6,2,90,50,true,false), rest(6,2,90,75), step(0,2,96,50,false,false), step(1,2,78,25,false,false), rest(1,2,90,75), step(7,2,86,50,false,false), step(0,2,100,75,true,false), rest(0,2,90,75), step(10,2,84,50,false,false), step(6,2,90,50,true,false), rest(6,2,90,75), step(3,2,82,50,false,false), rest(3,2,90,75), step(0,3,94,75,true,false), step(0,2,100,75,true,false), rest(0,2,90,75), step(6,2,90,50,true,false), rest(6,2,90,75), step(0,2,96,50,false,false), step(1,2,78,25,false,false), rest(1,2,90,75), step(10,2,86,50,false,false), step(0,2,100,75,true,false), rest(0,2,90,75), step(7,2,84,50,false,false), step(6,2,90,50,true,false), rest(6,2,90,75), step(3,2,82,50,false,false), rest(3,2,90,75), step(0,3,94,75,true,false)]
    },
    seqk_odd_five_pulse_5: {
      label: "Odd · Five Pulse 5",
      category: "Odd Length / Polymeter",
      description: "Loop a 5 step con accenti naturali sopra griglie pari.",
      length: 5,
      steps: [step(0,3,96,100,true,false), step(7,3,78,50,false,false), step(10,3,86,75,false,false), step(3,4,78,50,false,false), step(0,4,92,75,true,false)]
    },
    seqk_odd_seven_ladder_7: {
      label: "Odd · Seven Ladder 7",
      category: "Odd Length / Polymeter",
      description: "Scala a 7 step per movimento ipnotico e non periodico.",
      length: 7,
      steps: [step(0,3,96,75,true,false), step(3,3,78,50,false,false), step(7,3,86,75,false,false), step(10,3,80,50,false,false), step(2,4,90,75,true,false), step(7,3,78,50,false,false), step(3,3,84,50,false,false)]
    },
    seqk_odd_nine_chord_9: {
      label: "Odd · Nine Chord 9",
      category: "Odd Length / Polymeter",
      description: "Nove step con chord pulse moderato e pause.",
      length: 9,
      steps: [chordStep(0,3,84,75,true,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,3,90,75), step(7,3,78,50,false,false), chordStep(10,3,80,75,false,false,"sus2",0,"close",0,"balanced","0,3,7"), rest(10,3,90,75), step(3,3,78,50,false,false), chordStep(7,3,84,75,true,false,"power5",0,"close",0,"balanced","0,3,7"), rest(7,3,90,75), step(0,4,88,75,false,false)]
    },
    seqk_odd_eleven_shadow_11: {
      label: "Odd · Eleven Shadow 11",
      category: "Odd Length / Polymeter",
      description: "Pattern scuro a 11 step con pause controllate.",
      length: 11,
      steps: [step(0,2,98,75,true,false), rest(0,2,90,75), step(6,2,84,50,false,false), step(10,2,88,75,false,false), step(0,3,94,75,true,false), step(3,3,78,50,false,false), rest(3,3,90,75), step(7,2,88,75,false,false), step(1,3,82,50,false,false), step(10,2,86,75,false,false), rest(10,2,90,75)]
    },
    seqk_odd_thirteen_bloom_13: {
      label: "Odd · Thirteen Bloom 13",
      category: "Odd Length / Polymeter",
      description: "Tredici step con accenti e salto finale, adatto a sequenze evolutive.",
      length: 13,
      steps: [step(0,3,96,75,true,false), step(2,3,78,50,false,false), step(5,3,84,75,false,false), rest(5,3,90,75), step(7,3,90,75,true,false), step(10,3,78,50,false,false), step(0,4,86,75,false,false), rest(0,4,90,75), step(3,4,88,75,true,false), step(2,4,78,50,false,false), step(10,3,84,75,false,false), step(7,3,80,50,false,false), step(0,3,92,75,true,false)]
    },
    seqk_odd_fifteen_acid_15: {
      label: "Odd · Fifteen Acid 15",
      category: "Odd Length / Polymeter",
      description: "Quindici step acid-friendly con gate corti.",
      length: 15,
      steps: [step(0,2,98,50,true,false), step(0,2,76,25,false,false), step(3,2,84,50,false,false), rest(3,2,90,75), step(7,2,96,50,true,false), step(10,2,76,25,false,false), step(7,2,84,50,false,false), rest(7,2,90,75), step(0,3,98,50,true,false), step(10,2,76,25,false,false), step(7,2,86,50,false,false), step(3,2,76,25,false,false), step(0,2,98,50,true,false), rest(0,2,90,75), step(7,2,86,50,false,false)]
    },
    seqk_odd_seventeen_rail_17: {
      label: "Odd · Seventeen Rail 17",
      category: "Odd Length / Polymeter",
      description: "Diciassette step per testare selector non binari e loop lunghi.",
      length: 17,
      steps: [step(0,3,96,75,true,false), step(7,3,78,50,false,false), step(10,3,84,75,false,false), step(0,4,80,50,false,false), step(3,4,90,75,true,false), step(0,4,78,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(5,3,90,75,true,false), step(0,4,78,50,false,false), step(7,3,84,75,false,false), step(2,4,80,50,false,false), step(0,3,96,75,true,false), step(7,3,78,50,false,false), step(10,3,84,75,false,false), rest(10,3,90,75), step(0,3,92,75,false,false)]
    },
    seqk_odd_twenty_three_cloud_23: {
      label: "Odd · Twenty Three Cloud 23",
      category: "Odd Length / Polymeter",
      description: "Pattern dispari lungo con alcuni accordi aperti e pause.",
      length: 23,
      steps: [chordStep(0,3,78,100,false,false,"sus2",0,"open",30,"balanced","0,3,7"), rest(0,3,90,75), step(7,3,70,75,false,false), rest(7,3,90,75), chordStep(5,3,76,100,false,false,"minor",1,"open",30,"balanced","0,3,7"), rest(5,3,90,75), step(10,3,70,75,false,false), rest(10,3,90,75), chordStep(7,3,78,100,false,false,"min7",0,"open",40,"balanced","0,3,7"), rest(7,3,90,75), step(3,3,70,75,false,false), rest(3,3,90,75), chordStep(10,3,76,100,false,false,"sus4",1,"open",40,"balanced","0,3,7"), rest(10,3,90,75), step(5,3,70,75,false,false), rest(5,3,90,75), chordStep(0,4,78,100,false,false,"sus2",0,"open",30,"balanced","0,3,7"), rest(0,4,90,75), step(7,3,70,75,false,false), rest(7,3,90,75), chordStep(5,3,76,100,false,false,"minor",1,"open",30,"balanced","0,3,7"), rest(5,3,90,75), step(0,3,72,75,false,false)]
    },
    seqk_chip_hero_8: {
      label: "Chiptune · Hero 8",
      category: "Chiptune / Digital",
      description: "Arpeggio brillante semplice, sicuro con onde square/pulse.",
      length: 8,
      steps: [step(0,4,96,50,true,false), step(4,4,82,25,false,false), step(7,4,88,50,false,false), step(0,5,82,25,false,false), step(7,4,92,50,true,false), step(4,4,82,25,false,false), step(0,4,88,50,false,false), step(7,3,82,25,false,false)]
    },
    seqk_chip_bounce_16: {
      label: "Chiptune · Bounce 16",
      category: "Chiptune / Digital",
      description: "Rimbalzo digitale con ottave e gate rapidi.",
      length: 16,
      steps: [step(0,4,96,50,true,false), step(0,5,76,25,false,false), step(7,4,88,50,false,false), step(0,5,76,25,false,false), step(4,4,92,50,true,false), step(4,5,76,25,false,false), step(7,4,88,50,false,false), rest(7,4,90,75), step(0,4,96,50,true,false), step(0,5,76,25,false,false), step(9,4,88,50,false,false), step(0,5,76,25,false,false), step(5,4,92,50,true,false), step(5,5,76,25,false,false), step(7,4,88,50,false,false), rest(7,4,90,75)]
    },
    seqk_chip_miniboss_16: {
      label: "Chiptune · Miniboss 16",
      category: "Chiptune / Digital",
      description: "Linea minore rapida con seconda metà variata, salti di ottava e una pausa di respiro finale.",
      length: 16,
      steps: [step(0,4,98,50,true,false), step(3,4,80,25,false,false), step(7,4,88,50,false,false), step(0,5,80,25,false,false), step(10,4,92,50,true,false), step(7,4,80,25,false,false), step(3,4,88,50,false,false), step(0,4,80,25,false,false), step(5,4,96,50,true,false), step(8,4,80,25,false,false), step(0,5,88,50,false,false), step(3,5,78,25,false,false), step(10,4,92,50,true,false), rest(10,4,90,75), step(7,4,86,25,false,false), rest(0,4,90,75)]
    },
    seqk_chip_power_8: {
      label: "Chiptune · Power 8",
      category: "Chiptune / Digital",
      description: "Power chord digitali brevi, buoni per lead retro.",
      length: 8,
      steps: [chordStep(0,4,90,50,true,false,"power5",0,"close",0,"balanced","0,3,7"), step(7,4,78,25,false,false), chordStep(3,4,86,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,4,78,25,false,false), chordStep(0,5,90,50,true,false,"octave",0,"close",0,"balanced","0,3,7"), step(7,4,78,25,false,false), chordStep(10,4,86,50,false,false,"power5",0,"close",0,"balanced","0,3,7"), rest(10,4,90,75)]
    },
    seqk_chip_coin_8: {
      label: "Chiptune · Coin 8",
      category: "Chiptune / Digital",
      description: "Pattern brevissimo e luminoso per pluck/key digitali.",
      length: 8,
      steps: [step(0,5,94,25,true,false), rest(0,5,90,75), step(7,5,86,25,false,false), rest(7,5,90,75), step(0,6,92,25,true,false), step(7,5,78,25,false,false), step(4,5,84,25,false,false), rest(4,5,90,75)]
    },
    seqk_chip_glitch_12: {
      label: "Chiptune · Glitch 12",
      category: "Chiptune / Digital",
      description: "Dodici step spezzati per timbri digitali e ring/FM leggeri.",
      length: 12,
      steps: [step(0,4,96,25,true,false), step(11,4,78,25,false,false), rest(11,4,90,75), step(7,4,88,50,false,false), step(1,5,78,25,false,false), rest(1,5,90,75), step(6,4,90,25,true,false), step(0,5,78,25,false,false), rest(0,5,90,75), step(10,4,86,50,false,false), step(3,5,78,25,false,false), rest(3,5,90,75)]
    },
    seqk_minimal_two_note_8: {
      label: "Minimal · Two Note 8",
      category: "Minimal / Sparse",
      description: "Due note e molto spazio, utile per testare timbri senza movimento eccessivo.",
      length: 8,
      steps: [step(0,3,88,100,true,false), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), step(7,3,82,100,false,false), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75)]
    },
    seqk_minimal_pulse_12: {
      label: "Minimal · Pulse 12",
      category: "Minimal / Sparse",
      description: "Pulsazione essenziale a 12 step con accenti radi.",
      length: 12,
      steps: [step(0,3,90,75,true,false), rest(0,3,90,75), rest(0,3,90,75), step(7,3,80,75,false,false), rest(7,3,90,75), rest(7,3,90,75), step(5,3,86,75,true,false), rest(5,3,90,75), rest(5,3,90,75), step(10,3,80,75,false,false), rest(10,3,90,75), rest(10,3,90,75)]
    },
    seqk_minimal_tie_breath_16: {
      label: "Minimal · Tie Breath 16",
      category: "Minimal / Sparse",
      description: "Poche note con tie sicuri per verificare code e release.",
      length: 16,
      steps: [step(0,3,88,100,false,true), step(0,3,72,100,false,false), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), step(7,3,82,100,false,true), step(7,3,70,100,false,false), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), step(5,3,84,100,false,false), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75)]
    },
    seqk_minimal_sparse_chord_16: {
      label: "Minimal · Sparse Chord 16",
      category: "Minimal / Sparse",
      description: "Pochi accordi aperti per pad senza saturare il motore.",
      length: 16,
      steps: [chordStep(0,3,76,100,false,false,"sus2",0,"open",50,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), chordStep(7,3,72,100,false,false,"power5",0,"wide",40,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75), chordStep(5,3,74,100,false,false,"sus4",0,"open",50,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75)]
    },
    seqk_minimal_offbeat_8: {
      label: "Minimal · Offbeat 8",
      category: "Minimal / Sparse",
      description: "Solo pochi offbeat, utile per groove leggerissimi.",
      length: 8,
      steps: [rest(0,3,90,75), step(0,3,86,75,false,false), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), step(7,3,80,75,false,false), rest(7,3,90,75), rest(7,3,90,75)]
    },
    seqk_minimal_odd_space_11: {
      label: "Minimal · Odd Space 11",
      category: "Minimal / Sparse",
      description: "Minimalismo dispari a 11 step con spazi irregolari, ora più distinto dal Two Note 8.",
      length: 11,
      steps: [step(0,3,88,100,true,false), rest(0,3,90,75), rest(0,3,90,75), step(5,3,78,75,false,false), rest(5,3,90,75), rest(5,3,90,75), step(10,2,82,100,false,false), rest(10,2,90,75), step(2,4,74,75,false,false), rest(2,4,90,75), rest(2,4,90,75)]
    },
    seqk_cinematic_shadow_16: {
      label: "Cinematic · Shadow 16",
      category: "Cinematic Motion",
      description: "Progressione scura con min7, sus e strum moderato.",
      length: 16,
      steps: [chordStep(0,3,78,100,false,false,"min7",0,"wide",60,"natural","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), step(7,3,68,75,false,false), chordStep(10,2,76,100,false,false,"sus4",1,"wide",70,"softTop","0,3,7"), rest(10,2,90,75), rest(10,2,90,75), step(5,3,68,75,false,false), chordStep(3,3,78,100,false,false,"minor",0,"wide",60,"balanced","0,3,7"), rest(3,3,90,75), rest(3,3,90,75), step(7,3,68,75,false,false), chordStep(5,3,76,100,false,false,"sus2",1,"wide",70,"balanced","0,3,7"), rest(5,3,90,75), rest(5,3,90,75), rest(5,3,90,75)]
    },
    seqk_cinematic_rise_24: {
      label: "Cinematic · Rise 24",
      category: "Cinematic Motion",
      description: "Lenta ascesa armonica con aperture crescenti.",
      length: 24,
      steps: [chordStep(0,3,72,100,false,false,"minor",0,"open",40,"balanced","0,3,7"), rest(0,3,90,75), step(7,3,64,75,false,false), rest(7,3,90,75), chordStep(3,3,74,100,false,false,"minor",1,"open",50,"balanced","0,3,7"), rest(3,3,90,75), step(10,3,64,75,false,false), rest(10,3,90,75), chordStep(5,3,76,100,false,false,"sus2",1,"wide",60,"balanced","0,3,7"), rest(5,3,90,75), step(0,4,64,75,false,false), rest(0,4,90,75), chordStep(7,3,78,100,false,false,"min7",0,"wide",70,"balanced","0,3,7"), rest(7,3,90,75), step(2,4,64,75,false,false), rest(2,4,90,75), chordStep(10,3,80,100,false,false,"sus4",1,"wide",80,"balanced","0,3,7"), rest(10,3,90,75), step(5,4,64,75,false,false), rest(5,4,90,75), chordStep(0,4,82,100,false,false,"min7",0,"wide",80,"balanced","0,3,7"), rest(0,4,90,75), rest(0,4,90,75), rest(0,4,90,75)]
    },
    seqk_cinematic_custom_tension_12: {
      label: "Cinematic · Custom Tension 12",
      category: "Cinematic Motion",
      description: "Accordi custom tesi con ritmo meno quadrato: utile per colonne sonore sintetiche e dark ambient.",
      length: 12,
      steps: [chordStep(0,3,76,100,false,false,"custom",0,"wide",60,"softTop","0,3,8,15"), rest(0,3,90,75), step(7,3,64,75,false,false), chordStep(6,3,74,100,false,false,"custom",1,"wide",70,"softTop","0,1,7,13"), rest(6,3,90,75), rest(6,3,90,75), chordStep(3,3,76,100,false,false,"custom",0,"wide",60,"softTop","0,3,8,15"), step(10,3,64,75,false,false), rest(10,3,90,75), chordStep(1,3,72,100,false,false,"custom",1,"wide",80,"softTop","0,2,6,14"), rest(1,3,90,75), rest(1,3,90,75)]
    },
    seqk_cinematic_drone_gate_8: {
      label: "Cinematic · Drone Gate 8",
      category: "Cinematic Motion",
      description: "Gate larghi per droni ritmici senza sequenze troppo fitte.",
      length: 8,
      steps: [chordStep(0,2,78,100,false,true,"power5",0,"wide",40,"balanced","0,3,7"), chordStep(0,2,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(0,2,90,75), rest(0,2,90,75), chordStep(10,2,76,100,false,true,"minor",0,"wide",60,"balanced","0,3,7"), chordStep(10,2,68,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), rest(10,2,90,75), rest(10,2,90,75)]
    },
    seqk_cinematic_low_strings_16: {
      label: "Cinematic · Low Strings 16",
      category: "Cinematic Motion",
      description: "Accordi bassi evocativi, utili su pad/string sintetici.",
      length: 16,
      steps: [chordStep(0,2,76,100,false,false,"minor",0,"open",50,"balanced","0,3,7"), rest(0,2,90,75), rest(0,2,90,75), rest(0,2,90,75), chordStep(5,2,74,100,false,false,"sus2",1,"open",60,"balanced","0,3,7"), rest(5,2,90,75), rest(5,2,90,75), rest(5,2,90,75), chordStep(7,2,76,100,false,false,"min7",0,"open",50,"balanced","0,3,7"), rest(7,2,90,75), rest(7,2,90,75), rest(7,2,90,75), chordStep(3,2,74,100,false,false,"sus4",1,"open",60,"balanced","0,3,7"), rest(3,2,90,75), rest(3,2,90,75), rest(3,2,90,75)]
    },
    seqk_cinematic_finale_32: {
      label: "Cinematic · Finale 32",
      category: "Cinematic Motion",
      description: "Finale lungo a 32 step con seconda metà più densa e climax controllato, meno simile allo Shadow 16.",
      length: 32,
      steps: [chordStep(0,3,72,100,false,false,"minor",0,"open",40,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75), step(7,3,64,75,false,false), chordStep(3,3,74,100,false,false,"minor",1,"open",50,"balanced","0,3,7"), rest(3,3,90,75), rest(3,3,90,75), step(10,3,64,75,false,false), chordStep(5,3,76,100,false,false,"sus2",1,"wide",60,"balanced","0,3,7"), rest(5,3,90,75), step(0,4,64,75,false,false), rest(5,3,90,75), chordStep(7,3,78,100,false,false,"min7",0,"wide",70,"balanced","0,3,7"), rest(7,3,90,75), step(2,4,64,75,false,false), rest(7,3,90,75), chordStep(10,3,80,100,false,false,"sus4",1,"wide",80,"balanced","0,3,7"), step(5,4,64,75,false,false), rest(10,3,90,75), chordStep(0,4,82,100,false,false,"min7",0,"wide",80,"softTop","0,3,7"), rest(0,4,90,75), chordStep(2,4,78,75,false,false,"power5",0,"open",20,"balanced","0,3,7"), step(7,4,64,75,false,false), rest(7,4,90,75), chordStep(5,4,80,100,false,false,"sus2",1,"wide",80,"balanced","0,3,7"), step(0,5,64,75,false,false), rest(5,4,90,75), chordStep(10,4,78,100,false,false,"min7",1,"wide",90,"softTop","0,3,7"), rest(10,4,90,75), chordStep(0,3,78,100,false,false,"minor",0,"wide",60,"balanced","0,3,7"), rest(0,3,90,75), rest(0,3,90,75)]
    },
    seqk_perf_32_all_fields: {
      label: "Performance Test · 32 All Fields",
      category: "Performance Test",
      description: "Copre 32 step, chord, custom, inversion, spread, strum, velocity e gate.",
      length: 32,
      steps: [chordStep(0,3,90,75,true,false,"minor",0,"close",0,"balanced","0,3,7"), step(3,3,76,50,false,false), chordStep(7,3,84,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,3,76,50,false,false), chordStep(0,4,88,75,true,false,"sus2",1,"open",20,"balanced","0,3,7"), rest(0,4,90,75), chordStep(5,3,82,75,false,false,"custom",0,"open",30,"balanced","0,5,10"), step(7,3,76,50,false,false), chordStep(10,3,86,75,true,false,"min7",1,"wide",40,"natural","0,3,7"), rest(10,3,90,75), step(3,4,76,50,false,false), chordStep(7,3,82,75,false,false,"sus4",2,"open",20,"balanced","0,3,7"), step(0,3,90,75,true,false), rest(0,3,90,75), chordStep(6,3,84,75,false,false,"dim",0,"close",5,"balanced","0,3,7"), step(7,3,76,50,false,false), chordStep(0,3,90,75,true,false,"minor",0,"close",0,"balanced","0,3,7"), step(3,3,76,50,false,false), chordStep(7,3,84,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,3,76,50,false,false), chordStep(0,4,88,75,true,false,"sus2",1,"open",20,"balanced","0,3,7"), rest(0,4,90,75), chordStep(5,3,82,75,false,false,"custom",0,"open",30,"balanced","0,5,10"), step(7,3,76,50,false,false), chordStep(10,3,86,75,true,false,"min7",1,"wide",40,"natural","0,3,7"), rest(10,3,90,75), step(3,4,76,50,false,false), chordStep(7,3,82,75,false,false,"sus4",2,"open",20,"balanced","0,3,7"), step(0,3,90,75,true,false), rest(0,3,90,75), chordStep(6,3,84,75,false,false,"dim",0,"close",5,"balanced","0,3,7"), rest(6,3,90,75)]
    },
    seqk_perf_tie_guard_16: {
      label: "Performance Test · Tie Guard 16",
      category: "Performance Test",
      description: "Testa tie sicuri senza tie prima di pause/fine pattern.",
      length: 16,
      steps: [step(0,3,88,100,false,true), step(0,3,72,100,false,false), step(3,3,80,75,false,false), rest(3,3,90,75), step(7,3,88,100,false,true), step(7,3,72,100,false,false), step(10,3,80,75,false,false), rest(10,3,90,75), chordStep(0,4,84,100,false,true,"minor",0,"close",0,"balanced","0,3,7"), chordStep(0,4,70,100,false,false,"minor",0,"close",0,"balanced","0,3,7"), step(7,3,80,75,false,false), rest(7,3,90,75), chordStep(5,3,84,100,false,false,"sus2",0,"close",0,"balanced","0,3,7"), rest(5,3,90,75), step(10,3,80,75,false,false), rest(10,3,90,75)]
    },
    seqk_perf_gate_velocity_16: {
      label: "Performance Test · Gate Velocity 16",
      category: "Performance Test",
      description: "Verifica tutti i gate disponibili e variazioni velocity.",
      length: 16,
      steps: [step(0,3,60,25,true,false), step(2,3,70,50,false,false), step(3,3,80,75,false,false), step(5,3,90,100,false,false), step(7,3,62,25,true,false), step(8,3,72,50,false,false), step(10,3,82,75,false,false), step(0,4,92,100,false,false), step(0,3,64,25,true,false), step(2,3,74,50,false,false), step(3,3,84,75,false,false), step(5,3,94,100,false,false), step(7,3,66,25,true,false), step(8,3,76,50,false,false), step(10,3,86,75,false,false), step(0,4,96,100,false,false)]
    },
    seqk_perf_chord_motion_12: {
      label: "Performance Test · Chord Motion 12",
      category: "Performance Test",
      description: "Verifica chord type, inversioni, spread, strum e velocity modes.",
      length: 12,
      steps: [chordStep(0,3,82,75,true,false,"major",0,"close",0,"balanced","0,3,7"), chordStep(2,3,78,75,false,false,"minor",1,"close",10,"flat","0,3,7"), chordStep(4,3,76,75,false,false,"sus2",2,"open",20,"natural","0,3,7"), chordStep(5,3,78,75,true,false,"sus4",0,"open",30,"softTop","0,3,7"), chordStep(7,3,80,75,false,false,"maj7",1,"wide",40,"natural","0,3,7"), chordStep(9,3,76,75,false,false,"min7",2,"wide",50,"softTop","0,3,7"), chordStep(10,3,78,75,true,false,"dom7",1,"open",30,"balanced","0,3,7"), chordStep(0,4,82,75,false,false,"dim",0,"close",10,"flat","0,3,7"), chordStep(3,4,78,75,false,false,"aug",0,"open",20,"balanced","0,3,7"), chordStep(5,4,76,75,true,false,"custom",1,"wide",40,"softTop","0,5,10,15"), chordStep(7,4,78,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), rest(7,4,90,75)]
    },
    seqk_perf_odd_lengths_17: {
      label: "Performance Test · Odd Length 17",
      category: "Performance Test",
      description: "Controllo lunghezza dispari e cleanup degli step fuori pattern.",
      length: 17,
      steps: [step(0,3,90,75,true,false), step(2,3,70,50,false,false), rest(2,3,90,75), step(3,3,80,75,false,false), step(7,3,86,50,true,false), rest(7,3,90,75), step(10,3,78,75,false,false), step(0,4,82,50,false,false), chordStep(3,4,80,75,true,false,"minor",1,"open",20,"balanced","0,3,7"), rest(3,4,90,75), step(7,3,78,50,false,false), step(10,3,80,75,false,false), rest(10,3,90,75), chordStep(0,3,84,75,true,false,"sus2",0,"open",20,"balanced","0,3,7"), step(7,3,78,50,false,false), rest(7,3,90,75), step(0,3,88,75,false,false)]
    },
    seqk_perf_sparse_vs_dense_24: {
      label: "Performance Test · Sparse Dense 24",
      category: "Performance Test",
      description: "Alterna zone vuote e dense per verificare preview e contatori.",
      length: 24,
      steps: [step(0,3,90,75,true,false), rest(0,3,90,75), rest(0,3,90,75), rest(0,3,90,75), chordStep(7,3,82,75,false,false,"power5",0,"close",0,"balanced","0,3,7"), step(10,3,70,50,false,false), step(0,4,78,75,false,false), rest(0,4,90,75), rest(0,4,90,75), step(3,3,88,75,true,false), step(5,3,70,50,false,false), chordStep(7,3,80,75,false,false,"minor",0,"close",0,"balanced","0,3,7"), step(10,3,70,50,false,false), rest(10,3,90,75), rest(10,3,90,75), rest(10,3,90,75), step(0,3,90,75,true,false), step(2,3,70,50,false,false), step(3,3,78,75,false,false), step(5,3,70,50,false,false), chordStep(7,3,82,75,true,false,"sus2",0,"open",20,"balanced","0,3,7"), rest(7,3,90,75), rest(7,3,90,75), rest(7,3,90,75)]
    },

    // Legacy ids kept as aliases for preset/browser compatibility.
    default_ascending_8: {
      label: "Default melodico 8",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio pattern default.",
      length: 8,
      steps: DEFAULT_PATTERN.slice(0, 8)
    },
    minor_shadow_8: {
      label: "Minore scuro 8",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio pattern minore.",
      length: 8,
      steps: [step(0,4), step(3,4), step(7,4), step(10,4), step(7,4), step(3,4), step(0,4), rest(0,4)]
    },
    bass_pulse_8: {
      label: "Bass pulse 8",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio bass pulse.",
      length: 8,
      steps: [step(0,3), step(0,3), rest(0,3), step(7,2), step(0,3), rest(0,3), step(10,2), step(7,2)]
    },
    organ_walk_8: {
      label: "Organ walk 8",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio organ walk.",
      length: 8,
      steps: [step(0,4), step(4,4), step(7,4), step(11,4), step(0,5), step(11,4), step(7,4), step(4,4)]
    },
    pad_breath_16: {
      label: "Pad breath 16",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio pad breath.",
      length: 16,
      steps: [step(0,4), rest(0,4), step(7,4), rest(7,4), step(9,4), rest(9,4), step(4,4), rest(4,4), step(5,4), rest(5,4), step(0,5), rest(0,5), step(7,4), rest(7,4), step(0,4), rest(0,4)]
    },
    industrial_16: {
      label: "Industrial 16",
      category: "Legacy / Compat",
      description: "Alias compatibile del vecchio industrial 16.",
      length: 16,
      steps: [step(0,2), rest(0,2), step(1,2), rest(1,2), step(7,2), step(0,3), rest(0,3), step(10,2), step(0,2), rest(0,2), step(3,2), rest(3,2), step(7,2), rest(7,2), step(10,2), step(0,3)]
    }
  });
  const RANDOM_SAFE_SCALE = Object.freeze([0, 2, 3, 5, 7, 8, 10]);

  const RANDOMIZER_DENSITY_PROFILES = Object.freeze({
    sparse: { activeDelta: -0.18, chordMul: 0.65, tieMul: 0.60, accentMul: 0.75, label: "Sparse" },
    balanced: { activeDelta: 0, chordMul: 1, tieMul: 1, accentMul: 1, label: "Balanced" },
    dense: { activeDelta: 0.12, chordMul: 1.18, tieMul: 1.15, accentMul: 1.15, label: "Dense" },
    wild: { activeDelta: 0.18, chordMul: 1.45, tieMul: 1.25, accentMul: 1.30, label: "Wild Safe" }
  });

  const SEQUENCER_RANDOMIZER_PROFILES = Object.freeze({
    safe: { label: "Safe Musical", lengths: [8, 12, 16], scale: [0, 2, 3, 5, 7, 8, 10], baseOctave: 3, active: 0.72, chord: 0.14, tie: 0.08, accent: 0.22, gates: [50, 75, 100], chords: ["off", "off", "power5", "octave", "minor", "sus2"], spread: ["close", "open"], strum: [0, 0, 10, 20], velocity: [78, 112], custom: ["0,4,7", "0,3,7", "0,5,10"], jump: 0.22 },
    bassline: { label: "Bassline", lengths: [8, 16], scale: [0, 2, 3, 5, 7, 10], baseOctave: 2, active: 0.74, chord: 0.06, tie: 0.07, accent: 0.32, gates: [25, 50, 75], chords: ["off", "off", "off", "power5", "octave"], spread: ["close"], strum: [0, 0, 5], velocity: [82, 118], custom: ["0,7", "0,12"], jump: 0.16 },
    acid: { label: "Acid", lengths: [8, 12, 16], scale: [0, 1, 3, 5, 7, 10], baseOctave: 2, active: 0.78, chord: 0.04, tie: 0.16, accent: 0.40, gates: [25, 50, 50, 75], chords: ["off", "off", "off", "octave"], spread: ["close"], strum: [0], velocity: [76, 120], custom: ["0,12"], jump: 0.12 },
    berlin: { label: "Berlin School", lengths: [8, 12, 16, 24, 32], scale: [0, 2, 3, 5, 7, 9, 10], baseOctave: 3, active: 0.82, chord: 0.08, tie: 0.04, accent: 0.26, gates: [50, 75, 75, 100], chords: ["off", "off", "octave", "power5", "minor"], spread: ["close", "open"], strum: [0, 0, 10], velocity: [78, 112], custom: ["0,3,7", "0,7,12"], jump: 0.34 },
    chord_pulse: { label: "Chord Pulse", lengths: [4, 8, 12, 16], scale: [0, 2, 4, 5, 7, 9, 10], baseOctave: 3, active: 0.66, chord: 0.62, tie: 0.06, accent: 0.24, gates: [50, 75, 100], chords: ["major", "minor", "sus2", "sus4", "power5", "maj7", "min7"], spread: ["close", "open"], strum: [0, 10, 20, 30, 40], velocity: [68, 106], custom: ["0,4,7", "0,3,7", "0,5,10", "0,7,12"], jump: 0.14 },
    ambient: { label: "Ambient Motion", lengths: [8, 12, 16, 24, 32], scale: [0, 2, 4, 5, 7, 9, 11], baseOctave: 3, active: 0.42, chord: 0.58, tie: 0.18, accent: 0.10, gates: [75, 100, 100], chords: ["major", "minor", "sus2", "sus4", "maj7", "min7", "custom"], spread: ["open", "wide", "close"], strum: [10, 20, 30, 40, 60, 80], velocity: [56, 96], custom: ["0,7,14", "0,5,10", "0,4,9,14", "0,3,10,17"], jump: 0.24 },
    industrial: { label: "Industrial / Dark", lengths: [7, 8, 12, 16], scale: [0, 1, 3, 6, 7, 10], baseOctave: 2, active: 0.68, chord: 0.22, tie: 0.05, accent: 0.36, gates: [25, 50, 75], chords: ["off", "power5", "dim", "minor", "custom"], spread: ["close", "open"], strum: [0, 0, 5, 10, 15], velocity: [70, 120], custom: ["0,6,10", "0,1,7", "0,3,6,10"], jump: 0.28 },
    odd_meter: { label: "Odd Meter", lengths: [5, 7, 9, 11, 13, 15, 17], scale: [0, 2, 3, 5, 7, 8, 10], baseOctave: 3, active: 0.70, chord: 0.18, tie: 0.08, accent: 0.28, gates: [50, 75, 100], chords: ["off", "power5", "minor", "sus2", "sus4"], spread: ["close", "open"], strum: [0, 0, 10, 20], velocity: [72, 112], custom: ["0,3,7", "0,5,10"], jump: 0.30 },
    chiptune: { label: "Chiptune", lengths: [8, 16], scale: [0, 2, 4, 5, 7, 9, 11], baseOctave: 4, active: 0.84, chord: 0.10, tie: 0.02, accent: 0.24, gates: [25, 50, 50, 75], chords: ["off", "off", "octave", "power5", "major"], spread: ["close"], strum: [0], velocity: [82, 116], custom: ["0,4,7", "0,7,12"], jump: 0.46 },
    minimal: { label: "Minimal", lengths: [8, 12, 16], scale: [0, 2, 5, 7, 10], baseOctave: 3, active: 0.34, chord: 0.14, tie: 0.14, accent: 0.08, gates: [75, 100], chords: ["off", "off", "power5", "sus2"], spread: ["close", "open"], strum: [0, 10, 20], velocity: [60, 98], custom: ["0,5,10"], jump: 0.12 },
    cinematic: { label: "Cinematic", lengths: [8, 12, 16, 24], scale: [0, 2, 3, 5, 7, 8, 10], baseOctave: 3, active: 0.50, chord: 0.50, tie: 0.12, accent: 0.16, gates: [75, 100, 100], chords: ["minor", "sus2", "sus4", "min7", "dim", "custom"], spread: ["open", "wide"], strum: [10, 20, 40, 60, 80], velocity: [62, 106], custom: ["0,3,7,10", "0,5,10,15", "0,3,8,15"], jump: 0.22 },
    chaos_safe: { label: "Chaos Safe", lengths: [7, 9, 11, 13, 16, 19], scale: [0, 1, 2, 3, 5, 6, 7, 8, 10, 11], baseOctave: 3, active: 0.76, chord: 0.30, tie: 0.10, accent: 0.36, gates: [25, 50, 75, 100], chords: ["off", "power5", "minor", "dim", "aug", "sus2", "custom"], spread: ["close", "open", "wide"], strum: [0, 5, 10, 20, 40, 60], velocity: [58, 120], custom: ["0,1,7", "0,3,6,10", "0,5,11,17", "0,4,8"], jump: 0.42 },
    performance_test: { label: "Performance Test", lengths: [13, 16, 24, 32], scale: [0, 2, 3, 5, 7, 10], baseOctave: 3, active: 0.82, chord: 0.34, tie: 0.18, accent: 0.40, gates: [25, 50, 75, 100], chords: ["off", "power5", "octave", "minor", "sus4", "min7", "custom"], spread: ["close", "open"], strum: [0, 5, 10, 20, 30], velocity: [65, 120], custom: ["0,3,7,10", "0,7,12", "0,5,10"], jump: 0.34 }
  });


  let stepTimer = null;
  let gateTimer = null;
  let runToken = 0;
  let cursor = 0;
  let currentRawNote = null;
  let currentRawNotes = [];
  let currentVisualNotes = new Map();
  let chordStrumTimers = [];
  let currentChord = "off";
  let currentVisualNote = null;
  let currentTie = false;
  let tieHoldSegments = 0;
  let lastStepNumber = 0;
  let lastAction = "";
  let lastPatternLabel = PATTERN_PRESETS.default_ascending_8.label;
  let stepClipboard = null;
  let isBatchMutating = false;
  const generatedRawNotes = new Set();

  function getEl(id) { return document.getElementById(id); }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : min;
    if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fb));
    return Math.min(max, Math.max(min, n));
  }

  function intClamp(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
  }

  function normalizeChordId(value, fallback) {
    const fb = CHORD_PRESETS[fallback] ? fallback : "off";
    let raw = value;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = raw.id ?? raw.type ?? raw.chord ?? raw.name ?? raw.mode;
    const key = String(raw ?? fb).trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (!key) return fb;
    if (CHORD_PRESETS[key]) return key;
    if (CHORD_ALIASES[key] && CHORD_PRESETS[CHORD_ALIASES[key]]) return CHORD_ALIASES[key];
    const direct = CHORD_IDS.find((id) => id.toLowerCase() === key);
    return direct || fb;
  }

  function chordPreset(id) {
    return CHORD_PRESETS[normalizeChordId(id, "off")] || CHORD_PRESETS.off;
  }

  function normalizeChordInversion(value, fallback) {
    const fb = CHORD_INVERSION_VALUE_STRINGS.has(String(fallback)) ? String(fallback) : "0";
    const n = intClamp(value, 0, LIMITS.maxChordNotes - 1, Number(fb));
    return String(n);
  }

  function normalizeChordSpread(value, fallback) {
    const raw = String(value ?? fallback ?? "close").trim().toLowerCase();
    return CHORD_SPREAD_VALUE_STRINGS.has(raw) ? raw : "close";
  }

  function normalizeChordVelocityMode(value, fallback) {
    const raw = String(value ?? fallback ?? "balanced").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (raw === "softtop" || raw === "soft") return "softTop";
    if (raw === "natural" || raw === "human") return "natural";
    if (raw === "flat" || raw === "same") return "flat";
    return CHORD_VELOCITY_MODE_STRINGS.has(raw) ? raw : "balanced";
  }

  function normalizeChordStrumMs(value, fallback) {
    return intClamp(value, 0, LIMITS.maxChordStrumMs, fallback ?? 0);
  }

  function parseCustomIntervals(value, fallback) {
    const fb = Array.isArray(fallback) && fallback.length ? fallback : [0, 4, 7];
    let source = value;
    if (source && typeof source === "object" && !Array.isArray(source)) source = source.intervals ?? source.custom ?? source.chordCustom;
    const raw = Array.isArray(source)
      ? source
      : String(source ?? "").trim().split(/[;,\s]+/).filter(Boolean);
    const result = [];
    raw.forEach((item) => {
      const n = intClamp(item, LIMITS.customIntervalMin, LIMITS.customIntervalMax, 0);
      if (!result.includes(n)) result.push(n);
    });
    if (!result.includes(0)) result.unshift(0);
    return (result.length ? result : fb).slice(0, LIMITS.maxChordNotes);
  }

  function customIntervalsText(value) {
    return parseCustomIntervals(value, [0, 4, 7]).join(",");
  }

  function buildChordIntervals(chordId, options) {
    const id = normalizeChordId(chordId, "off");
    const base = id === "custom"
      ? parseCustomIntervals(options?.customIntervals ?? options?.chordCustom, [0, 4, 7])
      : (chordPreset(id).intervals || [0]);
    const intervals = base.slice(0, LIMITS.maxChordNotes).map((item) => intClamp(item, LIMITS.customIntervalMin, LIMITS.customIntervalMax, 0));
    return intervals.length ? intervals : [0];
  }

  function applyChordInversionAndSpread(intervals, options) {
    let items = (Array.isArray(intervals) && intervals.length ? intervals : [0]).slice(0, LIMITS.maxChordNotes).sort((a, b) => a - b);
    const inversion = intClamp(options?.inversion ?? options?.chordInversion, 0, Math.max(0, items.length - 1), 0);
    for (let i = 0; i < inversion; i += 1) {
      const first = items.shift();
      if (first === undefined) break;
      items.push(first + 12);
    }
    const spread = normalizeChordSpread(options?.spread ?? options?.chordSpread, "close");
    if (spread === "open") items = items.map((interval, index) => interval + (index >= 2 ? 12 : 0));
    else if (spread === "wide") items = items.map((interval, index) => interval + (index * 12));
    return items.slice(0, LIMITS.maxChordNotes);
  }

  function buildChordNotes(rootMidi, chordId, options) {
    const root = intClamp(rootMidi, 0, 127, 60);
    const intervals = applyChordInversionAndSpread(buildChordIntervals(chordId, options), options || {});
    const notes = [];
    intervals.slice(0, LIMITS.maxChordNotes).forEach((interval) => {
      const midi = intClamp(root + Number(interval || 0), 0, 127, root);
      if (!notes.includes(midi)) notes.push(midi);
    });
    return notes.length ? notes : [root];
  }

  function chordVelocityScale(noteCount) {
    const count = intClamp(noteCount, 1, LIMITS.maxChordNotes, 1);
    return ({ 1: 1, 2: 0.82, 3: 0.70, 4: 0.62 }[count]) || 1;
  }

  function chordVoiceVelocityScale(noteCount, voiceIndex, mode) {
    const count = intClamp(noteCount, 1, LIMITS.maxChordNotes, 1);
    const index = intClamp(voiceIndex, 0, LIMITS.maxChordNotes - 1, 0);
    const selected = normalizeChordVelocityMode(mode, "balanced");
    const profiles = {
      balanced: [1.00, 0.94, 0.88, 0.82],
      flat: [1.00, 1.00, 1.00, 1.00],
      natural: [1.00, 0.92, 0.84, 0.76],
      softTop: [1.00, 0.86, 0.72, 0.60]
    };
    return (profiles[selected] || profiles.balanced)[Math.min(index, count - 1)] || 1;
  }

  function chordText(chordId) {
    const id = normalizeChordId(chordId, "off");
    return CHORD_PRESETS[id]?.label || "Off";
  }

  function chordShort(chordId) {
    const id = normalizeChordId(chordId, "off");
    return CHORD_PRESETS[id]?.short || "";
  }

  function defaultStep(index) {
    const safeIndex = Math.max(0, Math.round(Number(index) || 1) - 1);
    const base = DEFAULT_PATTERN[Math.min(DEFAULT_PATTERN.length - 1, safeIndex)] || DEFAULT_PATTERN[0];
    const neutral = { chord: "off", chordCustom: "0,4,7", chordInversion: 0, chordSpread: "close", chordStrum: 0, chordVelocityMode: "balanced" };
    if (safeIndex < DEFAULT_PATTERN.length) return { ...base, ...neutral };
    const repeated = DEFAULT_PATTERN[safeIndex % DEFAULT_PATTERN.length] || DEFAULT_PATTERN[0];
    return { ...repeated, active: false, accent: false, tie: false, ...neutral };
  }

  function normalizeStepGatePercent(value, fallback) {
    const fb = LIMITS.stepGateValues.has(Number(fallback)) ? Number(fallback) : LIMITS.stepGateDefault;
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fb;
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
    const rounded = Math.round(percent);
    if (LIMITS.stepGateValues.has(rounded)) return rounded;
    if (rounded < 25 || rounded > 100) return fb;
    return [25, 50, 75, 100].reduce((best, candidate) => (Math.abs(candidate - rounded) < Math.abs(best - rounded) ? candidate : best), fb);
  }

  function safeStepData(data, fallback) {
    const fb = fallback || DEFAULT_PATTERN[0];
    const velocityFallback = Number.isFinite(Number(fb.velocity)) ? fb.velocity : LIMITS.velocityDefault;
    const gateFallback = normalizeStepGatePercent(fb.gate, LIMITS.stepGateDefault);
    const gate = normalizeStepGatePercent(data?.gate ?? data?.gatePercent, gateFallback);
    return {
      active: data?.active === undefined ? Boolean(fb.active) : Boolean(data.active),
      note: intClamp(data?.note, LIMITS.noteMin, LIMITS.noteMax, fb.note),
      octave: intClamp(data?.octave, LIMITS.octaveMin, LIMITS.octaveMax, fb.octave),
      velocity: intClamp(data?.velocity, LIMITS.velocityMin, LIMITS.velocityMax, velocityFallback),
      gate,
      accent: Boolean(data?.accent),
      tie: Boolean(data?.tie),
      chord: normalizeChordId(data?.chord ?? data?.chordId ?? data?.stepChord, fb.chord || "off"),
      chordCustom: customIntervalsText(data?.chordCustom ?? data?.customIntervals ?? data?.intervals ?? fb.chordCustom ?? "0,4,7"),
      chordInversion: Number(normalizeChordInversion(data?.chordInversion ?? data?.inversion, fb.chordInversion ?? 0)),
      chordSpread: normalizeChordSpread(data?.chordSpread ?? data?.spread, fb.chordSpread || "close"),
      chordStrum: normalizeChordStrumMs(data?.chordStrum ?? data?.strumMs, fb.chordStrum ?? 0),
      chordVelocityMode: normalizeChordVelocityMode(data?.chordVelocityMode ?? data?.velocityMode, fb.chordVelocityMode || "balanced")
    };
  }

  function noteName(midi) {
    const n = Number(midi);
    if (!Number.isFinite(n)) return "--";
    const rounded = Math.round(n);
    const pc = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[pc]}${octave}`;
  }

  function stepDataName(data) {
    const safe = safeStepData(data, DEFAULT_PATTERN[0]);
    if (!safe.active) return "—";
    const accent = safe.accent ? " Acc" : "";
    const tie = safe.tie ? " Tie" : "";
    const chord = safe.chord && safe.chord !== "off" ? ` ${chordText(safe.chord)}` : "";
    const motion = safe.chord && safe.chord !== "off" ? ` Inv${safe.chordInversion} ${safe.chordSpread} Str${safe.chordStrum}ms ${safe.chordVelocityMode}` : "";
    return `${NOTE_NAMES[safe.note]}${safe.octave}${chord}${motion} V${safe.velocity}% G${safe.gate}%${accent}${tie}`;
  }

  function stepDataMidi(data) {
    const safe = safeStepData(data, DEFAULT_PATTERN[0]);
    return 12 * (safe.octave + 1) + safe.note;
  }

  function stepChordNoteNames(data) {
    const safe = safeStepData(data, DEFAULT_PATTERN[0]);
    if (!safe.active) return [];
    return buildChordNotes(stepDataMidi(safe), safe.chord, safe).map(noteName);
  }

  function stepSummaryText(data) {
    const safe = safeStepData(data, DEFAULT_PATTERN[0]);
    if (!safe.active) return "—";
    const chord = safe.chord && safe.chord !== "off" ? chordShort(safe.chord) || chordText(safe.chord) : "";
    const motion = safe.chord && safe.chord !== "off" && (safe.chordInversion || safe.chordSpread !== "close" || safe.chordStrum || safe.chordVelocityMode !== "balanced")
      ? `/${safe.chordInversion}${safe.chordSpread === "close" ? "" : safe.chordSpread[0].toUpperCase()}${safe.chordStrum ? `+${safe.chordStrum}` : ""}`
      : "";
    return `${NOTE_NAMES[safe.note]}${safe.octave}${chord ? ` ${chord}${motion}` : ""}`;
  }

  function ensureStepSummaryBadge(index) {
    const safeIndex = intClamp(index, 1, LIMITS.steps, 1);
    let badge = getEl(`seq-step-${safeIndex}-summary`);
    if (badge) return badge;
    const stepCard = document.querySelector(`.seq-step[data-step-index="${safeIndex}"]`);
    const header = stepCard?.querySelector?.("header");
    if (!header) return null;
    badge = document.createElement("span");
    badge.id = `seq-step-${safeIndex}-summary`;
    badge.className = "seq-step-summary";
    badge.setAttribute("aria-live", "polite");
    badge.textContent = stepSummaryText(defaultStep(safeIndex));
    header.insertBefore(badge, getEl(`seq-step-${safeIndex}-led`) || null);
    return badge;
  }

  function setStepSummary(index, data) {
    const safeIndex = intClamp(index, 1, LIMITS.steps, 1);
    const safe = safeStepData(data || readStepData(safeIndex), defaultStep(safeIndex));
    const badge = ensureStepSummaryBadge(safeIndex);
    const stepCard = document.querySelector(`.seq-step[data-step-index="${safeIndex}"]`);
    const names = stepChordNoteNames(safe);
    const hasChord = Boolean(safe.active && safe.chord && safe.chord !== "off");
    if (badge) {
      badge.textContent = stepSummaryText(safe);
      badge.title = safe.active
        ? `Step ${safeIndex}: ${stepDataName(safe)}${hasChord ? ` → ${names.join(" + ")}` : ""}`
        : `Step ${safeIndex}: pausa`;
      badge.dataset.chord = safe.chord;
      badge.dataset.active = safe.active ? "true" : "false";
    }
    if (stepCard) {
      stepCard.classList.toggle("has-chord", hasChord);
      stepCard.dataset.stepChord = safe.chord;
      stepCard.title = badge?.title || "";
    }
  }

  function updateAllStepSummaries() {
    for (let index = 1; index <= LIMITS.steps; index += 1) setStepSummary(index, readStepData(index));
  }

  function countChordSteps(cfg) {
    const sequence = buildSequence(cfg || getConfig());
    return sequence.filter((step) => step.active && step.chord && step.chord !== "off").length;
  }

  function chordPatternSummary(cfg) {
    const sequence = buildSequence(cfg || getConfig());
    const items = sequence
      .filter((step) => step.active && step.chord && step.chord !== "off")
      .map((step) => `${step.index}:${step.noteName} ${step.chordShort || step.chordLabel}`);
    return items.length ? items.join(" · ") : "nessun chord";
  }

  function chordMotionSummary(cfg) {
    const sequence = buildSequence(cfg || getConfig());
    const items = sequence
      .filter((step) => step.active && step.chord && step.chord !== "off" && (step.chord === "custom" || step.chordInversion || step.chordSpread !== "close" || step.chordStrum || step.chordVelocityMode !== "balanced"))
      .map((step) => `${step.index}:${step.chord === "custom" ? "custom" : (step.chordShort || step.chordLabel)} inv${step.chordInversion}/${step.chordSpread}/${step.chordStrum}ms/${step.chordVelocityMode}`);
    return items.length ? items.join(" · ") : "motion neutra";
  }

  function sanitizeChoice(id, value, allowedValues, fallback, source) {
    const el = getEl(id);
    if (!el) return fallback;
    const raw = String(value ?? el.value ?? fallback);
    const normalized = allowedValues.has(raw) ? raw : String(fallback);
    if (String(el.value) !== normalized) {
      el.value = normalized;
      window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? normalized, { source: source || "seq-sanitize", type: el.type || el.tagName.toLowerCase() });
    }
    return normalized;
  }

  function sanitizeNumberControl(id, value, min, max, fallback, source) {
    const el = getEl(id);
    if (!el) return fallback;
    const n = id === "seq-rate" ? clamp(value ?? el.value, min, max, fallback) : intClamp(value ?? el.value, min, max, fallback);
    const normalized = id === "seq-rate" ? String(Number(n.toFixed(2))) : String(n);
    if (String(el.value) !== normalized) {
      el.value = normalized;
      window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? n, { source: source || "seq-sanitize", type: el.type || el.tagName.toLowerCase() });
    }
    window.SynthXControls?.updateValueLabel?.(id, n);
    return n;
  }

  function sanitizeCustomIntervalsControl(id, value, fallback, source) {
    const el = getEl(id);
    if (!el) return fallback;
    const normalized = customIntervalsText(value ?? el.value ?? fallback ?? "0,4,7");
    if (String(el.value) !== normalized) {
      el.value = normalized;
      window.SynthXState?.setParameter?.(id, normalized, { source: source || "seq-sanitize", type: el.type || el.tagName.toLowerCase() });
    }
    return normalized;
  }

  function getConfig() {
    const lengthRaw = String(getEl("seq-length")?.value ?? "8");
    const length = LIMITS.lengthValues.has(Number(lengthRaw)) ? Number(lengthRaw) : 8;
    const rate = clamp(getEl("seq-rate")?.value ?? 2, LIMITS.rateMin, LIMITS.rateMax, 2);
    const gatePercent = clamp(getEl("seq-gate")?.value ?? 65, LIMITS.gateMin, LIMITS.gateMax, 65);
    return {
      enabled: Boolean(getEl("seq-enabled")?.checked),
      length,
      rate,
      gatePercent,
      gate: gatePercent / 100
    };
  }

  function syncStepLengthVisibility(cfg) {
    const length = LIMITS.lengthValues.has(Number(cfg?.length)) ? Number(cfg.length) : getConfig().length;
    document.querySelectorAll(".seq-step[data-step-index]").forEach((stepCard) => {
      const index = intClamp(stepCard.dataset?.stepIndex, 1, LIMITS.steps, 1);
      const outside = index > length;
      stepCard.hidden = outside;
      stepCard.setAttribute("aria-hidden", outside ? "true" : "false");
      stepCard.classList.toggle("is-outside-length", outside);
    });
    const edit = getEl("seq-edit-step");
    if (edit) {
      Array.from(edit.options || []).forEach((option) => {
        const outside = Number(option.value) > length;
        option.disabled = outside;
        option.hidden = outside;
      });
    }
  }

  function syncClampedUiValues(cfg) {
    const c = cfg || getConfig();
    sanitizeChoice("seq-length", c.length, STEP_LENGTH_VALUE_STRINGS, 8, "seq-sanitize");
    sanitizeNumberControl("seq-rate", c.rate, LIMITS.rateMin, LIMITS.rateMax, 2, "seq-sanitize");
    sanitizeNumberControl("seq-gate", Math.round(c.gatePercent), LIMITS.gateMin, LIMITS.gateMax, 65, "seq-sanitize");
    syncStepLengthVisibility(c);
    const edit = getEl("seq-edit-step");
    if (edit) edit.value = String(intClamp(edit.value, 1, c.length || LIMITS.steps, Math.max(1, lastStepNumber || 1)));
    for (let index = 1; index <= LIMITS.steps; index += 1) {
      const fallback = defaultStep(index);
      sanitizeChoice(`seq-step-${index}-note`, getEl(`seq-step-${index}-note`)?.value, new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]), fallback.note, "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-octave`, getEl(`seq-step-${index}-octave`)?.value, new Set(["2", "3", "4", "5", "6"]), fallback.octave, "seq-step-sanitize");
      sanitizeNumberControl(`seq-step-${index}-velocity`, getEl(`seq-step-${index}-velocity`)?.value, LIMITS.velocityMin, LIMITS.velocityMax, fallback.velocity ?? LIMITS.velocityDefault, "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-gate`, getEl(`seq-step-${index}-gate`)?.value, new Set(["25", "50", "75", "100"]), fallback.gate ?? LIMITS.stepGateDefault, "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-chord`, getEl(`seq-step-${index}-chord`)?.value, CHORD_VALUE_STRINGS, fallback.chord || "off", "seq-step-sanitize");
      sanitizeCustomIntervalsControl(`seq-step-${index}-chord-custom`, getEl(`seq-step-${index}-chord-custom`)?.value, fallback.chordCustom || "0,4,7", "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-chord-inversion`, getEl(`seq-step-${index}-chord-inversion`)?.value, CHORD_INVERSION_VALUE_STRINGS, fallback.chordInversion ?? 0, "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-chord-spread`, getEl(`seq-step-${index}-chord-spread`)?.value, CHORD_SPREAD_VALUE_STRINGS, fallback.chordSpread || "close", "seq-step-sanitize");
      sanitizeNumberControl(`seq-step-${index}-chord-strum`, getEl(`seq-step-${index}-chord-strum`)?.value, 0, LIMITS.maxChordStrumMs, fallback.chordStrum ?? 0, "seq-step-sanitize");
      sanitizeChoice(`seq-step-${index}-chord-velocity-mode`, getEl(`seq-step-${index}-chord-velocity-mode`)?.value, CHORD_VELOCITY_MODE_STRINGS, fallback.chordVelocityMode || "balanced", "seq-step-sanitize");
      setStepSummary(index, readStepData(index));
    }
  }

  function getStepActive(index) {
    const fallback = defaultStep(index);
    const el = getEl(`seq-step-${index}-active`);
    return el ? Boolean(el.checked) : Boolean(fallback.active);
  }

  function getStepMidi(index) {
    const fallback = defaultStep(index);
    const pc = intClamp(getEl(`seq-step-${index}-note`)?.value, LIMITS.noteMin, LIMITS.noteMax, fallback.note);
    const octave = intClamp(getEl(`seq-step-${index}-octave`)?.value, LIMITS.octaveMin, LIMITS.octaveMax, fallback.octave);
    return 12 * (octave + 1) + pc;
  }

  function getStepVelocity(index) {
    const fallback = defaultStep(index);
    return intClamp(getEl(`seq-step-${index}-velocity`)?.value, LIMITS.velocityMin, LIMITS.velocityMax, fallback.velocity ?? LIMITS.velocityDefault);
  }

  function getStepGatePercent(index) {
    const fallback = defaultStep(index);
    return normalizeStepGatePercent(getEl(`seq-step-${index}-gate`)?.value, fallback.gate ?? LIMITS.stepGateDefault);
  }

  function getStepAccent(index) {
    return Boolean(getEl(`seq-step-${index}-accent`)?.checked);
  }

  function getStepTie(index) {
    return Boolean(getEl(`seq-step-${index}-tie`)?.checked);
  }

  function getStepChordId(index) {
    const fallback = defaultStep(index);
    return normalizeChordId(getEl(`seq-step-${index}-chord`)?.value, fallback.chord || "off");
  }

  function getStepChordCustom(index) {
    const fallback = defaultStep(index);
    return customIntervalsText(getEl(`seq-step-${index}-chord-custom`)?.value ?? fallback.chordCustom ?? "0,4,7");
  }

  function getStepChordInversion(index) {
    const fallback = defaultStep(index);
    return Number(normalizeChordInversion(getEl(`seq-step-${index}-chord-inversion`)?.value, fallback.chordInversion ?? 0));
  }

  function getStepChordSpread(index) {
    const fallback = defaultStep(index);
    return normalizeChordSpread(getEl(`seq-step-${index}-chord-spread`)?.value, fallback.chordSpread || "close");
  }

  function getStepChordStrum(index) {
    const fallback = defaultStep(index);
    return normalizeChordStrumMs(getEl(`seq-step-${index}-chord-strum`)?.value, fallback.chordStrum ?? 0);
  }

  function getStepChordVelocityMode(index) {
    const fallback = defaultStep(index);
    return normalizeChordVelocityMode(getEl(`seq-step-${index}-chord-velocity-mode`)?.value, fallback.chordVelocityMode || "balanced");
  }

  function readStepData(index) {
    const fallback = defaultStep(index);
    return {
      active: getStepActive(index),
      note: intClamp(getEl(`seq-step-${index}-note`)?.value, LIMITS.noteMin, LIMITS.noteMax, fallback.note),
      octave: intClamp(getEl(`seq-step-${index}-octave`)?.value, LIMITS.octaveMin, LIMITS.octaveMax, fallback.octave),
      velocity: getStepVelocity(index),
      gate: getStepGatePercent(index),
      accent: getStepAccent(index),
      tie: getStepTie(index),
      chord: getStepChordId(index),
      chordCustom: getStepChordCustom(index),
      chordInversion: getStepChordInversion(index),
      chordSpread: getStepChordSpread(index),
      chordStrum: getStepChordStrum(index),
      chordVelocityMode: getStepChordVelocityMode(index)
    };
  }

  function setStepStateValue(id, value, source) {
    const el = getEl(id);
    if (!el) return;
    window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? value, { source: source || "seq-pattern", type: el.type || el.tagName.toLowerCase() });
  }

  function writeStepData(index, data, source) {
    const fallback = defaultStep(index);
    const safe = safeStepData(data, fallback);
    const active = getEl(`seq-step-${index}-active`);
    const note = getEl(`seq-step-${index}-note`);
    const octave = getEl(`seq-step-${index}-octave`);
    const velocity = getEl(`seq-step-${index}-velocity`);
    const gate = getEl(`seq-step-${index}-gate`);
    const accent = getEl(`seq-step-${index}-accent`);
    const tie = getEl(`seq-step-${index}-tie`);
    const chord = getEl(`seq-step-${index}-chord`);
    const chordCustom = getEl(`seq-step-${index}-chord-custom`);
    const chordInversion = getEl(`seq-step-${index}-chord-inversion`);
    const chordSpread = getEl(`seq-step-${index}-chord-spread`);
    const chordStrum = getEl(`seq-step-${index}-chord-strum`);
    const chordVelocityMode = getEl(`seq-step-${index}-chord-velocity-mode`);
    if (active) { active.checked = safe.active; setStepStateValue(active.id, safe.active, source); }
    if (note) { note.value = String(safe.note); setStepStateValue(note.id, safe.note, source); }
    if (octave) { octave.value = String(safe.octave); setStepStateValue(octave.id, safe.octave, source); }
    if (velocity) { velocity.value = String(safe.velocity); setStepStateValue(velocity.id, safe.velocity, source); window.SynthXControls?.updateValueLabel?.(velocity.id, safe.velocity); }
    if (gate) { gate.value = String(safe.gate); setStepStateValue(gate.id, safe.gate, source); }
    if (accent) { accent.checked = safe.accent; setStepStateValue(accent.id, safe.accent, source); }
    if (tie) { tie.checked = safe.tie; setStepStateValue(tie.id, safe.tie, source); }
    if (chord) { chord.value = safe.chord; setStepStateValue(chord.id, safe.chord, source); }
    if (chordCustom) { chordCustom.value = safe.chordCustom; setStepStateValue(chordCustom.id, safe.chordCustom, source); }
    if (chordInversion) { chordInversion.value = String(safe.chordInversion); setStepStateValue(chordInversion.id, safe.chordInversion, source); }
    if (chordSpread) { chordSpread.value = safe.chordSpread; setStepStateValue(chordSpread.id, safe.chordSpread, source); }
    if (chordStrum) { chordStrum.value = String(safe.chordStrum); setStepStateValue(chordStrum.id, safe.chordStrum, source); window.SynthXControls?.updateValueLabel?.(chordStrum.id, safe.chordStrum); }
    if (chordVelocityMode) { chordVelocityMode.value = safe.chordVelocityMode; setStepStateValue(chordVelocityMode.id, safe.chordVelocityMode, source); }
    setStepSummary(index, safe);
  }

  function readStep(index) {
    const active = getStepActive(index);
    const note = getStepMidi(index);
    const velocityBase = clamp(getStepVelocity(index) / 100, 0, 1, 1);
    const accent = getStepAccent(index);
    const velocity = clamp(velocityBase * (accent ? LIMITS.accentBoost : 1), 0, 1, 1);
    const gatePercent = getStepGatePercent(index);
    const tie = getStepTie(index);
    const chord = getStepChordId(index);
    const chordCustom = getStepChordCustom(index);
    const chordInversion = getStepChordInversion(index);
    const chordSpread = getStepChordSpread(index);
    const chordStrum = getStepChordStrum(index);
    const chordVelocityMode = getStepChordVelocityMode(index);
    const chordMotion = { chordCustom, chordInversion, chordSpread, chordStrum, chordVelocityMode };
    const chordNotes = buildChordNotes(note, chord, chordMotion);
    const chordLabel = chordText(chord);
    const chordShortLabel = chordShort(chord);
    return {
      index, active, note, noteName: noteName(note), velocity, velocityPercent: Math.round(velocity * 100),
      gatePercent, gate: gatePercent / 100, accent, tie, chord, chordLabel, chordShort: chordShortLabel,
      chordCustom, chordInversion, chordSpread, chordStrum, chordVelocityMode,
      chordNotes, chordNoteNames: chordNotes.map(noteName), chordNoteCount: chordNotes.length
    };
  }

  function buildSequence(cfg) {
    const len = LIMITS.lengthValues.has(Number(cfg?.length)) ? Number(cfg.length) : getConfig().length;
    const sequence = [];
    for (let index = 1; index <= len; index += 1) sequence.push(readStep(index));
    return sequence;
  }

  function countActiveSteps(cfg) {
    return buildSequence(cfg || getConfig()).filter((step) => step.active).length;
  }

  function sequencePreview(cfg) {
    const sequence = buildSequence(cfg || getConfig());
    if (!sequence.length) return "--";
    return sequence.map((step) => {
      if (!step.active) return `${step.index}:—`;
      const accent = step.accent ? "!" : "";
      const tie = step.tie ? "~" : "";
      const chord = step.chord && step.chord !== "off" ? `[${step.chordShort || step.chordLabel}${step.chordStrum ? `+${step.chordStrum}ms` : ""}]` : "";
      return `${step.index}:${step.noteName}${chord}${accent}${tie}/V${step.velocityPercent}/G${step.gatePercent}`;
    }).join(" · ");
  }

  function setStatus(message, kind) {
    const el = getEl("seq-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
  }

  function setPatternFeedback(message, kind) {
    const el = getEl("seq-pattern-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "info";
  }

  function getVisualNote(rawNote) {
    const n = Number(rawNote);
    if (!Number.isFinite(n)) return n;
    return window.SynthXAudio?.getPerformanceNote ? window.SynthXAudio.getPerformanceNote(n) : n;
  }

  function setSequencerKey(rawNote, active) {
    const visual = getVisualNote(rawNote);
    const key = document.querySelector(`.key[data-note="${visual}"]`);
    if (key) key.classList.toggle("seq-step-note", Boolean(active));
    return visual;
  }

  function clearSequencerKey(rawNote, visualNote) {
    const visual = visualNote ?? getVisualNote(rawNote);
    const key = document.querySelector(`.key[data-note="${visual}"]`);
    if (key) key.classList.remove("seq-step-note");
  }

  function clearAllStepHighlights() {
    document.querySelectorAll(".seq-step.is-current").forEach((el) => el.classList.remove("is-current"));
    document.querySelectorAll(".seq-step.is-edit-target").forEach((el) => el.classList.remove("is-edit-target"));
    document.querySelectorAll(".seq-step-led.is-on").forEach((el) => el.classList.remove("is-on"));
    document.querySelectorAll(".key.seq-step-note").forEach((el) => el.classList.remove("seq-step-note"));
  }

  function markEditStep(index) {
    document.querySelectorAll(".seq-step.is-edit-target").forEach((el) => el.classList.remove("is-edit-target"));
    const step = document.querySelector(`.seq-step[data-step-index="${index}"]`);
    if (step) step.classList.add("is-edit-target");
  }

  function markStep(index, active) {
    document.querySelectorAll(".seq-step.is-current").forEach((el) => el.classList.remove("is-current"));
    document.querySelectorAll(".seq-step-led.is-on").forEach((el) => el.classList.remove("is-on"));
    if (!active) return;
    const step = document.querySelector(`.seq-step[data-step-index="${index}"]`);
    const led = getEl(`seq-step-${index}-led`);
    if (step) step.classList.add("is-current");
    if (led) led.classList.add("is-on");
  }

  function exclusionStatus() {
    const arpEnabled = Boolean(window.SynthXArpeggiator?.isEnabled?.());
    const seqEnabled = Boolean(getConfig().enabled);
    if (seqEnabled && arpEnabled) return "conflitto corretto";
    if (seqEnabled) return "Arp escluso";
    if (arpEnabled) return "Sequencer escluso";
    return "libero";
  }

  function updateRuntimeState(extra) {
    const cfg = getConfig();
    lastAction = extra?.lastAction || lastAction || "";
    const preview = sequencePreview(cfg);
    const activeStepCount = countActiveSteps(cfg);
    const currentStepData = lastStepNumber ? readStep(lastStepNumber) : null;
    const patch = {
      enabled: cfg.enabled,
      length: cfg.length,
      rate: cfg.rate,
      gatePercent: Math.round(cfg.gatePercent),
      stepVelocityPercent: currentStepData ? currentStepData.velocityPercent : LIMITS.velocityDefault,
      stepGatePercent: currentStepData ? currentStepData.gatePercent : LIMITS.stepGateDefault,
      stepAccent: currentStepData ? Boolean(currentStepData.accent) : false,
      stepTie: currentStepData ? Boolean(currentStepData.tie) : false,
      stepChord: currentStepData ? currentStepData.chord : "off",
      stepChordLabel: currentStepData ? currentStepData.chordLabel : "Off",
      currentTie: Boolean(currentTie),
      tieHoldSegments,
      running: Boolean(stepTimer || currentRawNote !== null || generatedRawNotes.size > 0),
      currentStep: lastStepNumber,
      currentRawNote,
      currentRawNotes: currentRawNotes.slice(),
      currentChord,
      currentChordLabel: chordText(currentChord),
      currentNoteName: currentRawNote === null ? "" : `${noteName(currentRawNote)}${currentChord !== "off" ? ` ${chordShort(currentChord) || chordText(currentChord)}` : ""}`,
      generatedNoteCount: generatedRawNotes.size,
      activeStepCount,
      chordStepCount: countChordSteps(cfg),
      chordPatternSummary: chordPatternSummary(cfg),
      chordMotionSummary: chordMotionSummary(cfg),
      exclusionStatus: exclusionStatus(),
      sequencePreview: preview,
      lastPatternLabel,
      clipboardStepName: stepClipboard ? stepDataName(stepClipboard) : "",
      lastAction
    };
    window.SynthXState?.updateSequencer?.(patch);
    window.SynthXControls?.updateSeqUiStatus?.();
  }

  function clearTimer(which) {
    if (which === "strum" || which === "all") {
      chordStrumTimers.forEach((timer) => window.clearTimeout(timer));
      chordStrumTimers = [];
    }
    if ((which === "gate" || which === "all") && gateTimer) {
      window.clearTimeout(gateTimer);
      gateTimer = null;
    }
    if ((which === "step" || which === "all") && stepTimer) {
      window.clearTimeout(stepTimer);
      stepTimer = null;
    }
  }

  function releaseGeneratedNote(rawNote, reason, visualNote) {
    const midi = Number(rawNote);
    if (!Number.isFinite(midi)) return;
    try {
      if (window.SynthXAudio?.noteOffImmediate) window.SynthXAudio.noteOffImmediate(midi, reason || "seq-release");
      else window.SynthXAudio?.noteOff?.(midi);
    } catch (err) {
      window.SynthXLogger?.warn("sequencer release error", err);
    }
    generatedRawNotes.delete(midi);
    clearSequencerKey(midi, visualNote ?? currentVisualNotes.get(midi));
    currentRawNotes = currentRawNotes.filter((note) => note !== midi);
    currentVisualNotes.delete(midi);
    if (!currentRawNotes.length) {
      currentRawNote = null;
      currentVisualNote = null;
      currentChord = "off";
      currentTie = false;
      tieHoldSegments = 0;
    }
  }

  function releaseCurrent(reason) {
    clearTimer("gate");
    clearTimer("strum");
    const notes = currentRawNotes.length ? currentRawNotes.slice() : (currentRawNote !== null ? [currentRawNote] : []);
    notes.forEach((note) => releaseGeneratedNote(note, reason || "seq-release", currentVisualNotes.get(note)));
    currentRawNote = null;
    currentRawNotes = [];
    currentVisualNotes = new Map();
    currentVisualNote = null;
    currentChord = "off";
    currentTie = false;
    tieHoldSegments = 0;
  }

  function releaseAllGenerated(reason) {
    releaseCurrent(reason || "seq-release-all");
    Array.from(generatedRawNotes).forEach((note) => releaseGeneratedNote(note, reason || "seq-release-all"));
    assertGeneratedNotesReleased(reason || "seq-release-all");
    clearAllStepHighlights();
  }

  function safeAllNotesOff(reason) {
    try {
      const isPanic = String(reason || "").includes("panic");
      if (isPanic && window.SynthXAudio?.panicAllNotesOff) window.SynthXAudio.panicAllNotesOff(`seq:${reason || "panic"}`);
      else window.SynthXAudio?.allNotesOff?.({ reason: `seq:${reason || "clear"}` });
    }
    catch (err) { window.SynthXLogger?.warn("sequencer allNotesOff error", reason || "", err); }
  }

  function stopClock(reason) {
    runToken += 1;
    clearTimer("all");
    releaseAllGenerated(reason || "seq-stop");
    updateRuntimeState({ lastAction: reason || "stop" });
  }

  function clear(reason, options) {
    stopClock(reason || "clear");
    cursor = 0;
    lastStepNumber = 0;
    clearAllStepHighlights();
    if (options?.resetPattern) {
      isBatchMutating = true;
      try {
        for (let index = 1; index <= LIMITS.steps; index += 1) writeStepData(index, defaultStep(index), reason || "clear-reset");
      } finally {
        isBatchMutating = false;
      }
      syncClampedUiValues(getConfig());
      lastPatternLabel = PATTERN_PRESETS.default_ascending_8.label;
    }
    if (options?.allAudioOff) safeAllNotesOff(reason || "clear");
    setStatus("Sequencer: pulito · nessuna nota generata.", "ok");
    updateRuntimeState({ lastAction: reason || "clear" });
  }

  function setControlSilently(id, value, source) {
    if (window.SynthXControls?.setControlValue) {
      window.SynthXControls.setControlValue(id, value, source || "sequencer");
      return;
    }
    const el = getEl(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = String(value);
    window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? value, { source: source || "sequencer" });
  }

  function disableControl(reason) {
    setControlSilently("seq-enabled", false, reason || "sequencer-disable");
  }

  function panic(reason) {
    clear(reason || "panic", { allAudioOff: true });
    disableControl(reason || "sequencer-panic");
    window.SynthXLogger?.log("sequencer panic", reason || "manual");
  }

  function sameNoteSet(a, b) {
    const aa = Array.isArray(a) ? a.map(Number).filter(Number.isFinite).sort((x, y) => x - y) : [];
    const bb = Array.isArray(b) ? b.map(Number).filter(Number.isFinite).sort((x, y) => x - y) : [];
    return aa.length === bb.length && aa.every((note, index) => note === bb[index]);
  }

  function scheduleGate(token, rawNotes, gateMs) {
    const notes = Array.isArray(rawNotes) ? rawNotes.slice() : [rawNotes];
    clearTimer("gate");
    gateTimer = window.setTimeout(() => {
      if (token !== runToken) return;
      gateTimer = null;
      if (sameNoteSet(currentRawNotes, notes)) {
        releaseCurrent("seq-gate");
        updateRuntimeState({ lastAction: "gate" });
      }
    }, gateMs);
  }

  function scheduleStep(token, intervalMs) {
    clearTimer("step");
    stepTimer = window.setTimeout(() => {
      if (token !== runToken) return;
      stepTimer = null;
      nextStep(token);
    }, intervalMs);
  }

  function isGeneratedNoteAlive(rawNote) {
    const midi = Number(rawNote);
    return Number.isFinite(midi) && generatedRawNotes.has(midi);
  }

  function assertGeneratedNotesReleased(reason) {
    const leftovers = Array.from(generatedRawNotes).filter((note) => Number.isFinite(Number(note)));
    if (!leftovers.length) return true;
    window.SynthXLogger?.warn?.("sequencer generated-note release invariant failed", { reason: reason || "seq-release", leftovers });
    leftovers.forEach((note) => releaseGeneratedNote(note, reason || "seq-release-invariant"));
    if (generatedRawNotes.size) {
      generatedRawNotes.clear();
      currentRawNotes = [];
      currentVisualNotes = new Map();
      currentRawNote = null;
      currentVisualNote = null;
      currentChord = "off";
      currentTie = false;
      tieHoldSegments = 0;
      safeAllNotesOff(`release-invariant:${reason || "seq"}`);
    }
    return false;
  }

  function runStepChordSafetySelfTest() {
    const failures = [];
    const expect = (condition, label) => { if (!condition) failures.push(label); };
    const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

    expect(CHORD_IDS.length === STEP_CHORD_SAFETY_EXPECTATIONS.presetCount, "preset-count");
    STEP_CHORD_SAFETY_EXPECTATIONS.requiredPresets.forEach((id) => expect(CHORD_PRESETS[id], `preset-present:${id}`));
    expect(LIMITS.maxChordNotes === STEP_CHORD_SAFETY_EXPECTATIONS.maxNotes, "max-chord-notes");
    expect(LIMITS.steps === STEP_CHORD_SAFETY_EXPECTATIONS.totalSteps, "step-count-32");
    expect(Math.max(...STEP_LENGTH_VALUES) === STEP_CHORD_SAFETY_EXPECTATIONS.maxLength, "max-length-32");
    expect(STEP_PATTERN_FORMAT_VERSION === STEP_CHORD_SAFETY_EXPECTATIONS.patternFormatVersion, "pattern-format-version");
    expect(normalizeChordId(undefined, "off") === STEP_CHORD_SAFETY_EXPECTATIONS.legacyDefault, "legacy-default-off");
    expect(normalizeChordId("dominant7", "off") === "dom7", "alias-dominant7");
    expect(normalizeChordId("m7", "off") === "min7", "alias-m7");
    expect(normalizeChordId("power chord", "off") === "power5", "alias-power-chord");
    expect(normalizeChordId("invalid", "off") === "off", "invalid-fallback-off");
    expect(same(buildChordNotes(60, "major"), [60, 64, 67]), "major-notes");
    expect(same(buildChordNotes(60, "min7"), [60, 63, 67, 70]), "min7-notes");
    expect(same(buildChordNotes(60, "major", { chordInversion: 1 }), [64, 67, 72]), "inversion-notes");
    expect(same(buildChordNotes(60, "major", { chordSpread: "open" }), [60, 64, 79]), "open-spread-notes");
    expect(same(buildChordNotes(60, "custom", { chordCustom: "0,5,10,14" }), [60, 65, 70, 74]), "custom-notes");
    expect(buildChordNotes(126, "maj7", { chordSpread: "wide" }).every((note) => note >= 0 && note <= 127), "midi-range-clamp-high");
    expect(chordVelocityScale(1) === 1 && chordVelocityScale(4) < chordVelocityScale(3), "velocity-compensation-order");
    expect(chordVoiceVelocityScale(4, 3, "softTop") < chordVoiceVelocityScale(4, 3, "flat"), "velocity-mode-softtop");
    expect(normalizeChordStrumMs(999, 0) === STEP_CHORD_SAFETY_EXPECTATIONS.maxStrumMs, "strum-clamp");
    expect(safeStepData({ active: true, note: 0, octave: 4 }, defaultStep(1)).chord === "off", "legacy-step-without-chord");

    const seqParamIds = window.SynthXAudioConfig?.SEQ_PARAM_IDS || window.SorgivaSynthAudioConfig?.SEQ_PARAM_IDS || [];
    expect(Array.isArray(seqParamIds), "seq-param-ids-array");
    STEP_CHORD_SAFETY_EXPECTATIONS.requiredSeqParamSuffixes.forEach((suffix) => {
      for (let index = 1; index <= LIMITS.steps; index += 1) {
        expect(seqParamIds.includes(`seq-step-${index}-${suffix}`), `seq-param-id:${index}:${suffix}`);
      }
    });

    const imported = sanitizePatternObject({ label: "QA", length: 32, steps: [
      { active: true, note: 0, octave: 4, chord: "major", chordInversion: 1, chordSpread: "open", chordStrum: 25, chordVelocityMode: "natural" },
      { active: true, note: 2, octave: 4, chord: "dominant7" },
      { active: true, note: 4, octave: 4, chord: "invalid" },
      { active: true, note: 5, octave: 4, chord: "custom", chordCustom: "0,6,12" }
    ] }, "QA");
    expect(imported?.length === 32, "sanitize-length-32");
    expect(imported?.steps?.[0]?.chord === "major", "sanitize-major");
    expect(imported?.steps?.[1]?.chord === "dom7", "sanitize-alias-dom7");
    expect(imported?.steps?.[0]?.chordInversion === 1 && imported?.steps?.[0]?.chordSpread === "open" && imported?.steps?.[0]?.chordStrum === 25 && imported?.steps?.[0]?.chordVelocityMode === "natural", "sanitize-advanced-motion");
    expect(imported?.steps?.[2]?.chord === "off", "sanitize-invalid-off");
    expect(imported?.steps?.[3]?.chord === "custom" && imported?.steps?.[3]?.chordCustom === "0,6,12", "sanitize-custom-step");
    expect(imported?.steps?.length === 32, "sanitize-32-step-array");
    expect(safeStepData({ active: true, note: 11, octave: 4, chord: "minor7" }, defaultStep(32)).chord === "min7", "step-32-chord-alias");

    return Object.freeze({
      ok: failures.length === 0,
      failures,
      presetCount: CHORD_IDS.length,
      maxChordNotes: LIMITS.maxChordNotes,
      patternFormatVersion: STEP_PATTERN_FORMAT_VERSION,
      legacyDefault: STEP_CHORD_SAFETY_EXPECTATIONS.legacyDefault,
      generatedNoteCount: generatedRawNotes.size,
      currentRawNotes: currentRawNotes.slice(),
      checkedAt: new Date().toISOString()
    });
  }

  function triggerSequencerChordVoice(rawNote, voiceIndex, step, token) {
    if (token !== runToken) return;
    if (!currentRawNotes.includes(rawNote)) return;
    const visual = setSequencerKey(rawNote, true);
    if (voiceIndex === 0) currentVisualNote = visual;
    currentVisualNotes.set(rawNote, visual);
    generatedRawNotes.add(rawNote);
    const compensation = chordVelocityScale(currentRawNotes.length);
    const voiceScale = chordVoiceVelocityScale(currentRawNotes.length, voiceIndex, step.chordVelocityMode);
    try { window.SynthXAudio?.noteOn?.(rawNote, clamp(step.velocity * compensation * voiceScale, 0, 1, step.velocity)); }
    catch (err) { window.SynthXLogger?.warn("sequencer chord noteOn error", err); }
  }

  function scheduleSequencerChordVoices(step, token) {
    clearTimer("strum");
    const notes = currentRawNotes.slice(0, LIMITS.maxChordNotes);
    const rawStrum = normalizeChordStrumMs(step?.chordStrum, 0);
    notes.forEach((rawNote, voiceIndex) => {
      const delay = rawStrum > 0 ? rawStrum * voiceIndex : 0;
      if (!delay) {
        triggerSequencerChordVoice(rawNote, voiceIndex, step, token);
        return;
      }
      const timer = window.setTimeout(() => {
        chordStrumTimers = chordStrumTimers.filter((item) => item !== timer);
        triggerSequencerChordVoice(rawNote, voiceIndex, step, token);
      }, delay);
      chordStrumTimers.push(timer);
    });
  }

  function canTieIntoStep(step) {
    // v0.23.0d anti-stuck guard: a tie can continue only if the previous
    // sequencer-generated note is still explicitly tracked as alive.
    // This prevents a stale currentTie/currentRawNote pair from suppressing
    // a needed retrigger after panic, browser throttling, or unusual runtime changes.
    return Boolean(
      currentTie &&
      currentRawNote !== null &&
      step?.active &&
      Number(step.note) === Number(currentRawNote) &&
      normalizeChordId(step.chord, "off") === normalizeChordId(currentChord, "off") &&
      currentRawNotes.length > 0 &&
      currentRawNotes.every((note) => isGeneratedNoteAlive(note)) &&
      sameNoteSet(currentRawNotes, step.chordNotes || [step.note])
    );
  }

  function nextStep(token) {
    if (token !== runToken) return;
    const cfg = getConfig();
    syncClampedUiValues(cfg);
    const safeCfg = getConfig();
    if (!safeCfg.enabled) {
      stopClock("disabled");
      setStatus(`Sequencer: OFF · ${safeCfg.length} step.`, "info");
      return;
    }

    const sequence = buildSequence(safeCfg);
    if (!sequence.length) {
      stopClock("empty");
      setStatus("Sequencer: ON · pattern vuoto.", "warn");
      return;
    }

    const activeSteps = sequence.filter((step) => step.active).length;
    const intervalMs = window.SynthXMidiClock?.getStepIntervalMs?.("sequencer", safeCfg.rate, LIMITS.minIntervalMs) ?? Math.max(LIMITS.minIntervalMs, 1000 / safeCfg.rate);
    const maxGateMs = Math.max(LIMITS.minGateMs, intervalMs - LIMITS.gateTailSafetyMs);
    const step = sequence[cursor % safeCfg.length];
    const stepGate = clamp(step?.gate ?? 1, 0.25, 1, 1);
    const gateMs = Math.min(maxGateMs, Math.max(LIMITS.minGateMs, intervalMs * safeCfg.gate * stepGate));
    const clockLabel = window.SynthXMidiClock?.getEngineClockLabel?.("sequencer") || "Clock interno";
    cursor = (cursor + 1) % Math.max(1, safeCfg.length);
    lastStepNumber = step.index;

    const tieContinues = canTieIntoStep(step);
    if (!tieContinues) releaseCurrent("seq-next-step");
    else clearTimer("gate");
    markStep(step.index, true);

    if (step.active) {
      if (!tieContinues) {
        tieHoldSegments = 0;
        currentRawNote = step.note;
        currentRawNotes = (step.chordNotes && step.chordNotes.length ? step.chordNotes : [step.note]).slice(0, LIMITS.maxChordNotes);
        currentVisualNotes = new Map();
        currentChord = normalizeChordId(step.chord, "off");
        scheduleSequencerChordVoices(step, token);
      } else {
        tieHoldSegments += 1;
        currentRawNote = step.note;
        currentChord = normalizeChordId(step.chord, "off");
        currentRawNotes.forEach((rawNote, voiceIndex) => {
          const visual = setSequencerKey(rawNote, true);
          if (voiceIndex === 0) currentVisualNote = visual;
          currentVisualNotes.set(rawNote, visual);
          generatedRawNotes.add(rawNote);
        });
      }
      currentTie = Boolean(step.tie);
      const accentText = step.accent ? " · Accent" : "";
      const tieText = step.tie ? " · Tie" : "";
      const chordMotionText = step.chord && step.chord !== "off" ? ` inv${step.chordInversion}/${step.chordSpread}${step.chordStrum ? `/${step.chordStrum}ms` : ""}/${step.chordVelocityMode}` : "";
      const chordTextPart = step.chord && step.chord !== "off" ? ` · ${step.chordLabel} (${step.chordNoteNames.join("+")})${chordMotionText}` : "";
      const holdText = tieContinues ? ` · hold/no retrigger ${tieHoldSegments}` : "";
      setStatus(`Sequencer: ON · ${lastPatternLabel} · step ${step.index}/${safeCfg.length} · ${step.noteName}${chordTextPart}${accentText}${tieText}${holdText} · Vel ${step.velocityPercent}% · Gate ${Math.round(safeCfg.gatePercent)}%×${step.gatePercent}% · attivi ${activeSteps}/${safeCfg.length} · ${clockLabel}.`, "ok");
      if (!step.tie) scheduleGate(token, currentRawNotes, gateMs);
    } else {
      currentRawNote = null;
      currentRawNotes = [];
      currentVisualNotes = new Map();
      currentVisualNote = null;
      currentChord = "off";
      currentTie = false;
      tieHoldSegments = 0;
      setStatus(`Sequencer: ON · ${lastPatternLabel} · step ${step.index}/${safeCfg.length} · pausa · attivi ${activeSteps}/${safeCfg.length} · ${clockLabel}.`, "info");
    }

    updateRuntimeState({ lastAction: "step" });
    scheduleStep(token, intervalMs);
  }

  function start(reason) {
    const cfg = getConfig();
    syncClampedUiValues(cfg);
    const safeCfg = getConfig();
    if (!safeCfg.enabled) return;
    if (stepTimer || currentRawNote !== null || currentRawNotes.length > 0 || generatedRawNotes.size > 0) return;
    runToken += 1;
    cursor = 0;
    lastStepNumber = 0;
    releaseAllGenerated(reason || "seq-start");
    nextStep(runToken);
  }

  function stopArpForSequencer() {
    window.SynthXMotion?.setMode?.("sequencer", "sequencer-enabled", { sourceToggle: "sequencer" });
    if (!window.SynthXMotion?.setMode && window.SynthXArpeggiator?.isEnabled?.()) {
      window.SynthXArpeggiator?.panic?.("sequencer-enabled");
      window.SynthXControls?.setControlValue?.("arp-enabled", false, "sequencer-exclusive");
    } else if (!window.SynthXMotion?.setMode) {
      window.SynthXArpeggiator?.clear?.("sequencer-enabled");
    }
  }

  function restartIfEnabled(reason) {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (!stepTimer && currentRawNote === null && currentRawNotes.length === 0 && generatedRawNotes.size === 0) start(reason || "seq-restart");
  }

  function getSelectedEditStep() {
    const cfg = getConfig();
    const preferred = lastStepNumber || 1;
    const index = intClamp(getEl("seq-edit-step")?.value, 1, cfg.length || LIMITS.steps, preferred);
    const edit = getEl("seq-edit-step");
    if (edit) edit.value = String(index);
    markEditStep(index);
    return index;
  }

  function setSelectedEditStep(index) {
    const cfg = getConfig();
    const safe = intClamp(index, 1, cfg.length || LIMITS.steps, 1);
    const edit = getEl("seq-edit-step");
    if (edit) edit.value = String(safe);
    markEditStep(safe);
  }

  function afterPatternMutation(reason, wasEnabled, message, kind) {
    cursor = 0;
    lastStepNumber = 0;
    releaseAllGenerated(reason || "seq-pattern-change");
    clearAllStepHighlights();
    syncClampedUiValues(getConfig());
    const selected = getSelectedEditStep();
    markEditStep(selected);
    if (wasEnabled) {
      safeAllNotesOff(reason || "seq-pattern-change");
      start(reason || "seq-pattern-change");
    }
    if (message) setStatus(message, kind || "ok");
    updateRuntimeState({ lastAction: reason || "seq-pattern-change" });
  }

  function applyPatternSteps(pattern, reason) {
    if (!pattern || !Array.isArray(pattern.steps)) return false;
    const wasEnabled = getConfig().enabled;
    stopClock(reason || "seq-apply-pattern");
    isBatchMutating = true;
    try {
      setControlSilently("seq-length", pattern.length || 8, reason || "seq-apply-pattern");
      for (let index = 1; index <= LIMITS.steps; index += 1) {
        const fallback = defaultStep(index);
        const item = pattern.steps[index - 1] || { ...fallback, active: false };
        writeStepData(index, item, reason || "seq-apply-pattern");
      }
    } finally {
      isBatchMutating = false;
    }
    lastPatternLabel = pattern.label || "Pattern custom";
    afterPatternMutation(reason || "seq-apply-pattern", wasEnabled, `Sequencer: pattern applicato · ${lastPatternLabel}.`, "ok");
    setPatternFeedback("Pattern loaded", "ok");
    return true;
  }

  const USER_PATTERN_STORAGE_KEY = window.SorgivaSynth?.storageKeys?.userSequencerPattern?.key || "sorgivaSynth.userSequencerPattern.v1";
  const LEGACY_USER_PATTERN_STORAGE_KEYS = window.SorgivaSynth?.storageKeys?.userSequencerPattern?.legacy || ["synthx.v0.23.2.userPattern"];

  function patternPresetCount() {
    return Object.entries(PATTERN_PRESETS).filter(([, pattern]) => pattern?.category !== "Legacy / Compat").length;
  }

  function sanitizePatternObject(raw, fallbackLabel) {
    const source = raw?.pattern && Array.isArray(raw.pattern.steps) ? raw.pattern : raw;
    if (!source || !Array.isArray(source.steps)) return null;
    const length = LIMITS.lengthValues.has(Number(source.length)) ? Number(source.length) : intClamp(Array.isArray(source.steps) ? source.steps.length : 8, 3, LIMITS.steps, 8);
    const safeSteps = [];
    for (let index = 1; index <= LIMITS.steps; index += 1) {
      const fallback = defaultStep(index);
      const item = source.steps[index - 1] || { ...fallback, active: index <= length ? fallback.active : false };
      const safe = safeStepData(item, fallback);
      if (index > length) safe.active = false;
      safeSteps.push(safe);
    }
    const labelRaw = String(source.label || raw?.label || fallbackLabel || "User Pattern").trim();
    const categoryRaw = String(source.category || raw?.category || "User / Imported").trim();
    const descriptionRaw = String(source.description || raw?.description || "Pattern utente/importato compatibile Sorgiva Synth; import legacy SynthX accettato.").trim();
    return {
      label: labelRaw.slice(0, 80) || "User Pattern",
      category: categoryRaw.slice(0, 60) || "User / Imported",
      description: descriptionRaw.slice(0, 180) || "Pattern utente/importato compatibile Sorgiva Synth.",
      length,
      steps: safeSteps
    };
  }

  function currentPatternObject(label) {
    const cfg = getConfig();
    const steps = [];
    for (let index = 1; index <= LIMITS.steps; index += 1) steps.push(readStepData(index));
    return {
      label: String(label || lastPatternLabel || "Current Pattern").slice(0, 80),
      category: "User / Exported",
      description: "Pattern esportato da Sorgiva Synth; compatibile con import legacy SynthX.",
      length: cfg.length,
      schema: STEP_PATTERN_SCHEMA,
      formatVersion: STEP_PATTERN_FORMAT_VERSION,
      features: {
        stepChords: true,
        stepChordPresets: CHORD_IDS.slice(),
        stepChordMaxNotes: LIMITS.maxChordNotes,
        stepChordAdvanced: true,
        customIntervals: true,
        inversion: true,
        spread: CHORD_SPREAD_VALUES.slice(),
        strumMsMax: LIMITS.maxChordStrumMs,
        velocityModes: CHORD_VELOCITY_MODES.slice(),
        missingChordFieldDefaultsTo: "off"
      },
      chordStepCount: steps.filter((item) => item.active && item.chord && item.chord !== "off").length,
      chordSummary: steps.map((item, idx) => ({ index: idx + 1, summary: stepSummaryText(item), chord: normalizeChordId(item.chord, "off") })),
      steps
    };
  }

  function readUserPatternText() {
    const primary = window.localStorage?.getItem?.(USER_PATTERN_STORAGE_KEY);
    if (primary) return { raw: primary, key: USER_PATTERN_STORAGE_KEY, legacy: false };
    for (const legacyKey of LEGACY_USER_PATTERN_STORAGE_KEYS || []) {
      const legacyRaw = window.localStorage?.getItem?.(legacyKey);
      if (legacyRaw) {
        try { window.localStorage?.setItem?.(USER_PATTERN_STORAGE_KEY, legacyRaw); } catch (_) {}
        return { raw: legacyRaw, key: legacyKey, legacy: true };
      }
    }
    return null;
  }

  function writeUserPatternText(raw) {
    window.localStorage?.setItem?.(USER_PATTERN_STORAGE_KEY, raw);
    const mirrorKey = LEGACY_USER_PATTERN_STORAGE_KEYS?.[0];
    if (mirrorKey) { try { window.localStorage?.setItem?.(mirrorKey, raw); } catch (_) {} }
  }

  function getUserPattern() {
    try {
      const stored = readUserPatternText();
      if (!stored?.raw) return null;
      return sanitizePatternObject(JSON.parse(stored.raw), "User Pattern");
    } catch (err) {
      window.SynthXLogger?.warn("sequencer user pattern read failed", err);
      return null;
    }
  }

  function ensureUserPatternOption(pattern) {
    const selector = getEl("seq-pattern-preset");
    if (!selector || !pattern) return;
    let option = Array.from(selector.options || []).find((item) => item.value === "user_local");
    if (!option) {
      option = document.createElement("option");
      option.value = "user_local";
      selector.appendChild(option);
    }
    option.textContent = `User · ${pattern.label}`;
  }

  function getPatternById(id) {
    const key = String(id || "default_ascending_8");
    if (key === "user_local") return getUserPattern();
    return PATTERN_PRESETS[key] || PATTERN_PRESETS.default_ascending_8;
  }

  function saveUserPattern() {
    const pattern = currentPatternObject("User Pattern");
    try {
      writeUserPatternText(JSON.stringify(pattern));
      ensureUserPatternOption(pattern);
      const selector = getEl("seq-pattern-preset");
      if (selector) selector.value = "user_local";
      lastPatternLabel = pattern.label;
      setStatus(`Sequencer: user pattern salvato in locale · ${pattern.length} step · ${countActiveSteps(getConfig())}/${pattern.length} attivi · chord ${pattern.chordStepCount || 0}.`, "ok");
      setPatternFeedback("User pattern saved", "ok");
      updateRuntimeState({ lastAction: "seq-save-user-pattern" });
    } catch (err) {
      setStatus("Sequencer: impossibile salvare il pattern locale.", "warn");
      setPatternFeedback("User pattern save failed", "warn");
      window.SynthXLogger?.warn("sequencer user pattern save failed", err);
    }
  }

  function safeFileName(value) {
    return String(value || "sorgiva-pattern")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "sorgiva-pattern";
  }

  function exportCurrentPattern() {
    const pattern = currentPatternObject(lastPatternLabel || "Sorgiva Synth Pattern");
    const payload = {
      ...exportPatternMetadata(),
      type: "sorgiva_synth_step_pattern",
      legacyType: "SynthX Pattern Preset",
      version: STEP_PATTERN_FORMAT_VERSION,
      features: {
        stepChords: true,
        stepChordPresets: CHORD_IDS.slice(),
        stepChordMaxNotes: LIMITS.maxChordNotes,
        stepChordAdvanced: true,
        customIntervals: true,
        inversion: true,
        spread: CHORD_SPREAD_VALUES.slice(),
        strumMsMax: LIMITS.maxChordStrumMs,
        velocityModes: CHORD_VELOCITY_MODES.slice(),
        missingChordFieldDefaultsTo: "off"
      },
      pattern
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileName(pattern.label)}_v0_26_7r2.sorgiva-pattern.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Sequencer: pattern esportato · ${pattern.label}.`, "ok");
      setPatternFeedback("Pattern JSON exported", "ok");
      updateRuntimeState({ lastAction: "seq-export-pattern" });
    } catch (err) {
      setStatus("Sequencer: export pattern non riuscito.", "warn");
      setPatternFeedback("Pattern export failed", "warn");
      window.SynthXLogger?.warn("sequencer pattern export failed", err);
    }
  }

  function requestImportPattern() {
    const input = getEl("seq-pattern-import-file");
    if (!input) {
      setStatus("Sequencer: input import pattern non trovato.", "warn");
      setPatternFeedback("Pattern import unavailable", "warn");
      return;
    }
    input.value = "";
    input.click();
  }

  function importPatternObject(raw, reason) {
    const pattern = sanitizePatternObject(raw, "Imported Pattern");
    if (!pattern) {
      setStatus("Sequencer: file pattern non valido.", "warn");
      setPatternFeedback("Pattern import failed", "warn");
      return false;
    }
    pattern.label = pattern.label || "Imported Pattern";
    const wasEnabled = getConfig().enabled;
    stopClock(reason || "seq-import-pattern");
    isBatchMutating = true;
    try {
      setControlSilently("seq-length", pattern.length, reason || "seq-import-pattern");
      for (let index = 1; index <= LIMITS.steps; index += 1) writeStepData(index, pattern.steps[index - 1], reason || "seq-import-pattern");
    } finally {
      isBatchMutating = false;
    }
    lastPatternLabel = pattern.label;
    afterPatternMutation(reason || "seq-import-pattern", wasEnabled, `Sequencer: pattern importato · ${pattern.label} · chord ${pattern.steps.filter((item) => item.active && item.chord && item.chord !== "off").length}.`, "ok");
    setPatternFeedback("Pattern imported", "ok");
    return true;
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        importPatternObject(parsed, "seq-import-pattern");
      } catch (err) {
        setStatus("Sequencer: JSON pattern non valido.", "warn");
        setPatternFeedback("Pattern import failed", "warn");
        window.SynthXLogger?.warn("sequencer pattern import parse failed", err);
      }
    };
    reader.onerror = () => {
      setStatus("Sequencer: lettura file pattern non riuscita.", "warn");
      setPatternFeedback("Pattern import failed", "warn");
    };
    reader.readAsText(file);
  }

  function applySelectedPattern() {
    const id = String(getEl("seq-pattern-preset")?.value || "default_ascending_8");
    const pattern = getPatternById(id) || PATTERN_PRESETS.default_ascending_8;
    applyPatternSteps(pattern, "seq-apply-pattern");
  }

  function resetPattern() {
    const selector = getEl("seq-pattern-preset");
    if (selector) selector.value = "default_ascending_8";
    applyPatternSteps(PATTERN_PRESETS.default_ascending_8, "seq-reset-pattern");
  }

  function randomChoice(items, fallback) {
    const list = Array.isArray(items) && items.length ? items : [fallback];
    return list[Math.floor(Math.random() * list.length)] ?? fallback;
  }

  function randomBetweenInt(min, max, fallback) {
    const lo = Math.round(Number(min));
    const hi = Math.round(Number(max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return Math.round(Number(fallback) || 0);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function chance(probability) {
    return Math.random() < clamp(probability, 0, 1, 0);
  }

  function normalizeRandomizerChoice(id, allowed, fallback) {
    const value = String(getEl(id)?.value || fallback || "").trim();
    return Object.prototype.hasOwnProperty.call(allowed, value) || (allowed instanceof Set && allowed.has(value)) ? value : fallback;
  }

  function getSequencerRandomizerSettings() {
    const style = normalizeRandomizerChoice("seq-randomize-style", SEQUENCER_RANDOMIZER_PROFILES, "safe");
    const density = normalizeRandomizerChoice("seq-randomize-density", RANDOMIZER_DENSITY_PROFILES, "balanced");
    const scopeValues = new Set(["full", "notes", "rhythm", "chords", "velocity_gate"]);
    const scope = normalizeRandomizerChoice("seq-randomize-scope", scopeValues, "full");
    return {
      style,
      density,
      scope,
      keepLength: getEl("seq-randomize-keep-length")?.checked !== false,
      profile: SEQUENCER_RANDOMIZER_PROFILES[style] || SEQUENCER_RANDOMIZER_PROFILES.safe,
      densityProfile: RANDOMIZER_DENSITY_PROFILES[density] || RANDOMIZER_DENSITY_PROFILES.balanced
    };
  }

  function adjustedProbability(base, settings, kind) {
    const density = settings?.densityProfile || RANDOMIZER_DENSITY_PROFILES.balanced;
    if (kind === "active") return clamp(Number(base || 0) + density.activeDelta, 0.18, 0.94, base || 0.7);
    if (kind === "chord") return clamp(Number(base || 0) * density.chordMul, 0, 0.72, base || 0.1);
    if (kind === "tie") return clamp(Number(base || 0) * density.tieMul, 0, 0.30, base || 0.05);
    if (kind === "accent") return clamp(Number(base || 0) * density.accentMul, 0, 0.58, base || 0.2);
    return clamp(base, 0, 1, 0);
  }

  function chooseRandomizerLength(settings, currentLength) {
    const profile = settings.profile || SEQUENCER_RANDOMIZER_PROFILES.safe;
    if (settings.keepLength || settings.scope !== "full") return currentLength;
    return intClamp(randomChoice(profile.lengths, currentLength), 3, LIMITS.steps, currentLength);
  }

  function makeRandomSequencerStep(index, length, settings, previous, current) {
    const profile = settings.profile || SEQUENCER_RANDOMIZER_PROFILES.safe;
    const scope = settings.scope || "full";
    const fallback = defaultStep(index);
    const old = safeStepData(current || fallback, fallback);
    const canChangeNotes = scope === "full" || scope === "notes";
    const canChangeRhythm = scope === "full" || scope === "rhythm";
    const canChangeChords = scope === "full" || scope === "chords";
    const canChangeVelocityGate = scope === "full" || scope === "velocity_gate" || scope === "rhythm";

    if (index > length) return { ...old, active: false, accent: false, tie: false, chord: "off", chordStrum: 0 };

    const activeProbability = adjustedProbability(profile.active, settings, "active");
    const forceActive = index === 1 || previous.pauseRun >= 2;
    const active = canChangeRhythm ? (forceActive || chance(activeProbability)) : old.active;
    if (!active) {
      previous.pauseRun += 1;
      previous.lastWasActive = false;
      return { ...old, active: false, accent: false, tie: false };
    }

    previous.pauseRun = 0;
    let note = old.note;
    let octave = old.octave;
    if (canChangeNotes) {
      const reusePrevious = previous.lastWasActive && chance(0.18);
      note = reusePrevious ? previous.note : randomChoice(profile.scale || RANDOM_SAFE_SCALE, old.note);
      const octaveBase = intClamp(profile.baseOctave, LIMITS.octaveMin, LIMITS.octaveMax, old.octave);
      const octaveLift = chance(profile.jump || 0.2) ? randomChoice([0, 0, 1, 1, 2], 0) : 0;
      const octaveDrop = profile.baseOctave <= 2 && chance(0.16) ? -1 : 0;
      octave = intClamp(octaveBase + octaveLift + octaveDrop, LIMITS.octaveMin, LIMITS.octaveMax, octaveBase);
    }

    let velocity = old.velocity;
    let gate = old.gate;
    let accent = old.accent;
    if (canChangeVelocityGate) {
      const range = profile.velocity || [70, 110];
      velocity = intClamp(randomBetweenInt(range[0], range[1], old.velocity), LIMITS.velocityMin, LIMITS.velocityMax, old.velocity);
      gate = normalizeStepGatePercent(randomChoice(profile.gates, old.gate), old.gate);
      accent = chance(adjustedProbability(profile.accent, settings, "accent"));
      if (accent) velocity = intClamp(velocity + randomChoice([4, 6, 8], 6), LIMITS.velocityMin, LIMITS.velocityMax, velocity);
    }

    let chord = old.chord;
    let chordCustom = old.chordCustom;
    let chordInversion = old.chordInversion;
    let chordSpread = old.chordSpread;
    let chordStrum = old.chordStrum;
    let chordVelocityMode = old.chordVelocityMode;
    if (canChangeChords) {
      const chordChance = adjustedProbability(profile.chord, settings, "chord");
      chord = chance(chordChance) ? randomChoice(profile.chords, "off") : "off";
      if (chord === "custom") chordCustom = randomChoice(profile.custom, "0,4,7");
      else chordCustom = randomChoice(profile.custom, "0,4,7");
      const chordNoteCount = buildChordIntervals(chord, { chordCustom }).length;
      chordInversion = chord !== "off" && chordNoteCount > 2 && chance(0.38) ? randomBetweenInt(0, Math.min(3, chordNoteCount - 1), 0) : 0;
      chordSpread = chord !== "off" ? randomChoice(profile.spread, "close") : "close";
      chordStrum = chord !== "off" ? normalizeChordStrumMs(randomChoice(profile.strum, 0), 0) : 0;
      chordVelocityMode = chord !== "off" ? randomChoice(CHORD_VELOCITY_MODES, "balanced") : "balanced";
    }

    let tie = old.tie;
    if (canChangeRhythm) {
      const sameAsPrevious = previous.lastWasActive && previous.tieContinuation && chance(0.78);
      if (sameAsPrevious) {
        note = previous.note;
        octave = previous.octave;
        chord = previous.chord;
        chordCustom = previous.chordCustom;
        chordInversion = previous.chordInversion;
        chordSpread = previous.chordSpread;
        chordStrum = previous.chordStrum;
        chordVelocityMode = previous.chordVelocityMode;
      }
      tie = sameAsPrevious ? chance(0.22) : chance(adjustedProbability(profile.tie, settings, "tie"));
      if (index >= length) tie = false;
    }

    previous.lastWasActive = true;
    previous.note = note;
    previous.octave = octave;
    previous.chord = chord;
    previous.chordCustom = chordCustom;
    previous.chordInversion = chordInversion;
    previous.chordSpread = chordSpread;
    previous.chordStrum = chordStrum;
    previous.chordVelocityMode = chordVelocityMode;
    previous.tieContinuation = Boolean(tie);

    return safeStepData({ active, note, octave, velocity, gate, accent, tie, chord, chordCustom, chordInversion, chordSpread, chordStrum, chordVelocityMode }, fallback);
  }

  function randomizerCanChangeRhythm(settings) {
    const scope = settings?.scope || "full";
    return scope === "full" || scope === "rhythm";
  }

  function randomizerCanChangeChords(settings) {
    const scope = settings?.scope || "full";
    return scope === "full" || scope === "chords";
  }

  function randomizerCanChangeVelocityGate(settings) {
    const scope = settings?.scope || "full";
    return scope === "full" || scope === "velocity_gate" || scope === "rhythm";
  }

  function randomizerMinimumActiveSteps(length, settings) {
    const len = intClamp(length, 3, LIMITS.steps, 8);
    const style = String(settings?.style || "safe");
    if (style === "minimal") return Math.max(1, Math.round(len * 0.18));
    if (style === "ambient" || style === "cinematic") return Math.max(2, Math.round(len * 0.24));
    if (style === "chord_pulse") return Math.max(2, Math.round(len * 0.28));
    return Math.max(2, Math.round(len * 0.30));
  }

  function randomizerMaxChordSteps(activeCount, settings) {
    const active = Math.max(0, Math.round(Number(activeCount) || 0));
    if (!active) return 0;
    const style = String(settings?.style || "safe");
    const density = String(settings?.density || "balanced");
    let ratio = 0.34;
    if (style === "chord_pulse") ratio = 0.68;
    else if (style === "ambient" || style === "cinematic") ratio = 0.62;
    else if (style === "chaos_safe" || style === "performance_test") ratio = 0.46;
    else if (style === "bassline" || style === "acid" || style === "chiptune") ratio = 0.24;
    if (density === "sparse") ratio *= 0.80;
    if (density === "wild") ratio *= 1.08;
    return Math.max(1, Math.min(active, Math.round(active * ratio)));
  }

  function randomizerMaxStrumMs(settings) {
    const style = String(settings?.style || "safe");
    if (style === "ambient" || style === "cinematic") return 80;
    if (style === "chord_pulse" || style === "chaos_safe") return 60;
    if (style === "performance_test") return 40;
    if (style === "bassline" || style === "acid" || style === "chiptune") return 10;
    return 30;
  }

  function deactivateChordStep(step) {
    return { ...safeStepData(step, DEFAULT_PATTERN[0]), chord: "off", chordCustom: "0,4,7", chordInversion: 0, chordSpread: "close", chordStrum: 0, chordVelocityMode: "balanced" };
  }

  function enforceSequencerRandomizerSafety(length, settings) {
    const len = intClamp(length, 3, LIMITS.steps, 8);
    const canChangeRhythm = randomizerCanChangeRhythm(settings);
    const canChangeChords = randomizerCanChangeChords(settings);
    const canChangeVelocityGate = randomizerCanChangeVelocityGate(settings);
    const steps = [];
    const corrections = { activated: 0, tiesCleared: 0, chordsTrimmed: 0, strumClamped: 0, velocityRaised: 0, outsideCleared: 0 };

    for (let index = 1; index <= LIMITS.steps; index += 1) {
      const fallback = defaultStep(index);
      const step = safeStepData(readStepData(index), fallback);
      if (index > len && (step.active || step.accent || step.tie || step.chord !== "off" || step.chordStrum)) {
        corrections.outsideCleared += 1;
        steps.push({ ...step, active: false, accent: false, tie: false, chord: "off", chordCustom: "0,4,7", chordInversion: 0, chordSpread: "close", chordStrum: 0, chordVelocityMode: "balanced" });
      } else {
        steps.push(step);
      }
    }

    if (canChangeRhythm) {
      const minActive = randomizerMinimumActiveSteps(len, settings);
      let activeInside = steps.slice(0, len).filter((step) => step.active).length;
      const preferred = [1, Math.ceil(len / 2), len, 3, 5, 7, 9, 13, 17, 21, 25, 29].filter((index, pos, list) => index >= 1 && index <= len && list.indexOf(index) === pos);
      for (const index of preferred) {
        if (activeInside >= minActive) break;
        const step = steps[index - 1];
        if (!step.active) {
          steps[index - 1] = { ...step, active: true, note: step.note ?? 0, octave: intClamp(step.octave, LIMITS.octaveMin, LIMITS.octaveMax, settings?.profile?.baseOctave || 3), velocity: Math.max(72, step.velocity || 0), gate: normalizeStepGatePercent(step.gate, 75), accent: index === 1, tie: false };
          activeInside += 1;
          corrections.activated += 1;
        }
      }
    }

    // Safety overrides scope: invalid tie/hold states can create ambiguous sustained notes,
    // so they are normalized even when the chosen randomizer scope is Notes/Chords/Velocity only.
    let tieRun = 0;
    for (let index = 1; index <= len; index += 1) {
      const step = steps[index - 1];
      if (!step.active) { tieRun = 0; continue; }
      const next = index < len ? steps[index] : null;
      if (step.tie && (!next?.active || index >= len)) {
        steps[index - 1] = { ...step, tie: false };
        corrections.tiesCleared += 1;
        tieRun = 0;
        continue;
      }
      if (step.tie) {
        tieRun += 1;
        if (tieRun > 2) {
          steps[index - 1] = { ...step, tie: false };
          corrections.tiesCleared += 1;
          tieRun = 0;
        }
      } else {
        tieRun = 0;
      }
    }

    if (canChangeChords) {
      const activeCount = steps.slice(0, len).filter((step) => step.active).length;
      const maxChordSteps = randomizerMaxChordSteps(activeCount, settings);
      const chordIndices = steps.slice(0, len).map((step, idx) => step.active && step.chord && step.chord !== "off" ? idx : -1).filter((idx) => idx >= 0);
      if (chordIndices.length > maxChordSteps) {
        const overflow = chordIndices.length - maxChordSteps;
        let removed = 0;
        for (let i = chordIndices.length - 1; i >= 0 && removed < overflow; i -= 1) {
          const idx = chordIndices[i];
          steps[idx] = deactivateChordStep(steps[idx]);
          removed += 1;
        }
        corrections.chordsTrimmed += removed;
      }

      const maxStrum = randomizerMaxStrumMs(settings);
      for (let index = 1; index <= len; index += 1) {
        const step = steps[index - 1];
        if (!step.active || !step.chord || step.chord === "off") continue;
        if (Number(step.chordStrum || 0) > maxStrum) {
          steps[index - 1] = { ...step, chordStrum: maxStrum };
          corrections.strumClamped += 1;
        }
      }
    }

    if (canChangeVelocityGate) {
      for (let index = 1; index <= len; index += 1) {
        const step = steps[index - 1];
        if (!step.active) continue;
        if (Number(step.velocity || 0) < 45) {
          steps[index - 1] = { ...step, velocity: 45 };
          corrections.velocityRaised += 1;
        }
      }
    }

    const totalCorrections = Object.values(corrections).reduce((sum, value) => sum + value, 0);
    if (totalCorrections > 0) {
      for (let index = 1; index <= LIMITS.steps; index += 1) writeStepData(index, steps[index - 1], "seq-randomize-safety-qa");
    }
    return { ...corrections, total: totalCorrections };
  }

  function randomizerCorrectionSummary(corrections) {
    if (!corrections?.total) return "safety clean";
    const parts = [];
    if (corrections.activated) parts.push(`active +${corrections.activated}`);
    if (corrections.tiesCleared) parts.push(`tie cleared ${corrections.tiesCleared}`);
    if (corrections.chordsTrimmed) parts.push(`chord trimmed ${corrections.chordsTrimmed}`);
    if (corrections.strumClamped) parts.push(`strum clamp ${corrections.strumClamped}`);
    if (corrections.velocityRaised) parts.push(`velocity floor ${corrections.velocityRaised}`);
    if (corrections.outsideCleared) parts.push(`outside cleared ${corrections.outsideCleared}`);
    return parts.join(" · ") || "safety corrected";
  }

  function randomizePattern() {
    const cfg = getConfig();
    const wasEnabled = cfg.enabled;
    const settings = getSequencerRandomizerSettings();
    const length = chooseRandomizerLength(settings, cfg.length);
    const previous = { pauseRun: 0, lastWasActive: false, tieContinuation: false, note: 0, octave: settings.profile.baseOctave || 3, chord: "off", chordCustom: "0,4,7", chordInversion: 0, chordSpread: "close", chordStrum: 0, chordVelocityMode: "balanced" };
    stopClock("seq-randomize");
    isBatchMutating = true;
    try {
      setControlSilently("seq-length", length, "seq-randomize");
      for (let index = 1; index <= LIMITS.steps; index += 1) {
        const current = readStepData(index);
        const next = makeRandomSequencerStep(index, length, settings, previous, current);
        writeStepData(index, next, "seq-randomize");
      }
      var safetyCorrections = enforceSequencerRandomizerSafety(length, settings);
    } finally {
      isBatchMutating = false;
    }
    const safeCfg = getConfig();
    const activeCount = countActiveSteps(safeCfg);
    const chordCount = countChordSteps(safeCfg);
    const safetySummary = randomizerCorrectionSummary(typeof safetyCorrections === "object" ? safetyCorrections : null);
    lastPatternLabel = `Random ${settings.profile.label}`;
    afterPatternMutation("seq-randomize", wasEnabled, `Sequencer: randomizer ${settings.profile.label} · ${settings.densityProfile.label} · ${settings.scope} · ${activeCount}/${length} step attivi · chord ${chordCount} · ${safetySummary}.`, "ok");
    setPatternFeedback(`Randomized: ${settings.profile.label} · ${settings.densityProfile.label} · ${settings.scope} · ${safetySummary}`, "ok");
  }

  function copyStep() {
    const index = getSelectedEditStep();
    stepClipboard = readStepData(index);
    setStatus(`Sequencer: copiato Step ${index} · ${stepDataName(stepClipboard)}.`, "ok");
    updateRuntimeState({ lastAction: "seq-copy-step" });
  }

  function pasteStep() {
    const index = getSelectedEditStep();
    if (!stepClipboard) {
      setStatus("Sequencer: nessuno step copiato.", "warn");
      return;
    }
    const wasEnabled = getConfig().enabled;
    stopClock("seq-paste-step");
    isBatchMutating = true;
    try {
      writeStepData(index, stepClipboard, "seq-paste-step");
    } finally {
      isBatchMutating = false;
    }
    lastPatternLabel = "Pattern custom";
    afterPatternMutation("seq-paste-step", wasEnabled, `Sequencer: incollato su Step ${index} · ${stepDataName(stepClipboard)}.`, "ok");
  }

  function onPatternAction(action) {
    if (action === "seq-apply-pattern") { applySelectedPattern(); return true; }
    if (action === "seq-reset-pattern") { resetPattern(); return true; }
    if (action === "seq-randomize") { randomizePattern(); return true; }
    if (action === "seq-save-user-pattern") { saveUserPattern(); return true; }
    if (action === "seq-export-pattern") { exportCurrentPattern(); return true; }
    if (action === "seq-import-pattern") { requestImportPattern(); return true; }
    if (action === "seq-copy-step") { copyStep(); return true; }
    if (action === "seq-paste-step") { pasteStep(); return true; }
    return false;
  }

  function onControlChange(id) {
    const controlId = String(id || "");
    if (isBatchMutating) return;
    if (controlId === "seq-edit-step") { getSelectedEditStep(); updateRuntimeState({ lastAction: "seq-edit-step" }); return; }
    if (!controlId.startsWith("seq-") || controlId === "seq-pattern-preset") return;
    const cfg = getConfig();
    syncClampedUiValues(cfg);
    const safeCfg = getConfig();

    if (controlId === "seq-enabled") {
      if (safeCfg.enabled) {
        stopArpForSequencer();
        releaseAllGenerated("seq-enabled-reset");
        safeAllNotesOff("seq-enabled");
        start("seq-enabled");
      } else {
        stopClock("seq-disabled");
        safeAllNotesOff("seq-disabled");
        window.SynthXMotion?.reconcile?.("seq-disabled");
        setStatus(`Sequencer: OFF · ${safeCfg.length} step.`, "info");
      }
      updateRuntimeState({ lastAction: controlId });
      window.SynthXMotion?.updateRuntime?.(controlId);
      return;
    }

    if (controlId === "seq-length") {
      cursor = 0;
      releaseAllGenerated("seq-length-change");
      clearAllStepHighlights();
      setSelectedEditStep(Math.min(getSelectedEditStep(), safeCfg.length));
      restartIfEnabled("seq-length-change");
    } else if (controlId === "seq-rate" || controlId === "seq-gate") {
      releaseAllGenerated(`param:${controlId}`);
      restartIfEnabled(`param:${controlId}`);
    } else if (controlId.includes("-active") || controlId.includes("-note") || controlId.includes("-octave") || controlId.includes("-velocity") || controlId.includes("-gate") || controlId.includes("-accent") || controlId.includes("-tie") || controlId.includes("-chord")) {
      lastPatternLabel = "Pattern custom";
      releaseAllGenerated(`param:${controlId}`);
      restartIfEnabled(`param:${controlId}`);
    }

    updateRuntimeState({ lastAction: `param:${controlId}` });
  }

  function handlePerformanceChange(id) {
    if (!getConfig().enabled && generatedRawNotes.size === 0) return;
    const controlId = String(id || "");
    const restartable = new Set(["performance-hold-enabled", "performance-glide-enabled", "performance-glide-ms"]);
    if (controlId === "performance-octave" || controlId === "performance-mode") {
      panic(`performance-change:${controlId}`);
      setStatus("Sequencer: fermato per cambio Performance/Mono-Poly/Octave. Riaccendilo per ripartire.", "info");
      return;
    }
    if (restartable.has(controlId)) {
      stopClock(`performance-change:${controlId}`);
      safeAllNotesOff(`performance-change:${controlId}`);
      if (getConfig().enabled) start(`performance-change:${controlId}`);
      updateRuntimeState({ lastAction: `performance-change:${controlId}` });
    }
  }


  function resyncClock(reason) {
    if (!getConfig().enabled) return;
    stopClock(reason || "midi-clock-resync");
    cursor = 0;
    lastStepNumber = 0;
    start(reason || "midi-clock-resync");
  }

  function initPatternPresetSelect() {
    const selector = getEl("seq-pattern-preset");
    if (!selector) return;
    const previous = selector.value || "default_ascending_8";
    selector.innerHTML = "";
    const groups = new Map();
    Object.entries(PATTERN_PRESETS).forEach(([id, pattern]) => {
      if (pattern?.category === "Legacy / Compat") return;
      const category = pattern?.category || "Pattern Presets";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push([id, pattern]);
    });
    groups.forEach((items, category) => {
      const group = document.createElement("optgroup");
      group.label = category;
      items.forEach(([id, pattern]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = pattern.label;
        option.title = pattern.description || "";
        group.appendChild(option);
      });
      selector.appendChild(group);
    });
    const compat = document.createElement("optgroup");
    compat.label = "Legacy / Compat";
    ["default_ascending_8", "minor_shadow_8", "bass_pulse_8", "organ_walk_8", "pad_breath_16", "industrial_16"].forEach((id) => {
      const pattern = PATTERN_PRESETS[id];
      if (!pattern) return;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = pattern.label;
      option.title = pattern.description || "";
      compat.appendChild(option);
    });
    selector.appendChild(compat);
    ensureUserPatternOption(getUserPattern());
    const values = new Set(Array.from(selector.options || []).map((option) => option.value));
    selector.value = values.has(previous) ? previous : "seqk_berlin_gate_8";
  }

  function init() {
    initPatternPresetSelect();
    updateAllStepSummaries();
    const importInput = getEl("seq-pattern-import-file");
    if (importInput) importInput.addEventListener("change", () => handleImportFile(importInput.files?.[0]));
    syncClampedUiValues(getConfig());
    setSelectedEditStep(1);
    getEl("seq-edit-step")?.addEventListener("change", () => onControlChange("seq-edit-step"));
    window.addEventListener("blur", () => {
      if (getConfig().enabled || generatedRawNotes.size) panic("window-blur");
    });
    window.addEventListener("beforeunload", () => {
      if (getConfig().enabled || generatedRawNotes.size) panic("beforeunload");
    });
    updateRuntimeState({ lastAction: "init" });
  }

  function syncUi(reason) {
    syncClampedUiValues(getConfig());
    setSelectedEditStep(getSelectedEditStep());
    updateRuntimeState({ lastAction: reason || "seq-sync-ui" });
  }

  window.SynthXSequencer = {
    init,
    syncUi,
    start,
    stop: stopClock,
    resyncClock,
    clear,
    panic,
    onControlChange,
    handlePerformanceChange,
    onPatternAction,
    applySelectedPattern,
    randomizePattern,
    resetPattern,
    copyStep,
    pasteStep,
    saveUserPattern,
    exportCurrentPattern,
    importPatternObject,
    isEnabled: () => getConfig().enabled,
    getConfig,
    getCurrentRawNote: () => currentRawNote,
    getCurrentRawNotes: () => currentRawNotes.slice(),
    getCurrentChord: () => currentChord,
    getCurrentChordLabel: () => chordText(currentChord),
    getCurrentTie: () => Boolean(currentTie),
    getTieHoldSegments: () => tieHoldSegments,
    getCurrentNoteName: () => currentRawNote === null ? "" : `${noteName(currentRawNote)}${currentChord !== "off" ? ` ${chordShort(currentChord) || chordText(currentChord)}` : ""}`,
    getCurrentStep: () => lastStepNumber,
    getGeneratedNoteCount: () => generatedRawNotes.size,
    getChordPresetIds: () => CHORD_IDS.slice(),
    getChordSpreadIds: () => CHORD_SPREAD_VALUES.slice(),
    getChordVelocityModes: () => CHORD_VELOCITY_MODES.slice(),
    getActiveStepCount: () => countActiveSteps(getConfig()),
    getChordStepCount: () => countChordSteps(getConfig()),
    getChordPatternSummary: () => chordPatternSummary(getConfig()),
    getChordMotionSummary: () => chordMotionSummary(getConfig()),
    getStepChordSafetyReport: runStepChordSafetySelfTest,
    runStepChordSafetySelfTest,
    getExclusionStatus: exclusionStatus,
    getSequencePreview: () => sequencePreview(getConfig()),
    getLastPatternLabel: () => lastPatternLabel,
    getClipboardStepName: () => stepClipboard ? stepDataName(stepClipboard) : "",
    getPatternPresetIds: () => Object.keys(PATTERN_PRESETS),
    getPatternPresetCount: patternPresetCount
  };
})();
