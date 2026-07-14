(function () {
  "use strict";

  const VERSION = "0.26.7r2-public-alpha-readiness-regression-baseline";
  const MORPH_STATE = {
    undoPreset: null,
    lastMorphedPreset: null,
    lastRatio: 0,
    lastAppliedRatio: null,
    livePreview: true,
    livePreviewFrame: null,
    pendingLiveRatio: null,
    appliedOnce: false
  };

  const SAFE_NUMERIC_IDS = [
    /^osc[1-3]-(level|semi|fine|pan|pulse-width|pwm-amount)$/,
    /^ringmod-amount$/,
    /^fm-amount$/,
    /^oscsync-amount$/,
    /^noise-db$/,
    /^lfo[1-3]-(rate|depth)$/,
    /^env-(att|dec|sus|rel)$/,
    /^filter-env-(amount|att|dec|sus|rel)$/,
    /^(hpf|bpf|notch)-(cutoff|q)$/,
    /^vcf-(cutoff|q|keytrack|velocity)$/,
    /^filter-drive-(amount|trim)$/,
    /^adv-filter-(freq|depth|mix|env-freq|vel-depth|vel-mix)$/,
    /^eq-(low|lowmid|mid|highmid|high)$/,
    /^sat-(amt|tone|mix|predb|asym|hard|bias|gate|oct)$/,
    /^mod-(rate|depth|mix)$/,
    /^delay-(time|feedback|damp|mix)$/,
    /^rev-(size|decay|damp|mix)$/,
    /^modmat-slot[1-8]-amount$/
  ];

  const PROTECTED_IDS = new Set([
    "master",
    "master-tuning-a4",
    "midi-channel-filter",
    "midi-pitch-bend-range",
    "midi-input-select",
    "midi-learn-target",
    "midi-learn-cc",
    "midi-learn-channel",
    "seq-pattern-preset",
    "seq-edit-step",
    "scope-fps",
    "spectrum-fps"
  ]);

  function nowIso() { return new Date().toISOString(); }
  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function roundToStep(value, step, min) {
    if (!Number.isFinite(step) || step <= 0) return value;
    const base = Number.isFinite(Number(min)) ? Number(min) : 0;
    const rounded = base + Math.round((value - base) / step) * step;
    if (step >= 1) return Math.round(rounded);
    const decimals = Math.min(6, Math.max(0, String(step).split(".")[1]?.length || 0));
    return Number(rounded.toFixed(decimals));
  }

  function safeRange(id) {
    const el = document.getElementById(id);
    const min = Number(el?.min ?? -1);
    const max = Number(el?.max ?? 1);
    const step = Number(el?.step ?? 0.01);
    return {
      min: Number.isFinite(min) ? min : -1,
      max: Number.isFinite(max) ? max : 1,
      step: Number.isFinite(step) && step > 0 ? step : 0.01
    };
  }

  function isSafeNumericId(id) {
    const key = String(id || "");
    if (!key || PROTECTED_IDS.has(key)) return false;
    return SAFE_NUMERIC_IDS.some((pattern) => pattern.test(key));
  }

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function interpolateValue(id, a, b, ratio) {
    const range = safeRange(id);
    const av = Number(a);
    const bv = Number(b);
    const raw = av + ((bv - av) * ratio);
    return clamp(roundToStep(raw, range.step, range.min), range.min, range.max);
  }

  function status(message, kind) {
    const el = document.getElementById("morph-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
  }

  function getRatio() {
    const el = document.getElementById("morph-ratio");
    const raw = Number(el?.value ?? 0);
    return clamp(Number.isFinite(raw) ? raw : 0, 0, 1);
  }

  function updateRatioLabel() {
    const ratio = getRatio();
    const label = document.getElementById("morph-ratio-val");
    if (label) label.textContent = `${Math.round(ratio * 100)}%`;
    MORPH_STATE.lastRatio = ratio;
    if (MORPH_STATE.livePreview) scheduleLivePreview(ratio);
  }

  function requestFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
    return window.setTimeout(callback, 16);
  }

  function cancelFrame(handle) {
    if (handle == null) return;
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(handle);
    else window.clearTimeout(handle);
  }

  function cancelPendingLivePreview() {
    if (MORPH_STATE.livePreviewFrame != null) cancelFrame(MORPH_STATE.livePreviewFrame);
    MORPH_STATE.livePreviewFrame = null;
    MORPH_STATE.pendingLiveRatio = null;
  }

  function hasReadyMorphSlots() {
    return Boolean(getSlot("a") && getSlot("b"));
  }

  function scheduleLivePreview(ratio) {
    if (!hasReadyMorphSlots()) {
      cancelPendingLivePreview();
      return false;
    }
    MORPH_STATE.pendingLiveRatio = clamp(Number(ratio), 0, 1);
    if (MORPH_STATE.livePreviewFrame != null) return true;
    MORPH_STATE.livePreviewFrame = requestFrame(() => {
      const nextRatio = MORPH_STATE.pendingLiveRatio;
      MORPH_STATE.livePreviewFrame = null;
      MORPH_STATE.pendingLiveRatio = null;
      previewMorph(nextRatio, { source: "live" });
    });
    return true;
  }

  function getSlot(key) {
    return window.SynthXPresets?.getAbSlot?.(key) || null;
  }

  function countMorphableParameters(aPreset, bPreset) {
    const aParams = aPreset?.parameters || {};
    const bParams = bPreset?.parameters || {};
    return Object.keys(aParams).filter((id) => (
      isSafeNumericId(id)
      && Object.prototype.hasOwnProperty.call(bParams, id)
      && isFiniteNumber(aParams[id])
      && isFiniteNumber(bParams[id])
    )).length;
  }

  function refreshSummary() {
    const a = getSlot("a");
    const b = getSlot("b");
    const aEl = document.getElementById("morph-a-name");
    const bEl = document.getElementById("morph-b-name");
    const nEl = document.getElementById("morph-param-count");
    if (aEl) aEl.textContent = `A: ${a?.name || "vuoto"}`;
    if (bEl) bEl.textContent = `B: ${b?.name || "vuoto"}`;
    if (nEl) nEl.textContent = `Parametri continui: ${a && b ? countMorphableParameters(a, b) : 0}`;
  }

  function buildMorphedPreset(ratio) {
    const a = getSlot("a");
    const b = getSlot("b");
    if (!a || !b) throw new Error("servono entrambi gli slot A e B pieni");
    const normalizedRatio = clamp(Number(ratio), 0, 1);
    const base = cloneJson(a);
    const aParams = a.parameters || {};
    const bParams = b.parameters || {};
    const outParams = base.parameters || {};
    let morphed = 0;
    let skipped = 0;

    Object.keys(aParams).forEach((id) => {
      if (!isSafeNumericId(id)) { skipped += 1; return; }
      if (!Object.prototype.hasOwnProperty.call(bParams, id)) { skipped += 1; return; }
      if (!isFiniteNumber(aParams[id]) || !isFiniteNumber(bParams[id])) { skipped += 1; return; }
      outParams[id] = interpolateValue(id, aParams[id], bParams[id], normalizedRatio);
      morphed += 1;
    });

    base.parameters = outParams;
    base.name = `Morph A-B ${Math.round(normalizedRatio * 100)}%`;
    Object.assign(base, window.SorgivaSynth?.buildExportMetadata?.("preset", { format: "sorgiva-synth-preset", schema: "sorgiva-synth-preset-v1", formatVersion: base.presetFormatVersion || "0.4" }) || {});
    base.type = "sorgiva_synth_preset_morph_runtime";
    base.legacyType = "preset_morph_runtime";
    base.generator = "Sorgiva Synth Preset Morph";
    base.sorgivaVersion = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || VERSION;
    base.sorgivaSynthVersion = window.SynthXState?.data?.appVersion || VERSION;
    base.synthxVersion = window.SynthXState?.data?.appVersion || VERSION;
    base.updatedAt = nowIso();
    base.morph = {
      version: VERSION,
      ratio: normalizedRatio,
      sourceA: a.name || "A",
      sourceB: b.name || "B",
      morphedParameterCount: morphed,
      skippedParameterCount: skipped,
      rule: "Only safe numeric continuous parameters are interpolated, including Pulse Width, PWM Amount, Ring Mod Amount and FM Amount. PWM Source, Ring Mod sources/enable and FM carrier/modulator/enable and Unison topology controls, including CPU Layer Limit, remain modes/selects/toggles and are not morphed. Toggles, modes, names, categories, MIDI runtime, Master Tuning, sequencer/arpeggiator state, preset browser state and factory/user banks are not morphed. Non-numeric/missing parameters stay from A."
    };
    return base;
  }

  function ensureUndoCaptured() {
    if (!MORPH_STATE.undoPreset) MORPH_STATE.undoPreset = cloneJson(window.SynthXPresets?.buildPresetObject?.());
  }

  function isBlockedPresetRuntimeElement(element) {
    return !element || element.dataset?.presetUi === "true" || element.dataset?.midiUi === "true";
  }

  function sanitizeControlValue(id, value) {
    const element = document.getElementById(id);
    if (!element || isBlockedPresetRuntimeElement(element)) return { ok: false, value };
    if (element.type === "checkbox") return { ok: true, value: Boolean(value) };
    if (element.tagName === "SELECT") {
      const options = Array.from(element.options || []).map((option) => String(option.value));
      if (!options.length) return { ok: false, value };
      const next = String(value);
      return { ok: true, value: options.includes(next) ? next : options[0] };
    }
    if (element.type === "range" || element.type === "number") {
      const range = safeRange(id);
      const raw = Number(value);
      if (!Number.isFinite(raw)) return { ok: false, value };
      return { ok: true, value: clamp(roundToStep(raw, range.step, range.min), range.min, range.max) };
    }
    return { ok: true, value };
  }

  function currentControlValue(element) {
    if (!element) return undefined;
    if (element.type === "checkbox") return Boolean(element.checked);
    if (element.type === "range" || element.type === "number") return Number(element.value);
    return element.value;
  }

  function valuesEquivalent(a, b) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 0.000001;
    return String(a) === String(b);
  }

  function applyPresetParametersNonDestructive(preset, options) {
    const params = preset?.parameters || {};
    const source = options?.source || "preset-morph-live";
    const applyAll = Boolean(options?.applyAll);
    let applied = 0;
    let unchanged = 0;
    let skipped = 0;

    Object.entries(params).forEach(([id, value]) => {
      if (!applyAll && !isSafeNumericId(id)) { skipped += 1; return; }
      if (PROTECTED_IDS.has(String(id || ""))) { skipped += 1; return; }
      const element = document.getElementById(id);
      if (!element || isBlockedPresetRuntimeElement(element)) { skipped += 1; return; }
      const sanitized = sanitizeControlValue(id, value);
      if (!sanitized.ok) { skipped += 1; return; }
      if (valuesEquivalent(currentControlValue(element), sanitized.value)) { unchanged += 1; return; }
      if (window.SynthXControls?.setControlValue?.(id, sanitized.value, source)) applied += 1;
      else skipped += 1;
    });

    window.SynthXModulationMatrix?.syncFromUi?.(source);
    window.SynthXControls?.refreshAllUi?.();
    window.SynthXPresets?.updatePreview?.(window.SynthXPresets?.buildPresetObject?.());
    MORPH_STATE.appliedOnce = true;
    return { applied, unchanged, skipped };
  }

  function applyPreset(preset, options) {
    // v0.26.6i/v0.26.6m: il Morph non deve passare dal caricamento completo preset, perché quel
    // percorso è pensato per il caricamento completo di una patch e chiama allNotesOff().
    // Applicando invece i controlli in modo non distruttivo, le note già tenute restano
    // tracciate in heldNotes e l'audio engine può aggiornare o ricostruire le voci vive.
    return applyPresetParametersNonDestructive(preset, {
      source: options?.source || "preset-morph-live",
      applyAll: options?.applyAll !== false
    });
  }

  function previewMorph(ratioOverride, options) {
    try {
      const source = options?.source || "manual";
      ensureUndoCaptured();
      const ratio = ratioOverride == null ? getRatio() : clamp(Number(ratioOverride), 0, 1);
      if (source === "live" && MORPH_STATE.lastAppliedRatio === ratio && MORPH_STATE.lastMorphedPreset) {
        return cloneJson(MORPH_STATE.lastMorphedPreset);
      }
      const preset = buildMorphedPreset(ratio);
      MORPH_STATE.lastAppliedRatio = ratio;
      MORPH_STATE.lastMorphedPreset = cloneJson(preset);
      const liveApply = applyPreset(preset, {
        source: source === "live" ? "preset-morph-live" : "preset-morph-preview",
        applyAll: source !== "live" || !MORPH_STATE.appliedOnce
      });
      const undo = document.getElementById("morph-restore");
      if (undo) undo.disabled = false;
      const prefix = source === "live" ? "Live Morph" : "Morph preview";
      status(`${prefix} applicato: ${Math.round(ratio * 100)}%, parametri interpolati ${preset.morph?.morphedParameterCount || 0}, controlli aggiornati ${liveApply.applied} (${liveApply.unchanged} già coerenti). Restore disponibile.`, "ok");
      refreshSummary();
      return preset;
    } catch (err) {
      status(`Morph non applicato: ${err.message}`, "error");
      window.SynthXLogger?.error("preset morph preview error", err);
      return null;
    }
  }

  function applyMorphToCurrent() {
    cancelPendingLivePreview();
    const preset = previewMorph(getRatio(), { source: "manual" });
    if (!preset) return null;
    MORPH_STATE.lastMorphedPreset = cloneJson(preset);
    status(`Morph fissato come patch corrente: ${preset.name}. Salvalo come user preset se vuoi conservarlo.`, "ok");
    return preset;
  }

  function restoreBeforeMorph() {
    cancelPendingLivePreview();
    if (!MORPH_STATE.undoPreset) {
      status("Restore non disponibile: nessun morph applicato in memoria.", "warn");
      return false;
    }
    try {
      const restored = applyPreset(MORPH_STATE.undoPreset, { source: "preset-morph-restore", applyAll: true });
      MORPH_STATE.undoPreset = null;
      MORPH_STATE.lastMorphedPreset = null;
      MORPH_STATE.lastAppliedRatio = null;
      MORPH_STATE.appliedOnce = false;
      const undo = document.getElementById("morph-restore");
      if (undo) undo.disabled = true;
      status(`Stato precedente al morph ripristinato senza spegnere le note vive. Controlli aggiornati ${restored.applied}.`, "ok");
      refreshSummary();
      return true;
    } catch (err) {
      status(`Restore Morph fallito: ${err.message}`, "error");
      window.SynthXLogger?.error("preset morph restore error", err);
      return false;
    }
  }

  function toggleLivePreview() {
    MORPH_STATE.livePreview = Boolean(document.getElementById("morph-live")?.checked);
    if (!MORPH_STATE.livePreview) cancelPendingLivePreview();
    status(MORPH_STATE.livePreview ? "Live Preview attivo con smoothing leggero: lo slider applica il morph al frame successivo, evitando raffiche inutili." : "Live Preview spento: usa Preview Morph per applicare lo slider.", MORPH_STATE.livePreview ? "ok" : "info");
    if (MORPH_STATE.livePreview && !scheduleLivePreview(getRatio())) {
      status("Live Preview attivo: assegna prima entrambi gli slot A e B.", "info");
    }
  }

  function onAbSlotsChanged(reason) {
    MORPH_STATE.lastAppliedRatio = null;
    MORPH_STATE.appliedOnce = false;
    refreshSummary();
    if (MORPH_STATE.livePreview && hasReadyMorphSlots()) scheduleLivePreview(getRatio());
    if (!MORPH_STATE.lastMorphedPreset) {
      status(`Morph A/B aggiornato automaticamente${reason ? ` (${reason})` : ""}.`, "info");
    }
  }

  function getSummary() {
    const a = getSlot("a");
    const b = getSlot("b");
    return {
      version: VERSION,
      a: a ? a.name : null,
      b: b ? b.name : null,
      ratio: getRatio(),
      morphableParameters: a && b ? countMorphableParameters(a, b) : 0,
      undoAvailable: Boolean(MORPH_STATE.undoPreset),
      livePreview: MORPH_STATE.livePreview
    };
  }

  function init() {
    const live = document.getElementById("morph-live");
    if (live) {
      live.checked = live.checked !== false;
      MORPH_STATE.livePreview = Boolean(live.checked);
    }
    updateRatioLabel();
    refreshSummary();
    document.getElementById("morph-ratio")?.addEventListener("input", updateRatioLabel);
    document.getElementById("morph-preview")?.addEventListener("click", () => previewMorph());
    document.getElementById("morph-apply-current")?.addEventListener("click", applyMorphToCurrent);
    document.getElementById("morph-restore")?.addEventListener("click", restoreBeforeMorph);
    document.getElementById("morph-refresh")?.addEventListener("click", () => { refreshSummary(); status("Morph: riepilogo A/B aggiornato.", "info"); });
    live?.addEventListener("change", toggleLivePreview);
    const undo = document.getElementById("morph-restore");
    if (undo) undo.disabled = true;
    status("Preset Morph pronto: assegna A e B per abilitare il Live Preview senza errori di avvio.", "ok");
    window.SynthXLogger?.log("Preset Morph live pronto", getSummary());
  }

  window.SynthXPresetMorph = {
    init,
    buildMorphedPreset,
    previewMorph,
    applyMorphToCurrent,
    restoreBeforeMorph,
    refreshSummary,
    onAbSlotsChanged,
    getSummary,
    isSafeNumericId
  };
})();
