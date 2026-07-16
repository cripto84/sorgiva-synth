(function () {
  "use strict";

  // Sorgiva Synth preset constants. v0.26.6m uses Sorgiva localStorage keys as primary and keeps SynthX keys as non-destructive legacy fallback/mirror.
  // Shared preset constants kept serializable and framework-free.
  const PRESET_FORMAT_VERSION = "0.4";
  const PRESET_FORMAT_ID = "sorgiva-synth-preset";
  const PRESET_SCHEMA = "sorgiva-synth-preset-v1";
  const USER_BANK_FORMAT_ID = "sorgiva-synth-user-bank";
  const USER_BANK_SCHEMA = "sorgiva-synth-user-bank-v1";
  const LEGACY_PRESET_FORMAT_IDS = Object.freeze(["synthx-preset", "synthx-rebuild-preset"]);
  const LEGACY_PRESET_TYPES = Object.freeze(["user_patch", "factory_preset", "user_preset"]);
  const LEGACY_USER_BANK_TYPES = Object.freeze(["synthx_user_preset_bank"]);
  const STORAGE_KEYS = window.SorgivaSynth?.storageKeys || {};
  const LOCAL_PATCH_STORAGE_KEY = STORAGE_KEYS.localPatch?.key || "sorgivaSynth.localPatch.v1";
  const USER_BANK_STORAGE_KEY = STORAGE_KEYS.userPresetBank?.key || "sorgivaSynth.userPresetBank.v1";
  const FAVORITES_STORAGE_KEY = STORAGE_KEYS.presetFavorites?.key || "sorgivaSynth.presetFavorites.v1";
  const LEGACY_LOCAL_PATCH_STORAGE_KEYS = STORAGE_KEYS.localPatch?.legacy || ["synthx.rebuild.localPatch.v0.10.0", "synthx.rebuild.localPreset.v0.9.2", "synthx.rebuild.localPreset.v0.9.1", "synthx.rebuild.localPreset.v0.9.0"];
  const LEGACY_USER_BANK_STORAGE_KEYS = STORAGE_KEYS.userPresetBank?.legacy || ["synthx.rebuild.userPresetBank.v0.10.0"];
  const LEGACY_FAVORITES_STORAGE_KEYS = STORAGE_KEYS.presetFavorites?.legacy || ["synthx.rebuild.presetFavorites.v0.10.0"];
  // IDs that exist in the UI but must never be captured or applied as sound-preset parameters.
  // v0.26.2a keeps preset loading restricted to sound/performance-musical state and legacy-safe data; repository licensing metadata is not part of patches; metadata/footer and patch-integrity hotfix only.
  const RUNTIME_PRESET_IDS = new Set([
    // Visualizers are user/runtime monitoring preferences, not part of a patch timbre.
    "scope-enabled",
    "spectrum-enabled",
    // Historical/metadata keys that appeared inside old/factory parameter blocks.
    "category",
    "originalCategory",
    // MIDI channel/filter state is runtime performance routing, not a patch sound parameter.
    "midi-channel-filter-enabled",
    "midi-channel-filter-channel"
  ]);

  const EXCLUDED_IDS = new Set([
    "preset-name", "preset-file", "preset-json-preview",
    "factory-category", "factory-search", "factory-sort", "factory-preset", "factory-preset-info", "factory-count-pill", "factory-favorites-only", "factory-reset-filters",
    "user-preset-name", "user-preset-category", "user-preset-description",
    "user-category-filter", "user-search", "user-sort", "user-count-pill", "user-favorites-only", "user-preset-list", "user-preset-info", "user-import-bank-file", "user-reset-bank", "user-reset-filters",
    "randomizer-scope", "randomizer-amount", "randomizer-amount-val", "randomizer-apply", "randomizer-undo", "randomizer-status",
    ...RUNTIME_PRESET_IDS
  ]);
  const PERFORMANCE_BUTTONS = [
    { id: "toggleVelocity", parameterId: "performance.velocityEnabled", label: "Velocity" },
    { id: "toggleSustain", parameterId: "performance.sustainEnabled", label: "Sustain" }
  ];


  // v0.18.7: nuova tassonomia factory preparatoria.
  // Gli ID sono anche le etichette utente principali: mantenerli stabili per browser, preset e documentazione.
  const FACTORY_CATEGORY_TAXONOMY = [
    { id: "Bass", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Bassi puliti e fondamentali." },
    { id: "Dirty Bass", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Bassi saturi, ruvidi o industriali." },
    { id: "Acid / Resonant", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Suoni acidi, risonanti e filtrati." },
    { id: "Filter Bass", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Bassi centrati sul movimento dei filtri." },
    { id: "Lead", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Lead monofonici o polifonici da synth." },
    { id: "Resonator Lead", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Lead con Advanced Filter/Resonator in evidenza." },
    { id: "Pad", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Pad sintetici larghi o morbidi." },
    { id: "Phaser / Ensemble Pad", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Pad con chorus, ensemble, phaser o movimento stereo." },
    { id: "Pluck", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Pluck corti, ritmici o percussivi." },
    { id: "Arp / Sequence Ready", group: "Core Synth", lot: "Lot 1", targetMin: 10, description: "Preset già adatti ad arpeggiatore o step sequencer." },
    { id: "Guitar-like / Synth Guitars", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Chitarre sintetiche o texture ispirate alla chitarra, senza promettere realismo da sampler." },
    { id: "Keys / Electric Piano-like", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Tasti, electric piano-like e colori keyboard sintetici." },
    { id: "Hammond-like / Organ Color", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Organi synth e colori Hammond-like." },
    { id: "Strings / Ensemble", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Archi sintetici, ensemble e string pad." },
    { id: "Brass / Horn-like", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Brass sintetici, horn-like e stab." },
    { id: "Woodwinds / Flutes / Reed-like", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Fiati non-brass: flauti, reed, clarinet-like, oboe-like e pipe synth." },
    { id: "Bells / Metallic", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Campane, metalli, vetro e percussioni tonali." },
    { id: "Percussive / Drums", group: "Instrument-like", lot: "Lot 2", targetMin: 10, description: "Hit percussivi, drums sintetici e transienti." },
    { id: "Formant / Vowel", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Formanti, vocali sintetiche e timbri quasi-vocali." },
    { id: "Comb Metallic", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Comb filter, metalli risonanti e timbri taglienti." },
    { id: "Dark Ambient", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Pad/scenari cupi e ambientali." },
    { id: "Industrial Drone", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Drone industriali, bassi statici e texture pesanti." },
    { id: "Sci-Fi Sweep", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Sweep, riser, laser e movimento fantascientifico." },
    { id: "FX-heavy Cinematic", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Preset cinematografici dove FX e spazio sono parte del suono." },
    { id: "Experimental / Noise Texture", group: "Cinematic Experimental", lot: "Lot 3", targetMin: 10, description: "Rumore, texture sperimentali e suoni non convenzionali." }
  ];

  // Mappa di compatibilità: i vecchi preset factory mantengono il loro campo category originale,
  // ma il browser può già filtrarli nella nuova tassonomia senza riscrivere i suoni.
  const LEGACY_FACTORY_CATEGORY_MAP = {
    Init: "Init",
    Bass: "Bass",
    Lead: "Lead",
    Pad: "Pad",
    Pluck: "Pluck",
    Arp: "Arp / Sequence Ready",
    Organ: "Hammond-like / Organ Color",
    Keys: "Keys / Electric Piano-like",
    Bell: "Bells / Metallic",
    Brass: "Brass / Horn-like",
    Strings: "Strings / Ensemble",
    Choir: "Formant / Vowel",
    Drone: "Industrial Drone",
    Percussion: "Percussive / Drums",
    FX: "FX-heavy Cinematic",
    Experimental: "Experimental / Noise Texture"
  };


  window.SynthXPresetConstants = {
    PRESET_FORMAT_VERSION,
    PRESET_FORMAT_ID,
    PRESET_SCHEMA,
    USER_BANK_FORMAT_ID,
    USER_BANK_SCHEMA,
    LEGACY_PRESET_FORMAT_IDS,
    LEGACY_PRESET_TYPES,
    LEGACY_USER_BANK_TYPES,
    LOCAL_PATCH_STORAGE_KEY,
    USER_BANK_STORAGE_KEY,
    FAVORITES_STORAGE_KEY,
    LEGACY_LOCAL_PATCH_STORAGE_KEYS,
    LEGACY_USER_BANK_STORAGE_KEYS,
    LEGACY_FAVORITES_STORAGE_KEYS,
    EXCLUDED_IDS,
    RUNTIME_PRESET_IDS,
    PERFORMANCE_BUTTONS,
    FACTORY_CATEGORY_TAXONOMY,
    LEGACY_FACTORY_CATEGORY_MAP
  };
})();
