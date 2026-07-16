Sorgiva Synth — Regression Smoke Tests
======================================

1. Static smoke test (Python standard library + Node.js)

   python3 tests/smoke_static.py

   Verifica sintassi JavaScript, JSON, asset HTML, ID duplicati, versione attiva,
   factory preset, target MIDI Learn, guardia Preset Morph e pulizia root.

2. Browser smoke test (optional Playwright)

   python3 tests/smoke_browser.py

   Avvia un server localhost temporaneo, apre Chromium headless, controlla errori
   runtime, 135 preset, 229 target MIDI Learn, 32 step, 48 tasti, self-test degli
   accordi, stato iniziale del Preset Morph e ciclo audio noteOn/noteOff.

Dipendenze browser test:

   pip install playwright

Il test usa Chromium di sistema quando disponibile. Questi smoke test non sostituiscono
l'ascolto umano, il benchmark CPU o la regressione su più controller/browser.
