(function () {
  "use strict";

  // SynthX Rebuild v0.13.1 MIDI Clock Hardening, preserved in v0.14.1.
  // Runtime-only helper: does not store WebMIDI objects, timers, DOM nodes or functions in presets.
  const STATUS = Object.freeze({
    CLOCK: 0xf8,
    START: 0xfa,
    CONTINUE: 0xfb,
    STOP: 0xfc
  });
  const MODES = new Set(["internal", "auto", "external"]);
  const DIVISIONS = new Set(["1", "2", "4", "8"]); // steps per quarter note
  const LIMITS = Object.freeze({
    minBpm: 20,
    maxBpm: 300,
    pulsesPerQuarter: 24,
    minIntervalMs: 7,
    maxIntervalMs: 130,
    minStepIntervalMs: 40,
    lostAfterMs: 1400,
    stablePulseCount: 8,
    pulseHistory: 24,
    hardJitterPercent: 24,
    softJitterPercent: 14,
    outlierTolerance: 0.52,
    maxConsecutiveOutliers: 3,
    transportDebounceMs: 80,
    resyncDebounceMs: 90
  });

  let mode = "internal";
  let division = 4;
  let pulseCount = 0;
  let acceptedPulseCount = 0;
  let ignoredPulseCount = 0;
  let unstablePulseCount = 0;
  let clockLostCount = 0;
  let recoveryCount = 0;
  let consecutiveOutliers = 0;
  let lastPulseTime = 0;
  let lastTransportTime = 0;
  let lastTransportStatus = 0;
  let lastResyncTime = 0;
  let pulseIntervals = [];
  let bpm = 0;
  let jitterPercent = 0;
  let synced = false;
  let transportRunning = false;
  let status = "internal";
  let sourceHealth = "internal";
  let lastRealtime = "nessuno";
  let lostTimer = null;

  function getEl(id) { return document.getElementById(id); }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : min;
    if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fb));
    return Math.min(max, Math.max(min, n));
  }

  function nowMs(event) {
    const stamp = Number(event?.timeStamp);
    if (Number.isFinite(stamp) && stamp > 0) return stamp;
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function mean(values) {
    const safe = values.map(Number).filter(Number.isFinite);
    if (!safe.length) return 0;
    return safe.reduce((sum, value) => sum + value, 0) / safe.length;
  }

  function trimmedMean(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 6) return mean(sorted);
    const trim = Math.max(1, Math.floor(sorted.length * 0.15));
    return mean(sorted.slice(trim, sorted.length - trim));
  }

  function estimateJitterPercent(values, center) {
    const c = Number(center);
    if (!Number.isFinite(c) || c <= 0 || !values.length) return 0;
    const deviations = values.map((value) => Math.abs(value - c) / c);
    return mean(deviations) * 100;
  }

  function clearLostTimer() {
    if (lostTimer) window.clearTimeout(lostTimer);
    lostTimer = null;
  }

  function resetPulseStats(reason, options) {
    pulseCount = 0;
    acceptedPulseCount = 0;
    ignoredPulseCount = 0;
    unstablePulseCount = 0;
    consecutiveOutliers = 0;
    lastPulseTime = 0;
    pulseIntervals = [];
    bpm = 0;
    jitterPercent = 0;
    synced = false;
    if (!options?.keepTransport) transportRunning = false;
    clearLostTimer();
    updateRuntime({ lastAction: reason || "reset" });
  }

  function runtimePatch(extra) {
    return {
      mode,
      division,
      enabled: mode !== "internal",
      status,
      sourceHealth,
      synced,
      bpm: Number(bpm.toFixed(1)) || 0,
      jitterPercent: Number(jitterPercent.toFixed(1)) || 0,
      pulseCount,
      acceptedPulseCount,
      ignoredPulseCount,
      unstablePulseCount,
      clockLostCount,
      recoveryCount,
      transportRunning,
      lastRealtime,
      stepIntervalMs: Number(getExternalStepIntervalMs().toFixed(1)) || 0,
      ...(extra || {})
    };
  }

  function updateRuntime(extra) {
    const patch = runtimePatch(extra);
    window.SynthXState?.updateMidiClock?.(patch);
    renderStatus();
  }

  function labelForMode(value) {
    if (value === "external") return "External MIDI Clock";
    if (value === "auto") return "Auto";
    return "Internal";
  }

  function healthLabel() {
    if (mode === "internal") return "Health: Internal";
    if (sourceHealth === "stable") return "Health: stabile";
    if (sourceHealth === "unstable") return "Health: instabile";
    if (sourceHealth === "lost") return "Health: clock perso";
    if (sourceHealth === "stopped") return "Health: transport stop";
    if (sourceHealth === "device-change") return "Health: device change";
    return "Health: in attesa";
  }

  function getExternalStepIntervalMs() {
    if (!Number.isFinite(bpm) || bpm <= 0) return 0;
    return 60000 / (bpm * Math.max(1, division));
  }

  function isExternalUsable() {
    return mode !== "internal" && synced && sourceHealth === "stable" && bpm >= LIMITS.minBpm && bpm <= LIMITS.maxBpm;
  }

  function getStepIntervalMs(engine, fallbackRate, minIntervalMs) {
    const minimum = Math.max(Number(minIntervalMs) || LIMITS.minStepIntervalMs, LIMITS.minStepIntervalMs);
    const fallback = Math.max(minimum, 1000 / clamp(fallbackRate, 0.1, 64, 4));
    if (!isExternalUsable()) return fallback;
    return Math.max(minimum, getExternalStepIntervalMs() || fallback);
  }

  function getEngineClockLabel(engine) {
    if (mode === "internal") return "Clock interno";
    if (isExternalUsable()) return `MIDI clock ${Number(bpm.toFixed(1))} BPM · ${division} step/beat · jitter ${Number(jitterPercent.toFixed(1))}%`;
    if (sourceHealth === "lost") return "Clock Lost: fallback interno";
    if (sourceHealth === "unstable") return "Clock instabile: fallback interno";
    if (mode === "external") return "Waiting MIDI Clock";
    return "Auto: clock interno finché MIDI non è stabile";
  }

  function setText(id, text, kind) {
    const el = getEl(id);
    if (!el) return;
    el.textContent = text;
    if (kind) el.dataset.kind = kind;
  }

  function renderStatus() {
    const modeLabel = labelForMode(mode);
    const bpmText = bpm > 0 ? `${Number(bpm.toFixed(1))} BPM` : "-- BPM";
    const syncText = mode === "internal" ? "Internal" : synced ? "External synced" : status === "lost" ? "Clock Lost" : status === "unstable" ? "Clock Unstable" : "Waiting MIDI Clock";
    const kind = mode === "internal" ? "info" : synced ? "ok" : status === "lost" || status === "unstable" ? "warn" : "warn";
    setText("midi-clock-status", `MIDI Clock: ${syncText} · ${modeLabel} · ${bpmText} · ${division} step/beat · jitter ${Number(jitterPercent.toFixed(1))}% · drop ${clockLostCount} · ${lastRealtime}.`, kind);
    setText("midi-clock-mode-pill", `Modo ${modeLabel}`, kind);
    setText("midi-clock-sync-pill", syncText, kind);
    setText("midi-clock-bpm-pill", bpmText, kind);
    setText("midi-clock-division-pill", `${division} step/beat`, "info");
    setText("midi-clock-transport-pill", transportRunning ? "Transport RUN" : "Transport STOP/idle", transportRunning ? "ok" : "info");
    setText("midi-clock-health-pill", healthLabel(), sourceHealth === "stable" ? "ok" : sourceHealth === "internal" ? "info" : "warn");
    setText("midi-clock-jitter-pill", `Jitter ${Number(jitterPercent.toFixed(1))}%`, jitterPercent <= LIMITS.softJitterPercent ? "info" : "warn");
    setText("midi-clock-dropout-pill", `Lost ${clockLostCount} · Ign ${ignoredPulseCount} · Unst ${unstablePulseCount}`, clockLostCount || unstablePulseCount ? "warn" : "info");
  }

  function markUnstable(reason, options) {
    const wasSynced = synced;
    synced = false;
    status = options?.lost ? "lost" : "unstable";
    sourceHealth = options?.lost ? "lost" : "unstable";
    lastRealtime = reason || (options?.lost ? "clock perso" : "clock instabile");
    if (options?.lost) clockLostCount += 1;
    if (wasSynced || options?.forceResync) guardedResyncMotionEngines(options?.lost ? "midi-clock-lost-fallback" : "midi-clock-unstable-fallback");
    updateRuntime({ lastAction: options?.lost ? "clock-lost" : "clock-unstable" });
  }

  function scheduleLostWatch() {
    clearLostTimer();
    if (mode === "internal") return;
    lostTimer = window.setTimeout(() => {
      if (mode === "internal") return;
      const elapsed = lastPulseTime ? nowMs() - lastPulseTime : Number.POSITIVE_INFINITY;
      if (elapsed >= LIMITS.lostAfterMs) markUnstable(lastPulseTime ? "clock perso" : "in attesa clock", { lost: Boolean(lastPulseTime), forceResync: Boolean(lastPulseTime) });
    }, LIMITS.lostAfterMs + 50);
  }

  function acceptPulseInterval(interval) {
    pulseIntervals.push(interval);
    if (pulseIntervals.length > LIMITS.pulseHistory) pulseIntervals.shift();
    const center = trimmedMean(pulseIntervals) || interval;
    const nextBpm = 60000 / (center * LIMITS.pulsesPerQuarter);
    bpm = clamp(nextBpm, LIMITS.minBpm, LIMITS.maxBpm, bpm || 120);
    jitterPercent = estimateJitterPercent(pulseIntervals, center);
    acceptedPulseCount += 1;
    consecutiveOutliers = 0;

    const stableEnough = pulseIntervals.length >= LIMITS.stablePulseCount && jitterPercent <= LIMITS.hardJitterPercent && bpm >= LIMITS.minBpm && bpm <= LIMITS.maxBpm;
    const wasUsable = isExternalUsable();
    synced = stableEnough;
    status = stableEnough ? "external" : "waiting";
    sourceHealth = stableEnough ? "stable" : "waiting";
    lastRealtime = stableEnough ? "clock stabile" : "clock in stabilizzazione";
    if (stableEnough && !wasUsable) {
      recoveryCount += 1;
      guardedResyncMotionEngines("midi-clock-recovered");
    }
  }

  function rejectPulse(reason, options) {
    ignoredPulseCount += 1;
    unstablePulseCount += options?.unstable ? 1 : 0;
    consecutiveOutliers += options?.unstable ? 1 : 0;
    lastRealtime = reason || "pulse ignorato";
    if (consecutiveOutliers >= LIMITS.maxConsecutiveOutliers) markUnstable("clock instabile", { forceResync: true });
  }

  function handleClockPulse(event) {
    if (mode === "internal") return;
    const t = nowMs(event);
    pulseCount += 1;

    if (!lastPulseTime) {
      lastPulseTime = t;
      status = "waiting";
      sourceHealth = "waiting";
      lastRealtime = "clock ricevuto";
      scheduleLostWatch();
      updateRuntime({ lastAction: "clock-first-pulse" });
      return;
    }

    const interval = t - lastPulseTime;
    if (!Number.isFinite(interval) || interval < LIMITS.minIntervalMs) {
      rejectPulse("pulse duplicato/irregolare ignorato", { unstable: true });
      if (pulseCount <= LIMITS.stablePulseCount || pulseCount % 12 === 0) updateRuntime({ lastAction: "clock-pulse-ignored" });
      return;
    }

    lastPulseTime = t;
    if (interval > LIMITS.maxIntervalMs) {
      pulseIntervals = [];
      jitterPercent = 0;
      rejectPulse("gap clock troppo lungo", { unstable: true });
      markUnstable("gap clock troppo lungo", { lost: true, forceResync: true });
      scheduleLostWatch();
      return;
    }

    const center = median(pulseIntervals) || interval;
    const ratio = center > 0 ? Math.abs(interval - center) / center : 0;
    if (pulseIntervals.length >= LIMITS.stablePulseCount && ratio > LIMITS.outlierTolerance) {
      rejectPulse("outlier clock ignorato", { unstable: true });
    } else {
      acceptPulseInterval(interval);
    }

    if (jitterPercent > LIMITS.hardJitterPercent && pulseIntervals.length >= LIMITS.stablePulseCount) {
      markUnstable("jitter clock alto", { forceResync: true });
    }
    scheduleLostWatch();
    if (pulseCount <= LIMITS.stablePulseCount + 2 || pulseCount % 12 === 0 || !synced) updateRuntime({ lastAction: "clock-pulse" });
  }

  function guardedResyncMotionEngines(reason) {
    const t = nowMs();
    if (t - lastResyncTime < LIMITS.resyncDebounceMs) return;
    lastResyncTime = t;
    resyncMotionEngines(reason || "midi-clock-resync");
  }

  function resyncMotionEngines(reason) {
    try { window.SynthXArpeggiator?.resyncClock?.(reason || "midi-clock-start"); } catch (err) { window.SynthXLogger?.warn("arp midi-clock resync error", err); }
    try { window.SynthXSequencer?.resyncClock?.(reason || "midi-clock-start"); } catch (err) { window.SynthXLogger?.warn("sequencer midi-clock resync error", err); }
  }

  function stopMotionEngines(reason) {
    try { window.SynthXArpeggiator?.stop?.(reason || "midi-clock-stop"); } catch (err) { window.SynthXLogger?.warn("arp midi-clock stop error", err); }
    try { window.SynthXSequencer?.stop?.(reason || "midi-clock-stop"); } catch (err) { window.SynthXLogger?.warn("sequencer midi-clock stop error", err); }
    try { window.SynthXAudio?.allNotesOff?.(); } catch (err) { window.SynthXLogger?.warn("midi-clock allNotesOff error", err); }
  }

  function debounceTransport(statusByte) {
    const t = nowMs();
    const repeatedSameStatus = Number(statusByte) === Number(lastTransportStatus);
    if (repeatedSameStatus && t - lastTransportTime < LIMITS.transportDebounceMs) return true;
    lastTransportTime = t;
    lastTransportStatus = Number(statusByte) || 0;
    return false;
  }

  function handleTransport(statusByte) {
    if (mode === "internal") return;
    if (debounceTransport(statusByte)) {
      lastRealtime = "transport duplicato ignorato";
      updateRuntime({ lastAction: "transport-debounced" });
      return;
    }
    if (statusByte === STATUS.START || statusByte === STATUS.CONTINUE) {
      const action = statusByte === STATUS.START ? "MIDI Start" : "MIDI Continue";
      transportRunning = true;
      lastRealtime = action;
      resetPulseStats(statusByte === STATUS.START ? "midi-start" : "midi-continue", { keepTransport: true });
      transportRunning = true;
      status = "waiting";
      sourceHealth = "waiting";
      try { window.SynthXAudio?.allNotesOff?.(); } catch (_) {}
      guardedResyncMotionEngines(statusByte === STATUS.START ? "midi-clock-start" : "midi-clock-continue");
      scheduleLostWatch();
      updateRuntime({ lastAction: statusByte === STATUS.START ? "midi-start" : "midi-continue" });
      return;
    }
    if (statusByte === STATUS.STOP) {
      transportRunning = false;
      synced = false;
      status = "stopped";
      sourceHealth = "stopped";
      lastRealtime = "MIDI Stop";
      clearLostTimer();
      stopMotionEngines("midi-clock-stop");
      updateRuntime({ lastAction: "midi-stop" });
    }
  }

  function handleRealtimeMessage(statusByte, event) {
    const statusCode = Number(statusByte) & 0xff;
    if (statusCode === STATUS.CLOCK) { handleClockPulse(event); return true; }
    if (statusCode === STATUS.START || statusCode === STATUS.CONTINUE || statusCode === STATUS.STOP) { handleTransport(statusCode); return true; }
    return false;
  }

  function setMode(nextMode, reason) {
    const normalized = MODES.has(String(nextMode)) ? String(nextMode) : "internal";
    if (normalized === mode) { renderStatus(); return; }
    mode = normalized;
    if (mode === "internal") {
      status = "internal";
      sourceHealth = "internal";
      lastRealtime = "clock interno";
      resetPulseStats(reason || "mode-internal");
    } else {
      status = "waiting";
      sourceHealth = "waiting";
      lastRealtime = "in attesa clock";
      resetPulseStats(reason || `mode-${mode}`);
      scheduleLostWatch();
    }
    updateRuntime({ lastAction: reason || `mode-${mode}` });
  }

  function setDivision(nextDivision, reason) {
    const normalized = DIVISIONS.has(String(nextDivision)) ? Number(nextDivision) : 4;
    division = normalized;
    updateRuntime({ lastAction: reason || "division-change" });
    guardedResyncMotionEngines("midi-clock-division-change");
  }

  function reset(reason) {
    status = mode === "internal" ? "internal" : "waiting";
    sourceHealth = mode === "internal" ? "internal" : "waiting";
    lastRealtime = mode === "internal" ? "clock interno" : "reset clock";
    resetPulseStats(reason || "manual-reset");
    updateRuntime({ lastAction: reason || "manual-reset" });
  }

  function handleMidiStateChange(description, options) {
    if (mode === "internal") return;
    const selectedMissing = Boolean(options?.selectedMissing);
    status = selectedMissing ? "lost" : "waiting";
    sourceHealth = selectedMissing ? "device-change" : "waiting";
    lastRealtime = selectedMissing ? "input MIDI scollegato" : `device change: ${description || "MIDI"}`;
    if (selectedMissing) {
      clockLostCount += 1;
      resetPulseStats("midi-device-disconnect");
      status = "lost";
      sourceHealth = "device-change";
      stopMotionEngines("midi-device-disconnect");
    } else {
      resetPulseStats("midi-device-change", { keepTransport: false });
      scheduleLostWatch();
    }
    updateRuntime({ lastAction: selectedMissing ? "midi-device-disconnect" : "midi-device-change" });
  }

  function init() {
    const modeSelect = getEl("midi-clock-mode");
    const divisionSelect = getEl("midi-clock-division");
    const resetButton = getEl("midi-clock-reset");

    if (modeSelect) {
      modeSelect.value = mode;
      modeSelect.addEventListener("change", () => setMode(modeSelect.value, "ui-mode"));
    }
    if (divisionSelect) {
      divisionSelect.value = String(division);
      divisionSelect.addEventListener("change", () => setDivision(divisionSelect.value, "ui-division"));
    }
    resetButton?.addEventListener("click", () => reset("manual-reset"));
    status = "internal";
    sourceHealth = "internal";
    lastRealtime = "clock interno";
    updateRuntime({ lastAction: "init" });
  }

  window.SynthXMidiClock = {
    init,
    handleRealtimeMessage,
    handleMidiStateChange,
    getStepIntervalMs,
    getEngineClockLabel,
    getStatus: () => runtimePatch(),
    isExternalUsable,
    setMode,
    setDivision,
    reset
  };
})();
