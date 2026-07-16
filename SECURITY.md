# Security Policy

## Supported versions

Sorgiva Synth is currently in pre-public-alpha development.

| Version | Security support |
|---|---|
| Latest code on the default branch and current public-alpha candidate | Best-effort support |
| Older snapshots, historical patches and retired SynthX builds | Not supported |
| Unofficial forks and repackaged builds | Contact the fork maintainer |

Security fixes may require users to move to the newest available build.

## Reporting a vulnerability

**Do not open a public issue for an undisclosed vulnerability.**

Preferred method:

1. Open the repository's **Security** tab.
2. Open **Advisories**.
3. Select **Report a vulnerability**.

This requires private vulnerability reporting to be enabled for the repository.

If the button is unavailable, use the private contact method published on the maintainer's GitHub profile (`@cripto84`). Do not send exploit details through a public issue, pull request or discussion.

Include:

- a clear description of the issue;
- affected version or commit;
- reproduction steps or proof of concept;
- expected security impact;
- browser and operating system;
- whether the issue requires a malicious imported file;
- any suggested mitigation;
- whether public disclosure has already occurred.

Please remove personal data, credentials and unrelated private information.

## In scope

Examples include:

- malicious or unsafe preset, pattern, user-bank or mapping imports;
- script execution or HTML injection through imported data;
- path or file-handling vulnerabilities;
- browser-storage misuse that crosses expected project boundaries;
- unexpected external network communication;
- dependency or supply-chain risks;
- exposed secrets or private keys committed to the repository;
- bypasses that create a credible security impact.

## Usually not security issues

Use the normal bug-report form for:

- audio clicks, pops or distorted sound;
- stuck notes;
- browser incompatibility;
- CPU overload;
- MIDI-device incompatibility;
- lost local presets without a security boundary being crossed;
- malformed files that only produce a handled error or local crash;
- feature requests and documentation errors.

When uncertain, report privately first.

## Current security model

The current build is a local/static WebAudio application.

- It makes no intentional external network calls.
- Normal operation does not require an account or server backend.
- Imported project data is intended to remain data-only.
- User presets and preferences may be stored in browser `localStorage`.
- Audio and MIDI permissions are controlled by the browser and operating system.
- Local storage is convenience storage, not a secure vault or guaranteed backup.

Do not store secrets or sensitive personal data in preset names, descriptions or exported files.

## Coordinated disclosure

The maintainer will make a best effort to:

- acknowledge a complete report within seven days;
- reproduce and assess the issue;
- request additional information when needed;
- prepare a fix or mitigation;
- coordinate a reasonable disclosure date;
- credit the reporter when requested and appropriate.

Response and fix times depend on severity, reproducibility and maintainer availability. No bounty is currently offered.

Please allow time for assessment before public disclosure. If active exploitation is suspected, state this clearly in the report.

## Safe research

Good-faith research should:

- use systems and files you own or are authorized to test;
- minimize access to other people's data;
- avoid persistence, destructive actions and service disruption;
- stop after demonstrating the issue;
- share details privately and allow reasonable remediation time.

This policy does not authorize testing of third-party systems or unlawful activity.
