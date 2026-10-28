(function () {
  "use strict";

  const DEFAULT_FPS = 20;
  const BAR_COUNT = 48;
  const SILENCE_THRESHOLD = 6;

  let canvas = null;
  let ctx = null;
  let enabled = true;
  let rafId = null;
  let lastFrameAt = 0;
  let buffer = null;
  let analyserRef = null;
  let lastPeak = 0;
  let lastPeakHz = 0;
  let lastEnergy = 0;
  let lastStateUpdateAt = 0;
  let lastSignalState = "";

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function getStatusEl() {
    return document.getElementById("spectrum-status");
  }

  function setStatus(text, kind) {
    const el = getStatusEl();
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind || "info";
  }

  function getCanvasSize() {
    if (!canvas) return { width: 220, height: 118, scale: 1 };
    const rect = canvas.getBoundingClientRect?.() || { width: canvas.width || 220, height: canvas.height || 118 };
    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(80, Math.round((rect.width || 220) * scale));
    const height = Math.max(48, Math.round((rect.height || 118) * scale));
    return { width, height, scale };
  }

  function resize() {
    if (!canvas || !ctx) return;
    const { width, height } = getCanvasSize();
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function clearCanvas(message) {
    if (!ctx || !canvas) return;
    resize();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f16";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(228, 196, 111, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    for (let y = 1; y < 4; y += 1) {
      const py = (h * y) / 4;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
      ctx.stroke();
    }
    if (message) {
      ctx.fillStyle = "rgba(238, 242, 248, 0.72)";
      ctx.font = `${Math.max(10, Math.round(h * 0.095))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(message, w / 2, h / 2 - 7);
    }
  }

  function getAnalyser() {
    const analyser = window.SynthXAudio?.getScopeAnalyser?.() || window.SynthXAudio?.getSafetyAnalyser?.() || null;
    if (analyser && analyser !== analyserRef) {
      analyserRef = analyser;
      buffer = new Uint8Array(analyser.frequencyBinCount || Math.max(1, Math.floor((analyser.fftSize || 512) / 2)));
    }
    return analyser;
  }

  function frequencyForBin(bin, analyser, audioContext) {
    const sampleRate = Number(audioContext?.sampleRate || 44100);
    const fftSize = Number(analyser?.fftSize || 512);
    return (Number(bin) * sampleRate) / Math.max(1, fftSize);
  }

  function formatHz(hz) {
    if (!Number.isFinite(hz) || hz <= 0) return "--";
    if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`;
    return `${Math.round(hz)} Hz`;
  }

  function updateState(patch, options) {
    const nextSignalState = patch?.spectrumSignalState || lastSignalState || "unknown";
    const ts = typeof performance?.now === "function" ? performance.now() : Date.now();
    const force = Boolean(options?.force) || nextSignalState !== lastSignalState || (ts - lastStateUpdateAt) >= 700;
    if (!force) return;
    lastStateUpdateAt = ts;
    lastSignalState = nextSignalState;
    window.SynthXState?.updateVisuals?.({
      spectroscopeEnabled: enabled,
      spectroscopeMode: "spectrum",
      spectroscopeFps: DEFAULT_FPS,
      spectroscopePeak: Number(lastPeak.toFixed(3)),
      spectroscopePeakHz: Math.round(lastPeakHz || 0),
      spectroscopeEnergy: Number(lastEnergy.toFixed(3)),
      ...(patch || {})
    });
  }

  function drawBars(analyser, audioContext) {
    if (!buffer || buffer.length !== analyser.frequencyBinCount) buffer = new Uint8Array(analyser.frequencyBinCount || 256);
    analyser.getByteFrequencyData(buffer);

    resize();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f16";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    ctx.lineWidth = 1;
    for (let y = 1; y < 4; y += 1) {
      const py = (h * y) / 4;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    const bins = buffer.length;
    const usableBins = Math.max(1, Math.floor(bins * 0.92));
    const barGap = Math.max(1, Math.round(w / 180));
    const barWidth = Math.max(1, (w - (BAR_COUNT - 1) * barGap) / BAR_COUNT);
    let peak = 0;
    let peakBin = 0;
    let sum = 0;

    for (let bar = 0; bar < BAR_COUNT; bar += 1) {
      const startRatio = (bar / BAR_COUNT) ** 2.1;
      const endRatio = ((bar + 1) / BAR_COUNT) ** 2.1;
      const start = Math.min(usableBins - 1, Math.floor(startRatio * usableBins));
      const end = Math.max(start + 1, Math.min(usableBins, Math.ceil(endRatio * usableBins)));
      let local = 0;
      for (let i = start; i < end; i += 1) {
        const v = buffer[i] || 0;
        if (v > local) local = v;
        if (v > peak) { peak = v; peakBin = i; }
        sum += v;
      }
      const normalized = clamp(local / 255, 0, 1);
      const eased = Math.sqrt(normalized);
      const bh = Math.max(1, eased * (h - 12));
      const x = bar * (barWidth + barGap);
      const y = h - bh - 4;
      ctx.fillStyle = "rgba(228, 196, 111, 0.82)";
      ctx.fillRect(x, y, barWidth, bh);
      if (normalized > 0.72) {
        ctx.fillStyle = "rgba(255, 245, 185, 0.48)";
        ctx.fillRect(x, Math.max(4, y - 2), barWidth, 2);
      }
    }

    lastPeak = peak / 255;
    lastPeakHz = frequencyForBin(peakBin, analyser, audioContext);
    lastEnergy = sum / Math.max(1, usableBins * 255);

    ctx.strokeStyle = "rgba(228, 196, 111, 0.24)";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return peak;
  }

  function drawFrame(timestamp) {
    rafId = null;
    if (!enabled) {
      clearCanvas("Spectrum OFF");
      setStatus("Spectrum: OFF", "info");
      updateState({ running: false, spectrumSignalState: "off" }, { force: true });
      return;
    }
    if (document.hidden) {
      schedule();
      return;
    }
    if (timestamp && lastFrameAt && (timestamp - lastFrameAt) < (1000 / DEFAULT_FPS)) {
      schedule();
      return;
    }
    lastFrameAt = timestamp || performance.now();

    const audioContext = window.SynthXAudio?.getContext?.() || null;
    const analyser = getAnalyser();
    if (!audioContext || !analyser || audioContext.state !== "running") {
      clearCanvas("In attesa audio");
      setStatus("Spectrum: in attesa audio", "warn");
      updateState({ running: false, spectrumSignalState: "waiting" });
      schedule();
      return;
    }

    const peak = drawBars(analyser, audioContext);
    const active = peak > SILENCE_THRESHOLD;
    setStatus(active ? `Spectrum: picco ${formatHz(lastPeakHz)}` : "Spectrum: idle", active ? "ok" : "info");
    updateState({ running: true, spectrumSignalState: active ? "active" : "idle" });
    schedule();
  }

  function schedule() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(drawFrame);
  }

  function stopLoop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setEnabled(value, source) {
    enabled = Boolean(value);
    if (!enabled) {
      stopLoop();
      clearCanvas("Spectrum OFF");
      setStatus("Spectrum: OFF", "info");
      updateState({ running: false, spectrumSignalState: "off", lastAction: source || "spectrum-off" }, { force: true });
      return;
    }
    updateState({ running: false, spectrumSignalState: "waiting", lastAction: source || "spectrum-on" }, { force: true });
    schedule();
  }

  function onControlChange(id, value) {
    if (id !== "spectrum-enabled") return;
    const raw = value !== undefined ? value : window.SynthXState?.getParameter?.("spectrum-enabled");
    setEnabled(raw !== false, "control-change");
  }

  function handleVisibilityChange() {
    if (document.hidden) return;
    if (enabled) schedule();
  }

  function init() {
    canvas = document.getElementById("spectrum-canvas");
    if (!canvas || typeof canvas.getContext !== "function") {
      setStatus("Spectrum: canvas non disponibile", "warn");
      return false;
    }
    ctx = canvas.getContext("2d", { alpha: false });
    enabled = window.SynthXState?.getParameter?.("spectrum-enabled") !== false;
    resize();
    clearCanvas(enabled ? "In attesa audio" : "Spectrum OFF");
    setStatus(enabled ? "Spectrum: in attesa audio" : "Spectrum: OFF", enabled ? "warn" : "info");
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    updateState({ running: false, spectrumSignalState: enabled ? "waiting" : "off", lastAction: "init" }, { force: true });
    if (enabled) schedule();
    window.SynthXLogger?.log("Micro spettroscopio pronto", { enabled, fps: DEFAULT_FPS, bars: BAR_COUNT });
    return true;
  }

  function refresh() {
    onControlChange("spectrum-enabled");
  }

  window.SynthXSpectroscope = {
    init,
    refresh,
    onControlChange,
    setEnabled,
    resize,
    getPeak: () => lastPeak,
    getPeakHz: () => lastPeakHz,
    getEnergy: () => lastEnergy,
    isEnabled: () => enabled,
    isRunning: () => rafId !== null
  };
})();
