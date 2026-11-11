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
