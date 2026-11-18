# UI Studio RC1 packaging policy

Engine: 0.27.0-beta1-rc1. User interface: UI Studio RC1.
The root source tree is the canonical implementation. Keep runtime source files in their original directories.

Current distribution files:
- Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip
- Sorgiva_Synth_UI_Studio_RC1_SVILUPPO_SNELLO.zip
- Sorgiva_Synth_UI_Studio_RC1_COMPLETO_SNELLO.zip
- Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf

Previous Beta1 ZIPs and v2.1/v3.0 manuals remain in Git history, not in the current branch.
Do not nest prior ZIPs and phase QA screenshots into new release packages.
A release candidate is not a stable or fully certified public release.

18 November 2026 maintenance patch: the canonical engine source includes a quintic de-click fade for oscillator/noise note-off. The archive-refresh GitHub Actions workflow synchronizes all three existing ZIPs with that source, preserving their layouts and non-runtime contents. The engine version remains RC1. See docs/NOTE_OFF_DECLICK_FIX_2026-11-18.md.
