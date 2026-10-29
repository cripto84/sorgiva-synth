# UI Studio RC1 — source, release and history policy

**Baseline:** 29 October 2026 — UI Studio RC1; engine 0.27.0-beta1-rc1. This is a release candidate, not a certified stable public release.

## Single source of truth
The `index.html`, `src/`, `styles/` and associated version/license files in the Git repository are the current runnable source. The 48 files of the uploaded UI Studio RC1 ESSENZIALE ZIP have been compared byte for byte with the source. The engine identity stays separate from UI_VERSION; legacy SynthX identifiers used for compatibility are intentionally preserved.

## Distribution tiers
1. **ESSENZIALE**: 48 runtime and license files, unmodified.
2. **SVILUPPO_SNELLO**: same exact runtime plus selected QA scripts/results, technical docs and checksums. No manual PDF.
3. **COMPLETO_SNELLO**: development package plus candidate v4.0 user manual.
4. **Historical vault (offline):** full 624-file original bundle with 24 checkpoints, repeated screenshots and previous release ZIPs. Not a required part of daily development.

The local regeneration identified 624 original ZIP files totalling ~89.0 MB as an archive. New developer and lean-complete packages contain 90 and 91 files and measure ~1.52 MB and ~4.67 MB respectively. These new ZIPs are **not automatically available in GitHub**; upload separately if desired. Old source/manual ZIPs already committed to GitHub remain archive references until a separate archival migration.

## What was checked
- Old COMPLETO and ESSENZIALE contain byte-identical copies of all 48 runtime files.
- Zip CRC verification passed; static HTML local script and CSS references exist.
- All 34 JavaScript source files pass Node syntax checks.
- GitHub RC1 runtime entrypoint, UI files and visualizer files have matching Git blob SHAs.
- The user-uploaded UI Studio RC1 PDF (1,043 pages) and ESSENZIALE ZIP match the local file hashes.

## QA limits
The historical RC1 dossier reports Chromium automated tests including 135 factory preset loads, 643 patch fields and 229 MIDI Learn targets, not independently rerun during this GitHub packaging task. Human hearing tests, real MIDI hardware, real mobile devices, performance/dropout stability, and a current full browser test are **not verified** here.

## Maintenance rules
- Do not commit intermediate complete ZIPs or duplicate QA screenshots to the main source tree.
- Never remove source history by force-push or wholesale deletion. Historical Git blobs remain accessible by commit history.
- Keep new release binaries in a dedicated release/download area, not nested inside the source ZIP.
- Keep development QA scripts and final consolidated results, archive per-phase evidence separately.
- Run package integrity and runtime tests before promoting a PR from draft or releasing publicly.
