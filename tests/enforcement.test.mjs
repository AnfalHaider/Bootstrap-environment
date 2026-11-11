// Run: node --test tests/
// Every branch of the guard and the pre-push check is exercised against a real temporary git repo (R2).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { decide } from '../bin/guard.mjs';
import { checkPush } from '../bin/prepush.mjs';
import { loadPolicy } from '../bin/lib/policy.mjs';
import { check, find } from '../bin/mem.mjs';
import { detect } from '../bin/detect-stack.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = '0'.repeat(40);
let repo;

const sh = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const commit = (msg) => { sh(['add', '-A']); sh(['commit', '-q', '-m', msg]); return sh(['rev-parse', 'HEAD']); };
const setRole = (role) => write('.bootstrap/session.json', JSON.stringify({ role }));
const signoff = (piece, role, sha) => write(`docs/signoffs/${piece}/${role}.md`, `---\npiece: ${piece}\nrole: ${role}\nsha: ${sha}\nverdict: PASS\ndate: 2026-11-11\n---\nok\n`);
const push = (localSha, remoteSha, branch, role) =>
  checkPush({ root: repo, policy: loadPolicy(repo), role, localSha, remoteRef: `refs/heads/${branch}`, remoteSha });

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
  sh(['init', '-q', '-b', 'main']);
  sh(['config', 'user.email', 'test@example.invalid']);
  sh(['config', 'user.name', 'test']);
  const r = spawnSync(process.execPath, [join(KIT, 'bin', 'bootstrap.mjs'), 'init', '--live', 'main', '--dev', 'dev'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  write('src/app.js', 'export const a = 1;\n');
  commit('base');
});
after(() => rmSync(repo, { recursive: true, force: true }));

describe('guard (pre-tool hook)', () => {
  test('not bootstrapped -> allow', () => {
    const other = mkdtempSync(join(tmpdir(), 'plain-'));
    sh(['init', '-q'], other);
    assert.equal(decide({ tool: 'Bash', command: 'git push --force', cwd: other }).allow, true);
    rmSync(other, { recursive: true, force: true });
  });
  test('force push denied for every role', () => {
    setRole('release-ops');
    assert.equal(decide({ tool: 'Bash', command: 'git push --force origin dev', cwd: repo }).allow, false);
  });
  test('--no-verify and hooksPath tampering denied', () => {
    setRole('builder');
    assert.equal(decide({ tool: 'Bash', command: 'git push --no-verify origin dev', cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Bash', command: 'git config core.hooksPath /dev/null', cwd: repo }).allow, false);
  });
  test('live push: builder denied, release-ops allowed (record checked later by pre-push)', () => {
    setRole('builder');
    assert.equal(decide({ tool: 'Bash', command: 'git push origin main', cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Bash', command: 'git fetch && git push origin HEAD:refs/heads/main', cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Bash', command: 'git push origin dev', cwd: repo }).allow, true);
    setRole('release-ops');
    assert.equal(decide({ tool: 'Bash', command: 'git push origin main', cwd: repo }).allow, true);
  });
  test('server commands denied', () => {
    setRole('platform');
    assert.equal(decide({ tool: 'Bash', command: 'ssh prod uptime', cwd: repo }).allow, false);
  });
  test('docs-only role cannot write code; can write docs', () => {
    setRole('design');
    assert.equal(decide({ tool: 'Write', filePath: join(repo, 'src/app.js'), cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Edit', filePath: 'docs/research/x.md', cwd: repo }).allow, true);
  });
  test('QA may write tests, not app code', () => {
    setRole('qa');
    assert.equal(decide({ tool: 'Write', filePath: 'tests/login.test.js', cwd: repo }).allow, true);
    assert.equal(decide({ tool: 'Write', filePath: 'src/app.js', cwd: repo }).allow, false);
  });
  test('protected config: only chief-of-staff', () => {
    setRole('builder');
    assert.equal(decide({ tool: 'Edit', filePath: 'AGENTS.md', cwd: repo }).allow, false);
    assert.equal(decide({ tool: 'Edit', filePath: '.bootstrap/policy.json', cwd: repo }).allow, false);
    setRole('chief-of-staff');
    assert.equal(decide({ tool: 'Edit', filePath: 'AGENTS.md', cwd: repo }).allow, true);
  });
  test('malformed payload blocks (fail closed)', () => {
    const r = spawnSync(process.execPath, [join(KIT, 'bin', 'guard.mjs')], { input: '{not json', encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
  test('CLI exit codes: allow 0, deny 2 with reason', () => {
    setRole('builder');
    const run = (cmd) => spawnSync(process.execPath, [join(KIT, 'bin', 'guard.mjs')],
      { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: repo }), encoding: 'utf8' });
    assert.equal(run('git status').status, 0);
    const d = run('git push origin main');
    assert.equal(d.status, 2);
    assert.match(d.stderr, /only release-ops/);
  });
});

describe('pre-push (git hook)', () => {
  let base;
  before(() => { base = sh(['rev-parse', 'HEAD']); });

  test('docs-only push to dev needs no sign-off', () => {
    write('docs/memory/logs/builder.md', '## today\nnote\n');
    const tip = commit('docs: log');
    assert.deepEqual(push(tip, base, 'dev', 'builder'), []);
    base = tip;
  });
  test('unsigned code to dev is refused', () => {
    write('src/app.js', 'export const a = 2;\n');
    const tip = commit('code');
    const errs = push(tip, base, 'dev', 'builder');
    assert.equal(errs.length, 1);
    assert.match(errs[0], /no complete sign-off/);
  });
  test('partial sign-off still refused; complete sign-off + docs on top accepted', () => {
    const code = sh(['rev-parse', 'HEAD']);
    signoff('R1', 'qa', code);
    let tip = commit('docs: qa signoff');
    assert.match(push(tip, base, 'dev', 'builder')[0], /no complete sign-off/);
    for (const r of ['tech-lead', 'librarian', 'chief-of-staff']) signoff('R1', r, code);
    tip = commit('docs: remaining signoffs');
    assert.deepEqual(push(tip, base, 'dev', 'builder'), []);
  });
  test('code added after sign-off is refused', () => {
    write('src/app.js', 'export const a = 3;\n');
    const tip = commit('sneaky code');
    assert.match(push(tip, base, 'dev', 'builder')[0], /1 code commit/);
    sh(['reset', '-q', '--hard', 'HEAD~1']);
  });
  test('_required.md can add security', () => {
    write('docs/signoffs/R1/_required.md', '---\npiece: R1\nroles: [qa, tech-lead, security, librarian, chief-of-staff]\n---\n');
    const tip = commit('docs: require security');
    assert.match(push(tip, base, 'dev', 'builder')[0], /no complete sign-off/);
    signoff('R1', 'security', sh(['rev-parse', 'HEAD~1']));
    const t2 = commit('docs: security signoff');
    // security signed a different sha than the others -> still incomplete
    assert.match(push(t2, base, 'dev', 'builder')[0], /no complete sign-off/);
    const code = sh(['log', '-1', '--format=%H', '--', 'src/app.js']);
    signoff('R1', 'security', code);
    const t3 = commit('docs: security signs the code sha');
    assert.deepEqual(push(t3, base, 'dev', 'builder'), []);
  });
  test('live: wrong role and missing record refused; full record accepted', () => {
    const tip = sh(['rev-parse', 'HEAD']);
    const code = sh(['log', '-1', '--format=%H', '--', 'src/app.js']);
    assert.ok(push(tip, base, 'main', 'builder').some((e) => /may not push/.test(e)));
    assert.ok(push(tip, base, 'main', 'release-ops').some((e) => /no release record/.test(e)));
    write('docs/releases/2026-11-11-r1.md', `---\nscope: r1\nowner_words: "release r1"\nquestion: "Release R1 (${code.slice(0, 9)})?"\nsaid_at: 2026-11-11T10:00\nshas: [${code}]\n---\n\n## Pre-release check\n\ngate: OK\n`);
    const t2 = commit('docs: release record');
    assert.deepEqual(push(t2, base, 'main', 'release-ops'), []);
  });
  test('live: record without pasted check refused', () => {
    write('docs/releases/2026-11-11-r1.md', '---\nscope: r1\nowner_words: "ok"\nquestion: "q"\nsaid_at: x\nshas: [' + sh(['log', '-1', '--format=%H', '--', 'src/app.js']) + ']\n---\n\n## Pre-release check\n\n');
    const t = commit('docs: bad record');
    assert.ok(push(t, base, 'main', 'release-ops').some((e) => /Pre-release check/.test(e)));
  });
  test('hotfix exempt from sign-offs on live, not from the record', () => {
    sh(['checkout', '-q', '-b', 'hf', base]);
    write('src/app.js', 'export const a = 9;\n');
    const fix = commit('hotfix');
    assert.ok(push(fix, base, 'main', 'hotfix').some((e) => /no release record/.test(e)));
    write('docs/releases/2026-11-11-hf.md', `---\nscope: hf\nowner_words: "apply"\nquestion: "Apply the fix ${fix.slice(0, 9)}?"\nsaid_at: 2026-11-11T11:00\nshas: [${fix}]\n---\n\n## Pre-release check\n\ngate: OK\n`);
    const t = commit('docs: apply record');
    assert.deepEqual(push(t, base, 'main', 'hotfix'), []);
    sh(['checkout', '-q', 'main']);
  });
  test('deleting dev refused; feature branches free', () => {
    assert.ok(push(ZERO, base, 'dev', 'release-ops').some((e) => /delete/.test(e)));
    assert.deepEqual(push(sh(['rev-parse', 'HEAD']), base, 'feature/x', 'builder'), []);
  });
  test('conflict markers refused on any branch', () => {
    write('src/b.js', '<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n');
    const t = commit('oops');
    assert.ok(push(t, base, 'feature/x', 'builder').some((e) => /conflict markers/.test(e)));
    sh(['reset', '-q', '--hard', 'HEAD~1']);
  });
});

describe('memory CLI', () => {
  test('check catches a lesson naming a missing file, then passes when fixed', () => {
    const lesson = (files) => `---\nid: L001\ndate: 2026-11-11\nsession: qa\ntitle: Name the database\ntriggers: [database, scratch script]\nfiles: [${files}]\ncost: a cleanup\nevidence: test\nstatus: live\n---\nbody\n`;
    write('docs/memory/lessons/L001-db.md', lesson('src/nope.js'));
    assert.ok(check(repo).errors.some((e) => /does not exist/.test(e)));
    write('docs/memory/lessons/L001-db.md', lesson('src/app.js'));
    assert.deepEqual(check(repo).errors, []);
    assert.equal(find(repo, 'database').length, 1);
    assert.equal(find(repo, 'payments').length, 0);
  });
  test('check catches malformed frontmatter and conflict markers in docs', () => {
    write('docs/memory/lessons/L002-bad.md', 'no frontmatter\n');
    write('docs/notes.md', '<<<<<<< HEAD\n');
    const errs = check(repo).errors;
    assert.ok(errs.some((e) => /no frontmatter/.test(e)));
    assert.ok(errs.some((e) => /conflict markers/.test(e)));
    rmSync(join(repo, 'docs/memory/lessons/L002-bad.md'));
    rmSync(join(repo, 'docs/notes.md'));
  });
});

describe('detect-stack', () => {
  test('finds lockfiles, frameworks and language servers', () => {
    const d = mkdtempSync(join(tmpdir(), 'stack-'));
    writeFileSync(join(d, 'composer.json'), '{"require":{"laravel/framework":"^11"}}');
    writeFileSync(join(d, 'composer.lock'), '{}');
    writeFileSync(join(d, 'artisan'), '');
    mkdirSync(join(d, 'app'));
    writeFileSync(join(d, 'app', 'User.php'), '<?php');
    mkdirSync(join(d, 'web'));
    writeFileSync(join(d, 'web', 'package.json'), '{"dependencies":{"next":"15"},"scripts":{"build":"next build"}}');
    writeFileSync(join(d, 'web', 'pnpm-lock.yaml'), '');
    writeFileSync(join(d, 'web', 'page.tsx'), '');
    const p = detect(d);
    const cmds = p.workspaces.flatMap((w) => w.installs.map((i) => i.command));
    assert.ok(cmds.includes('composer install --no-interaction --prefer-dist'));
    assert.ok(cmds.includes('pnpm install --frozen-lockfile'));
    assert.ok(!cmds.some((c) => /^npm install/.test(c)), 'manifest-only fallback must not shadow a lockfile');
    assert.ok(p.frameworks.includes('laravel') && p.frameworks.includes('nextjs'));
    assert.ok(p.lsp_suggestions.some((l) => l.plugin === 'php-lsp'));
    assert.ok(p.lsp_suggestions.some((l) => l.plugin === 'typescript-lsp'));
    rmSync(d, { recursive: true, force: true });
  });
});
