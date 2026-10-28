(function () {
  "use strict";
  function priority(voice, isHeld) {
    if (!voice) return 99;
    const held = Boolean(isHeld(voice));
    if (voice.sustained && !held) return 0;
    if (!held) return 1;
    if (voice.sustained) return 2;
    return 3;
  }
  function compare(a, b, now, isHeld, level) {
    const rank = priority(a, isHeld) - priority(b, isHeld);
    if (rank) return rank;
    const aScore = Math.round(Math.min(1, Math.max(0, level(a, now))) * 1000);
    const bScore = Math.round(Math.min(1, Math.max(0, level(b, now))) * 1000);
    if (aScore !== bScore) return aScore - bScore;
    const ageA = Number.isFinite(a.startedAt) ? a.startedAt : 0;
    const ageB = Number.isFinite(b.startedAt) ? b.startedAt : 0;
    if (ageA !== ageB) return ageA - ageB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  }
  function candidates(voices, at, isHeld, level) {
    return Array.from(voices).sort((a, b) => compare(a, b, at, isHeld, level));
  }
  // Exact same comparator and tie-breaking as candidates(), but O(n) time
  // and constant auxiliary storage when only one victim is required.
  function pick(voices, at, isHeld, level) {
    let best = null;
    for (const voice of voices) if (voice && (best === null || compare(voice, best, at, isHeld, level) < 0)) best = voice;
    return best;
  }
  window.SorgivaSynthVoiceAllocator = Object.freeze({ priority, candidates, pick });
})();
