#!/usr/bin/env node
// Git pre-push check. Works with every AI tool and with humans, because git runs it.
// Installed by `bootstrap init` as .githooks/pre-push (core.hooksPath = .githooks).
//
// stdin (from git): "<local ref> <local sha> <remote ref> <remote sha>" per line.
// Rules (AGENTS.md O10, O11, 7E, 7F):
//   * any branch: no conflict markers in added lines
//   * dev and live: every commit touching non-docs files must be covered by a complete sign-off
//     (docs/signoffs/<piece>/<role>.md, verdict PASS, same sha for every required role);
//     the covered commit, or any descendant reached only through docs-only commits, may be pushed
//   * live: only live_pushers roles, and a release record in docs/releases/ naming the pushed sha,
//     the owner's words, the question asked, and a pasted pre-release check
//   * hotfix role is exempt from sign-offs (not from the release record)
//   * deleting live or dev is refused
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFrontmatter } from './lib/fm.mjs';
import { currentRole, git, loadPolicy, matchesAny, repoRoot } from './lib/policy.mjs';
import { laneOf, loadFlow, requiredFor, wordRecordProblems, wordsFor } from './lib/flow.mjs';
import { hasEvidence } from './lib/ops.mjs';

const ZERO = /^0+$/;

function lsTree(root, sha, dir) {
  const out = git(['ls-tree', '-r', '--name-only', sha, '--', dir], root);
  return out ? out.split('\n').filter(Boolean) : [];
}
function show(root, sha, path) {
  return git(['show', `${sha}:${path}`], root) || '';
}
function sameSha(a, b) {
  if (!a || !b) return false;
  const n = Math.min(a.length, b.length);
  return n >= 7 && a.slice(0, n) === b.slice(0, n);
}

export function piecesAt(root, sha, policy) {
  // [{piece, lane, extra, required (legacy _required roles or null), signed: {role: sha}}]
  const byPiece = new Map();
  for (const f of lsTree(root, sha, policy.signoffs.dir)) {
    const m = new RegExp(`^${policy.signoffs.dir}/([^/]+)/([^/]+)\\.md$`).exec(f);
    if (m) (byPiece.get(m[1]) || byPiece.set(m[1], []).get(m[1])).push([m[2], f]);
  }
  const out = [];
  for (const [piece, files] of byPiece) {
    const p = { piece, lane: null, extra: [], required: null, signed: {}, words: {} };
    for (const [name, f] of files) {
      const { data, body } = parseFrontmatter(show(root, sha, f));
      if (!data) continue;
      if (name === '_required') { if (Array.isArray(data.roles)) { p.required = data.roles; p.extra = data.roles; } continue; }
      if (name === '_piece') { p.lane = data.lane || null; continue; }
      if (name === '_approve' || name === '_go') { p.words[name.slice(1)] = data; continue; }
      if (name.startsWith('_')) continue;
      // A PASS counts only with evidence in the body (a command and its output, or file:line).
      if (String(data.verdict || '').toUpperCase() === 'PASS' && data.sha) {
        if (hasEvidence(body, policy)) p.signed[data.role || name] = data.sha; else (p.weak ||= []).push(data.role || name);
      }
    }
    out.push(p);
  }
  return out;
}

export function completeSignoffs(root, sha, policy, { flow = null, codeCommits = [], role = '', notes = [] } = {}) {
  // Returns [{piece, sha}] for every piece whose required roles all signed PASS on one sha.
  // Without a flow: the required roles are _required.md or the policy default (legacy).
  // With a flow: the piece must have a lane set by the Chief of Staff (_piece.md); then lane gate +
  //   conditions matched by the files the piece changed + _required.md (add-only) + company floor, and
  //   the owner's words the lane/conditions need (_approve.md, _go.md). Only Hotfix may use an exempt lane.
  //   `notes` collects why each piece did not count, for the error message.
  const done = [];
  for (const p of piecesAt(root, sha, policy)) {
    if (!flow) {
      const required = p.required || policy.signoffs.default_required;
      const shas = required.map((r) => p.signed[r]);
      if (shas.every(Boolean) && shas.every((s) => sameSha(s, shas[0]))) done.push({ piece: p.piece, sha: shas[0] });
      continue;
    }
    if (!p.lane) { notes.push(`${p.piece}: no lane set (the Chief of Staff runs \`bootstrap piece ${p.piece} --lane <lane>\`)`); continue; }
    let lane = flow.lanes.find((l) => l.id === p.lane);
    if (!lane) { notes.push(`${p.piece}: lane "${p.lane}" is not in the flow`); continue; }
    if (lane.live_exempt_signoffs && role !== 'hotfix') lane = laneOf(flow, 'normal');
    let why = '';
    for (const S of [...new Set(Object.values(p.signed))]) {
      const covered = codeCommits.filter((c) => git(['merge-base', '--is-ancestor', c, S], root) !== null);
      const files = covered.flatMap((c) => (git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--root', c], root) || '').split('\n').filter(Boolean));
      const required = requiredFor(flow, lane.id, files, p.extra);
      const missing = required.filter((r) => !sameSha(p.signed[r], S)).map((r) => ((p.weak || []).includes(r) ? `${r} (PASS without evidence)` : r));
      const wordIssues = wordsFor(flow, lane.id, files).flatMap((w) => wordRecordProblems(p.words[w], w, flow).map((x) => `${w}: ${x}`));
      if (!missing.length && !wordIssues.length) { done.push({ piece: p.piece, sha: S, required }); why = ''; break; }
      why = `${p.piece} @ ${S.slice(0, 9)}: ${[missing.length ? `missing sign-off from ${missing.join(', ')}` : '', wordIssues.length ? `owner's word ${wordIssues.join('; ')}` : ''].filter(Boolean).join('; ')}`;
    }
    if (why) notes.push(why);
  }
  return done;
}

export function flowFor(root, baseSha, localSha) {
  // The flow that judges a push is the one ALREADY accepted (the remote side), so a commit that
  // loosens the flow cannot use its own looser flow to get through. New branch: the pushed tree.
  const ref = baseSha && git(['cat-file', '-e', `${baseSha}:.bootstrap/flow.json`], root) !== null ? baseSha
    : git(['cat-file', '-e', `${localSha}:.bootstrap/flow.json`], root) !== null ? localSha : null;
  return ref ? loadFlow(root, { ref }).flow : null;
}

export function releaseRecordFor(root, treeSha, policy, wanted = treeSha) {
  for (const f of lsTree(root, treeSha, policy.releases.dir)) {
    if (!f.endsWith('.md')) continue;
    const { data, body } = parseFrontmatter(show(root, treeSha, f));
    if (!data) continue;
    const shas = Array.isArray(data.shas) ? data.shas : [];
    if (!shas.some((s) => sameSha(s, wanted))) continue;
    const problems = [];
    if (!data.owner_words) problems.push('owner_words');
    if (!data.question) problems.push('question');
    if (!data.said_at) problems.push('said_at');
    const check = /##\s*Pre-release check\s*\n([\s\S]*?)(\n##\s|$)/i.exec(body);
    if (!check || !check[1].trim()) problems.push('pasted "## Pre-release check" section');
    return { file: f, problems };
  }
  return null;
}

export function checkPush({ root, policy, role, localSha, remoteRef, remoteSha }) {
  const errors = [];
  const branch = remoteRef.replace(/^refs\/heads\//, '');
  const guarded = branch === policy.branches.live || branch === policy.branches.dev;

  if (ZERO.test(localSha)) {
    if (guarded) errors.push(`refusing to delete "${branch}"`);
    return errors;
  }

  let range;
  if (!ZERO.test(remoteSha) && git(['cat-file', '-e', remoteSha], root) !== null) range = [`${remoteSha}..${localSha}`];
  else range = [localSha, '--not', '--remotes'];
  const commits = (git(['rev-list', ...range], root) || '').split('\n').filter(Boolean);
  if (!commits.length) return errors;

  // O11: conflict markers in added lines.
  const base = ZERO.test(remoteSha) ? null : remoteSha;
  const diff = base ? git(['diff', `${base}..${localSha}`], root, { maxBuffer: 64 << 20 }) : null;
  if (diff && /^\+(<{7}|>{7})( |$)/m.test(diff)) errors.push('conflict markers in the pushed changes (O11)');

  if (!guarded) return errors;

  const codeCommits = commits.filter((c) => {
    const files = (git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--root', c], root) || '')
      .split('\n').filter(Boolean);
    return files.some((f) => !matchesAny(f, policy.docs_globs));
  });

  if (branch === policy.branches.live) {
    if (!policy.releases.live_pushers.includes(role)) errors.push(`role "${role}" may not push "${branch}"`);
    if (codeCommits.length) {
      // The record is committed after the code it releases, so it names the newest CODE commit;
      // docs-only commits on top of it (the record itself, logs) ride along.
      const newest = codeCommits[0];
      const rec = releaseRecordFor(root, localSha, policy, newest);
      if (!rec) errors.push(`no release record in ${policy.releases.dir}/ lists ${newest.slice(0, 12)}, the newest code commit (7E)`);
      else if (rec.problems.length) errors.push(`${rec.file} is missing: ${rec.problems.join(', ')}`);
    }
  }

  const exempt = branch === policy.branches.live && policy.releases.exempt_from_signoffs.includes(role);
  if (codeCommits.length && !exempt) {
    const flow = flowFor(root, ZERO.test(remoteSha) ? null : remoteSha, localSha);
    const notes = [];
    const signed = completeSignoffs(root, localSha, policy, { flow, codeCommits, role, notes });
    const unsigned = codeCommits.filter((c) =>
      !signed.some((s) => git(['merge-base', '--is-ancestor', c, s.sha], root) !== null));
    if (unsigned.length) {
      const need = flow ? "a piece with a lane set by the Chief of Staff, its lane's sign-offs plus any its files' conditions add, and any owner's word they need"
        : `${policy.signoffs.default_required.join(', ')} or the piece's _required.md`;
      errors.push(`${unsigned.length} code commit(s) have no complete sign-off: ${unsigned.map((c) => c.slice(0, 9)).join(', ')} ` +
        `(need ${need}, all on one sha — O10, 7F)${notes.length ? `. Pieces: ${notes.join(' | ')}` : '. No piece covers them yet'}`);
    }
  }
  return errors;
}

function main() {
  const root = repoRoot(process.cwd());
  const policy = root && loadPolicy(root);
  if (!policy) process.exit(0);
  const role = currentRole(root);
  const lines = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  let failed = false;
  for (const line of lines) {
    const [, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    for (const e of checkPush({ root, policy, role, localSha, remoteRef, remoteSha })) {
      process.stderr.write(`pre-push: ${remoteRef}: ${e}\n`);
      failed = true;
    }
  }
  if (failed) process.stderr.write('pre-push: push refused. Fix the above; never bypass with --no-verify.\n');
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
