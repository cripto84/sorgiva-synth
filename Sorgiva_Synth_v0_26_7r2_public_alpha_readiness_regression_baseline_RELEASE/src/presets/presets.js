(function () {
  "use strict";

  const PRESET_CONSTANTS = window.SynthXPresetConstants || {};
  const PRESET_FORMAT_VERSION = PRESET_CONSTANTS.PRESET_FORMAT_VERSION || "0.4";
  const PRESET_FORMAT_ID = PRESET_CONSTANTS.PRESET_FORMAT_ID || "sorgiva-synth-preset";
  const PRESET_SCHEMA = PRESET_CONSTANTS.PRESET_SCHEMA || "sorgiva-synth-preset-v1";
  const USER_BANK_FORMAT_ID = PRESET_CONSTANTS.USER_BANK_FORMAT_ID || "sorgiva-synth-user-bank";
  const USER_BANK_SCHEMA = PRESET_CONSTANTS.USER_BANK_SCHEMA || "sorgiva-synth-user-bank-v1";
  const LEGACY_USER_BANK_TYPES = PRESET_CONSTANTS.LEGACY_USER_BANK_TYPES || ["synthx_user_preset_bank"];
  const APP_VERSION = window.SorgivaSynth?.appVersion || window.SynthXState?.data?.appVersion || "0.26.7r2-public-alpha-readiness-regression-baseline";
  const EXPORT_BUILD_LABEL = "Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline";
  const LOCAL_PATCH_STORAGE_KEY = PRESET_CONSTANTS.LOCAL_PATCH_STORAGE_KEY || "sorgivaSynth.localPatch.v1";
  const USER_BANK_STORAGE_KEY = PRESET_CONSTANTS.USER_BANK_STORAGE_KEY || "sorgivaSynth.userPresetBank.v1";
  const FAVORITES_STORAGE_KEY = PRESET_CONSTANTS.FAVORITES_STORAGE_KEY || "sorgivaSynth.presetFavorites.v1";
  const LEGACY_LOCAL_PATCH_STORAGE_KEYS = PRESET_CONSTANTS.LEGACY_LOCAL_PATCH_STORAGE_KEYS || ["synthx.rebuild.localPatch.v0.10.0", "synthx.rebuild.localPreset.v0.9.2", "synthx.rebuild.localPreset.v0.9.1", "synthx.rebuild.localPreset.v0.9.0"];
  const LEGACY_USER_BANK_STORAGE_KEYS = PRESET_CONSTANTS.LEGACY_USER_BANK_STORAGE_KEYS || ["synthx.rebuild.userPresetBank.v0.10.0"];
  const LEGACY_FAVORITES_STORAGE_KEYS = PRESET_CONSTANTS.LEGACY_FAVORITES_STORAGE_KEYS || ["synthx.rebuild.presetFavorites.v0.10.0"];
  const EXCLUDED_IDS = PRESET_CONSTANTS.EXCLUDED_IDS || new Set();
  const RUNTIME_PRESET_IDS = PRESET_CONSTANTS.RUNTIME_PRESET_IDS || new Set();
  const PERFORMANCE_BUTTONS = PRESET_CONSTANTS.PERFORMANCE_BUTTONS || [];
  const FACTORY_CATEGORY_TAXONOMY = Array.isArray(PRESET_CONSTANTS.FACTORY_CATEGORY_TAXONOMY) ? PRESET_CONSTANTS.FACTORY_CATEGORY_TAXONOMY : [];
  const LEGACY_FACTORY_CATEGORY_MAP = PRESET_CONSTANTS.LEGACY_FACTORY_CATEGORY_MAP || {};
  const FACTORY_PRESETS = Array.isArray(window.SynthXFactoryPresets) ? window.SynthXFactoryPresets : [];
  const RUNTIME_VISUAL_PRESET_IDS = new Set(["scope-enabled", "spectrum-enabled"]); // compatibility alias for v0.25.16a reports
  let USER_BANK = [];
  let FAVORITES = { factory: {}, user: {} };
  const AB_SLOTS = { a: null, b: null };



  function nowIso() { return new Date().toISOString(); }

  function exportMetadata(kind, extra) {
    if (window.SorgivaSynth?.buildExportMetadata) return window.SorgivaSynth.buildExportMetadata(kind, extra || {});
    return {
      project: "Sorgiva Synth",
      publicName: "Sorgiva Synth",
      format: extra?.format || (kind === "userBank" ? USER_BANK_FORMAT_ID : PRESET_FORMAT_ID),
      schema: extra?.schema || (kind === "userBank" ? USER_BANK_SCHEMA : PRESET_SCHEMA),
      formatVersion: extra?.formatVersion || "1.0",
      appVersion: APP_VERSION,
      sorgivaVersion: APP_VERSION,
      sorgivaSynthVersion: APP_VERSION,
      synthxVersion: APP_VERSION,
      exportedBy: EXPORT_BUILD_LABEL,
      exportedAt: nowIso(),
      compatibility: {
        legacyProjectName: "SynthX Rebuild",
        legacySynthXImport: true,
        legacyFieldsRetained: ["synthxVersion"]
      }
    };
  }

  function slugifyName(name) {
    const clean = String(name || "Sorgiva_Synth_Preset")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return clean || "Sorgiva_Synth_Preset";
  }

  function getPresetName() {
    return document.getElementById("preset-name")?.value?.trim() || "Sorgiva Synth Init Patch";
  }

  function setStatus(message, kind) {
    const status = document.getElementById("preset-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind || "info";
  }

  function isPresetUiElement(element) {
    if (!element || !element.id) return true;
    if (EXCLUDED_IDS.has(element.id)) return true;
    if (element.type === "file") return true;
    if (element.dataset?.presetUi === "true") return true;
    if (element.dataset?.midiUi === "true") return true;
    return false;
  }

  function isRuntimePresetParameterId(id) {
    const clean = String(id || "").trim();
    if (!clean) return true;
    if (RUNTIME_PRESET_IDS.has(clean) || RUNTIME_VISUAL_PRESET_IDS.has(clean)) return true;
    // All MIDI device/clock/learn/channel monitor settings are runtime routing/UI, not patch timbre.
    if (clean === "midi" || clean.startsWith("midi-")) return true;
    return false;
  }

  function filterPresetParameters(parameters, options) {
    const source = parameters && typeof parameters === "object" && !Array.isArray(parameters) ? parameters : {};
    const clean = {};
    let removedRuntime = 0;
    Object.entries(source).forEach(([key, value]) => {
      if (isRuntimePresetParameterId(key)) { removedRuntime += 1; return; }
      clean[key] = value;
    });
    if (options?.returnStats) return { parameters: clean, removedRuntime };
    return clean;
  }

  function normalizePresetParametersForExport(parameters, options) {
    const filtered = filterPresetParameters(parameters, { returnStats: Boolean(options?.returnStats) });
    const source = options?.returnStats ? filtered.parameters : filtered;
    const clean = {};
    let normalized = 0;
    Object.entries(source || {}).forEach(([key, value]) => {
      const next = sanitizePresetControlValue(key, value);
      if (next !== value) normalized += 1;
      clean[key] = next;
    });
    if (options?.returnStats) return { parameters: clean, removedRuntime: filtered.removedRuntime || 0, normalized };
    return clean;
  }

  function getSoundControls() {
    return Array.from(document.querySelectorAll("input[id], select[id]"))
      .filter((element) => !isPresetUiElement(element));
  }

  function readControlValue(element) {
    if (element.type === "checkbox") return Boolean(element.checked);
    if (element.type === "range" || element.type === "number") return Number(element.value);
    return element.value;
  }

  function getTopbarParameter(buttonId, fallback) {
    const button = document.getElementById(buttonId);
    if (!button) return fallback;
    return button.getAttribute("aria-pressed") === "true";
  }

  function getCurrentMasterTuningA4() {
    const helper = window.SynthXAudioDsp?.clampMasterTuningA4;
    const raw = document.getElementById("master-tuning-a4")?.value ?? 440;
    if (typeof helper === "function") return helper(raw);
    const n = Number(raw);
    if (!Number.isFinite(n)) return 440;
    return Math.min(480, Math.max(400, n));
  }

  function clampPresetTuningA4(value) {
    const helper = window.SynthXAudioDsp?.clampMasterTuningA4;
    if (typeof helper === "function") return helper(value);
    const n = Number(value);
    if (!Number.isFinite(n)) return 440;
    return Math.min(480, Math.max(400, n));
  }

  function collectParameters() {
    const parameters = {};
    getSoundControls().forEach((element) => { parameters[element.id] = readControlValue(element); });
    PERFORMANCE_BUTTONS.forEach((item) => {
      parameters[item.parameterId] = getTopbarParameter(item.id, true);
    });
    return parameters;
  }

  function buildPresetObject() {
    return {
      ...exportMetadata("preset", { format: PRESET_FORMAT_ID, schema: PRESET_SCHEMA, formatVersion: PRESET_FORMAT_VERSION }),
      presetFormatVersion: PRESET_FORMAT_VERSION,
      name: getPresetName(),
      createdAt: nowIso(),
      generator: EXPORT_BUILD_LABEL,
      type: "sorgiva_synth_user_patch",
      legacyType: "user_patch",
      tuning: { a4Hz: getCurrentMasterTuningA4(), noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si" },
      modulationMatrix: window.SynthXModulationMatrix?.snapshotFromUi?.() || [],
      signalChain: "Input note -> Sequencer opzionale / Arpeggiatore opzionale con MIDI Clock runtime opzionale -> Voci con velocity curve opzionale, Osc Sync WebAudio-safe opzionale e Unison/Detune CPU-safe opzionale -> Filter Drive pre-filtro opzionale -> Filtri base -> Advanced Filter/Resonator opzionale -> Filter ADSR separato opzionale -> Modulation Matrix Basic opzionale -> Amp ADSR -> Drive/Saturation -> EQ -> Modulazione -> Delay -> Ambiente/Reverb -> Dynamics Safety -> Master; MIDI Clock runtime opzionale per Arp/Sequencer; Pitch Bend/Sustain/Channel Filter/Mod Wheel runtime non salvati nei preset; MIDI Learn hardening runtime separato per mapping CC; micro oscilloscopio/spettroscopio passivi sul monitor Safety/Master",
      parameters: collectParameters()
    };
  }

  function buildFactoryPresetObject(preset) {
    return {
      ...exportMetadata("preset", { format: PRESET_FORMAT_ID, schema: PRESET_SCHEMA, formatVersion: PRESET_FORMAT_VERSION }),
      presetFormatVersion: PRESET_FORMAT_VERSION,
      name: preset.name,
      createdAt: "2026-06-15T00:00:00.000Z",
      generator: EXPORT_BUILD_LABEL,
      type: "sorgiva_synth_factory_preset",
      legacyType: "factory_preset",
      factoryId: preset.id,
      category: preset.category,
      categoryCanonical: getFactoryCanonicalCategory(preset),
      taxonomy: {
        category: getFactoryCanonicalCategory(preset),
        originalCategory: preset.category || "",
        group: getFactoryTaxonomyEntry(getFactoryCanonicalCategory(preset))?.group || "",
        lot: getFactoryTaxonomyEntry(getFactoryCanonicalCategory(preset))?.lot || ""
      },
      description: preset.description,
      tips: preset.tips,
      role: preset.role || "Preset",
      character: preset.character || "",
      useCase: preset.useCase || "",
      intensity: preset.intensity || 1,
      tags: Array.isArray(preset.tags) ? preset.tags.slice(0, 12) : [],
      reviewFlags: Array.isArray(preset.reviewFlags) ? preset.reviewFlags.slice(0, 8) : [],
      qaStatus: preset.qaStatus || "",
      balanceNotes: preset.balanceNotes || "",
      balanceVersion: preset.balanceVersion || "",
      polishNotes: preset.polishNotes || "",
      libraryVersion: preset.libraryVersion || "0.8.3-polished-factory-presets",
      tuning: { a4Hz: clampPresetTuningA4(preset.parameters?.["master-tuning-a4"] ?? 440), noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si" },
      modulationMatrix: window.SynthXModulationMatrix?.normalizeMatrix?.(preset.modulationMatrix || []) || [],
      signalChain: "Input note -> Sequencer opzionale / Arpeggiatore opzionale con MIDI Clock runtime opzionale -> Voci con velocity curve opzionale, Osc Sync WebAudio-safe opzionale e Unison/Detune CPU-safe opzionale -> Filter Drive pre-filtro opzionale -> Filtri base -> Advanced Filter/Resonator opzionale -> Filter ADSR separato opzionale -> Modulation Matrix Basic opzionale -> Amp ADSR -> Drive/Saturation -> EQ -> Modulazione -> Delay -> Ambiente/Reverb -> Dynamics Safety -> Master; MIDI Clock runtime opzionale per Arp/Sequencer; Pitch Bend/Sustain/Channel Filter/Mod Wheel runtime non salvati nei preset; MIDI Learn hardening runtime separato per mapping CC; micro oscilloscopio/spettroscopio passivi sul monitor Safety/Master",
      parameters: normalizePresetParametersForExport(preset.parameters)
    };
  }



  function clampString(value, fallback, maxLength) {
    const text = String(value ?? fallback ?? "").trim();
    return text.slice(0, maxLength || 120) || String(fallback || "Untitled Sorgiva Synth Preset");
  }

  function nowCompactId() {
    return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hardenModMatrixParameterBlock(parameters) {
    if (!parameters || typeof parameters !== "object") return parameters;
    const helper = window.SynthXModulationMatrix;
    if (!helper?.controlIdsForSlot) return parameters;
    for (let index = 1; index <= 8; index += 1) {
      const ids = helper.controlIdsForSlot(index);
      const defaults = helper.defaultSlot ? helper.defaultSlot(index) : { source: "lfo1", destination: "vcf_cutoff", amount: 0 };
      const hasSource = Object.prototype.hasOwnProperty.call(parameters, ids.source);
      const hasDestination = Object.prototype.hasOwnProperty.call(parameters, ids.destination);
      const invalidSource = hasSource && helper.isValidSource && !helper.isValidSource(parameters[ids.source]);
      const invalidDestination = hasDestination && helper.isValidDestination && !helper.isValidDestination(parameters[ids.destination]);
      if (invalidSource) parameters[ids.source] = defaults.source;
      if (invalidDestination) parameters[ids.destination] = defaults.destination;
      if (invalidSource || invalidDestination) parameters[ids.enabled] = false;
      if (Object.prototype.hasOwnProperty.call(parameters, ids.amount)) parameters[ids.amount] = helper.normalizeAmount ? helper.normalizeAmount(parameters[ids.amount]) : clampPresetNumber(parameters[ids.amount], -1, 1, 0);
    }
    return parameters;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      if (char === ">") return "&gt;";
      if (char === "\"") return "&quot;";
      return "&#39;";
    });
  }

  function userConfirm(message) {
    if (typeof window.confirm !== "function") return true;
    return window.confirm(message);
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function includesSearch(haystack, needle) {
    const query = normalizeSearchText(needle);
    if (!query) return true;
    const text = normalizeSearchText(haystack);
    return query.split(" ").filter(Boolean).every((part) => text.includes(part));
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), "it", { sensitivity: "base", numeric: true });
  }

  function dateMs(value) {
    const n = Date.parse(String(value || ""));
    return Number.isFinite(n) ? n : 0;
  }

  function getFactoryTaxonomyIds() {
    return FACTORY_CATEGORY_TAXONOMY.map((item) => item.id).filter(Boolean);
  }

  function getFactoryLiveCategoryIds() {
    const ids = new Set(getFactoryTaxonomyIds());
    FACTORY_PRESETS.forEach((preset) => {
      [preset?.categoryCanonical, preset?.taxonomy?.category, preset?.category]
        .map((item) => String(item || "").trim())
        .filter((item) => item && item !== "Init" && item !== "all")
        .forEach((item) => ids.add(item));
    });
    return Array.from(ids);
  }

  function getFactoryTaxonomyEntry(category) {
    return FACTORY_CATEGORY_TAXONOMY.find((item) => item.id === category) || null;
  }

  function getFactoryCanonicalCategory(preset) {
    const explicit = String(preset?.categoryCanonical || preset?.taxonomy?.category || "").trim();
    if (explicit) return explicit;
    const raw = String(preset?.category || "").trim();
    if (!raw) return "Experimental / Noise Texture";
    if (raw === "Init") return "Init";
    if (getFactoryTaxonomyIds().includes(raw)) return raw;
    return LEGACY_FACTORY_CATEGORY_MAP[raw] || raw;
  }

  function factoryCategoryMatches(preset, selectedCategory) {
    if (!selectedCategory || selectedCategory === "all") return true;
    const original = String(preset?.category || "").trim();
    const canonical = getFactoryCanonicalCategory(preset);
    return selectedCategory === canonical || selectedCategory === original;
  }

  function getFactoryCategoryDisplay(preset) {
    const original = String(preset?.category || "").trim() || "Uncategorized";
    const canonical = getFactoryCanonicalCategory(preset);
    if (!canonical || canonical === original) return original;
    return `${canonical} · legacy: ${original}`;
  }

  function getFactoryCategoryMeta(preset) {
    const canonical = getFactoryCanonicalCategory(preset);
    const entry = getFactoryTaxonomyEntry(canonical);
    if (!entry) return canonical;
    return `${entry.group} · ${entry.lot} · target ${entry.targetMin}+`;
  }

  function populateFactoryCategoryFilter() {
    const select = document.getElementById("factory-category");
    if (!select) return;
    const previous = select.value || "all";
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "Tutte";
    select.appendChild(all);
    const init = document.createElement("option");
    init.value = "Init";
    init.textContent = "Init / Utility";
    select.appendChild(init);
    const added = new Set(["all", "Init"]);
    FACTORY_CATEGORY_TAXONOMY.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.id;
      option.title = [item.group, item.lot, item.description].filter(Boolean).join(" · ");
      select.appendChild(option);
      added.add(item.id);
    });
    getFactoryLiveCategoryIds().forEach((category) => {
      if (added.has(category)) return;
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      option.title = "Categoria factory rilevata dai preset attivi e resa accessibile nel menu.";
      select.appendChild(option);
      added.add(category);
    });
    select.value = Array.from(select.options).some((opt) => opt.value === previous) ? previous : "all";
  }

  function populateUserCategorySuggestions() {
    const list = document.getElementById("user-category-suggestions");
    if (!list) return;
    const values = ["User", ...getFactoryLiveCategoryIds()];
    list.innerHTML = "";
    Array.from(new Set(values)).forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      list.appendChild(option);
    });
  }

  function getFactoryTags(preset) {
    const canonical = getFactoryCanonicalCategory(preset);
    const entry = getFactoryTaxonomyEntry(canonical);
    const tags = [canonical, entry?.group, entry?.lot, preset?.category, preset?.role, preset?.character, preset?.useCase]
      .concat(Array.isArray(preset?.tags) ? preset.tags : [])
      .filter(Boolean)
      .flatMap((item) => String(item).split(/[·,;]/g))
      .map((item) => item.trim())
      .filter(Boolean);
    if (Number(preset?.intensity) >= 4) tags.push("Intenso");
    if (Number(preset?.intensity) <= 2 && Number(preset?.intensity) > 0) tags.push("Prudente");
    return Array.from(new Set(tags)).slice(0, 10);
  }

  function getUserTags(preset) {
    const tags = [preset?.category, preset?.sourceFactoryId ? "Da factory" : "User"]
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (isFavorite("user", preset?.id) || preset?.favorite) tags.push("Preferito");
    return Array.from(new Set(tags)).slice(0, 6);
  }

  function tagHtml(tags) {
    const clean = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 10) : [];
    if (!clean.length) return "";
    return `<div class="preset-tags">${clean.map((tag) => `<span class="preset-tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
  }

  function updateCountPill(id, visible, total, label) {
    const pill = document.getElementById(id);
    if (pill) pill.textContent = `${label} ${visible}/${total}`;
  }

  function sortFactoryList(list, mode) {
    const sorted = list.slice();
    const sort = String(mode || "name");
    sorted.sort((a, b) => {
      if (sort === "category") return compareText(getFactoryCanonicalCategory(a), getFactoryCanonicalCategory(b)) || compareText(a.category, b.category) || compareText(a.name, b.name);
      if (sort === "role") return compareText(a.role, b.role) || compareText(a.name, b.name);
      if (sort === "intensity-desc") return (Number(b.intensity) || 0) - (Number(a.intensity) || 0) || compareText(a.name, b.name);
      if (sort === "intensity-asc") return (Number(a.intensity) || 0) - (Number(b.intensity) || 0) || compareText(a.name, b.name);
      if (sort === "favorite") {
        const af = isFavorite("factory", a.id) ? 1 : 0;
        const bf = isFavorite("factory", b.id) ? 1 : 0;
        return bf - af || compareText(getFactoryCanonicalCategory(a), getFactoryCanonicalCategory(b)) || compareText(a.name, b.name);
      }
      return compareText(a.name, b.name);
    });
    return sorted;
  }

  function sortUserList(list, mode) {
    const sorted = list.slice();
    const sort = String(mode || "name");
    sorted.sort((a, b) => {
      if (sort === "category") return compareText(a.category, b.category) || compareText(a.name, b.name);
      if (sort === "updated-desc") return dateMs(b.updatedAt) - dateMs(a.updatedAt) || compareText(a.name, b.name);
      if (sort === "created-desc") return dateMs(b.createdAt) - dateMs(a.createdAt) || compareText(a.name, b.name);
      if (sort === "favorite") {
        const af = isFavorite("user", a.id) || a.favorite ? 1 : 0;
        const bf = isFavorite("user", b.id) || b.favorite ? 1 : 0;
        return bf - af || compareText(a.name, b.name);
      }
      return compareText(a.name, b.name);
    });
    return sorted;
  }

  function checkLocalStorageAvailable() {
    try {
      const key = "sorgiva-storage-test";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      window.SynthXLogger?.warn("localStorage unavailable", err);
      return false;
    }
  }

  function readStorageText(primaryKey, legacyKeys) {
    try {
      const primary = localStorage.getItem(primaryKey);
      if (primary !== null && primary !== undefined) return { text: primary, key: primaryKey, legacy: false };
      for (const legacyKey of legacyKeys || []) {
        const legacyText = localStorage.getItem(legacyKey);
        if (legacyText !== null && legacyText !== undefined) {
          try { localStorage.setItem(primaryKey, legacyText); } catch (_) {}
          return { text: legacyText, key: legacyKey, legacy: true };
        }
      }
    } catch (err) {
      window.SynthXLogger?.warn("storage read failed", { primaryKey, err });
      throw err;
    }
    return { text: null, key: primaryKey, legacy: false };
  }

  function writeStorageText(primaryKey, text, legacyKeys) {
    localStorage.setItem(primaryKey, text);
    const mirrorKey = Array.isArray(legacyKeys) ? legacyKeys[0] : null;
    if (mirrorKey) {
      try { localStorage.setItem(mirrorKey, text); } catch (_) {}
    }
  }

  function removeStorageKeys(primaryKey, legacyKeys) {
    localStorage.removeItem(primaryKey);
    (legacyKeys || []).forEach((legacyKey) => {
      try { localStorage.removeItem(legacyKey); } catch (_) {}
    });
  }

  function makeUniqueId(existingIds) {
    let id = nowCompactId();
    while (existingIds.has(id)) id = nowCompactId();
    existingIds.add(id);
    return id;
  }

  function makeUniqueName(name, existingNames, suffix) {
    const base = clampString(name, "User Sorgiva Synth Preset", 80);
    const seen = new Set(Array.from(existingNames || []).map((item) => String(item).trim().toLowerCase()));
    if (!seen.has(base.toLowerCase())) {
      seen.add(base.toLowerCase());
      if (existingNames?.add) existingNames.add(base);
      return base;
    }
    const tag = suffix || "Copy";
    for (let index = 2; index < 1000; index += 1) {
      const candidate = clampString(`${base} ${tag} ${index}`, base, 80);
      if (!seen.has(candidate.toLowerCase())) {
        seen.add(candidate.toLowerCase());
        if (existingNames?.add) existingNames.add(candidate);
        return candidate;
      }
    }
    const fallback = clampString(`${base} ${nowCompactId()}`, base, 80);
    if (existingNames?.add) existingNames.add(fallback);
    return fallback;
  }

  function normalizeUserPresetList(list, options) {
    const source = Array.isArray(list) ? list : [];
    const opts = options || {};
    const existingIds = new Set(opts.existingIds || []);
    const existingNames = new Set(opts.existingNames || []);
    const presets = [];
    const errors = [];
    source.slice(0, opts.maxItems || 500).forEach((item, index) => {
      try {
        const raw = item && typeof item === "object" ? item : {};
        const wantedId = clampString(raw.id || "", "", 96).replace(/[^a-zA-Z0-9_.:-]/g, "_");
        const id = wantedId && !existingIds.has(wantedId) ? wantedId : makeUniqueId(existingIds);
        existingIds.add(id);
        const sanitized = sanitizePresetRecord({ ...raw, id }, "user_preset");
        sanitized.name = makeUniqueName(sanitized.name, existingNames, opts.nameSuffix || "Imported");
        sanitized.type = "user_preset";
        sanitized.updatedAt = sanitized.updatedAt || nowIso();
        presets.push(sanitized);
      } catch (err) {
        errors.push(`#${index + 1}: ${err.message}`);
      }
    });
    return { presets, errors, truncated: source.length > (opts.maxItems || 500) };
  }

  function sanitizeParameters(parameters) {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Preset senza parameters validi.");
    const clean = {};
    Object.entries(parameters).forEach(([key, value]) => {
      const id = String(key || "").trim();
      if (!id) return;
      if (isRuntimePresetParameterId(id)) return;
      if (typeof value === "number") clean[id] = Number.isFinite(value) ? value : 0;
      else if (typeof value === "string" || typeof value === "boolean") clean[id] = value;
      else if (value === null) clean[id] = null;
    });
    if (!Object.keys(clean).length) throw new Error("Preset senza parametri serializzabili.");
    return clean;
  }

  function sanitizePresetRecord(raw, fallbackType) {
    const normalized = normalizePresetObject(raw);
    const id = clampString(raw.id || nowCompactId(), nowCompactId(), 96).replace(/[^a-zA-Z0-9_.:-]/g, "_");
    const now = nowIso();
    return {
      id,
      ...exportMetadata("preset", { format: PRESET_FORMAT_ID, schema: PRESET_SCHEMA, formatVersion: PRESET_FORMAT_VERSION }),
      presetFormatVersion: PRESET_FORMAT_VERSION,
      legacyImportedFrom: raw.format || raw.type || raw.schema || "",
      synthxVersion: String(raw.sorgivaVersion || raw.sorgivaSynthVersion || raw.synthxVersion || APP_VERSION),
      name: clampString(normalized.name, "User Sorgiva Synth Preset", 80),
      category: clampString(raw.category || "User", "User", 80),
      categoryCanonical: raw.categoryCanonical ? clampString(raw.categoryCanonical, "", 80) : "",
      description: clampString(raw.description || "", "", 220),
      createdAt: String(raw.createdAt || now),
      updatedAt: String(raw.updatedAt || now),
      generator: String(raw.generator || EXPORT_BUILD_LABEL),
      type: String(raw.type || fallbackType || "user_preset"),
      favorite: Boolean(raw.favorite),
      sourceFactoryId: raw.sourceFactoryId ? String(raw.sourceFactoryId) : "",
      tuning: raw.tuning || { a4Hz: 440, noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si" },
      signalChain: raw.signalChain || "Sequencer opzionale / Arpeggiatore opzionale con MIDI Clock runtime opzionale -> Voci con velocity curve opzionale, Osc Sync WebAudio-safe opzionale e Unison/Detune CPU-safe opzionale -> Filter Drive pre-filtro opzionale -> Filtri base -> Advanced Filter/Resonator opzionale -> Filter ADSR separato opzionale -> Modulation Matrix Basic opzionale -> Amp ADSR -> Drive/Saturation -> EQ -> Modulazione -> Delay -> Ambiente/Reverb -> Dynamics Safety -> Master",
      modulationMatrix: window.SynthXModulationMatrix?.normalizeMatrix?.(raw.modulationMatrix || normalized.modulationMatrix || []) || [],
      parameters: sanitizeParameters(normalized.parameters)
    };
  }

  function loadFavoritesStore() {
    try {
      const stored = readStorageText(FAVORITES_STORAGE_KEY, LEGACY_FAVORITES_STORAGE_KEYS);
      const text = stored.text;
      if (text) {
        const parsed = JSON.parse(text);
        FAVORITES = {
          factory: parsed?.factory && typeof parsed.factory === "object" ? parsed.factory : {},
          user: parsed?.user && typeof parsed.user === "object" ? parsed.user : {}
        };
        if (stored.legacy) saveFavoritesStore();
      }
    } catch (err) {
      FAVORITES = { factory: {}, user: {} };
      window.SynthXLogger?.warn("favorites store unavailable", err);
    }
  }

  function saveFavoritesStore() {
    try { writeStorageText(FAVORITES_STORAGE_KEY, JSON.stringify(FAVORITES), LEGACY_FAVORITES_STORAGE_KEYS); }
    catch (err) { window.SynthXLogger?.warn("favorites save unavailable", err); }
  }

  function isFavorite(kind, id) {
    return Boolean(FAVORITES?.[kind]?.[id]);
  }

  function toggleFavorite(kind, id) {
    if (!id) return false;
    if (!FAVORITES[kind]) FAVORITES[kind] = {};
    const next = !FAVORITES[kind][id];
    if (next) FAVORITES[kind][id] = true;
    else delete FAVORITES[kind][id];
    if (kind === "user") {
      USER_BANK = USER_BANK.map((preset) => preset.id === id ? { ...preset, favorite: next, updatedAt: nowIso() } : preset);
      saveUserBank();
    }
    saveFavoritesStore();
    return next;
  }

  function pruneFavoritesStore() {
    const factoryIds = new Set(FACTORY_PRESETS.map((item) => item.id).filter(Boolean));
    const userIds = new Set(USER_BANK.map((item) => item.id).filter(Boolean));
    let changed = false;
    [
      ["factory", factoryIds],
      ["user", userIds]
    ].forEach(([kind, validIds]) => {
      const bucket = FAVORITES?.[kind] && typeof FAVORITES[kind] === "object" ? FAVORITES[kind] : {};
      const clean = {};
      Object.keys(bucket).forEach((id) => {
        if (validIds.has(id) && bucket[id]) clean[id] = true;
        else changed = true;
      });
      FAVORITES[kind] = clean;
    });
    if (changed) saveFavoritesStore();
  }

  function loadUserBank() {
    try {
      const stored = readStorageText(USER_BANK_STORAGE_KEY, LEGACY_USER_BANK_STORAGE_KEYS);
      const text = stored.text;
      if (!text) { USER_BANK = []; return; }
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.presets) ? parsed.presets : []);
      const result = normalizeUserPresetList(list, { maxItems: 500 });
      USER_BANK = result.presets;
      USER_BANK.forEach((item) => { if (item.favorite) FAVORITES.user[item.id] = true; });
      saveFavoritesStore();
      if (result.errors.length) setStatus(`User bank caricata con ${result.errors.length} preset ignorati perché non validi.`, "warn");
      if (stored.legacy) saveUserBank();
      if (result.truncated) setStatus("User bank caricata: limite prudente 500 preset applicato.", "warn");
    } catch (err) {
      USER_BANK = [];
      setStatus(`User bank non leggibile: ${err.message}`, "warn");
      window.SynthXLogger?.warn("user bank load error", err);
    }
  }

  function saveUserBank() {
    const payload = {
      ...exportMetadata("userBank", { format: USER_BANK_FORMAT_ID, schema: USER_BANK_SCHEMA, formatVersion: "1.0" }),
      type: "sorgiva_synth_user_preset_bank",
      legacyType: "synthx_user_preset_bank",
      bankFormatVersion: "1.0",
      count: USER_BANK.length,
      presets: USER_BANK.map((item) => ({ ...item, favorite: isFavorite("user", item.id) || Boolean(item.favorite) }))
    };
    try { writeStorageText(USER_BANK_STORAGE_KEY, JSON.stringify(payload), LEGACY_USER_BANK_STORAGE_KEYS); }
    catch (err) {
      setStatus(`User bank non salvabile localmente: ${err.message}`, "error");
      window.SynthXLogger?.warn("user bank save error", err);
    }
  }

  function getUserMetaFromForm() {
    return {
      name: clampString(document.getElementById("user-preset-name")?.value, getPresetName(), 80),
      category: clampString(document.getElementById("user-preset-category")?.value, "User", 80),
      description: clampString(document.getElementById("user-preset-description")?.value, "", 220)
    };
  }

  function setUserMetaForm(preset) {
    const name = document.getElementById("user-preset-name");
    const category = document.getElementById("user-preset-category");
    const description = document.getElementById("user-preset-description");
    if (name) name.value = preset?.name || "Mio preset Sorgiva Synth";
    if (category) category.value = preset?.category || "User";
    if (description) description.value = preset?.description || "";
  }

  function buildUserPresetFromCurrent(extra) {
    const meta = { ...getUserMetaFromForm(), ...(extra || {}) };
    const patch = buildPresetObject();
    return sanitizePresetRecord({
      ...patch,
      id: extra?.id || nowCompactId(),
      name: meta.name,
      category: meta.category,
      description: meta.description,
      createdAt: extra?.createdAt || nowIso(),
      updatedAt: nowIso(),
      type: "user_preset",
      favorite: Boolean(extra?.favorite),
      sourceFactoryId: extra?.sourceFactoryId || ""
    }, "user_preset");
  }

  function getSelectedUserPresetId() {
    return document.getElementById("user-preset-list")?.value || "";
  }

  function getSelectedUserPreset() {
    const id = getSelectedUserPresetId();
    return USER_BANK.find((item) => item.id === id) || null;
  }

  function getUserCategoryList() {
    return Array.from(new Set(USER_BANK.map((item) => item.category || "User"))).sort((a, b) => a.localeCompare(b));
  }

  function renderUserCategoryFilter() {
    const select = document.getElementById("user-category-filter");
    if (!select) return;
    const previous = select.value || "all";
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "Tutte";
    select.appendChild(all);
    getUserCategoryList().forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
    select.value = Array.from(select.options).some((opt) => opt.value === previous) ? previous : "all";
  }

  function getUserSearchText(item) {
    return [item.name, item.category, item.description, item.sourceFactoryId, getUserTags(item).join(" ")].join(" ");
  }

  function renderUserPresetList(preferredId) {
    renderUserCategoryFilter();
    const select = document.getElementById("user-preset-list");
    if (!select) return;
    const category = document.getElementById("user-category-filter")?.value || "all";
    const favoritesOnly = Boolean(document.getElementById("user-favorites-only")?.checked);
    const query = document.getElementById("user-search")?.value || "";
    const sortMode = document.getElementById("user-sort")?.value || "name";
    const previous = preferredId || select.value;
    const filtered = USER_BANK
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => !favoritesOnly || isFavorite("user", item.id) || item.favorite)
      .filter((item) => includesSearch(getUserSearchText(item), query));
    const list = sortUserList(filtered, sortMode);
    updateCountPill("user-count-pill", list.length, USER_BANK.length, "User");
    select.innerHTML = "";
    list.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      const fav = isFavorite("user", item.id) || item.favorite;
      option.textContent = `${fav ? "★ " : ""}${item.name} — ${item.category}`;
      option.title = [item.description, getUserTags(item).join(", ")].filter(Boolean).join(" · ");
      select.appendChild(option);
    });
    if (list.some((item) => item.id === previous)) select.value = previous;
    else if (list[0]) select.value = list[0].id;
    else select.value = "";
    updateUserPresetInfo();
  }

  function updateUserPresetInfo() {
    const preset = getSelectedUserPreset();
    const info = document.getElementById("user-preset-info");
    const favoriteButton = document.getElementById("user-favorite-toggle");
    if (!preset) {
      if (info) info.textContent = USER_BANK.length ? "Nessun preset utente visibile con i filtri correnti." : "Nessun preset utente salvato.";
      if (favoriteButton) favoriteButton.textContent = "☆ Preferito";
      return;
    }
    setUserMetaForm(preset);
    const fav = isFavorite("user", preset.id) || preset.favorite;
    if (favoriteButton) favoriteButton.textContent = `${fav ? "★" : "☆"} Preferito`;
    if (info) {
      const description = preset.description || "Nessuna descrizione.";
      const meta = `Creato: ${preset.createdAt || "n/d"} · Aggiornato: ${preset.updatedAt || "n/d"}${preset.sourceFactoryId ? ` · Origine factory: ${preset.sourceFactoryId}` : ""}`;
      info.innerHTML = `<strong>${escapeHtml(preset.name)}</strong> <span class="muted">(${escapeHtml(preset.category)})</span> ${fav ? "★" : ""}${tagHtml(getUserTags(preset))}<br>${escapeHtml(description)}<br><span class="preset-meta">${escapeHtml(meta)}</span>`;
    }
  }

  function resetUserBrowserFilters() {
    const category = document.getElementById("user-category-filter");
    const search = document.getElementById("user-search");
    const sort = document.getElementById("user-sort");
    const favorites = document.getElementById("user-favorites-only");
    if (category) category.value = "all";
    if (search) search.value = "";
    if (sort) sort.value = "name";
    if (favorites) favorites.checked = false;
    renderUserPresetList();
    setStatus("Filtri User Preset azzerati.", "ok");
  }

  function saveCurrentAsUser(extra) {
    const preset = buildUserPresetFromCurrent(extra || {});
    const existingNames = new Set(USER_BANK.map((item) => item.name));
    if (existingNames.has(preset.name)) {
      const renamed = makeUniqueName(preset.name, existingNames, "Copy");
      if (!userConfirm(`Esiste già un preset utente chiamato "${preset.name}". Salvarlo come "${renamed}"?`)) {
        setStatus("Salvataggio annullato: nome preset duplicato.", "warn");
        return null;
      }
      preset.name = renamed;
    }
    USER_BANK.push(preset);
    if (preset.favorite) FAVORITES.user[preset.id] = true;
    saveUserBank();
    saveFavoritesStore();
    renderUserPresetList(preset.id);
    updatePreview(preset);
    setStatus(`Preset utente salvato: ${preset.name}`, "ok");
    return preset;
  }

  function saveFactoryCopyAsUser() {
    const factory = getSelectedFactoryPreset();
    if (!factory) { setStatus("Nessun factory preset selezionato.", "warn"); return; }
    setUserMetaForm({
      name: `${factory.name} Copy`,
      category: getFactoryCanonicalCategory(factory) || factory.category || "User",
      description: factory.description || "Copia utente da factory preset."
    });
    const copyName = makeUniqueName(`${factory.name} Copy`, new Set(USER_BANK.map((item) => item.name)), "Copy");
    const preset = sanitizePresetRecord({
      ...buildFactoryPresetObject(factory),
      id: nowCompactId(),
      name: copyName,
      category: getFactoryCanonicalCategory(factory) || factory.category || "User",
      description: factory.description || "Copia utente da factory preset.",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      type: "user_preset",
      sourceFactoryId: factory.id,
      favorite: false
    }, "user_preset");
    USER_BANK.push(preset);
    saveUserBank();
    renderUserPresetList(preset.id);
    updatePreview(preset);
    setStatus(`Copia utente creata dal factory preset: ${factory.name}`, "ok");
  }

  function overwriteSelectedUser() {
    const current = getSelectedUserPreset();
    if (!current) { setStatus("Seleziona prima un preset utente da sovrascrivere.", "warn"); return; }
    if (!userConfirm(`Sovrascrivere il preset utente "${current.name}" con lo stato corrente del synth?`)) {
      setStatus("Sovrascrittura annullata.", "warn");
      return;
    }
    const preset = buildUserPresetFromCurrent({
      id: current.id,
      createdAt: current.createdAt,
      favorite: isFavorite("user", current.id) || current.favorite,
      sourceFactoryId: current.sourceFactoryId || ""
    });
    USER_BANK = USER_BANK.map((item) => item.id === current.id ? preset : item);
    saveUserBank();
    renderUserPresetList(preset.id);
    updatePreview(preset);
    setStatus(`Preset utente sovrascritto: ${preset.name}`, "ok");
  }

  function renameSelectedUser() {
    const current = getSelectedUserPreset();
    if (!current) { setStatus("Seleziona prima un preset utente da aggiornare.", "warn"); return; }
    const meta = getUserMetaFromForm();
    const duplicate = USER_BANK.find((item) => item.id !== current.id && item.name === meta.name);
    if (duplicate && !userConfirm(`Esiste già un altro preset chiamato "${meta.name}". Aggiornare comunque i metadati?`)) {
      setStatus("Aggiornamento metadati annullato: nome duplicato.", "warn");
      return;
    }
    const next = { ...current, ...meta, updatedAt: nowIso() };
    USER_BANK = USER_BANK.map((item) => item.id === current.id ? next : item);
    saveUserBank();
    renderUserPresetList(current.id);
    updatePreview(next);
    setStatus(`Metadati preset aggiornati: ${next.name}`, "ok");
  }

  function loadSelectedUser() {
    const preset = getSelectedUserPreset();
    if (!preset) { setStatus("Seleziona prima un preset utente da caricare.", "warn"); return; }
    applyPresetObject(preset);
    setUserMetaForm(preset);
    setStatus(`User preset caricato: ${preset.name}`, "ok");
  }

  function duplicateSelectedUser() {
    const current = getSelectedUserPreset();
    if (!current) { setStatus("Seleziona prima un preset utente da duplicare.", "warn"); return; }
    const copy = sanitizePresetRecord({
      ...cloneJson(current),
      id: nowCompactId(),
      name: makeUniqueName(`${current.name} Copy`, new Set(USER_BANK.map((item) => item.name)), "Copy"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      favorite: false
    }, "user_preset");
    USER_BANK.push(copy);
    saveUserBank();
    renderUserPresetList(copy.id);
    updatePreview(copy);
    setStatus(`Preset duplicato: ${copy.name}`, "ok");
  }

  function deleteSelectedUser() {
    const current = getSelectedUserPreset();
    if (!current) { setStatus("Seleziona prima un preset utente da eliminare.", "warn"); return; }
    if (!userConfirm(`Eliminare definitivamente il preset utente "${current.name}"? Prima di farlo puoi esportare la User Bank.`)) {
      setStatus("Eliminazione annullata.", "warn");
      return;
    }
    USER_BANK = USER_BANK.filter((item) => item.id !== current.id);
    if (FAVORITES.user) delete FAVORITES.user[current.id];
    saveUserBank();
    saveFavoritesStore();
    renderUserPresetList();
    setStatus(`Preset utente eliminato: ${current.name}`, "ok");
  }

  function resetUserBank() {
    if (!USER_BANK.length) { setStatus("User bank già vuota.", "info"); return; }
    if (!userConfirm(`Reset completo della User Bank locale: eliminare ${USER_BANK.length} preset utente da questo browser? Prima di procedere conviene esportare la bank.`)) {
      setStatus("Reset User Bank annullato.", "warn");
      return;
    }
    USER_BANK = [];
    FAVORITES.user = {};
    try { removeStorageKeys(USER_BANK_STORAGE_KEY, LEGACY_USER_BANK_STORAGE_KEYS); }
    catch (err) { window.SynthXLogger?.warn("user bank remove unavailable", err); }
    saveFavoritesStore();
    renderUserPresetList();
    setStatus("User Bank locale resettata.", "ok");
  }

  function toggleSelectedUserFavorite() {
    const current = getSelectedUserPreset();
    if (!current) { setStatus("Seleziona prima un preset utente.", "warn"); return; }
    const next = toggleFavorite("user", current.id);
    renderUserPresetList(current.id);
    setStatus(`${next ? "Aggiunto ai" : "Rimosso dai"} preferiti user: ${current.name}`, "ok");
  }

  function toggleSelectedFactoryFavorite() {
    const preset = getSelectedFactoryPreset();
    if (!preset) return;
    const next = toggleFavorite("factory", preset.id);
    renderFactoryPresetList(preset.id);
    setStatus(`${next ? "Aggiunto ai" : "Rimosso dai"} preferiti factory: ${preset.name}`, "ok");
  }

  function buildUserBankExportObject() {
    return {
      ...exportMetadata("userBank", { format: USER_BANK_FORMAT_ID, schema: USER_BANK_SCHEMA, formatVersion: "1.0" }),
      bankFormatVersion: "1.0",
      type: "sorgiva_synth_user_preset_bank",
      legacyType: "synthx_user_preset_bank",
      count: USER_BANK.length,
      presets: USER_BANK.map((item) => sanitizePresetRecord({ ...item, favorite: isFavorite("user", item.id) || item.favorite }, "user_preset"))
    };
  }

  function exportUserBank() {
    const bank = buildUserBankExportObject();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `Sorgiva_Synth_user_bank_${date}.json`;
    downloadText(filename, JSON.stringify(bank, null, 2));
    setStatus(`User bank esportata: ${filename} (${bank.count} preset).${bank.count ? "" : " Bank vuota: file creato comunque come backup strutturale."}`, bank.count ? "ok" : "warn");
  }

  async function importUserBank() {
    const input = document.getElementById("user-import-bank-file");
    const file = input?.files?.[0];
    if (!file) { setStatus("Scegli prima una bank JSON da importare.", "warn"); return; }
    if (file.size > 2 * 1024 * 1024) { setStatus("Bank JSON troppo grande: limite prudente 2 MB.", "error"); return; }
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.presets) ? raw.presets : null);
      if (!list) throw new Error("Bank JSON senza array presets.");
      const acceptedBankTypes = new Set(["sorgiva_synth_user_preset_bank", "sorgiva-synth-user-bank", ...Array.from(LEGACY_USER_BANK_TYPES || [])]);
      if (raw && !Array.isArray(raw) && raw.type && !acceptedBankTypes.has(String(raw.type))) {
        throw new Error(`Tipo bank non riconosciuto: ${raw.type}`);
      }
      if (raw && !Array.isArray(raw) && raw.format && String(raw.format) !== USER_BANK_FORMAT_ID && !String(raw.format).startsWith("synthx")) {
        throw new Error(`Formato bank non riconosciuto: ${raw.format}`);
      }
      const result = normalizeUserPresetList(list, {
        existingIds: USER_BANK.map((item) => item.id),
        existingNames: USER_BANK.map((item) => item.name),
        nameSuffix: "Imported",
        maxItems: 500
      });
      if (!result.presets.length) throw new Error(result.errors.length ? `Nessun preset valido. Primo errore: ${result.errors[0]}` : "Nessun preset valido nella bank.");
      const summary = `${result.presets.length} preset validi` + (result.errors.length ? `, ${result.errors.length} ignorati` : "") + (result.truncated ? ", lista troncata a 500" : "");
      if (!userConfirm(`Importare questa User Bank? Verranno aggiunti ${summary}. I preset esistenti non verranno sovrascritti.`)) {
        setStatus("Import User Bank annullato.", "warn");
        return;
      }
      USER_BANK = USER_BANK.concat(result.presets);
      result.presets.forEach((item) => { if (item.favorite) FAVORITES.user[item.id] = true; });
      saveUserBank();
      saveFavoritesStore();
      renderUserPresetList(result.presets[0]?.id);
      setStatus(`Import bank completato: ${summary}.`, result.errors.length ? "warn" : "ok");
    } catch (err) {
      setStatus(`Errore import user bank: ${err.message}`, "error");
      window.SynthXLogger?.error("user bank import error", err);
    }
  }

  function presetToJson(preset) {
    return JSON.stringify(preset || buildPresetObject(), null, 2);
  }

  function updatePreview(preset) {
    const preview = document.getElementById("preset-json-preview");
    if (preview) preview.value = presetToJson(preset);
    updateAbCompareUi();
  }

  function getAbSlotName(key) {
    const slot = AB_SLOTS[key];
    if (!slot) return `${String(key || "").toUpperCase()}: vuoto`;
    return `${String(key || "").toUpperCase()}: ${clampString(slot.name, "Unnamed", 64)}`;
  }

  function setAbStatus(message, kind) {
    const status = document.getElementById("ab-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind || "info";
  }

  function updateAbCompareUi(message, kind) {
    const current = document.getElementById("ab-current-name");
    const a = document.getElementById("ab-a-name");
    const b = document.getElementById("ab-b-name");
    if (current) current.textContent = `Corrente: ${clampString(getPresetName(), "Sorgiva Synth Init Patch", 64)}`;
    if (a) a.textContent = getAbSlotName("a");
    if (b) b.textContent = getAbSlotName("b");
    if (message) setAbStatus(message, kind || "info");
  }

  function notifyPresetMorphAbChanged(reason) {
    const morph = window.SynthXPresetMorph;
    try {
      if (morph?.onAbSlotsChanged) morph.onAbSlotsChanged(reason || "ab-update");
      else morph?.refreshSummary?.();
    } catch (err) {
      window.SynthXLogger?.warn?.("preset morph A/B sync skipped", err);
    }
  }

  function captureAbSlot(key) {
    const normalizedKey = key === "b" ? "b" : "a";
    const preset = cloneJson(buildPresetObject());
    preset.type = "ab_compare_slot";
    preset.abCompareSlot = normalizedKey.toUpperCase();
    preset.updatedAt = nowIso();
    AB_SLOTS[normalizedKey] = preset;
    updateAbCompareUi(`A/B: stato corrente salvato nello slot ${normalizedKey.toUpperCase()} — ${preset.name}.`, "ok");
    notifyPresetMorphAbChanged(`store-${normalizedKey}`);
    updatePreview(preset);
    return preset;
  }

  function loadAbSlot(key) {
    const normalizedKey = key === "b" ? "b" : "a";
    const preset = AB_SLOTS[normalizedKey];
    if (!preset) {
      updateAbCompareUi(`A/B: slot ${normalizedKey.toUpperCase()} vuoto. Usa prima Store Current.`, "warn");
      return false;
    }
    applyPresetObject(cloneJson(preset));
    updateAbCompareUi(`A/B: caricato slot ${normalizedKey.toUpperCase()} — ${preset.name}.`, "ok");
    notifyPresetMorphAbChanged(`load-${normalizedKey}`);
    return true;
  }

  function copyAbSlot(fromKey, toKey) {
    const from = fromKey === "b" ? "b" : "a";
    const to = toKey === "b" ? "b" : "a";
    if (!AB_SLOTS[from]) {
      updateAbCompareUi(`A/B: slot ${from.toUpperCase()} vuoto, copia annullata.`, "warn");
      return false;
    }
    AB_SLOTS[to] = cloneJson(AB_SLOTS[from]);
    AB_SLOTS[to].abCompareSlot = to.toUpperCase();
    AB_SLOTS[to].updatedAt = nowIso();
    updateAbCompareUi(`A/B: copiato ${from.toUpperCase()} → ${to.toUpperCase()}.`, "ok");
    notifyPresetMorphAbChanged(`copy-${from}-${to}`);
    return true;
  }

  function swapAbSlots() {
    const temp = AB_SLOTS.a;
    AB_SLOTS.a = AB_SLOTS.b;
    AB_SLOTS.b = temp;
    if (AB_SLOTS.a) { AB_SLOTS.a.abCompareSlot = "A"; AB_SLOTS.a.updatedAt = nowIso(); }
    if (AB_SLOTS.b) { AB_SLOTS.b.abCompareSlot = "B"; AB_SLOTS.b.updatedAt = nowIso(); }
    updateAbCompareUi("A/B: slot A e B scambiati.", "ok");
    notifyPresetMorphAbChanged("swap");
  }

  function clearAbSlots() {
    AB_SLOTS.a = null;
    AB_SLOTS.b = null;
    updateAbCompareUi("A/B: slot temporanei svuotati.", "ok");
    notifyPresetMorphAbChanged("clear");
  }

  function getAbCompareSummary() {
    return {
      a: AB_SLOTS.a ? { name: AB_SLOTS.a.name, parameterCount: Object.keys(AB_SLOTS.a.parameters || {}).length } : null,
      b: AB_SLOTS.b ? { name: AB_SLOTS.b.name, parameterCount: Object.keys(AB_SLOTS.b.parameters || {}).length } : null
    };
  }


  function getAbSlot(key) {
    const normalizedKey = key === "b" ? "b" : "a";
    return AB_SLOTS[normalizedKey] ? cloneJson(AB_SLOTS[normalizedKey]) : null;
  }

  function setAbSlot(key, preset) {
    const normalizedKey = key === "b" ? "b" : "a";
    if (!preset || typeof preset !== "object") return false;
    AB_SLOTS[normalizedKey] = cloneJson(preset);
    AB_SLOTS[normalizedKey].abCompareSlot = normalizedKey.toUpperCase();
    AB_SLOTS[normalizedKey].updatedAt = nowIso();
    updateAbCompareUi(`A/B: slot ${normalizedKey.toUpperCase()} aggiornato da funzione esterna.`, "ok");
    notifyPresetMorphAbChanged(`external-${normalizedKey}`);
    return true;
  }


  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportJson() {
    const preset = buildPresetObject();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `Sorgiva_Synth_patch_${slugifyName(preset.name)}_${date}.json`;
    const json = presetToJson(preset);
    updatePreview(preset);
    downloadText(filename, json);
    setStatus(`Patch esportata: ${filename}`, "ok");
    window.SynthXLogger?.log("patch exported", filename);
  }

  function getSelectedFactoryPreset() {
    const select = document.getElementById("factory-preset");
    if (select && select.options.length === 0) return null;
    const id = select?.value || FACTORY_PRESETS[0]?.id;
    return FACTORY_PRESETS.find((item) => item.id === id) || FACTORY_PRESETS[0] || null;
  }

  function getFactorySearchText(item) {
    return [item.name, item.category, getFactoryCanonicalCategory(item), getFactoryCategoryMeta(item), item.description, item.tips, item.role, item.character, item.useCase, getFactoryTags(item).join(" ")].join(" ");
  }

  function renderFactoryPresetList(preferredId) {
    const category = document.getElementById("factory-category")?.value || "all";
    const favoritesOnly = Boolean(document.getElementById("factory-favorites-only")?.checked);
    const query = document.getElementById("factory-search")?.value || "";
    const sortMode = document.getElementById("factory-sort")?.value || "name";
    const select = document.getElementById("factory-preset");
    if (!select) return;
    const previous = preferredId || select.value;
    const filtered = FACTORY_PRESETS
      .filter((item) => factoryCategoryMatches(item, category))
      .filter((item) => !favoritesOnly || isFavorite("factory", item.id))
      .filter((item) => includesSearch(getFactorySearchText(item), query));
    const list = sortFactoryList(filtered, sortMode);
    updateCountPill("factory-count-pill", list.length, FACTORY_PRESETS.length, "Factory");
    select.innerHTML = "";
    list.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${isFavorite("factory", item.id) ? "★ " : ""}${item.name} — ${getFactoryCanonicalCategory(item)}`;
      option.title = [getFactoryCategoryDisplay(item), item.description, getFactoryTags(item).join(", ")].filter(Boolean).join(" · ");
      select.appendChild(option);
    });
    if (list.some((item) => item.id === previous)) select.value = previous;
    else if (list[0]) select.value = list[0].id;
    else select.value = "";
    updateFactoryPresetInfo();
  }

  function updateFactoryPresetInfo() {
    const preset = getSelectedFactoryPreset();
    const info = document.getElementById("factory-preset-info");
    const favoriteButton = document.getElementById("factory-favorite-toggle");
    if (info && preset) {
      const fav = isFavorite("factory", preset.id);
      if (favoriteButton) favoriteButton.textContent = `${fav ? "★" : "☆"} Preferito`;
      const canonical = getFactoryCanonicalCategory(preset);
      const categoryMeta = getFactoryCategoryMeta(preset);
      const legacyNote = preset.category && preset.category !== canonical ? `Origine legacy: ${preset.category}` : null;
      const meta = [
        `Categoria: ${canonical}`,
        categoryMeta,
        legacyNote,
        preset.role ? `Ruolo: ${preset.role}` : null,
        preset.character ? `Carattere: ${preset.character}` : null,
        preset.useCase ? `Uso: ${preset.useCase}` : null,
        preset.intensity ? `Intensità: ${preset.intensity}/5` : null,
        preset.balanceVersion ? `Balance: ${preset.balanceVersion}` : null,
        Array.isArray(preset.reviewFlags) && preset.reviewFlags.length ? `Review flags: ${preset.reviewFlags.length}` : null
      ].filter(Boolean).join(" · ");
      info.innerHTML = `<strong>${escapeHtml(preset.name)}</strong> <span class="muted">(${escapeHtml(canonical)})</span> ${fav ? "★" : ""}${tagHtml(getFactoryTags(preset))}<br>${escapeHtml(preset.description)}<br><span class="preset-meta">${escapeHtml(meta)}</span><br><span class="muted">Suggerimento: ${escapeHtml(preset.tips)}</span>`;
    } else if (info) {
      if (favoriteButton) favoriteButton.textContent = "☆ Preferito";
      info.textContent = "Nessun factory preset visibile con i filtri correnti.";
    }
  }

  function resetFactoryBrowserFilters() {
    const category = document.getElementById("factory-category");
    const search = document.getElementById("factory-search");
    const sort = document.getElementById("factory-sort");
    const favorites = document.getElementById("factory-favorites-only");
    if (category) category.value = "all";
    if (search) search.value = "";
    if (sort) sort.value = "name";
    if (favorites) favorites.checked = false;
    renderFactoryPresetList();
    setStatus("Filtri Factory Preset azzerati.", "ok");
  }

  function loadFactoryPreset() {
    const preset = getSelectedFactoryPreset();
    if (!preset) { setStatus("Nessun preset factory selezionato.", "warn"); return; }
    applyPresetObject(buildFactoryPresetObject(preset));
    setStatus(`Preset factory caricato: ${preset.name}. Ora puoi modificarlo ed esportarlo come patch JSON.`, "ok");
  }

  async function copyFactoryJson() {
    const preset = getSelectedFactoryPreset();
    if (!preset) return;
    const json = presetToJson(buildFactoryPresetObject(preset));
    updatePreview(buildFactoryPresetObject(preset));
    try {
      await navigator.clipboard.writeText(json);
      setStatus(`JSON factory copiato: ${preset.name}.`, "ok");
    } catch (_) {
      const preview = document.getElementById("preset-json-preview");
      if (preview) { preview.focus(); preview.select(); }
      setStatus("Clipboard non disponibile: JSON factory selezionato nella preview.", "warn");
    }
  }

  function exportFactoryJson() {
    const preset = getSelectedFactoryPreset();
    if (!preset) return;
    const object = buildFactoryPresetObject(preset);
    const filename = `Sorgiva_Synth_factory_${slugifyName(preset.name)}_v0_26_7r2.json`;
    updatePreview(object);
    downloadText(filename, presetToJson(object));
    setStatus(`Preset factory esportato: ${filename}`, "ok");
  }

  async function copyJson() {
    const preset = buildPresetObject();
    const json = presetToJson(preset);
    updatePreview(preset);
    try {
      await navigator.clipboard.writeText(json);
      setStatus("JSON patch copiato negli appunti.", "ok");
    } catch (_) {
      const preview = document.getElementById("preset-json-preview");
      if (preview) {
        preview.focus();
        preview.select();
      }
      setStatus("Clipboard non disponibile: JSON selezionato nella preview.", "warn");
    }
  }

  function saveLocal() {
    const preset = buildPresetObject();
    try {
      writeStorageText(LOCAL_PATCH_STORAGE_KEY, presetToJson(preset), LEGACY_LOCAL_PATCH_STORAGE_KEYS);
      updatePreview(preset);
      setStatus(`Patch salvata localmente: ${preset.name}`, "ok");
      window.SynthXLogger?.log("patch saved local", preset.name);
    } catch (err) {
      setStatus(`Salvataggio locale non disponibile: ${err.message}`, "error");
      window.SynthXLogger?.warn("patch local save unavailable", err);
    }
  }

  function normalizePresetObject(raw) {
    if (!raw || typeof raw !== "object") throw new Error("Il file JSON non contiene un oggetto preset/patch valido.");
    const rawParameters = raw.parameters || raw.patch || raw.data?.parameters;
    if (!rawParameters || typeof rawParameters !== "object") throw new Error("Preset/Patch senza blocco parameters.");
    const parameters = { ...rawParameters };
    const helper = window.SynthXModulationMatrix;
    if (helper?.parametersFromMatrix && Array.isArray(raw.modulationMatrix)) {
      const matrixParams = helper.parametersFromMatrix(raw.modulationMatrix);
      Object.entries(matrixParams).forEach(([id, value]) => {
        if (!Object.prototype.hasOwnProperty.call(parameters, id)) parameters[id] = value;
      });
    }
    hardenModMatrixParameterBlock(parameters);
    const filteredParameters = normalizePresetParametersForExport(parameters);
    return {
      ...raw,
      presetFormatVersion: String(raw.presetFormatVersion || "0.1"),
      name: String(raw.name || "Imported Sorgiva Synth Patch"),
      modulationMatrix: helper?.normalizeMatrix?.(raw.modulationMatrix || []) || [],
      parameters: filteredParameters
    };
  }

  function setPerformanceButton(item, value, source) {
    const button = document.getElementById(item.id);
    const next = Boolean(value);
    if (button) {
      button.setAttribute("aria-pressed", String(next));
      button.textContent = `${item.label}: ${next ? "ON" : "OFF"}`;
      button.classList.toggle("is-on", next);
    }
    window.SynthXState?.setParameter?.(item.parameterId, next, { source: source || "preset-load" });
  }

  function clampPresetNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeStepGatePresetValue(value, fallback) {
    const fb = [25, 50, 75, 100].includes(Number(fallback)) ? Number(fallback) : 100;
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fb;
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
    const rounded = Math.round(percent);
    if ([25, 50, 75, 100].includes(rounded)) return rounded;
    if (rounded < 25 || rounded > 100) return fb;
    return [25, 50, 75, 100].reduce((best, candidate) => Math.abs(candidate - rounded) < Math.abs(best - rounded) ? candidate : best, fb);
  }

  function normalizeStepChordPresetValue(value, fallback) {
    const allowed = new Set(["off", "octave", "power5", "major", "minor", "sus2", "sus4", "dim", "aug", "maj7", "min7", "dom7", "custom"]);
    const aliases = {
      none: "off", mono: "off", root: "off", single: "off",
      oct: "octave", octave1: "octave",
      fifth: "power5", power: "power5", powerchord: "power5", p5: "power5",
      maj: "major", m: "minor", min: "minor",
      diminished: "dim", augmented: "aug",
      major7: "maj7", majseven: "maj7", majorseven: "maj7",
      minor7: "min7", minseven: "min7", minorseven: "min7", m7: "min7",
      dominant7: "dom7", domseven: "dom7", dominantseven: "dom7", seven: "dom7", "7": "dom7",
      custom: "custom", user: "custom", intervals: "custom", interval: "custom"
    };
    const fb = allowed.has(String(fallback)) ? String(fallback) : "off";
    let raw = value;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = raw.id ?? raw.type ?? raw.chord ?? raw.name ?? raw.mode;
    const key = String(raw ?? "").trim().toLowerCase().replace(/[\s_\-.]+/g, "");
    if (allowed.has(key)) return key;
    if (aliases[key] && allowed.has(aliases[key])) return aliases[key];
    const direct = Array.from(allowed).find((id) => id.toLowerCase() === key);
    return direct || fb;
  }

  function sanitizeStepChordCustomValue(value) {
    const raw = Array.isArray(value) ? value : String(value ?? "0,4,7").split(/[;,\s]+/).filter(Boolean);
    const result = [];
    raw.forEach((item) => {
      const n = Math.round(clampPresetNumber(item, -24, 36, 0));
      if (!result.includes(n)) result.push(n);
    });
    if (!result.includes(0)) result.unshift(0);
    return (result.length ? result : [0, 4, 7]).slice(0, 4).join(",");
  }

  function sanitizePresetControlValue(id, value) {
    if (/^modmat-slot[1-8]-amount$/.test(String(id))) return clampPresetNumber(value, -1, 1, 0);
    if (/^modmat-slot[1-8]-source$/.test(String(id))) return window.SynthXModulationMatrix?.normalizeSource?.(value) || "lfo1";
    if (/^modmat-slot[1-8]-destination$/.test(String(id))) return window.SynthXModulationMatrix?.normalizeDestination?.(value) || "vcf_cutoff";
    if (/^modmat-slot[1-8]-enabled$/.test(String(id))) return Boolean(value);
    if (/^osc[123]-pulse-width$/.test(String(id))) return clampPresetNumber(value, 0.05, 0.95, 0.5);
    if (/^osc[123]-pwm-amount$/.test(String(id))) return clampPresetNumber(value, 0, 0.45, 0);
    if (/^osc[123]-pwm-source$/.test(String(id))) return ["off", "lfo1", "lfo2", "lfo3"].includes(String(value)) ? String(value) : "off";
    if (id === "ringmod-enabled") return Boolean(value);
    if (id === "ringmod-source-a" || id === "ringmod-source-b") return ["osc1", "osc2", "osc3"].includes(String(value)) ? String(value) : (id === "ringmod-source-a" ? "osc1" : "osc2");
    if (id === "ringmod-amount") return clampPresetNumber(value, 0, 1, 0);
    if (id === "fm-enabled") return Boolean(value);
    if (id === "fm-carrier" || id === "fm-modulator") return ["osc1", "osc2", "osc3"].includes(String(value)) ? String(value) : (id === "fm-carrier" ? "osc1" : "osc2");
    if (id === "fm-amount") return clampPresetNumber(value, 0, 0.70, 0);
    if (id === "oscsync-enabled") return Boolean(value);
    if (id === "oscsync-master" || id === "oscsync-slave") return ["osc1", "osc2", "osc3"].includes(String(value)) ? String(value) : (id === "oscsync-master" ? "osc1" : "osc2");
    if (id === "oscsync-amount") return clampPresetNumber(value, 0, 1, 0);
    if (id === "unison-enabled") return Boolean(value);
    if (id === "unison-voices") return Math.round(clampPresetNumber(value, 1, 12, 2));
    if (id === "unison-max-layers") return Math.round(clampPresetNumber(value, 1, 12, 3));
    if (id === "unison-detune") return clampPresetNumber(value, 0, 18, 7);
    if (id === "unison-spread") return clampPresetNumber(value, 0, 0.75, 0.45);
    if (/^osc[123]-wave$/.test(String(id))) return ["sine", "triangle", "square", "saw", "saw_rev", "pulse"].includes(String(value)) ? String(value) : "sine";
    if (id === "master-tuning-a4") return clampPresetTuningA4(value);
    if (id === "performance-key-velocity") return clampPresetNumber(value, 0.05, 1, 1);
    if (id === "performance-velocity-curve") return ["linear", "soft", "hard"].includes(String(value)) ? String(value) : "linear";
    if (id === "filter-env-amount" || id === "filter-env-sus" || id === "vcf-keytrack" || id === "vcf-velocity" || id === "filter-drive-amount" || id === "adv-filter-depth" || id === "adv-filter-mix" || id === "adv-filter-env-freq" || id === "adv-filter-vel-depth" || id === "adv-filter-vel-mix") return clampPresetNumber(value, 0, 1, id === "filter-env-sus" ? 0.45 : 0);
    if (id === "adv-filter-freq") {
      const raw = Number(value);
      if (!Number.isFinite(raw)) return 0.593;
      if (raw > 1) {
        const minHz = 80;
        const maxHz = 8000;
        const hz = Math.min(maxHz, Math.max(minHz, raw));
        return Math.min(1, Math.max(0, (Math.log10(hz) - Math.log10(minHz)) / (Math.log10(maxHz) - Math.log10(minHz))));
      }
      return clampPresetNumber(raw, 0, 1, 0.593);
    }
    if (id === "filter-env-att") return Math.round(clampPresetNumber(value, 0, 2000, 10));
    if (id === "filter-env-dec") return Math.round(clampPresetNumber(value, 0, 3000, 180));
    if (id === "filter-env-rel") return Math.round(clampPresetNumber(value, 0, 5000, 240));
    if (id === "filter-drive-trim") return clampPresetNumber(value, -12, 3, 0);
    if (id === "filter-drive-mode") { const map = { tube: "warm", soft: "warm", warm: "warm", fold: "dirty", hard: "dirty", diode: "dirty", acid: "dirty", distortion: "dirty", dirty: "dirty", clean: "clean" }; return map[String(value)] || "clean"; }
    if (id === "hpf-slope" || id === "vcf-slope") return Number(value) >= 24 ? 24 : 12;
    if (id === "filter-env-target") return ["vcf", "hpf", "bpf", "notch"].includes(String(value)) ? String(value) : "vcf";
    if (id === "adv-filter-mode") { const v = String(value) === "formant" ? "vowel" : String(value); return ["allpass", "resonator", "vowel", "comb"].includes(v) ? v : "allpass"; }
    if (id === "adv-filter-vowel") return ["a", "e", "i", "o", "u"].includes(String(value)) ? String(value) : "a";
    if (/^lfo[123]-dest$/.test(String(id))) { const mapped = { filter: "vcf_cutoff", cutoff: "vcf_cutoff", vcf: "vcf_cutoff", pwm: "vcf_cutoff" }[String(value)] || String(value); return ["pitch", "volume", "vcf_cutoff", "hpf_cutoff", "bpf_cutoff", "notch_cutoff", "adv_filter_freq", "adv_filter_depth", "adv_filter_mix"].includes(mapped) ? mapped : "pitch"; }
    if (/^lfo[123]-sync$/.test(String(id))) { const raw = Number(value); const options = [4, 2, 1, 0.5, 0.25, 0.125, 1.5, 0.75, 0.6666667, 0.3333333]; return Number.isFinite(raw) ? options.reduce((best, candidate) => Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best, 1) : 1; }
    if (id === "filter-env-polarity") return String(value) === "inverted" ? "inverted" : "normal";
    if (id === "seq-enabled" || id === "arp-enabled") return false;
    if (id === "arp-mode") return ["up", "down", "updown", "random", "asplayed"].includes(String(value)) ? String(value) : "up";
    if (id === "arp-motion-pattern") return window.SynthXArpeggiator?.isValidMotionPattern?.(value) ? String(value) : "linear";
    if (id === "arp-rate") return clampPresetNumber(value, 0.5, 16, 4);
    if (id === "arp-octaves") return Math.round(clampPresetNumber(value, 1, 4, 1));
    if (id === "arp-gate") return Math.round(clampPresetNumber(value, 10, 95, 65));
    if (id === "arp-swing") return Math.round(clampPresetNumber(value, 0, 40, 0));
    if (id === "arp-latch-enabled") return Boolean(value);
    if (id === "arp-reset-on-change" || id === "arp-random-no-repeat") return Boolean(value);
    if (id === "seq-length") return Math.round(clampPresetNumber(value, 3, 32, 8));
    if (id === "seq-rate") return clampPresetNumber(value, 0.5, 16, 2);
    if (id === "seq-gate") return Math.round(clampPresetNumber(value, 10, 95, 65));
    const stepMatch = String(id).match(/^seq-step-(\d+)-(active|note|octave|velocity|gate|accent|tie|chord|chord-custom|chord-inversion|chord-spread|chord-strum|chord-velocity-mode)$/);
    if (stepMatch) {
      const index = Number(stepMatch[1]);
      const kind = stepMatch[2];
      const defaults = [
        { active: true, note: 0, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: true, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: true, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: true, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: true, note: 9, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: true, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: true, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: true, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: false, note: 0, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: false, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: false, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: false, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: false, note: 9, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: false, note: 7, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" },
        { active: false, note: 4, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }, { active: false, note: 2, octave: 4, velocity: 100, gate: 100, accent: false, tie: false, chord: "off" }
      ];
      const fallback = defaults[Math.min(15, Math.max(0, index - 1))] || { ...defaults[(Math.max(0, index - 1)) % defaults.length], active: false, accent: false, tie: false, chord: "off" } || defaults[0];
      if (kind === "active") return Boolean(value);
      if (kind === "note") return Math.round(clampPresetNumber(value, 0, 11, fallback.note));
      if (kind === "octave") return Math.round(clampPresetNumber(value, 2, 6, fallback.octave));
      if (kind === "velocity") return Math.round(clampPresetNumber(value, 0, 100, fallback.velocity));
      if (kind === "gate") return normalizeStepGatePresetValue(value, fallback.gate);
      if (kind === "accent") return Boolean(value);
      if (kind === "tie") return Boolean(value);
      if (kind === "chord") return normalizeStepChordPresetValue(value, fallback.chord || "off");
      if (kind === "chord-custom") return sanitizeStepChordCustomValue(value);
      if (kind === "chord-inversion") return Math.round(clampPresetNumber(value, 0, 3, 0));
      if (kind === "chord-spread") return ["close", "open", "wide"].includes(String(value)) ? String(value) : "close";
      if (kind === "chord-strum") return Math.round(clampPresetNumber(value, 0, 120, 0));
      if (kind === "chord-velocity-mode") return ["balanced", "flat", "natural", "softTop"].includes(String(value)) ? String(value) : "balanced";
    }
    const element = document.getElementById(id);
    if (element && !isPresetUiElement(element)) {
      if (element.type === "checkbox") return Boolean(value);
      if (element.type === "range" || element.type === "number") {
        const raw = Number(value);
        const fallback = Number(element.value);
        if (!Number.isFinite(raw)) return Number.isFinite(fallback) ? fallback : value;
        const min = Number(element.min);
        const max = Number(element.max);
        const low = Number.isFinite(min) ? min : -Infinity;
        const high = Number.isFinite(max) ? max : Infinity;
        return Math.min(high, Math.max(low, raw));
      }
      if (element.tagName === "SELECT") {
        const options = Array.from(element.options || []).map((option) => option.value);
        return options.includes(String(value)) ? value : (options[0] ?? value);
      }
    }
    return value;
  }

  function setControlFromPreset(id, value) {
    const element = document.getElementById(id);
    if (!element || isPresetUiElement(element)) return false;
    const safeValue = sanitizePresetControlValue(id, value);
    if (element.type === "checkbox") element.checked = Boolean(safeValue);
    else element.value = String(safeValue);
    const coerced = window.SynthXState?.coerceValue ? window.SynthXState.coerceValue(element) : readControlValue(element);
    window.SynthXState?.setParameter?.(id, coerced, { source: "preset-load", type: element.type || element.tagName.toLowerCase() });
    window.SynthXControls?.updateValueLabel?.(id, coerced);
    return true;
  }

  function applyPresetObject(rawPreset) {
    const preset = normalizePresetObject(rawPreset);
    window.SynthXSequencer?.clear?.("preset-load");
    window.SynthXArpeggiator?.clear?.("preset-load");
    window.SynthXAudio?.allNotesOff?.();
    const params = preset.parameters || {};
    const filterEnvDefaults = {
      "filter-env-amount": 0,
      "filter-env-target": "vcf",
      "filter-env-polarity": "normal",
      "filter-env-att": 10,
      "filter-env-dec": 180,
      "filter-env-sus": 0.45,
      "filter-env-rel": 240,
      "filter-drive-enabled": false,
      "filter-drive-mode": "clean",
      "filter-drive-amount": 0,
      "filter-drive-trim": 0,
      "adv-filter-enabled": false,
      "adv-filter-mode": "allpass",
      "adv-filter-freq": 0.593,
      "adv-filter-depth": 0,
      "adv-filter-mix": 0,
      "adv-filter-vowel": "a",
      "adv-filter-env-freq": 0,
      "adv-filter-vel-depth": 0,
      "adv-filter-vel-mix": 0,
      "hpf-slope": 12,
      "vcf-slope": 12,
      "vcf-keytrack": 0,
      "vcf-velocity": 0
    };
    const delayDefaults = {
      "delay-mode": "mono",
      "delay-time-mode": "free",
      "delay-sync": "1/8"
    };

    const tuningDefaults = {
      // Compatibilità legacy: se il parametro non esiste, il synth torna sempre a La4 = 440 Hz.
      "master-tuning-a4": 440
    };

    const performanceDefaults = {
      "performance-key-velocity": 1,
      "performance-velocity-curve": "linear"
    };
    const modulationMatrixDefaults = window.SynthXModulationMatrix?.defaultParameters?.() || {
      "modmat-slot1-enabled": false, "modmat-slot1-source": "lfo1", "modmat-slot1-destination": "vcf_cutoff", "modmat-slot1-amount": 0,
      "modmat-slot2-enabled": false, "modmat-slot2-source": "lfo2", "modmat-slot2-destination": "vcf_cutoff", "modmat-slot2-amount": 0,
      "modmat-slot3-enabled": false, "modmat-slot3-source": "lfo3", "modmat-slot3-destination": "adv_filter_freq", "modmat-slot3-amount": 0,
      "modmat-slot4-enabled": false, "modmat-slot4-source": "velocity", "modmat-slot4-destination": "vcf_cutoff", "modmat-slot4-amount": 0
    };
    const oscLfoDefaults = {
      "osc1-fine": 0, "osc2-fine": 0, "osc3-fine": 0,
      "osc1-pan": 0, "osc2-pan": 0, "osc3-pan": 0,
      "osc1-pulse-width": 0.5, "osc2-pulse-width": 0.5, "osc3-pulse-width": 0.5,
      "osc1-pwm-amount": 0, "osc2-pwm-amount": 0, "osc3-pwm-amount": 0,
      "osc1-pwm-source": "off", "osc2-pwm-source": "off", "osc3-pwm-source": "off",
      "ringmod-enabled": false, "ringmod-source-a": "osc1", "ringmod-source-b": "osc2", "ringmod-amount": 0,
      "fm-enabled": false, "fm-carrier": "osc1", "fm-modulator": "osc2", "fm-amount": 0,
      "oscsync-enabled": false, "oscsync-master": "osc1", "oscsync-slave": "osc2", "oscsync-amount": 0,
      "unison-enabled": false, "unison-voices": 2, "unison-max-layers": 3, "unison-detune": 7, "unison-spread": 0.45,
      "lfo1-rate-mode": "free", "lfo2-rate-mode": "free", "lfo3-rate-mode": "free",
      "lfo1-sync": 1, "lfo2-sync": 1, "lfo3-sync": 1,
      "lfo1-dest": "pitch", "lfo2-dest": "pitch", "lfo3-dest": "pitch"
    };
    const arpDefaults = {
      "arp-enabled": false,
      "arp-mode": "up",
      "arp-rate": 4,
      "arp-octaves": 1,
      "arp-gate": 65,
      "arp-swing": 0,
      "arp-motion-pattern": "linear",
      "arp-latch-enabled": false,
      "arp-reset-on-change": true,
      "arp-random-no-repeat": true
    };
    const seqDefaults = {
      "seq-enabled": false,
      "seq-length": 8,
      "seq-rate": 2,
      "seq-gate": 65,
      "seq-step-1-active": true,
      "seq-step-1-note": 0,
      "seq-step-1-octave": 4,
      "seq-step-1-velocity": 100,
      "seq-step-1-gate": 100,
      "seq-step-1-accent": false,
      "seq-step-1-tie": false,
      "seq-step-1-chord": "off",
      "seq-step-2-active": true,
      "seq-step-2-note": 2,
      "seq-step-2-octave": 4,
      "seq-step-2-velocity": 100,
      "seq-step-2-gate": 100,
      "seq-step-2-accent": false,
      "seq-step-2-tie": false,
      "seq-step-2-chord": "off",
      "seq-step-3-active": true,
      "seq-step-3-note": 4,
      "seq-step-3-octave": 4,
      "seq-step-3-velocity": 100,
      "seq-step-3-gate": 100,
      "seq-step-3-accent": false,
      "seq-step-3-tie": false,
      "seq-step-3-chord": "off",
      "seq-step-4-active": true,
      "seq-step-4-note": 7,
      "seq-step-4-octave": 4,
      "seq-step-4-velocity": 100,
      "seq-step-4-gate": 100,
      "seq-step-4-accent": false,
      "seq-step-4-tie": false,
      "seq-step-4-chord": "off",
      "seq-step-5-active": true,
      "seq-step-5-note": 9,
      "seq-step-5-octave": 4,
      "seq-step-5-velocity": 100,
      "seq-step-5-gate": 100,
      "seq-step-5-accent": false,
      "seq-step-5-tie": false,
      "seq-step-5-chord": "off",
      "seq-step-6-active": true,
      "seq-step-6-note": 7,
      "seq-step-6-octave": 4,
      "seq-step-6-velocity": 100,
      "seq-step-6-gate": 100,
      "seq-step-6-accent": false,
      "seq-step-6-tie": false,
      "seq-step-6-chord": "off",
      "seq-step-7-active": true,
      "seq-step-7-note": 4,
      "seq-step-7-octave": 4,
      "seq-step-7-velocity": 100,
      "seq-step-7-gate": 100,
      "seq-step-7-accent": false,
      "seq-step-7-tie": false,
      "seq-step-7-chord": "off",
      "seq-step-8-active": true,
      "seq-step-8-note": 2,
      "seq-step-8-octave": 4,
      "seq-step-8-velocity": 100,
      "seq-step-8-gate": 100,
      "seq-step-8-accent": false,
      "seq-step-8-tie": false,
      "seq-step-8-chord": "off",
      "seq-step-9-active": false,
      "seq-step-9-note": 0,
      "seq-step-9-octave": 4,
      "seq-step-9-velocity": 100,
      "seq-step-9-gate": 100,
      "seq-step-9-accent": false,
      "seq-step-9-tie": false,
      "seq-step-9-chord": "off",
      "seq-step-10-active": false,
      "seq-step-10-note": 2,
      "seq-step-10-octave": 4,
      "seq-step-10-velocity": 100,
      "seq-step-10-gate": 100,
      "seq-step-10-accent": false,
      "seq-step-10-tie": false,
      "seq-step-10-chord": "off",
      "seq-step-11-active": false,
      "seq-step-11-note": 4,
      "seq-step-11-octave": 4,
      "seq-step-11-velocity": 100,
      "seq-step-11-gate": 100,
      "seq-step-11-accent": false,
      "seq-step-11-tie": false,
      "seq-step-11-chord": "off",
      "seq-step-12-active": false,
      "seq-step-12-note": 7,
      "seq-step-12-octave": 4,
      "seq-step-12-velocity": 100,
      "seq-step-12-gate": 100,
      "seq-step-12-accent": false,
      "seq-step-12-tie": false,
      "seq-step-12-chord": "off",
      "seq-step-13-active": false,
      "seq-step-13-note": 9,
      "seq-step-13-octave": 4,
      "seq-step-13-velocity": 100,
      "seq-step-13-gate": 100,
      "seq-step-13-accent": false,
      "seq-step-13-tie": false,
      "seq-step-13-chord": "off",
      "seq-step-14-active": false,
      "seq-step-14-note": 7,
      "seq-step-14-octave": 4,
      "seq-step-14-velocity": 100,
      "seq-step-14-gate": 100,
      "seq-step-14-accent": false,
      "seq-step-14-tie": false,
      "seq-step-14-chord": "off",
      "seq-step-15-active": false,
      "seq-step-15-note": 4,
      "seq-step-15-octave": 4,
      "seq-step-15-velocity": 100,
      "seq-step-15-gate": 100,
      "seq-step-15-accent": false,
      "seq-step-15-tie": false,
      "seq-step-15-chord": "off",
      "seq-step-16-active": false,
      "seq-step-16-note": 2,
      "seq-step-16-octave": 4,
      "seq-step-16-velocity": 100,
      "seq-step-16-gate": 100,
      "seq-step-16-accent": false,
      "seq-step-16-tie": false,
      "seq-step-16-chord": "off"
    };

    // v0.26.7o: preset-load defaults must clear Step Chords and step data through step 32.
    const seqStepDefaultNotes32 = [0, 2, 4, 7, 9, 7, 4, 2];
    for (let index = 17; index <= 32; index += 1) {
      const note = seqStepDefaultNotes32[(index - 1) % seqStepDefaultNotes32.length];
      seqDefaults[`seq-step-${index}-active`] = false;
      seqDefaults[`seq-step-${index}-note`] = note;
      seqDefaults[`seq-step-${index}-octave`] = 4;
      seqDefaults[`seq-step-${index}-velocity`] = 100;
      seqDefaults[`seq-step-${index}-gate`] = 100;
      seqDefaults[`seq-step-${index}-accent`] = false;
      seqDefaults[`seq-step-${index}-tie`] = false;
      seqDefaults[`seq-step-${index}-chord`] = "off";
    }
    // v0.26.7o: advanced chord motion defaults must clear custom intervals, inversion, spread, strum and voice velocity mode through step 32.
    for (let index = 1; index <= 32; index += 1) {
      seqDefaults[`seq-step-${index}-chord-custom`] = "0,4,7";
      seqDefaults[`seq-step-${index}-chord-inversion`] = 0;
      seqDefaults[`seq-step-${index}-chord-spread`] = "close";
      seqDefaults[`seq-step-${index}-chord-strum`] = 0;
      seqDefaults[`seq-step-${index}-chord-velocity-mode`] = "balanced";
    }
    Object.entries({ ...tuningDefaults, ...filterEnvDefaults, ...delayDefaults, ...performanceDefaults, ...modulationMatrixDefaults, ...oscLfoDefaults, ...arpDefaults, ...seqDefaults }).forEach(([id, value]) => {
      if (!Object.prototype.hasOwnProperty.call(params, id)) setControlFromPreset(id, value);
    });
    let applied = 0;
    let skipped = 0;
    let skippedRuntime = 0;
    Object.entries(params).forEach(([id, value]) => {
      if (isRuntimePresetParameterId(id)) { skippedRuntime += 1; return; }
      const perf = PERFORMANCE_BUTTONS.find((item) => item.parameterId === id);
      if (perf) { setPerformanceButton(perf, value, "preset-load"); applied += 1; return; }
      if (setControlFromPreset(id, value)) applied += 1;
      else skipped += 1;
    });
    const nameInput = document.getElementById("preset-name");
    if (nameInput) nameInput.value = preset.name || "Imported Sorgiva Synth Patch";
    window.SynthXModulationMatrix?.syncFromUi?.("preset-load");
    window.SynthXSequencer?.syncUi?.("preset-load");
    window.SynthXControls?.refreshAllUi?.();
    updatePreview(preset);
    window.SynthXAudio?.dampFxTails?.("preset-load");
    const runtimeNote = skippedRuntime ? `; runtime/UI ignorati: ${skippedRuntime}` : "";
    setStatus(`Preset/Patch caricato: ${preset.name}. Parametri applicati: ${applied}; ignorati/non riconosciuti: ${skipped}${runtimeNote}.`, "ok");
    window.SynthXLogger?.log("preset/patch loaded", preset.name, { applied, skipped, skippedRuntime, format: preset.presetFormatVersion });
  }

  function loadLocal() {
    let stored = null;
    try { stored = readStorageText(LOCAL_PATCH_STORAGE_KEY, LEGACY_LOCAL_PATCH_STORAGE_KEYS); }
    catch (err) { setStatus(`Archivio locale non disponibile: ${err.message}`, "error"); return; }
    if (!stored?.text) { setStatus("Nessuna patch locale salvata in questo browser.", "warn"); return; }
    try {
      applyPresetObject(JSON.parse(stored.text));
      if (stored.legacy) {
        try { writeStorageText(LOCAL_PATCH_STORAGE_KEY, stored.text, LEGACY_LOCAL_PATCH_STORAGE_KEYS); } catch (_) {}
        setStatus("Patch locale legacy SynthX caricata e migrata alla chiave Sorgiva Synth; copia legacy preservata.", "ok");
      }
    }
    catch (err) { setStatus(`Errore caricamento locale: ${err.message}`, "error"); }
  }

  async function applySelectedFile() {
    const input = document.getElementById("preset-file");
    const file = input?.files?.[0];
    if (!file) { setStatus("Scegli prima un file JSON.", "warn"); return; }
    try {
      const text = await file.text();
      applyPresetObject(JSON.parse(text));
    } catch (err) {
      setStatus(`Errore import patch: ${err.message}`, "error");
      window.SynthXLogger?.error("patch import error", err);
    }
  }

  function bind(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  }

  function init() {
    const storageOk = checkLocalStorageAvailable();
    if (!storageOk) setStatus("localStorage non disponibile: preset utente, preferiti e patch locali potrebbero non persistere.", "warn");
    loadFavoritesStore();
    loadUserBank();
    pruneFavoritesStore();
    populateFactoryCategoryFilter();
    populateUserCategorySuggestions();

    bind("factory-load", loadFactoryPreset);
    bind("factory-save-copy-user", saveFactoryCopyAsUser);
    bind("factory-favorite-toggle", toggleSelectedFactoryFavorite);
    bind("factory-copy-json", copyFactoryJson);
    bind("factory-export-json", exportFactoryJson);
    bind("factory-reset-filters", resetFactoryBrowserFilters);
    document.getElementById("factory-category")?.addEventListener("change", () => renderFactoryPresetList());
    document.getElementById("factory-search")?.addEventListener("input", () => renderFactoryPresetList());
    document.getElementById("factory-sort")?.addEventListener("change", () => renderFactoryPresetList());
    document.getElementById("factory-favorites-only")?.addEventListener("change", () => renderFactoryPresetList());
    document.getElementById("factory-preset")?.addEventListener("change", updateFactoryPresetInfo);
    document.getElementById("factory-preset")?.addEventListener("dblclick", loadFactoryPreset);
    renderFactoryPresetList();

    bind("user-save-current", () => saveCurrentAsUser());
    bind("user-overwrite", overwriteSelectedUser);
    bind("user-load", loadSelectedUser);
    bind("user-rename", renameSelectedUser);
    bind("user-duplicate", duplicateSelectedUser);
    bind("user-favorite-toggle", toggleSelectedUserFavorite);
    bind("user-delete", deleteSelectedUser);
    bind("user-reset-filters", resetUserBrowserFilters);
    bind("user-export-bank", exportUserBank);
    bind("user-import-bank", importUserBank);
    bind("user-reset-bank", resetUserBank);
    document.getElementById("user-category-filter")?.addEventListener("change", () => renderUserPresetList());
    document.getElementById("user-search")?.addEventListener("input", () => renderUserPresetList());
    document.getElementById("user-sort")?.addEventListener("change", () => renderUserPresetList());
    document.getElementById("user-favorites-only")?.addEventListener("change", () => renderUserPresetList());
    document.getElementById("user-preset-list")?.addEventListener("change", updateUserPresetInfo);
    document.getElementById("user-preset-list")?.addEventListener("dblclick", loadSelectedUser);
    document.getElementById("user-import-bank-file")?.addEventListener("change", (event) => setStatus(`Bank file selezionato: ${event.target.files?.[0]?.name || "nessuno"}`, "info"));
    renderUserPresetList();

    bind("preset-export", exportJson);
    bind("preset-apply-file", applySelectedFile);
    bind("preset-save-local", saveLocal);
    bind("preset-load-local", loadLocal);
    bind("preset-copy-json", copyJson);
    bind("preset-refresh-preview", () => { updatePreview(); setStatus("Preview JSON aggiornata.", "ok"); });
    bind("ab-store-a", () => captureAbSlot("a"));
    bind("ab-store-b", () => captureAbSlot("b"));
    bind("ab-load-a", () => loadAbSlot("a"));
    bind("ab-load-b", () => loadAbSlot("b"));
    bind("ab-copy-a-b", () => copyAbSlot("a", "b"));
    bind("ab-copy-b-a", () => copyAbSlot("b", "a"));
    bind("ab-swap", swapAbSlots);
    bind("ab-clear", clearAbSlots);
    const file = document.getElementById("preset-file");
    if (file) file.addEventListener("change", () => setStatus(`File selezionato: ${file.files?.[0]?.name || "nessuno"}`, "info"));
    getSoundControls().forEach((element) => {
      element.addEventListener("input", () => updatePreview());
      element.addEventListener("change", () => updatePreview());
    });
    PERFORMANCE_BUTTONS.forEach((item) => document.getElementById(item.id)?.addEventListener("click", () => updatePreview()));
    updatePreview();
    window.SynthXLogger?.log("Preset Manager Plus pronto", { format: PRESET_FORMAT_VERSION, factoryCount: FACTORY_PRESETS.length, userCount: USER_BANK.length });
  }

  window.SynthXPresets = {
    init,
    buildPresetObject,
    exportJson,
    saveLocal,
    loadLocal,
    applyPresetObject,
    applySelectedFile,
    updatePreview,
    getFactoryPresets: () => FACTORY_PRESETS.slice(),
    getUserPresets: () => USER_BANK.slice(),
    getFavoritesSummary: () => ({ factory: Object.keys(FAVORITES.factory || {}).length, user: Object.keys(FAVORITES.user || {}).length }),
    exportUserBank,
    importUserBank,
    resetUserBank,
    captureAbSlot,
    loadAbSlot,
    copyAbSlot,
    swapAbSlots,
    clearAbSlots,
    getAbCompareSummary,
    getAbSlot,
    setAbSlot,
    getFormatVersion: () => PRESET_FORMAT_VERSION
  };
})();
