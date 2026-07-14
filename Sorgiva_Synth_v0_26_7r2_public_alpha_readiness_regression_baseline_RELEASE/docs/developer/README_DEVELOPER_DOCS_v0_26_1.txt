Sorgiva Synth — Developer Documentation Index v0.26.1

Nota rename v0.26.4d
----------------------
Il nome pubblico del progetto è Sorgiva Synth. Nei documenti sviluppatore possono ancora comparire nomi tecnici `SynthX*` perché il runtime mantiene alias legacy e percorsi di compatibilità per preset, export/import e dati locali pre-rename. Questi riferimenti tecnici non vanno letti come branding pubblico.

Scopo
Questa cartella raccoglie la prima documentazione tecnica pensata per rendere Sorgiva Synth leggibile come progetto open source.
Non è ancora la preparazione repository definitiva: quella resta prevista per v0.26.2. Questa fase serve a spiegare architettura, flusso dati, preset system, QA e regole di modifica senza cambiare il comportamento sonoro.

Documenti principali
- DEVELOPER_GUIDE_v0_26_1.txt
  Guida generale per leggere il codice e lavorare in modo non distruttivo.
- PROJECT_STRUCTURE_v0_26_1.txt
  Struttura delle cartelle e ruolo dei file principali.
- STATE_AND_CONTROL_PIPELINE_v0_26_1.txt
  Flusso UI -> SynthXState -> runtime -> audio engine.
- AUDIO_ENGINE_OVERVIEW_v0_26_1.txt
  Panoramica alto livello del motore WebAudio e dei confini da rispettare.
- PRESET_SYSTEM_DEVELOPER_NOTES_v0_26_1.txt
  Note tecniche sul preset manager, runtime boundary, import/export e user bank.
- FACTORY_PRESET_FORMAT_v0_26_1.txt
  Formato dei factory preset e regole per aggiungere futuri preset/categorie.
- MOD_MATRIX_EXTENSION_GUIDE_v0_26_1.txt
  Come ragionare sulle sorgenti/destinazioni della Mod Matrix.
- QA_AND_RELEASE_CHECKLIST_v0_26_1.txt
  Checklist QA minima per ogni build futura.
- FULL_PATCH_WORKFLOW_v0_26_1.txt
  Regole operative per FULL bundle, PATCH e confronto patch->full.
- SAFE_CHANGE_RULES_v0_26_1.txt
  File delicati, cambi ammessi e cambi da evitare senza regression test.

Regola di fondo
Prima di modificare funzioni sonore, controllare se il comportamento è già documentato come vincolo. Sorgiva Synth deve restare leggibile, leggero, non distruttivo e coerente con la UI a schede della mainline desktop/core.

Stato della build al momento di questa documentazione
- Factory preset attivi correnti: 135.
- Vecchia factory da 290 preset: ritirata e non reintrodotta.
- JSON storici sotto presets/: assenti.
- audio-context.js: da considerare file delicato, non modificato in questa fase.
- Documentazione utente fondativa: docs/user/.
- Documentazione sviluppatore fondativa: docs/developer/.
- Mobile/tablet: fork futuro separato, non parte della mainline.
