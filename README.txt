SORGIVA SYNTH v0.27.0-beta1-rc1 — CANDIDATA BETA 1, NON RELEASE PUBBLICA CERTIFICATA

AVVIO
1. Estrai l'intero archivio ESSENZIALE (non aprire index.html dentro lo ZIP).
2. Apri index.html su Chromium desktop moderno; per WebMIDI preferisci localhost/HTTPS.
   Server locale facoltativo: python3 -m http.server 8000 dalla cartella estratta,
   poi http://localhost:8000/ nel browser.
3. Abbassa il volume prima di sbloccare l'audio, poi prova Default Init.
4. In Performance -> Adaptive Performance, lascia AUTO e abilita il monitoraggio.
   Esegui il benchmark silenzioso solo quando non stai suonando.
5. Prima di aggiornare, esporta una copia della banca preset utente e degli altri
   dati (pattern Sequencer, MIDI Learn e macro Arp), salvati separatamente.

SCOPO BETA CANDIDATE
Consolidamento di compatibilita, audio e packaging dopo alpha17.
DSP, preset factory, Gain Guard e soglie Adaptive identici ad alpha17.
Il governor usa ritardi JavaScript come indizi indiretti; non misura i dropout audio.
I test Chromium simulati e offline non sostituiscono test reali su browser diversi,
controller MIDI, schede audio e sessioni prolungate. Non e una certificazione.

Consulta RELEASE_NOTES_v0_27_0_beta1rc1.md e START_HERE_v0_27_0_beta1rc1.md.
Rollback: conserva alpha17 in una cartella distinta. Non azzerare i dati del browser.
Codice GPLv3; documentazione CC BY-SA 4.0 quando indicato.
