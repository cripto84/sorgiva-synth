# Pull Request

## Summary

Describe the change in a few clear sentences.

## Why this change is needed

Explain the problem, user impact or project goal.

## Scope

Select all that apply:

- [ ] Bug fix
- [ ] Audio-engine or voice-management change
- [ ] UI or accessibility change
- [ ] MIDI or MIDI Learn change
- [ ] Sequencer or Arpeggiator change
- [ ] Preset or serialization change
- [ ] Factory-preset change
- [ ] Documentation
- [ ] Tests or QA
- [ ] Repository maintenance

## Files and systems affected

List the important files, modules, stored formats or runtime systems touched.

## Behavior and compatibility

- Audio behavior changed: **Yes / No**
- Serialized patch or pattern data changed: **Yes / No**
- Browser storage changed: **Yes / No**
- Factory-preset count changed: **Yes / No**
- Factory-preset sound changed: **Yes / No**
- Legacy SynthX compatibility changed: **Yes / No**

Explain every **Yes** answer.

## Testing performed

Include operating system, browser/version, launch method and hardware when relevant.

```text
OS:
Browser:
Launch method:
Audio device:
MIDI controller:
```

Commands run:

```text
python3 tests/smoke_static.py
python3 tests/smoke_browser.py
```

Manual tests performed:

- [ ] Audio unlock
- [ ] Note On/Off
- [ ] Single notes and chords
- [ ] Release and Panic/All Notes Off
- [ ] Mono and Poly, when relevant
- [ ] High Unison or long Release, when relevant
- [ ] Sequencer/Arpeggiator, when relevant
- [ ] Import/export round trip, when relevant
- [ ] Browser-local storage, when relevant
- [ ] MIDI hardware, when relevant
- [ ] Listening test at a safe monitoring level

## Evidence

Add screenshots, console output, short recordings or before/after details when useful.

## Known limitations or untested areas

State them explicitly. Do not leave this section blank; write `None known` when appropriate.

## Contributor checklist

- [ ] I read `CONTRIBUTING.md`.
- [ ] This pull request is focused and contains no unrelated refactor.
- [ ] I preserved intentional legacy compatibility fields.
- [ ] I did not reintroduce retired factory-preset data.
- [ ] New or changed factory presets keep Arpeggiator and Sequencer off by default.
- [ ] JavaScript syntax and JSON validity were checked.
- [ ] The static smoke test passes, or I explained why it could not be run.
- [ ] Runtime/browser behavior was tested when the change can affect it.
- [ ] Audio or preset changes were evaluated by ear.
- [ ] Documentation and version references were updated where necessary.
- [ ] I have the right to submit this contribution under the project licenses.
- [ ] I disclosed substantial AI assistance when it materially shaped the contribution.
