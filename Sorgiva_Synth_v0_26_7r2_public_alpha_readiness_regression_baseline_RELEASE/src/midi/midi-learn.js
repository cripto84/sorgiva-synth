(function () {
  "use strict";

  // Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline.
  // Runtime-safe: stores only plain JSON mappings (CC -> target id + mode) in localStorage/export.
  // Adds explicit continuous/toggle/selector/trigger handlers without storing WebMIDI objects, events, timers, DOM nodes or functions.
  const STORAGE_KEY = window.SorgivaSynth?.storageKeys?.midiLearnMappings?.key || "sorgivaSynth.midiLearnMappings.v1";
  const LEGACY_STORAGE_KEYS = Object.freeze(window.SorgivaSynth?.storageKeys?.midiLearnMappings?.legacy || ["synthx.rebuild.midiLearnMappings.v0.14.1", "synthx.rebuild.midiLearnMappings.v0.14.0"]);
  const EXPORT_TYPE = "sorgiva_synth_midi_learn_mappings";
  const EXPORT_FORMAT_ID = "sorgiva-synth-midi-learn-mappings";
  const EXPORT_SCHEMA = "sorgiva-synth-midi-learn-mappings-v1";
  const LEGACY_EXPORT_TYPES = Object.freeze(["synthx_midi_learn_mappings"]);
  const STORAGE_VERSION = "0.14.2";
  const APP_VERSION = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || "0.26.7r2-public-alpha-readiness-regression-baseline";
  function exportMetadata() {
    if (window.SorgivaSynth?.buildExportMetadata) return window.SorgivaSynth.buildExportMetadata("midiLearn", { format: EXPORT_FORMAT_ID, schema: EXPORT_SCHEMA, formatVersion: STORAGE_VERSION });
    return { project: "Sorgiva Synth", format: EXPORT_FORMAT_ID, schema: EXPORT_SCHEMA, formatVersion: STORAGE_VERSION, appVersion: APP_VERSION, sorgivaVersion: APP_VERSION, sorgivaSynthVersion: APP_VERSION, synthxVersion: APP_VERSION, exportedBy: "Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline", exportedAt: nowIso(), compatibility: { legacySynthXImport: true, legacyTypesAccepted: LEGACY_EXPORT_TYPES } };
  }
  const MAX_MAPPINGS = 64;
  const MAX_IMPORT_ENTRIES = 256;
  const RESERVED_CC = new Set([1, 2, 4, 11, 64, 120, 121, 123]);
  const TARGET_MODE_CONTINUOUS = "continuous";
  const TARGET_MODE_TOGGLE = "toggle";
  const TARGET_MODE_SELECTOR = "selector";
  const TARGET_MODE_TRIGGER = "trigger";
  const VALID_TARGET_MODES = new Set([TARGET_MODE_CONTINUOUS, TARGET_MODE_TOGGLE, TARGET_MODE_SELECTOR, TARGET_MODE_TRIGGER]);
  const TARGET_GROUPS = Object.freeze({
    master: "Master/Global",
    oscillators: "Oscillators/Voice",
    filters: "Filters/Envelope",
    fx: "FX/EQ",
    lfo: "LFO",
    modmatrix: "Mod Matrix",
    performance: "Performance Sound",
    sequencer: "Step Sequencer",
    arpeggiator: "Arpeggiator",
    utility: "Utility/Transport"
  });

  function getEl(id) { return document.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }

  function classifyTargetId(id) {
    const targetId = String(id || "");
    if (targetId === "master" || targetId === "master-tuning-a4" || targetId === "voices") return TARGET_GROUPS.master;
    if (/^(osc|noise|ringmod|fm|oscsync|unison)/.test(targetId)) return TARGET_GROUPS.oscillators;
    if (/^(vcf|hpf|bpf|notch|filter|adv-filter|env)/.test(targetId)) return TARGET_GROUPS.filters;
    if (/^(sat|delay|rev|mod-|eq)/.test(targetId)) return TARGET_GROUPS.fx;
    if (/^lfo/.test(targetId)) return TARGET_GROUPS.lfo;
    if (/^modmat-/.test(targetId)) return TARGET_GROUPS.modmatrix;
    if (/^performance-/.test(targetId)) return TARGET_GROUPS.performance;
    if (/^seq-/.test(targetId)) return TARGET_GROUPS.sequencer;
    if (/^arp-/.test(targetId)) return TARGET_GROUPS.arpeggiator;
    if (targetId === "panic" || targetId === "midi-panic") return TARGET_GROUPS.utility;
    return "Other";
  }

  function makeTarget(id, label, mode, options) {
    return Object.freeze({
      id: String(id),
      label: String(label || id),
      mode: VALID_TARGET_MODES.has(mode) ? mode : TARGET_MODE_CONTINUOUS,
      group: options?.group || classifyTargetId(id),
      priority: options?.priority || (mode === TARGET_MODE_CONTINUOUS ? "expanded" : "new-mode"),
      threshold: Number.isFinite(Number(options?.threshold)) ? Number(options.threshold) : 64,
      safeTrigger: Boolean(options?.safeTrigger)
    });
  }
  function continuous(id, label, options) { return makeTarget(id, label, TARGET_MODE_CONTINUOUS, options); }
  function toggle(id, label, options) { return makeTarget(id, label, TARGET_MODE_TOGGLE, options); }
  function selector(id, label, options) { return makeTarget(id, label, TARGET_MODE_SELECTOR, options); }
  function trigger(id, label, options) { return makeTarget(id, label, TARGET_MODE_TRIGGER, { ...(options || {}), safeTrigger: true }); }

  const CURRENT_CONTINUOUS_TARGETS = [
    continuous("master", "Master Volume", { priority: "current" }),
    continuous("master-tuning-a4", "Master Tuning A4", { priority: "current" }),
    continuous("osc1-level", "Osc1 Volume", { priority: "current" }),
    continuous("osc2-level", "Osc2 Volume", { priority: "current" }),
    continuous("osc3-level", "Osc3 Volume", { priority: "current" }),
    continuous("osc1-fine", "Osc1 Fine Tune", { priority: "current" }),
    continuous("osc2-fine", "Osc2 Fine Tune", { priority: "current" }),
    continuous("osc3-fine", "Osc3 Fine Tune", { priority: "current" }),
    continuous("osc1-pan", "Osc1 Pan", { priority: "current" }),
    continuous("osc2-pan", "Osc2 Pan", { priority: "current" }),
    continuous("osc3-pan", "Osc3 Pan", { priority: "current" }),
    continuous("noise-db", "Noise Volume", { priority: "current" }),
    continuous("vcf-cutoff", "VCF Cutoff", { priority: "current" }),
    continuous("vcf-q", "VCF Q / Resonance", { priority: "current" }),
    continuous("hpf-cutoff", "HPF Cutoff", { priority: "current" }),
    continuous("bpf-cutoff", "BPF Center", { priority: "current" }),
    continuous("notch-cutoff", "Notch Center", { priority: "current" }),
    continuous("filter-env-amount", "Filter Env Amount", { priority: "current" }),
    continuous("filter-env-att", "Filter Env Attack", { priority: "current" }),
    continuous("filter-env-dec", "Filter Env Decay", { priority: "current" }),
    continuous("filter-env-sus", "Filter Env Sustain", { priority: "current" }),
    continuous("filter-env-rel", "Filter Env Release", { priority: "current" }),
    continuous("filter-drive-amount", "Filter Drive Amount", { priority: "current" }),
    continuous("filter-drive-trim", "Filter Drive Trim", { priority: "current" }),
    continuous("adv-filter-freq", "Advanced Filter Freq", { priority: "current" }),
    continuous("adv-filter-depth", "Advanced Filter Depth", { priority: "current" }),
    continuous("adv-filter-mix", "Advanced Filter Mix", { priority: "current" }),
    continuous("adv-filter-env-freq", "Advanced Env to Freq", { priority: "current" }),
    continuous("adv-filter-vel-depth", "Advanced Velocity to Depth", { priority: "current" }),
    continuous("adv-filter-vel-mix", "Advanced Velocity to Mix", { priority: "current" }),
    continuous("vcf-keytrack", "VCF Key Tracking", { priority: "current" }),
    continuous("vcf-velocity", "Velocity to VCF", { priority: "current" }),
    continuous("performance-key-velocity", "Keyboard Velocity", { priority: "current" }),
    continuous("sat-amt", "Drive Amount", { priority: "current" }),
    continuous("delay-mix", "Delay Mix", { priority: "current" }),
    continuous("delay-time", "Delay Time", { priority: "current" }),
    continuous("delay-feedback", "Delay Feedback", { priority: "current" }),
    continuous("delay-damp", "Delay Tone/Damping", { priority: "current" }),
    continuous("rev-mix", "Reverb Mix", { priority: "current" }),
    continuous("mod-mix", "Modulation FX Mix", { priority: "current" }),
    continuous("mod-rate", "Modulation FX Rate", { priority: "current" }),
    continuous("lfo1-rate", "LFO1 Rate", { priority: "current" }),
    continuous("lfo1-depth", "LFO1 Depth", { priority: "current" }),
    continuous("lfo2-rate", "LFO2 Rate", { priority: "current" }),
    continuous("lfo2-depth", "LFO2 Depth", { priority: "current" }),
    continuous("lfo3-rate", "LFO3 Rate", { priority: "current" }),
    continuous("lfo3-depth", "LFO3 Depth", { priority: "current" }),
    ...Array.from({ length: 8 }, (_, i) => continuous(`modmat-slot${i + 1}-amount`, `Mod Matrix Slot ${i + 1} Amount`, { priority: "current" })),
    continuous("env-att", "ADSR Attack", { priority: "current" }),
    continuous("env-rel", "ADSR Release", { priority: "current" }),
    continuous("eq-low", "EQ Low", { priority: "current" }),
    continuous("eq-high", "EQ High", { priority: "current" })
  ];

  const EXPANDED_CONTINUOUS_TARGETS = [
    continuous("voices", "Polyphony Voices"),
    ...[1, 2, 3].flatMap((n) => [
      continuous(`osc${n}-semi`, `Osc${n} Semitone`),
      continuous(`osc${n}-pulse-width`, `Osc${n} Pulse Width`),
      continuous(`osc${n}-pwm-amount`, `Osc${n} PWM Amount`)
    ]),
    continuous("ringmod-amount", "Ring Mod Amount"),
    continuous("fm-amount", "FM Amount"),
    continuous("oscsync-amount", "Osc Sync Amount"),
    continuous("unison-voices", "Unison Voices"),
    continuous("unison-max-layers", "Unison CPU Layer Limit"),
    continuous("unison-detune", "Unison Detune"),
    continuous("unison-spread", "Unison Spread"),
    continuous("hpf-q", "HPF Q"),
    continuous("bpf-q", "BPF Q"),
    continuous("notch-q", "Notch Q"),
    continuous("env-dec", "ADSR Decay"),
    continuous("env-sus", "ADSR Sustain"),
    continuous("sat-tone", "Saturation Tone"),
    continuous("sat-mix", "Saturation Mix"),
    continuous("sat-predb", "Saturation Pre Drive"),
    continuous("sat-voxpre", "Saturation Voice Pre Filter"),
    continuous("sat-dc", "Saturation DC Block"),
    continuous("sat-asym", "Saturation Asymmetry"),
    continuous("sat-hard", "Saturation Hardness"),
    continuous("sat-bias", "Saturation Bias"),
    continuous("sat-gate", "Saturation Noise Gate"),
    continuous("sat-oct", "Saturation Octave Texture"),
    continuous("mod-depth", "Modulation FX Depth"),
    continuous("rev-size", "Reverb Size"),
    continuous("rev-decay", "Reverb Decay"),
    continuous("rev-damp", "Reverb Damping"),
    continuous("eq-lowmid", "EQ Low-Mid"),
    continuous("eq-mid", "EQ Mid"),
    continuous("eq-highmid", "EQ High-Mid"),
    continuous("performance-octave", "Performance Octave"),
    continuous("performance-glide-ms", "Performance Glide Time"),
    continuous("seq-rate", "Sequencer Rate"),
    continuous("seq-gate", "Sequencer Global Gate"),
    continuous("arp-rate", "Arp Rate"),
    continuous("arp-gate", "Arp Gate"),
    continuous("arp-swing", "Arp Swing"),
    continuous("arp-octaves", "Arp Octaves")
  ];

  const TOGGLE_TARGETS = [
    ...[1, 2, 3].flatMap((n) => [
      toggle(`osc${n}-enabled`, `Osc${n} Enabled`),
      toggle(`lfo${n}-enabled`, `LFO${n} Enabled`),
      toggle(`lfo${n}-t-osc1`, `LFO${n} Target Osc1`),
      toggle(`lfo${n}-t-osc2`, `LFO${n} Target Osc2`),
      toggle(`lfo${n}-t-osc3`, `LFO${n} Target Osc3`)
    ]),
    toggle("noise-enabled", "Noise Enabled"),
    toggle("ringmod-enabled", "Ring Mod Enabled"),
    toggle("fm-enabled", "FM Enabled"),
    toggle("oscsync-enabled", "Osc Sync Enabled"),
    toggle("unison-enabled", "Unison Enabled"),
    ...Array.from({ length: 8 }, (_, i) => toggle(`modmat-slot${i + 1}-enabled`, `Mod Matrix Slot ${i + 1} Enabled`)),
    toggle("hpf-enabled", "HPF Enabled"),
    toggle("bpf-enabled", "BPF Enabled"),
    toggle("notch-enabled", "Notch Enabled"),
    toggle("vcf-enabled", "VCF Enabled"),
    toggle("filter-drive-enabled", "Filter Drive Enabled"),
    toggle("adv-filter-enabled", "Advanced Filter Enabled"),
    toggle("eq-enabled", "EQ Enabled"),
    toggle("sat-enabled", "Saturation Enabled"),
    toggle("mod-enabled", "Modulation FX Enabled"),
    toggle("delay-enabled", "Delay Enabled"),
    toggle("rev-enabled", "Reverb Enabled"),
    toggle("performance-hold-enabled", "Performance Hold Enabled"),
    toggle("performance-glide-enabled", "Performance Glide Enabled"),
    toggle("seq-enabled", "Sequencer Enabled"),
    toggle("seq-randomize-keep-length", "Sequencer Randomizer Keep Length"),
    toggle("arp-enabled", "Arp Enabled"),
    toggle("arp-latch-enabled", "Arp Latch Enabled"),
    toggle("arp-reset-on-change", "Arp Reset On Change"),
    toggle("arp-random-no-repeat", "Arp Random No Repeat"),
    toggle("arp-randomizer-keep-latch-off", "Arp Randomizer Keep Latch Off")
  ];

  const SELECTOR_TARGETS = [
    ...[1, 2, 3].flatMap((n) => [
      selector(`osc${n}-wave`, `Osc${n} Wave`),
      selector(`osc${n}-pwm-source`, `Osc${n} PWM Source`),
      selector(`lfo${n}-wave`, `LFO${n} Wave`),
      selector(`lfo${n}-rate-mode`, `LFO${n} Rate Mode`),
      selector(`lfo${n}-sync`, `LFO${n} Sync Division`),
      selector(`lfo${n}-dest`, `LFO${n} Destination`),
      selector(`lfo${n}-mode`, `LFO${n} Routing Mode`)
    ]),
    selector("noise-type", "Noise Type"),
    selector("ringmod-source-a", "Ring Mod Source A"),
    selector("ringmod-source-b", "Ring Mod Source B"),
    selector("fm-carrier", "FM Carrier"),
    selector("fm-modulator", "FM Modulator"),
    selector("oscsync-master", "Osc Sync Master"),
    selector("oscsync-slave", "Osc Sync Slave"),
    ...Array.from({ length: 8 }, (_, i) => [
      selector(`modmat-slot${i + 1}-source`, `Mod Matrix Slot ${i + 1} Source`),
      selector(`modmat-slot${i + 1}-destination`, `Mod Matrix Slot ${i + 1} Destination`)
    ]).flat(),
    selector("hpf-slope", "HPF Slope"),
    selector("vcf-slope", "VCF Slope"),
    selector("filter-env-target", "Filter Env Target"),
    selector("filter-env-polarity", "Filter Env Polarity"),
    selector("filter-drive-mode", "Filter Drive Mode"),
    selector("adv-filter-mode", "Advanced Filter Mode"),
    selector("adv-filter-vowel", "Advanced Filter Vowel"),
    selector("sat-mode", "Saturation Mode"),
    selector("mod-mode", "Modulation FX Mode"),
    selector("delay-mode", "Delay Mode"),
    selector("delay-time-mode", "Delay Time Mode"),
    selector("delay-sync", "Delay Sync Division"),
    selector("rev-mode", "Reverb Mode"),
    selector("performance-mode", "Performance Mode"),
    selector("performance-velocity-curve", "Velocity Curve"),
    selector("seq-length", "Sequencer Length"),
    selector("seq-pattern-preset", "Sequencer Pattern Preset"),
    selector("seq-randomize-style", "Sequencer Randomizer Style"),
    selector("seq-randomize-scope", "Sequencer Randomizer Scope"),
    selector("seq-randomize-density", "Sequencer Randomizer Density"),
    selector("seq-edit-step", "Sequencer Edit Step"),
    selector("arp-mode", "Arp Mode"),
    selector("arp-behavior-preset", "Arp Behavior Preset"),
    selector("arp-motion-pattern", "Arp Motion Pattern"),
    selector("arp-randomizer-profile", "Arp Randomizer Profile"),
    selector("arp-randomizer-scope", "Arp Randomizer Scope"),
    selector("arp-randomizer-density", "Arp Randomizer Density")
  ];

  const TRIGGER_TARGETS = [
    trigger("panic", "Panic / All Notes Off", { group: TARGET_GROUPS.utility }),
    trigger("performance-clear-hold", "Clear Performance Hold"),
    trigger("seq-randomize", "Randomize Sequencer Pattern"),
    trigger("arp-randomize-behavior", "Randomize Arp Behavior")
  ];

  const TARGETS = Object.freeze([
    ...CURRENT_CONTINUOUS_TARGETS,
    ...EXPANDED_CONTINUOUS_TARGETS,
    ...TOGGLE_TARGETS,
    ...SELECTOR_TARGETS,
    ...TRIGGER_TARGETS
  ]);

  let learnEnabled = false;
  let lastCc = null;
  let lastValue = 0;
  let lastChannel = null;
  let lastAction = "init";
  let health = "ok";
  let collisionCount = 0;
  let invalidMappingCount = 0;
  let importCount = 0;
  let exportCount = 0;
  let deviceChangeCount = 0;
  let storageStatus = "ready";
  const mappings = new Map(); // cc -> { cc, targetId, targetLabel, mode, min, max, step, createdAt, updatedAt }
  const triggerArmedByCc = new Map();
  const targetUiFilters = { group: "all", mode: "all", search: "" };
  const MODE_DESCRIPTIONS = Object.freeze({
    continuous: "CC 0-127 → valore continuo",
    toggle: "CC <64 = OFF, CC ≥64 = ON",
    selector: "CC 0-127 diviso in zone",
    trigger: "Rising edge sopra soglia"
  });

  function storageAvailable() {
    try { return typeof localStorage !== "undefined" && localStorage !== null; }
    catch (_) { return false; }
  }
  function clamp(value, min, max, fallback) {
    const n = Number(value);
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : min;
    if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fb));
    return Math.min(max, Math.max(min, n));
  }
  function ccNumber(value) {
    const cc = Math.round(Number(value));
    if (!Number.isFinite(cc) || cc < 0 || cc > 119 || RESERVED_CC.has(cc)) return null;
    return cc;
  }
  function ccValue(value) { return Math.round(clamp(value, 0, 127, 0)); }
  function targetById(id) { return TARGETS.find((target) => target.id === id) || null; }
  function targetLabel(id) { return targetById(id)?.label || id || "Parametro"; }
  function targetMode(id) { return targetById(id)?.mode || TARGET_MODE_CONTINUOUS; }
  function existingTargets() { return TARGETS.filter((target) => Boolean(getEl(target.id))); }
  function normalizeSearchText(value) { return String(value || "").trim().toLowerCase(); }
  function targetModeClass(mode) { return `midi-mode-${VALID_TARGET_MODES.has(mode) ? mode : TARGET_MODE_CONTINUOUS}`; }
  function targetMatchesFilters(target) {
    if (!target || !getEl(target.id)) return false;
    if (targetUiFilters.group !== "all" && target.group !== targetUiFilters.group) return false;
    if (targetUiFilters.mode !== "all" && target.mode !== targetUiFilters.mode) return false;
    const needle = normalizeSearchText(targetUiFilters.search);
    if (!needle) return true;
    const haystack = `${target.id} ${target.label} ${target.mode} ${target.group}`.toLowerCase();
    return haystack.includes(needle);
  }
  function visibleTargets() { return existingTargets().filter(targetMatchesFilters); }
  function mappingModeCounts(list) {
    return list.reduce((acc, target) => {
      const mode = target.mode || TARGET_MODE_CONTINUOUS;
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {});
  }
  function formatModeCounts(counts) {
    return [TARGET_MODE_CONTINUOUS, TARGET_MODE_TOGGLE, TARGET_MODE_SELECTOR, TARGET_MODE_TRIGGER]
      .map((mode) => `${mode}:${counts[mode] || 0}`)
      .join(" · ");
  }
  function safeIso(value) {
    const text = String(value || "").slice(0, 40);
    return text && !text.includes("[object") ? text : nowIso();
  }
  function slugifyName(name) {
    return String(name || "midi-learn-mappings")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "midi_learn_mappings";
  }

  function readElementRange(targetId) {
    const element = getEl(targetId);
    if (!element) return { min: 0, max: 1, step: 0.01 };
    if (element.tagName === "SELECT") return { min: 0, max: Math.max(0, element.options.length - 1), step: 1 };
    if (element.type === "checkbox" || element.type === "button") return { min: 0, max: 1, step: 1 };
    const min = Number.isFinite(Number(element.min)) ? Number(element.min) : 0;
    const max = Number.isFinite(Number(element.max)) ? Number(element.max) : 1;
    const step = element.step && element.step !== "any" && Number.isFinite(Number(element.step)) ? Number(element.step) : 0;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
      step: Math.max(0, step)
    };
  }

  function quantizeToStep(value, min, max, step) {
    const raw = clamp(value, min, max, min);
    const s = Number(step);
    if (!Number.isFinite(s) || s <= 0) return raw;
    const units = Math.round((raw - min) / s);
    const decimals = String(s).includes(".") ? Math.min(6, String(s).split(".")[1].length) : 0;
    return Number((min + (units * s)).toFixed(decimals));
  }

  function selectorValueFromCc(targetId, value) {
    const element = getEl(targetId);
    if (!element || element.tagName !== "SELECT" || !element.options.length) return null;
    const idx = Math.min(element.options.length - 1, Math.floor((ccValue(value) / 128) * element.options.length));
    return element.options[idx]?.value ?? element.options[0]?.value;
  }

  function ccToControlValue(value, mapping) {
    const mode = mapping.mode || targetMode(mapping.targetId);
    if (mode === TARGET_MODE_TOGGLE) return ccValue(value) >= (mapping.threshold || 64);
    if (mode === TARGET_MODE_SELECTOR) return selectorValueFromCc(mapping.targetId, value);
    const norm = ccValue(value) / 127;
    const range = readElementRange(mapping.targetId);
    const min = range.min;
    const max = range.max;
    const step = range.step;
    return quantizeToStep(min + ((max - min) * norm), min, max, step);
  }

  function sanitizeMapping(raw) {
    if (!raw || typeof raw !== "object") return null;
    const cc = ccNumber(raw.cc);
    const targetId = String(raw.targetId || raw.target || "").trim();
    const target = targetById(targetId);
    const element = target ? getEl(target.id) : null;
    if (cc === null || !target || !element) return null;
    const mode = VALID_TARGET_MODES.has(raw.mode) ? raw.mode : target.mode;
    if (mode === TARGET_MODE_TRIGGER && element.tagName !== "BUTTON") return null;
    if (mode === TARGET_MODE_SELECTOR && element.tagName !== "SELECT") return null;
    if (mode === TARGET_MODE_TOGGLE && element.type !== "checkbox") return null;
    const range = readElementRange(target.id);
    return {
      cc,
      targetId: target.id,
      targetLabel: target.label,
      mode,
      group: target.group || classifyTargetId(target.id),
      min: range.min,
      max: range.max,
      step: range.step,
      threshold: Math.round(clamp(raw.threshold ?? target.threshold ?? 64, 1, 126, 64)),
      createdAt: safeIso(raw.createdAt || raw.created || nowIso()),
      updatedAt: safeIso(raw.updatedAt || nowIso())
    };
  }

  function mappingList() {
    return Array.from(mappings.values()).sort((a, b) => a.cc - b.cc).map((item) => ({ ...item }));
  }

  function buildExportObject() {
    return {
      ...exportMetadata(),
      type: EXPORT_TYPE,
      legacyType: "synthx_midi_learn_mappings",
      version: STORAGE_VERSION,
      mappingModes: [TARGET_MODE_CONTINUOUS, TARGET_MODE_TOGGLE, TARGET_MODE_SELECTOR, TARGET_MODE_TRIGGER],
      legacyTypesAccepted: LEGACY_EXPORT_TYPES,
      count: mappings.size,
      mappings: mappingList()
    };
  }

  function saveMappings() {
    if (!storageAvailable()) {
      storageStatus = "localStorage unavailable";
      health = "warn";
      return false;
    }
    try {
      const payload = JSON.stringify(buildExportObject(), null, 2);
      localStorage.setItem(STORAGE_KEY, payload);
      const mirrorKey = LEGACY_STORAGE_KEYS?.[0];
      if (mirrorKey) { try { localStorage.setItem(mirrorKey, payload); } catch (_) {} }
      storageStatus = "saved";
      return true;
    } catch (err) {
      storageStatus = "save failed";
      health = "warn";
      window.SynthXLogger?.warn("midi learn localStorage save failed", err);
      return false;
    }
  }

  function parseStoredMappings(key) {
    if (!storageAvailable()) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.mappings) ? parsed.mappings : Array.isArray(parsed) ? parsed : [];
      return { key, list };
    } catch (err) {
      storageStatus = `corrupt ${key}`;
      invalidMappingCount += 1;
      try { localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw.slice(0, 20000)); } catch (_) {}
      window.SynthXLogger?.warn("midi learn localStorage corrupt", key, err);
      return { key, list: [] };
    }
  }

  function addSanitizedMapping(clean, options) {
    if (!clean) { invalidMappingCount += 1; return false; }
    const previousByCc = mappings.get(clean.cc);
    if (previousByCc && previousByCc.targetId !== clean.targetId) collisionCount += 1;

    // One CC controls one target, and one target is controlled by one CC.
    // This keeps CC mapping deterministic even after adding selector/toggle/trigger modes.
    Array.from(mappings.entries()).forEach(([cc, mapping]) => {
      if (cc !== clean.cc && mapping.targetId === clean.targetId) {
        mappings.delete(cc);
        triggerArmedByCc.delete(cc);
        collisionCount += 1;
      }
    });

    if (mappings.size >= MAX_MAPPINGS && !mappings.has(clean.cc)) {
      const first = mappingList()[0];
      if (first) {
        mappings.delete(first.cc);
        triggerArmedByCc.delete(first.cc);
        collisionCount += 1;
      }
    }

    mappings.set(clean.cc, { ...clean, updatedAt: nowIso() });
    if (clean.mode === TARGET_MODE_TRIGGER && !triggerArmedByCc.has(clean.cc)) triggerArmedByCc.set(clean.cc, true);
    if (!options?.silent) saveMappings();
    return true;
  }

  function loadMappings() {
    mappings.clear();
    triggerArmedByCc.clear();
    invalidMappingCount = 0;
    collisionCount = 0;
    storageStatus = storageAvailable() ? "ready" : "localStorage unavailable";
    const primary = parseStoredMappings(STORAGE_KEY);
    const source = primary || LEGACY_STORAGE_KEYS.map(parseStoredMappings).find((item) => item && item.list.length);
    if (!source) return;

    source.list.slice(0, MAX_IMPORT_ENTRIES).forEach((entry) => addSanitizedMapping(sanitizeMapping(entry), { silent: true }));
    if (source.list.length > MAX_MAPPINGS) collisionCount += Math.max(0, source.list.length - MAX_MAPPINGS);
    saveMappings();
    storageStatus = source.key === STORAGE_KEY ? "loaded" : "migrated legacy";
  }

  function setText(id, text, kind) {
    const el = getEl(id);
    if (!el) return;
    el.textContent = text;
    if (kind) el.dataset.kind = kind;
  }

  function setStatus(message, kind) {
    setText("midi-learn-status", message, kind || "info");
  }

  function updateRuntime(extra) {
    const selectedTargetId = getEl("midi-learn-target")?.value || "master";
    const selectedTarget = targetById(selectedTargetId);
    const patch = {
      enabled: learnEnabled,
      mappingCount: mappings.size,
      selectedTarget: selectedTargetId,
      selectedTargetLabel: targetLabel(selectedTargetId),
      selectedTargetMode: selectedTarget?.mode || TARGET_MODE_CONTINUOUS,
      lastCc,
      lastValue,
      lastChannel,
      lastAction,
      health,
      collisionCount,
      invalidMappingCount,
      importCount,
      exportCount,
      deviceChangeCount,
      storageStatus,
      mappings: mappingList(),
      ...(extra || {})
    };
    window.SynthXState?.updateMidiLearn?.(patch);
    renderStatus();
  }

  function renderMappings() {
    const host = getEl("midi-learn-mapping-list");
    if (!host) return;
    const list = mappingList();
    if (!list.length) {
      host.innerHTML = '<p class="muted subtle">Nessun mapping CC attivo.</p>';
      return;
    }
    const duplicateTargets = list.reduce((acc, mapping) => {
      acc[mapping.targetId] = (acc[mapping.targetId] || 0) + 1;
      return acc;
    }, {});
    host.innerHTML = list.map((mapping) => {
      const mode = mapping.mode || TARGET_MODE_CONTINUOUS;
      const detail = mode === TARGET_MODE_CONTINUOUS
        ? `range ${mapping.min}–${mapping.max}${mapping.step ? ` · step ${mapping.step}` : ""}`
        : mode === TARGET_MODE_TRIGGER
          ? `trigger rising edge ≥ ${mapping.threshold || 64}`
          : mode === TARGET_MODE_SELECTOR
            ? `selector zones 0–127`
            : `toggle <${mapping.threshold || 64}/≥${mapping.threshold || 64}`;
      const group = mapping.group || classifyTargetId(mapping.targetId);
      const duplicate = duplicateTargets[mapping.targetId] > 1;
      return `<div class="midi-learn-map-row" data-cc="${mapping.cc}" data-midi-mode="${mode}" data-midi-group="${group}">` +
        `<span><strong>CC ${mapping.cc}</strong> → ${mapping.targetLabel} <em class="muted">${group}</em></span>` +
        `<small class="muted"><span class="midi-mode-badge ${targetModeClass(mode)}">${mode}</span> · ${detail}${duplicate ? " · collision target" : ""}</small>` +
        `<button class="btn small" type="button" data-midi-learn-clear-cc="${mapping.cc}">Clear</button>` +
      `</div>`;
    }).join("");
  }

  function renderStatus() {
    const selected = getEl("midi-learn-target")?.value || "master";
    const target = targetById(selected);
    const existingCount = existingTargets().length;
    const visibleCount = visibleTargets().length;
    const ccText = lastCc === null ? "nessun CC" : `CC ${lastCc} val ${lastValue}/127${lastChannel ? ` ch ${lastChannel}` : ""}`;
    const enabledText = learnEnabled ? "Learn ON" : "Learn OFF";
    const kind = health === "warn" ? "warn" : (learnEnabled ? "ok" : "info");
    const modeText = target?.mode || TARGET_MODE_CONTINUOUS;
    setStatus(`MIDI Learn: ${enabledText} · target ${targetLabel(selected)} [${modeText}] · mapping ${mappings.size}/${MAX_MAPPINGS} · visibili ${visibleCount}/${existingCount} · ultimo ${ccText} · ${lastAction}.`, kind);
    setText("midi-learn-state-pill", enabledText, learnEnabled ? "ok" : "info");
    setText("midi-learn-target-pill", `Target ${targetLabel(selected)} · ${modeText}`, "info");
    setText("midi-learn-last-pill", lastCc === null ? "Ultimo CC --" : `Ultimo CC ${lastCc}=${lastValue}`, lastCc === null ? "info" : "ok");
    setText("midi-learn-count-pill", `Mapping ${mappings.size}/${MAX_MAPPINGS}`, mappings.size ? "ok" : "info");
    setText("midi-learn-health-pill", `Health ${health}${storageStatus ? ` · ${storageStatus}` : ""}`, health === "warn" ? "warn" : "ok");
    setText("midi-learn-collision-pill", `Collisioni ${collisionCount} · invalidi ${invalidMappingCount}`, collisionCount || invalidMappingCount ? "warn" : "info");
    setText("midi-learn-filter-pill", `Target ${visibleCount}/${existingCount} visibili`, visibleCount ? "info" : "warn");
    updateTargetHelp();
    renderMappings();
  }

  function populateGroupFilter() {
    const select = getEl("midi-learn-group-filter");
    if (!select) return;
    const previous = select.value || targetUiFilters.group || "all";
    const groups = Array.from(new Set(existingTargets().map((target) => target.group || classifyTargetId(target.id)))).sort();
    select.innerHTML = '<option value="all">Tutti i gruppi</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");
    select.value = groups.includes(previous) ? previous : "all";
    targetUiFilters.group = select.value;
  }

  function updateTargetHelp() {
    const help = getEl("midi-learn-target-help");
    if (!help) return;
    const selected = getEl("midi-learn-target")?.value || "";
    const target = targetById(selected);
    const existing = existingTargets();
    const visible = visibleTargets();
    const counts = mappingModeCounts(visible);
    if (!target) {
      help.textContent = `Nessun target visibile con i filtri attuali. Target disponibili: ${existing.length}.`;
      help.dataset.kind = "warn";
      return;
    }
    const mode = target.mode || TARGET_MODE_CONTINUOUS;
    help.textContent = `${target.label} · ${target.group} · ${mode}: ${MODE_DESCRIPTIONS[mode] || "mapping MIDI"}. Target visibili ${visible.length}/${existing.length} (${formatModeCounts(counts)}).`;
    help.dataset.kind = "info";
  }

  function populateTargets() {
    const select = getEl("midi-learn-target");
    if (!select) return;
    const current = select.value || "master";
    const filteredTargets = visibleTargets();
    select.innerHTML = "";
    if (!filteredTargets.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nessun target con questi filtri";
      option.disabled = true;
      select.appendChild(option);
      updateTargetHelp();
      return;
    }
    let currentGroup = "";
    let groupNode = null;
    filteredTargets.forEach((target) => {
      if (target.group !== currentGroup) {
        currentGroup = target.group;
        groupNode = document.createElement("optgroup");
        groupNode.label = currentGroup;
        select.appendChild(groupNode);
      }
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = `${target.label} · ${target.mode}`;
      option.dataset.mode = target.mode;
      option.dataset.group = target.group;
      groupNode.appendChild(option);
    });
    select.value = filteredTargets.some((target) => target.id === current) ? current : filteredTargets[0].id;
    updateTargetHelp();
  }

  function setLearnEnabled(next, reason) {
    learnEnabled = Boolean(next);
    const checkbox = getEl("midi-learn-enabled");
    if (checkbox) checkbox.checked = learnEnabled;
    lastAction = reason || (learnEnabled ? "learn-enabled" : "learn-disabled");
    if (storageStatus === "localStorage unavailable" || storageStatus === "save failed") health = "warn";
    else health = "ok";
    updateRuntime();
  }

  function assignMapping(cc, targetId) {
    const cleanCc = ccNumber(cc);
    const target = targetById(targetId);
    const element = target ? getEl(target.id) : null;
    if (cleanCc === null || !target || !element) {
      invalidMappingCount += 1;
      health = "warn";
      lastAction = `mapping rifiutato`;
      return null;
    }
    const range = readElementRange(target.id);
    const mapping = sanitizeMapping({
      cc: cleanCc,
      targetId: target.id,
      mode: target.mode,
      min: range.min,
      max: range.max,
      step: range.step,
      threshold: target.threshold || 64,
      createdAt: mappings.get(cleanCc)?.createdAt || nowIso(),
      updatedAt: nowIso()
    });
    if (!mapping) return null;
    addSanitizedMapping(mapping);
    health = "ok";
    lastAction = `learn CC ${mapping.cc} -> ${mapping.targetLabel} [${mapping.mode}]`;
    return mapping;
  }

  function clearMapping(cc) {
    const cleanCc = ccNumber(cc);
    if (cleanCc === null) return false;
    const removed = mappings.delete(cleanCc);
    triggerArmedByCc.delete(cleanCc);
    if (removed) saveMappings();
    lastAction = removed ? `clear CC ${cleanCc}` : "clear mapping missing";
    updateRuntime();
    return removed;
  }

  function clearSelectedTarget() {
    const targetId = getEl("midi-learn-target")?.value || "";
    let removed = 0;
    Array.from(mappings.entries()).forEach(([cc, mapping]) => {
      if (mapping.targetId === targetId) {
        mappings.delete(cc);
        triggerArmedByCc.delete(cc);
        removed += 1;
      }
    });
    if (removed) saveMappings();
    lastAction = removed ? `clear target ${targetLabel(targetId)}` : "clear target empty";
    updateRuntime();
  }

  function clearAll() {
    mappings.clear();
    triggerArmedByCc.clear();
    saveMappings();
    collisionCount = 0;
    invalidMappingCount = 0;
    health = "ok";
    lastAction = "clear all mappings";
    updateRuntime();
  }

  function repairMappings() {
    const before = mappings.size;
    const list = mappingList();
    mappings.clear();
    triggerArmedByCc.clear();
    list.forEach((entry) => addSanitizedMapping(sanitizeMapping(entry), { silent: true }));
    saveMappings();
    const removed = before - mappings.size;
    if (removed > 0) invalidMappingCount += removed;
    lastAction = removed > 0 ? `repair: rimossi ${removed} mapping` : "repair: mapping validi";
    health = removed > 0 ? "warn" : "ok";
    updateRuntime();
  }

  function refreshAfterMapping(targetId, mode) {
    const controls = window.SynthXControls;
    if (!controls) return;
    if (String(targetId).startsWith("modmat-slot")) window.SynthXModulationMatrix?.syncFromUi?.("midi-learn-cc");
    if (String(targetId).startsWith("filter") || /^(hpf|bpf|notch|vcf|adv-filter)/.test(targetId)) controls.updateFilterRouteStatus?.();
    if (/^(sat|delay|rev|mod-)/.test(targetId)) {
      controls.updateEffectUiStatus?.();
      controls.updateDelayUiStatus?.();
    }
    if (String(targetId).startsWith("eq")) controls.updateEqUiStatus?.();
    if (String(targetId).startsWith("performance-") || targetId === "master-tuning-a4") controls.updatePerformanceUiStatus?.();
    if (String(targetId).startsWith("seq-")) {
      window.SynthXSequencer?.onControlChange?.(targetId);
      controls.updateSeqUiStatus?.();
    }
    if (String(targetId).startsWith("arp-")) {
      window.SynthXArpeggiator?.onControlChange?.(targetId);
      controls.updateArpUiStatus?.();
    }
    if (String(targetId).startsWith("osc") || String(targetId).startsWith("lfo")) {
      controls.updateOscSyncUiStatus?.();
      controls.updateUnisonUiStatus?.();
    }
    if (String(targetId).startsWith("unison-")) controls.updateUnisonUiStatus?.();
    if (mode !== TARGET_MODE_CONTINUOUS) controls.updateMotionUiStatus?.();
  }

  function applyTriggerMapping(clean, value, channel) {
    const armed = triggerArmedByCc.get(clean.cc) !== false;
    const threshold = clean.threshold || 64;
    const nextHigh = ccValue(value) >= threshold;
    if (!nextHigh) {
      triggerArmedByCc.set(clean.cc, true);
      lastAction = `CC ${clean.cc} trigger armed -> ${clean.targetLabel}`;
      return true;
    }
    if (!armed) {
      lastAction = `CC ${clean.cc} trigger held -> ${clean.targetLabel}`;
      return true;
    }
    const element = getEl(clean.targetId);
    if (!element || element.tagName !== "BUTTON") return false;
    triggerArmedByCc.set(clean.cc, false);
    element.click();
    lastAction = `CC ${clean.cc} trigger -> ${clean.targetLabel}`;
    window.SynthXLogger?.log("midi learn trigger", { cc: clean.cc, value, channel, target: clean.targetId });
    return true;
  }

  function applyMapping(mapping, value, channel) {
    const clean = sanitizeMapping(mapping);
    if (!clean || !getEl(clean.targetId)) {
      if (mapping?.cc !== undefined) mappings.delete(Number(mapping.cc));
      invalidMappingCount += 1;
      health = "warn";
      saveMappings();
      return false;
    }
    if (clean.mode === TARGET_MODE_TRIGGER) {
      const fired = applyTriggerMapping(clean, value, channel);
      mappings.set(clean.cc, { ...clean, updatedAt: nowIso() });
      if (!fired) {
        invalidMappingCount += 1;
        health = "warn";
        return false;
      }
      return true;
    }
    const next = ccToControlValue(value, clean);
    if (next === null || next === undefined) {
      invalidMappingCount += 1;
      health = "warn";
      return false;
    }
    const ok = window.SynthXControls?.setControlValue?.(clean.targetId, next, "midi-learn-cc");
    if (!ok) {
      invalidMappingCount += 1;
      health = "warn";
      return false;
    }
    refreshAfterMapping(clean.targetId, clean.mode);
    // Keep stored range/mode synced with the current UI control range after future UI changes.
    mappings.set(clean.cc, { ...clean, updatedAt: nowIso() });
    lastAction = `CC ${clean.cc} -> ${clean.targetLabel} [${clean.mode}]`;
    window.SynthXLogger?.log("midi learn apply", { cc: clean.cc, value, channel, target: clean.targetId, mode: clean.mode, next });
    return true;
  }

  function handleCc(ccRaw, valueRaw, channel) {
    const cc = ccNumber(ccRaw);
    if (cc === null) {
      lastAction = `CC ${ccRaw} riservato/non valido`;
      updateRuntime();
      return false;
    }
    const value = ccValue(valueRaw);
    lastCc = cc;
    lastValue = value;
    lastChannel = Number(channel) || null;

    let learned = false;
    let applied = false;
    if (learnEnabled) {
      const targetId = getEl("midi-learn-target")?.value || "master";
      const mapping = assignMapping(cc, targetId);
      learned = Boolean(mapping);
      if (mapping) applied = applyMapping(mapping, value, channel) || applied;
    } else {
      const mapping = mappings.get(cc);
      if (mapping) applied = applyMapping(mapping, value, channel);
    }

    if (!learned && !applied) lastAction = `CC ${cc} non mappato`;
    updateRuntime({ lastAction });
    return learned || applied;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMappings() {
    const object = buildExportObject();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `${slugifyName("Sorgiva_Synth_midi_learn_mappings")}_v0_26_7r2_${stamp}.json`;
    downloadText(filename, JSON.stringify(object, null, 2));
    exportCount += 1;
    lastAction = `export mappings ${object.count}`;
    updateRuntime();
  }

  function importMappingObject(raw, options) {
    const list = Array.isArray(raw?.mappings) ? raw.mappings : Array.isArray(raw) ? raw : [];
    if (!Array.isArray(list)) throw new Error("JSON mapping senza array mappings.");
    const replace = Boolean(options?.replace);
    if (replace) {
      mappings.clear();
      triggerArmedByCc.clear();
    }
    const before = mappings.size;
    let accepted = 0;
    let rejected = 0;
    list.slice(0, MAX_IMPORT_ENTRIES).forEach((entry) => {
      const clean = sanitizeMapping(entry);
      if (clean && addSanitizedMapping(clean, { silent: true })) accepted += 1;
      else rejected += 1;
    });
    if (list.length > MAX_IMPORT_ENTRIES) rejected += list.length - MAX_IMPORT_ENTRIES;
    saveMappings();
    importCount += 1;
    invalidMappingCount += rejected;
    health = rejected ? "warn" : "ok";
    lastAction = `import mapping: ${accepted} accettati, ${rejected} scartati${replace ? ", replace" : ", merge"}`;
    updateRuntime({ importedBefore: before, importedAccepted: accepted, importedRejected: rejected });
    return { accepted, rejected };
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      health = "warn";
      lastAction = "import rifiutato: file troppo grande";
      updateRuntime();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const replace = window.confirm ? window.confirm("Importare i mapping MIDI Learn sostituendo quelli attuali? Premi Annulla per unirli ai mapping esistenti.") : false;
        importMappingObject(parsed, { replace });
      } catch (err) {
        health = "warn";
        invalidMappingCount += 1;
        lastAction = `import fallito: ${err.message || err}`;
        updateRuntime();
      }
    };
    reader.onerror = () => {
      health = "warn";
      lastAction = "import fallito: lettura file";
      updateRuntime();
    };
    reader.readAsText(file);
  }

  function handleMidiStateChange(description, meta) {
    deviceChangeCount += 1;
    if (learnEnabled && meta?.selectedMissing) setLearnEnabled(false, "learn-disabled: device-change");
    health = meta?.selectedMissing ? "warn" : health;
    lastAction = meta?.selectedMissing ? `device change: ${description || "input missing"}` : `device change`;
    updateRuntime({ lastDeviceChange: String(description || "").slice(0, 120) });
  }

  function init() {
    populateGroupFilter();
    populateTargets();
    loadMappings();
    const learn = getEl("midi-learn-enabled");
    const target = getEl("midi-learn-target");
    const groupFilter = getEl("midi-learn-group-filter");
    const modeFilter = getEl("midi-learn-mode-filter");
    const searchFilter = getEl("midi-learn-search");
    const clearTarget = getEl("midi-learn-clear-target");
    const clearAllButton = getEl("midi-learn-clear-all");
    const exportButton = getEl("midi-learn-export");
    const importButton = getEl("midi-learn-import");
    const importFile = getEl("midi-learn-import-file");
    const repairButton = getEl("midi-learn-repair");

    learn?.addEventListener("change", () => setLearnEnabled(learn.checked, learn.checked ? "learn-enabled" : "learn-disabled"));
    groupFilter?.addEventListener("change", () => {
      targetUiFilters.group = groupFilter.value || "all";
      populateTargets();
      lastAction = `filter group ${targetUiFilters.group}`;
      updateRuntime();
    });
    modeFilter?.addEventListener("change", () => {
      targetUiFilters.mode = VALID_TARGET_MODES.has(modeFilter.value) ? modeFilter.value : "all";
      populateTargets();
      lastAction = `filter mode ${targetUiFilters.mode}`;
      updateRuntime();
    });
    searchFilter?.addEventListener("input", () => {
      targetUiFilters.search = String(searchFilter.value || "");
      populateTargets();
      lastAction = targetUiFilters.search ? `search ${targetUiFilters.search.slice(0, 24)}` : "search cleared";
      updateRuntime();
    });
    target?.addEventListener("change", () => {
      const mode = targetMode(target.value);
      lastAction = `target ${targetLabel(target.value)} [${mode}]`;
      updateTargetHelp();
      updateRuntime();
    });
    clearTarget?.addEventListener("click", clearSelectedTarget);
    clearAllButton?.addEventListener("click", clearAll);
    exportButton?.addEventListener("click", exportMappings);
    importButton?.addEventListener("click", () => importFile?.click());
    importFile?.addEventListener("change", () => {
      handleImportFile(importFile.files?.[0]);
      importFile.value = "";
    });
    repairButton?.addEventListener("click", repairMappings);
    getEl("midi-learn-mapping-list")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-midi-learn-clear-cc]");
      if (!button) return;
      clearMapping(button.dataset.midiLearnClearCc);
    });
    setLearnEnabled(Boolean(learn?.checked), "init");
    window.SynthXLogger?.log("midi learn ready", { mappings: mappings.size, version: STORAGE_VERSION, targetCount: TARGETS.length });
  }

  function targetCoverageAudit() {
    const current = TARGETS.map((target) => ({
      id: target.id,
      label: target.label,
      mode: target.mode || TARGET_MODE_CONTINUOUS,
      group: target.group || classifyTargetId(target.id),
      priority: target.priority || "expanded",
      existsInDom: Boolean(getEl(target.id))
    }));
    const byMode = current.reduce((acc, target) => {
      acc[target.mode] = (acc[target.mode] || 0) + 1;
      return acc;
    }, {});
    const byGroup = current.reduce((acc, target) => {
      acc[target.group] = (acc[target.group] || 0) + 1;
      return acc;
    }, {});
    const missing = current.filter((target) => !target.existsInDom);
    return {
      version: APP_VERSION,
      auditBuild: "0.26.7r2-public-alpha-readiness-regression-baseline",
      currentTargetCount: current.length,
      mappingModeCounts: byMode,
      groupCounts: byGroup,
      reservedCc: Array.from(RESERVED_CC).sort((a, b) => a - b),
      maxMappings: MAX_MAPPINGS,
      importLimit: MAX_IMPORT_ENTRIES,
      visibleTargetCount: visibleTargets().length,
      uiFilters: { ...targetUiFilters },
      uiReorganization: {
        groupFilter: Boolean(getEl("midi-learn-group-filter")),
        modeFilter: Boolean(getEl("midi-learn-mode-filter")),
        searchFilter: Boolean(getEl("midi-learn-search")),
        modeLegend: Boolean(document.querySelector?.(".midi-learn-mode-legend")),
        filterPill: Boolean(getEl("midi-learn-filter-pill"))
      },
      missingTargets: missing,
      currentTargets: current,
      nextPassRecommendation: "Real-controller baseline passed for note, velocity and Mod Wheel. Extend coverage to selector zones, toggle thresholds, trigger rising-edge behavior and additional controller/browser combinations."
    };
  }

  window.SynthXMidiLearn = {
    init,
    handleCc,
    handleMidiStateChange,
    setLearnEnabled,
    clearMapping,
    clearAll,
    repairMappings,
    exportMappings,
    importMappingObject,
    getMappings: mappingList,
    getTargets: () => TARGETS.map((target) => ({ ...target })),
    getTargetCoverageAudit: targetCoverageAudit,
    getStatus: () => ({ enabled: learnEnabled, mappingCount: mappings.size, lastCc, lastValue, lastChannel, lastAction, health, collisionCount, invalidMappingCount, storageStatus })
  };
})();
