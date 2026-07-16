Sorgiva Synth v0.26.7r2 — Public Alpha Readiness & Regression Baseline

Scopo
-----
Consolidare la build prima della prima public alpha senza introdurre nuove funzioni sonore.

File funzionali modificati
--------------------------
- src/presets/preset-morph.js
- src/midi/midi.js
- src/state/state.js
- src/core/identity.js
- metadata/version label nei moduli di export e nell'interfaccia

Correzione principale
---------------------
Il Live Preview del Preset Morph ora richiede entrambi gli slot A/B prima di programmare una preview. L'avvio con slot vuoti non produce più uno stato di errore o un console error applicativo.

Invarianti
----------
- nessuna modifica al motore audio;
- nessuna modifica ai 135 factory preset;
- nessuna modifica alla topologia di oscillatori, filtri o FX;
- compatibilità legacy SynthX preservata;
- mapping MIDI Learn e pattern esistenti preservati.
