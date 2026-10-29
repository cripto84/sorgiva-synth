# UI Studio RC1 — GitHub verification (29 October 2026)

Engine: 0.27.0-beta1-rc1; UI: Studio RC1; editorial manual v4.0 candidate, 1,043 pages.

## Checked and present in the release branch
- index.html, src/ui/studio.js, styles/ui-studio.css, UI_VERSION.txt, LEGGIMI_UI_STUDIO.txt
- src/visuals/oscilloscope.js and src/visuals/spectroscope.js
- Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip (418,768 bytes)
- Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf (4,454,421 bytes)

All local RC1 runtime files match the original COMPLETO archive byte by byte. GitHub blob hashes for the UI entrypoint, UI modules and visualizers match the local originals. The PDF and uploaded ESSENZIALE correspond to the local originals.

## Checks performed
- Both ZIPs passed CRC verification.
- 34 JS files passed Node syntax checks.
- All locally referenced HTML script and CSS files exist.
- Historical RC1 QA dossier reports factory, parameter, MIDI and browser tests; those tests were not rerun here.
- Real hardware MIDI, human listening, actual mobile devices and current full browser integration are not certified.

## Packaging reduction
Original COMPLETO: 624 files, 89,014,890 bytes, dominated by QA screenshots, 24 checkpoints and nested older release archives.
New SVILUPPO_SNELLO: 90 files, 1,518,722 bytes.
New COMPLETO_SNELLO: 91 files, 4,673,025 bytes, including this candidate PDF.
The two lean ZIPs are supplied as conversation deliverables and have NOT been uploaded to GitHub. Their runtime files are exactly identical to the original ESSENZIALE.

See docs/UI_STUDIO_RC1_RELEASE_POLICY.md for release workflow. Keep the original oversized archive offline as historical evidence. Existing historical GitHub binaries should not be mistaken for the current RC1 release. Do not merge the draft PR until validation gates are complete.
