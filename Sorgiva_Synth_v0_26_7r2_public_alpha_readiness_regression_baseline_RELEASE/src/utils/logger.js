(function () {
  "use strict";

  const prefix = "[Sorgiva Synth]";
  const STORAGE_KEY = "sorgiva-synth.debug";

  function readDebugFlag() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("sorgivaDebug") === "1" || params.get("sorgivaSynthDebug") === "1" || params.get("synthxDebug") === "1" || params.get("debug") === "1") return true;
    } catch (err) {
      // Ignore URL parsing failures and keep quiet default logging.
    }

    try {
      const stored = window.localStorage?.getItem?.(STORAGE_KEY);
      if (stored === "1" || stored === "true") return true;
      if (stored === "0" || stored === "false") return false;
    } catch (err) {
      // localStorage may be unavailable in strict/private contexts.
    }

    return Boolean(window.SORGIVA_SYNTH_DEBUG || window.SYNTHX_DEBUG);
  }

  let debugEnabled = readDebugFlag();

  function setDebug(enabled) {
    debugEnabled = Boolean(enabled);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, debugEnabled ? "1" : "0");
    } catch (err) {
      // Non-fatal: debug can still be toggled for the current session.
    }
    return debugEnabled;
  }

  window.SynthXLogger = {
    isDebug: () => debugEnabled,
    setDebug,
    log: (...args) => { if (debugEnabled) console.log(prefix, ...args); },
    debug: (...args) => { if (debugEnabled) console.debug(prefix, ...args); },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args)
  };
})();
