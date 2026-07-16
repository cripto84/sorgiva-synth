(function () {
  "use strict";

  const VALID_MODES = new Set(["manual", "arp", "sequencer"]);
  let currentMode = "manual";
  let transitionLock = false;
  let lastReason = "init";
  let lastTransition = "manual";
  let conflictCorrections = 0;

  function getEl(id) { return document.getElementById(id); }

  function isChecked(id) { return Boolean(getEl(id)?.checked); }

  function safeAllNotesOff(reason) {
    try { window.SynthXAudio?.allNotesOff?.(); }
    catch (err) { window.SynthXLogger?.warn("motion allNotesOff error", reason || "", err); }
  }

  function setControl(id, value, source) {
    if (window.SynthXControls?.setControlValue) {
      window.SynthXControls.setControlValue(id, value, source || "motion-engine");
      return true;
    }
    const el = getEl(id);
    if (!el) return false;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = String(value);
    window.SynthXState?.setParameter?.(id, window.SynthXState.coerceValue?.(el) ?? value, { source: source || "motion-engine" });
    return true;
  }

  function deriveMode() {
    const arpOn = isChecked("arp-enabled");
    const seqOn = isChecked("seq-enabled");
    if (arpOn && seqOn) return "conflict";
    if (seqOn) return "sequencer";
    if (arpOn) return "arp";
    return "manual";
  }

  function modeLabel(mode) {
    if (mode === "arp") return "Arpeggiatore";
    if (mode === "sequencer") return "Step Sequencer";
    if (mode === "conflict") return "Conflitto";
    return "Manuale";
  }

  function stopSequencer(reason, options) {
    try { window.SynthXSequencer?.clear?.(reason || "motion-stop-sequencer", { allAudioOff: Boolean(options?.allAudioOff) }); }
    catch (err) { window.SynthXLogger?.warn("motion stop sequencer error", err); }
    if (isChecked("seq-enabled")) setControl("seq-enabled", false, reason || "motion-stop-sequencer");
  }

  function stopArp(reason, options) {
    try { window.SynthXArpeggiator?.clear?.(reason || "motion-stop-arp", { allAudioOff: Boolean(options?.allAudioOff) }); }
    catch (err) { window.SynthXLogger?.warn("motion stop arp error", err); }
    if (isChecked("arp-enabled")) setControl("arp-enabled", false, reason || "motion-stop-arp");
  }

  function updateRuntime(reason) {
    const derived = deriveMode();
    currentMode = derived === "conflict" ? currentMode : derived;
    lastReason = reason || lastReason || "runtime";
    window.SynthXState?.updateMotion?.({
      mode: currentMode,
      derivedMode: derived,
      label: modeLabel(currentMode),
      arpEnabled: isChecked("arp-enabled"),
      sequencerEnabled: isChecked("seq-enabled"),
      locked: transitionLock,
      conflict: derived === "conflict",
      conflictCorrections,
      lastReason,
      lastTransition
    });
    window.SynthXControls?.updateMotionUiStatus?.();
  }

  function reconcile(reason) {
    const derived = deriveMode();
    if (derived === "conflict") {
      conflictCorrections += 1;
      // Safe fallback: when both toggles are somehow true outside the normal paths,
      // prefer manual silence over guessing which clock should own the synth.
      stopSequencer(reason || "motion-conflict", { allAudioOff: true });
      stopArp(reason || "motion-conflict", { allAudioOff: true });
      safeAllNotesOff(reason || "motion-conflict");
      currentMode = "manual";
      lastTransition = "conflict->manual";
    } else {
      currentMode = derived;
      lastTransition = `${currentMode}->${currentMode}`;
    }
    updateRuntime(reason || "motion-reconcile");
    return currentMode;
  }

  function setMode(mode, reason, options) {
    const target = VALID_MODES.has(String(mode)) ? String(mode) : "manual";
    const why = reason || `motion-${target}`;
    if (transitionLock) {
      lastReason = `${why}:locked`;
      updateRuntime(lastReason);
      return currentMode;
    }
    transitionLock = true;
    try {
      const before = deriveMode();
      if (target === "manual") {
        if (!options?.preserveArp) stopArp(why, { allAudioOff: true });
        if (!options?.preserveSequencer) stopSequencer(why, { allAudioOff: true });
        safeAllNotesOff(why);
      } else if (target === "arp") {
        stopSequencer(why, { allAudioOff: true });
        safeAllNotesOff(why);
        // Do not force arp-enabled here: the user action or caller already owns it.
      } else if (target === "sequencer") {
        stopArp(why, { allAudioOff: true });
        safeAllNotesOff(why);
        // Do not force seq-enabled here: the user action or caller already owns it.
      }
      currentMode = target;
      lastTransition = `${before}->${target}`;
      lastReason = why;
    } finally {
      transitionLock = false;
    }
    reconcile(why);
    return currentMode;
  }

  function init() {
    reconcile("init");
    window.addEventListener("blur", () => {
      if (deriveMode() !== "manual") {
        safeAllNotesOff("motion-window-blur");
        updateRuntime("motion-window-blur");
      }
    });
    updateRuntime("init");
  }

  window.SynthXMotion = {
    init,
    setMode,
    reconcile,
    updateRuntime,
    getMode: () => currentMode,
    getDerivedMode: deriveMode,
    getStatus: () => ({
      mode: currentMode,
      derivedMode: deriveMode(),
      label: modeLabel(currentMode),
      arpEnabled: isChecked("arp-enabled"),
      sequencerEnabled: isChecked("seq-enabled"),
      locked: transitionLock,
      conflictCorrections,
      lastReason,
      lastTransition
    })
  };
})();
