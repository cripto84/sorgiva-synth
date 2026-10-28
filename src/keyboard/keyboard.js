(function () {
  "use strict";
  const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const BLACKS = new Set([1, 3, 6, 8, 10]);
  const KEY_MAP = {
    "z": 48, "s": 49, "x": 50, "d": 51, "c": 52, "v": 53, "g": 54, "b": 55, "h": 56, "n": 57, "j": 58, "m": 59,
    "q": 60, "2": 61, "w": 62, "3": 63, "e": 64, "r": 65, "5": 66, "t": 67, "6": 68, "y": 69, "7": 70, "u": 71,
    "i": 72, "9": 73, "o": 74, "0": 75, "p": 76
  };
  const pressedKeys = new Set();

  function noteName(midi) {
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }

  function ariaNoteName(midi) {
    const name = NOTE_NAMES[midi % 12].replace("#", " diesis ");
    const octave = Math.floor(midi / 12) - 1;
    return `${name} ${octave}`.replace(/\s+/g, " ").trim();
  }

  function render() {
    const host = document.getElementById("keyboard-host");
    if (!host) return;
    host.innerHTML = '<div class="keyboard-inner"></div>';
    const inner = host.firstElementChild;
    let whiteIndex = 0;
    const whiteWidth = 38;
    for (let midi = 48; midi <= 95; midi += 1) {
      const pc = midi % 12;
      const isBlack = BLACKS.has(pc);
      const key = document.createElement("button");
      key.type = "button";
      key.className = `key ${isBlack ? "black" : "white"}`;
      key.dataset.note = String(midi);
      key.setAttribute("aria-label", ariaNoteName(midi));
      key.textContent = noteName(midi);
      if (isBlack) {
        key.style.left = `${whiteIndex * whiteWidth}px`;
      } else {
        key.style.left = `${whiteIndex * whiteWidth}px`;
        whiteIndex += 1;
      }
      key.addEventListener("pointerdown", (event) => { event.preventDefault(); startNote(midi, key, "keyboard-pointer"); });
      key.addEventListener("pointerup", () => stopNote(midi, key, "keyboard-pointer"));
      key.addEventListener("pointercancel", () => stopNote(midi, key, "keyboard-pointer"));
      key.addEventListener("pointerleave", () => stopNote(midi, key, "keyboard-pointer"));
      inner.appendChild(key);
    }
    inner.style.width = `${whiteIndex * whiteWidth}px`;
  }

  function findKey(midi) { return document.querySelector(`.key[data-note="${midi}"]`); }
  function routedNoteOn(midi, velocity, source) {
    if (window.SynthXArpeggiator?.isEnabled?.()) return window.SynthXArpeggiator.noteOn(midi, velocity, source || "keyboard");
    return window.SynthXAudio.noteOn(midi, velocity, source || "keyboard");
  }
  function routedNoteOff(midi, source) {
    if (window.SynthXArpeggiator?.isEnabled?.()) return window.SynthXArpeggiator.noteOff(midi, source || "keyboard");
    return window.SynthXAudio.noteOff(midi, source || "keyboard");
  }
  function panicAll(reason) {
    window.SynthXSequencer?.panic?.(reason || "keyboard");
    window.SynthXArpeggiator?.panic?.(reason || "keyboard");
    if (window.SynthXAudio?.panicAllNotesOff) window.SynthXAudio.panicAllNotesOff(reason || "keyboard-panic");
    else window.SynthXAudio?.allNotesOff?.({ reason: reason || "keyboard-panic", dampFx: true });
  }
  function keyboardVelocity() {
    const cfg = window.SynthXAudio?.getPerformanceConfig?.();
    const value = Number(cfg?.keyVelocity ?? 1);
    return Number.isFinite(value) ? Math.max(0.05, Math.min(1, value)) : 1;
  }
  function startNote(midi, el, source) { (el || findKey(midi))?.classList.add("active"); routedNoteOn(midi, keyboardVelocity(), source || "keyboard"); }
  function stopNote(midi, el, source) { (el || findKey(midi))?.classList.remove("active"); routedNoteOff(midi, source || "keyboard"); }

  function isTextEditingTarget(target) {
    const element = target instanceof Element ? target : document.activeElement;
    return Boolean(element?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
  }

  function bindComputerKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (isTextEditingTarget(event.target)) return;
      if (event.key === "Escape") { panicAll("escape"); return; }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (!(key in KEY_MAP) || pressedKeys.has(key)) return;
      pressedKeys.add(key);
      startNote(KEY_MAP[key], undefined, "keyboard-computer");
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (!(key in KEY_MAP)) return;
      // Always release a previously pressed musical key, even if focus moved into a field.
      if (pressedKeys.has(key)) stopNote(KEY_MAP[key], undefined, "keyboard-computer");
      pressedKeys.delete(key);
    });
    window.addEventListener("blur", () => { pressedKeys.clear(); panicAll("window-blur"); });
  }

  function init() {
    render();
    bindComputerKeyboard();
    const panic = document.getElementById("panic");
    if (panic) panic.addEventListener("click", () => panicAll("panic-button"));
  }

  window.SynthXKeyboard = { init, render };
})();
