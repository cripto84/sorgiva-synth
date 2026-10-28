# Sorgiva Synth v0.27.0-beta1-rc1 — Beta 1 Release Candidate

27 ottobre 2026 · **Versione candidata per collaudo**, non pubblicazione generale certificata.

## Che cosa cambia rispetto all'alpha17
- Identita di build, etichette di interfaccia, nomi dei file esportati e metadati aggiornati.
- Rimosso nel titolo HTML un riferimento storico alla fase di stabilita alpha16.
- Suite QA nuova: 24/24 render WebAudio offline completati sulla candidata, confronto audio con alpha17, test musicali e di stabilita, controlli sui pacchetti.
- Nessuna modifica a oscillatori, DSP, filtri, Gain Guard, algoritmi FX, factory preset o logica Governor.

## Attenzioni prima dell'uso
Il feedback positivo del proprietario dello strumento sulla alpha17 non sostituisce un test indipendente su browser/OS/controller diversi.
I 135 factory preset sono tutti validati staticamente e hanno dati byte-identici a alpha17; un nuovo sweep WebAudio completo della beta e stato **interrotto per limite di esecuzione dopo 20 preset**, senza errori nei 20 verificati.

## Principali rischi residui
Non certificati: assenza di dropout in tempo reale, latenza percepita, affidabilita WebMIDI fisica multipiattaforma, stress pluriorario, ascolto individuale dei 135 preset e compatibilita di tutti i file SynthX legacy storici.

## Rollback
Conserva alpha17 estratta. Prima di cambiare release, esporta patch JSON, User Bank, pattern, macro e MIDI Learn separatamente.
Per la lista di test manuali: `BETA1_RC1_COLLAUDO.md`. Per risultati dettagliati: rapporto QA nel pacchetto COMPLETO.
