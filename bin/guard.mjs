#!/usr/bin/env node
// Pre-tool guard. Enforces the session family's "Never" columns before a tool runs.
//
// Input: a JSON hook payload on stdin. Claude Code shape is the default:
//   { "tool_name": "Bash", "tool_input": { "command": "..." }, "cwd": "..." }
//   { "tool_name": "Write"|"Edit"|"MultiEdit", "tool_input": { "file_path": "..." }, "cwd": "..." }
// Other tools' payloads are normalised by adapters (see adapters/) before calling decide().
//
// Output: exit 0 = allow. Exit 2 + reason on stderr = block (Claude Code, Codex and
// Copilot-style hooks all treat exit 2 as "deny and tell the agent why").
// Not bootstrapped (no .bootstrap/policy.json) = always allow, silently.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadFlow } from './lib/flow.mjs';
import { currentRole, git, loadPolicy, loadRole, matchesAny, repoRoot, toRepoPath } from './lib/policy.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'write_file', 'replace', 'edit_file']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'shell', 'run_shell_command', 'run_terminal_cmd']);

export function pushTargets(command, cwd) {
  // Returns destination branch names for every `git push` in the command.
  const out = [];
  for (const seg of command.split(/&&|\|\||;|\n/)) {
    const toks = seg.trim().split(/\s+/);
    const gi = toks.indexOf('git');
    if (gi < 0 || toks[gi + 1] !== 'push') continue;
    const args = toks.slice(gi + 2).filter((t) => !t.startsWith('-'));
    const refspecs = args.slice(1); // args[0] is the remote
    if (refspecs.length === 0) {
      const cur = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
      if (cur) out.push(cur);
      continue;
    }
    for (let r of refspecs) {
      r = r.replace(/^\+/, '');
      let dst = r.includes(':') ? r.split(':')[1] : r;
      if (dst === 'HEAD') dst = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || dst;
      out.push(dst.replace(/^refs\/heads\//, ''));
    }
  }
  return out;
}

// Who may write which record. A session signs only as itself; only the Chief of Staff sets a piece's
// lane and records the owner's approval/go; Security may also add required roles (tightening only).
const RECORD_WRITERS = { _piece: ['chief-of-staff'], _approve: ['chief-of-staff'], _go: ['chief-of-staff'], _required: ['chief-of-staff', 'security'] };
const RELEASE_WRITERS = ['chief-of-staff', 'release-ops', 'hotfix'];
const WRITE_OPS = /(>>?|\btee\b|\bcp\b|\bmv\b|\brm\b|sed\s+-i|Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item|\bdel\b|\bln\b|git\s+(checkout|restore)\b)/;

export function recordRule(rel, role, policy) {
  const sd = policy.signoffs.dir.replace(/\/$/, '');
  const m = new RegExp(`^${sd}/([^/]+)/([^/]+)\\.md$`).exec(rel);
  if (m) {
    const name = m[2];
    if (RECORD_WRITERS[name]) return RECORD_WRITERS[name].includes(role) ? null
      : `${rel} is a ${name.slice(1)} record. Only ${RECORD_WRITERS[name].join(' / ')} writes it (you are "${role}").`;
    if (name.startsWith('_')) return `${rel}: unknown record type.`;
    return name === role ? null
      : `${rel} is ${name}'s sign-off. A session signs only as itself (you are "${role}"). Ask ${name} to review and sign.`;
  }
  if (rel.startsWith(`${sd}/`)) return role === 'chief-of-staff' ? null : `${rel}: only the Chief of Staff manages sign-off folders.`;
  if (rel.startsWith(`${policy.releases.dir.replace(/\/$/, '')}/`)) return RELEASE_WRITERS.includes(role) ? null
    : `${rel} is a release record. Only ${RELEASE_WRITERS.join(' / ')} writes it (you are "${role}").`;
  return null;
}

function shellRecordCheck(command, role, policy) {
  if (/\bBOOTSTRAP_ROLE\s*=|\$env:BOOTSTRAP_ROLE/.test(command)) return 'Setting BOOTSTRAP_ROLE in a command is not allowed: a session acts only as its own role (`bootstrap role` sets it once per worktree).';
  if (/\.bootstrap[\\/]session\.json/.test(command) && WRITE_OPS.test(command) && !/bootstrap(\.mjs)?\s+role\b/.test(command)) return 'Changing .bootstrap/session.json by hand is not allowed; the session role is set once with `bootstrap role`.';
  // The toolkit's own record commands
  const cli = /bootstrap(?:\.mjs)?\s+(signoff|require|piece|approve|release)\b(.*)$/m.exec(command);
  if (cli) {
    const [, sub, rest] = cli;
    if (sub === 'signoff') { const as = /--role\s+(\S+)/.exec(rest); if (as && as[1] !== role) return `Signing as "${as[1]}" is not allowed; you are "${role}". A session signs only as itself.`; if (role === 'unassigned') return 'This session has no role; run `bootstrap role <id>` first. Only the owner signs outside a session.'; }
    const who = { require: RECORD_WRITERS._required, piece: RECORD_WRITERS._piece, approve: RECORD_WRITERS._approve, release: RELEASE_WRITERS }[sub];
    if (who && !who.includes(role)) return `\`bootstrap ${sub}\` is for ${who.join(' / ')} only (you are "${role}").`;
  }
  // Raw writes into the record folders
  if (WRITE_OPS.test(command)) {
    const sd = policy.signoffs.dir.replace(/\/$/, ''), rd = policy.releases.dir.replace(/\/$/, '');
    const paths = command.match(new RegExp(`(?:${sd}|${rd})/[^\\s"'>|;&]*`, 'g')) || [];
    for (const p of paths) { const why = recordRule(p.replace(/\\/g, '/'), role, policy) || (!/\.md$/.test(p) && role !== 'chief-of-staff' ? `${p}: only the Chief of Staff manages record folders.` : null); if (why) return why; }
  }
  return null;
}

export function decide({ tool, command = '', filePath = '', cwd = process.cwd() }) {
  const root = repoRoot(cwd);
  if (!root) return { allow: true };
  const policy = loadPolicy(root);
  if (!policy) return { allow: true };
  const role = currentRole(root);
  // The merged flow role (brief + company + project overrides, incl. custom sessions) wins when a flow exists.
  let brief = loadRole(root, role) || {};
  if (existsSync(join(root, '.bootstrap', 'flow.json'))) {
    try { const r = loadFlow(root).flow.roles[role]; if (r) brief = { ...brief, ...r, deny_commands: r.deny_commands || brief.deny_commands }; } catch { /* keep the brief */ }
  }

  if (SHELL_TOOLS.has(tool)) {
    for (const pat of [...policy.deny_all, ...(policy.destructive_commands || []), ...(brief.deny_commands || [])]) {
      if (new RegExp(pat).test(command)) {
        return { allow: false, reason: `Blocked for role "${role}": command matches a rule in .bootstrap/policy.json or roles/${role}.md (${pat}). If the owner wants this, they run it themselves, or the Chief of Staff records their word first.` };
      }
    }
    const rec = shellRecordCheck(command, role, policy);
    if (rec) return { allow: false, reason: `Blocked: ${rec}` };
    if (/\bgit\s+push\b/.test(command)) {
      for (const dst of pushTargets(command, cwd)) {
        if (dst === policy.branches.live && !policy.releases.live_pushers.includes(role)) {
          return { allow: false, reason: `Blocked: only ${policy.releases.live_pushers.join(' / ')} may push "${dst}" (you are "${role}"). Live moves only on the owner's word (AGENTS.md, section 7E).` };
        }
      }
    }
    return { allow: true };
  }

  if (WRITE_TOOLS.has(tool) && filePath) {
    const rel = toRepoPath(root, filePath, cwd);
    if (rel.startsWith('..')) return { allow: true }; // outside the project: not ours to police
    const rec = recordRule(rel, role, policy);
    if (rec) return { allow: false, reason: `Blocked: ${rec}` };
    if (matchesAny(rel, policy.protected_globs) && role !== 'chief-of-staff') {
      return { allow: false, reason: `Blocked: ${rel} is protected toolkit config. Only the Chief of Staff changes it, on the owner's typed word.` };
    }
    const scope = brief.write_globs;
    if (Array.isArray(scope) && scope.length && !matchesAny(rel, scope)) {
      return { allow: false, reason: `Blocked: role "${role}" writes only ${scope.join(', ')}; ${rel} is outside that. File a board row for the role that owns it.` };
    }
  }
  return { allow: true };
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {
    process.stderr.write('guard: malformed hook payload; blocking to be safe.\n');
    process.exit(2);
  }
  const input = payload.tool_input || payload.toolInput || {};
  const res = decide({
    tool: payload.tool_name || payload.toolName || '',
    command: input.command || '',
    filePath: input.file_path || input.path || input.notebook_path || '',
    cwd: payload.cwd || process.cwd(),
  });
  if (res.allow) process.exit(0);
  process.stderr.write(res.reason + '\n');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
