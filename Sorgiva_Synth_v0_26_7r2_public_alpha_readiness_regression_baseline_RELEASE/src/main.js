(function () {
  "use strict";
  function init() {
    window.SorgivaSynth?.syncLegacyGlobals?.();
    window.SorgivaSynth?.Logger?.log?.("Avvio Sorgiva Synth v0.26.7r2 Public Alpha Readiness & Regression Baseline");
    window.SynthXTabs.init();
    window.SynthXControls.init();
    window.SynthXArpeggiator?.init?.();
    window.SynthXSequencer?.init?.();
    window.SynthXMotion?.init?.();
    window.SynthXKeyboard.init();
    window.SynthXOscilloscope?.init?.();
    window.SynthXSpectroscope?.init?.();
    window.SynthXPresets?.init?.();
    window.SynthXRandomizer?.init?.();
    window.SynthXPresetMorph?.init?.();
    window.SynthXMidiClock?.init?.();
    window.SynthXMidiLearn?.init?.();
    window.SynthXMidi?.init?.();
    const unlock = document.getElementById("audio-unlock");
    if (unlock) unlock.addEventListener("click", () => window.SynthXAudio.unlock());
    window.SynthXState.subscribe((id, value, meta) => {
      if (["visuals-runtime", "motion-runtime", "midi-learn-runtime", "tuning-runtime", "modulation-matrix-runtime"].includes(meta?.source)) return;
      if (meta?.source !== "init") window.SynthXLogger?.log("param", id, value);
      window.SynthXAudio?.onParameterChange?.(id, value, meta || {});
    });
    window.SorgivaSynth?.syncLegacyGlobals?.();
    window.SorgivaSynth?.Logger?.log?.("Sorgiva Synth v0.26.7r2 pronto", window.SorgivaSynth?.State?.snapshot?.() || window.SynthXState.snapshot());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
