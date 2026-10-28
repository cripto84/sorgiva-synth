# Sorgiva Synth

**Open-source WebAudio synthesizer for sound design, experimentation and learning.**

> **Current source:** `v0.27.0-beta1-rc1` — Beta 1 Release Candidate, dated **27 October 2026**.  
> **Status:** targeted testing candidate, **not a certified stable/public release**.  
> **Manual:** Italian v3.0 **integral working draft**, not the final verified edition.

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

1. Download [ESSENZIALE](./downloads/Sorgiva_Synth_v0_27_0_beta1rc1_ESSENZIALE.zip), the runnable package;
   or use the source tree at this repository's root.
2. Extract the complete archive, then open `index.html` in a modern Chromium desktop browser.
3. Set a moderate listening volume, select **Sblocca Audio / Unlock Audio**, then load **Default Init**.
4. In **Performance → Adaptive Performance**, inspect the initial **AUTO** resource profile.
5. To use physical WebMIDI, prefer a secure origin (HTTPS or localhost), grant permissions in the browser,
   and test Note On/Off and Panic before further experimentation.

For localhost, from the extracted application directory:

```bash
python3 -m http.server 8000
# Then open http://localhost:8000/
```

## Downloads and documentation

- [ESSENZIALE — runnable beta candidate](./downloads/Sorgiva_Synth_v0_27_0_beta1rc1_ESSENZIALE.zip)
- **COMPLETO:** archive provided by the maintainer; large binary upload to this repository is pending.
- **Manuale utente v3.0 — BOZZA INTEGRALE:** available as a separate draft; the large PDF is not yet uploaded to GitHub. The [historical manual v2.1](./Sorgiva_Synth_Master_Editoriale_Manuale_Utente_v2_1.pdf) remains available but is **outdated**.
- [Release notes](./RELEASE_NOTES_v0_27_0_beta1rc1.md)
- [Beta testing checklist](./BETA1_RC1_COLLAUDO.md)
- [Beta QA / test scope](./BETA1_RC1_COLLAUDO.md)

**Manual status:** the 38-chapter text is preserved and supplemented with technical updates, but
individual inherited claims, all historical page references and exhaustive visual review have **not**
been completed. It must not be presented as a final, fully validated user manual.

The **COMPLETO** archive includes historical material, including previous manual editions;
this does not make those historical files the current manual.

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
| `index.html`, `styles/`, `src/` | Current runnable application source |
| `docs/` | Technical notes; manual v3.0 upload pending |
| `downloads/` | ESSENZIALE original ZIP (COMPLETO upload pending) |
| `.github/` | Contribution and feedback templates |
| `LICENSE`, `DOCUMENTATION_LICENSE.md`, `TRADEMARK_NOTICE.md` | Licensing and identity rules |

Sorgiva Synth is not a DAW or sampler. The desktop browser path is its current mainline.
If you are upgrading from an older build, export user presets, patterns, Arp macros and MIDI Learn
mappings separately. Preserve a previous release in a different directory for rollback.

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