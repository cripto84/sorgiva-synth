(function () {
  "use strict";

  const data = {
    appVersion: window.SorgivaSynth?.appVersion || "0.26.7r2-public-alpha-readiness-regression-baseline",
    projectName: window.SorgivaSynth?.projectName || "Sorgiva Synth",
    legacyProjectName: window.SorgivaSynth?.legacyProjectName || "SynthX Rebuild",
    namespaceMigration: "sorgiva-synth-with-legacy-synthx-aliases",
    docsVersion: "0.3.1",
    legacyAppVersion: "0.3.8-noserver",
    audioUnlocked: false,
    activeTab: "tab-osc-lfo",
    activeNotes: {},
    parameters: {},
    tuning: {
      a4Hz: 440,
      noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si",
      lastAction: "init"
    },
    performance: {
      octaveShift: 0,
      mode: "poly",
      holdEnabled: false,
      glideEnabled: false,
      glideMs: 0,
      keyVelocity: 1,
      velocityCurve: "linear",
      velocityEnabled: true,
      activeVoiceCount: 0,
      heldNoteCount: 0,
      lastAction: ""
    },
    motion: {
      mode: "manual",
      derivedMode: "manual",
      label: "Manuale",
      arpEnabled: false,
      sequencerEnabled: false,
      locked: false,
      conflict: false,
      conflictCorrections: 0,
      lastReason: "init",
      lastTransition: "manual"
    },
    sequencer: {
      enabled: false,
      length: 8,
      rate: 2,
      gatePercent: 65,
      stepVelocityPercent: 100,
      stepGatePercent: 100,
      stepAccent: false,
      stepTie: false,
      stepChord: "off",
      stepChordLabel: "Off",
      currentTie: false,
      running: false,
      currentStep: 0,
      currentRawNote: null,
      currentRawNotes: [],
      currentChord: "off",
      currentChordLabel: "Off",
      currentNoteName: "",
      generatedNoteCount: 0,
      activeStepCount: 8,
      exclusionStatus: "libero",
      sequencePreview: "1:Do4 · 2:Re4 · 3:Mi4 · 4:Sol4 · 5:La4 · 6:Sol4 · 7:Mi4 · 8:Re4",
      lastPatternLabel: "Default melodico 8",
      clipboardStepName: "",
      lastAction: ""
    },

    modulationMatrix: {
      slots: [
        { enabled: false, source: "lfo1", destination: "vcf_cutoff", amount: 0, index: 1 },
        { enabled: false, source: "lfo2", destination: "vcf_cutoff", amount: 0, index: 2 },
        { enabled: false, source: "lfo3", destination: "adv_filter_freq", amount: 0, index: 3 },
        { enabled: false, source: "velocity", destination: "vcf_cutoff", amount: 0, index: 4 },
        { enabled: false, source: "filter_env", destination: "filter_drive", amount: 0, index: 5 },
        { enabled: false, source: "lfo1", destination: "pan", amount: 0, index: 6 },
        { enabled: false, source: "lfo2", destination: "volume", amount: 0, index: 7 },
        { enabled: false, source: "lfo3", destination: "pitch", amount: 0, index: 8 }
      ],
      activeSlotCount: 0,
      lastAction: "init"
    },

    visuals: {
      oscilloscopeEnabled: true,
      oscilloscopeMode: "wave",
      oscilloscopeFps: 30,
      spectroscopeEnabled: true,
      spectroscopeMode: "spectrum",
      spectroscopeFps: 20,
      running: false,
      signalState: "waiting",
      spectrumSignalState: "waiting",
      oscilloscopePeak: 0,
      oscilloscopeRms: 0,
      spectroscopePeak: 0,
      spectroscopePeakHz: 0,
      spectroscopeEnergy: 0,
      lastAction: ""
    },
    arpeggiator: {
      enabled: false,
      mode: "up",
      rate: 4,
      octaves: 1,
      motionPattern: "linear",
      motionPatternLabel: "Linear",
      gatePercent: 65,
      swingPercent: 0,
      latchEnabled: false,
      resetOnChange: true,
      randomNoRepeat: true,
      heldInputCount: 0,
      physicalInputCount: 0,
      generatedNoteCount: 0,
      currentRawNote: null,
      currentNoteName: "",
      running: false,
      lastStepRawNote: null,
      lastStepName: "",
      lastStepNumber: 0,
      sequencePreview: "--",
      inputSignature: "",
      lastAction: ""
    },
    midi: {
      supported: false,
      enabled: false,
      permissionState: "unknown",
      status: "not-initialized",
      selectedInputId: "",
      selectedInputName: "",
      selectedInputManufacturer: "",
      inputCount: 0,
      activeNoteCount: 0,
      lastEvent: "",
      lastMessageType: "",
      lastStateChange: "",
      lastNote: null,
      lastVelocity: 0,
      channelFilter: "omni",
      pitchBend: 0,
      pitchBendRange: 2,
      modWheel: 0,
      aftertouch: 0,
      expression: 0,
      breath: 0,
      foot: 0,
      sustainPedalDown: false,
      hardwareTestStatus: "passed-real-controller-baseline-2026-07-09"
    },
    midiClock: {
      mode: "internal",
      division: 4,
      enabled: false,
      status: "internal",
      sourceHealth: "internal",
      synced: false,
      bpm: 0,
      jitterPercent: 0,
      pulseCount: 0,
      acceptedPulseCount: 0,
      ignoredPulseCount: 0,
      unstablePulseCount: 0,
      clockLostCount: 0,
      recoveryCount: 0,
      transportRunning: false,
      lastRealtime: "clock interno",
      stepIntervalMs: 0,
      lastAction: "init"
    },
    midiLearn: {
      enabled: false,
      mappingCount: 0,
      selectedTarget: "master",
      selectedTargetLabel: "Master Volume",
      lastCc: null,
      lastValue: 0,
      lastChannel: null,
      lastAction: "init",
      health: "ok",
      collisionCount: 0,
      invalidMappingCount: 0,
      importCount: 0,
      exportCount: 0,
      deviceChangeCount: 0,
      storageStatus: "ready",
      mappings: []
    }
  };

  const listeners = new Set();

  function coerceValue(element) {
    if (!element) return null;
    if (element.type === "checkbox") return Boolean(element.checked);
    if (element.type === "range" || element.type === "number") return Number(element.value);
    return element.value;
  }

  function setParameter(id, value, meta) {
    data.parameters[id] = value;
    listeners.forEach((fn) => {
      try { fn(id, value, meta || {}); } catch (err) { window.SynthXLogger?.error("State listener error", err); }
    });
  }

  function getParameter(id) { return data.parameters[id]; }

  function updateMidi(patch) {
    data.midi = { ...data.midi, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("midi", snapshot().midi, { source: "midi-runtime" }); } catch (err) { window.SynthXLogger?.error("State MIDI listener error", err); }
    });
  }

  function updatePerformance(patch) {
    data.performance = { ...data.performance, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("performance", snapshot().performance, { source: "performance-runtime" }); } catch (err) { window.SynthXLogger?.error("State Performance listener error", err); }
    });
  }

  function updateArpeggiator(patch) {
    data.arpeggiator = { ...data.arpeggiator, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("arpeggiator", snapshot().arpeggiator, { source: "arpeggiator-runtime" }); } catch (err) { window.SynthXLogger?.error("State Arpeggiator listener error", err); }
    });
  }

  function updateSequencer(patch) {
    data.sequencer = { ...data.sequencer, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("sequencer", snapshot().sequencer, { source: "sequencer-runtime" }); } catch (err) { window.SynthXLogger?.error("State Sequencer listener error", err); }
    });
  }

  function updateMotion(patch) {
    data.motion = { ...data.motion, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("motion", snapshot().motion, { source: "motion-runtime" }); } catch (err) { window.SynthXLogger?.error("State Motion listener error", err); }
    });
  }

  function updateVisuals(patch) {
    data.visuals = { ...data.visuals, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("visuals", snapshot().visuals, { source: "visuals-runtime" }); } catch (err) { window.SynthXLogger?.error("State Visuals listener error", err); }
    });
  }

  function updateModulationMatrix(patch) {
    data.modulationMatrix = { ...data.modulationMatrix, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("modulationMatrix", snapshot().modulationMatrix, { source: "modulation-matrix-runtime" }); } catch (err) { window.SynthXLogger?.error("State Modulation Matrix listener error", err); }
    });
  }

  function updateTuning(patch) {
    data.tuning = { ...data.tuning, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("tuning", snapshot().tuning, { source: "tuning-runtime" }); } catch (err) { window.SynthXLogger?.error("State Tuning listener error", err); }
    });
  }

  function updateMidiClock(patch) {
    data.midiClock = { ...data.midiClock, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("midiClock", snapshot().midiClock, { source: "midi-clock-runtime" }); } catch (err) { window.SynthXLogger?.error("State MIDI Clock listener error", err); }
    });
  }

  function updateMidiLearn(patch) {
    data.midiLearn = { ...data.midiLearn, ...(patch || {}) };
    listeners.forEach((fn) => {
      try { fn("midiLearn", snapshot().midiLearn, { source: "midi-learn-runtime" }); } catch (err) { window.SynthXLogger?.error("State MIDI Learn listener error", err); }
    });
  }
  function snapshot() { return JSON.parse(JSON.stringify(data)); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  window.SynthXState = {
    data,
    coerceValue,
    setParameter,
    getParameter,
    updateMidi,
    updatePerformance,
    updateArpeggiator,
    updateSequencer,
    updateMotion,
    updateVisuals,
    updateModulationMatrix,
    updateTuning,
    updateMidiClock,
    updateMidiLearn,
    snapshot,
    subscribe
  };
})();
