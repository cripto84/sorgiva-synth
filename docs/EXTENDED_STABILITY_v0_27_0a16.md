# Extended Stability & Regression — alpha16

## Obiettivo
Rendere ripetibile il controllo dei percorsi critici del sintetizzatore, senza alterare il codice DSP.

## Regressione R3 suddivisa
Dalla directory del progetto (Python, Playwright, Chromium):

```bash
python3 tests/regression_r3.py --part runtime
python3 tests/regression_r3.py --part offline
python3 tests/regression_r3.py --part factory --start 0 --end 45
python3 tests/regression_r3.py --part factory --start 45 --end 90
python3 tests/regression_r3.py --part factory --start 90 --end 135
python3 tests/phase16_factory_coverage.py
python3 tests/phase16_stability.py
```

`--start` è incluso; `--end` è escluso. `--batch-size` predefinito = 5, isolando ogni gruppo in una nuova pagina browser. Per computer lenti, scegliere gruppi più piccoli. Le singole prove salvate in `tests/regression_r3_a16_*.json` sono checkpoint; un processo interrotto NON è PASS, anche se le precedenti sottoprove concluse rimangono disponibili. Le note Panic hanno un normale smorzamento: verificare la pulizia solo dopo aver atteso la fine delle code, non immediatamente.

Il test factory conferma che ogni preset può essere caricato senza mutazioni, crea almeno una voce e rilascia tutte le voci dopo Panic. Non verifica il suono integrale di ogni patch. Il test R3 offline contiene 24 render a 48 kHz con controlli numerici su campioni non finiti, picchi e code. I 32 check runtime comprendono Mod Matrix, timing interno, MIDI simulato, sequencer/arp, Note On/Off, de-click e cleanup.

## Stress limitato headless
`phase16_stability.py` copre 120 retrigger della stessa nota, 24 cicli di accordi di 6 note e 16 note pianificate nel futuro, seguiti da Panic e controllo delle risorse. Questi sono cicli concentrati e non prove di uso reale prolungato.

## Limitazioni
- I test headless non leggono xrun/dropout reali del motore audio e non misurano CPU DSP.
- La schedulazione JavaScript può variare con hardware, browser e risparmio energetico.
- La stabilità di driver, dispositivo audio e controller WebMIDI va testata da persone su macchine reali.
- Un risultato di parità audio in tre casi deterministici non equivale alla parità per ogni patch.
- La versione precedente alpha15 resta ripristinabile usando il suo pacchetto separato.
