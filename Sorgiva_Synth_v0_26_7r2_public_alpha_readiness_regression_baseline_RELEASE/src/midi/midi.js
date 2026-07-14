(function () {
  "use strict";

  const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const REALTIME_STATUS_MIN = 0xf8;
  const ALL_INPUTS_ID = "__sorgiva_all_midi_inputs__";

  let midiAccess = null;
  let selectedInput = null;
  const boundInputIds = new Set();
  let currentInputId = "";
  let currentInputName = "";
  let currentInputManufacturer = "";
  let midiChannelFilter = "omni";
  let pitchBendRange = 2;
  let pitchBendValue = 0;
  let modWheelValue = 0;
  const expressionControllerState = { aftertouch: 0, expression: 0, breath: 0, foot: 0 };
  const expressionControllerMeta = Object.freeze({
    aftertouch: { label: "Channel Aftertouch", messageType: "channel-aftertouch", audioSetter: "setAftertouch", monitor: "midi-aftertouch-monitor", valueLabel: "midi-aftertouch-val", status: "aftertouch" },
    expression: { label: "Expression CC11", messageType: "cc11", audioSetter: "setExpression", monitor: "midi-expression-monitor", valueLabel: "midi-expression-val", status: "expression", cc: 11 },
    breath: { label: "Breath CC2", messageType: "cc2", audioSetter: "setBreath", monitor: "midi-breath-monitor", valueLabel: "midi-breath-val", status: "breath", cc: 2 },
    foot: { label: "Foot Controller CC4", messageType: "cc4", audioSetter: "setFoot", monitor: "midi-foot-monitor", valueLabel: "midi-foot-val", status: "foot", cc: 4 }
  });
  let sustainPedalDown = false;

  // Active MIDI tracking is port/channel-aware. The audio engine is still one-voice-per-pitch,
  // but these maps prevent the MIDI layer from losing track of channel-specific Note Offs.
  const activeMidiKeys = new Set(); // key: "source:channel:note"
  const noteHoldCounts = new Map(); // note -> count of active MIDI keys for that pitch

  function getEl(id) { return document.getElementById(id); }
  function isSupported() { return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function"; }
  function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
  function clampBipolar(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
  }
  function clampPitchBendRange(value) {
    const n = Number(value);
    return [2, 7, 12].includes(n) ? n : 2;
  }
  function channelAccepted(channel) {
    if (midiChannelFilter === "omni") return true;
    return Number(channel) === Number(midiChannelFilter);
  }
  function describeChannelFilter() {
    return midiChannelFilter === "omni" ? "Omni" : `Ch ${midiChannelFilter}`;
  }

  function noteName(midi) {
    const n = Number(midi);
    if (!Number.isFinite(n)) return "Nota ?";
    const name = NOTE_NAMES[((n % 12) + 12) % 12];
    const octave = Math.floor(n / 12) - 1;
    return `${name}${octave}`;
  }

  function midiKey(note, channel, sourceId) {
    const source = String(sourceId || currentInputId || "midi").replace(/[:\s]+/g, "_");
    return `${source}:${Number(channel) || 1}:${Number(note)}`;
  }

  function midiSourceId(event) {
    const port = event?.target || event?.currentTarget || event?.srcElement || selectedInput;
    return String(port?.id || port?.name || currentInputId || "midi");
  }

  function activeNoteCount() {
    return Array.from(noteHoldCounts.values()).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  }

  function inputLabel(input) {
    if (!input) return "";
    const name = input.name || input.id || "Input MIDI";
    const maker = input.manufacturer ? ` — ${input.manufacturer}` : "";
    return `${name}${maker}`;
  }

  function setStatus(message, kind) {
    const el = getEl("midi-support-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
  }

  function setDeviceStatus(message) {
    const el = getEl("midi-device-status");
    if (el) el.textContent = message;
  }

  function setActiveNotesStatus() {
    const el = getEl("midi-active-notes");
    if (el) el.textContent = `Note MIDI attive: ${activeNoteCount()}`;
  }

  function setLastEvent(message, patch) {
    const text = message || "Ultimo evento MIDI: nessuno.";
    const el = getEl("midi-last-event");
    if (el) el.textContent = text;
    window.SynthXState?.updateMidi?.({ lastEvent: text, ...(patch || {}) });
  }

  function setVelocityMonitor(value) {
    const n = clamp01(value);
    const range = getEl("midi-note-velocity");
    const label = getEl("midi-note-velocity-val");
    if (range) range.value = String(n);
    if (label) label.textContent = `${Math.round(n * 100)}%`;
  }

  function setPitchBendMonitor(value) {
    const n = clampBipolar(value);
    const range = getEl("midi-pitch-bend-monitor");
    const label = getEl("midi-pitch-bend-val");
    if (range) range.value = String(n);
    if (label) label.textContent = `${n >= 0 ? "+" : ""}${n.toFixed(3)} · ±${pitchBendRange} st`;
  }

  function setModWheelMonitor(value) {
    const n = clamp01(value);
    const range = getEl("midi-mod-wheel-monitor");
    const label = getEl("midi-mod-wheel-val");
    if (range) range.value = String(n);
    if (label) label.textContent = `${Math.round(n * 100)}%`;
  }

  function setExpressionControllerMonitor(name, value) {
    const meta = expressionControllerMeta[name];
    if (!meta) return;
    const n = clamp01(value);
    const range = getEl(meta.monitor);
    const label = getEl(meta.valueLabel);
    if (range) range.value = String(n);
    if (label) label.textContent = `${Math.round(n * 100)}%`;
  }

  function setAllExpressionControllerMonitors(value) {
    Object.keys(expressionControllerMeta).forEach((name) => setExpressionControllerMonitor(name, value));
  }

  function setSustainMonitor(down) {
    const el = getEl("midi-sustain-status");
    if (el) {
      el.textContent = down ? "Sustain pedal: DOWN" : "Sustain pedal: UP";
      el.dataset.kind = down ? "ok" : "info";
    }
  }

  function setChannelFilterUi(value) {
    const select = getEl("midi-channel-filter");
    if (select) select.value = String(value || "omni");
  }

  function setButtonState(accessEnabled) {
    const enable = getEl("midi-enable");
    const refresh = getEl("midi-refresh");
    const select = getEl("midi-input-select");
    const channel = getEl("midi-channel-filter");
    const bendRange = getEl("midi-pitch-bend-range");
    if (enable) {
      enable.textContent = accessEnabled ? "MIDI attivo" : "Attiva MIDI";
      enable.disabled = !isSupported();
    }
    if (refresh) refresh.disabled = !accessEnabled;
    if (select) select.disabled = !accessEnabled;
    if (channel) channel.disabled = false;
    if (bendRange) bendRange.disabled = false;
  }

  function updateRuntimeState(patch) {
    const count = midiAccess ? getInputs().length : 0;
    window.SynthXState?.updateMidi?.({
      supported: isSupported(),
      enabled: Boolean(midiAccess),
      selectedInputId: currentInputId,
      selectedInputName: currentInputName,
      selectedInputManufacturer: currentInputManufacturer,
      inputCount: count,
      activeNoteCount: activeNoteCount(),
      channelFilter: midiChannelFilter,
      pitchBend: pitchBendValue,
      pitchBendRange,
      modWheel: modWheelValue,
      aftertouch: expressionControllerState.aftertouch,
      expression: expressionControllerState.expression,
      breath: expressionControllerState.breath,
      foot: expressionControllerState.foot,
      sustainPedalDown,
      hardwareTestStatus: "passed-real-controller-baseline-2026-07-09",
      ...(patch || {})
    });
    setActiveNotesStatus();
    setDeviceStatus(Boolean(midiAccess)
      ? `Dispositivi input rilevati: ${count}${currentInputName ? ` · selezionato: ${currentInputName}` : ""}`
      : "Dispositivi input rilevati: 0");
  }

  function getInputs() {
    if (!midiAccess) return [];
    return Array.from(midiAccess.inputs.values())
      .filter((input) => !input.state || input.state !== "disconnected")
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }

  function detachInput() {
    if (midiAccess) {
      boundInputIds.forEach((id) => {
        const input = midiAccess.inputs.get(id);
        if (input && input.onmidimessage === handleMidiMessage) input.onmidimessage = null;
      });
    }
    if (selectedInput && selectedInput.onmidimessage === handleMidiMessage) selectedInput.onmidimessage = null;
    boundInputIds.clear();
    selectedInput = null;
    currentInputId = "";
    currentInputName = "";
    currentInputManufacturer = "";
  }

  function clearMidiTracking() {
    Array.from(noteHoldCounts.keys()).forEach((note) => setVirtualKeyActive(note, false));
    activeMidiKeys.clear();
    noteHoldCounts.clear();
    setVelocityMonitor(0);
    updateRuntimeState({ activeNoteCount: 0 });
  }

  function findPreferredInput(inputs, previousId, previousName, previousManufacturer) {
    if (!inputs.length) return null;
    if (previousId === ALL_INPUTS_ID) return ALL_INPUTS_ID;
    if (previousId) {
      const byId = inputs.find((input) => input.id === previousId);
      if (byId) return byId;
    }
    if (previousName && previousName !== "Tutti gli input MIDI") {
      const byName = inputs.find((input) => input.name === previousName && (!previousManufacturer || input.manufacturer === previousManufacturer));
      if (byName) return byName;
      const byLooseName = inputs.find((input) => input.name === previousName);
      if (byLooseName) return byLooseName;
    }
    return inputs.length > 1 ? ALL_INPUTS_ID : inputs[0];
  }

  function renderInputs(options) {
    const select = getEl("midi-input-select");
    if (!select) return;

    const previousId = options?.preferId ?? currentInputId ?? select.value ?? "";
    const previousName = options?.preferName ?? currentInputName ?? "";
    const previousManufacturer = options?.preferManufacturer ?? currentInputManufacturer ?? "";
    const inputs = getInputs();
    const wasTrackingNotes = activeNoteCount() > 0;

    select.innerHTML = "";

    if (!inputs.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nessun input MIDI disponibile";
      select.appendChild(option);
      detachInput();
      if (wasTrackingNotes) panic("input disconnesso");
      else clearMidiTracking();
      setStatus("MIDI: accesso attivo, ma nessun input rilevato.", "warn");
      updateRuntimeState({ status: "no-inputs", selectedInputId: "", selectedInputName: "" });
      return;
    }

    if (inputs.length > 1) {
      const allOption = document.createElement("option");
      allOption.value = ALL_INPUTS_ID;
      allOption.textContent = "Tutti gli input MIDI (auto)";
      select.appendChild(allOption);
    }

    inputs.forEach((input) => {
      const option = document.createElement("option");
      option.value = input.id;
      option.textContent = inputLabel(input);
      select.appendChild(option);
    });

    const next = findPreferredInput(inputs, previousId, previousName, previousManufacturer);
    if (next === ALL_INPUTS_ID) {
      select.value = ALL_INPUTS_ID;
      bindAllInputs({ reason: options?.reason || "render" });
    } else if (next) {
      select.value = next.id;
      bindInput(next.id, { reason: options?.reason || "render" });
    }
  }

  function bindAllInputs(options) {
    if (!midiAccess) return;
    const inputs = getInputs();
    const previousName = currentInputName;
    detachInput();

    inputs.forEach((input) => {
      input.onmidimessage = handleMidiMessage;
      boundInputIds.add(input.id);
    });

    currentInputId = ALL_INPUTS_ID;
    currentInputName = "Tutti gli input MIDI";
    currentInputManufacturer = "";

    if (previousName && previousName !== currentInputName && activeNoteCount() > 0) panic("cambio input MIDI");

    const names = inputs.map((input) => input.name || input.id || "Input MIDI").join(", ");
    setStatus(`MIDI: ascolto automatico su ${inputs.length} input${names ? ` — ${names}` : ""}.`, "ok");
    setLastEvent(`Ultimo evento MIDI: ascolto automatico su tutti gli input (${inputs.length}).`, {
      status: "input-all-active",
      lastMessageType: "input-select"
    });
    updateRuntimeState({ status: "input-all-active", lastStateChange: options?.reason || "bind-all-inputs" });
  }

  function bindInput(inputId, options) {
    if (!midiAccess) return;
    if (inputId === ALL_INPUTS_ID) { bindAllInputs(options); return; }
    const input = midiAccess.inputs.get(inputId);
    const previousName = currentInputName;
    detachInput();

    if (!input || input.state === "disconnected") {
      setStatus("MIDI: input selezionato non disponibile. Aggiorna dispositivi o scegli un altro input.", "warn");
      updateRuntimeState({ status: "input-missing" });
      return;
    }

    selectedInput = input;
    currentInputId = input.id || "";
    currentInputName = input.name || input.id || "";
    currentInputManufacturer = input.manufacturer || "";
    selectedInput.onmidimessage = handleMidiMessage;
    boundInputIds.add(input.id);

    if (previousName && previousName !== currentInputName && activeNoteCount() > 0) panic("cambio input");

    setStatus(`MIDI: input attivo — ${inputLabel(selectedInput)}.`, "ok");
    setLastEvent(`Ultimo evento MIDI: input selezionato — ${currentInputName}.`, {
      status: "input-active",
      lastMessageType: "input-select"
    });
    updateRuntimeState({ status: "input-active", lastStateChange: options?.reason || "bind-input" });
  }

  function setVirtualKeyActive(midi, active) {
    const key = document.querySelector(`.key[data-note="${Number(midi)}"]`);
    if (key) key.classList.toggle("active", Boolean(active));
  }

  function incrementNote(note) {
    const n = Number(note);
    const current = noteHoldCounts.get(n) || 0;
    noteHoldCounts.set(n, current + 1);
    setVirtualKeyActive(n, true);
  }

  function decrementNote(note) {
    const n = Number(note);
    const current = noteHoldCounts.get(n) || 0;
    const next = Math.max(0, current - 1);
    if (next <= 0) {
      noteHoldCounts.delete(n);
      setVirtualKeyActive(n, false);
      return true;
    }
    noteHoldCounts.set(n, next);
    setVirtualKeyActive(n, true);
    return false;
  }

  function resetPerformanceControllers(reason, options) {
    pitchBendValue = 0;
    modWheelValue = 0;
    Object.keys(expressionControllerState).forEach((name) => { expressionControllerState[name] = 0; });
    sustainPedalDown = false;
    try { window.SynthXAudio?.setSustainPedal?.(false); } catch (_) {}
    try { window.SynthXAudio?.setPitchBend?.(0, pitchBendRange); } catch (_) {}
    try { window.SynthXAudio?.setModWheel?.(0); } catch (_) {}
    try { window.SynthXAudio?.resetExpressionControllers?.(); } catch (_) {}
    setPitchBendMonitor(0);
    setModWheelMonitor(0);
    setAllExpressionControllerMonitors(0);
    setSustainMonitor(false);
    if (!options?.silent) {
      setLastEvent(`Ultimo evento MIDI: Reset controller performance${reason ? ` (${reason})` : ""}.`, {
        status: "controllers-reset",
        lastMessageType: "controllers-reset",
        pitchBend: 0,
        modWheel: 0,
        aftertouch: 0,
        expression: 0,
        breath: 0,
        foot: 0,
        sustainPedalDown: false
      });
      updateRuntimeState({ status: "controllers-reset" });
    }
  }

  function setMidiSustainPedal(down, channel) {
    sustainPedalDown = Boolean(down);
    try { window.SynthXAudio?.setSustainPedal?.(sustainPedalDown); } catch (_) {}
    setSustainMonitor(sustainPedalDown);
    setLastEvent(`Ultimo evento MIDI: Sustain Pedal CC64 ch ${channel} ${sustainPedalDown ? "DOWN" : "UP"}.`, {
      status: "sustain-pedal",
      lastMessageType: "cc64",
      lastCc: 64,
      lastCcValue: sustainPedalDown ? 127 : 0,
      sustainPedalDown
    });
    updateRuntimeState({ status: "sustain-pedal" });
  }

  function handlePitchBend(lsb, msb, channel) {
    const value14 = ((Number(msb) & 0x7f) << 7) | (Number(lsb) & 0x7f);
    const centered = value14 - 8192;
    pitchBendValue = clampBipolar(centered / (centered >= 0 ? 8191 : 8192));
    try { window.SynthXAudio?.setPitchBend?.(pitchBendValue, pitchBendRange); } catch (_) {}
    setPitchBendMonitor(pitchBendValue);
    setLastEvent(`Ultimo evento MIDI: Pitch Bend ch ${channel} ${pitchBendValue >= 0 ? "+" : ""}${pitchBendValue.toFixed(3)} range ±${pitchBendRange} st.`, {
      status: "pitch-bend",
      lastMessageType: "pitch-bend",
      pitchBend: pitchBendValue,
      pitchBendRange
    });
    updateRuntimeState({ status: "pitch-bend" });
  }

  function handleModWheel(value, channel) {
    modWheelValue = clamp01(Number(value) / 127);
    try { window.SynthXAudio?.setModWheel?.(modWheelValue); } catch (_) {}
    setModWheelMonitor(modWheelValue);
    setLastEvent(`Ultimo evento MIDI: Mod Wheel CC1 ch ${channel} ${Math.round(modWheelValue * 127)}/127.`, {
      status: "mod-wheel",
      lastMessageType: "cc1",
      lastCc: 1,
      lastCcValue: Math.round(modWheelValue * 127),
      modWheel: modWheelValue
    });
    updateRuntimeState({ status: "mod-wheel" });
  }

  function handleExpressionController(name, value, channel) {
    const meta = expressionControllerMeta[name];
    if (!meta) return;
    const normalized = clamp01(Number(value) / 127);
    expressionControllerState[name] = normalized;
    try { window.SynthXAudio?.[meta.audioSetter]?.(normalized); } catch (_) {}
    setExpressionControllerMonitor(name, normalized);
    const rawValue = Math.round(normalized * 127);
    setLastEvent(`Ultimo evento MIDI: ${meta.label} ch ${channel} ${rawValue}/127.`, {
      status: meta.status,
      lastMessageType: meta.messageType,
      lastCc: meta.cc ?? null,
      lastCcValue: rawValue,
      [name]: normalized
    });
    updateRuntimeState({ status: meta.status });
  }

  function setPitchBendRangeFromUi(value) {
    pitchBendRange = clampPitchBendRange(value);
    const select = getEl("midi-pitch-bend-range");
    if (select) select.value = String(pitchBendRange);
    try { window.SynthXAudio?.setPitchBendRange?.(pitchBendRange); window.SynthXAudio?.setPitchBend?.(pitchBendValue, pitchBendRange); } catch (_) {}
    setPitchBendMonitor(pitchBendValue);
    updateRuntimeState({ status: "pitch-bend-range" });
  }

  function normalizeMidiChannelFilter(value) {
    const n = Number(value);
    return String(value) === "omni" || !Number.isFinite(n)
      ? "omni"
      : String(Math.max(1, Math.min(16, Math.round(n))));
  }

  function isNoteReleaseCommand(command, velocityByte) {
    return command === 0x80 || (command === 0x90 && Number(velocityByte) <= 0);
  }

  function isTrackedReleaseForFilteredChannel(command, note, velocityByte, channel, sourceId) {
    return isNoteReleaseCommand(command, velocityByte) && activeMidiKeys.has(midiKey(note, channel, sourceId));
  }

  function setMidiChannelFilter(value) {
    const nextFilter = normalizeMidiChannelFilter(value);
    const changed = nextFilter !== midiChannelFilter;

    // v0.20.0a hotfix: changing the accepted MIDI channel while keys are held
    // can otherwise make the matching Note Off arrive on a now-filtered channel.
    // Release safely before applying the new filter to avoid hanging notes.
    if (changed && activeNoteCount() > 0) {
      panic("cambio filtro canale MIDI");
    }

    midiChannelFilter = nextFilter;
    setChannelFilterUi(midiChannelFilter);
    setLastEvent(`Ultimo evento MIDI: filtro canale impostato su ${describeChannelFilter()}.`, {
      status: "channel-filter",
      lastMessageType: "channel-filter",
      channelFilter: midiChannelFilter,
      activeNoteCount: activeNoteCount()
    });
    updateRuntimeState({ status: "channel-filter" });
  }

  function panic(reason) {
    resetPerformanceControllers(reason || "panic", { silent: true });
    const notes = Array.from(noteHoldCounts.keys());
    notes.forEach((note) => {
      try { window.SynthXSequencer?.clear?.("midi-panic"); window.SynthXArpeggiator?.noteOff?.(note, "midi-panic"); window.SynthXAudio?.noteOff?.(note); } catch (_) {}
      setVirtualKeyActive(note, false);
    });
    activeMidiKeys.clear();
    noteHoldCounts.clear();
    window.SynthXSequencer?.clear?.(`midi-panic:${reason || "manual"}`);
    window.SynthXArpeggiator?.clear?.(`midi-panic:${reason || "manual"}`);
    if (window.SynthXAudio?.panicAllNotesOff) window.SynthXAudio.panicAllNotesOff(`midi-panic:${reason || "manual"}`);
    else window.SynthXAudio?.allNotesOff?.({ reason: `midi-panic:${reason || "manual"}`, dampFx: true });
    setVelocityMonitor(0);
    const msg = `Ultimo evento MIDI: Panic / All Notes Off${reason ? ` (${reason})` : ""}.`;
    setLastEvent(msg, { status: "panic", lastMessageType: "panic", lastNote: null, lastVelocity: 0, activeNoteCount: 0 });
    updateRuntimeState({ status: "panic", activeNoteCount: 0 });
    window.SynthXLogger?.log("midi panic", reason || "manual");
  }

  function noteOn(midi, velocity, channel, sourceId) {
    const note = Number(midi);
    const ch = Number(channel) || 1;
    const vel = clamp01(velocity);
    if (!Number.isFinite(note)) return;

    const key = midiKey(note, ch, sourceId);
    const retrigger = activeMidiKeys.has(key);
    if (!retrigger) incrementNote(note);
    activeMidiKeys.add(key);

    setVelocityMonitor(vel);
    if (window.SynthXArpeggiator?.isEnabled?.()) window.SynthXArpeggiator.noteOn(note, vel, "midi");
    else window.SynthXAudio?.noteOn?.(note, vel);
    setLastEvent(`Ultimo evento MIDI: Note On ${noteName(note)} ch ${ch} velocity ${Math.round(vel * 127)}/127${retrigger ? " (retrigger)" : ""}.`, {
      status: "note-on",
      lastMessageType: "note-on",
      lastNote: note,
      lastVelocity: vel,
      activeNoteCount: activeNoteCount()
    });
    updateRuntimeState({ status: "note-on" });
  }

  function noteOff(midi, velocity, channel, sourceId) {
    const note = Number(midi);
    const ch = Number(channel) || 1;
    const vel = clamp01(velocity);
    if (!Number.isFinite(note)) return;

    const key = midiKey(note, ch, sourceId);
    let shouldRelease = false;
    if (activeMidiKeys.has(key)) {
      activeMidiKeys.delete(key);
      shouldRelease = decrementNote(note);
    } else if (noteHoldCounts.has(note)) {
      // Defensive fallback for devices that send mismatched channel Note Offs.
      shouldRelease = decrementNote(note);
    } else {
      setVirtualKeyActive(note, false);
    }

    setVelocityMonitor(vel);
    if (shouldRelease || !noteHoldCounts.has(note)) {
      if (window.SynthXArpeggiator?.isEnabled?.()) window.SynthXArpeggiator.noteOff(note, "midi");
      else window.SynthXAudio?.noteOff?.(note);
    }
    setLastEvent(`Ultimo evento MIDI: Note Off ${noteName(note)} ch ${ch}.`, {
      status: "note-off",
      lastMessageType: "note-off",
      lastNote: note,
      lastVelocity: vel,
      activeNoteCount: activeNoteCount()
    });
    updateRuntimeState({ status: "note-off" });
  }

  function describeStateChange(event) {
    const port = event?.port;
    const type = port?.type || "porta";
    const state = port?.state || "stato sconosciuto";
    const name = port?.name || port?.id || "MIDI";
    return `${type} ${name}: ${state}`;
  }

  function handleStateChange(event) {
    const description = describeStateChange(event);
    const selectedMissing = Boolean(currentInputId) && currentInputId !== ALL_INPUTS_ID && !getInputs().some((input) => input.id === currentInputId);
    if (selectedMissing && activeNoteCount() > 0) panic("input disconnesso");
    renderInputs({
      preferId: currentInputId,
      preferName: currentInputName,
      preferManufacturer: currentInputManufacturer,
      reason: "state-change"
    });
    // v0.14.1: tell runtime-only MIDI helpers about device changes.
    // No WebMIDI objects are passed into preset/export state: only a short description and a boolean.
    try {
      window.SynthXMidiClock?.handleMidiStateChange?.(description, { selectedMissing });
    } catch (err) {
      window.SynthXLogger?.warn("midi clock state-change handler error", err);
    }
    try {
      window.SynthXMidiLearn?.handleMidiStateChange?.(description, { selectedMissing });
    } catch (err) {
      window.SynthXLogger?.warn("midi learn state-change handler error", err);
    }
    setLastEvent(`Ultimo evento MIDI: cambio dispositivi — ${description}.`, {
      status: "state-change",
      lastMessageType: "state-change",
      lastStateChange: description
    });
    updateRuntimeState({ lastStateChange: description });
    window.SynthXLogger?.log("midi state changed", description);
  }

  function handleMidiMessage(event) {
    const data = event?.data;
    if (!data || data.length < 1) return;
    const status = data[0] & 0xff;

    // MIDI realtime messages can be very frequent. Route clock/start/stop to the
    // runtime-only MIDI Clock module, then keep them out of Note On/Off handling.
    if (status >= REALTIME_STATUS_MIN) {
      window.SynthXMidiClock?.handleRealtimeMessage?.(status, event);
      return;
    }

    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const d1 = data[1] ?? 0;
    const d2 = data[2] ?? 0;
    const sourceId = midiSourceId(event);

    const trackedReleaseOnFilteredChannel = isTrackedReleaseForFilteredChannel(command, d1, d2, channel, sourceId);
    if ([0x80, 0x90, 0xb0, 0xd0, 0xe0].includes(command) && !channelAccepted(channel) && !trackedReleaseOnFilteredChannel) {
      setLastEvent(`Ultimo evento MIDI: messaggio ch ${channel} ignorato dal filtro ${describeChannelFilter()}.`, {
        status: "channel-filtered",
        lastMessageType: "channel-filtered",
        lastChannel: channel
      });
      return;
    }

    if (command === 0x90) {
      if (d2 > 0) noteOn(d1, d2 / 127, channel, sourceId);
      else noteOff(d1, 0, channel, sourceId); // MIDI standard: Note On velocity 0 == Note Off.
      return;
    }

    if (command === 0x80) {
      noteOff(d1, d2 / 127, channel, sourceId);
      return;
    }

    if (command === 0xe0) {
      handlePitchBend(d1, d2, channel);
      return;
    }

    if (command === 0xd0) {
      handleExpressionController("aftertouch", d1, channel);
      return;
    }

    if (command === 0xb0) {
      if (d1 === 1) {
        handleModWheel(d2, channel);
        return;
      }
      if (d1 === 2) {
        handleExpressionController("breath", d2, channel);
        return;
      }
      if (d1 === 4) {
        handleExpressionController("foot", d2, channel);
        return;
      }
      if (d1 === 11) {
        handleExpressionController("expression", d2, channel);
        return;
      }
      if (d1 === 64) {
        setMidiSustainPedal(d2 >= 64, channel);
        return;
      }
      if (d1 === 120 || d1 === 123) {
        panic(`CC ${d1}`);
        return;
      }
      if (d1 === 121) {
        resetPerformanceControllers(`CC ${d1}`);
        return;
      }
      const handled = window.SynthXMidiLearn?.handleCc?.(d1, d2, channel);
      if (handled) {
        setLastEvent(`Ultimo evento MIDI: CC ${d1} ch ${channel} value ${d2}/127 gestito da MIDI Learn.`, {
          status: "cc-learn",
          lastMessageType: "cc",
          lastCc: d1,
          lastCcValue: d2
        });
        return;
      }
      setLastEvent(`Ultimo evento MIDI: CC ${d1} ch ${channel} value ${d2}/127 non mappato.`, {
        status: "cc-unmapped",
        lastMessageType: "cc",
        lastCc: d1,
        lastCcValue: d2
      });
      return;
    }

    if (status >= 0xf0) {
      setLastEvent(`Ultimo evento MIDI: messaggio sistema ignorato 0x${status.toString(16)}.`, {
        status: "ignored-system",
        lastMessageType: "ignored-system"
      });
      return;
    }

    setLastEvent(`Ultimo evento MIDI: messaggio ignorato status 0x${status.toString(16)} ch ${channel}.`, {
      status: "ignored",
      lastMessageType: "ignored"
    });
  }

  async function requestAccess() {
    if (!isSupported()) {
      setButtonState(false);
      setStatus("MIDI: WebMIDI non supportato da questo browser o contesto.", "error");
      updateRuntimeState({ supported: false, enabled: false, status: "unsupported" });
      return;
    }

    try {
      setStatus("MIDI: richiesta accesso in corso...", "info");
      try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      } catch (firstErr) {
        // Some browser/device combinations are stricter about the options object.
        // Retry without options before reporting failure.
        midiAccess = await navigator.requestMIDIAccess();
      }
      midiAccess.onstatechange = handleStateChange;
      setButtonState(true);
      renderInputs({ reason: "request-access" });
      updateRuntimeState({ supported: true, enabled: true, permissionState: "granted", status: getInputs().length ? "ready" : "no-inputs" });
      window.SynthXLogger?.log("midi access granted", { inputs: getInputs().length });
    } catch (err) {
      midiAccess = null;
      detachInput();
      clearMidiTracking();
      setButtonState(false);
      setStatus(`MIDI: accesso negato o non disponibile (${err.message || err}).`, "error");
      updateRuntimeState({ supported: true, enabled: false, permissionState: "denied", status: "request-failed" });
      window.SynthXLogger?.warn("midi access failed", err);
    }
  }

  function refresh() {
    if (!midiAccess) { requestAccess(); return; }
    renderInputs({
      preferId: currentInputId,
      preferName: currentInputName,
      preferManufacturer: currentInputManufacturer,
      reason: "manual-refresh"
    });
    setLastEvent("Ultimo evento MIDI: lista dispositivi aggiornata.", { status: "refresh", lastMessageType: "refresh" });
    updateRuntimeState({ status: "refreshed" });
  }

  function init() {
    const supported = isSupported();
    setButtonState(false);
    setVelocityMonitor(0);
    setPitchBendMonitor(0);
    setModWheelMonitor(0);
    setAllExpressionControllerMonitors(0);
    setSustainMonitor(false);
    setChannelFilterUi(midiChannelFilter);
    setActiveNotesStatus();
    setDeviceStatus("Dispositivi input rilevati: 0");
    updateRuntimeState({ supported, enabled: false, status: supported ? "available" : "unsupported" });

    const enable = getEl("midi-enable");
    const refreshButton = getEl("midi-refresh");
    const panicButton = getEl("midi-panic");
    const select = getEl("midi-input-select");
    const channelFilter = getEl("midi-channel-filter");
    const bendRange = getEl("midi-pitch-bend-range");

    if (!supported) {
      setStatus("MIDI: WebMIDI non supportato da questo browser/contesto. Usa Chrome o Edge desktop, con pagina locale/localhost/HTTPS. La tastiera virtuale/PC resta funzionante.", "warn");
      if (enable) enable.disabled = true;
    } else {
      setStatus("MIDI: disponibile. Premi Attiva MIDI e autorizza il browser. Se il controller USB espone più porte, Sorgiva ascolta automaticamente tutti gli input.", "info");
    }

    enable?.addEventListener("click", requestAccess);
    refreshButton?.addEventListener("click", refresh);
    panicButton?.addEventListener("click", () => panic("manuale"));
    select?.addEventListener("change", () => bindInput(select.value, { reason: "user-select" }));
    channelFilter?.addEventListener("change", () => setMidiChannelFilter(channelFilter.value));
    bendRange?.addEventListener("change", () => setPitchBendRangeFromUi(bendRange.value));
    window.addEventListener("beforeunload", () => {
      if (activeNoteCount() > 0) panic("chiusura pagina");
    });
  }

  window.SynthXMidi = {
    init,
    requestAccess,
    refresh,
    panic,
    getActiveMidiNotes: () => Array.from(activeMidiKeys),
    getSelectedInputName: () => currentInputName || selectedInput?.name || "",
    getActiveNoteCount: activeNoteCount,
    getChannelFilter: () => midiChannelFilter,
    getPitchBendStatus: () => ({ value: pitchBendValue, range: pitchBendRange }),
    getModWheelStatus: () => ({ value: modWheelValue }),
    getExpressionControllerStatus: () => ({
      aftertouch: expressionControllerState.aftertouch,
      expression: expressionControllerState.expression,
      breath: expressionControllerState.breath,
      foot: expressionControllerState.foot
    }),
    isSustainPedalDown: () => sustainPedalDown,
    __testHandleMidiData: (bytes, sourceId) => handleMidiMessage({ data: bytes, target: sourceId ? { id: sourceId, name: sourceId } : selectedInput })
  };
})();
