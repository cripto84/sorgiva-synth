(function () {
  "use strict";

  const VERSION = "0.26.7r2-public-alpha-readiness-regression-baseline";
  const DISPLAY_VERSION = "v0.26.7r2";
  const PROJECT_NAME = "Sorgiva Synth";
  const LEGACY_PROJECT_NAME = "SynthX Rebuild";

  const root = window.SorgivaSynth = window.SorgivaSynth || {};
  root.projectName = PROJECT_NAME;
  root.displayVersion = DISPLAY_VERSION;
  root.appVersion = VERSION;
  root.version = VERSION;
  root.legacyProjectName = LEGACY_PROJECT_NAME;
  root.modules = root.modules || {};
  root.compatibility = root.compatibility || {};
  root.compatibility.legacySynthXAliases = true;
  root.compatibility.legacyStorageKeysPreserved = true;
  root.compatibility.sorgivaStoragePrimary = true;
  root.compatibility.legacyStorageFallback = true;
  root.compatibility.legacyStorageMirroring = true;
  root.compatibility.legacyMetadataFieldsPreserved = ["synthxVersion"];
  root.compatibility.newMetadataFields = ["sorgivaVersion", "sorgivaSynthVersion"];
  root.compatibility.note = "Sorgiva Synth is the public/runtime namespace. Legacy SynthX globals and localStorage keys remain accepted for non-destructive compatibility.";

  const EXPORT_FORMATS = Object.freeze({
    preset: {
      format: "sorgiva-synth-preset",
      schema: "sorgiva-synth-preset-v1",
      formatVersion: "1.0",
      legacyFormats: ["synthx-preset", "synthx-rebuild-preset"],
      legacyTypes: ["user_patch", "factory_preset", "user_preset"]
    },
    userBank: {
      format: "sorgiva-synth-user-bank",
      schema: "sorgiva-synth-user-bank-v1",
      formatVersion: "1.0",
      legacyFormats: ["synthx-user-bank", "synthx-rebuild-user-bank"],
      legacyTypes: ["synthx_user_preset_bank"]
    },
    arpPreset: {
      format: "sorgiva-synth-arp-preset",
      schema: "sorgiva-synth-arp-behavior-v1",
      formatVersion: "1.0",
      legacyFormats: ["synthx-arp-preset"],
      legacySchemas: ["synthx-arp-behavior-v1"]
    },
    sequencerPattern: {
      format: "sorgiva-synth-sequencer-pattern",
      schema: "sorgiva-synth-step-pattern-v1",
      formatVersion: "1.2",
      legacyFormats: ["synthx-pattern", "synthx-step-pattern"],
      legacyTypes: ["SynthX Pattern Preset"]
    },
    midiLearn: {
      format: "sorgiva-synth-midi-learn-mappings",
      schema: "sorgiva-synth-midi-learn-mappings-v1",
      formatVersion: "1.0",
      legacyFormats: ["synthx-midi-learn-mappings"],
      legacyTypes: ["synthx_midi_learn_mappings"]
    }
  });

  const STORAGE_KEYS = Object.freeze({
    localPatch: {
      key: "sorgivaSynth.localPatch.v1",
      legacy: [
        "synthx.rebuild.localPatch.v0.10.0",
        "synthx.rebuild.localPreset.v0.9.2",
        "synthx.rebuild.localPreset.v0.9.1",
        "synthx.rebuild.localPreset.v0.9.0"
      ]
    },
    userPresetBank: {
      key: "sorgivaSynth.userPresetBank.v1",
      legacy: ["synthx.rebuild.userPresetBank.v0.10.0"]
    },
    presetFavorites: {
      key: "sorgivaSynth.presetFavorites.v1",
      legacy: ["synthx.rebuild.presetFavorites.v0.10.0"]
    },
    userArpPreset: {
      key: "sorgivaSynth.userArpPreset.v1",
      legacy: ["synthx.v0.23.3.userArpPreset"]
    },
    userSequencerPattern: {
      key: "sorgivaSynth.userSequencerPattern.v1",
      legacy: ["synthx.v0.23.2.userPattern"]
    },
    midiLearnMappings: {
      key: "sorgivaSynth.midiLearnMappings.v1",
      legacy: [
        "synthx.rebuild.midiLearnMappings.v0.14.1",
        "synthx.rebuild.midiLearnMappings.v0.14.0"
      ]
    }
  });

  function getStorageDescriptor(name) {
    const descriptor = STORAGE_KEYS[name];
    if (!descriptor) return null;
    return { key: descriptor.key, legacy: Array.from(descriptor.legacy || []) };
  }

  function storageAvailable() {
    try {
      if (!window.localStorage) return false;
      const testKey = "sorgivaSynth.storage.compat.test";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readStorage(name, options) {
    const descriptor = getStorageDescriptor(name);
    if (!descriptor || !storageAvailable()) return null;
    const keys = [descriptor.key, ...descriptor.legacy];
    for (const key of keys) {
      try {
        const value = window.localStorage.getItem(key);
        if (value !== null && value !== undefined) {
          const legacy = key !== descriptor.key;
          if (legacy && options?.migrate !== false) {
            try { window.localStorage.setItem(descriptor.key, value); } catch (_) {}
          }
          return { value, key, primaryKey: descriptor.key, legacy };
        }
      } catch (_) {}
    }
    return null;
  }

  function writeStorage(name, value, options) {
    const descriptor = getStorageDescriptor(name);
    if (!descriptor || !storageAvailable()) return false;
    try {
      window.localStorage.setItem(descriptor.key, value);
      if (options?.mirrorLegacy !== false && descriptor.legacy?.length) {
        try { window.localStorage.setItem(descriptor.legacy[0], value); } catch (_) {}
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeStorage(name, options) {
    const descriptor = getStorageDescriptor(name);
    if (!descriptor || !storageAvailable()) return false;
    const keys = options?.includeLegacy === false ? [descriptor.key] : [descriptor.key, ...descriptor.legacy];
    let ok = true;
    keys.forEach((key) => {
      try { window.localStorage.removeItem(key); }
      catch (_) { ok = false; }
    });
    return ok;
  }

  function cleanMetadataObject(source) {
    const out = {};
    Object.entries(source || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value) && value.length === 0) return;
      out[key] = value;
    });
    return out;
  }

  function buildExportMetadata(kind, extra) {
    const options = extra || {};
    const info = EXPORT_FORMATS[kind] || {};
    const compatibility = cleanMetadataObject({
      legacyProjectName: LEGACY_PROJECT_NAME,
      legacySynthXImport: true,
      legacyFieldsRetained: ["synthxVersion"],
      legacyFormatsAccepted: info.legacyFormats,
      legacyTypesAccepted: info.legacyTypes,
      legacySchemasAccepted: info.legacySchemas
    });
    return cleanMetadataObject({
      project: PROJECT_NAME,
      publicName: PROJECT_NAME,
      format: options.format || info.format || `sorgiva-synth-${kind || "data"}`,
      schema: options.schema || info.schema,
      formatVersion: options.formatVersion || info.formatVersion || "1.0",
      appVersion: VERSION,
      sorgivaVersion: VERSION,
      sorgivaSynthVersion: VERSION,
      synthxVersion: VERSION,
      exportedBy: `${PROJECT_NAME} ${DISPLAY_VERSION} Public Alpha Readiness & Regression Baseline`,
      exportedAt: new Date().toISOString(),
      compatibility
    });
  }

  const identity = root.identity = Object.freeze({
    projectName: PROJECT_NAME,
    publicName: PROJECT_NAME,
    legacyProjectName: LEGACY_PROJECT_NAME,
    appVersion: VERSION,
    displayVersion: DISPLAY_VERSION,
    buildName: "Public Alpha Readiness & Regression Baseline",
    buildDate: "2026-07-10",
    previousBuild: "0.26.7r1-export-filename-version-alignment-hotfix",
    releaseLine: "desktop/core",
    renamePhase: "public-alpha-release-prep",
    audioEngineChange: false,
    audioEngineChangeScope: "No voice-synthesis oscillator/filter/FX topology change in v0.26.7r2; this build only hardens Preset Morph startup, aligns release metadata and adds regression smoke tests",
    presetSoundChange: false,
    presetSoundChangeScope: "factory sound preset data unchanged; no timbral parameters, preset names or categories were modified",
    sequencerLengthRange: "3-32",
    sequencerNonBinaryLengths: true,
    advancedChordMotion: true,
    sequencerPatternFormatVersion: "1.2",
    sequencerPolymeterPatternPresets: 8,
    arpMotionRandomizer: true,
    arpMotionRandomizerProfiles: 9,
    midiLearnCoverageAudit: true,
    midiLearnTargetClassification: true,
    midiLearnCoverageExpansion: true,
    midiLearnUiReorganization: true,
    midiLearnUiFilters: ["group", "mode", "search"],
    midiLearnModeBadges: true,
    midiLearnHardwareRegressionPrep: true,
    midiHardwareRegressionBaselinePassed: true,
    midiHardwareRegressionBaselineDate: "2026-07-09",
    midiHardwareRegressionBaselineScope: ["note-on/off", "velocity", "mod-wheel", "responsive-input-no-perceived-lag"],
    exportFilenameVersionAlignmentR1Hotfix: true,
    publicAlphaReadinessR2: true,
    presetMorphEmptySlotStartupGuard: true,
    automatedSmokeTestBaseline: true,
    releaseRootCleanupR2: true,
    midiLearnModeHandlers: ["continuous", "toggle", "selector", "trigger"],
    midiLearnCurrentTargetCount: 229,
    midiLearnCurrentTargetModes: { continuous: 106, toggle: 48, selector: 71, trigger: 4 },
    midiLearnMaxMappings: 64,
    arpMotionRandomizerScopes: ["full", "timing", "motion", "mode_octave", "options"],
    factoryPresetParameterNormalization: true,
    factoryRawParameterExportNormalization: true,
    presetCountChange: false,
    sequencerPatternPresetCount: 72,
    sequencerPatternPresetLegacyCount: 6,
    soundRandomizerQaMusicalHardening: true,
    soundRandomizerProfileAwareGuardrails: true,
    compatibilityMode: "sorgiva-public-alpha-release-prep-legacy-synthx-compatible",
    exportImportFormatMigration: true,
    localStorageUserDataMigration: true,
    residualBrandingCleanupQa: true,
    publicAlphaQaCandidate: true,
    versionDisplayQaMetadataHotfix: true,
    factoryRawParameterExportNormalizationHotfix: true,
    docsRoadmapMetadataAlignmentHotfix: true,
    browserFocusFxRecoveryHotfix: true,
    metadataDocsRuntimeLabelAlignmentHotfix: true,
    runtimeReadyLogAlignmentHotfix: true,
    exportFilenameVersionSuffixAlignmentHotfix: true,
    sineNoiseReleaseDeClickHotfix: true,
    finalQaMetadataAlignmentHotfix: true,
    manifestStaticMetricsAlignmentHotfix: true,
    presetMorphLiveVoiceHotfix: true,
    presetMorphValidationAlignmentHotfix: true,
    globalFxModMatrixLfoRefreshHotfix: true,
    exportFilenameMetadataAlignmentHotfix: true,
    finalAlignmentHotfix: true,
    uiTextAlignmentHotfix: true,
    manualBrowserRegressionPrep: true,
    staticRegressionChecksPassed: true,
    manualAudioBrowserTestRequired: true,
    hardwareMidiTestRequiredIfAvailable: false,
    additionalHardwareMidiCoverageRecommended: true,
    midiUsbInputAutodetectHotfix: true,
    midiAllInputsMode: true,
    midiPortAwareNoteTracking: true,
    fmLight70RangeHotfix: true,
    fmAmountMax: 0.70,
    fmOldRangeCurvePreserved: true,
    exportFilenameAlignmentHotfix: true,
    presetReadmeLabelAlignmentHotfix: true,
    unison12RangeHotfix: true,
    unisonVoicesMax: 12,
    unisonCpuLayerLimitMax: 12,
    unison12RandomizerMetadataAlignmentHotfix: true,
    randomizerUnisonGenerationMax: 12,
    randomizerVersionLabelAlignmentHotfix: true,
    nonBinarySequencerLengths: true,
    sequencerPresetRoundtripHotfix: true,
    stepChordsEngineFoundation: true,
    stepChordPresets: ["off", "octave", "power5", "major", "minor", "sus2", "sus4", "dim", "aug", "maj7", "min7", "dom7", "custom"],
    stepChordMaxNotes: 4,
    stepChordLegacyDefault: "off",
    stepChordsUiPatternPersistence: true,
    stepChordStepBadges: true,
    stepPatternFormatVersion: "1.2",
    stepPatternChordSummaryExport: true,
    stepChordsBehaviorModified: false,
    stepChordsRegressionSafetyQaHotfix: true,
    advancedChordMotionParamRoutingHotfix: true,
    sequencerRandomizerAdvanced: true,
    sequencerPatternMusicalQaCorrection: true,
    soundRandomizerCoverageAlignment: true,
    soundRandomizerProfiles: ["safe", "bass", "lead", "pad", "digital", "ambient", "industrial", "percussive", "wild_safe"],
    soundRandomizerScopes: ["osc", "filters", "advanced", "fx", "envelope", "modmatrix", "performance", "all"],
    soundRandomizerNewCoverage: ["lfo_per_osc_targets", "saturation_voicing_pre_hz", "saturation_dc_block_hz", "performance_mode", "performance_glide", "performance_key_velocity", "performance_velocity_curve"],
    sequencerPatternCorrectedIds: ["seqk_acid_tie_slide_16", "seqk_bass_dark_walk_16", "seqk_chord_gate_stack_24", "seqk_chord_inversion_walk_16", "seqk_ambient_reverse_breath_16", "seqk_minimal_odd_space_11", "seqk_cinematic_custom_tension_12", "seqk_cinematic_finale_32", "seqk_chip_miniboss_16"],
    sequencerRandomizerProfiles: ["safe", "bassline", "acid", "berlin", "chord_pulse", "ambient", "industrial", "odd_meter", "chiptune", "minimal", "cinematic", "chaos_safe", "performance_test"],
    sequencerRandomizerScopes: ["full", "notes", "rhythm", "chords", "velocity_gate"],
    stepChordsSafetySelfTest: true,
    stepChordsGeneratedNoteInvariantGuard: true,
    coreVoiceSynthesisModified: false
  });

  if (!window.SynthX) window.SynthX = root;
  window.SorgivaSynthIdentity = identity;
  window.SynthXIdentity = identity; // legacy compatibility alias.

  const moduleAliases = Object.freeze([
    ["Logger", "SynthXLogger", "SorgivaSynthLogger"],
    ["State", "SynthXState", "SorgivaSynthState"],
    ["AudioConfig", "SynthXAudioConfig", "SorgivaSynthAudioConfig"],
    ["AudioDsp", "SynthXAudioDsp", "SorgivaSynthAudioDsp"],
    ["Audio", "SynthXAudio", "SorgivaSynthAudio"],
    ["ModulationMatrix", "SynthXModulationMatrix", "SorgivaSynthModulationMatrix"],
    ["Motion", "SynthXMotion", "SorgivaSynthMotion"],
    ["Arpeggiator", "SynthXArpeggiator", "SorgivaSynthArpeggiator"],
    ["Sequencer", "SynthXSequencer", "SorgivaSynthSequencer"],
    ["Oscilloscope", "SynthXOscilloscope", "SorgivaSynthOscilloscope"],
    ["Spectroscope", "SynthXSpectroscope", "SorgivaSynthSpectroscope"],
    ["Tabs", "SynthXTabs", "SorgivaSynthTabs"],
    ["Controls", "SynthXControls", "SorgivaSynthControls"],
    ["Keyboard", "SynthXKeyboard", "SorgivaSynthKeyboard"],
    ["PresetConstants", "SynthXPresetConstants", "SorgivaSynthPresetConstants"],
    ["FactoryPresets", "SynthXFactoryPresets", "SorgivaSynthFactoryPresets"],
    ["Presets", "SynthXPresets", "SorgivaSynthPresets"],
    ["Randomizer", "SynthXRandomizer", "SorgivaSynthRandomizer"],
    ["PresetMorph", "SynthXPresetMorph", "SorgivaSynthPresetMorph"],
    ["MidiClock", "SynthXMidiClock", "SorgivaSynthMidiClock"],
    ["MidiLearn", "SynthXMidiLearn", "SorgivaSynthMidiLearn"],
    ["Midi", "SynthXMidi", "SorgivaSynthMidi"]
  ]);

  function exposeModule(aliasName, api) {
    if (api === undefined) return api;
    root.modules[aliasName] = api;
    root[aliasName] = api;
    return api;
  }

  function installAlias(aliasName, legacyGlobal, modernGlobal) {
    let current = window[legacyGlobal] !== undefined ? window[legacyGlobal] : window[modernGlobal];
    const descriptor = {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (api) => {
        current = api;
        exposeModule(aliasName, api);
      }
    };
    try {
      Object.defineProperty(window, legacyGlobal, descriptor);
      Object.defineProperty(window, modernGlobal, descriptor);
      if (current !== undefined) exposeModule(aliasName, current);
    } catch (err) {
      // Fallback for very old browsers or locked globals: keep the legacy name and expose what is already present.
      if (current !== undefined) {
        window[legacyGlobal] = current;
        window[modernGlobal] = current;
        exposeModule(aliasName, current);
      }
    }
  }

  moduleAliases.forEach(([aliasName, legacyGlobal, modernGlobal]) => installAlias(aliasName, legacyGlobal, modernGlobal));

  root.getAppVersion = () => VERSION;
  root.getDisplayVersion = () => DISPLAY_VERSION;
  root.getIdentity = () => ({ ...identity });
  root.getLegacyAliasMap = () => moduleAliases.map(([aliasName, legacyGlobal, modernGlobal]) => ({ aliasName, legacyGlobal, modernGlobal }));
  root.getExportFormats = () => ({ ...EXPORT_FORMATS });
  root.getStorageDescriptor = getStorageDescriptor;
  root.getStorageKeys = () => JSON.parse(JSON.stringify(STORAGE_KEYS));
  root.storageKeys = STORAGE_KEYS;
  root.storageAvailable = storageAvailable;
  root.readStorage = readStorage;
  root.writeStorage = writeStorage;
  root.removeStorage = removeStorage;
  root.buildExportMetadata = buildExportMetadata;
  root.registerModule = (aliasName, api, legacyGlobal, modernGlobal) => {
    exposeModule(aliasName, api);
    if (legacyGlobal) window[legacyGlobal] = api;
    if (modernGlobal) window[modernGlobal] = api;
    return api;
  };
  root.syncLegacyGlobals = () => {
    moduleAliases.forEach(([aliasName, legacyGlobal, modernGlobal]) => {
      const api = window[legacyGlobal] || window[modernGlobal];
      if (api !== undefined) exposeModule(aliasName, api);
    });
    return root.modules;
  };
})();
