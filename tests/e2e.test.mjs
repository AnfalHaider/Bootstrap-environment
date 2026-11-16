// Fixes found by the end-to-end run on a sample project: a real repo, a real bare remote, real
// `git push` through the installed pre-push hook.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { decide } from '../bin/guard.mjs';
import { detect } from '../bin/detect-stack.mjs';
import { check, newLesson } from '../bin/mem.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
let base, repo, remote;
const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const commit = (msg) => { git(['add', '-A']); git(['commit', '-q', '-m', msg]); return git(['rev-parse', 'HEAD']); };
const bs = (...args) => spawnSync(process.execPath, [join(repo, '.bootstrap', 'bin', 'bootstrap.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
const push = (spec) => spawnSync('git', ['push', 'origin', spec], { cwd: repo, encoding: 'utf8' });
const role = (r) => { const res = bs('role', r); assert.equal(res.status, 0, res.stderr); };

describe('end to end on a sample project', () => {
  before(() => {
    base = mkdtempSync(join(tmpdir(), 'bs-e2e-'));
    remote = join(base, 'remote.git');
    repo = join(base, 'shop');
    git(['init', '-q', '--bare', '-b', 'main', remote], base);
    git(['init', '-q', '-b', 'main', repo], base);
    git(['config', 'user.email', 't@example.test']); git(['config', 'user.name', 'T']);
    git(['remote', 'add', 'origin', remote]);
    write('package.json', JSON.stringify({ name: 'shop', scripts: { check: 'node --test', test: 'node --test' }, dependencies: { express: '^4.21.2' } }));
    write('package-lock.json', '{}');
    write('src/orders.js', 'export const total = (n) => n;\n');
    commit('sample shop');
    git(['push', '-q', 'origin', 'main', 'main:dev']);
    const res = spawnSync(process.execPath, [join(KIT, 'bin', 'bootstrap.mjs'), 'init', '--size', 'small', '--live', 'main', '--dev', 'dev'], { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  test('detect-stack names server frameworks and gate candidates', () => {
    const p = detect(repo);
    assert.ok(p.frameworks.includes('express'));
    assert.deepEqual(p.gate_candidates, ['npm run check', 'npm run test']);
  });

  test('adopting the kit: a kit-only push lands; a push with project code in it is refused', () => {
    write('src/extra.js', 'export const x = 1;\n');
    commit('scaffold + code');
    const mixed = push('HEAD:dev');
    assert.notEqual(mixed.status, 0);
    assert.match(mixed.stderr, /adopts it: push the kit on its own first[\s\S]*src\/extra\.js/);
    git(['reset', '-q', '--soft', 'HEAD~1']);
    git(['rm', '-q', '--cached', 'src/extra.js']); rmSync(join(repo, 'src/extra.js'));
    git(['commit', '-q', '-m', 'bootstrap scaffold']);
    const kitOnly = push('HEAD:dev');
    assert.equal(kitOnly.status, 0, kitOnly.stderr);
    git(['fetch', '-q']);
  });

  test('after adoption, changing a kit file goes through the flow like any code', () => {
    write('.bootstrap/flow.json', JSON.stringify({ version: 1, preset: 'solo' }, null, 2) + '\n');
    commit('loosen the flow');
    const r = push('HEAD:dev');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no complete sign-off/);
    git(['reset', '-q', '--hard', 'origin/dev']);
  });

  test('a routed piece with no sign-offs yet is named in the refusal, with who must sign', () => {
    role('chief-of-staff');
    assert.equal(bs('piece', 'totals', '--lane', 'no-screen').status, 0);
    commit('route totals');
    write('src/orders.js', 'export const total = (n) => n.toFixed(2);\n');
    commit('totals: two decimals');
    const r = push('HEAD:dev');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /totals \(lane no-screen\): no sign-offs yet; needs .*qa/);
  });

  test('signoff signs the newest code commit, not a docs commit on top of it', () => {
    const code = git(['rev-parse', 'HEAD']);
    role('qa');
    assert.equal(bs('signoff', 'totals', '--verdict', 'PASS', '--note', 'node --test: 3 passed; src/orders.js:1').status, 0);
    commit('signoff qa');
    role('tech-lead');
    assert.equal(bs('signoff', 'totals', '--verdict', 'PASS', '--note', 'reviewed src/orders.js:1, no new deps').status, 0);
    const tl = readFileSync(join(repo, 'docs/signoffs/totals/tech-lead.md'), 'utf8');
    assert.match(tl, new RegExp(`sha: ${code}`));
  });

  test('guard: a Git Bash style cwd still finds the project (never silently allows)', { skip: process.platform !== 'win32' }, () => {
    role('builder');
    const msys = repo.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    const res = decide({ tool: 'Write', filePath: 'docs/signoffs/totals/qa.md', cwd: msys });
    assert.equal(res.allow, false);
  });

  test('mem new writes a lesson that passes mem check', () => {
    const r = newLesson(repo, 'Push the kit on its own first', { triggers: 'bootstrap, first push', files: 'src/orders.js', cost: 'a refused first push', evidence: 'pre-push output' });
    assert.ok(r.file && existsSync(join(repo, r.file)), JSON.stringify(r));
    const { errors } = check(repo);
    assert.deepEqual(errors.filter((e) => e.includes('lessons/')), []);
    assert.match(newLesson(repo, 'x', {}).error, /--triggers/);
  });
});
