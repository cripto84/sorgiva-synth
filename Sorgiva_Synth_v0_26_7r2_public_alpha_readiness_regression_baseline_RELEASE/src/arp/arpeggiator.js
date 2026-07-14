(function () {
  "use strict";

  const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const MODES = new Set(["up", "down", "updown", "random", "asplayed"]);
  const LIMITS = Object.freeze({
    rateMin: 0.5,
    rateMax: 16,
    gateMin: 10,
    gateMax: 95,
    swingMin: 0,
    swingMax: 40,
    octavesMin: 1,
    octavesMax: 4,
    minIntervalMs: 40,
    minGateMs: 8,
    gateTailSafetyMs: 4,
    previewMax: 12
  });


  const ARP_PRESET_SCHEMA = "sorgiva-synth-arp-behavior-v1";
  const ARP_PRESET_FORMAT_ID = "sorgiva-synth-arp-preset";
  const LEGACY_ARP_PRESET_SCHEMAS = Object.freeze(["synthx-arp-behavior-v1"]);
  const USER_ARP_PRESET_STORAGE_KEY = window.SorgivaSynth?.storageKeys?.userArpPreset?.key || "sorgivaSynth.userArpPreset.v1";
  const LEGACY_USER_ARP_PRESET_STORAGE_KEYS = window.SorgivaSynth?.storageKeys?.userArpPreset?.legacy || ["synthx.v0.23.3.userArpPreset"];
  const APP_VERSION = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || "0.26.7r2-public-alpha-readiness-regression-baseline";
  function exportMetadata() {
    if (window.SorgivaSynth?.buildExportMetadata) return window.SorgivaSynth.buildExportMetadata("arpPreset", { format: ARP_PRESET_FORMAT_ID, schema: ARP_PRESET_SCHEMA, formatVersion: "1.0" });
    return { project: "Sorgiva Synth", format: ARP_PRESET_FORMAT_ID, schema: ARP_PRESET_SCHEMA, formatVersion: "1.0", appVersion: APP_VERSION, sorgivaVersion: APP_VERSION, sorgivaSynthVersion: APP_VERSION, synthxVersion: APP_VERSION, exportedBy: "Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline", exportedAt: new Date().toISOString(), compatibility: { legacySynthXImport: true, legacySchemasAccepted: LEGACY_ARP_PRESET_SCHEMAS } };
  }

  const ARP_MOTION_PATTERNS = Object.freeze({
    linear: {
      label: "Linear",
      description: "Comportamento storico: la sequenza segue solo mode e octave range.",
      steps: null
    },
    octave_bounce: {
      label: "Octave Bounce",
      description: "Alterna basso/alto in modo leggibile, senza diventare un pattern scritto.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [0, -1, 1, -2, 2, -1, 1, -2]
    },
    broken_octave: {
      label: "Broken Octave",
      description: "Ottave rotte con ritorno alla nota-base: chiaro su 1 nota + 2 ottave o accordi semplici.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [0, -1, 0, 1, -2, 1, 2, -1]
    },
    wide_octave_jump: {
      label: "Wide Octave Jump",
      description: "Salti ampi basso/alto, più sensati con 3+ note generate o Octave Range 3+.",
      minGeneratedNotes: 4,
      fallback: "octave_bounce",
      steps: [0, -1, 1, -2, 2, -3, 3, -1]
    },
    anchor_ostinato: {
      label: "Anchor Ostinato",
      description: "Ritorna spesso alla prima nota del buffer per linee di basso ostinate e controllabili.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [0, 1, 0, 2, 0, 3, 0, 2]
    },
    tangerine_motion: {
      label: "Tangerine Motion",
      description: "Movimento sequenziale non lineare, più vivo del semplice Up ma ancora prevedibile.",
      minGeneratedNotes: 3,
      fallback: "octave_bounce",
      steps: [0, 2, 1, -2, 2, -1, 3, 1]
    },
    acid_runner: {
      label: "Acid Runner",
      description: "Runner corto con ritorni controllati, accenti leggeri e nessuna melodia fissa.",
      minGeneratedNotes: 3,
      fallback: "anchor_ostinato",
      steps: [0, { index: 1, velocityScale: 1.08 }, 0, 2, { index: -1, velocityScale: 1.12 }, 2, 0, 1]
    },
    chiptune_jump: {
      label: "Chiptune Jump",
      description: "Salti secchi e arcade-friendly; efficace anche con una sola nota su 2+ ottave.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [0, -1, 0, 1, -2, 1, 0, -1]
    },
    syncopated_pluck: {
      label: "Syncopated Pluck",
      description: "Alterna gate e accenti leggeri per un feel sincopato ma ancora suonabile.",
      minGeneratedNotes: 3,
      fallback: "gate_pulse",
      steps: [
        { index: 0, gateScale: 0.74 }, { index: 1, gateScale: 1.14, velocityScale: 1.08 },
        { index: -1, gateScale: 0.70 }, { index: 2, gateScale: 1.18 },
        { index: 0, gateScale: 0.78 }, { index: -2, gateScale: 1.10, velocityScale: 1.10 }
      ]
    },
    gate_pulse: {
      label: "Gate Pulse",
      description: "Ripetizioni controllate con gate alternato: impulso, respiro, impulso.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [
        { index: 0, gateScale: 0.55 }, { index: 0, gateScale: 1.20 },
        { index: 1, gateScale: 0.55 }, { index: -1, gateScale: 1.15 },
        { index: 1, gateScale: 0.55 }, { index: 0, gateScale: 1.20 }
      ]
    },
    cinematic_motion: {
      label: "Slow Cinematic Motion",
      description: "Movimento ampio e non nervoso, pensato per rate lenti, pad e delay sync.",
      minGeneratedNotes: 4,
      fallback: "octave_bounce",
      steps: [0, 1, 3, 2, -2, -3, -1, 2]
    },
    industrial_machine: {
      label: "Industrial Machine",
      description: "Ordine meccanico spezzato con micro-accenti, gate corto e ritorni duri.",
      minGeneratedNotes: 3,
      fallback: "gate_pulse",
      steps: [
        { index: 0, gateScale: 0.62, velocityScale: 1.10 }, 2, 1,
        { index: 2, gateScale: 0.58 }, 0, -1, 1, { index: -1, velocityScale: 1.12 }
      ]
    },
    minimal_techno: {
      label: "Minimal Techno Pulse",
      description: "Pochi gradi ripetuti, chiari e ipnotici: differenza minima ma intenzionale.",
      minGeneratedNotes: 2,
      fallback: "linear",
      steps: [0, 1, 0, 1, 2, 1, 0, 1]
    },
    mediterranean_chiptune: {
      label: "Mediterranean Chiptune",
      description: "Salti brillanti e asimmetrici, con ritorni melodici più cantabili del chip puro.",
      minGeneratedNotes: 4,
      fallback: "chiptune_jump",
      steps: [0, 1, 3, 1, 0, -1, 2, 1, -2, 3, 1, 0]
    }
  });


  const ARP_BEHAVIOR_PRESETS = Object.freeze({
    classic_up_1_oct: { label: "Classic Up 1 Oct", category: "Classic", description: "Default neutro: salita semplice a una ottava.", config: { mode: "up", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    classic_down_1_oct: { label: "Classic Down 1 Oct", category: "Classic", description: "Discesa semplice per bassi e linee synth classiche.", config: { mode: "down", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    classic_updown_2_oct: { label: "Classic Up-Down 2 Oct", category: "Classic", description: "Movimento su/giu prudente a due ottave.", config: { mode: "updown", rate: 4, octaves: 2, gate: 62, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    as_played_plain: { label: "As Played Plain", category: "Classic", description: "Rispetta l'ordine di inserimento delle note.", config: { mode: "asplayed", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    random_safe_spark: { label: "Random Safe Spark", category: "Classic", description: "Random prudente senza ripetizione immediata.", config: { mode: "random", rate: 5, octaves: 2, gate: 55, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },

    berlin_two_oct_pulse: { label: "Berlin Two Oct Pulse", category: "Berlin School", description: "Arp classico a due ottave per sequenze motorik.", config: { mode: "up", rate: 6, octaves: 2, gate: 58, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true } },
    berlin_wide_cascade: { label: "Berlin Wide Cascade", category: "Berlin School", description: "Cascata ampia a tre ottave, molto adatta a pad e bassi pulsanti.", config: { mode: "updown", rate: 5, octaves: 3, gate: 60, swing: 10, latch: false, resetOnChange: true, randomNoRepeat: true } },
    tangerine_gallop: { label: "Tangerine Gallop", category: "Berlin School", description: "Up-Down con swing leggero per movimento meno rigido.", config: { mode: "updown", rate: 7, octaves: 2, gate: 52, swing: 18, latch: false, resetOnChange: true, randomNoRepeat: true } },
    motorik_gate_tight: { label: "Motorik Gate Tight", category: "Berlin School", description: "Gate corto e rate sostenuto per pattern elettronici netti.", config: { mode: "up", rate: 8, octaves: 2, gate: 42, swing: 6, latch: false, resetOnChange: true, randomNoRepeat: true } },
    kosmische_latch_drift: { label: "Kosmische Latch Drift", category: "Berlin School", description: "Latch ON per drone/arpeggi continui, da usare consapevolmente.", config: { mode: "asplayed", rate: 3, octaves: 3, gate: 72, swing: 12, latch: true, resetOnChange: true, randomNoRepeat: true } },

    chiptune_tight_8bit: { label: "Chiptune Tight 8-bit", category: "Chiptune", description: "Rate veloce, gate corto, una ottava.", config: { mode: "up", rate: 10, octaves: 1, gate: 35, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    chiptune_octave_jump: { label: "Chiptune Octave Jump", category: "Chiptune", description: "Due ottave secche per salti arcade.", config: { mode: "up", rate: 8, octaves: 2, gate: 40, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    chiptune_boss_rush: { label: "Chiptune Boss Rush", category: "Chiptune", description: "Arp molto rapido e asciutto, prudente sul gate.", config: { mode: "updown", rate: 12, octaves: 2, gate: 32, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    square_blip_random: { label: "Square Blip Random", category: "Chiptune", description: "Random secco per blip e piccoli effetti melodici.", config: { mode: "random", rate: 9, octaves: 2, gate: 30, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    handheld_waltz_swing: { label: "Handheld Waltz Swing", category: "Chiptune", description: "Swing marcato ma sicuro per pattern retro meno meccanici.", config: { mode: "asplayed", rate: 6, octaves: 1, gate: 45, swing: 25, latch: false, resetOnChange: true, randomNoRepeat: true } },

    ambient_slow_cascade: { label: "Ambient Slow Cascade", category: "Ambient / Cinematic", description: "Arp lento e largo per pad e riverberi lunghi.", config: { mode: "updown", rate: 1.5, octaves: 3, gate: 82, swing: 6, latch: false, resetOnChange: true, randomNoRepeat: true } },
    ambient_random_stars: { label: "Ambient Random Stars", category: "Ambient / Cinematic", description: "Random lento, largo e non ripetitivo.", config: { mode: "random", rate: 2, octaves: 3, gate: 70, swing: 12, latch: false, resetOnChange: true, randomNoRepeat: true } },
    cinematic_four_oct_climb: { label: "Cinematic Four Oct Climb", category: "Ambient / Cinematic", description: "Salita a quattro ottave con gate medio-lungo.", config: { mode: "up", rate: 2.5, octaves: 4, gate: 78, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true } },
    slow_latch_constellation: { label: "Slow Latch Constellation", category: "Ambient / Cinematic", description: "Latch ON per tenere una costellazione di note lente.", config: { mode: "random", rate: 1.2, octaves: 4, gate: 85, swing: 18, latch: true, resetOnChange: true, randomNoRepeat: true } },
    soft_human_as_played: { label: "Soft Human As Played", category: "Ambient / Cinematic", description: "As Played lento con swing leggero.", config: { mode: "asplayed", rate: 2.2, octaves: 2, gate: 76, swing: 15, latch: false, resetOnChange: true, randomNoRepeat: true } },

    industrial_tight_pulse: { label: "Industrial Tight Pulse", category: "Industrial / Dark", description: "Impulsi serrati e scuri, gate corto.", config: { mode: "up", rate: 7.5, octaves: 1, gate: 34, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true } },
    dark_random_machine: { label: "Dark Random Machine", category: "Industrial / Dark", description: "Random medio-veloce per macchine e texture nere.", config: { mode: "random", rate: 6.5, octaves: 2, gate: 38, swing: 10, latch: false, resetOnChange: true, randomNoRepeat: true } },
    doom_latch_crawler: { label: "Doom Latch Crawler", category: "Industrial / Dark", description: "Latch lento e pesante per drone/doom synth.", config: { mode: "down", rate: 1, octaves: 2, gate: 88, swing: 5, latch: true, resetOnChange: true, randomNoRepeat: true } },
    factory_gate_stutter: { label: "Factory Gate Stutter", category: "Industrial / Dark", description: "Gate molto secco e rate alto, senza ratchet.", config: { mode: "updown", rate: 11, octaves: 1, gate: 25, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    black_metal_trill: { label: "Black Metal Trill", category: "Industrial / Dark", description: "Trillo veloce e sporco, adatto a lead estremi.", config: { mode: "asplayed", rate: 13, octaves: 1, gate: 28, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },

    bass_pulse_tight: { label: "Bass Pulse Tight", category: "Performance", description: "Basso pulsante, corto e leggibile.", config: { mode: "up", rate: 5, octaves: 1, gate: 45, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true } },
    bass_octave_drive: { label: "Bass Octave Drive", category: "Performance", description: "Ottava superiore controllata per bassline più mobili.", config: { mode: "up", rate: 5.5, octaves: 2, gate: 48, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true } },
    lead_solo_runner: { label: "Lead Solo Runner", category: "Performance", description: "Arp brillante per lead e assoli synth.", config: { mode: "updown", rate: 9, octaves: 2, gate: 50, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true } },
    live_random_safe: { label: "Live Random Safe", category: "Performance", description: "Random per performance live, sempre senza ripetizione immediata.", config: { mode: "random", rate: 4.5, octaves: 2, gate: 55, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true } },
    wide_as_played_hero: { label: "Wide As Played Hero", category: "Performance", description: "As Played a tre ottave per gesti larghi e controllati.", config: { mode: "asplayed", rate: 5, octaves: 3, gate: 58, swing: 10, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },

    adv_classic_up: { label: "Classic Up", category: "Advanced Motion Macros", description: "Salita classica pulita: riferimento stabile per confrontare i nuovi motion pattern.", config: { mode: "up", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },
    adv_classic_down: { label: "Classic Down", category: "Advanced Motion Macros", description: "Discesa classica pulita, utile per bassi e pattern discendenti.", config: { mode: "down", rate: 4, octaves: 1, gate: 65, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },
    adv_up_down: { label: "Up / Down", category: "Advanced Motion Macros", description: "Up-Down a due ottave, senza ripetizione estrema agli apici.", config: { mode: "updown", rate: 4.5, octaves: 2, gate: 62, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },
    adv_as_played: { label: "As Played", category: "Advanced Motion Macros", description: "Rispetta il gesto della mano e lascia il pattern in ordine lineare.", config: { mode: "asplayed", rate: 4, octaves: 1, gate: 66, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },
    adv_random_controlled: { label: "Random Controlled", category: "Advanced Motion Macros", description: "Random con no-repeat attivo e range moderato: generativo ma governabile.", config: { mode: "random", rate: 5.5, octaves: 2, gate: 54, swing: 6, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "linear" } },
    adv_berlin_pulse: { label: "Berlin Pulse", category: "Advanced Motion Macros", description: "Pulse berlinese con ostinato ancorato alla prima nota e swing leggero.", config: { mode: "up", rate: 6.5, octaves: 2, gate: 55, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "anchor_ostinato" } },
    adv_tangerine_motion: { label: "Tangerine Motion", category: "Advanced Motion Macros", description: "Motion non lineare per sequenze cosmiche alla Berlin School.", config: { mode: "up", rate: 6, octaves: 3, gate: 58, swing: 12, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "tangerine_motion" } },
    adv_acid_runner: { label: "Acid Runner", category: "Advanced Motion Macros", description: "Runner acido, breve e insistente, con piccoli accenti di velocity.", config: { mode: "up", rate: 7.5, octaves: 2, gate: 46, swing: 6, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "acid_runner" } },
    adv_chiptune_jump: { label: "Chiptune Jump", category: "Advanced Motion Macros", description: "Salti secchi su due ottave per linee chip rapide e leggibili.", config: { mode: "up", rate: 10, octaves: 2, gate: 34, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "chiptune_jump" } },
    adv_broken_octave: { label: "Broken Octave", category: "Advanced Motion Macros", description: "Ottava spezzata, adatta a pattern elettronici aperti e non troppo fitti.", config: { mode: "up", rate: 5.5, octaves: 2, gate: 52, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "broken_octave" } },
    adv_wide_octave_jump: { label: "Wide Octave Jump", category: "Advanced Motion Macros", description: "Salti ampi su tre ottave per motion cinematico o lead larghi.", config: { mode: "up", rate: 4.5, octaves: 3, gate: 60, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "wide_octave_jump" } },
    adv_bass_ostinato: { label: "Bass Ostinato", category: "Advanced Motion Macros", description: "Ostinato controllato per bassline ripetitive, acid, minimal e industrial.", config: { mode: "up", rate: 6, octaves: 1, gate: 48, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "anchor_ostinato" } },
    adv_syncopated_pluck: { label: "Syncopated Pluck", category: "Advanced Motion Macros", description: "Gate feel alternato per pluck sincopati senza creare un secondo sequencer.", config: { mode: "up", rate: 6, octaves: 2, gate: 50, swing: 14, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "syncopated_pluck" } },
    adv_gate_pulse: { label: "Gate Pulse", category: "Advanced Motion Macros", description: "Pattern di gate alternato, secco ma non caotico.", config: { mode: "up", rate: 7, octaves: 1, gate: 42, swing: 0, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "gate_pulse" } },
    adv_slow_cinematic_motion: { label: "Slow Cinematic Motion", category: "Advanced Motion Macros", description: "Movimento lento e largo per pad, drones e delay sync.", config: { mode: "updown", rate: 2, octaves: 4, gate: 78, swing: 10, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "cinematic_motion" } },
    adv_industrial_machine: { label: "Industrial Machine", category: "Advanced Motion Macros", description: "Motion meccanico con accenti controllati per industrial e dark electronics.", config: { mode: "up", rate: 8, octaves: 2, gate: 36, swing: 4, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "industrial_machine" } },
    adv_minimal_techno_pulse: { label: "Minimal Techno Pulse", category: "Advanced Motion Macros", description: "Pulse ipnotico e minimale, con poche note ripetute in modo chiaro.", config: { mode: "up", rate: 6.5, octaves: 2, gate: 44, swing: 8, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "minimal_techno" } },
    adv_mediterranean_chiptune_motion: { label: "Mediterranean Chiptune Motion", category: "Advanced Motion Macros", description: "Motion brillante, asimmetrico e melodico per il lato Mediterranean chiptune di Sorgiva Synth.", config: { mode: "up", rate: 8.5, octaves: 2, gate: 38, swing: 6, latch: false, resetOnChange: true, randomNoRepeat: true, motionPattern: "mediterranean_chiptune" } }
  });

  const heldInputs = new Map(); // raw input MIDI note -> velocity, includes latched notes.
  const physicalInputs = new Map(); // raw input MIDI note -> velocity, currently held by keyboard/MIDI.
  const generatedRawNotes = new Set(); // raw generated MIDI notes sent to SynthXAudio.

  let currentRawNote = null;
  let currentVisualNote = null;
  let stepTimer = null;
  let gateTimer = null;
  let runToken = 0;
  let stepIndex = 0;
  let lastRandomIndex = -1;
  let lastInputSignature = "";
  let lastStepRawNote = null;
  let lastStepName = "";
  let lastStepNumber = 0;
  let lastAction = "";



  const ARP_RANDOMIZER_PROFILES = Object.freeze({
    safe_musical: {
      label: "Safe Musical",
      modes: ["up", "updown", "asplayed"],
      motions: ["linear", "octave_bounce", "anchor_ostinato", "gate_pulse"],
      rate: [2.4, 6.5], gate: [48, 76], swing: [0, 12], octaves: [1, 2], latchChance: 0
    },
    berlin_pulse: {
      label: "Berlin Pulse",
      modes: ["up", "updown", "asplayed"],
      motions: ["octave_bounce", "tangerine_motion", "anchor_ostinato", "minimal_techno"],
      rate: [4.0, 8.5], gate: [42, 66], swing: [4, 18], octaves: [2, 3], latchChance: 0.08
    },
    acid_tight: {
      label: "Acid Tight",
      modes: ["up", "down", "random"],
      motions: ["acid_runner", "gate_pulse", "anchor_ostinato", "syncopated_pluck"],
      rate: [5.0, 11.0], gate: [28, 55], swing: [0, 18], octaves: [1, 2], latchChance: 0
    },
    chiptune: {
      label: "Chiptune",
      modes: ["up", "updown", "random"],
      motions: ["chiptune_jump", "mediterranean_chiptune", "octave_bounce", "gate_pulse"],
      rate: [7.0, 14.0], gate: [22, 48], swing: [0, 8], octaves: [1, 3], latchChance: 0
    },
    ambient: {
      label: "Ambient",
      modes: ["asplayed", "updown", "random"],
      motions: ["cinematic_motion", "wide_octave_jump", "broken_octave", "octave_bounce"],
      rate: [0.7, 3.2], gate: [65, 92], swing: [0, 18], octaves: [2, 4], latchChance: 0.18
    },
    industrial: {
      label: "Industrial",
      modes: ["up", "random", "down"],
      motions: ["industrial_machine", "gate_pulse", "syncopated_pluck", "acid_runner"],
      rate: [4.5, 12.0], gate: [24, 58], swing: [0, 26], octaves: [1, 3], latchChance: 0.04
    },
    minimal: {
      label: "Minimal",
      modes: ["asplayed", "up", "updown"],
      motions: ["minimal_techno", "gate_pulse", "linear", "anchor_ostinato"],
      rate: [1.2, 5.0], gate: [35, 72], swing: [0, 22], octaves: [1, 2], latchChance: 0
    },
    random_spark: {
      label: "Random Spark",
      modes: ["random", "updown", "asplayed"],
      motions: ["octave_bounce", "broken_octave", "chiptune_jump", "syncopated_pluck", "gate_pulse"],
      rate: [3.0, 10.0], gate: [30, 70], swing: [0, 28], octaves: [1, 3], latchChance: 0
    },
    performance_test: {
      label: "Performance Test",
      modes: ["up", "down", "updown", "random", "asplayed"],
      motions: ["linear", "octave_bounce", "wide_octave_jump", "industrial_machine", "cinematic_motion", "mediterranean_chiptune"],
      rate: [0.8, 16.0], gate: [18, 90], swing: [0, 40], octaves: [1, 4], latchChance: 0
    }
  });

  const ARP_RANDOMIZER_DENSITY = Object.freeze({
    sparse: { label: "Sparse", rateMul: 0.78, gateAdd: 12, swingMul: 0.75, octaveBias: -1 },
    balanced: { label: "Balanced", rateMul: 1.00, gateAdd: 0, swingMul: 1.00, octaveBias: 0 },
    dense: { label: "Dense", rateMul: 1.22, gateAdd: -8, swingMul: 1.08, octaveBias: 0 },
    wild_safe: { label: "Wild Safe", rateMul: 1.35, gateAdd: -12, swingMul: 1.20, octaveBias: 1 }
  });


  function getEl(id) { return document.getElementById(id); }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function noteName(midi) {
    const n = Number(midi);
    if (!Number.isFinite(n)) return "--";
    const rounded = Math.round(n);
    const pc = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[pc]}${octave}`;
  }

  function modeLabel(mode) {
    if (mode === "down") return "Down";
    if (mode === "updown") return "Up-Down";
    if (mode === "random") return "Random";
    if (mode === "asplayed") return "As Played";
    return "Up";
  }

  function normalizeMotionPattern(value) {
    const raw = String(value || "linear").trim();
    return Object.prototype.hasOwnProperty.call(ARP_MOTION_PATTERNS, raw) ? raw : "linear";
  }

  function getMotionPattern(patternId) {
    return ARP_MOTION_PATTERNS[normalizeMotionPattern(patternId)] || ARP_MOTION_PATTERNS.linear;
  }

  function getMotionPatternLabel(patternId) {
    return getMotionPattern(patternId).label || "Linear";
  }

  function getConfig() {
    const modeRaw = String(getEl("arp-mode")?.value || "up");
    const mode = MODES.has(modeRaw) ? modeRaw : "up";
    const rate = clamp(getEl("arp-rate")?.value ?? 4, LIMITS.rateMin, LIMITS.rateMax);
    const gatePercent = clamp(getEl("arp-gate")?.value ?? 65, LIMITS.gateMin, LIMITS.gateMax);
    const swingPercent = clamp(getEl("arp-swing")?.value ?? 0, LIMITS.swingMin, LIMITS.swingMax);
    const octaves = Math.round(clamp(getEl("arp-octaves")?.value ?? 1, LIMITS.octavesMin, LIMITS.octavesMax));
    const motionPattern = normalizeMotionPattern(getEl("arp-motion-pattern")?.value || "linear");
    return {
      enabled: Boolean(getEl("arp-enabled")?.checked),
      mode,
      rate,
      octaves,
      motionPattern,
      gatePercent,
      swingPercent,
      swing: swingPercent / 100,
      gate: gatePercent / 100,
      latch: Boolean(getEl("arp-latch-enabled")?.checked),
      resetOnChange: getEl("arp-reset-on-change") ? Boolean(getEl("arp-reset-on-change").checked) : true,
      randomNoRepeat: getEl("arp-random-no-repeat") ? Boolean(getEl("arp-random-no-repeat").checked) : true
    };
  }

  function syncClampedUiValues(cfg) {
    const pairs = [
      ["arp-rate", cfg.rate],
      ["arp-gate", cfg.gatePercent],
      ["arp-swing", cfg.swingPercent],
      ["arp-octaves", cfg.octaves],
      ["arp-mode", cfg.mode],
      ["arp-motion-pattern", cfg.motionPattern]
    ];
    pairs.forEach(([id, value]) => {
      const el = getEl(id);
      if (!el) return;
      const next = String(value);
      const changed = String(el.value) !== next;
      if (changed) {
        el.value = next;
        window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? value, { source: "arp-sanitize", type: el.type || el.tagName.toLowerCase() });
      }
      window.SynthXControls?.updateValueLabel?.(id, value);
    });
  }


  function presetCount() {
    return Object.keys(ARP_BEHAVIOR_PRESETS).length;
  }

  function bool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return Boolean(fallback);
  }

  function normalizeMode(value) {
    const raw = String(value ?? "up").trim().toLowerCase();
    const normalized = raw
      .replace(/\s+/g, "")
      .replace(/[_-]+/g, "");
    if (normalized === "updown" || normalized === "upanddown" || normalized === "updownexclusive") return "updown";
    if (normalized === "asplayed" || normalized === "played" || normalized === "inputorder") return "asplayed";
    if (normalized === "random" || normalized === "rnd") return "random";
    if (normalized === "down" || normalized === "desc" || normalized === "descending") return "down";
    if (normalized === "up" || normalized === "asc" || normalized === "ascending") return "up";
    return "up";
  }

  function firstDefined(source, keys, fallback) {
    if (!source || typeof source !== "object") return fallback;
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
    }
    return fallback;
  }

  function safePresetLabel(value, fallback) {
    return String(value || fallback || "Arp Preset")
      .replace(/[<>\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 64) || "Arp Preset";
  }

  function safeFileName(value) {
    return String(value || "sorgiva-arp-preset")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "sorgiva-arp-preset";
  }

  function sanitizeArpPresetObject(raw, fallbackLabel) {
    const source = raw?.arpPreset || raw?.preset || raw?.arpeggiator || raw;
    const rawConfig = source?.config || source?.settings || source;
    if (!rawConfig || typeof rawConfig !== "object") return null;
    const mode = normalizeMode(firstDefined(rawConfig, ["mode", "arpMode", "arp-mode"], "up"));
    const config = {
      mode: MODES.has(mode) ? mode : "up",
      rate: clamp(firstDefined(rawConfig, ["rate", "arpRate", "arp-rate"], 4), LIMITS.rateMin, LIMITS.rateMax),
      octaves: Math.round(clamp(firstDefined(rawConfig, ["octaves", "octaveRange", "arpOctaves", "arp-octaves"], 1), LIMITS.octavesMin, LIMITS.octavesMax)),
      gate: Math.round(clamp(firstDefined(rawConfig, ["gate", "gatePercent", "arpGate", "arp-gate"], 65), LIMITS.gateMin, LIMITS.gateMax)),
      swing: Math.round(clamp(firstDefined(rawConfig, ["swing", "swingPercent", "arpSwing", "arp-swing"], 0), LIMITS.swingMin, LIMITS.swingMax)),
      latch: bool(firstDefined(rawConfig, ["latch", "hold", "latchEnabled", "holdEnabled", "arpLatch", "arp-latch-enabled"], false), false),
      resetOnChange: bool(firstDefined(rawConfig, ["resetOnChange", "reset", "arpResetOnChange", "arp-reset-on-change"], true), true),
      randomNoRepeat: bool(firstDefined(rawConfig, ["randomNoRepeat", "noRepeat", "arpRandomNoRepeat", "arp-random-no-repeat"], true), true),
      motionPattern: normalizeMotionPattern(firstDefined(rawConfig, ["motionPattern", "pattern", "arpMotionPattern", "arp-motion-pattern"], "linear"))
    };
    return {
      schema: ARP_PRESET_SCHEMA,
      label: safePresetLabel(source?.label || source?.name, fallbackLabel || "Imported Arp Preset"),
      category: safePresetLabel(source?.category, "User / Imported"),
      description: safePresetLabel(source?.description, "Imported or user arpeggiator behavior preset."),
      config
    };
  }

  function currentPresetObject(label) {
    const cfg = getConfig();
    return sanitizeArpPresetObject({
      label: label || "User Arp Preset",
      category: "User / Imported",
      description: "Saved from current Sorgiva Synth arpeggiator controls.",
      config: {
        mode: cfg.mode,
        rate: cfg.rate,
        octaves: cfg.octaves,
        gate: cfg.gatePercent,
        swing: cfg.swingPercent,
        latch: cfg.latch,
        resetOnChange: cfg.resetOnChange,
        randomNoRepeat: cfg.randomNoRepeat,
        motionPattern: cfg.motionPattern
      }
    }, label || "User Arp Preset");
  }

  function setArpControlSilently(id, value, source) {
    const el = getEl(id);
    if (!el) return false;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = String(value);
    const coerced = window.SynthXState?.coerceValue ? window.SynthXState.coerceValue(el) : value;
    window.SynthXState?.setParameter?.(id, coerced, { source: source || "arp-preset", type: el.type || el.tagName.toLowerCase() });
    window.SynthXControls?.updateValueLabel?.(id, coerced);
    return true;
  }

  function applyArpPresetConfig(config, reason) {
    const before = getConfig();
    const wasEnabled = before.enabled;
    const oldLatch = before.latch;
    if (wasEnabled) {
      clearTimer("all");
      releaseAllGenerated(reason || "arp-preset-change");
    }
    setArpControlSilently("arp-mode", config.mode, reason || "arp-preset");
    setArpControlSilently("arp-rate", config.rate, reason || "arp-preset");
    setArpControlSilently("arp-octaves", config.octaves, reason || "arp-preset");
    setArpControlSilently("arp-gate", config.gate, reason || "arp-preset");
    setArpControlSilently("arp-swing", config.swing, reason || "arp-preset");
    setArpControlSilently("arp-latch-enabled", config.latch, reason || "arp-preset");
    setArpControlSilently("arp-reset-on-change", config.resetOnChange, reason || "arp-preset");
    setArpControlSilently("arp-random-no-repeat", config.randomNoRepeat, reason || "arp-preset");
    setArpControlSilently("arp-motion-pattern", normalizeMotionPattern(config.motionPattern), reason || "arp-preset");
    syncClampedUiValues(getConfig());
    resetStepCursor(reason || "arp-preset");
    if (oldLatch && !getConfig().latch) reconcileLatchOff();
    if (wasEnabled && heldInputs.size) start(reason || "arp-preset-restart");
    updateRuntimeState({ lastAction: reason || "arp-preset" });
  }

  function readStoredUserArpPresetText() {
    const primary = window.localStorage?.getItem?.(USER_ARP_PRESET_STORAGE_KEY);
    if (primary) return { raw: primary, key: USER_ARP_PRESET_STORAGE_KEY, legacy: false };
    for (const legacyKey of LEGACY_USER_ARP_PRESET_STORAGE_KEYS || []) {
      const legacyRaw = window.localStorage?.getItem?.(legacyKey);
      if (legacyRaw) {
        try { window.localStorage?.setItem?.(USER_ARP_PRESET_STORAGE_KEY, legacyRaw); } catch (_) {}
        return { raw: legacyRaw, key: legacyKey, legacy: true };
      }
    }
    return null;
  }

  function writeStoredUserArpPresetText(raw) {
    window.localStorage?.setItem?.(USER_ARP_PRESET_STORAGE_KEY, raw);
    const mirrorKey = LEGACY_USER_ARP_PRESET_STORAGE_KEYS?.[0];
    if (mirrorKey) { try { window.localStorage?.setItem?.(mirrorKey, raw); } catch (_) {} }
  }

  function getStoredUserArpPreset() {
    try {
      const stored = readStoredUserArpPresetText();
      if (!stored?.raw) return null;
      return sanitizeArpPresetObject(JSON.parse(stored.raw), "User Arp Preset");
    } catch (err) {
      window.SynthXLogger?.warn("arp user preset read failed", err);
      return null;
    }
  }

  function ensureUserArpPresetOption(preset) {
    const selector = getEl("arp-behavior-preset");
    if (!selector || !preset) return;
    let group = selector.querySelector('optgroup[data-arp-group="User / Imported"]');
    if (!group) {
      group = document.createElement("optgroup");
      group.label = "User / Imported";
      group.dataset.arpGroup = "User / Imported";
      selector.appendChild(group);
    }
    let option = selector.querySelector('option[value="user_arp_preset"]');
    if (!option) {
      option = document.createElement("option");
      option.value = "user_arp_preset";
      group.appendChild(option);
    }
    option.textContent = `User · ${preset.label}`;
    option.title = preset.description || "User arpeggiator behavior preset";
  }

  function getArpPresetById(id) {
    if (id === "user_arp_preset") return getStoredUserArpPreset() || ARP_BEHAVIOR_PRESETS.classic_up_1_oct;
    return ARP_BEHAVIOR_PRESETS[id] || ARP_BEHAVIOR_PRESETS.classic_up_1_oct;
  }

  function setArpFeedback(message, kind) {
    const el = getEl("arp-preset-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "info";
  }

  function saveUserArpPreset() {
    const preset = currentPresetObject("User Arp Preset");
    try {
      writeStoredUserArpPresetText(JSON.stringify(preset));
      ensureUserArpPresetOption(preset);
      const selector = getEl("arp-behavior-preset");
      if (selector) selector.value = "user_arp_preset";
      setStatus(`Arp: user preset salvato · ${preset.label}.`, "ok");
      setArpFeedback("User arp saved", "ok");
      updateRuntimeState({ lastAction: "arp-save-user-preset" });
    } catch (err) {
      setStatus("Arp: impossibile salvare lo user preset locale.", "warn");
      setArpFeedback("User arp save failed", "warn");
      window.SynthXLogger?.warn("arp user preset save failed", err);
    }
  }

  function exportCurrentArpPreset() {
    const preset = currentPresetObject("Sorgiva Synth Arp Preset");
    const payload = {
      ...exportMetadata(),
      type: "sorgiva_synth_arp_preset",
      legacyType: "SynthX Arp Preset",
      legacySchemasAccepted: LEGACY_ARP_PRESET_SCHEMAS,
      arpPreset: preset
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileName(preset.label)}.sorgiva-arp.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(`Arp: preset esportato · ${preset.label}.`, "ok");
      setArpFeedback("Arp JSON exported", "ok");
      updateRuntimeState({ lastAction: "arp-export-preset" });
    } catch (err) {
      setStatus("Arp: export preset non riuscito.", "warn");
      setArpFeedback("Arp export failed", "warn");
      window.SynthXLogger?.warn("arp preset export failed", err);
    }
  }

  function importArpPresetObject(raw, reason) {
    const preset = sanitizeArpPresetObject(raw, "Imported Arp Preset");
    if (!preset) {
      setStatus("Arp: file preset non valido.", "warn");
      setArpFeedback("Arp import failed", "warn");
      return false;
    }
    try {
      writeStoredUserArpPresetText(JSON.stringify(preset));
      ensureUserArpPresetOption(preset);
      const selector = getEl("arp-behavior-preset");
      if (selector) selector.value = "user_arp_preset";
    } catch (err) {
      window.SynthXLogger?.warn("arp imported preset store failed", err);
    }
    applyArpPresetConfig(preset.config, reason || "arp-import-preset");
    setStatus(`Arp: preset importato · ${preset.label}.`, "ok");
    setArpFeedback("Arp JSON imported", "ok");
    return true;
  }

  function requestImportArpPreset() {
    const input = getEl("arp-preset-import-file");
    if (!input) {
      setStatus("Arp: input import preset non trovato.", "warn");
      setArpFeedback("Arp import unavailable", "warn");
      return;
    }
    input.value = "";
    input.click();
  }

  function applySelectedArpPreset() {
    const id = String(getEl("arp-behavior-preset")?.value || "classic_up_1_oct");
    const preset = getArpPresetById(id);
    const safe = sanitizeArpPresetObject(preset, preset?.label || "Arp Preset");
    if (!safe) return false;
    applyArpPresetConfig(safe.config, "arp-apply-preset");
    setStatus(`Arp: preset applicato · ${safe.label}.`, "ok");
    setArpFeedback("Behavior Macro loaded · internal Motion Shape updated", "ok");
    return true;
  }


  function chooseRandom(values, fallback) {
    const list = Array.isArray(values) ? values.filter((value) => value !== undefined && value !== null) : [];
    if (!list.length) return fallback;
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomRange(range, fallback) {
    if (!Array.isArray(range) || range.length < 2) return Number(fallback) || 0;
    const min = Number(range[0]);
    const max = Number(range[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return Number(fallback) || 0;
    return min + (Math.random() * (max - min));
  }

  function randomIntRange(range, fallback) {
    const value = randomRange(range, fallback);
    return Math.round(value);
  }

  function getArpRandomizerOption(id, fallback) {
    const value = String(getEl(id)?.value || fallback || "");
    return value || fallback;
  }

  function getDensityConfig(id) {
    return ARP_RANDOMIZER_DENSITY[id] || ARP_RANDOMIZER_DENSITY.balanced;
  }

  function getProfileConfig(id) {
    return ARP_RANDOMIZER_PROFILES[id] || ARP_RANDOMIZER_PROFILES.safe_musical;
  }

  function shouldApplyScope(scope, group) {
    if (scope === "full") return true;
    if (scope === "timing") return group === "timing";
    if (scope === "motion") return group === "motion";
    if (scope === "mode_octave") return group === "mode_octave";
    if (scope === "options") return group === "options";
    return false;
  }

  function generateRandomArpConfig(profileId, densityId, scopeId, options) {
    const current = getConfig();
    const profile = getProfileConfig(profileId);
    const density = getDensityConfig(densityId);
    const keepLatchOff = options?.keepLatchOff !== false;
    const config = {
      mode: current.mode,
      rate: current.rate,
      octaves: current.octaves,
      gate: Math.round(current.gatePercent),
      swing: Math.round(current.swingPercent),
      latch: current.latch,
      resetOnChange: current.resetOnChange,
      randomNoRepeat: current.randomNoRepeat,
      motionPattern: current.motionPattern
    };

    if (shouldApplyScope(scopeId, "mode_octave")) {
      config.mode = normalizeMode(chooseRandom(profile.modes, "up"));
      const octaveRaw = randomIntRange(profile.octaves, current.octaves) + (Number(density.octaveBias) || 0);
      config.octaves = Math.round(clamp(octaveRaw, LIMITS.octavesMin, LIMITS.octavesMax));
    }

    if (shouldApplyScope(scopeId, "timing")) {
      const rateRaw = randomRange(profile.rate, current.rate) * (Number(density.rateMul) || 1);
      const gateRaw = randomRange(profile.gate, current.gatePercent) + (Number(density.gateAdd) || 0);
      const swingRaw = randomRange(profile.swing, current.swingPercent) * (Number(density.swingMul) || 1);
      config.rate = Number(clamp(rateRaw, LIMITS.rateMin, LIMITS.rateMax).toFixed(1));
      config.gate = Math.round(clamp(gateRaw, LIMITS.gateMin, LIMITS.gateMax));
      config.swing = Math.round(clamp(swingRaw, LIMITS.swingMin, LIMITS.swingMax));
      if (densityId === "sparse") config.gate = Math.max(config.gate, 48);
      if (densityId === "dense" || densityId === "wild_safe") config.gate = Math.min(config.gate, profileId === "ambient" ? 82 : 62);
    }

    if (shouldApplyScope(scopeId, "motion")) {
      config.motionPattern = normalizeMotionPattern(chooseRandom(profile.motions, "linear"));
      if (densityId === "sparse" && Math.random() < 0.35) config.motionPattern = "linear";
      if (densityId === "wild_safe" && profileId !== "safe_musical" && Math.random() < 0.35) {
        config.motionPattern = normalizeMotionPattern(chooseRandom(Object.keys(ARP_MOTION_PATTERNS).filter((id) => id !== "linear"), config.motionPattern));
      }
    }

    if (shouldApplyScope(scopeId, "options")) {
      config.resetOnChange = true;
      config.randomNoRepeat = profileId === "chiptune" || profileId === "industrial" ? Math.random() > 0.18 : true;
      const latchChance = keepLatchOff ? 0 : clamp(profile.latchChance || 0, 0, 0.25);
      config.latch = Math.random() < latchChance;
    }

    if (keepLatchOff) config.latch = false;
    config.rate = Number(clamp(config.rate, LIMITS.rateMin, LIMITS.rateMax).toFixed(1));
    config.gate = Math.round(clamp(config.gate, LIMITS.gateMin, LIMITS.gateMax));
    config.swing = Math.round(clamp(config.swing, LIMITS.swingMin, LIMITS.swingMax));
    config.octaves = Math.round(clamp(config.octaves, LIMITS.octavesMin, LIMITS.octavesMax));
    config.mode = normalizeMode(config.mode);
    config.motionPattern = normalizeMotionPattern(config.motionPattern);
    config.resetOnChange = Boolean(config.resetOnChange);
    config.randomNoRepeat = Boolean(config.randomNoRepeat);
    config.latch = Boolean(config.latch);
    return config;
  }

  function setArpRandomizerFeedback(message, kind) {
    const el = getEl("arp-randomizer-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "info";
  }

  function randomizeArpBehavior() {
    const profileId = getArpRandomizerOption("arp-randomizer-profile", "safe_musical");
    const scopeId = getArpRandomizerOption("arp-randomizer-scope", "full");
    const densityId = getArpRandomizerOption("arp-randomizer-density", "balanced");
    const keepLatchOff = getEl("arp-randomizer-keep-latch-off") ? Boolean(getEl("arp-randomizer-keep-latch-off").checked) : true;
    const profile = getProfileConfig(profileId);
    const density = getDensityConfig(densityId);
    const config = generateRandomArpConfig(profileId, densityId, scopeId, { keepLatchOff });
    applyArpPresetConfig(config, "arp-randomizer");
    const latchText = config.latch ? "Latch ON" : "Latch OFF";
    const motionText = getMotionPatternLabel(config.motionPattern);
    const scopeLabel = String(scopeId || "full").replace("_", "/");
    const message = `Arp randomizer: ${profile.label} · ${density.label} · ${scopeLabel} → ${modeLabel(config.mode)} · ${motionText} · ${config.rate.toFixed(1)} step/s · ${config.octaves} ott. · Gate ${config.gate}% · Swing ${config.swing}% · ${latchText}`;
    setStatus(message, "ok");
    setArpRandomizerFeedback(message, "ok");
    updateRuntimeState({ lastAction: "arp-randomizer" });
    return true;
  }

  function onPresetAction(action) {
    if (action === "arp-apply-preset") { applySelectedArpPreset(); return true; }
    if (action === "arp-save-user-preset") { saveUserArpPreset(); return true; }
    if (action === "arp-export-preset") { exportCurrentArpPreset(); return true; }
    if (action === "arp-import-preset") { requestImportArpPreset(); return true; }
    if (action === "arp-randomize-behavior") { randomizeArpBehavior(); return true; }
    return false;
  }

  function populateMotionPatternSelector() {
    const selector = getEl("arp-motion-pattern");
    if (!selector) return;
    const previous = normalizeMotionPattern(selector.value || "linear");
    selector.innerHTML = "";
    Object.entries(ARP_MOTION_PATTERNS).forEach(([id, pattern]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = pattern.label || id;
      option.title = pattern.description || "";
      selector.appendChild(option);
    });
    selector.value = previous;
  }

  function populateArpPresetSelector() {
    const selector = getEl("arp-behavior-preset");
    if (!selector) return;
    selector.innerHTML = "";
    const groups = new Map();
    Object.entries(ARP_BEHAVIOR_PRESETS).forEach(([id, preset]) => {
      const category = preset?.category || "Arp Presets";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push([id, preset]);
    });
    groups.forEach((items, category) => {
      const group = document.createElement("optgroup");
      group.label = category;
      group.dataset.arpGroup = category;
      items.forEach(([id, preset]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = preset.label;
        option.title = preset.description || "";
        group.appendChild(option);
      });
      selector.appendChild(group);
    });
    selector.value = "classic_up_1_oct";
    const userPreset = getStoredUserArpPreset();
    if (userPreset) ensureUserArpPresetOption(userPreset);
  }

  function bindArpPresetImportInput() {
    const input = getEl("arp-preset-import-file");
    if (!input || input.dataset.arpImportBound === "true") return;
    input.dataset.arpImportBound = "true";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || "{}"));
          importArpPresetObject(parsed, "arp-import-preset");
        } catch (err) {
          setStatus("Arp: JSON preset non valido.", "warn");
          setArpFeedback("Arp import failed", "warn");
          window.SynthXLogger?.warn("arp preset import parse failed", err);
        }
      };
      reader.onerror = () => {
        setStatus("Arp: lettura file preset non riuscita.", "warn");
        setArpFeedback("Arp import failed", "warn");
      };
      reader.readAsText(file);
    });
  }

  function getVisualNote(rawNote) {
    const n = Number(rawNote);
    if (!Number.isFinite(n)) return n;
    return window.SynthXAudio?.getPerformanceNote ? window.SynthXAudio.getPerformanceNote(n) : n;
  }

  function setArpKey(rawNote, active) {
    const visual = getVisualNote(rawNote);
    const key = document.querySelector(`.key[data-note="${visual}"]`);
    if (key) key.classList.toggle("arp-step", Boolean(active));
    return visual;
  }

  function clearArpKey(rawNote, visualNote) {
    const visual = visualNote ?? getVisualNote(rawNote);
    const key = document.querySelector(`.key[data-note="${visual}"]`);
    if (key) key.classList.remove("arp-step");
  }

  function clearAllArpKeyHighlights() {
    document.querySelectorAll(".key.arp-step").forEach((key) => key.classList.remove("arp-step"));
  }

  function setStatus(message, kind) {
    const status = getEl("arp-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind || "info";
  }

  function inputSignature() {
    return Array.from(heldInputs.entries())
      .map(([note, velocity]) => `${Math.round(Number(note))}:${Math.round(clamp(velocity, 0, 1) * 127)}`)
      .sort()
      .join("|");
  }

  function normalizeHeldInputs() {
    return Array.from(heldInputs.entries())
      .map(([note, velocity]) => ({ note: Math.round(Number(note)), velocity: clamp(velocity, 0, 1) }))
      .filter((item) => Number.isFinite(item.note) && item.note >= 0 && item.note <= 127);
  }

  function expandOctaves(baseItems, cfg) {
    const seen = new Set();
    const sequence = [];
    // v0.23.1a: octave-major expansion is musically safer for classic arp behavior.
    // Example with Do-Mi-Sol and 2 octaves: Do4 → Mi4 → Sol4 → Do5 → Mi5 → Sol5.
    for (let octave = 0; octave < cfg.octaves; octave += 1) {
      baseItems.forEach((item) => {
        const note = item.note + (octave * 12);
        // Safe clamp by rejection: do not wrap notes beyond MIDI range.
        if (note < 0 || note > 127 || seen.has(note)) return;
        seen.add(note);
        sequence.push({ note, velocity: item.velocity, baseNote: item.note, octave });
      });
    }
    return sequence;
  }

  function buildLinearSequence(cfg) {
    const asPlayed = normalizeHeldInputs();
    const ascendingBases = asPlayed.slice().sort((a, b) => a.note - b.note);
    const ascending = expandOctaves(ascendingBases, cfg);

    if (cfg.mode === "asplayed") return expandOctaves(asPlayed, cfg);
    if (cfg.mode === "down") return ascending.slice().reverse();
    if (cfg.mode === "updown") {
      if (ascending.length <= 2) return ascending;
      return ascending.concat(ascending.slice(1, -1).reverse());
    }
    return ascending;
  }

  function resolvePatternIndex(index, length) {
    const safeLength = Math.max(1, Number(length) || 1);
    const n = Math.round(Number(index));
    if (!Number.isFinite(n)) return 0;
    return ((n % safeLength) + safeLength) % safeLength;
  }

  function normalizePatternStep(step) {
    if (typeof step === "number") return { index: step, gateScale: 1, velocityScale: 1 };
    if (!step || typeof step !== "object") return { index: 0, gateScale: 1, velocityScale: 1 };
    return {
      index: firstDefined(step, ["index", "i", "pos"], 0),
      gateScale: clamp(firstDefined(step, ["gateScale", "gate", "g"], 1), 0.35, 1.35),
      velocityScale: clamp(firstDefined(step, ["velocityScale", "velocity", "vel", "v"], 1), 0.50, 1.25)
    };
  }

  function getEffectiveMotionPatternId(sequence, cfg) {
    const sequenceLength = Array.isArray(sequence) ? sequence.length : 0;
    let motionId = normalizeMotionPattern(cfg?.motionPattern || "linear");
    if (motionId === "linear" || sequenceLength <= 1) return "linear";

    // v0.25.16: musical differentiation pass.
    // Some motion shapes need a wider generated note pool to avoid modulo-wrap patterns that feel arbitrary.
    // Fallback is deliberately conservative: it keeps the arp musical without hiding the selected control.
    const visited = new Set();
    for (let guard = 0; guard < 4; guard += 1) {
      const pattern = getMotionPattern(motionId);
      const minGeneratedNotes = Math.max(2, Math.round(Number(pattern.minGeneratedNotes) || 2));
      if (sequenceLength >= minGeneratedNotes) return motionId;
      visited.add(motionId);
      const fallback = normalizeMotionPattern(pattern.fallback || "linear");
      if (fallback === motionId || visited.has(fallback)) return "linear";
      motionId = fallback;
      if (motionId === "linear") return "linear";
    }
    return "linear";
  }

  function getMotionPatternRuntimeLabel(cfg) {
    const safeCfg = cfg || getConfig();
    const selected = normalizeMotionPattern(safeCfg?.motionPattern || "linear");
    const effective = getEffectiveMotionPatternId(buildLinearSequence(safeCfg), safeCfg);
    if (selected !== effective) return `${getMotionPatternLabel(effective)} fallback da ${getMotionPatternLabel(selected)}`;
    return getMotionPatternLabel(effective);
  }

  function shouldUseMotionPattern(sequence, cfg) {
    return getEffectiveMotionPatternId(sequence, cfg) !== "linear";
  }

  function applyMotionPattern(sequence, cfg) {
    const motionId = getEffectiveMotionPatternId(sequence, cfg);
    const pattern = getMotionPattern(motionId);
    if (!shouldUseMotionPattern(sequence, cfg) || !Array.isArray(pattern.steps) || !pattern.steps.length) return sequence;
    const patterned = [];
    pattern.steps.forEach((rawStep) => {
      const step = normalizePatternStep(rawStep);
      const source = sequence[resolvePatternIndex(step.index, sequence.length)];
      if (!source) return;
      patterned.push({
        ...source,
        velocity: clamp((Number(source.velocity) || 0) * step.velocityScale, 0, 1),
        gateScale: step.gateScale,
        motionPattern: motionId
      });
    });
    return patterned.length ? patterned : sequence;
  }

  function buildSequence(cfg) {
    const linear = buildLinearSequence(cfg);
    return applyMotionPattern(linear, cfg);
  }

  function sequencePreview(cfg) {
    const sequence = buildSequence(cfg || getConfig());
    if (!sequence.length) return "--";
    const names = sequence.slice(0, LIMITS.previewMax).map((item) => noteName(item.note));
    if (sequence.length > LIMITS.previewMax) names.push("…");
    return names.join(" → ");
  }

  function updateRuntimeState(extra) {
    const cfg = getConfig();
    lastAction = extra?.lastAction || lastAction || "";
    const patch = {
      enabled: cfg.enabled,
      mode: cfg.mode,
      rate: cfg.rate,
      octaves: cfg.octaves,
      motionPattern: cfg.motionPattern,
      motionPatternLabel: getMotionPatternLabel(cfg.motionPattern),
      activeMotionPattern: getEffectiveMotionPatternId(buildLinearSequence(cfg), cfg),
      activeMotionPatternLabel: getMotionPatternRuntimeLabel(cfg),
      gatePercent: Math.round(cfg.gatePercent),
      swingPercent: Math.round(cfg.swingPercent),
      latchEnabled: cfg.latch,
      resetOnChange: cfg.resetOnChange,
      randomNoRepeat: cfg.randomNoRepeat,
      heldInputCount: heldInputs.size,
      physicalInputCount: physicalInputs.size,
      generatedNoteCount: generatedRawNotes.size,
      currentRawNote,
      currentNoteName: currentRawNote === null ? "" : noteName(currentRawNote),
      running: Boolean(stepTimer || currentRawNote !== null || generatedRawNotes.size > 0),
      lastStepRawNote,
      lastStepName,
      lastStepNumber,
      sequencePreview: sequencePreview(cfg),
      inputSignature: inputSignature(),
      lastAction
    };
    window.SynthXState?.updateArpeggiator?.(patch);
    window.SynthXControls?.updateArpUiStatus?.();
  }

  function resetStepCursor(reason) {
    stepIndex = 0;
    lastRandomIndex = -1;
    lastInputSignature = inputSignature();
  }

  function markInputChanged(reason) {
    const cfg = getConfig();
    const nextSignature = inputSignature();
    if (cfg.resetOnChange && nextSignature !== lastInputSignature) resetStepCursor(reason || "input-change");
    else lastInputSignature = nextSignature;
  }

  function clearTimer(which) {
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
      if (window.SynthXAudio?.noteOffImmediate) window.SynthXAudio.noteOffImmediate(midi, reason || "arp-release");
      else window.SynthXAudio?.noteOff?.(midi);
    } catch (err) {
      window.SynthXLogger?.warn("arp release error", err);
    }
    generatedRawNotes.delete(midi);
    clearArpKey(midi, visualNote);
    if (currentRawNote === midi) {
      currentRawNote = null;
      currentVisualNote = null;
    }
  }

  function releaseCurrent(reason) {
    clearTimer("gate");
    if (currentRawNote !== null) releaseGeneratedNote(currentRawNote, reason || "arp-release", currentVisualNote);
    currentRawNote = null;
    currentVisualNote = null;
  }

  function releaseAllGenerated(reason) {
    releaseCurrent(reason || "arp-release-all");
    Array.from(generatedRawNotes).forEach((note) => releaseGeneratedNote(note, reason || "arp-release-all"));
    clearAllArpKeyHighlights();
  }

  function stopClock(reason) {
    runToken += 1;
    clearTimer("all");
    releaseAllGenerated(reason || "arp-stop");
    updateRuntimeState({ lastAction: reason || "stop" });
  }

  function clear(reason, options) {
    heldInputs.clear();
    physicalInputs.clear();
    resetStepCursor(reason || "clear");
    stopClock(reason || "clear");
    if (options?.allAudioOff) {
      const isPanic = String(reason || "").includes("panic");
      if (isPanic && window.SynthXAudio?.panicAllNotesOff) window.SynthXAudio.panicAllNotesOff(`arp:${reason || "panic"}`);
      else window.SynthXAudio?.allNotesOff?.({ reason: `arp:${reason || "clear"}` });
    }
    setStatus("Arp: pulito · buffer 0 · nessuna nota trattenuta.", "ok");
    updateRuntimeState({ lastAction: reason || "clear" });
  }

  function panic(reason) {
    clear(reason || "panic", { allAudioOff: true });
    window.SynthXLogger?.log("arp panic", reason || "manual");
  }

  function pickStepItem(sequence, cfg) {
    if (cfg.mode !== "random") {
      const item = sequence[stepIndex % sequence.length];
      stepIndex = (stepIndex + 1) % Math.max(1, sequence.length);
      return item;
    }
    if (sequence.length === 1) {
      lastRandomIndex = 0;
      return sequence[0];
    }
    let idx = Math.floor(Math.random() * sequence.length);
    if (cfg.randomNoRepeat && idx === lastRandomIndex) idx = (idx + 1 + Math.floor(Math.random() * (sequence.length - 1))) % sequence.length;
    lastRandomIndex = idx;
    return sequence[idx];
  }


  function getSwingAdjustedIntervalMs(baseIntervalMs, cfg, stepNumber) {
    const base = Math.max(LIMITS.minIntervalMs, Number(baseIntervalMs) || LIMITS.minIntervalMs);
    const swing = clamp(cfg?.swingPercent ?? 0, LIMITS.swingMin, LIMITS.swingMax) / 100;
    if (swing <= 0) return base;
    // v0.23.1b: local arp swing, long-short alternation, average timing preserved musically.
    // After odd-numbered steps the next step is delayed; after even-numbered steps it catches up.
    const multiplier = (Math.max(1, Number(stepNumber) || 1) % 2 === 1) ? (1 + swing) : (1 - swing);
    return Math.max(LIMITS.minIntervalMs, base * multiplier);
  }

  function scheduleGate(token, rawNote, gateMs) {
    clearTimer("gate");
    gateTimer = window.setTimeout(() => {
      if (token !== runToken) return;
      gateTimer = null;
      if (currentRawNote === rawNote) {
        releaseGeneratedNote(rawNote, "arp-gate", currentVisualNote);
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

  function nextStep(token) {
    if (token !== runToken) return;
    const cfg = getConfig();
    syncClampedUiValues(cfg);
    if (!cfg.enabled) {
      stopClock("disabled");
      setStatus(`Arp: OFF · ${modeLabel(cfg.mode)} · buffer 0.`, "info");
      return;
    }

    const sequence = buildSequence(cfg);
    if (!sequence.length) {
      stopClock("empty");
      setStatus(`Arp: ON · ${modeLabel(cfg.mode)} · in attesa di note · Latch ${cfg.latch ? "ON" : "OFF"}.`, "info");
      return;
    }

    const baseIntervalMs = window.SynthXMidiClock?.getStepIntervalMs?.("arp", cfg.rate, LIMITS.minIntervalMs) ?? Math.max(LIMITS.minIntervalMs, 1000 / cfg.rate);
    const clockLabel = window.SynthXMidiClock?.getEngineClockLabel?.("arp") || "Clock interno";
    const item = pickStepItem(sequence, cfg);

    releaseCurrent("arp-next-step");
    currentRawNote = item.note;
    currentVisualNote = setArpKey(currentRawNote, true);
    generatedRawNotes.add(currentRawNote);
    lastStepRawNote = item.note;
    lastStepName = noteName(item.note);
    lastStepNumber += 1;
    const nextIntervalMs = getSwingAdjustedIntervalMs(baseIntervalMs, cfg, lastStepNumber);
    const maxGateMs = Math.max(LIMITS.minGateMs, nextIntervalMs - LIMITS.gateTailSafetyMs);
    const itemGateScale = clamp(item.gateScale ?? 1, 0.35, 1.35);
    const gateMs = Math.min(maxGateMs, Math.max(LIMITS.minGateMs, nextIntervalMs * cfg.gate * itemGateScale));

    try { window.SynthXAudio?.noteOn?.(item.note, item.velocity); }
    catch (err) { window.SynthXLogger?.warn("arp noteOn error", err); }

    setStatus(`Arp: ON · ${modeLabel(cfg.mode)} · ${getMotionPatternRuntimeLabel(cfg)} · buffer ${heldInputs.size} · step ${lastStepNumber}: ${lastStepName} · Gate ${Math.round(cfg.gatePercent)}% · Swing ${Math.round(cfg.swingPercent)}% · ${clockLabel}.`, "ok");
    updateRuntimeState({ lastAction: "step" });
    scheduleGate(token, item.note, gateMs);
    scheduleStep(token, nextIntervalMs);
  }

  function start(reason) {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (stepTimer || currentRawNote !== null || generatedRawNotes.size > 0) return;
    if (!heldInputs.size) {
      setStatus(`Arp: ON · ${modeLabel(cfg.mode)} · in attesa di note.`, "info");
      updateRuntimeState({ lastAction: reason || "start-empty" });
      return;
    }
    runToken += 1;
    if (cfg.resetOnChange) resetStepCursor(reason || "start");
    nextStep(runToken);
  }

  function noteOn(note, velocity, source) {
    const cfg = getConfig();
    const midi = Math.round(Number(note));
    const vel = clamp(velocity ?? 1, 0, 1);
    if (!Number.isFinite(midi) || midi < 0 || midi > 127) return;

    if (!cfg.enabled) {
      window.SynthXAudio?.noteOn?.(midi, vel);
      return;
    }

    physicalInputs.set(midi, vel);
    heldInputs.set(midi, vel);
    markInputChanged(`note-on:${source || "input"}`);
    start(`note-on:${source || "input"}`);
    updateRuntimeState({ lastAction: `note-on:${source || "input"}` });
  }

  function noteOff(note, source) {
    const cfg = getConfig();
    const midi = Math.round(Number(note));
    if (!Number.isFinite(midi) || midi < 0 || midi > 127) return;

    if (!cfg.enabled) {
      window.SynthXAudio?.noteOff?.(midi);
      return;
    }

    physicalInputs.delete(midi);
    if (!cfg.latch) heldInputs.delete(midi);
    markInputChanged(`note-off:${source || "input"}`);
    if (!heldInputs.size && !cfg.latch) stopClock(`note-off:${source || "input"}`);
    updateRuntimeState({ lastAction: `note-off:${source || "input"}` });
  }

  function reconcileLatchOff() {
    heldInputs.clear();
    physicalInputs.forEach((velocity, note) => heldInputs.set(note, velocity));
    markInputChanged("latch-off");
    if (!heldInputs.size) stopClock("latch-off-empty");
    else if (!stepTimer && currentRawNote === null) start("latch-off-restart");
  }

  function handlePerformanceChange(id) {
    if (!getConfig().enabled) return;
    if (id === "performance-octave" || id === "performance-mode") {
      clear(`performance-change:${id}`, { allAudioOff: true });
      setStatus("Arp: pulito per cambio modalità Performance. Suona di nuovo le note per ripartire.", "info");
      return;
    }
    if (id === "performance-hold-enabled" || id === "performance-glide-enabled" || id === "performance-glide-ms") {
      releaseCurrent(`performance-change:${id}`);
      updateRuntimeState({ lastAction: `performance-change:${id}` });
    }
  }

  function onControlChange(id) {
    const controlId = String(id || "");
    if (controlId.startsWith("performance-")) {
      handlePerformanceChange(controlId);
      return;
    }
    if (!controlId.startsWith("arp-")) return;

    const cfg = getConfig();
    syncClampedUiValues(cfg);

    if (controlId === "arp-enabled") {
      if (cfg.enabled) {
        window.SynthXMotion?.setMode?.("arp", "arp-enabled", { sourceToggle: "arp" });
        heldInputs.clear();
        physicalInputs.clear();
        resetStepCursor("arp-enabled-reset");
        releaseAllGenerated("arp-enabled-reset");
        window.SynthXAudio?.allNotesOff?.();
        setStatus(`Arp: ON · ${modeLabel(cfg.mode)} · in attesa di note.`, "info");
      } else {
        clear("arp-disabled", { allAudioOff: true });
        window.SynthXMotion?.reconcile?.("arp-disabled");
        setStatus(`Arp: OFF · ${modeLabel(cfg.mode)} · buffer 0 · Latch ${cfg.latch ? "ON" : "OFF"}.`, "info");
      }
      updateRuntimeState({ lastAction: controlId });
      window.SynthXMotion?.updateRuntime?.(controlId);
      return;
    }

    if (controlId === "arp-latch-enabled" && !cfg.latch) reconcileLatchOff();
    if (["arp-mode", "arp-rate", "arp-gate", "arp-swing", "arp-octaves", "arp-motion-pattern", "arp-reset-on-change", "arp-random-no-repeat"].includes(controlId)) {
      resetStepCursor(`param:${controlId}`);
      if (cfg.enabled) {
        // v0.23.1a: every musical arp parameter change releases and reschedules conservatively.
        // This avoids stale notes and avoids waiting for an old rate timer after rate/gate/mode/octave edits.
        clearTimer("step");
        releaseCurrent(`param:${controlId}`);
      }
      if (cfg.enabled && heldInputs.size) start(`param:${controlId}`);
    }
    if (cfg.enabled && !stepTimer && heldInputs.size && currentRawNote === null) start(`param:${controlId}`);
    updateRuntimeState({ lastAction: `param:${controlId}` });
  }


  function resyncClock(reason) {
    if (!getConfig().enabled) return;
    clearTimer("step");
    releaseCurrent(reason || "midi-clock-resync");
    if (getConfig().resetOnChange) resetStepCursor(reason || "midi-clock-resync");
    if (heldInputs.size) start(reason || "midi-clock-resync");
    else updateRuntimeState({ lastAction: reason || "midi-clock-resync-empty" });
  }

  function getLastStepInfo() {
    return {
      rawNote: lastStepRawNote,
      noteName: lastStepName,
      number: lastStepNumber
    };
  }

  function init() {
    // v0.23.1: gli eventi dei controlli passano attraverso SynthXControls -> SynthXState -> SynthXAudio.onParameterChange.
    // Evitiamo listener duplicati qui, così l'arp riceve una sola notifica logica per cambio parametro.
    populateMotionPatternSelector();
    populateArpPresetSelector();
    bindArpPresetImportInput();
    syncClampedUiValues(getConfig());
    window.addEventListener("blur", () => {
      if (getConfig().enabled || heldInputs.size || generatedRawNotes.size) panic("window-blur");
    });
    window.addEventListener("beforeunload", () => {
      if (getConfig().enabled || heldInputs.size || generatedRawNotes.size) panic("beforeunload");
    });
    updateRuntimeState({ lastAction: "init" });
  }

  window.SynthXArpeggiator = {
    init,
    noteOn,
    noteOff,
    clear,
    panic,
    stop: stopClock,
    resyncClock,
    onControlChange,
    onPresetAction,
    handlePerformanceChange,
    isEnabled: () => getConfig().enabled,
    getConfig,
    getHeldInputCount: () => heldInputs.size,
    getPhysicalInputCount: () => physicalInputs.size,
    getGeneratedNoteCount: () => generatedRawNotes.size,
    getCurrentRawNote: () => currentRawNote,
    getCurrentNoteName: () => currentRawNote === null ? "" : noteName(currentRawNote),
    getLastStepInfo,
    getSwingAdjustedIntervalMs,
    getSequencePreview: () => sequencePreview(getConfig()),
    getMotionPatternLabel,
    getMotionPatternRuntimeLabel: () => getMotionPatternRuntimeLabel(getConfig()),
    getEffectiveMotionPatternId: () => getEffectiveMotionPatternId(buildLinearSequence(getConfig()), getConfig()),
    getMotionPatternIds: () => Object.keys(ARP_MOTION_PATTERNS),
    getMotionPatternCount: () => Object.keys(ARP_MOTION_PATTERNS).length,
    isValidMotionPattern: (value) => normalizeMotionPattern(value) === String(value || "linear"),
    getArpPresetIds: () => Object.keys(ARP_BEHAVIOR_PRESETS),
    getArpPresetCount: presetCount,
    getArpRandomizerProfileIds: () => Object.keys(ARP_RANDOMIZER_PROFILES),
    getArpRandomizerProfileCount: () => Object.keys(ARP_RANDOMIZER_PROFILES).length,
    getArpRandomizerDensityIds: () => Object.keys(ARP_RANDOMIZER_DENSITY),
    generateRandomArpConfig,
    randomizeArpBehavior,
    getArpPresetById,
    sanitizeArpPresetObject,
    normalizeMode
  };
})();
