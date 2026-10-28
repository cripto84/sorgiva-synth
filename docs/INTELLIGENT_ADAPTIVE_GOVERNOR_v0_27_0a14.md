# Intelligent Adaptive Governor — Sorgiva v0.27.0-alpha14

## Finalità e campo

Il governor dinamico è operativo **soltanto in AUTO con adattamento automatico attivo**. Non riscrive preset, controlli Unison o DSP e non riavvia le voci. Si affianca al Resource Budget Manager alpha13, che conserva le soglie hardware iniziali. I quattro profili ECO/STUDIO/MANUALE restano configurabili secondo alpha13 e non sono soggetti a derating dinamico.

## Segnali indiretti

Con `setInterval` ogni ~1000 ms si osserva il **ritardo di scheduling del thread JavaScript** (`performance.now()`). È un indicatore imperfetto: può dipendere da garbage collection, rallentamenti grafici o altro, senza alcun dropout audio; il thread WebAudio può invece avere problemi senza ritardi JavaScript. Si misurano inoltre numero di voci/code e costo ponderato della patch in **unità relative**. Non si inventano percentuali CPU, underrun o memoria libera. Background tab e AudioContext sospeso fermano ogni nuovo intervento.

## Regole alpha14

- Innesco: tre osservazioni consecutive con `lag >= 120ms`, almeno 2 voci/code/note programmate, carico patch stimato >=55% del budget, AudioContext `running`, documento visibile.
- Riduzione: **10%** del budget di nuove voci a evento; tetto massimo di riduzione **30%**; cooldown almeno 10 secondi tra i cambi. I valori sono limiti prudenziali configurati nel sorgente, **non calibrati empiricamente sul dispositivo dell'utente**.
- Recupero: dodici osservazioni sane con lag <=45ms, recupero **5%** per volta e cooldown di 10 secondi.
- Se la pagina non è visibile, l'audio non è running o il segnale è invalido: non cambia la capacità, si azzerano i contatori consecutivi; al ritorno le vecchie voci rimangono.
- Si applica il fattore alla polifonia *effettiva richiesta*: con 12 voci ammesse e fattore 0.9, il prossimo tetto sarà floor(10.8)=10. L'hardware massimo teorico NON è l'unica grandezza scalata.
- Se la nuova capacità è inferiore a quella delle note già in esecuzione, quelle note sono **grandfathered**; nuove note (anche shot futuri) possono essere rifiutate e si incrementa il contatore degli interventi. Il Note Off di una nota rifiutata è innocuo.
- L'algoritmo non modifica Unison, timbro, oscillatori, filtri, Amp ADSR, Gain Guard o le code attuali; il loro budget rimane quello alpha13, non segue il nuovo fattore.

## Persistenza, compatibilità, test

Restano persistenti `mode`, `automatic`, i limiti manuali nella chiave di configurazione alpha13 `sorgivaSynth.adaptivePerformance.v1`, separata dai preset. **Il fattore corrente, la cronologia e le letture temporanee non sono persistiti**: riavvio = 100%. I file patch esportati/importati vengono filtrati per escludere `adaptive-*`, anche se creati in alpha13. Test automatici simulano latenze ed emergenze ma non certificano assenza di dropout in hardware.

## Possibile alpha15

Prima di utilizzare indizi di sovraccarico per penalizzare l'esecuzione, raccogliere misure e ascolti reali su hardware eterogeneo. Se possibile adottare `AudioWorklet` con telemetria di deadline adeguatamente qualificata, senza dati CPU inventati e con consenso dell'utente. Valutare una modalità di «musical admission» più espressiva di un rifiuto delle nuove note.
