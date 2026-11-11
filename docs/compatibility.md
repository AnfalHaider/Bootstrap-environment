# Compatibility across AI coding tools

Researched 2026-11-11 from vendor documentation (sources at the end). Things change fast; **UNVERIFIED**
marks a cell that came from forums or third parties, not current official docs. The adapters
(`bin/adapt.mjs`) generate only what is listed under "the adapter generates"; hook configs for other
tools are left to manual wiring until each is tested in that tool (see [TODO.md](../TODO.md)).

## Two standards make most of this portable

- **Agent Skills** ([agentskills.io/specification](https://agentskills.io/specification)): a `SKILL.md`
  folder with `name` (≤64 chars, matches the folder) and `description` (≤1024). Keep the body under ~500
  lines and move detail into `references/`, which is why this skill is split. Read by Claude Code, Cursor,
  Codex, ChatGPT (upload), Copilot, Antigravity, Devin Desktop, Cline, Kiro, OpenCode and Amp.
  **`.agents/skills/`** is the shared project location most of them scan.
- **AGENTS.md** (Agentic AI Foundation): nested files allowed, nearest wins. Claude Code reads it only
  when no `CLAUDE.md` exists, so `CLAUDE.md` here is one line: `@AGENTS.md`.
- **Agent Plugins 1.0** (Aug 2026): a root `plugin.json` plus `skills/`. Loaded by Cursor, Codex,
  Copilot, Kiro and VS Code; Devin also reads `.claude-plugin/plugin.json`.

**Landscape changes in 2026:** Windsurf became **Devin Desktop**, and its Cascade agent reached end of
life. Gemini CLI was replaced by **Antigravity CLI (`agy`)** for free users. **Roo Code** shut down on
15 May 2026.

## Matrix

| Tool | Instructions | Skills | Plugin from GitHub | MCP | Hooks (block?) | Per-agent permissions | Multi-agent / cloud | LSP |
|---|---|---|---|---|---|---|---|---|
| Claude Code | CLAUDE.md (AGENTS.md fallback), `.claude/rules` | YES | YES: marketplace | YES | YES: PreToolUse exit 2 | YES: settings + agent tools | YES: subagents, worktrees, cloud | YES: LSP plugins |
| Cursor | `.cursor/rules/*.mdc`, nested AGENTS.md | YES | PARTIAL: `.cursor-plugin`, team marketplaces | YES (~40-tool cap UNVERIFIED) | YES: `.cursor/hooks.json` exit 2 | PARTIAL: subagents `readonly` only | YES: `.cursor/agents`, background, cloud | PARTIAL |
| Codex CLI / app | AGENTS.md chain, 32 KiB cap | YES: `.agents/skills` | YES: `codex plugin marketplace add` | YES | YES: PreToolUse ("guardrail") | PARTIAL: `.codex/rules` global | YES: `.codex/agents`, worktrees, cloud | NO (MCP bridge) |
| ChatGPT | Project instructions | upload | PARTIAL: enterprise | remote only | NO | NO | PARTIAL: Agent mode → Codex | NO |
| GitHub Copilot | `.github/copilot-instructions.md`, `instructions/*.instructions.md`, AGENTS.md | YES | YES: `copilot plugin install` | YES (cloud: tools only) | YES: `.github/hooks` exit 2 | YES: `.github/agents/*.agent.md` `tools:` | YES: fleet, delegate, cloud | YES: CLI |
| Antigravity CLI | AGENTS.md / GEMINI.md, `.agents/rules` (`trigger:` required) | YES | YES: `agy plugin install <url>` | YES | YES: `.agents/hooks.json` deny | YES: subagent tools; shell policy global | YES: `.agents/agents`, background | UNVERIFIED |
| Devin Desktop | AGENTS.md, `.devin/rules` | YES | YES: `devin plugins install owner/repo` | YES | YES: project hooks (plugin hooks fail open) | PARTIAL | YES: subagents, worktrees, cloud | PARTIAL |
| Cline | `.clinerules/`, AGENTS.md | YES | NO | YES | PARTIAL: no Windows, fails open | NO | PARTIAL | NO |
| Kiro | `.kiro/steering`, AGENTS.md | YES | YES: Powers | YES | YES: `.kiro/hooks` | YES: agent `permissions.rules` | YES: `.kiro/agents` | UNVERIFIED |
| OpenCode | AGENTS.md (CLAUDE.md fallback) | YES | PARTIAL: npm plugins | YES | PARTIAL: TS plugin hooks | YES: `agents.<id>.permissions` | YES: subagents | YES: opt-in |
| Amp | AGENTS.md nested | YES | PARTIAL | YES | UNVERIFIED | PARTIAL | PARTIAL | UNVERIFIED |
| Aider | `--read` / `.aider.conf.yml` | NO | NO | NO | NO | NO | NO | NO |
| Zed | first match only (`.rules` beats AGENTS.md) | UNVERIFIED | NO | YES (UNVERIFIED) | NO (UNVERIFIED) | UNVERIFIED | PARTIAL: ACP | YES: editor |
| JetBrains Junie | `.junie/AGENTS.md` / AGENTS.md | PARTIAL (UNVERIFIED) | UNVERIFIED | YES | PARTIAL (UNVERIFIED) | UNVERIFIED | UNVERIFIED | YES: IDE |

Transcript locations for memory mining:
- Claude Code: `~/.claude/projects/<slug>/*.jsonl`
- Cursor: `~/.cursor/projects/<slug>/agent-transcripts/` (UNVERIFIED)
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (UNVERIFIED)
- Copilot CLI: `~/.copilot/session-state/<id>/events.jsonl`
- ChatGPT, Codex cloud and Amp keep sessions on the server, so they can't be mined.

## Per tool: what the adapter generates, and what degrades

| Tool | `adapt` generates | What degrades, and the fallback |
|---|---|---|
| Claude Code | `CLAUDE.md` (`@AGENTS.md`); plugin install line. `bootstrap init --project-hooks` adds the guard to `.claude/settings.json` | nothing |
| Cursor | `.cursor/rules/bootstrap.mdc` (always on), `.cursor/agents/<role>.md` (docs roles `readonly`), `.agents/skills/` | the only per-agent limit is `readonly`; cloud agents skip user-level hooks → wire `guard.mjs` in project `.cursor/hooks.json`; pre-push enforces |
| Codex | `.agents/skills/`, `.codex/rules/bootstrap.rules` (forbid force-push, `--no-verify`, `reset --hard`) | no LSP (use MCP); one sandbox per launch, so run each role as its own launch/profile; keep AGENTS.md ≤ 32 KiB |
| Copilot | `.github/copilot-instructions.md`, `.github/agents/<role>.agent.md`, `.agents/skills/` | add a `tools:` allowlist per agent and `.github/hooks/*.json` after checking the schema; cloud agent: MCP tools only, `ask` = deny |
| Antigravity | `.agents/rules/bootstrap.md` (`trigger: always_on`), `.agents/agents/<role>.md`, `.agents/skills/` | shell deny is user-global → use hooks + pre-push |
| Devin Desktop | `.agents/skills/`; installs the Claude plugin directly | plugin hooks fail open → wire the guard as a project hook |
| Kiro | `.kiro/steering/bootstrap.md` (always), `.kiro/skills/` | custom agents load no skills by default → add `skill://` resources and `permissions.rules` per role |
| OpenCode | `.agents/skills/` | add `agents.<role>.permissions` and `"lsp": true` to `opencode.json` |
| Cline | `.clinerules/bootstrap.md`, `.cline/skills/` | single agent; hooks don't run on Windows → pre-push only |
| Aider | `.aider.conf.yml` (`read: AGENTS.md`) | no skills/MCP/hooks/agents → run procedures as scripts; pre-push only |
| Zed / Junie / Amp | AGENTS.md (+ `.agents/skills` for Amp) | delete any `.rules` file in Zed; pre-push only |
| ChatGPT | `chatgpt-export/` (Project instructions + skill folder to zip) | no filesystem, shell or hooks → advisor only; real work goes to Codex |

## Fallbacks that work everywhere a shell exists

1. `AGENTS.md` at the root (each tool has its own size cap; keep it short).
2. `.agents/skills/` as the canonical skills location.
3. **`.githooks/pre-push`** (installed by `bootstrap init`): sign-offs, release records, conflict markers.
4. **Server-side branch protection and required checks**: the only layer that binds cloud agents too.
5. One `git worktree` per role, made by a script, not by a tool feature.
6. Board, logs, lessons, sign-offs and releases as plain files. Messages between tools go through the board.
7. MCP servers for missing capabilities (LSP bridge, browser), kept to a few tools each.

## Sources

[agentskills.io](https://agentskills.io/) · [spec](https://agentskills.io/specification.md) · [agents.md](https://agents.md/) · [Agent Plugins](https://aaif.io/blog/from-skills-and-tools-to-portable-agent-plugins) · [Agent Plugins 1.0](https://vercel.com/changelog/introducing-agent-plugins-1-0-0)
· Claude Code: [hooks](https://code.claude.com/docs/en/hooks), [plugins](https://code.claude.com/docs/en/plugins-reference), [memory](https://code.claude.com/docs/en/memory)
· Cursor: [rules](https://cursor.com/docs/context/rules), [skills](https://cursor.com/docs/context/skills), [plugins](https://cursor.com/docs/plugins), [hooks](https://cursor.com/docs/agent/hooks), [subagents](https://cursor.com/docs/agent/subagents), [CLI permissions](https://cursor.com/docs/cli/reference/permissions)
· Codex: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [skills](https://learn.chatgpt.com/docs/build-skills), [hooks](https://learn.chatgpt.com/docs/hooks), [rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md), [plugins](https://developers.openai.com/plugins/build/plugins)
· Copilot: [instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [CLI plugins](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
· Antigravity: [transition](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/), [plugins](https://antigravity.google/docs/plugins?tab=cli), [hooks](https://antigravity.google/docs/hooks?tab=cli), [rules](https://antigravity.google/docs/rules?tab=cli)
· Devin Desktop: [hooks](https://docs.devin.ai/desktop/cascade/hooks), [plugins](https://docs.devin.ai/cli/extensibility/plugins/overview.md)
· Cline: [rules](https://docs.cline.bot/features/cline-rules), [hooks](https://docs.cline.bot/customization/hooks.md)
· Kiro: [steering](https://kiro.dev/docs/steering/), [hooks](https://kiro.dev/docs/hooks/), [agents](https://kiro.dev/docs/custom-agents/configuration-reference/)
· OpenCode: [rules](https://opencode.ai/docs/rules/), [permissions](https://opencode.ai/docs/permissions/), [LSP](https://opencode.ai/docs/lsp/)
· Aider: [conventions](https://aider.chat/docs/usage/conventions.html) · Zed: [rules](https://zed.dev/docs/ai/rules) · Junie: [guidelines](https://junie.jetbrains.com/docs/guidelines-and-memory.html)
