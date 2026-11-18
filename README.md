# Sorgiva Synth — UI Studio RC1

Open-source WebAudio synthesizer. Engine `0.27.0-beta1-rc1`, UI Studio RC1 (29 October 2026). Release candidate for testing, not a certified stable release. **18 November 2026: note-off de-click maintenance fix**, positively tested by the maintainer by ear; instrumented browser/audio certification remains pending.

## Play online — GitHub Pages

[Launch Sorgiva Synth in your browser](https://cripto84.github.io/sorgiva-synth/) — no download or installation required. Press **Sblocca Audio** before playing, and start with a moderate listening volume.

The online edition uses the same WebAudio engine and UI Studio RC1 code as the downloadable package, including the 18 November 2026 note-off de-click fix. For WebMIDI, use a compatible browser (such as desktop Chromium) and grant permission when asked. The page uses HTTPS.

**Site activation:** GitHub repository **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**. The link becomes available once GitHub Pages has deployed the site.

## Downloads

- [ESSENZIALE ZIP](./Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip) — runnable package
- [SVILUPPO SNELLO ZIP](./Sorgiva_Synth_UI_Studio_RC1_SVILUPPO_SNELLO.zip) — full sources and selected QA evidence
- [COMPLETO SNELLO ZIP](./Sorgiva_Synth_UI_Studio_RC1_COMPLETO_SNELLO.zip) — development package and candidate manual
- [User manual (Italian PDF, editorial candidate)](./Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf)

Extract the chosen ZIP completely. Open `index.html` in a modern Chromium browser and press **Sblocca Audio**. Start at low volume. For WebMIDI, use HTTPS or localhost.

**Maintenance status:** The RC1 note-off for oscillator and noise gain uses a finite quintic smoothstep fade ending at zero before voice retirement. The engine version remains `0.27.0-beta1-rc1` (maintenance patch). See the [patch note](./docs/NOTE_OFF_DECLICK_FIX_2026-11-18.md). The existing three downloadable ZIP packages are synchronized with the canonical engine through a packaging workflow.

## Capabilities

Three oscillators and noise, 3 LFOs, 8-slot Mod Matrix, filters, ADSR envelopes, effects, MIDI input and Learn, Sequencer, Arpeggiator, A/B compare, Randomizer, Preset Morph, 135 factory presets, Adaptive Performance and two connected UI views (Performance and Sound Design).

## Development and quality

The sources in `index.html`, `src/`, `styles/` are authoritative. `VERSION` identifies the engine, while `UI_VERSION.txt` identifies the UI. See [release policy](./docs/UI_STUDIO_RC1_RELEASE_POLICY.md) and [alignment audit](./docs/UI_STUDIO_RC1_GITHUB_ALIGNMENT.md). Prior Beta1 archives and v2.1/v3.0 manual PDFs are preserved in Git history rather than the active tree.

Static integrity and syntax checks passed. After applying the patch, the maintainer reported that the audible note-off click appeared resolved; full real-device audio/MIDI and browser acceptance testing remains outstanding. Do not represent RC1 as fully certified.

## Contributing and licenses

See [CONTRIBUTING](./CONTRIBUTING.md), [SUPPORT](./SUPPORT.md), [SECURITY](./SECURITY.md), [Code of Conduct](./CODE_OF_CONDUCT.md), and [Funding transparency](./FUNDING_TRANSPARENCY.md).

Code: GPL-3.0-only. Documentation: CC BY-SA 4.0 unless otherwise marked. Maintainer: Giuseppe Tararà.
