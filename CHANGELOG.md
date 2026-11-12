# Changelog

## 0.2.0 — 2026-11-12

- **User-defined flow.** Lanes, stages, gates, conditions, words and sessions are data in `.bootstrap/flow.json`, with presets (Full company, Small team, Solo, Custom).
- **Visual flow editor** (`bootstrap flow`): a local page with tabs for Flow, Sessions, Gates & words, Check, Board, Presets and Company. Saving writes `flow.json` and `docs/flow.md`.
- **Preferred sources per session:** paste GitHub links; they're searched first in plugin discovery, pinned, and trust-checked unless official.
- **Company defaults:** `company init`, `flow --company`, locked floors that projects can't loosen, approved, required and blocked sources, and "Check for updates".
- The **pre-push hook obeys the flow**: lane gate plus file conditions plus company floor, judged by the flow already on the remote. New command `bootstrap piece`.
- The guard reads custom sessions from the flow. 17 new tests (40 in total).

## 0.1.0 — 2026-11-11

First public version.

- Agent Skill `bootstrap-environment`: probe, stack-aware installs, plugin discovery across marketplaces and GitHub, verify, scaffold, session family, memory, proof, report.
- Toolkit (Node ≥18, no dependencies): `detect-stack`, `bootstrap` (init, role, signoff, require, release, status), `mem`, `guard` (pre-tool hook), `prepush` (git hook), `adapt` (per-tool files).
- 12 role briefs plus a project-lane template; Tech Lead and Security are core roles; Platform and Support are on demand.
- Owner's word may be typed or relayed in full (exact words, the question asked, shas, pasted check, sign-offs).
- Adapters for 13 tools; compatibility matrix researched 2026-11-11.
- 23 tests against real temporary git repos.
