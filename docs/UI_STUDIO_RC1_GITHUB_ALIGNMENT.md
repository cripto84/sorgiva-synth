# UI Studio RC1 — riallineamento GitHub (29 ottobre 2026)

## Baseline
- Motore: `0.27.0-beta1-rc1` (invariato)
- Interfaccia richiesta: **UI Studio RC1**
- Manuale: **edizione editoriale 4.0 candidata**, 1043 pagine, non qualificata come pubblicazione definitiva
- Pacchetti di riferimento: `Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip` e `Sorgiva_Synth_UI_Studio_RC1_COMPLETO.zip`.

## Stato della branch (integrazione in corso, NON distribuire)
L'entrypoint `index.html` ora punta a `styles/ui-studio.css` e `src/ui/studio.js`. Le due risorse **NON sono ancora presenti** nel repository: vanno trasferite integralmente dagli ZIP RC1 prima del merge e della distribuzione.

Le modifiche ai visualizzatori `src/visuals/oscilloscope.js` e `src/visuals/spectroscope.js` recepiscono il controllo di visibilità del canvas presente nel pacchetto RC1.

## Per completare il merge
1. Copiare i due file UI **integralmente e senza riscrittura** dall'archivio ESSENZIALE nelle rispettive posizioni.
2. Copiare `UI_VERSION.txt` e `LEGGIMI_UI_STUDIO.txt` dall'ESSENZIALE.
3. Pubblicare il PDF `Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf` e aggiornare i link in README solo quando il file è presente.
4. Preparare il pacchetto ESSENZIALE coerente e mantenere la distribuzione COMPLETO come archivio QA, evitando di versionare automaticamente tutti i 533 file QA e i numerosi ZIP checkpoint.
5. Confrontare SHA-256 dei sorgenti, verificare il caricamento completo, 135 factory preset, i 643 parametri della patch, 229 target MIDI Learn, i browser a 1440/1366/768/390, note on/off, Panic, persistenza e il roundtrip JSON.
6. Lasciare il rilascio come RC: il dossier dichiara **non eseguiti** ascolto umano, MIDI hardware e test su dispositivi fisici.
7. Aggiornare il README pubblico e preparare una release solo dopo il superamento dei gate.

## Integrità
Nessuna modifica intenzionale al motore DSP o alla libreria factory. Non rinominare gli identificatori storici SynthX impiegati per compatibilità.

Questa branch è una preparazione tracciabile, **non una sincronizzazione completa** degli allegati.
