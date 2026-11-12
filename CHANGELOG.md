# Changelog

## 0.4.0 — 2026-11-12

- **Per-role briefs** (`bootstrap brief <role>`): each session's first message holds only its own rules, in full with their reasons, plus its part in the flow. The rules live once in `flow/rules.json`. A session start goes from ~7,000 to ~2,000 tokens.
- **AGENTS.md is slimmer:** the five rules everyone needs plus a pointer, so ~300 fewer tokens in every session.
- **Commands that answer instead of files to read:** `next <piece>`, `board --mine`, `board archive`, `cost`, `piece --suggest`.
- **Evidence required:** a PASS without evidence is refused by the CLI and ignored by the push check, which says so.
- `init --size prototype|small|live` picks a fitting preset.
- **Faster guard** (~115 ms instead of ~220 ms): no git process per call.
- Role files and the skill now point sessions to the brief and the tools. 10 new tests (58 in total).

## 0.3.0 — 2026-11-12

- **A session signs only as itself.** The guard blocks writing another role's sign-off (by file or shell), signing with `--role` as someone else, `BOOTSTRAP_ROLE` spoofing and editing `session.json`. The CLI refuses the same.
- **Only the Chief of Staff routes work.** `bootstrap piece` (lane) and the new `bootstrap approve` (the owner's approve/go) are Chief-of-Staff-only. Release records are limited to Release Ops, Hotfix and the Chief of Staff.
- **Code must be routed.** The pre-push hook refuses code unless its piece has an explicit lane, and says per piece what's missing.
- **Your approval is enforced.** Screen changes need Design's sign-off plus your recorded approval with the artifact link; HIGH work needs your recorded "go"; relays follow the flow's settings. Both are configurable per lane and per file condition in the editor.
- **Beginner-friendly editor:** welcome card, plain-language intros and examples, a hint on every field, a Help glossary, and friendly check labels.
- 8 new tests (48 in total).

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
