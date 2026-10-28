/* Alpha8: radix-2 Fourier analysis of the 2048-sample Sync waveform.
 * Returns the same coefficient convention as the legacy direct DFT:
 * real[h]=2/N sum(x[n]*cos(2*pi*h*n/N));
 * imag[h]=2/N sum(x[n]*sin(2*pi*h*n/N)).
 * Coefficients go into native PeriodicWave, which performs harmonic
 * band-limiting on supported WebAudio implementations.
 */
(function () {
  'use strict';
  const stats = { transforms: 0 };
  function compute(values, harmonics) {
    const n = values?.length || 0;
    if (n < 2 || n > 8192 || (n & (n - 1)) !== 0) return null;
    const max = Math.min(Math.max(0, Math.floor(harmonics)), n / 2 - 1);
    const re = new Float64Array(n), im = new Float64Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += values[i];
    mean /= n;
    let bits = 0;
    for (let t = n; t > 1; t >>= 1) bits++;
    for (let i = 0; i < n; i++) {
      let reversed = 0, x = i;
      for (let b = 0; b < bits; b++) { reversed = (reversed << 1) | (x & 1); x >>= 1; }
      re[reversed] = values[i] - mean;
    }
    for (let length = 2; length <= n; length *= 2) {
      const angleStep = -2 * Math.PI / length;
      for (let start = 0; start < n; start += length) {
        for (let k = 0; k < length / 2; k++) {
          const a = angleStep * k;
          const wr = Math.cos(a), wi = Math.sin(a);
          const p = start + k, q = p + length / 2;
          const tr = wr * re[q] - wi * im[q], ti = wr * im[q] + wi * re[q];
          re[q] = re[p] - tr; im[q] = im[p] - ti;
          re[p] += tr; im[p] += ti;
        }
      }
    }
    const real = new Float32Array(max + 1), imag = new Float32Array(max + 1);
    for (let h = 1; h <= max; h++) {
      real[h] = (2 / n) * re[h];
      imag[h] = (-2 / n) * im[h];
    }
    stats.transforms++;
    return { real, imag };
  }
  window.SorgivaOscSyncSpectrum = { compute, diagnostics: () => ({ ...stats }) };
})();
