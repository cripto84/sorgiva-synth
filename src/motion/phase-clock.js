(function () {
  "use strict";
  // Absolute-deadline timer: compensates for callback execution time without
  // emitting rapid catch-up bursts following a suspended/throttled browser tab.
  function nextDeadline(lastBoundaryMs, nowMs, intervalMs) {
    const interval = Number(intervalMs);
    const now = Number(nowMs);
    if (!Number.isFinite(now) || !Number.isFinite(interval) || interval <= 0) return null;
    const base = Number.isFinite(lastBoundaryMs) ? lastBoundaryMs : now;
    const proposed = base + interval;
    // Skip missed ticks after a long suspension. Re-sync rather than replay a burst.
    return proposed > now ? proposed : now + interval;
  }
  function remaining(deadlineMs, nowMs) {
    return Math.max(1, Number(deadlineMs) - Number(nowMs));
  }
  window.SorgivaSynthPhaseClock = Object.freeze({ nextDeadline, remaining });
})();
