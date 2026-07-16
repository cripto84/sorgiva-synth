#!/usr/bin/env python3
"""Dependency-light static regression smoke test for Sorgiva Synth."""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "0.26.7r2-public-alpha-readiness-regression-baseline"
EXPECTED_PRESETS = 135
EXPECTED_MIDI_TARGETS = 229
EXPECTED_MIDI_MODES = {"continuous": 106, "toggle": 48, "selector": 71, "trigger": 4}


class ProjectHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.assets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if data.get("id"):
            self.ids.append(str(data["id"]))
        if tag == "script" and data.get("src"):
            self.assets.append(str(data["src"]))
        if tag == "link" and data.get("href"):
            self.assets.append(str(data["href"]))


def fail(message: str) -> None:
    raise AssertionError(message)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=False)


def evaluate_js_file(path: Path, expression: str, setup: str = "") -> object:
    source = f"""
const fs = require('fs');
const vm = require('vm');
const context = {{ window: {{}}, console, setTimeout, clearTimeout, requestAnimationFrame: undefined }};
context.window.window = context.window;
{setup}
vm.createContext(context);
vm.runInContext(fs.readFileSync({json.dumps(str(path))}, 'utf8'), context, {{ filename: {json.dumps(path.name)} }});
const result = ({expression});
process.stdout.write(JSON.stringify(result));
"""
    result = run(["node", "-e", source])
    if result.returncode != 0:
        fail(f"JavaScript evaluation failed for {path.relative_to(ROOT)}:\n{result.stderr}")
    return json.loads(result.stdout)


def check_versions() -> None:
    for name in ("VERSION", "VERSION.txt"):
        value = (ROOT / name).read_text(encoding="utf-8").strip()
        if value != EXPECTED_VERSION:
            fail(f"{name} mismatch: {value!r}")
    identity = (ROOT / "src/core/identity.js").read_text(encoding="utf-8")
    if EXPECTED_VERSION not in identity or 'const DISPLAY_VERSION = "v0.26.7r2"' not in identity:
        fail("identity.js does not expose the expected r2 version")
    required_suffixes = {
        "src/presets/presets.js": "_v0_26_7r2.json",
        "src/sequencer/step-sequencer.js": "_v0_26_7r2.sorgiva-pattern.json",
        "src/midi/midi-learn.js": "_v0_26_7r2_",
    }
    for rel, marker in required_suffixes.items():
        if marker not in (ROOT / rel).read_text(encoding="utf-8"):
            fail(f"Missing r2 export suffix {marker!r} in {rel}")


def check_javascript() -> None:
    files = sorted((ROOT / "src").rglob("*.js"))
    if len(files) != 24:
        fail(f"Expected 24 JavaScript files, found {len(files)}")
    for path in files:
        result = run(["node", "--check", str(path)])
        if result.returncode != 0:
            fail(f"Syntax error in {path.relative_to(ROOT)}:\n{result.stderr}")


def check_json() -> None:
    for path in sorted(ROOT.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            fail(f"Invalid JSON {path.relative_to(ROOT)}: {exc}")


def check_html() -> None:
    parser = ProjectHtmlParser()
    parser.feed((ROOT / "index.html").read_text(encoding="utf-8"))
    duplicates = sorted(key for key, count in Counter(parser.ids).items() if count > 1)
    if duplicates:
        fail(f"Duplicate HTML ids: {duplicates[:20]}")
    for asset in parser.assets:
        if re.match(r"^(?:https?:|data:|//)", asset):
            continue
        target = (ROOT / asset).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            fail(f"Asset escapes project root: {asset}")
        if not target.exists():
            fail(f"Missing HTML asset: {asset}")


def check_factory_presets() -> None:
    report = evaluate_js_file(
        ROOT / "src/presets/factory-presets.js",
        """(() => {
          const presets = context.window.SynthXFactoryPresets || [];
          const ids = presets.map(p => p.id);
          const names = presets.map(p => p.name);
          const invalidNumbers = [];
          const activeMotion = [];
          for (const preset of presets) {
            for (const [id, value] of Object.entries(preset.parameters || {})) {
              if (typeof value === 'number' && !Number.isFinite(value)) invalidNumbers.push(`${preset.id}:${id}`);
            }
            if (preset.parameters?.['seq-enabled'] === true || preset.parameters?.['arp-enabled'] === true) activeMotion.push(preset.id);
          }
          return {
            count: presets.length,
            uniqueIds: new Set(ids).size,
            uniqueNames: new Set(names).size,
            invalidNumbers,
            activeMotion
          };
        })()""",
    )
    if report["count"] != EXPECTED_PRESETS:
        fail(f"Expected {EXPECTED_PRESETS} presets, found {report['count']}")
    if report["uniqueIds"] != EXPECTED_PRESETS or report["uniqueNames"] != EXPECTED_PRESETS:
        fail("Factory preset ids or names are not unique")
    if report["invalidNumbers"]:
        fail(f"Non-finite factory values: {report['invalidNumbers'][:10]}")
    if report["activeMotion"]:
        fail(f"Factory presets unexpectedly enable Arp/Sequencer: {report['activeMotion'][:10]}")


def check_midi_targets() -> None:
    setup = "context.window.SorgivaSynth = {}; context.window.SynthXState = { data: {} };"
    report = evaluate_js_file(
        ROOT / "src/midi/midi-learn.js",
        """(() => {
          const targets = context.window.SynthXMidiLearn.getTargets();
          const modes = {};
          for (const target of targets) modes[target.mode] = (modes[target.mode] || 0) + 1;
          return { count: targets.length, unique: new Set(targets.map(t => t.id)).size, modes };
        })()""",
        setup,
    )
    if report["count"] != EXPECTED_MIDI_TARGETS or report["unique"] != EXPECTED_MIDI_TARGETS:
        fail(f"MIDI target count/uniqueness mismatch: {report}")
    if report["modes"] != EXPECTED_MIDI_MODES:
        fail(f"MIDI target mode counts mismatch: {report['modes']}")


def check_r2_guards_and_cleanup() -> None:
    morph = (ROOT / "src/presets/preset-morph.js").read_text(encoding="utf-8")
    required = [
        "function hasReadyMorphSlots()",
        "if (!hasReadyMorphSlots())",
        'return Boolean(getSlot("a") && getSlot("b"));',
    ]
    for marker in required:
        if marker not in morph:
            fail(f"Preset Morph startup guard missing: {marker}")
    for rel in ("src/state/state.js", "src/midi/midi.js"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if 'hardwareTestStatus: "passed-real-controller-baseline-2026-07-09"' not in text:
            fail(f"MIDI hardware baseline missing in {rel}")
    for stale in ("DELETE_MANIFEST_v0_26_7p.txt", "DELETE_MANIFEST_v0_26_7r1.txt", "PATCH_README_v0_26_7r1.txt"):
        if (ROOT / stale).exists():
            fail(f"Superseded root artifact still present: {stale}")


def check_no_obvious_remote_runtime() -> None:
    combined = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in sorted((ROOT / "src").rglob("*.js")))
    forbidden = [r"\beval\s*\(", r"\bnew\s+Function\s*\(", r"\bXMLHttpRequest\b", r"\bWebSocket\s*\(", r"\bfetch\s*\("]
    for pattern in forbidden:
        if re.search(pattern, combined):
            fail(f"Unexpected remote/dynamic runtime construct matched: {pattern}")


def main() -> int:
    checks = [
        ("versions/export suffixes", check_versions),
        ("JavaScript syntax", check_javascript),
        ("JSON validity", check_json),
        ("HTML ids/assets", check_html),
        ("factory presets", check_factory_presets),
        ("MIDI Learn target coverage", check_midi_targets),
        ("r2 guards/root cleanup", check_r2_guards_and_cleanup),
        ("remote runtime surface", check_no_obvious_remote_runtime),
    ]
    for label, check in checks:
        check()
        print(f"PASS  {label}")
    print(f"\nStatic smoke test passed for Sorgiva Synth {EXPECTED_VERSION}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL  {exc}", file=sys.stderr)
        raise SystemExit(1)
