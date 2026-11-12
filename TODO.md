# TODO / roadmap

Status key: **DONE** (built and tested here) · **BUILT** (written, not yet tested in the real tool) ·
**NEXT** · **LATER**. Evidence for DONE items: `npm test` (23 tests).

## 0.1.0 — this release

| Item | Status | Evidence / note |
|---|---|---|
| Skill in Agent Skills format, split into SKILL.md + `references/` | DONE | `skills/bootstrap-environment/` |
| Stack detection → exact lockfile install commands, frameworks, LSP suggestions | DONE | `bin/detect-stack.mjs`; test "detect-stack" |
| Scaffold: AGENTS.md, CLAUDE.md, board, register, memory, sign-offs, releases (never overwrites) | DONE | `bootstrap init`; used by every test |
| Pre-tool guard: force-push, `--no-verify`, hooksPath tampering, server commands, live push by wrong role, docs-only roles writing code, protected config | DONE | `bin/guard.mjs`; 10 guard tests incl. fail-closed on bad payload |
| Pre-push: sign-offs per sha, `_required.md`, release record (words, question, shas, pasted check), hotfix exemption, delete refusal, conflict markers | DONE | `bin/prepush.mjs`; 10 pre-push tests |
| Memory CLI: index, report, find, check (stale paths, malformed frontmatter, conflict markers, budget) | DONE | `bin/mem.mjs`; 2 tests |
| Role briefs for 12 roles + project-lane template | DONE | `roles/` |
| Per-worktree role setup: session marker, deny rules, plugin kit narrowing (wildcards) | BUILT | `bootstrap role`; run by hand in a temp repo. Not yet confirmed that Claude Code honours `enabledPlugins` in `settings.local.json` per worktree (R14) |
| Claude Code plugin + marketplace manifests | BUILT | `.claude-plugin/`; JSON valid. **UNKNOWN:** not yet validated with `claude plugin validate` or installed from GitHub |
| Agent Plugins root `plugin.json` | BUILT | minimal fields only; validate per tool |
| Adapters: Cursor, Codex, Copilot, Antigravity, Devin, Kiro, OpenCode, Cline, Aider, Zed, Junie, Amp, ChatGPT | BUILT | `bin/adapt.mjs`; every adapter run twice in a temp repo (second run skips everything). Not tested inside each tool |

## 0.2.0 — user-defined flow

| Item | Status | Evidence / note |
|---|---|---|
| Flow as data: `flow/defaults.json` + `.bootstrap/flow.json` (lanes, stages, gates, conditions, words, sessions) | DONE | `bin/lib/flow.mjs`; 7 tests |
| Presets: Full company, Small team, Solo, Custom | DONE | test "presets change lanes" |
| Company defaults with locked floors, approved/required/blocked sources, `company init` | DONE | 3 tests incl. "cannot loosen a company floor" |
| Pre-push obeys the flow: lane gate + file conditions + floor; judged by the flow already on the remote | DONE | 5 tests incl. "a push that loosens the flow is judged by the flow already accepted" |
| Guard knows custom sessions from the flow | DONE | 1 test |
| Visual editor (`bootstrap flow`): local only, token + host check, save refuses errors, writes `docs/flow.md` | DONE | 3 server tests; used end to end in a browser on a demo project (desktop + phone width) |
| Per-session preferred GitHub sources (pasted), searched first in Phase 3 | DONE | `bootstrap flow sources`; editor classifies official / trust-check / blocked / invalid |
| Company "Check for updates" from a GitHub repo | BUILT | uses GitHub's public API and raw files; not yet tried against a real company repo |

## 0.3.0 — who checks what, beginner-friendly editor

| Item | Status | Evidence / note |
|---|---|---|
| A session signs only as itself (file writes, shell writes, `--role`, `BOOTSTRAP_ROLE`, session.json tampering) | DONE | `tests/trust.test.mjs`: 4 tests |
| Only the Chief of Staff routes pieces and records the owner's approve/go; release records only Release Ops / Hotfix / CoS | DONE | same |
| Code needs a routed piece (explicit lane); unknown lanes refused; the refusal says why per piece | DONE | test "no lane set → refused" |
| Screen changes need Design + the owner's recorded approval with the artifact link; HIGH needs a recorded "go"; relays honour the flow | DONE | 3 tests |
| Editor: welcome card, plain-language intros, field hints, Help glossary, friendly check labels, approval switches | DONE | checked in a browser at desktop and phone width |
| Separate identity per role (signed commits or bot accounts) + server-side checks | NEXT | the only way to make sign-offs unforgeable by someone working outside the AI tools |

## 0.4.0 — light on tokens

| Item | Status | Evidence / note |
|---|---|---|
| `bootstrap brief <role>`: role-tagged rules (`flow/rules.json`), ~1k tokens per session start instead of ~7k | DONE | `tests/ops.test.mjs` "a brief is far smaller"; `bootstrap cost` on a fresh project |
| AGENTS.md keeps only the five rules everyone needs; the rest live once in the rule file | DONE | always-loaded ~1,350 → ~1,050 tokens |
| `next <piece>`, `board --mine`, `board archive`, `cost` | DONE | 5 tests |
| `piece --suggest` (lane + extra checks from changed files) | DONE | 1 test |
| Sign-offs need evidence (CLI refuses; push check ignores a bare PASS and says so) | DONE | 3 tests |
| `init --size prototype\|small\|live` → Solo / Small team / Full company | DONE | 1 test |
| Guard ~220 → ~115 ms (no git process per call) | DONE | measured; ~70 ms of the rest is Node start-up |
| Permanent nested sessions stay the model (no short-lived reviewers) | DECIDED | owner's choice, 2026-11-12 |

## NEXT — make it trustworthy outside Claude Code

1. **Install from GitHub and prove it, per tool.** Claude Code first: `marketplace add` + `install` + run the skill on a sample repo. Then Cursor, Codex, Copilot, Antigravity and Devin.
2. **Wire and smoke-test the guard hook per tool:** Cursor `.cursor/hooks.json`, Copilot `.github/hooks/*.json`, Codex hooks, Antigravity `.agents/hooks.json`, Devin `.devin/hooks.v1.json`, Kiro `.kiro/hooks`. Each needs its payload normalised in `guard.mjs` and every branch executed (R2).
3. **Per-tool role permissions:** Copilot `tools:` allowlists, Kiro `permissions.rules`, OpenCode `agents.<id>.permissions`, Codex per-role profiles.
4. **Server-side layer:** a script that prints (or, with the owner's go, applies) GitHub branch protection plus a required status check running `prepush.mjs` logic in CI. Only this layer binds cloud agents.
5. **Bootstrap evals:** sample repos (Laravel, Next.js, Django, Go, Rust, .NET) and an assertion run (stack found, right install commands, right plugins picked, `mem check` green). The run fails if a change to the skill breaks another stack.
6. **pre-commit hook:** refuse edits to an existing lesson file (lessons are immutable; supersede instead), and run a secret scan of staged files.

## LATER — make it better

- **Owner digest:** `bootstrap digest` builds the daily message (shipped, waiting on the owner, top risks) from the board, register and logs.
- **Metrics and retros:** time from ask to live per piece, reopened sign-offs, bugs found after release, lessons written; a weekly review by the Librarian.
- **Drills:** a backup restore (Platform) and a release rollback rehearsal; every release record names its rollback.
- **Inbox per session** (`docs/inbox/<role>/`) for tools without cross-session messaging, with "supersedes" enforced.
- **Context budget per session**, with a hand-over when a session's context passes a threshold.
- **Ports of the toolkit** for projects that can't run Node (Python and PowerShell).
- **Gate templates per stack** (lint, page-per-role loader, route-guard check, dependency audit, secret scan).

## Known limits (honest)

- Layers 1–3 run on the developer's machine, so someone determined can bypass them. Layer 4 (server) can't be bypassed.
- The guard parses shell commands with simple rules. An obfuscated command could slip past it, but the pre-push hook still checks what actually gets pushed.
- Cell values in `docs/compatibility.md` marked UNVERIFIED come from forums or third parties.
