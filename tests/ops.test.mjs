// Run: node --test tests/ops.test.mjs
// brief, next, board --mine, board archive, piece --suggest, evidence on sign-offs, init --size, cost.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { boardArchive, boardMine, brief, cost, next, suggest } from '../bin/lib/ops.mjs';
import { checkPush } from '../bin/prepush.mjs';
import { loadPolicy } from '../bin/lib/policy.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOOT = join(KIT, 'bin', 'bootstrap.mjs');
let repo;
const sh = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const commit = (msg) => { sh(['add', '-A']); sh(['commit', '-q', '-m', msg]); return sh(['rev-parse', 'HEAD']); };
const as = (role) => write('.bootstrap/session.json', JSON.stringify({ role }));
const cli = (args, cwd = repo) => spawnSync(process.execPath, [BOOT, ...args], { cwd, encoding: 'utf8' });
const tok = (s) => Math.round(s.length / 3.6);

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'ops-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  sh(['config', 'user.email', 'test@example.invalid']);
  sh(['config', 'user.name', 'test']);
  assert.equal(cli(['init', '--dev', 'dev']).status, 0);
  write('src/app.js', 'export const a = 1;\n');
  commit('base');
  sh(['branch', 'dev']);
  sh(['checkout', '-q', '-b', 'feature']);
});
after(() => rmSync(repo, { recursive: true, force: true }));

describe('brief: each session gets only its own rules', () => {
  test('QA gets testing rules, not release rules; the Chief of Staff gets routing rules', () => {
    const qa = brief(repo, 'qa');
    assert.match(qa, /\*\*O1\*\*/); assert.match(qa, /\*\*S1\*\*/); assert.match(qa, /\*\*O8\*\*/); assert.match(qa, /\*\*M1\*\*/);
    assert.doesNotMatch(qa, /\*\*O4\*\*/); assert.doesNotMatch(qa, /\*\*O6\*\*/);
    assert.match(qa, /you sign before dev/);
    const cos = brief(repo, 'chief-of-staff');
    assert.match(cos, /\*\*R1\*\*/); assert.match(cos, /\*\*O4\*\*/);
  });
  test('a brief is far smaller than reading the whole rulebook', () => {
    const whole = readFileSync(join(repo, 'AGENTS.md'), 'utf8') + readFileSync(join(KIT, 'skills/bootstrap-environment/references/session-family.md'), 'utf8');
    for (const r of ['qa', 'builder', 'librarian', 'chief-of-staff']) assert.ok(tok(brief(repo, r)) < tok(whole) / 2, `${r} brief should be < half`);
  });
});

describe('next, sign-off evidence, and the push check', () => {
  test('signoff CLI: a PASS needs evidence', () => {
    as('qa');
    assert.match(cli(['signoff', 'R1', '--verdict', 'PASS']).stderr, /needs evidence/);
    assert.equal(cli(['signoff', 'R1', '--verdict', 'PASS', '--note', 'npm test: 12 passed, 0 failed']).status, 0);
    rmSync(join(repo, 'docs', 'signoffs', 'R1'), { recursive: true, force: true });
  });
  test('next: not routed → says so; routed → lists what is missing and who acts next; weak PASS flagged', () => {
    write('src/app.js', 'export const a = 2;\n');
    const code = commit('code');
    assert.match(next(repo, 'R2'), /NOT ROUTED/);
    write('docs/signoffs/R2/_piece.md', '---\npiece: R2\nlane: normal\ntitle: "Footer"\n---\n');
    write('docs/signoffs/R2/qa.md', `---\nrole: qa\nsha: ${code}\nverdict: PASS\n---\nnpm test: 12 passed; checked src/app.js:1\n`);
    write('docs/signoffs/R2/librarian.md', `---\nrole: librarian\nsha: ${code}\nverdict: PASS\n---\nok\n`);
    const out = next(repo, 'R2');
    assert.match(out, /✓ QA @/);
    assert.match(out, /✗ Librarian: not signed \(a PASS without evidence was ignored\)/);
    assert.match(out, /NEXT: /);
  });
  test('the push check ignores a PASS without evidence and says why', () => {
    const code = sh(['log', '-1', '--format=%H', '--', 'src/app.js']);
    for (const r of ['chief-of-staff']) write(`docs/signoffs/R2/${r}.md`, `---\nrole: ${r}\nsha: ${code}\nverdict: PASS\n---\nreviewed the diff of src/app.js:1, fine\n`);
    const tip = commit('docs: signoffs');
    const base = sh(['rev-parse', 'dev']);
    const errs = checkPush({ root: repo, policy: loadPolicy(repo), role: 'builder', localSha: tip, remoteRef: 'refs/heads/dev', remoteSha: base });
    assert.match(errs[0], /librarian \(PASS without evidence\)/);
    write('docs/signoffs/R2/librarian.md', `---\nrole: librarian\nsha: ${code}\nverdict: PASS\n---\nread src/app.js:1; lessons checked, board row updated\n`);
    const t2 = commit('docs: real evidence');
    assert.deepEqual(checkPush({ root: repo, policy: loadPolicy(repo), role: 'builder', localSha: t2, remoteRef: 'refs/heads/dev', remoteSha: base }), []);
    assert.match(next(repo, 'R2'), /READY/);
  });
});

describe('suggest a lane from the changed files', () => {
  test('auth → high, screen → normal, plain → no-screen', () => {
    assert.match(suggest(repo, 'X', ['src/auth/login.js']), /suggested lane "high"/);
    assert.match(suggest(repo, 'X', ['resources/views/a.blade.php']), /suggested lane "normal"[\s\S]*owner's words: approve/);
    assert.match(suggest(repo, 'X', ['src/util.js']), /suggested lane "no-screen"/);
    as('builder');
    assert.equal(cli(['piece', 'X', '--suggest', '--files', 'src/util.js']).status, 0, 'anyone may ask for a suggestion');
  });
});

describe('board: read only your rows; archive old DONE rows', () => {
  test('--mine shows only this session\'s open rows', () => {
    write('docs/plans/BOARD.md', ['# Board', '', '## OPEN', '', '| Id | Title | Risk | Owner session |', '|---|---|---|---|',
      '| R7 | Footer | LOW | builder |', '| R8 | Tests | LOW | qa |', '', '## DONE', '', '| Id | Title | sha | Verified |', '|---|---|---|---|',
      ...Array.from({ length: 15 }, (_, i) => `| D${i} | old ${i} | abc${i} | 2026-10-0${(i % 9) + 1} |`), ''].join('\n'));
    as('builder');
    const mine = boardMine(repo);
    assert.match(mine, /R7/); assert.doesNotMatch(mine, /R8/); assert.doesNotMatch(mine, /D3/);
  });
  test('archive keeps the newest 10 DONE rows', () => {
    assert.match(boardArchive(repo, 10), /moved 5 DONE rows/);
    const b = readFileSync(join(repo, 'docs/plans/BOARD.md'), 'utf8');
    assert.doesNotMatch(b, /\| D0 \|/); assert.match(b, /\| D14 \|/);
    assert.match(boardArchive(repo, 10), /nothing to archive/);
  });
});

describe('init --size and cost', () => {
  test('a prototype starts with the Solo preset; a bad size is refused', () => {
    const d = mkdtempSync(join(tmpdir(), 'size-'));
    execFileSync('git', ['init', '-q'], { cwd: d });
    assert.equal(cli(['init', '--size', 'prototype'], d).status, 0);
    assert.equal(JSON.parse(readFileSync(join(d, '.bootstrap/flow.json'), 'utf8')).preset, 'solo');
    assert.equal(cli(['init', '--size', 'huge'], d).status, 1);
    rmSync(d, { recursive: true, force: true });
  });
  test('cost lists every session and warns when the board grows', () => {
    let out = cost(repo);
    assert.match(out, /qa\s+~\d+ tokens/); assert.match(out, /chief-of-staff\s+~\d+ tokens/);
    write('docs/plans/BOARD.md', '# Board\n' + 'x'.repeat(20000));
    out = cost(repo);
    assert.match(out, /WARN BOARD\.md/);
  });
});
