[CONTRIBUTING.md](https://github.com/user-attachments/files/30098604/CONTRIBUTING.md)
# Contributing to Sorgiva Synth

Thank you for helping improve Sorgiva Synth.

The project welcomes careful contributions to code, testing, documentation, accessibility, presets and browser/MIDI compatibility. Sorgiva Synth is a musical instrument first: a technically valid change is not automatically a musically useful change.

## Read this first

Before contributing, please read:

- [README.md](README.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- the current release's `KNOWN_LIMITS.txt`;
- the current release's `docs/QA_REPORT_v0_26_7r2_PUBLIC_ALPHA_READINESS.txt`.

Do not use public issues for undisclosed security vulnerabilities.

## Project stage

The current baseline is:

`v0.26.7r2 — Public Alpha Readiness & Regression Baseline`

The immediate goal is a controlled public alpha. During this phase, stability, compatibility, documentation and reproducible testing take priority over large new features.

## Ways to contribute

Useful contributions include:

- reproducible browser or audio bug reports;
- MIDI-controller compatibility reports;
- fixes for stuck notes, clicks, state errors or import/export problems;
- accessibility and keyboard-navigation improvements;
- small UI clarity improvements;
- regression tests;
- documentation corrections;
- carefully reviewed factory-preset feedback;
- performance measurements on modest hardware;
- translations that remain aligned with the current build.

Use the repository's structured issue forms whenever possible.

## Before opening a pull request

For significant changes, open an issue first when the proposal touches:

- audio topology or voice management;
- `src/audio/audio-context.js`;
- preset schema or migration;
- browser storage;
- factory presets;
- Sequencer or Arpeggiator persistence;
- MIDI Learn target coverage;
- public naming or legacy SynthX compatibility;
- a large UI or architectural refactor.

Small documentation corrections and narrowly scoped test improvements may be submitted directly.

## Development setup

Sorgiva Synth is a static browser application. It does not require a package manager or compilation step for normal use.

1. Clone or download the repository.
2. Enter the current versioned release directory.
3. Start a local static server:

```bash
python3 -m http.server 8000
```

4. Open `http://localhost:8000/`.
5. Lower the monitoring volume before audio testing.
6. Press **Unlock Audio**.

## Golden rules

1. Keep changes small, focused and reviewable.
2. Preserve behavior that is already known to work.
3. Do not combine feature work with unrelated cleanup.
4. Do not perform blind global replacements.
5. Do not silently change serialized parameter names.
6. Preserve legacy import and storage fallbacks unless a migration plan is approved.
7. Do not modify factory presets merely to increase their number.
8. Do not reintroduce the retired 290-preset library.
9. Do not enable Arpeggiator or Step Sequencer by default in factory presets.
10. Treat audio changes as high risk and test them by ear.
11. Keep monitoring volume conservative during FM, Ring Mod, Sync, resonance, feedback and Unison tests.
12. Update documentation and QA notes when behavior changes.

## Areas requiring extra caution

### Audio engine

Changes to the audio engine require:

- a clearly documented reason;
- comparison against the current baseline;
- manual listening;
- note-on/note-off and release tests;
- checks for clicks, pops, stuck notes and gain spikes;
- tests with single notes and chords;
- tests with Unison, long Release, Delay and Reverb;
- confirmation that Panic/All Notes Off still works.

Do not edit `src/audio/audio-context.js` for cosmetic cleanup or speculative refactoring.

### Factory presets

A factory preset must:

- have a unique ID and name;
- belong to a visible category;
- load without errors;
- remain within the supported UI ranges;
- be safe in gain;
- have a clear musical role;
- differ meaningfully from nearby presets;
- keep Arpeggiator and Sequencer off by default;
- avoid obsolete or unknown parameters;
- be tested in low, middle and high registers;
- be tested with note release and, where relevant, velocity and expressive controls.

A smaller strong library is preferable to a larger weak library.

### Legacy SynthX compatibility

The public name is Sorgiva Synth, but some `SynthX` references are intentional compatibility fields or historical identifiers.

Before renaming or removing a legacy reference, determine whether it is:

- public branding that should be updated;
- a historical changelog reference that should remain;
- an import/export field;
- a storage fallback;
- a JavaScript alias;
- part of a migration path.

Do not replace all occurrences globally.

## Required checks

Run the static smoke test from the current release directory:

```bash
python3 tests/smoke_static.py
```

When Playwright and Chromium are available, also run:

```bash
python3 tests/smoke_browser.py
```

For code changes, verify or document:

- `node --check` passes for every JavaScript file;
- all JSON files parse successfully;
- every local script and stylesheet referenced by `index.html` exists;
- duplicate HTML IDs remain at zero;
- factory-preset count is intentional;
- factory-preset IDs and names remain unique;
- factory presets do not activate Arpeggiator or Sequencer by default;
- Step Sequencer coverage remains 32 steps when relevant;
- MIDI Learn targets remain resolvable when relevant;
- import/export round trips work when serialization changes;
- browser storage remains backward compatible when persistence changes;
- manual audio and MIDI tests performed, or clearly marked as pending.

If a check cannot be run, explain why in the pull request.

## Manual test matrix

For changes that can affect runtime behavior, report the tested combination:

- operating system;
- browser and exact version;
- launch method: `file:///`, `localhost` or HTTPS;
- audio output or interface;
- MIDI controller and connection type, when relevant;
- patch or factory preset used;
- Mono/Poly state;
- number of active notes;
- Unison amount;
- Sequencer/Arpeggiator state;
- whether Scope and Spectrum were enabled.

## Pull-request scope

A pull request should explain:

- what changed;
- why it changed;
- files touched;
- whether audio behavior changed;
- whether serialized data changed;
- whether factory-preset count or sound changed;
- whether legacy compatibility changed;
- tests performed;
- known limits and untested areas;
- screenshots or recordings when useful.

Use the provided pull-request template.

## Commit guidance

Write concise commit messages that describe the result.

Examples:

```text
fix: prevent empty A/B morph preview on startup
test: add preset import round-trip coverage
docs: clarify Firefox WebMIDI limitation
ui: improve keyboard focus visibility
```

Avoid vague messages such as `update`, `changes` or `fix stuff`.

## Documentation contributions

Documentation should:

- describe the real current build;
- use **Sorgiva Synth** as the public name;
- identify legacy SynthX references explicitly;
- avoid promising unvalidated browser or hardware support;
- distinguish technical validation from listening tests;
- avoid presenting planned features as already available;
- keep long technical history under the release documentation rather than the repository root.

Documentation is licensed under CC BY-SA 4.0 unless otherwise stated.

## AI-assisted contributions

AI-assisted work is allowed, but the contributor remains fully responsible for it.

Do not submit unreviewed generated code or documentation. You must understand the change, verify licensing and provenance, run the relevant tests and disclose substantial AI assistance in the pull request when it materially shaped the contribution.

## Licensing of contributions

By submitting a contribution, you confirm that you have the right to provide it and agree that:

- code contributions are licensed under GPL-3.0-only;
- bundled factory-preset and program-data contributions are licensed under GPL-3.0-only;
- documentation contributions are licensed under CC BY-SA 4.0 unless explicitly agreed otherwise;
- required attribution and third-party notices are included.

## Review and acceptance

Not every technically possible change belongs in Sorgiva Synth.

A proposal may be declined when it:

- adds complexity without a clear musical or educational benefit;
- duplicates an existing feature;
- breaks the desktop/core focus;
- turns the synth toward DAW functionality;
- weakens accessibility, stability or legacy compatibility;
- introduces a heavy dependency without a strong reason;
- changes the project's identity or UI structure unnecessarily;
- cannot be tested adequately at the current stage.

Maintainer decisions should be explained respectfully and consistently.

Thank you for helping keep Sorgiva Synth open, stable, understandable and musical.
