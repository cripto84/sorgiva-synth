#!/usr/bin/env python3
"""Synchronize canonical RC1 audio engine into downloadable distribution archives."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import os
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = "src/audio/audio-context.js"
SOURCE = (ROOT / SOURCE_PATH).read_bytes()
ARCHIVES = [
    ROOT / "Sorgiva_Synth_UI_Studio_RC1_ESSENZIALE.zip",
    ROOT / "Sorgiva_Synth_UI_Studio_RC1_SVILUPPO_SNELLO.zip",
    ROOT / "Sorgiva_Synth_UI_Studio_RC1_COMPLETO_SNELLO.zip",
]
for archive in ARCHIVES:
    if not archive.exists():
        raise SystemExit(f"Missing archive: {archive.name}")
    fd, tmp_name = tempfile.mkstemp(prefix="sorgiva-", suffix=".zip", dir=ROOT)
    os.close(fd)
    temp = Path(tmp_name)
    matches = 0
    try:
        with ZipFile(archive, "r") as old, ZipFile(temp, "w") as new:
            for item in old.infolist():
                data = old.read(item.filename)
                if item.filename.endswith("/" + SOURCE_PATH) or item.filename == SOURCE_PATH:
                    data = SOURCE
                    matches += 1
                new.writestr(item, data)
        if matches != 1:
            raise RuntimeError(f"Expected one engine in {archive.name}, found {matches}")
        with ZipFile(temp, "r") as check:
            if check.testzip() is not None:
                raise RuntimeError(f"ZIP corruption: {archive.name}")
            found = [n for n in check.namelist() if n.endswith("/" + SOURCE_PATH) or n == SOURCE_PATH]
            assert len(found) == 1 and check.read(found[0]) == SOURCE
        temp.replace(archive)
        print(f"Updated {archive.name}; engine SHA-256 {hashlib.sha256(SOURCE).hexdigest()}")
    finally:
        temp.unlink(missing_ok=True)
