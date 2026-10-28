(function () {
  "use strict";
  // Per-voice ownership of retirement and final node cleanup. A single timer per
  // retired voice replaces independent tail accounting and graph teardown timers.
  // All callbacks are guarded against duplicate disposal/re-entrant calls.
  function create(clock) {
    const records = new Map();
    let disposed = 0;
    let retiredTotal = 0;
    function markActive(voice) {
      if (!voice || records.has(voice)) return false;
      voice.lifecycle = "active";
      records.set(voice, { state: "active", timer: null, due: null, cleanup: null });
      return true;
    }
    function retire(voice, delaySeconds, cleanup, releaseAtSeconds) {
      if (!voice) return false;
      if (!records.has(voice)) markActive(voice);
      const record = records.get(voice);
      if (record.state !== "active") return false;
      record.state = "release";
      record.cleanup = typeof cleanup === "function" ? cleanup : () => {};
      const audio = clock();
      const running = Boolean(audio && audio.state === "running");
      const delay = Math.max(0, Math.min(120, Number(delaySeconds) || 0));
      // The release itself may be scheduled in the future by AudioParam automation.
      // Retirement must include the period BEFORE that release begins.
      const current = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : null;
      const releaseAt = Number.isFinite(releaseAtSeconds) && current !== null
        ? Math.max(current, releaseAtSeconds) : current;
      const waitSeconds = delay + (releaseAt !== null ? Math.max(0, releaseAt - current) : 0);
      record.due = releaseAt !== null ? releaseAt + delay : null;
      record.wallDeadline = Date.now() + (waitSeconds * 1000);
      record.hardDeadline = Date.now() + Math.max(30000, (waitSeconds + 30) * 1000);
      voice.lifecycle = "release";
      retiredTotal++;
      function finish() {
        if (record.state === "disposed") return;
        record.state = "disposed";
        voice.lifecycle = "disposed";
        if (record.timer !== null) clearTimeout(record.timer);
        record.timer = null;
        try { record.cleanup(); } finally { records.delete(voice); disposed++; }
      }
      function tick() {
        record.timer = null;
        if (record.state !== "release") return;
        const ctx = clock();
        const timeNow = Date.now();
        if (timeNow >= record.hardDeadline) { finish(); return; }
        if (record.due !== null && ctx && Number.isFinite(ctx.currentTime)) {
          if (ctx.currentTime >= record.due && (ctx.state === "running" || ctx.state === "closed")) { finish(); return; }
          // An AudioContext in suspended state does not advance its time.
          // Keep the graph until resume, but avoid a busy polling loop.
          const remaining = Math.max(10, (record.due - ctx.currentTime) * 1000);
          record.timer = setTimeout(tick, ctx.state === "suspended" ? 500 : Math.min(1000, remaining));
        } else if (timeNow >= record.wallDeadline) finish();
        else record.timer = setTimeout(tick, Math.min(1000, Math.max(10, record.wallDeadline - timeNow)));
      }
      record.tick = tick;
      record.timer = setTimeout(tick, Math.max(1, Math.ceil(waitSeconds * 1000)));
      return true;
    }
    // The voice graph must already have a smooth output fade and its sources
    // rescheduled to stop before the shortened deadline. Never disconnect early.
    function expedite(voice, seconds) {
      const record = records.get(voice);
      const audio = clock();
      if (!record || record.state !== "release" || !audio || audio.state !== "running" || !Number.isFinite(audio.currentTime)) return false;
      const delay = Math.max(0.025, Math.min(2, Number(seconds) || 0.06));
      const earlierDue = audio.currentTime + delay;
      if (record.due === null || record.due <= earlierDue) return false;
      record.due = earlierDue;
      record.wallDeadline = Date.now() + delay * 1000;
      if (record.timer !== null) clearTimeout(record.timer);
      record.timer = setTimeout(record.tick, Math.max(1, Math.ceil(delay * 1000)));
      return true;
    }
    function stats() {
      let active = 0, releasing = 0;
      records.forEach(record => { if (record.state === "active") active++; if (record.state === "release") releasing++; });
      return { active, releasing, tracked: records.size, disposed, retiredTotal };
    }
    return Object.freeze({ markActive, retire, expedite, stats });
  }
  window.SorgivaSynthVoiceLifecycle = Object.freeze({ create });
})();
