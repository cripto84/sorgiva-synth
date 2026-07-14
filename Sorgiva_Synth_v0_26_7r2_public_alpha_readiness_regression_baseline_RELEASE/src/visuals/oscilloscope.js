(function () {
  "use strict";

  const DEFAULT_FPS = 30;
  const SILENCE_THRESHOLD = 0.006;

  let canvas = null;
  let ctx = null;
  let enabled = true;
  let rafId = null;
  let lastFrameAt = 0;
  let buffer = null;
  let analyserRef = null;
  let lastPeak = 0;
  let lastRms = 0;
  let lastStateUpdateAt = 0;
  let lastSignalState = "";

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function getStatusEl() {
    return document.getElementById("scope-status");
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
    ctx.strokeStyle = "rgba(127, 208, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.strokeStyle = "rgba(228, 196, 111, 0.28)";
    ctx.stroke();
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
      buffer = new Uint8Array(analyser.fftSize || analyser.frequencyBinCount || 512);
    }
    return analyser;
  }

  function updateState(patch, options) {
    const nextSignalState = patch?.signalState || lastSignalState || "unknown";
    const ts = typeof performance?.now === "function" ? performance.now() : Date.now();
    const force = Boolean(options?.force) || nextSignalState !== lastSignalState || (ts - lastStateUpdateAt) >= 500;
    if (!force) return;
    lastStateUpdateAt = ts;
    lastSignalState = nextSignalState;
    window.SynthXState?.updateVisuals?.({
      oscilloscopeEnabled: enabled,
      oscilloscopeMode: "wave",
      oscilloscopeFps: DEFAULT_FPS,
      oscilloscopePeak: Number(lastPeak.toFixed(3)),
      oscilloscopeRms: Number(lastRms.toFixed(3)),
      ...(patch || {})
    });
  }

  function drawFrame(timestamp) {
    rafId = null;
    if (!enabled) {
      clearCanvas("Scope OFF");
      setStatus("Scope: OFF", "info");
      updateState({ running: false, signalState: "off" }, { force: true });
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
      setStatus("Scope: in attesa audio", "warn");
      updateState({ running: false, signalState: "waiting" });
      schedule();
      return;
    }

    if (!buffer || buffer.length !== analyser.fftSize) buffer = new Uint8Array(analyser.fftSize || 512);
    analyser.getByteTimeDomainData(buffer);

    resize();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f16";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 4; x += 1) {
      const px = (w * x) / 4;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let y = 1; y < 4; y += 1) {
      const py = (h * y) / 4;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.strokeStyle = "rgba(228, 196, 111, 0.30)";
    ctx.stroke();

    let peak = 0;
    let sumSq = 0;
    ctx.beginPath();
    const len = buffer.length;
    for (let i = 0; i < len; i += 1) {
      const normalized = (buffer[i] - 128) / 128;
      const abs = Math.abs(normalized);
      if (abs > peak) peak = abs;
      sumSq += normalized * normalized;
      const x = (i / Math.max(1, len - 1)) * w;
      const y = (0.5 - (normalized * 0.46)) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    lastPeak = peak;
    lastRms = Math.sqrt(sumSq / Math.max(1, len));

    ctx.strokeStyle = "rgba(127, 208, 255, 0.92)";
    ctx.lineWidth = Math.max(1.2, Math.round(h / 90));
    ctx.stroke();

    ctx.strokeStyle = "rgba(127, 208, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const active = lastRms > SILENCE_THRESHOLD || lastPeak > SILENCE_THRESHOLD * 2;
    setStatus(active ? `Scope: segnale · peak ${Math.round(clamp(lastPeak, 0, 1) * 100)}%` : "Scope: idle", active ? "ok" : "info");
    updateState({ running: true, signalState: active ? "active" : "idle" });
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
      clearCanvas("Scope OFF");
      setStatus("Scope: OFF", "info");
      updateState({ running: false, signalState: "off", lastAction: source || "scope-off" }, { force: true });
      return;
    }
    updateState({ running: false, signalState: "waiting", lastAction: source || "scope-on" }, { force: true });
    schedule();
  }

  function onControlChange(id, value) {
    if (id !== "scope-enabled") return;
    const raw = value !== undefined ? value : window.SynthXState?.getParameter?.("scope-enabled");
    setEnabled(raw !== false, "control-change");
  }

  function handleVisibilityChange() {
    if (document.hidden) return;
    if (enabled) schedule();
  }

  function init() {
    canvas = document.getElementById("scope-canvas");
    if (!canvas || typeof canvas.getContext !== "function") {
      setStatus("Scope: canvas non disponibile", "warn");
      return false;
    }
    ctx = canvas.getContext("2d", { alpha: false });
    enabled = window.SynthXState?.getParameter?.("scope-enabled") !== false;
    resize();
    clearCanvas(enabled ? "In attesa audio" : "Scope OFF");
    setStatus(enabled ? "Scope: in attesa audio" : "Scope: OFF", enabled ? "warn" : "info");
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    updateState({ running: false, signalState: enabled ? "waiting" : "off", lastAction: "init" }, { force: true });
    if (enabled) schedule();
    window.SynthXLogger?.log("Micro oscilloscopio pronto", { enabled, fps: DEFAULT_FPS });
    return true;
  }

  function refresh() {
    onControlChange("scope-enabled");
  }

  window.SynthXOscilloscope = {
    init,
    refresh,
    onControlChange,
    setEnabled,
    resize,
    getPeak: () => lastPeak,
    getRms: () => lastRms,
    isEnabled: () => enabled,
    isRunning: () => rafId !== null
  };
})();
