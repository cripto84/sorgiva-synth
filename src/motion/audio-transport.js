(function () {
  "use strict";
  // UI-thread scheduling: advance preparation is possible, but the actual
  // Note On/Off still dispatches from JS at its audio-clock deadline.
  // Not sample accurate; do not synthesize note onsets during prepare().
  const counters = { dispatched: 0, prepared: 0, late: 0, maximumLateMs: 0, totalLateMs: 0, cancelled: 0 };
  function snapshot(domain) {
    const ctx = window.SynthXAudio?.getContext?.();
    if (domain === "wall") return { domain: "wall", ms: performance.now(), audioState: ctx?.state || "unavailable" };
    if (ctx && (ctx.state === "running" || ctx.state === "suspended") && Number.isFinite(ctx.currentTime)) {
      return { domain: "audio", ms: ctx.currentTime * 1000, audioState: ctx.state };
    }
    return { domain: "wall", ms: performance.now(), audioState: ctx?.state || "unavailable" };
  }
  function deadline(boundary, current, period) {
    const ms = Number(period), now = Number(current);
    if (!Number.isFinite(ms) || ms <= 0 || !Number.isFinite(now)) return null;
    const next = (Number.isFinite(boundary) ? boundary : now) + ms;
    return next > now ? next : now + ms;
  }
  function waitUntil(dueMs, domain, current, callback, setHandle, isCurrent, options) {
    const due = Number(dueMs), opts = options || {};
    const advance = typeof opts.prepare === "function" ? Math.max(0, Math.min(120, Number(opts.lookaheadMs) || 75)) : 0;
    if (!Number.isFinite(due)) return null;
    let didPrepare = false;
    function tick() {
      if (!isCurrent()) { counters.cancelled++; return; }
      const ctx = window.SynthXAudio?.getContext?.();
      if (domain === "audio" && ctx?.state === "closed") { setHandle(null); return; }
      if (domain === "audio" && ctx && ctx.state !== "running") {
        setHandle(setTimeout(tick, 150));
        return;
      }
      const live = snapshot(domain);
      if (domain === "audio" && live.domain !== "audio") { setHandle(setTimeout(tick, 150)); return; }
      const left = due - live.ms;
      if (!didPrepare && advance && left <= advance && left > 0) {
        didPrepare = true;
        try { opts.prepare({ dueMs: due, domain, remainingMs: left }); counters.prepared++; }
        catch (err) { window.SynthXLogger?.warn?.("Transport lookahead preparation error", err); }
      }
      if (left > 0.50) {
        // Wake ahead of the deadline for preparation, but never dispatch a
        // note early. Timer clamping and tab throttling can still cause jitter.
        const next = !didPrepare && advance && left > advance ? left - advance : left;
        setHandle(setTimeout(tick, Math.max(1, Math.min(2000, next > 3 ? next - 1 : next))));
        return;
      }
      counters.dispatched++;
      const late = Math.max(0, -left);
      counters.maximumLateMs = Math.max(counters.maximumLateMs, late);
      counters.totalLateMs += late;
      if (late > 4) counters.late++;
      callback({ dueMs: due, domain, lateMs: late, prepared: didPrepare });
    }
    const left = due - Number(current);
    const next = advance && left > advance ? left - advance : left;
    const handle = setTimeout(tick, Math.max(1, Math.min(2000, next)));
    setHandle(handle);
    return handle;
  }
  function diagnostics() {
    return Object.freeze({ ...counters, meanLateMs: counters.dispatched ? counters.totalLateMs / counters.dispatched : 0 });
  }
  function resetDiagnostics() {
    Object.keys(counters).forEach((key) => { counters[key] = 0; });
  }
  window.SorgivaSynthAudioTransport = Object.freeze({ snapshot, deadline, waitUntil, diagnostics, resetDiagnostics });
})();
