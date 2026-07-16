[README.md](https://github.com/user-attachments/files/30098555/README.md)
# sorgiva-synth
Open-source WebAudio synthesizer for sound design, experimentation and learning, with MIDI, modulation, effects, sequencer, arpeggiator and preset tools.
# Sorgiva Synth

**Open-source WebAudio synthesizer for sound design, experimentation and learning.**

Sorgiva Synth runs directly in a desktop browser and is designed to be lightweight, inspectable and musically useful. It combines a clear subtractive-synthesis workflow with controlled digital features such as modulation routing, preset morphing, randomization, MIDI Learn, a step sequencer and an arpeggiator.

> **Current status:** `v0.26.7r2 — Public Alpha Readiness & Regression Baseline`  
> This is a pre-public-alpha build intended for controlled testing. Project files, formats and behavior may still change.

## Why Sorgiva Synth

Sorgiva Synth is built for people who want to go beyond scrolling through presets and understand how a sound is made. It is intended for learners, curious musicians, experimental sound designers and experienced users who want an open browser-based instrument that can be studied, modified and forked.

The project aims to remain:

- musically credible rather than feature-driven;
- accessible on ordinary computers;
- transparent and learnable;
- safe in gain and robust against stuck notes;
- open to careful, reviewable contributions.

Sorgiva Synth is **not** a DAW, sampler or replacement for a full multitrack production environment.

## Current feature set

- Three oscillators plus five noise colors
- Sine, triangle, square, pulse, sawtooth and reverse-saw waveforms
- PWM, FM Light, Ring Mod and Osc Sync
- Unison/Detune with up to 12 layers
- Three LFOs and an eight-slot Mod Matrix
- HPF, BPF, Notch and VCF filtering
- Filter ADSR and Amp ADSR
- Filter Drive, advanced resonator/formant/comb modes and five-band EQ
- Drive, Chorus/Ensemble/Phaser/Flanger, Delay and Reverb families
- Dynamics Safety, limiter behavior, Gain Guard and Panic/All Notes Off
- Step Sequencer with 3–32 steps, odd lengths, ties, accents and per-step chords
- Arpeggiator with multiple directions, 1–4 octaves, gate, swing and latch
- 135 rebuilt factory presets
- User Preset Bank, JSON import/export and browser-local storage
- A/B Compare, Sound Randomizer and Preset Morph
- WebMIDI input, MIDI Learn and MIDI Clock
- 229 MIDI Learn targets in the current baseline
- Virtual keyboard, computer-keyboard input, oscilloscope and spectrum display

## Quick start

### Option A — Download the complete bundle

Download the current full archive:

[`Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_docs_index_corrected_FULL.zip`](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_docs_index_corrected_FULL.zip)

Extract the archive completely. Do not run `index.html` from inside the compressed ZIP.

### Option B — Use the source snapshot in this repository

Open the current release directory:

[`Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/`](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/)

Then open its `index.html`.

### First sound

1. Lower your monitoring volume.
2. Open `index.html` in a modern desktop browser.
3. Press **Sblocca Audio / Unlock Audio**.
4. Play the virtual keyboard at the bottom of the interface.
5. Load **Default Init** or a factory preset from **Preset & Patch**.

No traditional installation or build step is required for normal use.

## Recommended localhost launch

Opening the app directly with `file:///` is sufficient for basic WebAudio use. For WebMIDI, use `localhost` or HTTPS.

From the current release directory:

```bash
python3 -m http.server 8000
```

On Windows, this may instead be:

```powershell
py -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Stop the server with `Ctrl+C`.

## Browser and platform status

| Platform | Current status |
|---|---|
| Chrome, Edge and Chromium desktop | Recommended; current WebAudio and MIDI baseline |
| Firefox desktop | WebAudio may work, but WebMIDI is outside the validated baseline |
| Safari desktop | Not yet part of the validated public-alpha matrix |
| Mobile and tablet browsers | Outside the current desktop/core mainline |

A real MIDI-controller test completed on 9 July 2026 confirmed Note On/Off, velocity, Mod Wheel and responsive input without perceived lag on the tested setup. This does not guarantee identical behavior on every controller, browser or operating system.

## What needs testing

Public-alpha feedback is especially useful for:

- audio unlock and basic note handling;
- clicks, pops, stuck notes and release behavior;
- factory-preset balance and usefulness;
- CPU behavior with high Unison, long releases, chords and heavy effects;
- import/export and browser-local storage;
- Step Sequencer and Arpeggiator behavior;
- MIDI devices, pedals, expressive controls and MIDI Learn;
- different browsers, operating systems and audio interfaces;
- accessibility, focus order and interface clarity.

Please use the structured [issue templates](./.github/ISSUE_TEMPLATE/) instead of opening an unstructured report.

## Before reporting a bug

1. Confirm that you are testing the latest repository version.
2. Reload the page and press **Unlock Audio** again.
3. Load **Default Init** to rule out an extreme patch.
4. Press **Panic / All Notes Off**.
5. Reproduce the issue with the smallest possible sequence of actions.
6. Record the browser version, operating system and launch method.
7. For MIDI reports, include the controller model and connection type.
8. Do not publish private information or undisclosed security details.

For normal usage help, see [SUPPORT.md](SUPPORT.md).  
For vulnerabilities, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## Repository map

The current repository is a first public snapshot and keeps the application in a versioned release directory.

| Path | Purpose |
|---|---|
| `Sorgiva_Synth_..._RELEASE/` | Current runnable source snapshot |
| `Sorgiva_Synth_..._FULL.zip` | Complete downloadable bundle with technical history |
| `Sorgiva_Synth_Master_Editoriale_Manuale_Utente_v2_1.pdf` | Italian user manual |
| `README.md` | Public project overview |
| `CONTRIBUTING.md` | Contribution workflow and QA rules |
| `SECURITY.md` | Private vulnerability-reporting policy |
| `.github/ISSUE_TEMPLATE/` | Structured tester and contributor reports |
| `.github/PULL_REQUEST_TEMPLATE.md` | Pull-request quality checklist |

## Documentation

- [Italian user manual — PDF](./Sorgiva_Synth_Master_Editoriale_Manuale_Utente_v2_1.pdf)
- [Current release README](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/README.txt)
- [Known limits](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/KNOWN_LIMITS.txt)
- [Public roadmap](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/ROADMAP_PUBLIC.txt)
- [Current QA report](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/docs/QA_REPORT_v0_26_7r2_PUBLIC_ALPHA_READINESS.txt)
- [Regression-test notes](./Sorgiva_Synth_v0_26_7r2_public_alpha_readiness_regression_baseline_RELEASE/tests/README.txt)

The manual is currently Italian-first. Public English documentation will be expanded progressively.

## Running the smoke tests

From the current release directory:

```bash
python3 tests/smoke_static.py
```

This checks JavaScript syntax, JSON validity, referenced assets, duplicate HTML IDs, factory-preset consistency, MIDI Learn targets and other static invariants.

Optional Chromium browser test:

```bash
pip install playwright
python3 tests/smoke_browser.py
```

These tests do not replace human listening, CPU benchmarking or real-controller testing.

## Contribution principles

Contributions are welcome when they improve stability, musical usefulness, clarity, accessibility or documentation.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. In particular:

- keep changes small and reviewable;
- do not perform broad blind refactors;
- do not alter audio behavior during documentation-only work;
- preserve legacy SynthX import compatibility where required;
- do not reintroduce the retired 290-preset library;
- document all audio, preset, storage and compatibility effects;
- test by ear when the sound engine or presets are involved.

All participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Project naming and legacy compatibility

The public project name is **Sorgiva Synth**.

The historical name **SynthX Rebuild** may still appear in legacy fields, import formats, storage fallbacks, changelog entries and compatibility aliases. These references must not be replaced blindly.

Forks may use the GPL-licensed code, but must not present modified builds as official Sorgiva Synth releases. See [TRADEMARK_NOTICE.md](TRADEMARK_NOTICE.md).

## Licensing

- Program code and bundled factory-preset data: **GNU GPL-3.0-only**
- Project documentation: **CC BY-SA 4.0**, unless a document states otherwise
- Official project name, release line and branding: see [TRADEMARK_NOTICE.md](TRADEMARK_NOTICE.md)

See [LICENSE](LICENSE), [DOCUMENTATION_LICENSE.md](DOCUMENTATION_LICENSE.md) and [NOTICE.md](NOTICE.md).

## Maintainer

Sorgiva Synth is created and maintained by **Giuseppe Tararà** (`@cripto84`).

The project is developed as an open, lightweight and educational instrument: a place where sound can be played, examined, understood and rebuilt.
