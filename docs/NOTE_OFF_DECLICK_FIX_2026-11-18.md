# Sorgiva Synth UI Studio RC1 — note-off de-click maintenance fix (18 November 2026)

**Engine:** 0.27.0-beta1-rc1. **Status:** maintenance patch to release candidate; not a stable certification.

## Report
Clicks were heard when releasing high notes on all oscillator waveforms. Increasing ADSR Release reduced but did not fully eliminate the transient.

## Correction
The canonical file `src/audio/audio-context.js` now routes oscillator and noise gain release through `scheduleClickFreeRelease()`. A 128-point quintic smoothstep curve has zero slope at both endpoints and reaches exact zero before voice retirement. Existing per-voice release minima, fast release and sound generation stay in place.

## Verification
The maintainer tested the fix and reported that the click now appears resolved. Static checks were positive; full automated browser/audio, multi-device and MIDI acceptance tests remain outstanding.

## Distribution
GitHub Pages reads the canonical root runtime code. Three existing downloadable RC1 archives are synchronized with that runtime file by `scripts/refresh_rc1_archives.py` and `.github/workflows/repack-rc1.yml`. The engine version remains RC1.
