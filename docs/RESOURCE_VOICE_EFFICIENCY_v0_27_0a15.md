# Resource & Voice Efficiency — alpha15

## Scopo
Ottimizzare il lavoro sul thread principale senza alterare allocazione audio, inviluppi, filtri, Gain Guard o parametri serializzati.

## Cambiamenti
1. `getGlobalConfig()` legge `saturation`, `modulation`, `delay`, `reverb` una volta, condividendo tali snapshot tra calcolo della polifonia e oggetto restituito. Le modifiche dei parametri rimangono lette a ogni chiamata, senza cache stantie.
2. `enforceReleaseTailBudget()` visita una sola volta il registro, calcola i totali, e **non ordina** quando i due limiti sono rispettati. In caso di sforamento ordina per `releaseAt`, poi `voice.id` (logica alpha14 invariata), protegge note future ed esegue il fade precedente.
3. `SorgivaSynthVoiceAllocator.pick()` seleziona in tempo lineare, memoria costante, il primo candidato del medesimo comparatore usato da `candidates()`. Usato per un solo overflow; per overflow multipli resta il metodo precedente.
4. Due contatori diagnostici (`ownerRegistrations`, `normalTails`) usano iteratori per evitare array temporanei.

## Limiti e sicurezza
Non cambiano le soglie del governor alpha14, il budget code, il numero di layer, i preset, le protezioni o la semantica di Note On/Off. Verificare con test automatizzati e ascolto reale: misure di tempo Node/Chromium non sono benchmark della CPU audio. Ogni eventuale miglioramento prestazionale può dipendere dal carico e dal browser.
