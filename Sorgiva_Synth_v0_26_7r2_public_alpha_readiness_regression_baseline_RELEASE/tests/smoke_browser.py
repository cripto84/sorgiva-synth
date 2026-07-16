#!/usr/bin/env python3
"""Optional Chromium/Playwright runtime smoke test for Sorgiva Synth."""
from __future__ import annotations

import contextlib
import http.server
import json
import re
import shutil
import socketserver
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "0.26.7r2-public-alpha-readiness-regression-baseline"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def build_inline_html() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', '', html)

    def replace_script(match):
        src = match.group(1)
        path = (ROOT / src).resolve()
        path.relative_to(ROOT.resolve())
        code = path.read_text(encoding="utf-8").replace("</script>", r"<\/script>")
        return f"<script>\n{code}\n</script>"

    return re.sub(r'<script\s+src="([^"]+)"\s*></script>', replace_script, html)


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        print(f"SKIP  Playwright is not available: {exc}", file=sys.stderr)
        print("Install it with: pip install playwright", file=sys.stderr)
        return 2

    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with ReusableTCPServer(("127.0.0.1", 0), handler) as server:
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        console_errors: list[str] = []
        page_errors: list[str] = []
        with sync_playwright() as pw:
            executable = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
            launch_args = {"headless": True, "args": ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"]}
            if executable:
                launch_args["executable_path"] = executable
            browser = pw.chromium.launch(**launch_args)
            page = browser.new_page()
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            url = f"http://127.0.0.1:{port}/index.html"
            try:
                page.goto(url, wait_until="networkidle")
            except Exception as exc:
                if "ERR_BLOCKED_BY_ADMINISTRATOR" not in str(exc):
                    raise
                # Managed/sandboxed Chromium may block localhost and file:// navigation.
                # In that case load the identical project scripts inline only for the smoke run.
                page.set_content(build_inline_html(), wait_until="load")
            page.wait_for_function("window.SynthXAudio && window.SynthXMidiLearn && window.SynthXSequencer && window.SynthXPresetMorph")
            page.wait_for_timeout(200)

            report = page.evaluate("""async () => {
              const midiAudit = window.SynthXMidiLearn.getTargetCoverageAudit();
              const chord = window.SynthXSequencer.runStepChordSafetySelfTest();
              const morphStatus = document.getElementById('morph-status');
              const result = {
                version: window.SorgivaSynth?.appVersion,
                presetCount: window.SynthXFactoryPresets?.length || 0,
                midiTargets: midiAudit.currentTargetCount,
                midiMissingTargets: midiAudit.missingTargets.length,
                midiModes: midiAudit.mappingModeCounts,
                stepCount: document.querySelectorAll('.seq-step').length,
                keyCount: document.querySelectorAll('.key[data-note]').length,
                chordSelfTestOk: Boolean(chord?.ok),
                chordFailures: chord?.failures || [],
                morphStatusKind: morphStatus?.dataset?.kind || '',
                morphStatusText: morphStatus?.textContent || ''
              };
              const presets = window.SynthXFactoryPresets || [];
              window.SynthXPresets.setAbSlot('a', presets[0]);
              window.SynthXPresets.setAbSlot('b', presets[1]);
              const morphRatio = document.getElementById('morph-ratio');
              morphRatio.value = '0.5';
              morphRatio.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 120));
              result.morphAfterSlotsKind = morphStatus?.dataset?.kind || '';
              result.morphAfterSlotsText = morphStatus?.textContent || '';
              result.morphSummary = window.SynthXPresetMorph.getSummary();
              document.getElementById('audio-unlock')?.click();
              await new Promise(resolve => setTimeout(resolve, 120));
              result.audioStateAfterUnlock = window.SynthXAudio.getContext()?.state || 'missing';
              window.SynthXAudio.noteOn(60, 0.8, 'smoke-browser');
              await new Promise(resolve => setTimeout(resolve, 80));
              result.voiceCountDuringNote = window.SynthXAudio.getVoiceCount();
              window.SynthXAudio.noteOff(60, 'smoke-browser');
              await new Promise(resolve => setTimeout(resolve, 900));
              result.voiceCountAfterRelease = window.SynthXAudio.getVoiceCount();
              result.heldNotesAfterRelease = window.SynthXAudio.getHeldNoteCount();
              return result;
            }""")
            browser.close()
        server.shutdown()

    failures: list[str] = []
    if report["version"] != EXPECTED_VERSION:
        failures.append(f"version={report['version']!r}")
    if report["presetCount"] != 135:
        failures.append(f"presetCount={report['presetCount']}")
    if report["midiTargets"] != 229 or report["midiMissingTargets"] != 0:
        failures.append(f"midi audit={report['midiTargets']} targets/{report['midiMissingTargets']} missing")
    if report["midiModes"] != {"continuous": 106, "toggle": 48, "selector": 71, "trigger": 4}:
        failures.append(f"midi modes={report['midiModes']}")
    if report["stepCount"] != 32:
        failures.append(f"stepCount={report['stepCount']}")
    if report["keyCount"] != 48:
        failures.append(f"keyCount={report['keyCount']}")
    if not report["chordSelfTestOk"]:
        failures.append(f"chord self-test failures={report['chordFailures']}")
    if report["morphStatusKind"] == "error" or "Morph non applicato" in report["morphStatusText"]:
        failures.append(f"morph startup status={report['morphStatusKind']}: {report['morphStatusText']}")
    if report["morphAfterSlotsKind"] == "error" or "Morph non applicato" in report["morphAfterSlotsText"]:
        failures.append(f"morph live status={report['morphAfterSlotsKind']}: {report['morphAfterSlotsText']}")
    if report["morphSummary"].get("a") is None or report["morphSummary"].get("b") is None:
        failures.append(f"morph slots not ready={report['morphSummary']}")
    if report["audioStateAfterUnlock"] != "running":
        failures.append(f"audio state={report['audioStateAfterUnlock']}")
    if report["voiceCountDuringNote"] < 1:
        failures.append(f"voiceCountDuringNote={report['voiceCountDuringNote']}")
    if report["heldNotesAfterRelease"] != 0:
        failures.append(f"heldNotesAfterRelease={report['heldNotesAfterRelease']}")
    if page_errors:
        failures.append(f"page errors={page_errors}")
    if console_errors:
        failures.append(f"console errors={console_errors}")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    if failures:
        print("FAIL  " + " | ".join(failures), file=sys.stderr)
        return 1
    print("\nBrowser smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
