# Bootstrap-environment

**Run a software project with a team of AI assistants, and stay in control.**

You talk to one assistant, the **Chief of Staff**. It runs a small team of AI sessions, each with one job:
Design, Builder, QA, Tech Lead, Security, Release Ops and more. Every change is checked by the right team
members, nothing visual or risky lands without **your approval**, and nothing goes live without **your word**.
These rules are enforced by the tools, not left to the assistants' good behaviour.

![The flow canvas: drag sessions onto the flow, link steps, and see who must approve at each checkpoint](docs/images/canvas.png)

> **Status: 0.5.0, early.** 63 tests pass against real git repositories. Claude Code is fully supported;
> adapters for 13 other AI tools follow their November 2026 docs and still need testing inside each tool
> (see [TODO.md](TODO.md)).

---

## Contents

[Why this exists](#why-this-exists) · [Who it is for](#who-it-is-for) · [Use cases](#use-cases) ·
[Advantages](#advantages) · [How it works](#how-it-works) · [Screenshots](#screenshots) ·
[Quick start](#quick-start) · [Who checks what](#who-checks-what) · [The team](#the-team) ·
[Light on tokens](#light-on-tokens) · [Commands](#commands) · [Other AI tools](#other-ai-tools) ·
[FAQ](#faq) · [Limits](#honest-limits)

---

## Why this exists

A single AI assistant is fast, but it fails in predictable ways. Adding more assistants makes it worse unless
someone is in charge. This plugin turns each known failure into a rule the tools enforce:

| What goes wrong with AI assistants | What this plugin does |
|---|---|
| It says "done" or "fixed" when it isn't | A sign-off only counts with **evidence** (a command and its output, or file:line) |
| It skips steps when in a hurry: no tests, no design check | Code is **refused** until every required check is signed on that exact version |
| A vague "yes" gets stretched into permission to go live | Your word is recorded **with the exact question you answered**; nothing goes live without it |
| It reviews its own work | **Separation of duties**: a session can sign only as itself, and the builder never approves its own code |
| It forgets what was learned last week | **Memory in the repo**: one file per lesson, searchable with `mem find` |
| It works on the wrong branch, database or files | Each session has its **own worktree and limits**; a guard blocks what its role must never do |
| Several assistants talk past each other | **One coordinator**, one board, short messages that point to files |
| It costs a fortune in tokens | Each session reads **only its own rules** (~2k tokens instead of ~7k) and asks the tools instead of reading files |

## Who it is for

| Good fit | Probably not needed |
|---|---|
| A **founder or business owner** running a live product with real users, money or staff data, who wants AI to do most of the work | A weekend prototype: use `--size prototype` (Solo preset) or skip it |
| A **small team** adopting AI agents that wants reviews, approvals and an audit trail without hiring a process manager | A large team that already has code review, CI and release management (take the memory and role briefs only) |
| An **agency** running several client projects that needs the same rules everywhere (company defaults) | Someone who wants the AI to work completely unsupervised |
| A **non-programmer** who needs plain-language control over what ships | |

## Use cases

**1. A solo founder with a live app.** You ask the Chief of Staff for "an invoice footer with our bank
details". It routes the piece to the *Normal* lane. Research and Design prepare an artifact, and you approve it
in one message. QA writes the checks, the Builder builds it, Tech Lead and QA sign off with evidence, and you
type `release invoice-footer`. You never read code, but every step is on record.

**2. A risky change.** "Rate-limit password resets" touches login code, so `bootstrap piece R15 --suggest`
proposes the *HIGH* lane. Security must sign too, a threat note is written, and nothing is built until you
say **go**. If someone forgets, the push is refused with the reason: `owner's word go: no _go.md record`.

**3. Something is broken in production.** The *Hotfix* lane skips the long route: reproduce, fix, a short QA
check, then your word `apply`. It's still recorded, still evidenced, just faster.

**4. An agency with ten client projects.** You write company defaults once: "Tech Lead signs every code push",
"Security signs HIGH work", "never install `random-dev/unsafe-hooks`". Every project inherits them. A project
can add checks but can't remove a 🔒 locked one, and the editor shows an error if it tries.

**5. A prototype.** `bootstrap init --size prototype` starts with the *Solo* preset: one agent plays the roles
in turn, and the push checks still keep a minimum of discipline.

## Advantages

- **Control without micromanaging.** You decide only what matters: approve designs, say "go" on risky work, release. Everything else runs on its own.
- **Proof, not promises.** Every approval carries evidence and the exact commit it covers, so "done" means done.
- **Enforced, not hoped for.** A git pre-push check that runs in every tool refuses work that skipped a step, and explains what's missing.
- **Your process, your way.** A drag-and-drop canvas: drop sessions onto the flow, link steps, run steps side by side, drag reviewers onto a checkpoint. A three-question wizard picks a starting flow, and undo/redo makes it safe to try things.
- **See before you commit.** "Try a change" shows the path a change would take, who must approve it, and whether a push would get through. It uses the same logic as the real pre-push check.
- **Same rules everywhere.** Company defaults with locked minimums, approved sources and blocked sources.
- **Remembers.** Lessons, decisions and hand-overs live in the repository, not in a chat that disappears.
- **Light on tokens.** Each session reads only its own rules and asks short commands instead of reading big files.
- **Works beyond Claude.** One source generates files for Cursor, Codex, Copilot, Antigravity, Devin, Kiro, OpenCode, Cline and more.
- **Free and open.** MIT licence, no dependencies, no paid services. Free plugins only, by design.

---

## How it works

### The big picture

```mermaid
flowchart LR
  OWNER(["👤 You (owner)"]) <-->|"asks, approvals,<br/>release word"| COS["Chief of Staff"]
  COS -->|"brief + task"| TEAM
  subgraph TEAM["Your AI team (permanent sessions)"]
    direction TB
    RES["Researcher"] --- DES["Design"] --- BLD["Builder"]
    QA["QA"] --- TL["Tech Lead"] --- SEC["Security"]
    LIB["Librarian"] --- REL["Release Ops"] --- HOT["Hotfix (cloud)"]
  end
  TEAM -->|"work + sign-offs<br/>with evidence"| REPO[("Repository:<br/>board, sign-offs,<br/>approvals, memory")]
  COS -->|"routes pieces,<br/>records your words"| REPO
  REPO --> CHECK{"Push check:<br/>everything signed?"}
  CHECK -->|"no: refused + reason"| TEAM
  CHECK -->|"yes"| DEV["Dev branch"]
  DEV -->|"your 'release'"| LIVE(["🌐 Live"])
```

### Setting up a project (once)

```mermaid
flowchart TD
  A["Ask Claude: bootstrap this project"] --> B["Probe: runtimes, stack, branches,<br/>work in flight, secrets (read-only)"]
  B --> C["You answer the boundary questions:<br/>live branch, real databases, size"]
  C --> D["Install dependencies exactly<br/>as the lockfiles say"]
  D --> E["Find the best free plugins:<br/>your preferred sources first,<br/>then marketplaces and GitHub"]
  E --> F["Smoke-test every plugin and hook;<br/>keep only what works"]
  F --> G["Scaffold: AGENTS.md, board,<br/>memory, flow, pre-push check"]
  G --> H["Shape the flow in the editor<br/>(or keep the preset)"]
  H --> I["Start the team: each session gets<br/>its own brief, worktree and limits"]
  I --> J["Prove it: break a rule on purpose<br/>and watch it get refused"]
  J --> K(["Report: what works, what is blocked, what's next"])
```

### The life of one piece of work

```mermaid
sequenceDiagram
  autonumber
  actor You
  participant CoS as Chief of Staff
  participant Lib as Librarian
  participant Res as Researcher
  participant Des as Design
  participant QA
  participant Bld as Builder
  participant Rev as Tech Lead + Security
  participant RO as Release Ops
  You->>CoS: "Add a footer to invoice PDFs"
  CoS->>CoS: bootstrap piece R14 --suggest → lane Normal
  CoS->>Lib: board row
  Lib-->>CoS: lessons and decisions that apply
  CoS->>Res: facts (file:line, volumes)
  Res-->>Des: research note
  Des-->>CoS: artifact: today vs proposed
  CoS->>You: one question: approve this design?
  You-->>CoS: "approve"
  CoS->>CoS: bootstrap approve R14 (your words + question + link)
  CoS->>QA: write acceptance checks first
  CoS->>Bld: build on own branch
  Bld-->>QA: sha a1b2c3d
  QA-->>CoS: sign-off PASS @ a1b2c3d + evidence
  Rev-->>CoS: sign-offs PASS @ a1b2c3d + evidence
  Note over Bld,RO: The push check refuses dev until every required sign-off and your approval are on record
  RO->>You: "release invoice-footer?" + pre-release check
  You-->>RO: release invoice-footer
  RO->>RO: release record → push live
  CoS-->>You: verified live, row closed
```

### Will my push be accepted?

This is exactly what the pre-push check decides, in every tool and for every person:

```mermaid
flowchart TD
  P["git push"] --> T{"Which branch?"}
  T -->|"feature branch"| CM{"Conflict markers?"}
  CM -->|"yes"| R1["❌ refused"]
  CM -->|"no"| OK1["✅ accepted"]
  T -->|"dev or live"| DOCS{"Only docs<br/>changed?"}
  DOCS -->|"yes"| OK2["✅ accepted"]
  DOCS -->|"no, code"| ROUTE{"Piece routed<br/>to a lane?"}
  ROUTE -->|"no"| R2["❌ refused:<br/>no lane set"]
  ROUTE -->|"yes"| SIGN{"Every required role<br/>signed this sha<br/>with evidence?"}
  SIGN -->|"no"| R3["❌ refused:<br/>missing sign-off from …"]
  SIGN -->|"yes"| WORD{"Your approve / go<br/>needed and on record?"}
  WORD -->|"missing"| R4["❌ refused:<br/>owner's word …"]
  WORD -->|"ok"| LIVE{"Pushing live?"}
  LIVE -->|"no"| OK3["✅ accepted to dev"]
  LIVE -->|"yes"| REC{"Release Ops or Hotfix,<br/>with a release record<br/>(your words, shas, check)?"}
  REC -->|"no"| R5["❌ refused"]
  REC -->|"yes"| OK4["✅ live"]
```

### The four lanes (you can add your own)

```mermaid
flowchart LR
  subgraph N["Normal"]
    direction LR
    n1["Research"] --> n2["Design"] --> n3(["Your approve"]) --> n4["Tests first"] --> n5["Build"] --> n6{{"Dev gate:<br/>QA · Tech Lead ·<br/>Librarian · CoS"}} --> n7(["Your release"]) --> n8{{"Live"}}
  end
  subgraph H["HIGH (schema, money, auth)"]
    direction LR
    h1["Research"] --> h2["Threat note"] --> h3(["Your go"]) --> h4["Build"] --> h5["Independent review"] --> h6{{"Dev gate:<br/>+ Security"}} --> h7(["Your release"]) --> h8{{"Live"}}
  end
  subgraph F["Hotfix (live is broken)"]
    direction LR
    f1["Reproduce + fix"] --> f2["Short QA check"] --> f3(["Your apply"]) --> f4{{"Live"}}
  end
```

The *No screen* lane is Normal without the design steps. File conditions add checks in **every** lane:
login, payment or upload files add **Security**; screen files add **Design** and **your approval**;
migrations add **Tech Lead**.

### Four layers of protection

```mermaid
flowchart TB
  A["A session wants to run a command or write a file"] --> G{"1 · Guard (before every tool call)"}
  G -->|"its role may not"| X1["Blocked, with the reason"]
  G -->|"ok"| PERM{"2 · Per-session permissions"}
  PERM -->|"denied"| X2["Blocked"]
  PERM -->|"ok"| RUN["Runs"]
  RUN -->|"git push"| PP{"3 · Pre-push check (every tool, every person)"}
  PP -->|"missing sign-off, word,<br/>record or lane"| X3["Push refused + what's missing"]
  PP -->|"ok"| SRV{"4 · Server branch protection (planned)"}
  SRV --> DONE["Branch updated"]
```

---

## Screenshots

The visual editor (`bootstrap flow --open`) runs locally in your browser. Everything you can drag can also
be done with buttons or the keyboard, and every term has a plain-language explanation one click away.

### The canvas: draw your flow by dragging

![Flow canvas](docs/images/canvas.png)

- **Drag a session** from the left onto a **line** to add a step there, or onto a **step** to run both **side by side** (shaded group).
- **Drag a step's ● dot** onto another step to **link** them, so the second step comes right after the first.
- **Checkpoints show faces.** Drag a session onto a checkpoint to require its sign-off; drag a face off to remove it. 🔒 faces are company minimums and refuse to move.
- **Click a step** to edit it on the right. Drag it to the 🗑 to remove it. **Undo/Redo** with Ctrl+Z / Ctrl+Y. **Fit** zooms the whole lane into view.
- **Keyboard:** Tab to a step, ← → to move it, Delete to remove it, Enter to edit it.

### Try a change before it happens

![Try a change: the HIGH lane lit up, with Design added by the screen change](docs/images/simulate.png)

Tick what a change touches, for example login files and a screen, and press **Show me**. The editor
switches to the lane that change would take, lights up its path step by step, and adds the extra reviewers
as dashed faces. It then lists every approval and every word of yours that's needed. If any is missing when
a session pushes, the push is refused. The answer comes from the same code the pre-push check runs.

### Start in three questions

<p align="center"><img src="docs/images/wizard.png" width="640" alt="First-run wizard"></p>

First time? Three plain questions (what you're building, whether risky work should wait for your "go",
whether your company has shared rules) pick a starting flow. **Start over** reopens them at any time.

### The other tabs

| | |
|---|---|
| **Team:** each session's job, limits, tools, and the GitHub links you prefer for it. Every link is checked as you type (official, trust check, blocked, invalid). ![Team tab](docs/images/team.png) | **Rules:** the full grid of who approves in each lane, extra checks for sensitive files, which of your words may be relayed, and presets. ![Rules tab](docs/images/rules.png) |
| **Status:** problems in the flow (*Must fix* items block saving) and every piece of work with the approvals still missing. ![Status tab](docs/images/status.png) | **Company:** rules inherited by every project, with locked minimums and blocked sources. ![Company tab](docs/images/company.png) |
| **Help:** every underlined word opens a plain explanation. ![Help panel](docs/images/help.png) | <p align="center"><img src="docs/images/mobile.png" width="260" alt="The editor on a phone"><br><em>Works on a phone too: the palette becomes a strip, and the canvas scrolls on its own.</em></p> |

### What a session sees in the terminal

```text
$ bootstrap next R14
R14 · Invoice PDF footer
  lane: normal · files changed: 2
  ✓ Design @ a1b2c3d4e
  ✓ QA @ a1b2c3d4e
  ✗ Tech Lead: not signed
  ✗ Librarian: not signed
  ✗ Chief of Staff: not signed
  ✗ owner's "approve": no _approve.md record
  NEXT: Chief of Staff asks the owner for "approve" and records it (`bootstrap approve R14 --word approve …`)

$ bootstrap piece R15 --suggest
R15: suggested lane "high" (touches auth, payments, uploads or secrets)
  sign-offs: Chief of Staff, Librarian, QA, Security, Tech Lead
  owner's words: go
```

---

## Quick start

**Claude Code** (full support):

```bash
claude plugin marketplace add AnfalHaider/Bootstrap-environment
```

```bash
claude plugin install bootstrap-environment@bootstrap-environment --scope project
```

Then say: *"bootstrap this project"*. The skill asks a few questions (the project's size, which branch is
live, which databases are real) and does the rest.

**Any tool with a shell:**

```bash
git clone https://github.com/AnfalHaider/Bootstrap-environment ~/bootstrap-environment
```

```bash
node ~/bootstrap-environment/bin/bootstrap.mjs init --size live --live main --dev dev
```

```bash
node .bootstrap/bin/bootstrap.mjs flow --open
```

```bash
node .bootstrap/bin/adapt.mjs cursor
```

`--size` is `prototype`, `small` or `live`. Replace `cursor` with your tool; `adapt.mjs list` shows them all.

## Who checks what

| When… | Who must approve, on that exact version | Enforced by |
|---|---|---|
| Any code joins the dev branch | the lane's sessions (Normal: QA, Tech Lead, Librarian, Chief of Staff) | pre-push check |
| The code touches login, payments, uploads or secrets | + Security | pre-push check |
| The code changes a screen | + Design, **and your recorded approval of the design** | pre-push check |
| The work is HIGH risk (schema, money, permissions…) | + Security, **and your recorded "go"** | pre-push check |
| Any sign-off | must carry **evidence**; a bare PASS is ignored | pre-push check |
| Code isn't routed to a lane yet | refused: the Chief of Staff routes every piece | pre-push check |
| Anything goes live | Release Ops or Hotfix, **your "release"/"apply"** with the question answered, shas and a pasted check | pre-push check |

**Who may write each record:**
- A session can sign **only as itself**.
- Only the Chief of Staff can route a piece or record your approval or "go".
- Only Release Ops, Hotfix or the Chief of Staff can write a release record.

**Not checked by the tools:** conversations, plans and research (nothing is pushed), commands run outside git, and docs-only commits (deliberately free).

## The team

| Session | Job | Never |
|---|---|---|
| **Chief of Staff** | your single contact: routes work, records your words, checks scope, sends a daily digest | pushes live, decides for you |
| **Librarian** | lessons, decisions, board and register hygiene | writes code |
| **Researcher** | facts with file:line, real volumes, options | writes app code, touches real data |
| **Design** | today-vs-proposed artifacts; signs built screens | writes code |
| **Builder** | builds on its own branch with proof | pushes before sign-offs, reviews itself |
| **QA** | acceptance checks before code; tests on a copy | fixes app code |
| **Tech Lead** | architecture decisions, code and schema review, upgrades | reviews its own code |
| **Security** | sensitive changes, dependency audits, plugin safety checks | signs its own fixes |
| **Release Ops** | dry run, release batches, pushes live on your word | hotfixes |
| **Hotfix** | live breakage only, in the cloud, on your "apply" | features |
| **Platform** *(on demand)* | CI, environments, backups, monitoring | runs server commands itself |
| **Support** *(on demand)* | user reports to rows, release notes | promises users dates |
| **Project lanes** | one area each (e.g. onboarding, billing) | another lane's files |

Each session is permanent and nested under the Chief of Staff wherever the tool supports it. Its first
message is its role file plus `bootstrap brief <role>`: only its own rules, in full with their reasons.
Rename sessions, add your own, or fold roles together in the editor. On the canvas, drag a session onto the flow to give it a step, or onto a checkpoint to make it a reviewer.

## Light on tokens

The sessions are permanent, so what each one reads is paid again and again. The figures below were measured on a fresh project:

| | Before (0.3) | Now (0.4) |
|---|---|---|
| Loaded in every session | ~1,350 tokens | ~1,050 tokens |
| A session's start (its rules + its part in the flow) | ~5,800 tokens | ~700–1,300 tokens |
| **Total to start one session** | **~7,000** | **~2,000 (about 70% less)** |
| Guard check per command | ~220 ms | ~115 ms |

How it stays light:
- **One brief per role**, built from `flow/rules.json`, where every rule lives once.
- **Ask the tools, not the files:** `next`, `board --mine`, `mem find`.
- **Short messages that point to files**, never pasted content.
- **`board archive`** keeps the board small.
- **`cost`** warns when something grows too big.

## Commands

| Command | What it does | Who |
|---|---|---|
| `bootstrap init --size … --live … --dev …` | set up a project (never overwrites) | owner / Claude |
| `bootstrap flow --open` | visual editor: drag-and-drop canvas, change simulator, team, rules, status, company | owner |
| `bootstrap brief <role>` | that role's rules and its part in the flow | Chief of Staff, at session start |
| `bootstrap role <role>` | mark a worktree's session and apply its limits | each session, once |
| `bootstrap piece <id> --suggest` / `--lane <lane>` | suggest / set a piece's lane | Chief of Staff |
| `bootstrap approve <id> --word approve\|go …` | record your approval or go, with your exact words | Chief of Staff |
| `bootstrap signoff <id> --verdict PASS --note "<evidence>"` | sign as yourself, with evidence | reviewers |
| `bootstrap next <id>` | what's missing and who acts next | anyone |
| `bootstrap board --mine` / `board archive` | your rows only / move old done rows out | anyone / Librarian |
| `bootstrap release <scope> …` | release record before going live | Release Ops, Hotfix, Chief of Staff |
| `bootstrap cost` · `flow check` · `status` | token cost per session · flow problems · current state | anyone |
| `bootstrap company init <dir>` / `flow --company <dir>` | create / edit company defaults | owner |
| `mem find <topic>` · `mem check` | lessons that match · stale-memory check | anyone |
| `detect-stack` · `adapt <tool>` | stack profile and install commands · files for another AI tool | Claude / owner |

## Other AI tools

| Tool | Skill | Team | Guard | Pre-push | Notes |
|---|---|---|---|---|---|
| Claude Code | ✅ | permanent nested sessions | ✅ | ✅ | full support |
| Cursor | ✅ | `.cursor/agents` | manual | ✅ | subagents only have `readonly` |
| Codex | ✅ | separate launches | `.codex/rules` | ✅ | no LSP; AGENTS.md ≤ 32 KiB |
| GitHub Copilot | ✅ | `.github/agents` | manual | ✅ | cloud agent: MCP tools only |
| Antigravity CLI | ✅ | `.agents/agents` | manual | ✅ | replaces Gemini CLI for free users |
| Devin Desktop | ✅ | — | project hook | ✅ | formerly Windsurf |
| Kiro · OpenCode | ✅ | agents | manual | ✅ | per-agent permissions |
| Cline · Aider · Zed · Junie · Amp | partial | one agent plays the roles | — | ✅ | AGENTS.md + git hooks |
| ChatGPT | upload | advisor only | — | — | no filesystem; real work goes to Codex |

The pre-push check works everywhere, because git runs it. Details and sources: [docs/compatibility.md](docs/compatibility.md).

## FAQ

**Do I need to know how to code?** No. You answer questions in plain words, approve designs, and type
`release`. The editor explains every term, and the Chief of Staff asks one question at a time.

**Is it slow or heavy?** A session start costs about 2,000 tokens, and the guard adds about 0.1 seconds per
command. For small projects, `--size prototype` or `small` uses a lighter flow.

**Can I relax the rules?** Yes. Drag a reviewer's face off a checkpoint, switch presets, or add your own lanes. The
Check tab warns you when a change leaves code unreviewed. Only company 🔒 minimums can't be loosened.

**What if a session ignores the rules?** Then its push is refused, with the reason. The rules that matter are
checked by tools, not trusted to the assistant.

**Does it cost money?** No. MIT licence, no dependencies, and it installs only free plugins.

**What about my data?** Everything stays in your repository and on your machine. The editor runs on
127.0.0.1 with a one-time token. Nothing is sent anywhere.

## Honest limits

- All sessions on one machine share one git identity. Someone working **outside** the AI tools could still edit sign-off files by hand. A separate identity per role, plus server-side checks, is the next step ([TODO](TODO.md)).
- Layers 1–3 run on your computer; only server-side branch protection also binds cloud agents. Turn it on for your live and dev branches.
- Adapters for other tools follow vendor docs and still need testing inside each tool.

## Repository layout

```text
skills/bootstrap-environment/   the skill (Agent Skills format) + references opened per phase
bin/                            bootstrap, guard, prepush, mem, detect-stack, adapt, flow-ui (Node ≥18, no deps)
flow/defaults.json · rules.json built-in lanes, gates, conditions, words · every rule with its reason
ui/flow-editor.html             the visual editor
roles/                          one brief per session
templates/                      AGENTS.md, board, register, memory, lesson
githooks/pre-push · hooks/      the push check · the Claude Code guard hook
docs/                           compatibility matrix, playbook, screenshots
tests/                          npm test (63 tests)
```

## Contributing

Issues and pull requests are welcome, especially adapter fixes from people who use those tools daily.
Run `npm test` first; new enforcement needs a test for every branch.

## Licence

[MIT](LICENSE)
