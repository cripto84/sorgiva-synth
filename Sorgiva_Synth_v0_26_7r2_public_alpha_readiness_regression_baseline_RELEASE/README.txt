Sorgiva Synth
==============
v0.26.7r2 — Public Alpha Readiness & Regression Baseline

Build di consolidamento pre-public-alpha.

Modifiche principali
--------------------

- Preset Morph: il Live Preview non viene più eseguito all'avvio quando gli slot A e B sono vuoti;
- MIDI hardware: registrata la baseline reale superata il 9 luglio 2026 con note, velocity, Mod Wheel e risposta senza latenza percepibile;
- versioni e filename export riallineati a v0.26.7r2;
- README preset correnti riallineati;
- root ripulita dai manifesti di patch superati;
- aggiunta una prima suite di smoke test statici e browser;
- nessuna modifica alla topologia audio, ai parametri timbrici o ai 135 factory preset.

Avvio
-----

Aprire index.html in un browser compatibile con WebAudio. Per WebMIDI usare preferibilmente Chromium/Chrome e servire la cartella tramite localhost o HTTPS.

Test
----

Dalla root del progetto:

  python3 tests/smoke_static.py

Test browser opzionale, se Playwright per Python è installato:

  python3 tests/smoke_browser.py

Consultare tests/README.txt per ambito e limiti.

Pacchetto RELEASE
-----------------

Pacchetto alleggerito: include sorgente, test, documentazione utente/sviluppatore corrente e QA r2; esclude la cronologia tecnica ridondante.
