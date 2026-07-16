# Support

Sorgiva Synth is maintained as an open-source project and support is provided on a best-effort basis.

## Choose the right channel

- **Reproducible software bug:** use the Bug Report issue form.
- **MIDI hardware result or compatibility problem:** use the MIDI Compatibility Report form.
- **Factory-preset evaluation:** use the Preset Feedback form.
- **New capability or workflow proposal:** use the Feature Request form.
- **Security vulnerability:** follow [SECURITY.md](SECURITY.md); do not open a public issue.
- **Code of Conduct incident:** follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and avoid publishing sensitive details.

## Before asking for help

1. Use the newest available build.
2. Extract the ZIP completely.
3. Lower the monitoring volume.
4. Press **Unlock Audio**.
5. Try Chrome, Edge or another Chromium desktop browser.
6. Load **Default Init**.
7. Press **Panic / All Notes Off**.
8. Reload the page.
9. For MIDI, run the synth through `localhost` or HTTPS.
10. Record the browser, operating system and exact steps.

## Common problems

### No sound

- Confirm the page shows that audio is unlocked.
- Check the operating-system and browser output volume.
- Load **Default Init**.
- Confirm Osc 1 and Master are above zero.
- Check Amp ADSR Sustain and filter cutoff.
- Observe Scope and Spectrum while playing a note.
- Try a current Chromium-based browser.

### MIDI device not detected

- Connect and power on the controller before launching the page.
- Run the app through `http://localhost:8000/`.
- Use Chrome, Edge or another Chromium desktop browser.
- Press **Enable MIDI** and grant permission.
- Refresh the MIDI device list.
- Select the correct input and start with channel filter set to Omni.
- Reconnect the controller and reload the page if needed.

### Notes do not stop

- Press **Panic / All Notes Off** or `Esc`.
- Check Sustain, Hold, Arp Latch and Step Tie.
- Stop the Step Sequencer or Arpeggiator.
- Check for long Amp Release, Delay Feedback or Reverb Decay.

### High CPU use

Reduce one or more of:

- Unison layers;
- Max Voices;
- simultaneous chord notes;
- long releases;
- Delay and Reverb density;
- Scope and Spectrum;
- complex Sequencer chord stacks.

## Project scope

The current mainline targets desktop and laptop browsers.

The following are outside the present support promise:

- mobile and tablet UI;
- DAW-style multitrack recording;
- plugin formats such as VST, AU or AAX;
- universal compatibility with every MIDI device;
- guaranteed recovery of browser-local data;
- support for unofficial forks.

## Backups

Browser `localStorage` is not a permanent backup.

Export important:

- individual patches;
- the User Preset Bank;
- Sequencer patterns;
- Arpeggiator behavior data;
- MIDI Learn mappings.

Keep exported files outside the browser profile.

## Audio safety

Start with a low monitoring level, especially when using:

- FM Light;
- Ring Mod;
- Osc Sync;
- high Resonance;
- many Unison layers;
- distortion;
- Delay Feedback;
- long Reverb.

Dynamics Safety and Gain Guard reduce risk but do not replace responsible monitoring.
