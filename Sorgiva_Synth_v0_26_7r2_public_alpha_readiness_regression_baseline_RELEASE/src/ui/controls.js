(function () {
  "use strict";

  function pct(value) { return `${Math.round(Number(value) * 100)}%`; }
  function plusInt(value) { const n = Number(value); return `${n >= 0 ? "+" : ""}${n}`; }
  function fixed(value, digits) { return Number(value).toFixed(digits); }
  function signedCent(value) { const n = Number(value); return `${n >= 0 ? "+" : ""}${Math.round(n)}`; }
  function panLabel(value) { const n = Number(value); if (Math.abs(n) < 0.005) return "C"; return `${n < 0 ? "L" : "R"}${Math.round(Math.abs(n) * 100)}`; }
  function signedDb(value) { const n = Number(value); return `${n >= 0 ? "+" : ""}${fixed(n, 1)} dB`; }
  function hzLog01(value) {
    const min = Math.log10(20);
    const max = Math.log10(20000);
    return Math.round(Math.pow(10, min + (max - min) * Number(value)));
  }

  function satToneHz(value) {
    const raw = Number(value);
    if (Number.isFinite(raw) && raw > 1) return Math.round(raw);
    const normalized = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0.86));
    const min = Math.log10(500);
    const max = Math.log10(20000);
    return Math.round(Math.pow(10, min + ((max - min) * normalized)));
  }

  function dampingHz(value) {
    const normalized = Math.min(1, Math.max(0, Number(value)));
    const min = Math.log10(650);
    const max = Math.log10(18000);
    return `${Math.round(Math.pow(10, min + ((max - min) * normalized)))} Hz`;
  }

  function clampMasterTuningA4(value) {
    const helper = window.SynthXAudioDsp?.clampMasterTuningA4;
    if (typeof helper === "function") return helper(value);
    const n = Number(value);
    if (!Number.isFinite(n)) return 440;
    return Math.min(480, Math.max(400, n));
  }

  function tuningHz(value) {
    const n = clampMasterTuningA4(value);
    return `${Number.isInteger(n) ? n : n.toFixed(1)} Hz`;
  }

  const formatters = {
    "osc1-level": pct, "osc2-level": pct, "osc3-level": pct,
    "osc1-semi": plusInt, "osc2-semi": plusInt, "osc3-semi": plusInt,
    "osc1-fine": signedCent, "osc2-fine": signedCent, "osc3-fine": signedCent,
    "osc1-pan": panLabel, "osc2-pan": panLabel, "osc3-pan": panLabel,
    "osc1-pulse-width": pct, "osc2-pulse-width": pct, "osc3-pulse-width": pct,
    "osc1-pwm-amount": pct, "osc2-pwm-amount": pct, "osc3-pwm-amount": pct,
    "noise-db": (v) => `${v} dB`,
    "ringmod-amount": pct,
    "fm-amount": pct,
    "oscsync-amount": pct,
    "unison-voices": (v) => `${Math.round(Number(v))}`,
    "unison-max-layers": (v) => `${Math.round(Number(v))}`,
    "unison-detune": (v) => `${Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 1)} ct`,
    "unison-spread": pct,
    "master": pct,
    "voices": (v) => `${v}`,
    "master-tuning-a4": tuningHz,
    "lfo1-rate": (v) => `${fixed(v, 2)} Hz`, "lfo2-rate": (v) => `${fixed(v, 2)} Hz`, "lfo3-rate": (v) => `${fixed(v, 2)} Hz`,
    "lfo1-depth": pct, "lfo2-depth": pct, "lfo3-depth": pct,
    "hpf-cutoff": (v) => `${hzLog01(v)} Hz`, "bpf-cutoff": (v) => `${hzLog01(v)} Hz`, "notch-cutoff": (v) => `${hzLog01(v)} Hz`, "vcf-cutoff": (v) => `${hzLog01(v)} Hz`,
    "hpf-q": (v) => fixed(v, 2), "bpf-q": (v) => fixed(v, 2), "notch-q": (v) => fixed(v, 2), "vcf-q": (v) => fixed(v, 2),
    "vcf-keytrack": pct, "vcf-velocity": pct,
    "filter-env-amount": pct,
    "filter-env-att": (v) => `${v} ms`, "filter-env-dec": (v) => `${v} ms`, "filter-env-sus": pct, "filter-env-rel": (v) => `${v} ms`,
    "filter-drive-amount": pct, "filter-drive-trim": signedDb,
    "adv-filter-freq": (v) => `${hzLog01(v)} Hz`, "adv-filter-depth": pct, "adv-filter-mix": pct,
    "adv-filter-env-freq": pct, "adv-filter-vel-depth": pct, "adv-filter-vel-mix": pct,
    "env-att": (v) => `${v} ms`, "env-dec": (v) => `${v} ms`, "env-sus": pct, "env-rel": (v) => `${v} ms`,
    "sat-amt": pct, "sat-tone": (v) => `${satToneHz(v)} Hz`, "sat-mix": pct,
    "sat-predb": (v) => `${v} dB`, "sat-voxpre": (v) => `${v} Hz`, "sat-dc": (v) => `${v} Hz`,
    "sat-asym": (v) => fixed(v, 2), "sat-hard": pct, "sat-bias": (v) => fixed(v, 2), "sat-gate": (v) => fixed(v, 3), "sat-oct": pct,
    "mod-rate": (v) => `${fixed(v, 2)} Hz`, "mod-depth": pct, "mod-mix": pct,
    "delay-time": (v) => `${fixed(v, 2)} s`, "delay-feedback": pct, "delay-damp": dampingHz, "delay-mix": pct,
    "rev-size": pct, "rev-decay": (v) => `${fixed(v, 2)} s`, "rev-damp": dampingHz, "rev-mix": pct,
    "safety-threshold": signedDb, "safety-release": (v) => `${Math.round(Number(v))} ms`, "safety-guard-depth": pct,
    "eq-low": signedDb, "eq-lowmid": signedDb, "eq-mid": signedDb, "eq-highmid": signedDb, "eq-high": signedDb,
    "performance-octave": plusInt,
    "performance-glide-ms": (v) => `${Math.round(Number(v))} ms`,
    "performance-key-velocity": pct,
    "arp-rate": (v) => `${Number(v).toFixed(1)} step/s`,
    "arp-octaves": (v) => `${Math.round(Number(v))}`,
    "arp-gate": (v) => `${Math.round(Number(v))}%`,
    "arp-swing": (v) => `${Math.round(Number(v))}%`,
    "seq-rate": (v) => `${Number(v).toFixed(1)} step/s`,
    "seq-gate": (v) => `${Math.round(Number(v))}%`,
    "seq-length": (v) => `${Math.round(Number(v))} step`,
    "modmat-slot1-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot2-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot3-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot4-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot5-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot6-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot7-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`,
    "modmat-slot8-amount": (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}`
  };

  function updateValueLabel(id, value) {
    const label = document.getElementById(`${id}-val`);
    if (!label) return;
    const key = String(id || "");
    const formatter = /^seq-step-\d+-(velocity|gate)$/.test(key)
      ? ((v) => `${Math.round(Number(v))}%`)
      : /^seq-step-\d+-chord-strum$/.test(key)
      ? ((v) => `${Math.round(Number(v))} ms`)
      : (formatters[id] || ((v) => String(v)));
    label.textContent = formatter(value);
  }

  function updateLfoTargets() {
    [1, 2, 3].forEach((i) => {
      const mode = document.getElementById(`lfo${i}-mode`);
      const dest = document.getElementById(`lfo${i}-dest`);
      const targets = document.getElementById(`lfo${i}-targets`);
      const syncRow = document.getElementById(`lfo${i}-sync-row`);
      const rateMode = document.getElementById(`lfo${i}-rate-mode`);
      const isOscTarget = ["pitch", "volume"].includes(String(dest?.value || "pitch"));
      if (mode && targets) targets.hidden = mode.value !== "per_osc" || !isOscTarget;
      if (mode) mode.disabled = !isOscTarget;
      if (syncRow && rateMode) syncRow.hidden = rateMode.value !== "sync";
    });
  }

  function updateFilterRouteStatus() {
    const status = document.getElementById("filter-route-status");
    if (!status) return;
    const chain = [
      ["hpf-enabled", "HPF"],
      ["bpf-enabled", "BPF"],
      ["notch-enabled", "Notch"],
      ["vcf-enabled", "VCF/Lowpass"]
    ].filter(([id]) => document.getElementById(id)?.checked).map(([, name]) => name);

    const envAmount = Number(document.getElementById("filter-env-amount")?.value || 0);
    const filterDriveOn = Boolean(document.getElementById("filter-drive-enabled")?.checked);
    const filterDriveMode = document.getElementById("filter-drive-mode")?.value || "clean";
    const filterDriveAmount = Math.round(Number(document.getElementById("filter-drive-amount")?.value || 0) * 100);
    const envTarget = document.getElementById("filter-env-target")?.value || "vcf";
    const envPolarity = document.getElementById("filter-env-polarity")?.value === "inverted" ? "inv" : "norm";
    const envAttack = Math.round(Number(document.getElementById("filter-env-att")?.value || 10));
    const envDecay = Math.round(Number(document.getElementById("filter-env-dec")?.value || 180));
    const envSustain = Math.round(Number(document.getElementById("filter-env-sus")?.value || 0.45) * 100);
    const envRelease = Math.round(Number(document.getElementById("filter-env-rel")?.value || 240));
    const targetActive = Boolean(document.getElementById(`${envTarget}-enabled`)?.checked);
    const vcfKeyTrack = Math.round(Number(document.getElementById("vcf-keytrack")?.value || 0) * 100);
    const vcfVelocity = Math.round(Number(document.getElementById("vcf-velocity")?.value || 0) * 100);
    const hpfSlope = document.getElementById("hpf-slope")?.value || "12";
    const vcfSlope = document.getElementById("vcf-slope")?.value || "12";
    const advOn = Boolean(document.getElementById("adv-filter-enabled")?.checked);
    const advMode = document.getElementById("adv-filter-mode")?.value || "allpass";
    const advDepth = Math.round(Number(document.getElementById("adv-filter-depth")?.value || 0) * 100);
    const advMix = Math.round(Number(document.getElementById("adv-filter-mix")?.value || 0) * 100);
    const advEnvFreq = Math.round(Number(document.getElementById("adv-filter-env-freq")?.value || 0) * 100);
    const advVelDepth = Math.round(Number(document.getElementById("adv-filter-vel-depth")?.value || 0) * 100);
    const advVelMix = Math.round(Number(document.getElementById("adv-filter-vel-mix")?.value || 0) * 100);
    const envText = envAmount > 0
      ? `Filter ADSR ${envTarget.toUpperCase()} ${envPolarity} A${envAttack}/D${envDecay}/S${envSustain}%/R${envRelease}${targetActive ? "" : " (target OFF)"}`
      : "Filter ADSR OFF";
    const driveText = filterDriveOn ? `Filter Drive ${filterDriveMode} ${filterDriveAmount}%` : "Filter Drive OFF";
    const expressionText = `VCF express: KT ${vcfKeyTrack}% · Vel ${vcfVelocity}% · HPF ${hpfSlope}dB · VCF ${vcfSlope}dB`;
    const advMods = advEnvFreq || advVelDepth || advVelMix ? ` · EnvF ${advEnvFreq}% · VelD ${advVelDepth}% · VelM ${advVelMix}%` : "";
    const advText = advOn ? `Advanced ${advMode} D${advDepth}% M${advMix}%${advMods}` : "Advanced Filter OFF";
    const route = ["Voice Input/Mixer", driveText].concat(chain.length ? chain : ["nessun filtro attivo"]).concat([advText, envText, expressionText, "Amp ADSR", "Drive/Saturation globale", "EQ 5 bande", "Modulazione FX", "Delay", "Ambiente/Reverb", "Dynamics Safety", "Master"]);
    status.textContent = route.join(" → ");
    status.dataset.activeFilters = String(chain.length);
    status.dataset.filterEnv = envAmount > 0 ? "on" : "off";
  }

  function updateEffectUiStatus() {
    const enabled = document.getElementById("sat-enabled")?.checked;
    const mode = document.getElementById("sat-mode")?.value || "drive";
    const modEnabled = document.getElementById("mod-enabled")?.checked;
    const modMode = document.getElementById("mod-mode")?.value || "chorus";
    const modMix = Number(document.getElementById("mod-mix")?.value || 0);
    const delayEnabled = document.getElementById("delay-enabled")?.checked;
    const delayMode = document.getElementById("delay-mode")?.value || "mono";
    const delayTimeMode = document.getElementById("delay-time-mode")?.value || "free";
    const delaySync = document.getElementById("delay-sync")?.value || "1/8";
    const delayMix = Number(document.getElementById("delay-mix")?.value || 0);
    const revEnabled = document.getElementById("rev-enabled")?.checked;
    const revMode = document.getElementById("rev-mode")?.value || "room";
    const revMix = Number(document.getElementById("rev-mix")?.value || 0);
    const safetyEnabled = document.getElementById("safety-enabled")?.checked;
    const status = document.getElementById("effect-route-status");
    if (status) {
      const modeText = enabled ? `${mode} attivo` : "bypass drive";
      const modText = modEnabled ? (modMix > 0 ? `${modMode} attivo` : `${modMode} mix0 dry`) : "bypass mod";
      const delayModeText = delayMode === "pingpong" ? "ping-pong" : "mono";
      const delayClockText = delayTimeMode === "sync" ? `sync ${delaySync}` : "free";
      const delayText = delayEnabled ? (delayMix > 0 ? `${delayModeText} ${delayClockText} attivo` : `${delayModeText} ${delayClockText} mix0 dry`) : "bypass delay";
      const revText = revEnabled ? (revMix > 0 ? `${revMode} attivo` : `${revMode} mix0 dry`) : "bypass ambiente";
      const safetyText = safetyEnabled ? "safety attiva" : "bypass safety";
      status.textContent = `Sorgenti voce → Filter Drive pre-filtro → Filtri in serie → Amp ADSR → Drive/Saturation globale (${modeText}) → EQ 5 bande → Modulazione FX (${modText}) → Delay (${delayText}) → Ambiente/Reverb (${revText}) → Dynamics Safety (${safetyText}) → Master`;
    }

    document.querySelectorAll(".mode-groups [data-mode]").forEach((group) => {
      const modes = String(group.dataset.mode || "").split(/\s+/).filter(Boolean);
      const active = modes.length === 0 || modes.includes(mode);
      group.hidden = !active;
    });
  }

  function updateDelayUiStatus() {
    const timeMode = String(document.getElementById("delay-time-mode")?.value || "free");
    const timeRange = document.getElementById("delay-time");
    const syncSelect = document.getElementById("delay-sync");
    if (timeRange) timeRange.disabled = timeMode === "sync";
    if (syncSelect) syncSelect.disabled = timeMode !== "sync";
  }

  function updateEqUiStatus() {
    const enabled = document.getElementById("eq-enabled")?.checked;
    const status = document.getElementById("eq-route-status");
    if (status) {
      const modeText = enabled ? "EQ attivo" : "bypass EQ";
      status.textContent = `Drive/Saturation globale → EQ 5 bande (${modeText}) → Modulazione → Delay → Ambiente/Reverb → Dynamics Safety → Master`;
    }
  }



  function updateVisualUiStatus() {
    const scopeEnabled = Boolean(document.getElementById("scope-enabled")?.checked);
    const spectrumEnabled = Boolean(document.getElementById("spectrum-enabled")?.checked);
    const scopeStatus = document.getElementById("scope-status");
    const spectrumStatus = document.getElementById("spectrum-status");
    if (scopeStatus && !window.SynthXOscilloscope?.isRunning?.()) {
      scopeStatus.textContent = scopeEnabled ? "Scope: in attesa audio" : "Scope: OFF";
      scopeStatus.dataset.kind = scopeEnabled ? "warn" : "info";
    }
    if (spectrumStatus && !window.SynthXSpectroscope?.isRunning?.()) {
      spectrumStatus.textContent = spectrumEnabled ? "Spectrum: in attesa audio" : "Spectrum: OFF";
      spectrumStatus.dataset.kind = spectrumEnabled ? "warn" : "info";
    }
    window.SynthXState?.updateVisuals?.({
      oscilloscopeEnabled: scopeEnabled,
      oscilloscopeMode: "wave",
      oscilloscopeFps: 30,
      spectroscopeEnabled: spectrumEnabled,
      spectroscopeMode: "spectrum",
      spectroscopeFps: 20
    });
  }


  function updateOscSyncUiStatus() {
    const status = document.getElementById("oscsync-status");
    if (!status) return;
    const enabled = Boolean(document.getElementById("oscsync-enabled")?.checked);
    const master = String(document.getElementById("oscsync-master")?.value || "osc1");
    const slave = String(document.getElementById("oscsync-slave")?.value || "osc2");
    const amount = Math.max(0, Math.min(1, Number(document.getElementById("oscsync-amount")?.value || 0)));
    const name = (id) => id.replace("osc", "Osc ");
    if (!enabled) {
      status.textContent = "Osc Sync off: legacy sound.";
      return;
    }
    if (master === slave) {
      status.textContent = "Osc Sync safe-disabled: Master e Slave coincidono.";
      return;
    }
    if (amount <= 0.001) {
      status.textContent = `Osc Sync armed: ${name(master)} → ${name(slave)}, Amount 0% quindi suono legacy.`;
      return;
    }
    status.textContent = `Osc Sync active: ${name(master)} → ${name(slave)}, Amount ${Math.round(amount * 100)}%.`;
  }

  function unisonDetuneZone(detune) {
    const d = Math.max(0, Math.min(18, Number(detune) || 0));
    if (d <= 3) return "0–3 ct · Thickening / ispessimento leggero";
    if (d <= 8) return "4–8 ct · Natural chorus / battimenti morbidi";
    if (d <= 14) return "9–14 ct · Strong beating / movimento evidente";
    return "15–18 ct · Psychedelic ensemble / instabilità larga";
  }

  function updateUnisonUiStatus() {
    const status = document.getElementById("unison-status");
    const effective = document.getElementById("unison-effective-layers");
    const zone = document.getElementById("unison-detune-zone");
    if (!status) return;
    const enabled = Boolean(document.getElementById("unison-enabled")?.checked);
    const requestedVoices = Math.round(Math.max(1, Math.min(12, Number(document.getElementById("unison-voices")?.value || 2))));
    const maxLayers = Math.round(Math.max(1, Math.min(12, Number(document.getElementById("unison-max-layers")?.value || 3))));
    const voices = Math.max(1, Math.min(maxLayers, requestedVoices));
    const detune = Math.max(0, Math.min(18, Number(document.getElementById("unison-detune")?.value || 0)));
    const spread = Math.max(0, Math.min(0.75, Number(document.getElementById("unison-spread")?.value || 0)));
    const layerWord = voices === 1 ? "layer" : "layers";
    if (effective) {
      const requestedNote = requestedVoices > maxLayers ? ` · requested ${requestedVoices}, clamped` : "";
      effective.textContent = `Effective Layers: ${voices} ${layerWord} / CPU limit ${maxLayers}${requestedNote}.`;
    }
    if (zone) zone.textContent = `Detune Zone: ${unisonDetuneZone(detune)}.`;
    if (!enabled) {
      status.textContent = `Unison off: legacy sound. Layer limit ${maxLayers}.`;
      return;
    }
    if (voices <= 1 || (detune <= 0.001 && spread <= 0.001)) {
      status.textContent = `Unison armed but neutral: effective ${voices} ${layerWord}, limit ${maxLayers}.`;
      return;
    }
    const limitNote = requestedVoices > maxLayers ? ` Requested ${requestedVoices}, CPU limit clamps to ${voices}.` : "";
    const cpuNote = voices > 3 ? " CPU caution: high layer count." : "";
    status.textContent = `Unison active: ${voices} ${layerWord}, Detune ${detune.toFixed(detune % 1 === 0 ? 0 : 1)} ct, Spread ${Math.round(spread * 100)}%, limit ${maxLayers}.${limitNote}${cpuNote}`;
  }

  function updateMasterTuningUiStatus() {
    const control = document.getElementById("master-tuning-a4");
    const a4Hz = clampMasterTuningA4(control?.value ?? 440);
    if (control && Number(control.value) !== a4Hz) control.value = String(a4Hz);
    updateValueLabel("master-tuning-a4", a4Hz);
    const status = document.getElementById("master-tuning-status");
    const keyboardInfo = document.getElementById("keyboard-tuning-info");
    const text = `Master Tuning: La4 = ${tuningHz(a4Hz)} · scala cromatica temperata standard`;
    if (status) {
      status.textContent = text;
      status.dataset.kind = Math.abs(a4Hz - 440) < 0.001 ? "info" : "ok";
    }
    if (keyboardInfo) keyboardInfo.textContent = `Accordatura: La4 = ${tuningHz(a4Hz)}.`;
    window.SynthXState?.updateTuning?.({
      a4Hz,
      noteNaming: "it-Do-Re-Mi-Fa-Sol-La-Si",
      lastAction: "ui-refresh"
    });
  }

  function updateMotionUiStatus() {
    const status = window.SynthXMotion?.getStatus?.() || {};
    const derived = status.derivedMode || (document.getElementById("seq-enabled")?.checked ? "sequencer" : document.getElementById("arp-enabled")?.checked ? "arp" : "manual");
    const label = status.label || (derived === "sequencer" ? "Step Sequencer" : derived === "arp" ? "Arpeggiatore" : derived === "conflict" ? "Conflitto" : "Manuale");
    const arpOn = Boolean(document.getElementById("arp-enabled")?.checked);
    const seqOn = Boolean(document.getElementById("seq-enabled")?.checked);
    const text = document.getElementById("motion-status");
    const modePill = document.getElementById("motion-mode-pill");
    const lockPill = document.getElementById("motion-lock-pill");
    const arpPill = document.getElementById("motion-arp-pill");
    const seqPill = document.getElementById("motion-seq-pill");
    const reasonPill = document.getElementById("motion-reason-pill");
    const conflict = derived === "conflict" || Boolean(status.conflict);
    const lockText = conflict ? "Conflitto corretto" : (derived === "arp" ? "Sequencer escluso" : derived === "sequencer" ? "Arp escluso" : "Motori liberi");
    if (text) {
      text.textContent = `Motion Engine: ${label} · ${lockText} · Arp ${arpOn ? "ON" : "OFF"} · Sequencer ${seqOn ? "ON" : "OFF"}`;
      text.dataset.kind = conflict ? "warn" : (derived === "manual" ? "info" : "ok");
    }
    if (modePill) {
      modePill.textContent = `Modo ${label}`;
      modePill.dataset.kind = conflict ? "warn" : (derived === "manual" ? "info" : "ok");
    }
    if (lockPill) lockPill.textContent = lockText;
    if (arpPill) arpPill.textContent = `Arp ${arpOn ? "ON" : "OFF"}`;
    if (seqPill) seqPill.textContent = `Seq ${seqOn ? "ON" : "OFF"}`;
    if (reasonPill) reasonPill.textContent = `Ultima: ${status.lastReason || "init"}`;
  }

  function updatePerformanceUiStatus() {
    const octave = Number(document.getElementById("performance-octave")?.value || 0);
    const mode = String(document.getElementById("performance-mode")?.value || "poly");
    const holdEnabled = Boolean(document.getElementById("performance-hold-enabled")?.checked);
    const glideEnabled = Boolean(document.getElementById("performance-glide-enabled")?.checked);
    const glideMs = Number(document.getElementById("performance-glide-ms")?.value || 0);
    const keyVelocity = Number(document.getElementById("performance-key-velocity")?.value || 1);
    const velocityCurve = String(document.getElementById("performance-velocity-curve")?.value || "linear");
    const velocityEnabled = document.getElementById("toggleVelocity")?.getAttribute("aria-pressed") !== "false";
    const activeVoices = window.SynthXAudio?.getVoiceCount?.() ?? 0;
    const heldNotes = window.SynthXAudio?.getHeldNoteCount?.() ?? 0;
    const status = document.getElementById("performance-status");
    if (status) {
      const octText = `${octave >= 0 ? "+" : ""}${octave}`;
      const glideText = glideEnabled && glideMs > 0 ? `${glideMs} ms` : "OFF";
      const curveText = velocityEnabled ? velocityCurve : "OFF";
      const a4Hz = clampMasterTuningA4(document.getElementById("master-tuning-a4")?.value ?? 440);
      status.textContent = `Performance: ${mode === "mono" ? "Mono" : "Poly"} · Octave ${octText} · A4 ${tuningHz(a4Hz)} · Hold ${holdEnabled ? "ON" : "OFF"} · Glide ${glideText} · KeyVel ${Math.round(keyVelocity * 100)}% · VelCurve ${curveText} · note attive ${activeVoices}`;
    }
    const glideRange = document.getElementById("performance-glide-ms");
    if (glideRange) glideRange.disabled = !glideEnabled;
    window.SynthXState?.updatePerformance?.({
      octaveShift: octave,
      mode,
      holdEnabled,
      glideEnabled,
      glideMs,
      keyVelocity,
      velocityCurve,
      velocityEnabled,
      activeVoiceCount: activeVoices,
      heldNoteCount: heldNotes
    });
  }


  function updateSeqUiStatus() {
    const enabled = Boolean(document.getElementById("seq-enabled")?.checked);
    const lengthRaw = Number(document.getElementById("seq-length")?.value || 8);
    const length = Number.isFinite(lengthRaw) ? Math.min(32, Math.max(3, Math.round(lengthRaw))) : 8;
    const rateRaw = Number(document.getElementById("seq-rate")?.value || 2);
    const rate = Number.isFinite(rateRaw) ? Math.min(16, Math.max(0.5, rateRaw)) : 2;
    const gateRaw = Number(document.getElementById("seq-gate")?.value || 65);
    const gate = Number.isFinite(gateRaw) ? Math.min(95, Math.max(10, gateRaw)) : 65;
    const currentStep = window.SynthXSequencer?.getCurrentStep?.() ?? 0;
    const currentNoteName = window.SynthXSequencer?.getCurrentNoteName?.() || "";
    const generatedNoteCount = window.SynthXSequencer?.getGeneratedNoteCount?.() ?? 0;
    const activeStepCount = window.SynthXSequencer?.getActiveStepCount?.() ?? 0;
    const chordStepCount = window.SynthXSequencer?.getChordStepCount?.() ?? 0;
    const chordPatternSummary = window.SynthXSequencer?.getChordPatternSummary?.() || "nessun chord";
    const chordMotionSummary = window.SynthXSequencer?.getChordMotionSummary?.() || "motion neutra";
    const exclusion = window.SynthXSequencer?.getExclusionStatus?.() || (window.SynthXArpeggiator?.isEnabled?.() ? "Sequencer escluso" : "libero");
    const sequencePreview = window.SynthXSequencer?.getSequencePreview?.() || "--";
    const patternLabel = window.SynthXSequencer?.getLastPatternLabel?.() || "Pattern custom";
    const clipboardStep = window.SynthXSequencer?.getClipboardStepName?.() || "";
    const status = document.getElementById("seq-status");
    if (status) {
      const stepText = currentStep ? `${currentStep}/${length}` : "--";
      const noteText = currentNoteName || (generatedNoteCount ? "nota attiva" : "--");
      const exclusionText = enabled ? "Arp escluso" : (window.SynthXArpeggiator?.isEnabled?.() ? "Sequencer escluso" : "Arp libero");
      const clipboardText = clipboardStep ? ` · clip ${clipboardStep}` : "";
      status.textContent = `Sequencer: ${enabled ? "ON" : "OFF"} · ${patternLabel} · ${length} step · attivi ${activeStepCount}/${length} · chord ${chordStepCount}/${length} · ${rate.toFixed(1)} step/s · Gate ${Math.round(gate)}% · step ${stepText} · nota ${noteText} · ${exclusionText}${clipboardText}`;
      status.dataset.kind = enabled ? "ok" : "info";
    }
    const statePill = document.getElementById("seq-state-pill");
    const lengthPill = document.getElementById("seq-length-pill");
    const activePill = document.getElementById("seq-active-pill");
    const lockPill = document.getElementById("seq-lock-pill");
    const stepPill = document.getElementById("seq-step-pill");
    const notePill = document.getElementById("seq-note-pill");
    const chordPill = document.getElementById("seq-chord-pill");
    const motionPill = document.getElementById("seq-chord-motion-pill");
    const previewPill = document.getElementById("seq-preview-pill");
    if (statePill) {
      statePill.textContent = enabled ? "ON" : "OFF";
      statePill.dataset.kind = enabled ? "ok" : "info";
    }
    if (lengthPill) lengthPill.textContent = `${length} step`;
    if (activePill) activePill.textContent = `Attivi ${activeStepCount}/${length}`;
    if (lockPill) lockPill.textContent = exclusion === "libero" ? "Arp libero" : exclusion;
    if (stepPill) stepPill.textContent = `Step ${currentStep || "--"}`;
    if (notePill) notePill.textContent = `Nota ${currentNoteName || "--"}`;
    if (chordPill) {
      chordPill.textContent = `Chord ${chordStepCount}/${length}`;
      chordPill.title = chordPatternSummary;
      chordPill.dataset.kind = chordStepCount ? "ok" : "info";
    }
    if (motionPill) {
      motionPill.textContent = chordMotionSummary === "motion neutra" ? "Motion neutra" : "Motion adv";
      motionPill.title = chordMotionSummary;
      motionPill.dataset.kind = chordMotionSummary === "motion neutra" ? "info" : "ok";
    }
    if (previewPill) {
      previewPill.textContent = `Seq ${sequencePreview}`;
      previewPill.title = `${patternLabel}: ${sequencePreview}`;
    }
    for (let index = 1; index <= 32; index += 1) {
      const step = document.querySelector(`.seq-step[data-step-index="${index}"]`);
      if (step) step.hidden = index > length;
    }
    window.SynthXState?.updateSequencer?.({
      enabled,
      length,
      rate,
      gatePercent: Math.round(gate),
      running: enabled && (currentStep > 0 || generatedNoteCount > 0),
      currentStep,
      currentRawNote: window.SynthXSequencer?.getCurrentRawNote?.() ?? null,
      currentNoteName,
      generatedNoteCount,
      activeStepCount,
      chordStepCount,
      chordPatternSummary,
      exclusionStatus: exclusion,
      sequencePreview
    });
  }

  function updateArpUiStatus() {
    const enabled = Boolean(document.getElementById("arp-enabled")?.checked);
    const mode = String(document.getElementById("arp-mode")?.value || "up");
    const rate = Number(document.getElementById("arp-rate")?.value || 4);
    const octaves = Number(document.getElementById("arp-octaves")?.value || 1);
    const gate = Number(document.getElementById("arp-gate")?.value || 65);
    const swing = Number(document.getElementById("arp-swing")?.value || 0);
    const motionPattern = String(document.getElementById("arp-motion-pattern")?.value || "linear");
    const motionPatternLabel = window.SynthXArpeggiator?.getMotionPatternRuntimeLabel?.() || window.SynthXArpeggiator?.getMotionPatternLabel?.(motionPattern) || "Linear";
    const latchEnabled = Boolean(document.getElementById("arp-latch-enabled")?.checked);
    const heldInputCount = window.SynthXArpeggiator?.getHeldInputCount?.() ?? 0;
    const physicalInputCount = window.SynthXArpeggiator?.getPhysicalInputCount?.() ?? 0;
    const generatedNoteCount = window.SynthXArpeggiator?.getGeneratedNoteCount?.() ?? 0;
    const currentNoteName = window.SynthXArpeggiator?.getCurrentNoteName?.() || "";
    const lastStep = window.SynthXArpeggiator?.getLastStepInfo?.() || { noteName: "", number: 0, rawNote: null };
    const resetOnChange = Boolean(document.getElementById("arp-reset-on-change")?.checked);
    const randomNoRepeat = Boolean(document.getElementById("arp-random-no-repeat")?.checked);
    const sequencePreview = window.SynthXArpeggiator?.getSequencePreview?.() || "--";
    const status = document.getElementById("arp-status");
    const modeLabel = mode === "updown" ? "Up-Down" : mode === "random" ? "Random" : mode === "asplayed" ? "As Played" : mode === "down" ? "Down" : "Up";
    const lastStepText = lastStep.noteName ? `#${lastStep.number} ${lastStep.noteName}` : "--";
    if (status) {
      const noteText = currentNoteName ? ` · nota corrente ${currentNoteName}` : "";
      status.textContent = `Arp: ${enabled ? "ON" : "OFF"} · ${modeLabel} · ${motionPatternLabel} · ${rate.toFixed(1)} step/s · ${octaves} ottava/e · Gate ${Math.round(gate)}% · Swing ${Math.round(swing)}% · Latch ${latchEnabled ? "ON" : "OFF"} · buffer ${heldInputCount} · ultimo step ${lastStepText}${noteText} · seq ${sequencePreview}`;
      status.dataset.kind = enabled ? "ok" : "info";
    }
    const statePill = document.getElementById("arp-state-pill");
    const latchPill = document.getElementById("arp-latch-pill");
    const bufferPill = document.getElementById("arp-buffer-pill");
    const stepPill = document.getElementById("arp-step-pill");
    const sequencePill = document.getElementById("arp-sequence-pill");
    const optionsPill = document.getElementById("arp-options-pill");
    if (statePill) {
      statePill.textContent = enabled ? "ON" : "OFF";
      statePill.dataset.kind = enabled ? "ok" : "info";
    }
    if (latchPill) latchPill.textContent = latchEnabled ? "Latch ON" : "Latch OFF";
    if (bufferPill) bufferPill.textContent = `Buffer ${heldInputCount} / fisiche ${physicalInputCount}`;
    if (stepPill) stepPill.textContent = `Ultimo step ${lastStepText}`;
    if (sequencePill) sequencePill.textContent = `Seq ${sequencePreview}`;
    const motionReadout = document.getElementById("arp-motion-pattern-readout");
    if (motionReadout) {
      motionReadout.textContent = `Motion Shape attiva: ${motionPatternLabel}`;
      motionReadout.dataset.kind = motionPattern === "linear" ? "info" : "ok";
    }
    if (optionsPill) optionsPill.textContent = `Pattern ${motionPatternLabel} · Reset accordo ${resetOnChange ? "ON" : "OFF"} · Random no-repeat ${randomNoRepeat ? "ON" : "OFF"}`;
    window.SynthXState?.updateArpeggiator?.({
      enabled,
      mode,
      rate,
      octaves,
      motionPattern,
      motionPatternLabel,
      activeMotionPattern: window.SynthXArpeggiator?.getEffectiveMotionPatternId?.() || motionPattern,
      activeMotionPatternLabel: motionPatternLabel,
      gatePercent: Math.round(gate),
      swingPercent: Math.round(swing),
      latchEnabled,
      heldInputCount,
      physicalInputCount,
      generatedNoteCount,
      currentNoteName,
      currentRawNote: window.SynthXArpeggiator?.getCurrentRawNote?.() ?? null,
      running: enabled && (heldInputCount > 0 || generatedNoteCount > 0 || Boolean(currentNoteName)),
      lastStepRawNote: lastStep.rawNote ?? null,
      lastStepName: lastStep.noteName || "",
      lastStepNumber: lastStep.number || 0
    });
  }


  function setToggleButton(button, name) {
    const isOn = button.getAttribute("aria-pressed") === "true";
    button.textContent = `${name}: ${isOn ? "ON" : "OFF"}`;
    button.classList.toggle("is-on", isOn);
  }

  function bindToggleButton(id, name, parameterId) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(next));
      setToggleButton(button, name);
      window.SynthXState.setParameter(parameterId, next, { source: "topbar" });
    });
    setToggleButton(button, name);
    window.SynthXState.setParameter(parameterId, button.getAttribute("aria-pressed") === "true", { source: "init" });
  }

  const DEFAULT_PATCH_VALUES = {
    // Master Tuning defaults v0.18.6a
    "master-tuning-a4": 440,

    // Filter Drive / Character defaults v0.16.2
    "filter-drive-enabled": false,
    "filter-drive-mode": "clean",
    "filter-drive-amount": 0,
    "filter-drive-trim": 0,

    // Advanced Filter defaults v0.18.1
    "adv-filter-enabled": false,
    "adv-filter-mode": "allpass",
    "adv-filter-freq": 0.593,
    "adv-filter-depth": 0,
    "adv-filter-mix": 0,
    "adv-filter-vowel": "a",
    "adv-filter-env-freq": 0,
    "adv-filter-vel-depth": 0,
    "adv-filter-vel-mix": 0,

    // Filter ADSR defaults v0.17.0
    "filter-env-amount": 0,
    "filter-env-target": "vcf",
    "filter-env-polarity": "normal",
    "filter-env-att": 10,
    "filter-env-dec": 180,
    "filter-env-sus": 0.45,
    "filter-env-rel": 240,
    "hpf-slope": 12,
    "vcf-slope": 12,
    "vcf-keytrack": 0,
    "vcf-velocity": 0,

    // Osc/LFO musical defaults v0.15.1
    "osc1-fine": 0, "osc2-fine": 0, "osc3-fine": 0,
    "osc1-pan": 0, "osc2-pan": 0, "osc3-pan": 0,
    "osc1-pulse-width": 0.5, "osc2-pulse-width": 0.5, "osc3-pulse-width": 0.5,
    "osc1-pwm-amount": 0, "osc2-pwm-amount": 0, "osc3-pwm-amount": 0,
    "osc1-pwm-source": "off", "osc2-pwm-source": "off", "osc3-pwm-source": "off",
    "ringmod-enabled": false, "ringmod-source-a": "osc1", "ringmod-source-b": "osc2", "ringmod-amount": 0,
    "fm-enabled": false, "fm-carrier": "osc1", "fm-modulator": "osc2", "fm-amount": 0,
    "oscsync-enabled": false, "oscsync-master": "osc1", "oscsync-slave": "osc2", "oscsync-amount": 0,
    "unison-enabled": false, "unison-voices": 2, "unison-max-layers": 3, "unison-detune": 7, "unison-spread": 0.45,
    "lfo1-rate-mode": "free", "lfo2-rate-mode": "free", "lfo3-rate-mode": "free",
    "lfo1-sync": 1, "lfo2-sync": 1, "lfo3-sync": 1,

    // EQ flat / default
    "eq-enabled": true,
    "eq-low": 0,
    "eq-lowmid": 0,
    "eq-mid": 0,
    "eq-highmid": 0,
    "eq-high": 0,

    // Drive/Saturation defaults v0.6.x
    "sat-enabled": false,
    "sat-mode": "drive",
    "sat-amt": 0.25,
    "sat-tone": 0.86,
    "sat-mix": 0.35,
    "sat-predb": 6,
    "sat-voxpre": 30,
    "sat-dc": 12,
    "sat-asym": 0.2,
    "sat-hard": 0.6,
    "sat-bias": 0,
    "sat-gate": 0.02,
    "sat-oct": 0,

    // FX families defaults v0.7.x
    "mod-enabled": false,
    "mod-mode": "chorus",
    "mod-rate": 0.65,
    "mod-depth": 0.32,
    "mod-mix": 0.25,
    "delay-enabled": false,
    "delay-mode": "mono",
    "delay-time-mode": "free",
    "delay-sync": "1/8",
    "delay-time": 0.28,
    "delay-feedback": 0.24,
    "delay-damp": 0.70,
    "delay-mix": 0.22,
    "rev-enabled": false,
    "rev-mode": "room",
    "rev-size": 0.45,
    "rev-decay": 1.80,
    "rev-damp": 0.62,
    "rev-mix": 0.18,

    // Safety defaults v0.7.1
    "safety-enabled": true,
    "safety-threshold": -6,
    "safety-release": 120,
    "safety-gain-guard": true,
    "safety-guard-depth": 0.18,
    "safety-feedback-guard": true,

    // Performance controls defaults v0.17.1
    "performance-octave": 0,
    "performance-mode": "poly",
    "performance-hold-enabled": false,
    "performance-glide-enabled": false,
    "performance-glide-ms": 0,
    "performance-key-velocity": 1,
    "performance-velocity-curve": "linear",
    "arp-enabled": false,
    "arp-mode": "up",
    "arp-rate": 4,
    "arp-octaves": 1,
    "arp-gate": 65,
    "arp-swing": 0,
    "arp-motion-pattern": "linear",
    "arp-latch-enabled": false,
    "arp-reset-on-change": true,
    "arp-random-no-repeat": true,

    // Modulation Matrix defaults v0.19.2
    "modmat-slot1-enabled": false,
    "modmat-slot1-source": "lfo1",
    "modmat-slot1-destination": "vcf_cutoff",
    "modmat-slot1-amount": 0,
    "modmat-slot2-enabled": false,
    "modmat-slot2-source": "lfo2",
    "modmat-slot2-destination": "vcf_cutoff",
    "modmat-slot2-amount": 0,
    "modmat-slot3-enabled": false,
    "modmat-slot3-source": "lfo3",
    "modmat-slot3-destination": "adv_filter_freq",
    "modmat-slot3-amount": 0,
    "modmat-slot4-enabled": false,
    "modmat-slot4-source": "velocity",
    "modmat-slot4-destination": "vcf_cutoff",
    "modmat-slot4-amount": 0,
    "modmat-slot5-enabled": false,
    "modmat-slot5-source": "filter_env",
    "modmat-slot5-destination": "filter_drive",
    "modmat-slot5-amount": 0,
    "modmat-slot6-enabled": false,
    "modmat-slot6-source": "lfo1",
    "modmat-slot6-destination": "pan",
    "modmat-slot6-amount": 0,
    "modmat-slot7-enabled": false,
    "modmat-slot7-source": "lfo2",
    "modmat-slot7-destination": "volume",
    "modmat-slot7-amount": 0,
    "modmat-slot8-enabled": false,
    "modmat-slot8-source": "lfo3",
    "modmat-slot8-destination": "pitch",
    "modmat-slot8-amount": 0,

    // Visual defaults v0.12.2
    "scope-enabled": true,
    "spectrum-enabled": true,

    // Step sequencer defaults v0.12.0
    "seq-enabled": false,
    "seq-length": 8,
    "seq-rate": 2,
    "seq-gate": 65,
    "seq-step-1-active": true,
    "seq-step-1-note": 0,
    "seq-step-1-octave": 4,
    "seq-step-1-velocity": 100,
    "seq-step-1-gate": 100,
    "seq-step-1-accent": false,
    "seq-step-1-tie": false,
    "seq-step-1-chord": "off",
      "seq-step-1-chord-custom": "0,4,7",
      "seq-step-1-chord-inversion": 0,
      "seq-step-1-chord-spread": "close",
      "seq-step-1-chord-strum": 0,
      "seq-step-1-chord-velocity-mode": "balanced",
    "seq-step-2-active": true,
    "seq-step-2-note": 2,
    "seq-step-2-octave": 4,
    "seq-step-2-velocity": 100,
    "seq-step-2-gate": 100,
    "seq-step-2-accent": false,
    "seq-step-2-tie": false,
    "seq-step-2-chord": "off",
      "seq-step-2-chord-custom": "0,4,7",
      "seq-step-2-chord-inversion": 0,
      "seq-step-2-chord-spread": "close",
      "seq-step-2-chord-strum": 0,
      "seq-step-2-chord-velocity-mode": "balanced",
    "seq-step-3-active": true,
    "seq-step-3-note": 4,
    "seq-step-3-octave": 4,
    "seq-step-3-velocity": 100,
    "seq-step-3-gate": 100,
    "seq-step-3-accent": false,
    "seq-step-3-tie": false,
    "seq-step-3-chord": "off",
      "seq-step-3-chord-custom": "0,4,7",
      "seq-step-3-chord-inversion": 0,
      "seq-step-3-chord-spread": "close",
      "seq-step-3-chord-strum": 0,
      "seq-step-3-chord-velocity-mode": "balanced",
    "seq-step-4-active": true,
    "seq-step-4-note": 7,
    "seq-step-4-octave": 4,
    "seq-step-4-velocity": 100,
    "seq-step-4-gate": 100,
    "seq-step-4-accent": false,
    "seq-step-4-tie": false,
    "seq-step-4-chord": "off",
      "seq-step-4-chord-custom": "0,4,7",
      "seq-step-4-chord-inversion": 0,
      "seq-step-4-chord-spread": "close",
      "seq-step-4-chord-strum": 0,
      "seq-step-4-chord-velocity-mode": "balanced",
    "seq-step-5-active": true,
    "seq-step-5-note": 9,
    "seq-step-5-octave": 4,
    "seq-step-5-velocity": 100,
    "seq-step-5-gate": 100,
    "seq-step-5-accent": false,
    "seq-step-5-tie": false,
    "seq-step-5-chord": "off",
      "seq-step-5-chord-custom": "0,4,7",
      "seq-step-5-chord-inversion": 0,
      "seq-step-5-chord-spread": "close",
      "seq-step-5-chord-strum": 0,
      "seq-step-5-chord-velocity-mode": "balanced",
    "seq-step-6-active": true,
    "seq-step-6-note": 7,
    "seq-step-6-octave": 4,
    "seq-step-6-velocity": 100,
    "seq-step-6-gate": 100,
    "seq-step-6-accent": false,
    "seq-step-6-tie": false,
    "seq-step-6-chord": "off",
      "seq-step-6-chord-custom": "0,4,7",
      "seq-step-6-chord-inversion": 0,
      "seq-step-6-chord-spread": "close",
      "seq-step-6-chord-strum": 0,
      "seq-step-6-chord-velocity-mode": "balanced",
    "seq-step-7-active": true,
    "seq-step-7-note": 4,
    "seq-step-7-octave": 4,
    "seq-step-7-velocity": 100,
    "seq-step-7-gate": 100,
    "seq-step-7-accent": false,
    "seq-step-7-tie": false,
    "seq-step-7-chord": "off",
      "seq-step-7-chord-custom": "0,4,7",
      "seq-step-7-chord-inversion": 0,
      "seq-step-7-chord-spread": "close",
      "seq-step-7-chord-strum": 0,
      "seq-step-7-chord-velocity-mode": "balanced",
    "seq-step-8-active": true,
    "seq-step-8-note": 2,
    "seq-step-8-octave": 4,
    "seq-step-8-velocity": 100,
    "seq-step-8-gate": 100,
    "seq-step-8-accent": false,
    "seq-step-8-tie": false,
    "seq-step-8-chord": "off",
      "seq-step-8-chord-custom": "0,4,7",
      "seq-step-8-chord-inversion": 0,
      "seq-step-8-chord-spread": "close",
      "seq-step-8-chord-strum": 0,
      "seq-step-8-chord-velocity-mode": "balanced",
    "seq-step-9-active": false,
    "seq-step-9-note": 0,
    "seq-step-9-octave": 4,
    "seq-step-9-velocity": 100,
    "seq-step-9-gate": 100,
    "seq-step-9-accent": false,
    "seq-step-9-tie": false,
    "seq-step-9-chord": "off",
      "seq-step-9-chord-custom": "0,4,7",
      "seq-step-9-chord-inversion": 0,
      "seq-step-9-chord-spread": "close",
      "seq-step-9-chord-strum": 0,
      "seq-step-9-chord-velocity-mode": "balanced",
    "seq-step-10-active": false,
    "seq-step-10-note": 2,
    "seq-step-10-octave": 4,
    "seq-step-10-velocity": 100,
    "seq-step-10-gate": 100,
    "seq-step-10-accent": false,
    "seq-step-10-tie": false,
    "seq-step-10-chord": "off",
      "seq-step-10-chord-custom": "0,4,7",
      "seq-step-10-chord-inversion": 0,
      "seq-step-10-chord-spread": "close",
      "seq-step-10-chord-strum": 0,
      "seq-step-10-chord-velocity-mode": "balanced",
    "seq-step-11-active": false,
    "seq-step-11-note": 4,
    "seq-step-11-octave": 4,
    "seq-step-11-velocity": 100,
    "seq-step-11-gate": 100,
    "seq-step-11-accent": false,
    "seq-step-11-tie": false,
    "seq-step-11-chord": "off",
      "seq-step-11-chord-custom": "0,4,7",
      "seq-step-11-chord-inversion": 0,
      "seq-step-11-chord-spread": "close",
      "seq-step-11-chord-strum": 0,
      "seq-step-11-chord-velocity-mode": "balanced",
    "seq-step-12-active": false,
    "seq-step-12-note": 7,
    "seq-step-12-octave": 4,
    "seq-step-12-velocity": 100,
    "seq-step-12-gate": 100,
    "seq-step-12-accent": false,
    "seq-step-12-tie": false,
    "seq-step-12-chord": "off",
      "seq-step-12-chord-custom": "0,4,7",
      "seq-step-12-chord-inversion": 0,
      "seq-step-12-chord-spread": "close",
      "seq-step-12-chord-strum": 0,
      "seq-step-12-chord-velocity-mode": "balanced",
    "seq-step-13-active": false,
    "seq-step-13-note": 9,
    "seq-step-13-octave": 4,
    "seq-step-13-velocity": 100,
    "seq-step-13-gate": 100,
    "seq-step-13-accent": false,
    "seq-step-13-tie": false,
    "seq-step-13-chord": "off",
      "seq-step-13-chord-custom": "0,4,7",
      "seq-step-13-chord-inversion": 0,
      "seq-step-13-chord-spread": "close",
      "seq-step-13-chord-strum": 0,
      "seq-step-13-chord-velocity-mode": "balanced",
    "seq-step-14-active": false,
    "seq-step-14-note": 7,
    "seq-step-14-octave": 4,
    "seq-step-14-velocity": 100,
    "seq-step-14-gate": 100,
    "seq-step-14-accent": false,
    "seq-step-14-tie": false,
    "seq-step-14-chord": "off",
      "seq-step-14-chord-custom": "0,4,7",
      "seq-step-14-chord-inversion": 0,
      "seq-step-14-chord-spread": "close",
      "seq-step-14-chord-strum": 0,
      "seq-step-14-chord-velocity-mode": "balanced",
    "seq-step-15-active": false,
    "seq-step-15-note": 4,
    "seq-step-15-octave": 4,
    "seq-step-15-velocity": 100,
    "seq-step-15-gate": 100,
    "seq-step-15-accent": false,
    "seq-step-15-tie": false,
    "seq-step-15-chord": "off",
      "seq-step-15-chord-custom": "0,4,7",
      "seq-step-15-chord-inversion": 0,
      "seq-step-15-chord-spread": "close",
      "seq-step-15-chord-strum": 0,
      "seq-step-15-chord-velocity-mode": "balanced",
    "seq-step-16-active": false,
    "seq-step-16-note": 2,
    "seq-step-16-octave": 4,
    "seq-step-16-velocity": 100,
    "seq-step-16-gate": 100,
    "seq-step-16-accent": false,
    "seq-step-16-tie": false,
    "seq-step-16-chord": "off",
      "seq-step-16-chord-custom": "0,4,7",
      "seq-step-16-chord-inversion": 0,
      "seq-step-16-chord-spread": "close",
      "seq-step-16-chord-strum": 0,
      "seq-step-16-chord-velocity-mode": "balanced"
  };

  // v0.26.7r: MIDI Learn UI Reorganization preserves Step Chords / Sequencer coverage through steps 17-32 and keeps pattern/randomizer controls outside sound-preset capture.
  const SEQUENCER_STEP_DEFAULT_NOTES_32 = [0, 2, 4, 7, 9, 7, 4, 2];
  for (let index = 17; index <= 32; index += 1) {
    const note = SEQUENCER_STEP_DEFAULT_NOTES_32[(index - 1) % SEQUENCER_STEP_DEFAULT_NOTES_32.length];
    DEFAULT_PATCH_VALUES[`seq-step-${index}-active`] = false;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-note`] = note;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-octave`] = 4;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-velocity`] = 100;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-gate`] = 100;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-accent`] = false;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-tie`] = false;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord`] = "off";
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord-custom`] = "0,4,7";
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord-inversion`] = 0;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord-spread`] = "close";
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord-strum`] = 0;
    DEFAULT_PATCH_VALUES[`seq-step-${index}-chord-velocity-mode`] = "balanced";
  }

  function setControlValue(id, value, source) {
    const element = document.getElementById(id);
    if (!element) return false;
    const nextValue = id === "master-tuning-a4" ? clampMasterTuningA4(value) : value;
    if (element.type === "checkbox") element.checked = Boolean(nextValue);
    else element.value = String(nextValue);
    const coerced = window.SynthXState.coerceValue(element);
    window.SynthXState.setParameter(id, coerced, { source: source || "ui-action", type: element.type || element.tagName.toLowerCase() });
    updateValueLabel(id, coerced);
    if (String(id || "").startsWith("oscsync-")) updateOscSyncUiStatus();
    if (String(id || "").startsWith("unison-")) updateUnisonUiStatus();
    return true;
  }

  function applyControlPreset(ids, source) {
    ids.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_PATCH_VALUES, id)) setControlValue(id, DEFAULT_PATCH_VALUES[id], source);
    });
    updateLfoTargets();
    updateFilterRouteStatus();
    updateEffectUiStatus();
    updateDelayUiStatus();
    updateEqUiStatus();
    updateVisualUiStatus();
    window.SynthXModulationMatrix?.syncFromUi?.(source || "control-preset");
    updateMasterTuningUiStatus();
    updatePerformanceUiStatus();
    updateMotionUiStatus();
    updateSeqUiStatus();
    updateArpUiStatus();
    updateOscSyncUiStatus();
    updateUnisonUiStatus();
  }

  function resetEqFlat() {
    applyControlPreset(["eq-enabled", "eq-low", "eq-lowmid", "eq-mid", "eq-highmid", "eq-high"], "reset-eq-flat");
    window.SynthXLogger?.log("EQ reset flat");
  }

  function resetFxDefaults() {
    applyControlPreset([
      "sat-enabled", "sat-mode", "sat-amt", "sat-tone", "sat-mix", "sat-predb", "sat-voxpre", "sat-dc", "sat-asym", "sat-hard", "sat-bias", "sat-gate", "sat-oct",
      "mod-enabled", "mod-mode", "mod-rate", "mod-depth", "mod-mix",
      "delay-enabled", "delay-mode", "delay-time-mode", "delay-sync", "delay-time", "delay-feedback", "delay-damp", "delay-mix",
      "rev-enabled", "rev-mode", "rev-size", "rev-decay", "rev-damp", "rev-mix",
      "safety-enabled", "safety-threshold", "safety-release", "safety-gain-guard", "safety-guard-depth", "safety-feedback-guard"
    ], "reset-fx-defaults");
    window.SynthXAudio?.dampFxTails?.("reset-fx-defaults");
    window.SynthXLogger?.log("FX reset defaults");
  }

  function allCreativeFxOff() {
    ["sat-enabled", "mod-enabled", "delay-enabled", "rev-enabled"].forEach((id) => setControlValue(id, false, "all-fx-off"));
    ["safety-enabled", "safety-gain-guard", "safety-feedback-guard"].forEach((id) => setControlValue(id, true, "all-fx-off-safety-on"));
    window.SynthXAudio?.dampFxTails?.("all-fx-off");
    updateFilterRouteStatus();
    updateEffectUiStatus();
    updateDelayUiStatus();
    updateEqUiStatus();
    updateVisualUiStatus();
    window.SynthXLogger?.log("All creative FX off; safety remains on");
  }

  function handleAction(action) {
    if (action === "reset-eq-flat") { resetEqFlat(); return; }
    if (action === "reset-fx-defaults") { resetFxDefaults(); return; }
    if (action === "all-fx-off") { allCreativeFxOff(); return; }
    if (action === "modmat-reset-all") { window.SynthXModulationMatrix?.resetAll?.(); return; }
    const modmatReset = String(action || "").match(/^modmat-reset-slot-([1-8])$/);
    if (modmatReset) { window.SynthXModulationMatrix?.resetSlot?.(Number(modmatReset[1])); return; }
    const modmatCopy = String(action || "").match(/^modmat-copy-slot-([1-8])$/);
    if (modmatCopy) { window.SynthXModulationMatrix?.copySlot?.(Number(modmatCopy[1])); return; }
    const modmatPaste = String(action || "").match(/^modmat-paste-slot-([1-8])$/);
    if (modmatPaste) { window.SynthXModulationMatrix?.pasteSlot?.(Number(modmatPaste[1])); return; }
    if (action === "performance-clear-hold") { window.SynthXSequencer?.clear?.("performance-clear-hold"); window.SynthXArpeggiator?.clear?.("performance-clear-hold"); window.SynthXAudio?.allNotesOff?.(); updatePerformanceUiStatus(); updateSeqUiStatus(); updateArpUiStatus(); return; }
    const tuningMatch = String(action || "").match(/^set-master-tuning-(432|440|442|reset)$/);
    if (tuningMatch) {
      const next = tuningMatch[1] === "reset" ? 440 : Number(tuningMatch[1]);
      setControlValue("master-tuning-a4", next, `quick-tuning-${tuningMatch[1]}`);
      updateMasterTuningUiStatus();
      updatePerformanceUiStatus();
      window.SynthXLogger?.log("master tuning", next);
      return;
    }
    if (window.SynthXSequencer?.onPatternAction?.(action)) { updateSeqUiStatus(); updatePerformanceUiStatus(); return; }
    if (window.SynthXArpeggiator?.onPresetAction?.(action)) { updateArpUiStatus(); updatePerformanceUiStatus(); return; }
    if (action === "seq-clear") { window.SynthXSequencer?.panic?.("seq-clear"); updateSeqUiStatus(); updatePerformanceUiStatus(); return; }
    if (action === "arp-clear") { window.SynthXArpeggiator?.panic?.("arp-clear"); updateArpUiStatus(); updatePerformanceUiStatus(); return; }
    if (String(action || "").startsWith("midi")) return;
    window.SynthXLogger?.log("placeholder action", action);
  }

  function bindControls() {
    const controls = Array.from(document.querySelectorAll("input[id]:not([type=\"file\"]):not([data-preset-ui=\"true\"]):not([data-midi-ui=\"true\"]), select[id]:not([data-preset-ui=\"true\"]):not([data-midi-ui=\"true\"])"));
    controls.forEach((element) => {
      const apply = () => {
        let value = window.SynthXState.coerceValue(element);
        if (element.id === "master-tuning-a4") {
          value = clampMasterTuningA4(value);
          element.value = String(value);
        }
        window.SynthXState.setParameter(element.id, value, { source: "ui", type: element.type || element.tagName.toLowerCase() });
        updateValueLabel(element.id, value);
        if (String(element.id || "").startsWith("modmat-slot")) window.SynthXModulationMatrix?.syncFromUi?.("ui");
        updateLfoTargets();
        updateFilterRouteStatus();
        updateEffectUiStatus();
        updateDelayUiStatus();
        updateEqUiStatus();
        updateVisualUiStatus();
        updateMasterTuningUiStatus();
        updatePerformanceUiStatus();
        updateMotionUiStatus();
        updateSeqUiStatus();
        updateArpUiStatus();
        updateOscSyncUiStatus();
        updateUnisonUiStatus();
      };
      element.addEventListener("input", apply);
      element.addEventListener("change", apply);
      apply();
    });

    bindToggleButton("toggleVelocity", "Velocity", "performance.velocityEnabled");
    bindToggleButton("toggleSustain", "Sustain", "performance.sustainEnabled");
    updateFilterRouteStatus();
    updateEffectUiStatus();
    updateDelayUiStatus();
    updateEqUiStatus();
    updateVisualUiStatus();
    window.SynthXModulationMatrix?.syncFromUi?.("init");
    updateMasterTuningUiStatus();
    updatePerformanceUiStatus();
    updateMotionUiStatus();
    updateSeqUiStatus();
    updateArpUiStatus();

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action));
    });

  }

  function refreshAllUi() {
    const controls = Array.from(document.querySelectorAll("input[id]:not([type=\"file\"]):not([data-preset-ui=\"true\"]):not([data-midi-ui=\"true\"]), select[id]:not([data-preset-ui=\"true\"]):not([data-midi-ui=\"true\"])"));
    controls.forEach((element) => updateValueLabel(element.id, window.SynthXState.coerceValue(element)));
    updateOscSyncUiStatus();
    updateUnisonUiStatus();
    updateLfoTargets();
    updateFilterRouteStatus();
    updateEffectUiStatus();
    updateDelayUiStatus();
    updateEqUiStatus();
    updateVisualUiStatus();
    window.SynthXModulationMatrix?.syncFromUi?.("refresh-ui");
    updateMasterTuningUiStatus();
    updatePerformanceUiStatus();
    updateMotionUiStatus();
    updateSeqUiStatus();
    updateArpUiStatus();
  }

  window.SynthXControls = { init: bindControls, updateValueLabel, updateFilterRouteStatus, updateEffectUiStatus, updateDelayUiStatus, updateEqUiStatus, updateVisualUiStatus, updateMasterTuningUiStatus, updatePerformanceUiStatus, updateMotionUiStatus, updateSeqUiStatus, updateArpUiStatus, refreshAllUi, setControlValue, updateOscSyncUiStatus, updateUnisonUiStatus };
})();
