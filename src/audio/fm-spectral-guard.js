/* Sorgiva Synth alpha8: optional high-note FM sideband budget.
 * This conservative estimator is not anti-aliasing or oversampling; it
 * lowers the FM deviation when the approximate upper sidebands approach
 * Nyquist. Classic mode returns the unmodified value, bit-for-bit.
 */
(function () {
  'use strict';
  const stats = { evaluations: 0, reduced: 0, classic: 0 };
  function depth(baseHz, carrierHz, modulatorHz, sampleRate, quality) {
    if (quality !== 'guarded') { stats.classic++; return baseHz; }
    const dev = Number(baseHz), fc = Math.abs(Number(carrierHz)), fm = Math.abs(Number(modulatorHz));
    const rate = Number(sampleRate);
    if (![dev, fc, fm, rate].every(Number.isFinite) || dev <= 0 || fm <= 0 || rate <= 0) return baseHz;
    stats.evaluations++;
    // Carson-style upper sideband estimate (f_carrier + deviation + 2*f_mod).
    // Deliberately keep a margin from the Nyquist boundary; this cannot
    // suppress every high-order sideband, especially for non-sine modulators.
    const maxDeviationHz = Math.max(0, (rate * .44) - fc - (2 * fm));
    const result = Math.min(dev, maxDeviationHz);
    if (result < dev) stats.reduced++;
    return result;
  }
  window.SorgivaFmSpectralGuard = { depth, diagnostics: () => ({ ...stats }) };
})();
