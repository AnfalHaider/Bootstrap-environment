// Run: node --test tests/trust.test.mjs
// Sessions sign only as themselves; only the Chief of Staff routes work and records the owner's words;
// code needs a routed piece; screen changes need the owner's recorded approval, HIGH work a recorded "go".
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { decide } from '../bin/guard.mjs';
import { checkPush } from '../bin/prepush.mjs';
import { loadPolicy } from '../bin/lib/policy.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOOT = join(KIT, 'bin', 'bootstrap.mjs');
let repo, base;
const sh = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const commit = (msg) => { sh(['add', '-A']); sh(['commit', '-q', '-m', msg]); return sh(['rev-parse', 'HEAD']); };
const as = (role) => write('.bootstrap/session.json', JSON.stringify({ role }));
const sign = (piece, role, sha) => write(`docs/signoffs/${piece}/${role}.md`, `---\npiece: ${piece}\nrole: ${role}\nsha: ${sha}\nverdict: PASS\n---\nok\n`);
const lane = (piece, l) => write(`docs/signoffs/${piece}/_piece.md`, `---\npiece: ${piece}\nlane: ${l}\n---\n`);
const word = (piece, w, extra = '') => write(`docs/signoffs/${piece}/_${w}.md`, `---\npiece: ${piece}\nword: ${w}\nowner_words: "yes"\nquestion: "Approve it?"\nsaid_at: 2026-11-12T10:00\nrelayed_by: none\n${extra}---\n`);
const push = (local) => checkPush({ root: repo, policy: loadPolicy(repo), role: 'builder', localSha: local, remoteRef: 'refs/heads/dev', remoteSha: base });
const ok = (role, x) => { as(role); return decide({ cwd: repo, ...x }).allow; };
const cli = (args) => spawnSync(process.execPath, [BOOT, ...args], { cwd: repo, encoding: 'utf8' });

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'trust-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  sh(['config', 'user.email', 'test@example.invalid']);
  sh(['config', 'user.name', 'test']);
  assert.equal(cli(['init']).status, 0);
  write('src/app.js', 'export const a = 1;\n');
  base = commit('base');
});
after(() => rmSync(repo, { recursive: true, force: true }));

describe('fix 1: a session signs only as itself', () => {
  test('file writes: own sign-off yes, another role\'s no', () => {
    assert.equal(ok('qa', { tool: 'Write', filePath: 'docs/signoffs/R1/qa.md' }), true);
    assert.equal(ok('builder', { tool: 'Write', filePath: 'docs/signoffs/R1/qa.md' }), false);
    assert.equal(ok('design', { tool: 'Edit', filePath: 'docs/signoffs/R1/tech-lead.md' }), false);
  });
  test('routing and owner-word records: Chief of Staff only (Security may add required roles)', () => {
    assert.equal(ok('builder', { tool: 'Write', filePath: 'docs/signoffs/R1/_piece.md' }), false);
    assert.equal(ok('chief-of-staff', { tool: 'Write', filePath: 'docs/signoffs/R1/_piece.md' }), true);
    assert.equal(ok('qa', { tool: 'Write', filePath: 'docs/signoffs/R1/_approve.md' }), false);
    assert.equal(ok('chief-of-staff', { tool: 'Write', filePath: 'docs/signoffs/R1/_go.md' }), true);
    assert.equal(ok('security', { tool: 'Write', filePath: 'docs/signoffs/R1/_required.md' }), true);
    assert.equal(ok('builder', { tool: 'Write', filePath: 'docs/releases/2026-11-12-x.md' }), false);
    assert.equal(ok('release-ops', { tool: 'Write', filePath: 'docs/releases/2026-11-12-x.md' }), true);
  });
  test('shell: no signing as someone else, no raw writes, no role spoofing', () => {
    assert.equal(ok('builder', { tool: 'Bash', command: 'node .bootstrap/bin/bootstrap.mjs signoff R1 --role qa --verdict PASS' }), false);
    assert.equal(ok('qa', { tool: 'Bash', command: 'node .bootstrap/bin/bootstrap.mjs signoff R1 --verdict PASS' }), true);
    assert.equal(ok('builder', { tool: 'Bash', command: 'echo x > docs/signoffs/R1/qa.md' }), false);
    assert.equal(ok('builder', { tool: 'Bash', command: 'cp /tmp/x.md docs/signoffs/R1/tech-lead.md' }), false);
    assert.equal(ok('builder', { tool: 'Bash', command: 'BOOTSTRAP_ROLE=qa node .bootstrap/bin/bootstrap.mjs signoff R1 --verdict PASS' }), false);
    assert.equal(ok('builder', { tool: 'Bash', command: 'rm .bootstrap/session.json' }), false);
    assert.equal(ok('builder', { tool: 'Bash', command: 'node .bootstrap/bin/bootstrap.mjs piece R1 --lane light' }), false);
    assert.equal(ok('builder', { tool: 'Bash', command: 'cat docs/signoffs/R1/qa.md' }), true);
  });
  test('the CLI refuses too (for tools without a guard hook)', () => {
    as('builder');
    const r = cli(['signoff', 'R1', '--role', 'qa', '--verdict', 'PASS']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /cannot sign as "qa"/);
    assert.equal(cli(['piece', 'R1', '--lane', 'normal']).status, 1);
    as('chief-of-staff');
    assert.match(cli(['piece', 'R1']).stderr, /--lane <lane-id> is required/);
    assert.match(cli(['approve', 'R1', '--words', 'yes', '--question', 'ok?', '--said-at', 'now']).stderr, /artifact/);
    assert.equal(cli(['approve', 'R1', '--words', 'yes', '--question', 'ok?', '--said-at', 'now', '--artifact', 'https://example.invalid/a']).status, 0);
    rmSync(join(repo, 'docs', 'signoffs', 'R1'), { recursive: true, force: true });
  });
});

describe('fix 2: code needs a routed piece; screens need approval; HIGH needs go', () => {
  test('all sign-offs but no lane set → refused, and the message says why', () => {
    write('src/app.js', 'export const a = 2;\n');
    const code = commit('code');
    for (const r of ['qa', 'tech-lead', 'librarian', 'chief-of-staff']) sign('P1', r, code);
    const tip = commit('docs: signoffs, no lane');
    const e = push(tip);
    assert.equal(e.length, 1);
    assert.match(e[0], /P1: no lane set/);
    lane('P1', 'normal');
    assert.deepEqual(push(commit('docs: lane')), []);
    base = sh(['rev-parse', 'HEAD']);
  });
  test('a screen change needs Design AND the owner\'s recorded approval with the artifact', () => {
    write('resources/views/invoice.blade.php', '<div>footer</div>\n');
    const code = commit('screen');
    lane('P2', 'normal');
    for (const r of ['qa', 'tech-lead', 'librarian', 'chief-of-staff', 'design']) sign('P2', r, code);
    let tip = commit('docs: signoffs');
    assert.match(push(tip)[0], /owner's word approve: no _approve\.md record/);
    word('P2', 'approve');
    tip = commit('docs: approval without artifact');
    assert.match(push(tip)[0], /approve: artifact/);
    word('P2', 'approve', 'artifact: https://example.invalid/artifact/1\n');
    tip = commit('docs: approval');
    assert.deepEqual(push(tip), []);
    base = tip;
  });
  test('HIGH work needs a recorded "go" (and Security)', () => {
    write('src/app.js', 'export const a = 3;\n');
    const code = commit('high code');
    lane('P3', 'high');
    for (const r of ['qa', 'tech-lead', 'librarian', 'chief-of-staff', 'security']) sign('P3', r, code);
    let tip = commit('docs: signoffs');
    assert.match(push(tip)[0], /owner's word go/);
    word('P3', 'go');
    tip = commit('docs: go');
    assert.deepEqual(push(tip), []);
    base = tip;
  });
  test('a relayed approval is refused when the flow turns relays off for it', () => {
    write('.bootstrap/flow.json', JSON.stringify({ version: 1, words: { approve: { relay: false } } }));
    base = commit('flow: no relayed approvals'); // accepted flow from here on
    write('resources/views/other.blade.php', '<p>x</p>\n');
    const code = commit('screen 2');
    lane('P4', 'normal');
    for (const r of ['qa', 'tech-lead', 'librarian', 'chief-of-staff', 'design']) sign('P4', r, code);
    // later keys win in the record's frontmatter, so this marks the approval as relayed
    word('P4', 'approve', 'relayed_by: chief-of-staff\nartifact: https://example.invalid/a2\n');
    const tip = commit('docs: relayed approval');
    assert.match(push(tip)[0], /relay not allowed/);
  });
});
