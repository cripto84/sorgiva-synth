# Musical & Compatibility Validation — v0.27.0-alpha17

## Scopo

Consolidare compatibilità e test dei percorsi musicali senza modificare i timbri della banca factory. Le migliorie della fase sono legate ai test e ai metadati delle esportazioni, non a nuovi algoritmi audio.

## Copertura automatica

- Test `phase17_musical_compatibility.py`: 33 asserzioni su versioni, patch JSON, fallback legacy SynthX, Morph, MIDI multiporta, Sustain e movimento.
- Test `regression_r3.py --part runtime`: 32 controlli di mod matrix, clock, sequencer e arpeggiatore.
- Test Governor e stress delle voci ereditati da alpha14 e alpha16.
- Render deterministici di tre patch con confronto alpha16 e alpha17.

## Cosa non misurano

I test non ascoltano il synth con cuffie né usano tastiere MIDI fisiche. Non misurano la frequenza di dropout o la qualità timbrica soggettiva, e non certificano piattaforme differenti. L'R3 offline alpha17 è incompleta (19 scenari con risultati intermedi su 24) ed è documentata come tale.

## Protocollo di ascolto raccomandato

Preparare un volume sicuro. Confrontare A/B la stessa patch con alpha16. Verificare attacchi di forme d'onda pulite, release con code FX, sustain, note ripetute e polifonia elevata in modalità AUTO e STUDIO. Registrare preset, nota, velocity, browser e azione che ha prodotto un eventuale click.
