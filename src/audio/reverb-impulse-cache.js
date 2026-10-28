(function () {
  "use strict";
  // A ConvolverNode AudioBuffer must never be shared across audio contexts.
  // WeakMap allows unused AudioContexts to be garbage collected.
  const contexts = new WeakMap();
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_ENTRIES = 5;
  function create(context, key, generate) {
    if (!context || typeof generate !== "function") return null;
    let cache = contexts.get(context);
    if (!cache) { cache = { entries: new Map(), bytes: 0, hits: 0, misses: 0, evictions: 0 }; contexts.set(context, cache); }
    const existing = cache.entries.get(key);
    if (existing) {
      cache.entries.delete(key); cache.entries.set(key, existing);
      cache.hits += 1;
      return existing.buffer;
    }
    // Do not cache invalid/failed allocations.
    const buffer = generate();
    if (!buffer || !(buffer.length > 0)) return buffer;
    cache.misses += 1;
    const bytes = (buffer.length || 0) * (buffer.numberOfChannels || 2) * 4;
    if (bytes <= MAX_BYTES) {
      while (cache.entries.size && (cache.entries.size >= MAX_ENTRIES || cache.bytes + bytes > MAX_BYTES)) {
        const firstKey = cache.entries.keys().next().value;
        const evicted = cache.entries.get(firstKey);
        cache.bytes -= evicted.bytes;
        cache.entries.delete(firstKey);
        cache.evictions += 1;
      }
      cache.entries.set(key, { buffer, bytes }); cache.bytes += bytes;
    }
    return buffer;
  }
  function stats(context) {
    const c = context ? contexts.get(context) : null;
    return Object.freeze({ entries: c?.entries.size || 0, bytes: c?.bytes || 0, hits: c?.hits || 0, misses: c?.misses || 0, evictions: c?.evictions || 0, maxBytes: MAX_BYTES });
  }
  window.SorgivaSynthReverbImpulseCache = Object.freeze({ getOrCreate: create, stats });
})();
