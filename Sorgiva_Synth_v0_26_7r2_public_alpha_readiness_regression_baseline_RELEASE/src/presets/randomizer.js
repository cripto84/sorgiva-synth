(function () {
  "use strict";

  const VERSION = "0.26.7r2-public-alpha-readiness-regression-baseline";
  const SOUND_RANDOMIZER_PROFILES = Object.freeze({
    safe: { label: "Safe Explore", osc: 0.90, filters: 0.92, advanced: 0.85, fx: 0.82, envelope: 0.88, modmatrix: 0.70, performance: 0.45 },
    bass: { label: "Bass", osc: 0.95, filters: 1.05, advanced: 0.70, fx: 0.70, envelope: 0.85, modmatrix: 0.60, performance: 0.70 },
    lead: { label: "Lead", osc: 1.05, filters: 1.00, advanced: 0.82, fx: 0.86, envelope: 0.78, modmatrix: 0.75, performance: 0.82 },
    pad: { label: "Pad", osc: 0.92, filters: 0.86, advanced: 0.90, fx: 1.02, envelope: 1.08, modmatrix: 0.78, performance: 0.55 },
    digital: { label: "Digital", osc: 1.10, filters: 0.82, advanced: 0.96, fx: 0.78, envelope: 0.82, modmatrix: 0.78, performance: 0.55 },
    ambient: { label: "Ambient", osc: 0.88, filters: 0.84, advanced: 0.95, fx: 1.10, envelope: 1.05, modmatrix: 0.85, performance: 0.45 },
    industrial: { label: "Industrial", osc: 1.08, filters: 1.05, advanced: 1.00, fx: 1.04, envelope: 0.86, modmatrix: 0.90, performance: 0.70 },
    percussive: { label: "Percussive", osc: 0.88, filters: 0.86, advanced: 0.70, fx: 0.72, envelope: 1.00, modmatrix: 0.45, performance: 0.50 },
    wild_safe: { label: "Wild Safe", osc: 1.18, filters: 1.12, advanced: 1.08, fx: 1.08, envelope: 1.00, modmatrix: 1.00, performance: 0.85 }
  });
  const MAX_OSC_LEVEL_SUM = 1.35;
  const MAX_ACTIVE_MODMATRIX_SLOTS = 3;
  const FM_AMOUNT_MAX = 0.70;
  const LAST_UNDO = { preset: null };

  function nowIso() { return new Date().toISOString(); }
  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
  function rand() { return Math.random(); }
  function randSigned() { return (Math.random() * 2) - 1; }
  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function status(message, kind) {
    const el = document.getElementById("randomizer-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
  }

  function getAmount() {
    const el = document.getElementById("randomizer-amount");
    const n = Number(el?.value ?? 0.25);
    return clamp(Number.isFinite(n) ? n : 0.25, 0.05, 1);
  }

  function getProfile() {
    const raw = String(document.getElementById("randomizer-profile")?.value || "safe");
    return Object.prototype.hasOwnProperty.call(SOUND_RANDOMIZER_PROFILES, raw) ? raw : "safe";
  }

  function areaAmount(profile, area, amount) {
    const cfg = SOUND_RANDOMIZER_PROFILES[profile] || SOUND_RANDOMIZER_PROFILES.safe;
    const factor = Number(cfg[area] ?? 1);
    return clamp(amount * (Number.isFinite(factor) ? factor : 1), 0.05, 1);
  }

  function updateAmountLabel() {
    const amount = getAmount();
    const label = document.getElementById("randomizer-amount-val");
    if (label) label.textContent = `${Math.round(amount * 100)}%`;
  }

  function getOptions(id) {
    const el = document.getElementById(id);
    if (!el || el.tagName !== "SELECT") return [];
    return Array.from(el.options).map((item) => item.value).filter((value) => value !== "");
  }

  function elementValue(id, parameters) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (Object.prototype.hasOwnProperty.call(parameters, id)) return parameters[id];
    if (el.type === "checkbox") return Boolean(el.checked);
    if (el.type === "range" || el.type === "number") return Number(el.value);
    return el.value;
  }

  function safeRange(id) {
    const el = document.getElementById(id);
    const min = Number(el?.min ?? 0);
    const max = Number(el?.max ?? 1);
    const step = Number(el?.step ?? 0.01);
    return {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 1,
      step: Number.isFinite(step) && step > 0 ? step : 0.01
    };
  }

  function roundToStep(value, step, min) {
    if (!Number.isFinite(step) || step <= 0) return value;
    const base = Number.isFinite(Number(min)) ? Number(min) : 0;
    const rounded = base + Math.round((value - base) / step) * step;
    if (step >= 1) return Math.round(rounded);
    const decimals = Math.min(6, Math.max(0, String(step).split(".")[1]?.length || 0));
    return Number(rounded.toFixed(decimals));
  }

  function setNumeric(parameters, id, value, options) {
    const range = safeRange(id);
    const min = Number.isFinite(options?.min) ? options.min : range.min;
    const max = Number.isFinite(options?.max) ? options.max : range.max;
    const step = Number.isFinite(options?.step) ? options.step : range.step;
    parameters[id] = clamp(roundToStep(value, step, min), min, max);
  }

  function clampExistingNumeric(parameters, id, min, max, step) {
    if (!Object.prototype.hasOwnProperty.call(parameters, id)) return 0;
    const before = Number(parameters[id]);
    const fallback = Number.isFinite(before) ? before : min;
    const next = clamp(roundToStep(fallback, Number.isFinite(step) ? step : safeRange(id).step, min), min, max);
    parameters[id] = next;
    return before !== next ? 1 : 0;
  }

  function activeOscillatorLevelSum(parameters) {
    return [1, 2, 3].reduce((sum, index) => {
      const enabled = Boolean(parameters[`osc${index}-enabled`]);
      const level = clamp(Number(parameters[`osc${index}-level`] ?? 0), 0, 1);
      return enabled ? sum + level : sum;
    }, 0);
  }

  function capOscillatorGainSum(parameters) {
    const sum = activeOscillatorLevelSum(parameters);
    if (sum <= MAX_OSC_LEVEL_SUM || sum <= 0) return 0;
    const ratio = MAX_OSC_LEVEL_SUM / sum;
    let corrections = 0;
    [1, 2, 3].forEach((index) => {
      if (!Boolean(parameters[`osc${index}-enabled`])) return;
      const id = `osc${index}-level`;
      const before = Number(parameters[id] ?? 0);
      const next = clamp(roundToStep(before * ratio, 0.01, 0), 0, 0.95);
      parameters[id] = next;
      if (before !== next) corrections += 1;
    });
    return corrections;
  }

  function modAmountCap(destination) {
    const caps = {
      pitch: 0.18,
      volume: 0.22,
      pan: 0.50,
      filter_drive: 0.35,
      adv_filter_depth: 0.42,
      adv_filter_mix: 0.42,
      adv_filter_freq: 0.48,
      vcf_cutoff: 0.50,
      hpf_cutoff: 0.50,
      bpf_center: 0.50,
      notch_center: 0.50,
      mod_fx_mix: 0.24,
      mod_fx_rate: 0.20,
      mod_fx_depth: 0.22,
      delay_mix: 0.22,
      delay_time: 0.14,
      delay_feedback: 0.16,
      delay_damp: 0.22,
      reverb_mix: 0.22,
      reverb_damp: 0.22
    };
    return caps[String(destination || "")] || 0.45;
  }

  function nudgeNumeric(parameters, id, amount, scale, options) {
    if (!document.getElementById(id)) return false;
    const range = safeRange(id);
    const min = Number.isFinite(options?.min) ? options.min : range.min;
    const max = Number.isFinite(options?.max) ? options.max : range.max;
    const current = Number(elementValue(id, parameters));
    const fallback = Number.isFinite(current) ? current : (min + max) / 2;
    const span = Math.max(0, max - min);
    const next = fallback + (randSigned() * span * amount * (Number.isFinite(scale) ? scale : 0.35));
    setNumeric(parameters, id, next, { ...options, min, max });
    return true;
  }

  function absoluteNumeric(parameters, id, amount, options) {
    if (!document.getElementById(id)) return false;
    const range = safeRange(id);
    const min = Number.isFinite(options?.min) ? options.min : range.min;
    const max = Number.isFinite(options?.max) ? options.max : range.max;
    const current = Number(elementValue(id, parameters));
    const fallback = Number.isFinite(current) ? current : (min + max) / 2;
    const target = min + rand() * (max - min);
    const next = fallback + ((target - fallback) * amount);
    setNumeric(parameters, id, next, { ...options, min, max });
    return true;
  }

  function maybeToggle(parameters, id, amount, probability) {
    const el = document.getElementById(id);
    if (!el || el.type !== "checkbox") return false;
    const current = Boolean(elementValue(id, parameters));
    if (rand() < amount * (Number.isFinite(probability) ? probability : 0.25)) parameters[id] = !current;
    else parameters[id] = current;
    return true;
  }

  function maybeSelect(parameters, id, amount, probability, allowed) {
    const options = Array.isArray(allowed) && allowed.length ? allowed.filter((value) => getOptions(id).includes(value)) : getOptions(id);
    if (!options.length) return false;
    const current = String(elementValue(id, parameters) ?? options[0]);
    if (rand() < amount * (Number.isFinite(probability) ? probability : 0.35)) {
      const candidates = options.filter((value) => value !== current);
      parameters[id] = candidates.length ? candidates[Math.floor(rand() * candidates.length)] : current;
    } else {
      parameters[id] = options.includes(current) ? current : options[0];
    }
    return true;
  }


  function ensureAudibleSource(parameters) {
    const oscEnabled = [1, 2, 3].some((index) => Boolean(parameters[`osc${index}-enabled`]) && Number(parameters[`osc${index}-level`] ?? 0) > 0.02);
    const noiseEnabled = Boolean(parameters["noise-enabled"]) && Number(parameters["noise-db"] ?? -24) > -23;
    if (oscEnabled || noiseEnabled) return false;
    parameters["osc1-enabled"] = true;
    parameters["osc1-level"] = Math.max(0.45, Number(parameters["osc1-level"] ?? 0));
    return true;
  }

  function safeRingModSourceCandidates(sourceA) {
    const all = ["osc1", "osc2", "osc3"];
    const carrier = String(sourceA || "osc1");
    return all.filter((item) => item !== carrier).concat(all.filter((item) => item === carrier));
  }

  function randomRingMod(parameters, amount) {
    if (!document.getElementById("ringmod-enabled")) return 0;
    let count = 0;
    const currentEnabled = Boolean(elementValue("ringmod-enabled", parameters));
    const enableChance = currentEnabled ? 0.36 : 0.12;
    if (rand() < amount * enableChance) {
      parameters["ringmod-enabled"] = !currentEnabled;
      count += 1;
    } else {
      parameters["ringmod-enabled"] = currentEnabled;
    }

    maybeSelect(parameters, "ringmod-source-a", amount, 0.20, ["osc1", "osc2", "osc3"]);
    const sourceA = String(parameters["ringmod-source-a"] || elementValue("ringmod-source-a", parameters) || "osc1");
    maybeSelect(parameters, "ringmod-source-b", amount, 0.26, safeRingModSourceCandidates(sourceA));
    count += 2;

    const enabled = Boolean(parameters["ringmod-enabled"]);
    if (enabled) count += ensureOscillatorAudible(parameters, parameters["ringmod-source-a"] || "osc1", 0.20);
    const maxAmount = enabled ? Math.min(0.35, 0.06 + amount * 0.24) : 0.10;
    count += Number(nudgeNumeric(parameters, "ringmod-amount", amount, 0.28, { min: 0, max: maxAmount, step: 0.01 }));
    if (!enabled && Number(parameters["ringmod-amount"] ?? 0) < 0.04) parameters["ringmod-amount"] = 0;
    return count;
  }

  function safeFmModulatorCandidates(carrier) {
    const all = ["osc1", "osc2", "osc3"];
    const normalizedCarrier = String(carrier || "osc1");
    return all.filter((item) => item !== normalizedCarrier).concat(all.filter((item) => item === normalizedCarrier));
  }

  function differentOscillatorCandidates(source) {
    const all = ["osc1", "osc2", "osc3"];
    const normalized = String(source || "osc1");
    return all.filter((item) => item !== normalized).concat(all.filter((item) => item === normalized));
  }

  function ensureOscillatorAudible(parameters, source, minLevel) {
    const index = Number(String(source || "osc1").replace("osc", ""));
    if (![1, 2, 3].includes(index)) return 0;
    let changed = 0;
    if (!Boolean(parameters[`osc${index}-enabled`])) {
      parameters[`osc${index}-enabled`] = true;
      changed += 1;
    }
    const currentLevel = Number(parameters[`osc${index}-level`] ?? 0);
    const target = Number.isFinite(Number(minLevel)) ? Number(minLevel) : 0.18;
    if (!Number.isFinite(currentLevel) || currentLevel < target) {
      parameters[`osc${index}-level`] = target;
      changed += 1;
    }
    return changed;
  }

  function atLeastTwoAudibleOscillators(parameters) {
    const active = [1, 2, 3].filter((index) => Boolean(parameters[`osc${index}-enabled`]) && Number(parameters[`osc${index}-level`] ?? 0) > 0.03);
    if (active.length >= 2) return 0;
    const candidate = active[0] === 2 ? 3 : 2;
    return ensureOscillatorAudible(parameters, `osc${candidate}`, 0.18);
  }

  function randomFmLight(parameters, amount) {
    if (!document.getElementById("fm-enabled")) return 0;
    let count = 0;
    const currentEnabled = Boolean(elementValue("fm-enabled", parameters));
    const enableChance = currentEnabled ? 0.28 : 0.09;
    if (rand() < amount * enableChance) {
      parameters["fm-enabled"] = !currentEnabled;
      count += 1;
    } else {
      parameters["fm-enabled"] = currentEnabled;
    }

    maybeSelect(parameters, "fm-carrier", amount, 0.16, ["osc1", "osc2", "osc3"]);
    const carrier = String(parameters["fm-carrier"] || elementValue("fm-carrier", parameters) || "osc1");
    maybeSelect(parameters, "fm-modulator", amount, 0.22, safeFmModulatorCandidates(carrier));
    count += 2;

    const enabled = Boolean(parameters["fm-enabled"]);
    if (enabled) count += ensureOscillatorAudible(parameters, parameters["fm-carrier"] || "osc1", 0.20);
    const musicalMax = enabled ? Math.min(0.42, 0.08 + amount * 0.34) : 0.12;
    const edgeMax = enabled && amount > 0.78 && rand() < amount * 0.12 ? FM_AMOUNT_MAX : musicalMax;
    count += Number(nudgeNumeric(parameters, "fm-amount", amount, 0.26, { min: 0, max: edgeMax, step: 0.005 }));
    if (!enabled && Number(parameters["fm-amount"] ?? 0) < 0.025) parameters["fm-amount"] = 0;
    return count;
  }

  function randomOscSync(parameters, amount) {
    if (!document.getElementById("oscsync-enabled")) return 0;
    let count = 0;
    const currentEnabled = Boolean(elementValue("oscsync-enabled", parameters));
    const enableChance = currentEnabled ? 0.26 : 0.08;
    if (rand() < amount * enableChance) {
      parameters["oscsync-enabled"] = !currentEnabled;
      count += 1;
    } else {
      parameters["oscsync-enabled"] = currentEnabled;
    }

    count += Number(maybeSelect(parameters, "oscsync-master", amount, 0.18, ["osc1", "osc2", "osc3"]));
    const master = String(parameters["oscsync-master"] || elementValue("oscsync-master", parameters) || "osc1");
    count += Number(maybeSelect(parameters, "oscsync-slave", amount, 0.26, differentOscillatorCandidates(master)));
    const slave = String(parameters["oscsync-slave"] || elementValue("oscsync-slave", parameters) || "osc2");
    if (master === slave) {
      parameters["oscsync-slave"] = differentOscillatorCandidates(master)[0] || "osc2";
      count += 1;
    }

    const enabled = Boolean(parameters["oscsync-enabled"]);
    if (enabled) {
      count += ensureOscillatorAudible(parameters, parameters["oscsync-slave"] || "osc2", 0.20);
      count += atLeastTwoAudibleOscillators(parameters);
    }
    const safeMax = enabled ? Math.min(0.42, 0.07 + amount * 0.30) : 0.12;
    count += Number(nudgeNumeric(parameters, "oscsync-amount", amount, 0.26, { min: 0, max: safeMax, step: 0.01 }));
    if (!enabled && Number(parameters["oscsync-amount"] ?? 0) < 0.025) parameters["oscsync-amount"] = 0;
    return count;
  }

  function randomUnison(parameters, amount) {
    if (!document.getElementById("unison-enabled")) return 0;
    let count = 0;
    const currentEnabled = Boolean(elementValue("unison-enabled", parameters));
    const enableChance = currentEnabled ? 0.30 : 0.10;
    if (rand() < amount * enableChance) {
      parameters["unison-enabled"] = !currentEnabled;
      count += 1;
    } else {
      parameters["unison-enabled"] = currentEnabled;
    }

    const enabled = Boolean(parameters["unison-enabled"]);
    const uiVoiceMax = Math.round(clamp(Number(document.getElementById("unison-voices")?.max || 12), 1, 12));
    const uiLayerMax = Math.round(clamp(Number(document.getElementById("unison-max-layers")?.max || 12), 1, 12));
    const hardMax = Math.max(1, Math.min(12, uiVoiceMax, uiLayerMax));
    const musicalCeiling = enabled ? Math.max(2, Math.round(clamp(2 + amount * 10, 2, hardMax))) : 2;
    const rareExtendedCeiling = enabled && amount > 0.82 && rand() < 0.18 ? hardMax : musicalCeiling;
    const layerCeiling = enabled ? Math.max(2, Math.min(hardMax, rareExtendedCeiling)) : 2;
    const voicesMax = enabled ? layerCeiling : 2;

    if (enabled && amount > 0.88 && hardMax >= 8 && rand() < 0.10) {
      const highMin = Math.min(hardMax, 7);
      const target = highMin + Math.floor(rand() * Math.max(1, hardMax - highMin + 1));
      setNumeric(parameters, "unison-voices", target, { min: 2, max: hardMax, step: 1 });
      setNumeric(parameters, "unison-max-layers", target, { min: 2, max: hardMax, step: 1 });
      count += 2;
    } else {
      count += Number(nudgeNumeric(parameters, "unison-voices", amount, 0.34, { min: 1, max: voicesMax, step: 1 }));
      count += Number(nudgeNumeric(parameters, "unison-max-layers", amount, 0.30, { min: 1, max: layerCeiling, step: 1 }));
    }

    count += Number(nudgeNumeric(parameters, "unison-detune", amount, 0.42, { min: 0, max: enabled ? 14 : 8, step: 0.5 }));
    count += Number(nudgeNumeric(parameters, "unison-spread", amount, 0.40, { min: 0, max: enabled ? 0.68 : 0.35, step: 0.01 }));

    parameters["unison-voices"] = Math.round(clamp(Number(parameters["unison-voices"] ?? 1), 1, enabled ? hardMax : voicesMax));
    parameters["unison-max-layers"] = Math.round(clamp(Number(parameters["unison-max-layers"] ?? 1), 1, enabled ? hardMax : layerCeiling));
    if (enabled && Number(parameters["unison-voices"] ?? 1) < 2) parameters["unison-voices"] = 2;
    if (enabled && Number(parameters["unison-max-layers"] ?? 1) < 2) parameters["unison-max-layers"] = 2;
    if (!enabled && Number(parameters["unison-detune"] ?? 0) < 0.5) parameters["unison-detune"] = 0;
    return count;
  }

  function randomPulsePwmForPulseWave(parameters, index, amount) {
    const waveId = `osc${index}-wave`;
    const wave = String(parameters[waveId] ?? elementValue(waveId, parameters) ?? "");
    if (wave !== "pulse") return 0;

    let count = 0;
    count += Number(nudgeNumeric(parameters, `osc${index}-pulse-width`, amount, 0.32, { min: 0.12, max: 0.88, step: 0.01 }));

    const amountId = `osc${index}-pwm-amount`;
    if (rand() < amount * 0.22) {
      const safeMax = Math.min(0.22, 0.06 + amount * 0.18);
      setNumeric(parameters, amountId, rand() * safeMax, { min: 0, max: safeMax, step: 0.01 });
      count += 1;
    } else {
      count += Number(nudgeNumeric(parameters, amountId, amount, 0.25, { min: 0, max: 0.22, step: 0.01 }));
    }

    const pwmAmount = Number(parameters[amountId] ?? elementValue(amountId, parameters) ?? 0);
    const sourceId = `osc${index}-pwm-source`;
    if (pwmAmount > 0.02) {
      count += Number(maybeSelect(parameters, sourceId, amount, 0.18, ["off", "lfo1", "lfo2", "lfo3"]));
    } else if (document.getElementById(sourceId)) {
      parameters[sourceId] = "off";
    }
    return count;
  }

  function randomLfoTargetMatrix(parameters, amount) {
    let count = 0;
    for (let lfo = 1; lfo <= 3; lfo += 1) {
      const mode = String(parameters[`lfo${lfo}-mode`] ?? elementValue(`lfo${lfo}-mode`, parameters) ?? "global");
      let activeTargets = 0;
      for (let osc = 1; osc <= 3; osc += 1) {
        const id = `lfo${lfo}-t-osc${osc}`;
        if (!document.getElementById(id)) continue;
        const current = Boolean(elementValue(id, parameters));
        if (mode === "per_osc") {
          const next = rand() < (0.42 + amount * 0.32) ? true : (rand() < 0.34 ? !current : current);
          parameters[id] = Boolean(next);
        } else {
          parameters[id] = current;
        }
        if (parameters[id]) activeTargets += 1;
        count += 1;
      }
      if (mode === "per_osc" && activeTargets === 0 && document.getElementById(`lfo${lfo}-t-osc1`)) {
        parameters[`lfo${lfo}-t-osc1`] = true;
        count += 1;
      }
    }
    return count;
  }

  function randomPerformanceSound(parameters, amount, profile) {
    let count = 0;
    const normalizedProfile = String(profile || "safe");
    if (document.getElementById("performance-mode")) {
      const modeProbability = normalizedProfile === "bass" || normalizedProfile === "lead" || normalizedProfile === "industrial" ? 0.36 : 0.14;
      count += Number(maybeSelect(parameters, "performance-mode", amount, modeProbability, ["poly", "mono"]));
    }
    if (document.getElementById("performance-glide-enabled")) {
      const glideChance = normalizedProfile === "bass" || normalizedProfile === "lead" || normalizedProfile === "industrial" ? 0.28 : 0.10;
      count += Number(maybeToggle(parameters, "performance-glide-enabled", amount, glideChance));
    }
    const glideMax = normalizedProfile === "pad" || normalizedProfile === "ambient" ? 180 : normalizedProfile === "percussive" ? 45 : 120;
    count += Number(nudgeNumeric(parameters, "performance-glide-ms", amount, 0.34, { min: 0, max: glideMax, step: 5 }));
    count += Number(nudgeNumeric(parameters, "performance-key-velocity", amount, 0.30, { min: 0.35, max: 1, step: 0.01 }));
    count += Number(maybeSelect(parameters, "performance-velocity-curve", amount, 0.22));
    return count;
  }

  function applySoundProfileBias(parameters, scope, amount, profile) {
    const normalizedScope = String(scope || "all");
    const normalizedProfile = String(profile || "safe");
    let count = 0;
    const canOsc = scopeIncludes(normalizedScope, "osc");
    const canFilters = scopeIncludes(normalizedScope, "filters");
    const canFx = scopeIncludes(normalizedScope, "fx");
    const canEnv = scopeIncludes(normalizedScope, "envelope");
    const canPerformance = scopeIncludes(normalizedScope, "performance");

    if (canEnv && normalizedProfile === "percussive") {
      setNumeric(parameters, "env-att", Math.min(Number(parameters["env-att"] ?? 10), 12), { min: 0, max: 120, step: 1 });
      setNumeric(parameters, "env-dec", clamp(Number(parameters["env-dec"] ?? 180), 45, 620), { min: 20, max: 800, step: 1 });
      setNumeric(parameters, "env-sus", clamp(Number(parameters["env-sus"] ?? 0.6), 0, 0.42), { min: 0, max: 0.55, step: 0.01 });
      setNumeric(parameters, "env-rel", clamp(Number(parameters["env-rel"] ?? 160), 35, 850), { min: 20, max: 900, step: 1 });
      count += 4;
    }
    if (canEnv && (normalizedProfile === "pad" || normalizedProfile === "ambient")) {
      setNumeric(parameters, "env-att", clamp(Number(parameters["env-att"] ?? 120), 80, 1400), { min: 0, max: 1600, step: 1 });
      setNumeric(parameters, "env-rel", clamp(Number(parameters["env-rel"] ?? 900), 450, 3800), { min: 20, max: 4200, step: 1 });
      count += 2;
    }
    if (canOsc && normalizedProfile === "digital") {
      if (document.getElementById("fm-enabled") && rand() < amount * 0.20) { parameters["fm-enabled"] = true; count += ensureOscillatorAudible(parameters, parameters["fm-carrier"] || "osc1", 0.20); }
      if (document.getElementById("ringmod-enabled") && rand() < amount * 0.18) { parameters["ringmod-enabled"] = true; count += atLeastTwoAudibleOscillators(parameters); }
      count += Number(nudgeNumeric(parameters, "fm-amount", amount, 0.22, { min: 0, max: 0.48, step: 0.005 }));
      count += Number(nudgeNumeric(parameters, "ringmod-amount", amount, 0.20, { min: 0, max: 0.42, step: 0.01 }));
    }
    if (canFx && normalizedProfile === "industrial") {
      if (document.getElementById("sat-enabled") && rand() < amount * 0.28) parameters["sat-enabled"] = true;
      count += Number(nudgeNumeric(parameters, "sat-amt", amount, 0.42, { min: 0, max: 0.78, step: 0.01 }));
      count += Number(nudgeNumeric(parameters, "sat-mix", amount, 0.36, { min: 0, max: 0.66, step: 0.01 }));
    }
    if (canFilters && normalizedProfile === "bass") {
      if (document.getElementById("vcf-enabled")) parameters["vcf-enabled"] = true;
      count += Number(nudgeNumeric(parameters, "vcf-cutoff", amount, 0.24, { min: 0.12, max: 0.72, step: 0.001 }));
      count += Number(nudgeNumeric(parameters, "vcf-q", amount, 0.24, { min: 0.4, max: 4.5, step: 0.01 }));
    }
    if (canFx && (normalizedProfile === "pad" || normalizedProfile === "ambient")) {
      if (document.getElementById("rev-enabled") && rand() < amount * 0.22) parameters["rev-enabled"] = true;
      count += Number(nudgeNumeric(parameters, "rev-mix", amount, 0.28, { min: 0, max: 0.45, step: 0.01 }));
      count += Number(nudgeNumeric(parameters, "rev-decay", amount, 0.26, { min: 0.6, max: 4.8, step: 0.05 }));
    }
    if (canPerformance && (normalizedProfile === "bass" || normalizedProfile === "lead" || normalizedProfile === "industrial")) {
      if (document.getElementById("performance-mode") && rand() < amount * 0.20) parameters["performance-mode"] = "mono";
      count += 1;
    }
    return count;
  }

  function randomOscillators(parameters, amount) {
    let count = 0;
    [1, 2, 3].forEach((index) => {
      count += Number(maybeToggle(parameters, `osc${index}-enabled`, amount, index === 1 ? 0.08 : 0.22));
      count += Number(maybeSelect(parameters, `osc${index}-wave`, amount, 0.35));
      count += Number(nudgeNumeric(parameters, `osc${index}-level`, amount, 0.38, { min: 0, max: 0.95 }));
      count += Number(nudgeNumeric(parameters, `osc${index}-semi`, amount, 0.30, { min: -24, max: 24, step: 1 }));
      count += Number(nudgeNumeric(parameters, `osc${index}-fine`, amount, 0.45, { min: -50, max: 50, step: 1 }));
      count += Number(nudgeNumeric(parameters, `osc${index}-pan`, amount, 0.45, { min: -1, max: 1 }));
      count += randomPulsePwmForPulseWave(parameters, index, amount);
    });
    count += randomRingMod(parameters, amount);
    count += randomFmLight(parameters, amount);
    count += Number(maybeToggle(parameters, "noise-enabled", amount, 0.18));
    count += Number(maybeSelect(parameters, "noise-type", amount, 0.35));
    count += Number(nudgeNumeric(parameters, "noise-db", amount, 0.34, { min: -24, max: 0, step: 1 }));
    [1, 2, 3].forEach((index) => {
      count += Number(maybeToggle(parameters, `lfo${index}-enabled`, amount, 0.16));
      count += Number(maybeSelect(parameters, `lfo${index}-wave`, amount, 0.30));
      count += Number(maybeSelect(parameters, `lfo${index}-rate-mode`, amount, 0.18));
      count += Number(nudgeNumeric(parameters, `lfo${index}-rate`, amount, 0.30, { min: 0.01, max: 14 }));
      count += Number(maybeSelect(parameters, `lfo${index}-sync`, amount, 0.18));
      count += Number(nudgeNumeric(parameters, `lfo${index}-depth`, amount, 0.45, { min: 0, max: 0.75 }));
      count += Number(maybeSelect(parameters, `lfo${index}-dest`, amount, 0.22));
      count += Number(maybeSelect(parameters, `lfo${index}-mode`, amount, 0.12, ["global", "per_osc"]));
    });
    count += randomLfoTargetMatrix(parameters, amount);
    count += randomOscSync(parameters, amount);
    count += randomUnison(parameters, amount);
    if (ensureAudibleSource(parameters)) count += 1;
    return count;
  }

  function randomFilters(parameters, amount) {
    let count = 0;
    ["hpf", "bpf", "notch", "vcf"].forEach((prefix) => {
      count += Number(maybeToggle(parameters, `${prefix}-enabled`, amount, prefix === "vcf" ? 0.14 : 0.22));
      count += Number(nudgeNumeric(parameters, `${prefix}-cutoff`, amount, 0.42, { min: 0.02, max: 0.98 }));
      count += Number(nudgeNumeric(parameters, `${prefix}-q`, amount, 0.28, { min: 0.1, max: prefix === "vcf" ? 6.5 : 8 }));
    });
    count += Number(maybeSelect(parameters, "hpf-slope", amount, 0.18));
    count += Number(maybeSelect(parameters, "vcf-slope", amount, 0.18));
    count += Number(nudgeNumeric(parameters, "vcf-keytrack", amount, 0.45, { min: 0, max: 0.8 }));
    count += Number(nudgeNumeric(parameters, "vcf-velocity", amount, 0.45, { min: 0, max: 0.8 }));
    count += Number(nudgeNumeric(parameters, "filter-env-amount", amount, 0.55, { min: 0, max: 0.9 }));
    count += Number(maybeSelect(parameters, "filter-env-target", amount, 0.30));
    count += Number(maybeSelect(parameters, "filter-env-polarity", amount, 0.16));
    count += Number(nudgeNumeric(parameters, "filter-drive-amount", amount, 0.45, { min: 0, max: 0.75 }));
    count += Number(nudgeNumeric(parameters, "filter-drive-trim", amount, 0.32, { min: -9, max: 0, step: 0.5 }));
    count += Number(maybeToggle(parameters, "filter-drive-enabled", amount, 0.22));
    count += Number(maybeSelect(parameters, "filter-drive-mode", amount, 0.25));
    return count;
  }

  function randomAdvancedFilter(parameters, amount) {
    let count = 0;
    count += Number(maybeToggle(parameters, "adv-filter-enabled", amount, 0.25));
    count += Number(maybeSelect(parameters, "adv-filter-mode", amount, 0.42));
    count += Number(nudgeNumeric(parameters, "adv-filter-freq", amount, 0.42, { min: 0.02, max: 0.98 }));
    count += Number(nudgeNumeric(parameters, "adv-filter-depth", amount, 0.48, { min: 0, max: 0.85 }));
    count += Number(nudgeNumeric(parameters, "adv-filter-mix", amount, 0.40, { min: 0, max: 0.75 }));
    count += Number(maybeSelect(parameters, "adv-filter-vowel", amount, 0.35));
    count += Number(nudgeNumeric(parameters, "adv-filter-env-freq", amount, 0.40, { min: 0, max: 0.75 }));
    count += Number(nudgeNumeric(parameters, "adv-filter-vel-depth", amount, 0.40, { min: 0, max: 0.75 }));
    count += Number(nudgeNumeric(parameters, "adv-filter-vel-mix", amount, 0.40, { min: 0, max: 0.75 }));
    return count;
  }

  function randomEnvelope(parameters, amount) {
    let count = 0;
    count += Number(maybeSelect(parameters, "env-curve", amount, 0.25));
    count += Number(nudgeNumeric(parameters, "env-att", amount, 0.34, { min: 0, max: 1400, step: 1 }));
    count += Number(nudgeNumeric(parameters, "env-dec", amount, 0.36, { min: 20, max: 2400, step: 1 }));
    count += Number(nudgeNumeric(parameters, "env-sus", amount, 0.38, { min: 0, max: 1 }));
    count += Number(nudgeNumeric(parameters, "env-rel", amount, 0.36, { min: 20, max: 3800, step: 1 }));
    count += Number(nudgeNumeric(parameters, "filter-env-att", amount, 0.34, { min: 0, max: 1600, step: 1 }));
    count += Number(nudgeNumeric(parameters, "filter-env-dec", amount, 0.36, { min: 20, max: 2500, step: 1 }));
    count += Number(nudgeNumeric(parameters, "filter-env-sus", amount, 0.38, { min: 0, max: 1 }));
    count += Number(nudgeNumeric(parameters, "filter-env-rel", amount, 0.36, { min: 20, max: 4200, step: 1 }));
    return count;
  }

  function randomEffects(parameters, amount) {
    let count = 0;
    ["eq-low", "eq-lowmid", "eq-mid", "eq-highmid", "eq-high"].forEach((id) => { count += Number(nudgeNumeric(parameters, id, amount, 0.30, { min: -8, max: 8, step: 0.5 })); });
    count += Number(maybeToggle(parameters, "eq-enabled", amount, 0.18));
    count += Number(maybeToggle(parameters, "sat-enabled", amount, 0.18));
    count += Number(maybeSelect(parameters, "sat-mode", amount, 0.28));
    count += Number(nudgeNumeric(parameters, "sat-amt", amount, 0.36, { min: 0, max: 0.68 }));
    count += Number(nudgeNumeric(parameters, "sat-tone", amount, 0.40, { min: 0.1, max: 1 }));
    count += Number(nudgeNumeric(parameters, "sat-mix", amount, 0.30, { min: 0, max: 0.58 }));
    count += Number(nudgeNumeric(parameters, "sat-predb", amount, 0.26, { min: 0, max: 9, step: 0.5 }));
    count += Number(nudgeNumeric(parameters, "sat-voxpre", amount, 0.28, { min: 20, max: 260, step: 1 }));
    count += Number(nudgeNumeric(parameters, "sat-dc", amount, 0.24, { min: 5, max: 36, step: 1 }));
    count += Number(nudgeNumeric(parameters, "sat-asym", amount, 0.35, { min: -0.65, max: 0.65 }));
    count += Number(nudgeNumeric(parameters, "sat-hard", amount, 0.35, { min: 0, max: 0.85 }));
    count += Number(nudgeNumeric(parameters, "sat-bias", amount, 0.30, { min: -0.55, max: 0.55 }));
    count += Number(nudgeNumeric(parameters, "sat-gate", amount, 0.28, { min: 0, max: 0.18, step: 0.005 }));
    count += Number(nudgeNumeric(parameters, "sat-oct", amount, 0.32, { min: 0, max: 0.65 }));
    count += Number(maybeToggle(parameters, "mod-enabled", amount, 0.25));
    count += Number(maybeSelect(parameters, "mod-mode", amount, 0.34));
    count += Number(nudgeNumeric(parameters, "mod-rate", amount, 0.32, { min: 0.05, max: 5 }));
    count += Number(nudgeNumeric(parameters, "mod-depth", amount, 0.45, { min: 0, max: 0.8 }));
    count += Number(nudgeNumeric(parameters, "mod-mix", amount, 0.38, { min: 0, max: 0.7 }));
    count += Number(maybeToggle(parameters, "delay-enabled", amount, 0.20));
    count += Number(maybeSelect(parameters, "delay-mode", amount, 0.24));
    count += Number(maybeSelect(parameters, "delay-time-mode", amount, 0.20));
    count += Number(maybeSelect(parameters, "delay-sync", amount, 0.28));
    count += Number(nudgeNumeric(parameters, "delay-time", amount, 0.35, { min: 0.05, max: 0.9 }));
    count += Number(nudgeNumeric(parameters, "delay-feedback", amount, 0.32, { min: 0, max: 0.50 }));
    count += Number(nudgeNumeric(parameters, "delay-damp", amount, 0.40, { min: 0.08, max: 1 }));
    count += Number(nudgeNumeric(parameters, "delay-mix", amount, 0.32, { min: 0, max: 0.50 }));
    count += Number(maybeToggle(parameters, "rev-enabled", amount, 0.20));
    count += Number(maybeSelect(parameters, "rev-mode", amount, 0.30));
    count += Number(nudgeNumeric(parameters, "rev-size", amount, 0.42, { min: 0, max: 0.9 }));
    count += Number(nudgeNumeric(parameters, "rev-decay", amount, 0.30, { min: 0.2, max: 4.2, step: 0.05 }));
    count += Number(nudgeNumeric(parameters, "rev-damp", amount, 0.40, { min: 0.08, max: 1 }));
    count += Number(nudgeNumeric(parameters, "rev-mix", amount, 0.30, { min: 0, max: 0.50 }));
    return count;
  }

  function randomModMatrix(parameters, amount) {
    const sources = ["lfo1", "lfo2", "lfo3", "filter_env", "velocity", "mod_wheel", "aftertouch", "expression", "breath", "foot"];
    const globalFxSources = ["lfo1", "lfo2", "lfo3", "mod_wheel", "aftertouch", "expression", "breath", "foot"];
    const destinations = [
      "vcf_cutoff", "hpf_cutoff", "bpf_center", "notch_center", "adv_filter_freq", "adv_filter_depth", "adv_filter_mix", "filter_drive", "pan", "volume", "pitch",
      "mod_fx_mix", "mod_fx_rate", "mod_fx_depth", "delay_mix", "delay_time", "delay_feedback", "delay_damp", "reverb_mix", "reverb_damp"
    ];
    const enabledSlots = Math.max(1, Math.min(MAX_ACTIVE_MODMATRIX_SLOTS, Math.ceil(amount * MAX_ACTIVE_MODMATRIX_SLOTS)));
    const shuffled = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => rand() - 0.5).slice(0, enabledSlots);
    let count = 0;
    for (let index = 1; index <= 8; index += 1) {
      const shouldEnable = shuffled.includes(index) && rand() < (0.50 + amount * 0.32);
      parameters[`modmat-slot${index}-enabled`] = Boolean(shouldEnable);
      if (shouldEnable || rand() < amount * 0.20) {
        const destination = destinations[Math.floor(rand() * destinations.length)];
        const sourcePool = /^(mod_fx_|delay_|reverb_)/.test(destination) ? globalFxSources : sources;
        parameters[`modmat-slot${index}-source`] = sourcePool[Math.floor(rand() * sourcePool.length)];
        parameters[`modmat-slot${index}-destination`] = destination;
        const maxAmount = Math.min(modAmountCap(destination), 0.10 + (amount * 0.34));
        setNumeric(parameters, `modmat-slot${index}-amount`, randSigned() * maxAmount, { min: -maxAmount, max: maxAmount, step: 0.01 });
      }
      count += 4;
    }
    return count;
  }

  function scopeIncludes(scope, target) {
    const normalized = String(scope || "all");
    return normalized === "all" || normalized === target;
  }


  function hasParameter(parameters, id) {
    return Object.prototype.hasOwnProperty.call(parameters || {}, id);
  }

  function clampParameter(parameters, id, min, max, step) {
    if (!hasParameter(parameters, id)) return 0;
    return clampExistingNumeric(parameters, id, min, max, step);
  }

  function capCombinedWetFx(parameters, limits) {
    const ids = ["delay-mix", "rev-mix", "mod-mix", "sat-mix"].filter((id) => hasParameter(parameters, id));
    if (!ids.length) return 0;
    let corrections = 0;
    const singleMax = Number.isFinite(limits?.singleMax) ? limits.singleMax : 0.52;
    ids.forEach((id) => { corrections += clampParameter(parameters, id, 0, singleMax, 0.01); });
    const maxTotal = Number.isFinite(limits?.totalMax) ? limits.totalMax : 1.05;
    const total = ids.reduce((sum, id) => sum + clamp(Number(parameters[id] ?? 0), 0, 1), 0);
    if (total > maxTotal && total > 0) {
      const ratio = maxTotal / total;
      ids.forEach((id) => {
        const before = Number(parameters[id] ?? 0);
        const next = clamp(roundToStep(before * ratio, 0.01, 0), 0, singleMax);
        parameters[id] = next;
        if (before !== next) corrections += 1;
      });
    }
    return corrections;
  }

  function capDriveStack(parameters, profile) {
    let corrections = 0;
    const normalizedProfile = String(profile || "safe");
    const isAggressive = normalizedProfile === "industrial" || normalizedProfile === "wild_safe";
    const satAmountMax = isAggressive ? 0.78 : 0.68;
    const satMixMax = isAggressive ? 0.66 : 0.58;
    const filterDriveMax = isAggressive ? 0.78 : 0.68;
    corrections += clampParameter(parameters, "sat-amt", 0, satAmountMax, 0.01);
    corrections += clampParameter(parameters, "sat-mix", 0, satMixMax, 0.01);
    corrections += clampParameter(parameters, "sat-predb", 0, isAggressive ? 9 : 7.5, 0.5);
    corrections += clampParameter(parameters, "filter-drive-amount", 0, filterDriveMax, 0.01);

    const satEnabled = Boolean(parameters["sat-enabled"]);
    const filterDriveEnabled = Boolean(parameters["filter-drive-enabled"]);
    const satEnergy = satEnabled ? (Number(parameters["sat-amt"] ?? 0) * Number(parameters["sat-mix"] ?? 0)) : 0;
    const filterEnergy = filterDriveEnabled ? Number(parameters["filter-drive-amount"] ?? 0) : 0;
    const maxEnergy = isAggressive ? 0.86 : 0.62;
    const total = satEnergy + filterEnergy;
    if (total > maxEnergy && total > 0) {
      const ratio = maxEnergy / total;
      if (satEnabled && hasParameter(parameters, "sat-mix")) {
        const before = Number(parameters["sat-mix"] ?? 0);
        parameters["sat-mix"] = clamp(roundToStep(before * ratio, 0.01, 0), 0, satMixMax);
        if (before !== parameters["sat-mix"]) corrections += 1;
      }
      if (filterDriveEnabled && hasParameter(parameters, "filter-drive-amount")) {
        const before = Number(parameters["filter-drive-amount"] ?? 0);
        parameters["filter-drive-amount"] = clamp(roundToStep(before * ratio, 0.01, 0), 0, filterDriveMax);
        if (before !== parameters["filter-drive-amount"]) corrections += 1;
      }
    }
    return corrections;
  }

  function preventOverFiltering(parameters, profile) {
    let corrections = 0;
    const normalizedProfile = String(profile || "safe");
    const hpfEnabled = Boolean(parameters["hpf-enabled"]);
    const vcfEnabled = Boolean(parameters["vcf-enabled"]);
    if (hpfEnabled && hasParameter(parameters, "hpf-cutoff")) {
      const hpfMax = normalizedProfile === "bass" ? 0.24 : normalizedProfile === "pad" || normalizedProfile === "ambient" ? 0.42 : 0.58;
      corrections += clampParameter(parameters, "hpf-cutoff", 0.02, hpfMax, 0.001);
    }
    if (vcfEnabled && hasParameter(parameters, "vcf-cutoff")) {
      const vcfMin = normalizedProfile === "bass" ? 0.10 : 0.08;
      corrections += clampParameter(parameters, "vcf-cutoff", vcfMin, 0.98, 0.001);
    }
    if (hpfEnabled && vcfEnabled && hasParameter(parameters, "hpf-cutoff") && hasParameter(parameters, "vcf-cutoff")) {
      const hpf = Number(parameters["hpf-cutoff"] ?? 0);
      const vcf = Number(parameters["vcf-cutoff"] ?? 1);
      if (hpf > Math.max(0.02, vcf - 0.08)) {
        const before = hpf;
        parameters["hpf-cutoff"] = clamp(roundToStep(Math.max(0.02, vcf - 0.08), 0.001, 0.02), 0.02, 0.98);
        if (before !== parameters["hpf-cutoff"]) corrections += 1;
      }
    }
    if (normalizedProfile === "bass") {
      if (hasParameter(parameters, "notch-q")) corrections += clampParameter(parameters, "notch-q", 0.1, 4.5, 0.1);
      if (hasParameter(parameters, "bpf-q")) corrections += clampParameter(parameters, "bpf-q", 0.1, 5.5, 0.1);
    }
    return corrections;
  }

  function hardenEnvelopeByProfile(parameters, profile) {
    const normalizedProfile = String(profile || "safe");
    let corrections = 0;
    if (normalizedProfile === "percussive") {
      corrections += clampParameter(parameters, "env-att", 0, 45, 1);
      corrections += clampParameter(parameters, "env-dec", 35, 900, 1);
      corrections += clampParameter(parameters, "env-sus", 0, 0.55, 0.01);
      corrections += clampParameter(parameters, "env-rel", 20, 1100, 1);
      corrections += clampParameter(parameters, "filter-env-rel", 20, 1400, 1);
    } else if (normalizedProfile === "bass") {
      corrections += clampParameter(parameters, "env-att", 0, 120, 1);
      corrections += clampParameter(parameters, "env-rel", 20, 1900, 1);
      corrections += clampParameter(parameters, "filter-env-rel", 20, 2400, 1);
    } else if (normalizedProfile === "lead") {
      corrections += clampParameter(parameters, "env-att", 0, 420, 1);
      corrections += clampParameter(parameters, "env-rel", 20, 2800, 1);
    } else if (normalizedProfile === "pad" || normalizedProfile === "ambient") {
      if (hasParameter(parameters, "env-att") && Number(parameters["env-att"] ?? 0) < 25) {
        parameters["env-att"] = 25;
        corrections += 1;
      }
      corrections += clampParameter(parameters, "env-rel", 120, 4200, 1);
    } else {
      corrections += clampParameter(parameters, "env-rel", 20, 3600, 1);
    }
    return corrections;
  }

  function hardenOscillatorInteractions(parameters, profile) {
    let corrections = 0;
    const normalizedProfile = String(profile || "safe");
    const isAggressive = normalizedProfile === "digital" || normalizedProfile === "industrial" || normalizedProfile === "wild_safe";
    corrections += capOscillatorGainSum(parameters);
    corrections += clampParameter(parameters, "fm-amount", 0, isAggressive ? FM_AMOUNT_MAX : 0.46, 0.005);
    corrections += clampParameter(parameters, "ringmod-amount", 0, isAggressive ? 0.62 : 0.42, 0.01);
    corrections += clampParameter(parameters, "oscsync-amount", 0, isAggressive ? 0.58 : 0.45, 0.01);
    corrections += clampParameter(parameters, "unison-detune", 0, normalizedProfile === "pad" || normalizedProfile === "ambient" ? 18 : 14, 0.5);
    corrections += clampParameter(parameters, "unison-spread", 0, 0.75, 0.01);
    const effectiveUnisonLayers = Math.min(Number(parameters["unison-voices"] ?? 1), Number(parameters["unison-max-layers"] ?? 3));
    if (Boolean(parameters["unison-enabled"]) && !isAggressive && effectiveUnisonLayers > 8) {
      const beforeVoices = parameters["unison-voices"];
      const beforeLayers = parameters["unison-max-layers"];
      parameters["unison-voices"] = Math.min(Number(parameters["unison-voices"] ?? 8), 8);
      parameters["unison-max-layers"] = Math.min(Number(parameters["unison-max-layers"] ?? 8), 8);
      if (beforeVoices !== parameters["unison-voices"] || beforeLayers !== parameters["unison-max-layers"]) corrections += 1;
    }
    if (ensureAudibleSource(parameters)) corrections += 1;
    return corrections;
  }

  function hardenPerformanceSound(parameters, profile) {
    const normalizedProfile = String(profile || "safe");
    let corrections = 0;
    const glideMax = normalizedProfile === "pad" || normalizedProfile === "ambient" ? 180 : normalizedProfile === "percussive" ? 45 : 130;
    corrections += clampParameter(parameters, "performance-glide-ms", 0, glideMax, 5);
    corrections += clampParameter(parameters, "performance-key-velocity", 0.35, 1, 0.01);
    if (normalizedProfile === "percussive" && hasParameter(parameters, "performance-glide-enabled") && Boolean(parameters["performance-glide-enabled"]) && Number(parameters["performance-glide-ms"] ?? 0) > 40) {
      parameters["performance-glide-enabled"] = false;
      corrections += 1;
    }
    return corrections;
  }

  function applyProfileMusicalGuardrails(parameters, scope, profile) {
    const normalizedScope = String(scope || "all");
    const normalizedProfile = Object.prototype.hasOwnProperty.call(SOUND_RANDOMIZER_PROFILES, String(profile || "safe")) ? String(profile || "safe") : "safe";
    let corrections = 0;
    if (scopeIncludes(normalizedScope, "osc")) corrections += hardenOscillatorInteractions(parameters, normalizedProfile);
    if (scopeIncludes(normalizedScope, "filters")) corrections += preventOverFiltering(parameters, normalizedProfile);
    if (scopeIncludes(normalizedScope, "fx")) {
      const wetLimits = {
        percussive: { totalMax: 0.52, singleMax: 0.26 },
        bass: { totalMax: 0.58, singleMax: 0.30 },
        lead: { totalMax: 0.74, singleMax: 0.40 },
        pad: { totalMax: 0.96, singleMax: 0.52 },
        ambient: { totalMax: 1.05, singleMax: 0.55 },
        industrial: { totalMax: 0.88, singleMax: 0.54 },
        wild_safe: { totalMax: 0.92, singleMax: 0.54 }
      }[normalizedProfile] || { totalMax: 0.78, singleMax: 0.46 };
      corrections += capCombinedWetFx(parameters, wetLimits);
      corrections += capDriveStack(parameters, normalizedProfile);
      if (normalizedProfile === "percussive") corrections += clampParameter(parameters, "rev-decay", 0.2, 1.8, 0.05);
      if (normalizedProfile === "bass") corrections += clampParameter(parameters, "delay-feedback", 0, 0.38, 0.01);
    }
    if (scopeIncludes(normalizedScope, "envelope")) corrections += hardenEnvelopeByProfile(parameters, normalizedProfile);
    if (scopeIncludes(normalizedScope, "performance")) corrections += hardenPerformanceSound(parameters, normalizedProfile);
    return corrections;
  }

  function applySourceGuardrails(parameters) {
    let corrections = 0;
    corrections += capOscillatorGainSum(parameters);
    corrections += clampExistingNumeric(parameters, "noise-db", -24, 0, 1);
    for (let index = 1; index <= 3; index += 1) {
      corrections += clampExistingNumeric(parameters, `osc${index}-pulse-width`, 0.05, 0.95, 0.01);
      corrections += clampExistingNumeric(parameters, `osc${index}-pwm-amount`, 0, 0.30, 0.01);
      const sourceId = `osc${index}-pwm-source`;
      if (Object.prototype.hasOwnProperty.call(parameters, sourceId) && !["off", "lfo1", "lfo2", "lfo3"].includes(String(parameters[sourceId]))) {
        parameters[sourceId] = "off";
        corrections += 1;
      }
    }

    corrections += clampExistingNumeric(parameters, "ringmod-amount", 0, 0.70, 0.01);
    if (Object.prototype.hasOwnProperty.call(parameters, "ringmod-source-a") && !["osc1", "osc2", "osc3"].includes(String(parameters["ringmod-source-a"]))) {
      parameters["ringmod-source-a"] = "osc1";
      corrections += 1;
    }
    if (Object.prototype.hasOwnProperty.call(parameters, "ringmod-source-b") && !["osc1", "osc2", "osc3"].includes(String(parameters["ringmod-source-b"]))) {
      parameters["ringmod-source-b"] = "osc2";
      corrections += 1;
    }
    if (Boolean(parameters["ringmod-enabled"]) && Number(parameters["ringmod-amount"] ?? 0) <= 0.001) {
      parameters["ringmod-enabled"] = false;
      corrections += 1;
    }

    corrections += clampExistingNumeric(parameters, "fm-amount", 0, FM_AMOUNT_MAX, 0.005);
    if (Object.prototype.hasOwnProperty.call(parameters, "fm-carrier") && !["osc1", "osc2", "osc3"].includes(String(parameters["fm-carrier"]))) {
      parameters["fm-carrier"] = "osc1";
      corrections += 1;
    }
    if (Object.prototype.hasOwnProperty.call(parameters, "fm-modulator") && !["osc1", "osc2", "osc3"].includes(String(parameters["fm-modulator"]))) {
      parameters["fm-modulator"] = "osc2";
      corrections += 1;
    }
    if (Boolean(parameters["fm-enabled"]) && Number(parameters["fm-amount"] ?? 0) <= 0.001) {
      parameters["fm-enabled"] = false;
      corrections += 1;
    }

    corrections += clampExistingNumeric(parameters, "oscsync-amount", 0, 0.60, 0.01);
    if (Object.prototype.hasOwnProperty.call(parameters, "oscsync-master") && !["osc1", "osc2", "osc3"].includes(String(parameters["oscsync-master"]))) {
      parameters["oscsync-master"] = "osc1";
      corrections += 1;
    }
    if (Object.prototype.hasOwnProperty.call(parameters, "oscsync-slave") && !["osc1", "osc2", "osc3"].includes(String(parameters["oscsync-slave"]))) {
      parameters["oscsync-slave"] = "osc2";
      corrections += 1;
    }
    if (Boolean(parameters["oscsync-enabled"]) && String(parameters["oscsync-master"] || "osc1") === String(parameters["oscsync-slave"] || "osc2")) {
      parameters["oscsync-enabled"] = false;
      corrections += 1;
    }
    if (Boolean(parameters["oscsync-enabled"]) && Number(parameters["oscsync-amount"] ?? 0) <= 0.001) {
      parameters["oscsync-enabled"] = false;
      corrections += 1;
    }

    corrections += clampExistingNumeric(parameters, "unison-voices", 1, 12, 1);
    corrections += clampExistingNumeric(parameters, "unison-max-layers", 1, 12, 1);
    corrections += clampExistingNumeric(parameters, "unison-detune", 0, 18, 0.5);
    corrections += clampExistingNumeric(parameters, "unison-spread", 0, 0.75, 0.01);
    if (Object.prototype.hasOwnProperty.call(parameters, "unison-voices")) parameters["unison-voices"] = Math.round(Number(parameters["unison-voices"]) || 2);
    if (Object.prototype.hasOwnProperty.call(parameters, "unison-max-layers")) parameters["unison-max-layers"] = Math.round(Number(parameters["unison-max-layers"]) || 3);
    const effectiveUnisonLayers = Math.min(Number(parameters["unison-voices"] ?? 1), Number(parameters["unison-max-layers"] ?? 3));
    if (Boolean(parameters["unison-enabled"]) && effectiveUnisonLayers <= 1) {
      parameters["unison-enabled"] = false;
      corrections += 1;
    }
    if (Boolean(parameters["unison-enabled"]) && effectiveUnisonLayers > 12) {
      parameters["unison-max-layers"] = 12;
      parameters["unison-voices"] = Math.min(Number(parameters["unison-voices"] ?? 12), 12);
      corrections += 1;
    }
    return corrections;
  }

  function applyFilterGuardrails(parameters) {
    let corrections = 0;
    corrections += clampExistingNumeric(parameters, "hpf-q", 0.1, 8, 0.1);
    corrections += clampExistingNumeric(parameters, "bpf-q", 0.1, 8, 0.1);
    corrections += clampExistingNumeric(parameters, "notch-q", 0.1, 8, 0.1);
    corrections += clampExistingNumeric(parameters, "vcf-q", 0.1, 6.5, 0.1);
    corrections += clampExistingNumeric(parameters, "filter-drive-amount", 0, 0.72, 0.01);
    corrections += clampExistingNumeric(parameters, "filter-drive-trim", -9, 0, 0.5);
    return corrections;
  }

  function applyAdvancedFilterGuardrails(parameters) {
    let corrections = 0;
    corrections += clampExistingNumeric(parameters, "adv-filter-depth", 0, 0.85, 0.01);
    corrections += clampExistingNumeric(parameters, "adv-filter-mix", 0, 0.75, 0.01);
    corrections += clampExistingNumeric(parameters, "adv-filter-env-freq", 0, 0.75, 0.01);
    corrections += clampExistingNumeric(parameters, "adv-filter-vel-depth", 0, 0.75, 0.01);
    corrections += clampExistingNumeric(parameters, "adv-filter-vel-mix", 0, 0.75, 0.01);
    return corrections;
  }

  function applyFxGuardrails(parameters) {
    let corrections = 0;
    corrections += clampExistingNumeric(parameters, "eq-low", -8, 8, 0.5);
    corrections += clampExistingNumeric(parameters, "eq-lowmid", -8, 8, 0.5);
    corrections += clampExistingNumeric(parameters, "eq-mid", -8, 8, 0.5);
    corrections += clampExistingNumeric(parameters, "eq-highmid", -8, 8, 0.5);
    corrections += clampExistingNumeric(parameters, "eq-high", -8, 8, 0.5);
    corrections += clampExistingNumeric(parameters, "sat-amt", 0, 0.68, 0.01);
    corrections += clampExistingNumeric(parameters, "sat-mix", 0, 0.58, 0.01);
    corrections += clampExistingNumeric(parameters, "sat-predb", 0, 9, 0.5);
    corrections += clampExistingNumeric(parameters, "sat-voxpre", 20, 260, 1);
    corrections += clampExistingNumeric(parameters, "sat-dc", 5, 36, 1);
    corrections += clampExistingNumeric(parameters, "delay-feedback", 0, 0.50, 0.01);
    corrections += clampExistingNumeric(parameters, "delay-mix", 0, 0.50, 0.01);
    corrections += clampExistingNumeric(parameters, "rev-decay", 0.2, 4.2, 0.05);
    corrections += clampExistingNumeric(parameters, "rev-mix", 0, 0.50, 0.01);
    corrections += clampExistingNumeric(parameters, "mod-mix", 0, 0.70, 0.01);
    return corrections;
  }

  function applyEnvelopeGuardrails(parameters) {
    let corrections = 0;
    corrections += clampExistingNumeric(parameters, "env-att", 0, 1400, 1);
    corrections += clampExistingNumeric(parameters, "env-dec", 20, 2400, 1);
    corrections += clampExistingNumeric(parameters, "env-sus", 0, 1, 0.01);
    corrections += clampExistingNumeric(parameters, "env-rel", 20, 3800, 1);
    corrections += clampExistingNumeric(parameters, "filter-env-att", 0, 1600, 1);
    corrections += clampExistingNumeric(parameters, "filter-env-dec", 20, 2500, 1);
    corrections += clampExistingNumeric(parameters, "filter-env-sus", 0, 1, 0.01);
    corrections += clampExistingNumeric(parameters, "filter-env-rel", 20, 4200, 1);
    return corrections;
  }

  function applyPerformanceGuardrails(parameters) {
    let corrections = 0;
    corrections += clampExistingNumeric(parameters, "performance-glide-ms", 0, 180, 5);
    corrections += clampExistingNumeric(parameters, "performance-key-velocity", 0.35, 1, 0.01);
    if (Object.prototype.hasOwnProperty.call(parameters, "performance-mode") && !["poly", "mono"].includes(String(parameters["performance-mode"]))) {
      parameters["performance-mode"] = "poly";
      corrections += 1;
    }
    if (Object.prototype.hasOwnProperty.call(parameters, "performance-velocity-curve") && !getOptions("performance-velocity-curve").includes(String(parameters["performance-velocity-curve"]))) {
      parameters["performance-velocity-curve"] = "linear";
      corrections += 1;
    }
    return corrections;
  }

  function applyModMatrixGuardrails(parameters) {
    let corrections = 0;
    let activeSeen = 0;
    for (let index = 1; index <= 8; index += 1) {
      const enabledId = `modmat-slot${index}-enabled`;
      const destId = `modmat-slot${index}-destination`;
      const amountId = `modmat-slot${index}-amount`;
      if (Boolean(parameters[enabledId])) {
        activeSeen += 1;
        if (activeSeen > MAX_ACTIVE_MODMATRIX_SLOTS) {
          parameters[enabledId] = false;
          corrections += 1;
        }
      }
      const cap = modAmountCap(parameters[destId]);
      corrections += clampExistingNumeric(parameters, amountId, -cap, cap, 0.01);
    }
    return corrections;
  }

  function applyRandomizerGuardrails(preset, scope, profile) {
    const parameters = preset?.parameters || {};
    const normalizedScope = String(scope || "all");
    const normalizedProfile = Object.prototype.hasOwnProperty.call(SOUND_RANDOMIZER_PROFILES, String(profile || "safe")) ? String(profile || "safe") : "safe";
    let corrections = 0;
    const applied = [];

    if (scopeIncludes(normalizedScope, "osc")) {
      corrections += applySourceGuardrails(parameters);
      applied.push("osc");
    }
    if (scopeIncludes(normalizedScope, "filters")) {
      corrections += applyFilterGuardrails(parameters);
      applied.push("filters");
    }
    if (scopeIncludes(normalizedScope, "advanced")) {
      corrections += applyAdvancedFilterGuardrails(parameters);
      applied.push("advanced");
    }
    if (scopeIncludes(normalizedScope, "fx")) {
      corrections += applyFxGuardrails(parameters);
      applied.push("fx");
    }
    if (scopeIncludes(normalizedScope, "envelope")) {
      corrections += applyEnvelopeGuardrails(parameters);
      applied.push("envelope");
    }
    if (scopeIncludes(normalizedScope, "modmatrix")) {
      corrections += applyModMatrixGuardrails(parameters);
      applied.push("modmatrix");
    }
    if (scopeIncludes(normalizedScope, "performance")) {
      corrections += applyPerformanceGuardrails(parameters);
      applied.push("performance");
    }

    const musicalCorrections = applyProfileMusicalGuardrails(parameters, normalizedScope, normalizedProfile);
    corrections += musicalCorrections;

    preset.parameters = parameters;
    preset.randomizerGuardrails = {
      version: VERSION,
      scope: normalizedScope,
      profile: normalizedProfile,
      appliedScopes: applied,
      corrections,
      musicalCorrections,
      maxOscillatorLevelSum: MAX_OSC_LEVEL_SUM,
      maxActiveModMatrixSlots: MAX_ACTIVE_MODMATRIX_SLOTS,
      notes: "Post-randomization QA guardrails are scope-aware and profile-aware. v0.26.7n adds musical hardening after randomization: combined wet-FX caps, drive-stack limits, anti-over-filtering, profile envelope clamps, oscillator interaction caps and performance-sound sanity checks. Master Tuning, MIDI runtime, preset browser, sequencer/arp transports, User Bank and factory presets remain protected."
    };
    return corrections;
  }


  function buildRandomizedPreset(scope, amount, profile) {
    const base = window.SynthXPresets?.buildPresetObject?.();
    if (!base?.parameters) throw new Error("Preset corrente non disponibile per randomizer.");
    const preset = cloneJson(base);
    const parameters = preset.parameters || {};
    let changed = 0;
    const normalizedScope = String(scope || "all");
    const normalizedProfile = Object.prototype.hasOwnProperty.call(SOUND_RANDOMIZER_PROFILES, String(profile || "safe")) ? String(profile || "safe") : "safe";
    if (normalizedScope === "osc" || normalizedScope === "all") changed += randomOscillators(parameters, areaAmount(normalizedProfile, "osc", amount));
    if (normalizedScope === "filters" || normalizedScope === "all") changed += randomFilters(parameters, areaAmount(normalizedProfile, "filters", amount));
    if (normalizedScope === "advanced" || normalizedScope === "all") changed += randomAdvancedFilter(parameters, areaAmount(normalizedProfile, "advanced", amount));
    if (normalizedScope === "fx" || normalizedScope === "all") changed += randomEffects(parameters, areaAmount(normalizedProfile, "fx", amount));
    if (normalizedScope === "envelope" || normalizedScope === "all") changed += randomEnvelope(parameters, areaAmount(normalizedProfile, "envelope", amount));
    if (normalizedScope === "modmatrix" || normalizedScope === "all") changed += randomModMatrix(parameters, areaAmount(normalizedProfile, "modmatrix", amount));
    if (normalizedScope === "performance" || normalizedScope === "all") changed += randomPerformanceSound(parameters, areaAmount(normalizedProfile, "performance", amount), normalizedProfile);
    changed += applySoundProfileBias(parameters, normalizedScope, amount, normalizedProfile);
    preset.parameters = parameters;
    const guardrailCorrections = applyRandomizerGuardrails(preset, normalizedScope, normalizedProfile);
    Object.assign(preset, window.SorgivaSynth?.buildExportMetadata?.("preset", { format: "sorgiva-synth-preset", schema: "sorgiva-synth-preset-v1", formatVersion: preset.presetFormatVersion || "0.4" }) || {});
    preset.type = "sorgiva_synth_randomizer_variant";
    preset.legacyType = "controlled_randomizer_variant";
    preset.generator = "Sorgiva Synth Randomizer";
    preset.sorgivaVersion = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || VERSION;
    preset.sorgivaSynthVersion = window.SynthXState?.data?.appVersion || VERSION;
    preset.synthxVersion = window.SynthXState?.data?.appVersion || VERSION;
    preset.randomizer = {
      version: VERSION,
      scope: normalizedScope,
      profile: normalizedProfile,
      profileLabel: SOUND_RANDOMIZER_PROFILES[normalizedProfile]?.label || normalizedProfile,
      amount,
      changedCandidateCount: changed,
      guardrailCorrections,
      createdAt: nowIso(),
      guardrails: "No master tuning, no MIDI runtime, no preset browser/user bank, no sequencer/arp transport, no safety bypass randomization. Factory presets are not modified. v0.26.7n keeps the v0.26.7m coverage and adds musical hardening: wet FX total caps, drive-stack caps, anti-over-filtering, profile envelope clamps, oscillator interaction caps and performance-sound sanity checks. Pulse/PWM, Ring Mod, FM Light, Osc Sync and Unison/Detune remain covered in Osc/All scopes; Master Tuning, MIDI runtime, sequencer/arp transports, preset browser and factory/user banks remain excluded."
    };
    preset.updatedAt = nowIso();
    return preset;
  }

  function randomizeCurrent() {
    try {
      const scope = document.getElementById("randomizer-scope")?.value || "all";
      const amount = getAmount();
      const profile = getProfile();
      LAST_UNDO.preset = cloneJson(window.SynthXPresets?.buildPresetObject?.());
      const next = buildRandomizedPreset(scope, amount, profile);
      window.SynthXPresets?.applyPresetObject?.(next);
      window.SynthXPresets?.updatePreview?.(window.SynthXPresets?.buildPresetObject?.());
      const undo = document.getElementById("randomizer-undo");
      if (undo) undo.disabled = false;
      const safetyCorrections = next.randomizer?.guardrailCorrections ?? 0;
      const musicalCorrections = next.randomizerGuardrails?.musicalCorrections ?? 0;
      status(`Randomizer sonoro applicato: profilo ${SOUND_RANDOMIZER_PROFILES[profile]?.label || profile}, scope ${scope}, amount ${Math.round(amount * 100)}%, correzioni safety ${safetyCorrections}, musical QA ${musicalCorrections}. Undo disponibile.`, "ok");
    } catch (err) {
      status(`Randomizer non applicato: ${err.message}`, "error");
      window.SynthXLogger?.error("controlled randomizer error", err);
    }
  }

  function undoRandomize() {
    if (!LAST_UNDO.preset) {
      status("Undo non disponibile: nessuna randomizzazione in memoria.", "warn");
      return;
    }
    try {
      const preset = cloneJson(LAST_UNDO.preset);
      window.SynthXPresets?.applyPresetObject?.(preset);
      window.SynthXPresets?.updatePreview?.(window.SynthXPresets?.buildPresetObject?.());
      LAST_UNDO.preset = null;
      const undo = document.getElementById("randomizer-undo");
      if (undo) undo.disabled = true;
      status("Undo Randomize applicato: stato precedente ripristinato.", "ok");
    } catch (err) {
      status(`Undo Randomize fallito: ${err.message}`, "error");
      window.SynthXLogger?.error("controlled randomizer undo error", err);
    }
  }

  function getSummary() {
    return {
      version: VERSION,
      undoAvailable: Boolean(LAST_UNDO.preset),
      amount: getAmount(),
      profile: getProfile(),
      profileLabel: SOUND_RANDOMIZER_PROFILES[getProfile()]?.label || getProfile(),
      scope: document.getElementById("randomizer-scope")?.value || "all"
    };
  }

  function init() {
    updateAmountLabel();
    document.getElementById("randomizer-amount")?.addEventListener("input", updateAmountLabel);
    document.getElementById("randomizer-apply")?.addEventListener("click", randomizeCurrent);
    document.getElementById("randomizer-undo")?.addEventListener("click", undoRandomize);
    const undo = document.getElementById("randomizer-undo");
    if (undo) undo.disabled = true;
    status("Randomizer sonoro pronto. Profili musicali + QA: wet FX, drive, filtri, inviluppi, FM/Ring/Sync, Unison e performance sound restano entro limiti musicali.", "info");
    window.SynthXLogger?.log("Sound Randomizer QA / Musical Hardening pronto", getSummary());
  }

  window.SynthXRandomizer = {
    init,
    randomizeCurrent,
    undoRandomize,
    getSummary,
    buildRandomizedPreset,
    applyRandomizerGuardrails
  };
})();
