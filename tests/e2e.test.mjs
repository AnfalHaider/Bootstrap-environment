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
    write('.bootstrap/policy.json', readFileSync(join(repo, '.bootstrap/policy.json'), 'utf8').replace('"version": 1', '"version": 1, "note": "x"'));
    commit('touch the policy');
    const r = push('HEAD:dev');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no complete sign-off/);
    git(['reset', '-q', '--hard', 'origin/dev']);
  });

  test('a flow change lands with the owner\'s recorded yes; without it, or after a later edit, it is refused', () => {
    const flowPath = '.bootstrap/flow.json';
    const before = readFileSync(join(repo, flowPath), 'utf8');
    write(flowPath, JSON.stringify({ ...JSON.parse(before), family: { design: 'optional' } }, null, 2) + '\n');
    commit('flow: design optional');
    const noRecord = push('HEAD:dev');
    assert.notEqual(noRecord.status, 0);
    assert.match(noRecord.stderr, /change the flow .* no record of the owner's yes/);
    role('builder');
    assert.notEqual(bs('flow', 'apply', '--words', 'yes', '--question', 'q').status, 0, 'only the Chief of Staff records it');
    assert.equal(decide({ tool: 'Bash', command: 'node .bootstrap/bin/bootstrap.mjs flow apply --words yes --question q', cwd: repo }).allow, false);
    role('chief-of-staff');
    const ap = bs('flow', 'apply', '--words', 'yes, make Design optional', '--question', 'Make Design optional?');
    assert.equal(ap.status, 0, ap.stderr);
    commit('flow: record the owner\'s yes');
    const ok = push('HEAD:dev');
    assert.equal(ok.status, 0, ok.stderr);
    git(['fetch', '-q']);
    // a later edit is not covered by the earlier yes
    write(flowPath, JSON.stringify({ ...JSON.parse(readFileSync(join(repo, flowPath), 'utf8')), family: { design: 'off' } }, null, 2) + '\n');
    commit('flow: design off');
    const stale = push('HEAD:dev');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /no record of the owner's yes for this exact flow/);
    git(['reset', '-q', '--hard', 'origin/dev']);
  });

  test('kit upgrade: refused without the owner\'s yes; lands with `kit apply`; a later edit or mixed code is refused', () => {
    role('chief-of-staff');
    const g = join(repo, '.bootstrap/bin/guard.mjs');
    writeFileSync(g, readFileSync(g, 'utf8') + '\n// upgraded\n');
    writeFileSync(join(repo, '.bootstrap/kit.json'), '{ "version": "9.9.9" }\n');
    commit('kit 9.9.9');
    const no = push('HEAD:dev');
    assert.notEqual(no.status, 0);
    assert.match(no.stderr, /kit file\(s\) changed .* no record of the owner's yes .*\.bootstrap\/bin\/guard\.mjs/);
    role('builder');
    assert.notEqual(bs('kit', 'apply', '--words', 'yes', '--question', 'q').status, 0, 'only the Chief of Staff records it');
    assert.equal(decide({ tool: 'Bash', command: 'node .bootstrap/bin/bootstrap.mjs kit apply --words yes --question q', cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Write', filePath: 'docs/kit-changes/x.md', cwd: repo }).allow, false);
    role('chief-of-staff');
    const ap = bs('kit', 'apply', '--words', 'yes, upgrade', '--question', 'Apply the kit upgrade to 9.9.9?');
    assert.equal(ap.status, 0, ap.stderr);
    commit('kit: owner\'s yes');
    const ok = push('HEAD:dev');
    assert.equal(ok.status, 0, ok.stderr);
    git(['fetch', '-q']);
    writeFileSync(g, readFileSync(g, 'utf8') + '// sneaky\n');
    commit('kit: edit after the yes');
    assert.match(push('HEAD:dev').stderr, /no record of the owner's yes for these exact files/);
    git(['reset', '-q', '--hard', 'origin/dev']);
    writeFileSync(g, readFileSync(g, 'utf8') + '// with code\n');
    write('src/orders.js', 'export const total = (n) => n * 2;\n');
    commit('kit + code');
    assert.match(push('HEAD:dev').stderr, /no complete sign-off/, 'kit files mixed with code need the full flow');
    git(['reset', '-q', '--hard', 'origin/dev']);
  });

  test('helpers: at most 2 per session, cheapest model only', () => {
    const h = (model, extra = {}) => decide({ tool: 'Agent', cwd: repo, sessionId: 'sess-1', model, ...extra });
    assert.match(h(null).reason, /pass model: "haiku"/);
    assert.match(h('opus').reason, /cheapest model/);
    assert.match(h('haiku', { subagentType: 'fork' }).reason, /fork/);
    assert.equal(h('haiku').allow, true);
    assert.equal(h('haiku').allow, true);
    assert.match(h('haiku').reason, /already started 2 helper agents/);
    assert.equal(decide({ tool: 'Agent', cwd: repo, sessionId: 'sess-2', model: 'haiku' }).allow, true, 'counted per session');
    assert.match(readFileSync(join(repo, '.gitignore'), 'utf8'), /\.bootstrap\/helpers\//);
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

  test('a project with only "master" and no dev branch: detected, and sign-offs are checked on master', () => {
    const b2 = mkdtempSync(join(tmpdir(), 'bs-nodev-'));
    try {
      const r2 = join(b2, 'remote.git'), w = join(b2, 'app');
      git(['init', '-q', '--bare', '-b', 'master', r2], b2);
      git(['init', '-q', '-b', 'master', w], b2);
      git(['config', 'user.email', 't@example.test'], w); git(['config', 'user.name', 'T'], w);
      git(['remote', 'add', 'origin', r2], w);
      writeFileSync(join(w, 'app.py'), 'print(1)\n'); git(['add', '-A'], w); git(['commit', '-q', '-m', 'app'], w);
      git(['push', '-q', 'origin', 'master'], w);
      const init = spawnSync(process.execPath, [join(KIT, 'bin', 'bootstrap.mjs'), 'init', '--size', 'small'], { cwd: w, encoding: 'utf8' });
      assert.equal(init.status, 0, init.stderr);
      assert.match(init.stdout, /live: master \(detected\) · dev: none/);
      const pol = JSON.parse(readFileSync(join(w, '.bootstrap', 'policy.json'), 'utf8'));
      assert.deepEqual(pol.branches, { live: 'master', dev: null });
      assert.match(readFileSync(join(w, 'AGENTS.md'), 'utf8'), /`master` \/ none/);
      git(['add', '-A'], w); git(['commit', '-q', '-m', 'bootstrap scaffold'], w);
      const adopt = spawnSync('git', ['push', 'origin', 'master'], { cwd: w, encoding: 'utf8', env: { ...process.env, BOOTSTRAP_ROLE: 'release-ops' } });
      assert.equal(adopt.status, 0, adopt.stderr);
      writeFileSync(join(w, 'app.py'), 'print(2)\n'); git(['commit', '-q', '-am', 'change'], w);
      const code = spawnSync('git', ['push', 'origin', 'master'], { cwd: w, encoding: 'utf8', env: { ...process.env, BOOTSTRAP_ROLE: 'release-ops' } });
      assert.notEqual(code.status, 0);
      assert.match(code.stderr, /no release record[\s\S]*no complete sign-off/);
      const flowDoc = spawnSync(process.execPath, [join(w, '.bootstrap', 'bin', 'bootstrap.mjs'), 'status'], { cwd: w, encoding: 'utf8' });
      assert.match(flowDoc.stdout, /live=master dev=none/);
    } finally { rmSync(b2, { recursive: true, force: true }); }
  });

  test('mem new writes a lesson that passes mem check', () => {
    const r = newLesson(repo, 'Push the kit on its own first', { triggers: 'bootstrap, first push', files: 'src/orders.js', cost: 'a refused first push', evidence: 'pre-push output' });
    assert.ok(r.file && existsSync(join(repo, r.file)), JSON.stringify(r));
    const { errors } = check(repo);
    assert.deepEqual(errors.filter((e) => e.includes('lessons/')), []);
    assert.match(newLesson(repo, 'x', {}).error, /--triggers/);
  });
});
