/* Sorgiva Synth alpha7 – opt-in band-limited Pulse/PWM approximation.
 * Difference of one native band-limited saw and a modulated, delayed copy.
 * The delay represents phase offset (duty cycle) in seconds. A single saw
 * feeds both branches: oscillator phases stay coherent with one another.
 * Legacy WaveShaper remains the default, including unsupported settings.
 */
(function () {
  "use strict";
  const stats = { created: 0, rejected: 0, dynamic: 0 };
  function finite(v) { return Number.isFinite(Number(v)); }
  function canUse(config, frequency, lfoConfigs) {
    const width = Number(config.pulseWidth);
    const amount = config.pwmSource === "off" ? 0 : Math.max(0, Number(config.pwmAmount) || 0);
    const match = String(config.pwmSource || "off").match(/^lfo([123])$/);
    const lfo = match ? lfoConfigs?.[Number(match[1]) - 1] : null;
    const activeAmount = lfo?.enabled && amount > 0 ? amount : 0;
    // No clipping of the audio-rate width at the extreme PWM settings:
    // use the proven classic generator rather than introducing discontinuities.
    return finite(frequency) && frequency >= 25 && frequency <= 16000 &&
      finite(width) && width >= .05 && width <= .95 &&
      width - activeAmount >= .05 - 1e-9 && width + activeAmount <= .95 + 1e-9;
  }
  function create(ctx, oscillator, cfg, frequency, lfoConfigs, when, waveSetter) {
    if (!ctx || !oscillator || !canUse(cfg, frequency, lfoConfigs) ||
        typeof ctx.createDelay !== "function") { stats.rejected++; return null; }
    const t = Number.isFinite(when) ? when : ctx.currentTime;
    const width = Number(cfg.pulseWidth);
    const lfoMatch = String(cfg.pwmSource || "off").match(/^lfo([123])$/);
    const lfoIndex = lfoMatch ? Number(lfoMatch[1]) : null;
    const lfo = lfoIndex ? lfoConfigs?.[lfoIndex - 1] : null;
    const amount = lfo?.enabled ? Math.max(0, Number(cfg.pwmAmount) || 0) : 0;
    const maxDelay = Math.max(.008, Math.min(.25, 2.2 / frequency));
    const delay = ctx.createDelay(maxDelay);
    const negative = ctx.createGain();
    const output = ctx.createGain();
    negative.gain.setValueAtTime(-1, t);
    delay.delayTime.setValueAtTime(width / frequency, t);
    oscillator.connect(output);
    oscillator.connect(delay);
    delay.connect(negative);
    negative.connect(output);
    let pwmOsc = null, pwmGain = null;
    if (lfo && amount > 0) {
      pwmOsc = ctx.createOscillator();
      pwmGain = ctx.createGain();
      // The LFO moves the phase displacement in seconds, not an audio-rate
      // WaveShaper threshold. DelayNode interpolation may add sidebands;
      // this is not claimed to be mathematically alias-free under modulation.
      waveSetter(pwmOsc, lfo.wave || "sine");
      pwmOsc.frequency.setValueAtTime(Math.min(40, Math.max(.01, Number(lfo.effectiveRate || lfo.rate || 1))), t);
      pwmGain.gain.setValueAtTime(amount / frequency, t);
      pwmOsc.connect(pwmGain);
      pwmGain.connect(delay.delayTime);
      pwmOsc.start(t);
      stats.dynamic++;
    }
    stats.created++;
    return {
      pulseShaper: output, pulseBiasSource: null, pwmOsc, pwmGain,
      pwmLfoIndex: pwmOsc ? lfoIndex : null, pulseDelay: delay, pulseNegative: negative,
      pulseQuality: "bandlimited", baseWidth: width, pwmAmount: amount,
      // Frequency changes (pitch bend, portamento) require phase-delay
      // rescaling. Calls from UI carry the new frequency, not a duty percent.
      scheduleGlide(startHz, endHz, at, duration) {
        if (!finite(startHz) || !finite(endHz) || startHz <= 0 || endHz <= 0) return;
        const t0 = Number.isFinite(at) ? at : ctx.currentTime;
        const span = Math.max(0, Number(duration) || 0);
        delay.delayTime.cancelScheduledValues(t0);
        delay.delayTime.setValueAtTime(Math.min(maxDelay, width / startHz), t0);
        delay.delayTime.linearRampToValueAtTime(Math.min(maxDelay, width / endHz), t0 + span);
        if (pwmGain) {
          pwmGain.gain.cancelScheduledValues(t0);
          pwmGain.gain.setValueAtTime(amount / startHz, t0);
          pwmGain.gain.linearRampToValueAtTime(amount / endHz, t0 + span);
        }
      },
      setFrequency(newHz, at, duration) {
        if (!finite(newHz) || newHz < 25) return;
        const time = Number.isFinite(at) ? at : ctx.currentTime;
        const seconds = Math.max(0, Number(duration) || 0);
        const target = Math.min(maxDelay, width / newHz);
        delay.delayTime.cancelScheduledValues(time);
        if (seconds) {
          delay.delayTime.setValueAtTime(Math.min(maxDelay, width / frequency), time);
          delay.delayTime.linearRampToValueAtTime(target, time + seconds);
        } else delay.delayTime.setTargetAtTime(target, time, .012);
        if (pwmGain) pwmGain.gain.setTargetAtTime(amount / newHz, time, .012);
      }
    };
  }
  window.SorgivaPulseBandlimited = { create, canUse, diagnostics: () => ({ ...stats }) };
})();
