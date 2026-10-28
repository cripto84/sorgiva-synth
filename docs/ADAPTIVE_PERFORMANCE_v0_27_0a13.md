# Adaptive Performance Engine — specifica implementativa alpha13

## Architettura
`src/performance/adaptive-performance.js` è indipendente dal DSP per-voce. Il motore audio chiama esclusivamente `voiceLimit`, `unisonLimit`, `tailLimits`, `onAudioUnlocked` e `intervention`; il pannello si aggiorna a intervalli moderati. Il governor è configurato per le **nuove note**: cambi di profilo non fanno Panic e non interrompono le note già attive.

## Profilazione e misurazione
`navigator.hardwareConcurrency` è un'indicazione di processori logici, non di capacità audio; `navigator.deviceMemory` è un valore approssimato se esposto. Il sample rate e le latenze vengono letti dall'`AudioContext` quando disponibile; i valori mancanti rimangono `null`.
Il benchmark usa **6 render offline silenziosi** da 90 ms a 22,05 kHz (4/7/10 oscillatori detunati, filtro biquad per oscillatore, due ripetizioni), misurando preparazione nodi e `startRendering()`. Un piccolo ciclo aritmetico misura JS principale. `stabilityVariationPercent` confronta ripetizioni omologhe. Nessuna di queste durate è una percentuale di CPU audio o prova l'assenza di dropout. Il benchmarking non parte se sono presenti voci, code o one-shot; durante l'esecuzione verifica nuovamente l'inattività.

## Modello ponderato
`estimate` restituisce costo approssimato per-voce e carico totale:
- voce base 2, oscillatore×layer Unison 1, Noise 1.1;
- filtro 0.55, filtro 24dB moltiplicatore 1.6; advanced filter 1.1; filter drive 0.65;
- LFO attivo 0.32, slot Mod Matrix 0.18, FM 1.9, Ring Mod 0.8, Osc Sync 1.2;
- famiglia FX globale 2, voce in Release 0.75 del costo pieno.

Le unità sono **pesi progettuali relativi**, non cicli CPU misurati. I coefficienti sono centralizzati in `WEIGHTS` e leggibili tramite `getWeights()`; la calibrazione richiede test reali con una matrice di patch e hardware. Il totale contiene il contributo dei generatori di note, code e global FX; **non** quantifica con precisione la memoria del convolver o la durata DSP reale. Il limite totale di generatori è stimato da `generatorCeiling`; il registro release effettivo usa il conteggio alpha12 dei generatori.

## Politiche e limiti
La baseline in unità: <=2 processori logici 80; <=4 160; <=8 320; >8 480; assenza dato 64. Per benchmark lento si applicano fattori prudenziali (0.65 o 0.8); per rendering molto rapido 1.15. AUTO fattore 1.0, ECO 0.62, STUDIO 1.22. Riserva nominale annotata 25% AUTO, 35% ECO e 15% STUDIO: **il fattore prudenziale è incorporato nelle unità di base, non sottratto di nuovo**. Massimi 24/12/32 voci rispettivamente, sempre subordinati a Max Voices del synth. Unison AUTO/STUDIO fino a 12 per preservare il timbro già programmato, consigliati 3–8 layer; ECO ha cap 3 per note nuove. Le code hanno budget (numero/generatori) AUTO 24/320, ECO 12/180, STUDIO 40/560. MANUALE controlla voci, layer, code e generatori (clamp di sicurezza).

Con adattamento disabilitato, `voiceLimit` restituisce direttamente Max Voices, Unison usa il limite originario e le code tornano al budget alpha12. I controlli Adaptive sono salvati separatamente in `sorgivaSynth.adaptivePerformance.v1`, non aggiunti al formato preset: le vecchie patch non richiedono migrazione. I factory preset non sono modificati.

## Limiti
Il test offline non misura consumo in watt, CPU DSP, xrun, presenza di click, latenza end-to-end o continuità sonora percepita. Il carico mostrato è una **percentuale del budget stimato**, può superare il 100% e non rappresenta un utilizzo reale della CPU. Configurazioni ad alta polifonia possono richiedere taratura manuale. L'adattamento continuo e la telemetria audio in tempo reale restano fuori dalla alpha13.
