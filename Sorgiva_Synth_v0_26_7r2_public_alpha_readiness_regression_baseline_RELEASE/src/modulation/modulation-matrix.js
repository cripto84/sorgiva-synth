(function () {
  "use strict";

  const SLOT_COUNT = 8;
  const SLOT_IDS = Object.freeze(Array.from({ length: SLOT_COUNT }, (_, i) => i + 1));

  const SOURCES = Object.freeze([
    { id: "lfo1", label: "LFO 1" },
    { id: "lfo2", label: "LFO 2" },
    { id: "lfo3", label: "LFO 3" },
    { id: "filter_env", label: "Filter Env" },
    { id: "velocity", label: "Velocity" },
    { id: "mod_wheel", label: "Mod Wheel" },
    { id: "aftertouch", label: "Aftertouch" },
    { id: "expression", label: "Expression CC11" },
    { id: "breath", label: "Breath CC2" },
    { id: "foot", label: "Foot CC4" }
  ]);

  const DESTINATIONS = Object.freeze([
    { id: "vcf_cutoff", label: "VCF Cutoff" },
    { id: "hpf_cutoff", label: "HPF Cutoff" },
    { id: "bpf_center", label: "BPF Center" },
    { id: "notch_center", label: "Notch Center" },
    { id: "adv_filter_freq", label: "Advanced Filter Freq" },
    { id: "adv_filter_depth", label: "Advanced Filter Depth" },
    { id: "adv_filter_mix", label: "Advanced Filter Mix" },
    { id: "filter_drive", label: "Filter Drive" },
    { id: "pan", label: "Pan" },
    { id: "volume", label: "Volume" },
    { id: "pitch", label: "Pitch" },
    { id: "mod_fx_mix", label: "Mod FX Mix" },
    { id: "mod_fx_rate", label: "Mod FX Rate" },
    { id: "mod_fx_depth", label: "Mod FX Depth" },
    { id: "delay_mix", label: "Delay Mix" },
    { id: "delay_time", label: "Delay Time" },
    { id: "delay_feedback", label: "Delay Feedback" },
    { id: "delay_damp", label: "Delay Damp" },
    { id: "reverb_mix", label: "Reverb Mix" },
    { id: "reverb_damp", label: "Reverb Damp" }
  ]);

  const SOURCE_IDS = new Set(SOURCES.map((item) => item.id));
  const DESTINATION_IDS = new Set(DESTINATIONS.map((item) => item.id));
  const VALIDATION_STATUS = Object.freeze({
    OK: "ok",
    INVALID_SOURCE: "invalid-source",
    INVALID_DESTINATION: "invalid-destination",
    INVALID_SOURCE_AND_DESTINATION: "invalid-source-and-destination"
  });

  let clipboardSlot = null;

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function defaultSlot(index) {
    const safeIndex = clamp(index, 1, SLOT_COUNT);
    const sourceDefaults = ["lfo1", "lfo2", "lfo3", "velocity", "filter_env", "lfo1", "lfo2", "lfo3"];
    const destinationDefaults = ["vcf_cutoff", "vcf_cutoff", "adv_filter_freq", "vcf_cutoff", "filter_drive", "pan", "volume", "pitch"];
    return {
      enabled: false,
      source: sourceDefaults[safeIndex - 1] || "lfo1",
      destination: destinationDefaults[safeIndex - 1] || "vcf_cutoff",
      amount: 0,
      index: safeIndex
    };
  }

  function controlIdsForSlot(index) {
    const slot = clamp(index, 1, SLOT_COUNT);
    return {
      enabled: `modmat-slot${slot}-enabled`,
      source: `modmat-slot${slot}-source`,
      destination: `modmat-slot${slot}-destination`,
      amount: `modmat-slot${slot}-amount`
    };
  }

  function isValidSource(value) {
    const id = String(value || "").trim();
    return SOURCE_IDS.has(id);
  }

  function isValidDestination(value) {
    const id = String(value || "").trim();
    return DESTINATION_IDS.has(id);
  }

  function normalizeSource(value) {
    const id = String(value || "").trim();
    return SOURCE_IDS.has(id) ? id : "lfo1";
  }

  function normalizeDestination(value) {
    const id = String(value || "").trim();
    return DESTINATION_IDS.has(id) ? id : "vcf_cutoff";
  }

  function normalizeAmount(value) {
    return clamp(value, -1, 1);
  }

  function normalizeSlot(raw, index) {
    const d = defaultSlot(index);
    const hasExplicitSource = raw && (Object.prototype.hasOwnProperty.call(raw, "source") || Object.prototype.hasOwnProperty.call(raw, "src"));
    const hasExplicitDestination = raw && (Object.prototype.hasOwnProperty.call(raw, "destination") || Object.prototype.hasOwnProperty.call(raw, "dest"));
    const sourceRaw = raw?.source ?? raw?.src ?? d.source;
    const destinationRaw = raw?.destination ?? raw?.dest ?? d.destination;
    const invalidSource = hasExplicitSource && !isValidSource(sourceRaw);
    const invalidDestination = hasExplicitDestination && !isValidDestination(destinationRaw);
    const validationStatus = invalidSource && invalidDestination
      ? VALIDATION_STATUS.INVALID_SOURCE_AND_DESTINATION
      : invalidSource
        ? VALIDATION_STATUS.INVALID_SOURCE
        : invalidDestination
          ? VALIDATION_STATUS.INVALID_DESTINATION
          : VALIDATION_STATUS.OK;
    return {
      index: d.index,
      enabled: Boolean(raw?.enabled) && validationStatus === VALIDATION_STATUS.OK,
      source: normalizeSource(sourceRaw),
      destination: normalizeDestination(destinationRaw),
      amount: normalizeAmount(raw?.amount ?? d.amount),
      validationStatus
    };
  }

  function normalizeMatrix(value) {
    const list = Array.isArray(value) ? value : [];
    return SLOT_IDS.map((slotIndex) => normalizeSlot(list[slotIndex - 1] || {}, slotIndex));
  }

  function getParam(id, fallback, reader) {
    if (typeof reader === "function") {
      const value = reader(id);
      return value === undefined || value === null ? fallback : value;
    }
    const value = window.SynthXState?.getParameter?.(id);
    return value === undefined || value === null ? fallback : value;
  }

  function readSlotFromParameters(index, reader) {
    const ids = controlIdsForSlot(index);
    return normalizeSlot({
      enabled: getParam(ids.enabled, false, reader),
      source: getParam(ids.source, "lfo1", reader),
      destination: getParam(ids.destination, "vcf_cutoff", reader),
      amount: getParam(ids.amount, 0, reader)
    }, index);
  }

  function readMatrixFromParameters(reader) {
    return SLOT_IDS.map((index) => readSlotFromParameters(index, reader));
  }

  function slotToParameters(slot) {
    const safe = normalizeSlot(slot, slot?.index || 1);
    const ids = controlIdsForSlot(safe.index);
    return {
      [ids.enabled]: safe.enabled,
      [ids.source]: safe.source,
      [ids.destination]: safe.destination,
      [ids.amount]: safe.amount
    };
  }

  function parametersFromMatrix(matrix) {
    return normalizeMatrix(matrix).reduce((acc, slot) => Object.assign(acc, slotToParameters(slot)), {});
  }

  function defaultParameters() {
    return parametersFromMatrix(SLOT_IDS.map((index) => defaultSlot(index)));
  }

  function syncFromUi(reason) {
    const slots = readMatrixFromParameters();
    const activeSlotCount = slots.filter((slot) => slot.enabled && Math.abs(slot.amount) > 0.0001).length;
    window.SynthXState?.updateModulationMatrix?.({
      slots,
      activeSlotCount,
      lastAction: reason || "sync"
    });
    updateUiStatus(slots);
    return slots;
  }

  function snapshotFromUi() {
    return readMatrixFromParameters();
  }

  function setElementValue(id, value, source) {
    if (window.SynthXControls?.setControlValue?.(id, value, source || "modmat")) return true;
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = String(value);
    const coerced = window.SynthXState?.coerceValue ? window.SynthXState.coerceValue(el) : value;
    window.SynthXState?.setParameter?.(id, coerced, { source: source || "modmat", type: el.type || el.tagName.toLowerCase() });
    window.SynthXControls?.updateValueLabel?.(id, coerced);
    return true;
  }

  function resetSlot(index) {
    const slot = defaultSlot(index);
    const params = slotToParameters(slot);
    Object.entries(params).forEach(([id, value]) => setElementValue(id, value, `modmat-reset-slot-${slot.index}`));
    syncFromUi(`reset-slot-${slot.index}`);
    return slot;
  }

  function setSlot(index, rawSlot, source) {
    const slot = normalizeSlot(rawSlot || {}, index);
    const params = slotToParameters(slot);
    Object.entries(params).forEach(([id, value]) => setElementValue(id, value, source || `modmat-set-slot-${slot.index}`));
    syncFromUi(source || `set-slot-${slot.index}`);
    return slot;
  }

  function copySlot(index) {
    const slot = readSlotFromParameters(index);
    clipboardSlot = {
      enabled: slot.enabled,
      source: slot.source,
      destination: slot.destination,
      amount: slot.amount
    };
    updateUiStatus(readMatrixFromParameters());
    return clipboardSlot;
  }

  function pasteSlot(index) {
    if (!clipboardSlot) {
      updateUiStatus(readMatrixFromParameters());
      return null;
    }
    return setSlot(index, clipboardSlot, `modmat-paste-slot-${index}`);
  }

  function hasClipboardSlot() {
    return Boolean(clipboardSlot);
  }

  function resetAll() {
    SLOT_IDS.forEach((index) => resetSlot(index));
    return syncFromUi("reset-all");
  }

  function sourceLabel(source) {
    return SOURCES.find((item) => item.id === source)?.label || source;
  }

  function destinationLabel(destination) {
    return DESTINATIONS.find((item) => item.id === destination)?.label || destination;
  }

  function updateUiStatus(slots) {
    const list = Array.isArray(slots) ? slots : readMatrixFromParameters();
    SLOT_IDS.forEach((index) => {
      const slot = list[index - 1] || defaultSlot(index);
      const label = document.getElementById(`modmat-slot${index}-status`);
      if (!label) return;
      const amount = Math.round(normalizeAmount(slot.amount) * 100);
      if (slot.validationStatus && slot.validationStatus !== VALIDATION_STATUS.OK) {
        label.textContent = "Slot disattivato: source/destination non valida";
        label.dataset.kind = "warn";
        return;
      }
      label.textContent = slot.enabled && Math.abs(slot.amount) > 0.0001
        ? `${sourceLabel(slot.source)} → ${destinationLabel(slot.destination)} · ${amount >= 0 ? "+" : ""}${amount}%`
        : "Slot spento";
      label.dataset.kind = slot.enabled && Math.abs(slot.amount) > 0.0001 ? "ok" : "off";
    });
    const status = document.getElementById("modmat-status");
    if (status) {
      const active = list.filter((slot) => slot.enabled && Math.abs(slot.amount) > 0.0001).length;
      status.textContent = `Modulation Matrix: ${active}/${SLOT_COUNT} slot attivi. Clipboard slot: ${clipboardSlot ? "pronta" : "vuota"}. Fallback legacy: preset senza matrix = tutti gli slot spenti.`;
      status.dataset.kind = active ? "ok" : "info";
    }
  }

  window.SynthXModulationMatrix = {
    SLOT_COUNT,
    SOURCES,
    DESTINATIONS,
    defaultSlot,
    controlIdsForSlot,
    normalizeSlot,
    normalizeMatrix,
    normalizeAmount,
    normalizeSource,
    normalizeDestination,
    isValidSource,
    isValidDestination,
    VALIDATION_STATUS,
    readMatrixFromParameters,
    parametersFromMatrix,
    defaultParameters,
    snapshotFromUi,
    syncFromUi,
    setSlot,
    resetSlot,
    resetAll,
    copySlot,
    pasteSlot,
    hasClipboardSlot,
    updateUiStatus
  };
})();
