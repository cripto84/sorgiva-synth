# Sorgiva Synth

**Open-source WebAudio synthesizer for sound design, experimentation and learning.**

> **Runtime:** `0.27.0-beta1-rc1` (27 October 2026); **UI:** `UI Studio RC1` (29 October 2026).  
> **Status:** release candidate for testing, not a certified stable release.  
> **Manual:** Italian UI Studio RC1 v4.0 editorial candidate (1,043 pages), not final-approved.  

Sorgiva Synth is a browser-based polyphonic synthesizer with three oscillators, five noise colours,
PWM, FM Light, Ring Mod, Osc Sync, up to 12 Unison layers, three LFOs, eight-slot Mod Matrix,
multiple filters, five-band EQ, effects, MIDI input/MIDI Learn/MIDI Clock, sequencer and arpeggiator,
135 factory presets, Randomizer, A/B Compare and Preset Morph.

## What is new in v0.27.0-beta1-rc1

- **Adaptive Performance** profiles and resource limits, a silent offline benchmark, and an
  adaptive governor using indirect JavaScript lag signals. These are safeguards, not guarantees
  of audio-dropout prevention.
- **Pulse/PWM Quality** modes: Classic (compatibility) and experimental Band-limited.
- **FM High-note Quality** modes: Classic and Guarded.
- Version identity, interface labels, export metadata and release packaging aligned to the Beta 1 candidate.
- Relative to alpha17, the candidate does **not** intentionally change the DSP, factory-preset data,
  Gain Guard or Governor thresholds. See release notes and QA report for test scope.

## Quick start

1. Download the **current UI Studio RC1 ESSENZIALE** ZIP below, extract all files, then open `index.html` in a modern Chromium-based browser.
2. Select **Sblocca Audio**, load **Default Init**, and play at a safe volume.
3. Use **Performance** to play quickly and **Sound Design** to reach the nine original editing tabs. Both views control the same patch.
4. For WebMIDI, prefer HTTPS or localhost: `python3 -m http.server 8000`, then open http://localhost:8000.
5. Export patches/User Bank/Sequencer patterns/MIDI mappings before changing your browser or profile.

## Current downloads and documentation (29 October 2026)

- [UI Studio RC1 ESSENZIALE ZIP — runnable, 48 files](./Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip)
- [UI Studio RC1 manual — v4.0 editorial candidate, PDF](./Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf)
- [UI Studio RC1 maintenance and packaging policy](./docs/UI_STUDIO_RC1_RELEASE_POLICY.md)
- [UI Studio RC1 alignment and QA audit](./docs/UI_STUDIO_RC1_GITHUB_ALIGNMENT.md)
- [Engine release notes](./RELEASE_NOTES_v0_27_0_beta1rc1.md)
- [Musical testing checklist](./BETA1_RC1_COLLAUDO.md)

**Lean distribution:** The full original UI Studio RC1 archive was roughly 89 MB with 624 files, mainly repeated QA screenshots, phase checkpoints and nested prior ZIPs. A lean complete archive (approx. 4.7 MB including this manual) and a development archive (approx. 1.5 MB) were regenerated without changing any of the 48 runnable source files. Those packages are independent deliverables until explicitly uploaded to GitHub; this README does not represent them as hosted here.

**Historical assets (not the current UI):** [Beta1 RC1 ESSENZIALE](./downloads/Sorgiva_Synth_v0_27_0_beta1rc1_ESSENZIALE.zip), [Beta1 RC1 COMPLETO](./Sorgiva_Synth_v0_27_0_beta1rc1_COMPLETO.zip), [manual v3.0 draft](./Sorgiva_Synth_Manuale_v3_0_Beta1_RC1_RIALLINEATO.pdf), [manual master v2.1](./Sorgiva_Synth_Master_Editoriale_Manuale_Utente_v2_1.pdf). These are retained for archival and rollback uses, not recommended as current downloads.

## QA: tested vs. not certified

The supplied beta QA report records 8/8 static checks, 135/135 static factory-preset integrity,
24/24 offline WebAudio renders and 20/135 beta factory audio-load checks (the rest of that sweep
was interrupted by the execution limit). These are historical results supplied in the release
package, **not newly run tests from this repository upload**.

A new physical multi-platform test has not been established: audio glitches and realtime dropouts,
long sessions, real MIDI controllers, hardware latency, individual listening to all presets and
legacy SynthX-file variants remain to be verified. Contributors can use the structured
[issue templates](./.github/ISSUE_TEMPLATE/) to report results.

## Project layout

| Path | Content |
|---|---|
| `index.html`, `styles/`, `src/` | Current UI Studio RC1 runnable source |
| `UI_VERSION.txt`, `VERSION` | UI version and independent engine version |
| `docs/` | Technical notes, release policy and alignment audit |
| `Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip` | Current UI Studio RC1 runnable ZIP |
| `Sorgiva_Synth_Manuale_Utente_UI_Studio_RC1_CANDIDATO.pdf` | Current editorial candidate manual |
| `downloads/` and older named binaries | Historical Beta1 packages for reference only |
| `.github/` | Issue/PR templates |

See `docs/UI_STUDIO_RC1_RELEASE_POLICY.md` for how to separate source, distribution and QA history.

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md),
[SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Support Sorgiva Synth

Sorgiva Synth is free and open source. Voluntary contributions help sustain development, testing,
documentation and accessibility. **Synth Sospeso** seeks to reduce barriers to musical access.

[Support Sorgiva Synth through PayPal](https://paypal.me/criptocripto). For details, see
[FUNDING.md](FUNDING.md) and [FUNDING_TRANSPARENCY.md](FUNDING_TRANSPARENCY.md).

## Licensing and maintainer

Code and factory presets: GPL-3.0-only. Documentation: CC BY-SA 4.0 unless noted.
Sorgiva Synth is maintained by Giuseppe Tararà (`@cripto84`).