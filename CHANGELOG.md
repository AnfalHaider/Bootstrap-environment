# Changelog

## 0.6.0 — 2026-11-17

- **You talk only to the Chief of Staff.** Every session reports to it. Your decisions reach a session as a committed record of your words, never as a bare message. Sessions push with no permission click (`init` allows `git push` and the kit's commands), because the pre-push check is the real gate.
- **On and optional sessions.** On from the start: Chief of Staff, Builder, QA, Design, Librarian, Researcher. Optional: Security, Tech Lead, Release Ops, Hotfix, Platform, Support. The Chief of Staff starts an optional session when a piece needs its sign-off or you ask. Security still joins automatically for login, payment, upload and secret files, and Tech Lead for migrations and HIGH work. New `bootstrap family` command.
- **The Chief of Staff can release** when Release Ops isn't running, with the same release record.
- **Fits your branches.** `init` detects the live branch (the remote default: `main`, `master`, `trunk`…) and uses a dev branch only if one exists (`--dev none` to skip). Without a dev branch, sign-offs are checked when pushing to live, and the editor and `docs/flow.md` name your real branches.
- **Flow changes need your recorded yes.** `bootstrap flow apply --words … --question …` (Chief of Staff only) records it against the exact `flow.json`. The push check accepts a flow-only change that carries the record and refuses one without it, or with a later edit.
- **Kit upgrades with your yes.** `bootstrap upgrade` (or `/upgrade`) refreshes the kit's own files from a newer plugin and keeps the project's policy, flow, role briefs and records. `bootstrap kit apply` (Chief of Staff only) records your yes with every kit file's sha256, and the push check accepts a kit-only change that matches it. Before, every upgrade needed a full piece with sign-offs. `.bootstrap/kit.json` now records the installed version.
- **Helper agents:** at most 2 per session, on the cheapest model. The guard enforces both (configurable in the editor).
- **A simpler flow editor**, opened by the Chief of Staff or with the new `/flow` command. One page instead of the canvas and tabs: an overview of you, the Chief of Staff and the family; On/Optional/Off per session; extra checks; kinds of work; helpers; and "Try a change". Dark mode and phone layout included.
- **The skill matches 0.6.0** (one contact, on and optional sessions, branches, upgrades, helpers, new proof steps and failure conditions) and finds its kit whether it runs from the plugin or as a standalone personal skill. `scripts/install-skill.mjs` (`npm run install-skill`) installs or refreshes the personal copy with the kit it needs.
- Briefs now say who each session reports to, how your word arrives, and its helper limit. 11 new tests (74 in total).

## 0.5.0 — 2026-11-15

- **Drag-and-drop flow canvas** replaces the Flow form. Drop sessions onto the flow or onto a step (side by side), link steps by dragging the ● dot, drag reviewers onto or off a checkpoint (🔒 company minimums refuse), use the bin, undo/redo, zoom and Fit, and keyboard moves. Mouse, pen and touch all work.
- **Side-by-side steps** (`with_previous`) in the flow model, drawn as fan-out and fan-in in `docs/flow.md`. Enforcement is unchanged: only gates and the owner's words are checked.
- **"Try a change"** simulator backed by a new `/api/simulate` endpoint that uses the push check's own logic.
- **First-run wizard** (three questions → preset), a "Start over" button, and five tabs: Flow, Team, Status, Rules, Company. Links like `#simulate/sensitive,screens` and `#wizard` open straight to those views.
- `bootstrap role` now also switches off account-wide plugins outside a session's kit, confirmed against Claude Code 2.1.321.
- README: new screenshots and a section for each part of the editor. 5 new tests (63 in total).

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
