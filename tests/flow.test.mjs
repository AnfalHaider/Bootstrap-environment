// Run: node --test tests/flow.test.mjs
// The flow layers, company locks, flow-driven pre-push, custom sessions in the guard, and the editor server.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { columns, loadLayers, merge, parseSource, renderMarkdown, requiredFor, simulate, validate } from '../bin/lib/flow.mjs';
import { checkPush } from '../bin/prepush.mjs';
import { loadPolicy } from '../bin/lib/policy.mjs';
import { decide } from '../bin/guard.mjs';
import { makeServer } from '../bin/flow-ui.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
let repo;
const sh = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const commit = (msg) => { sh(['add', '-A']); sh(['commit', '-q', '-m', msg]); return sh(['rev-parse', 'HEAD']); };
const sign = (piece, role, sha) => write(`docs/signoffs/${piece}/${role}.md`, `---\npiece: ${piece}\nrole: ${role}\nsha: ${sha}\nverdict: PASS\n---\nnpm test: 12 passed; checked src/app.js:1\n`);
const onLane = (piece, lane) => write(`docs/signoffs/${piece}/_piece.md`, `---\npiece: ${piece}\nlane: ${lane}\n---\n`);
const push = (local, remote, role = 'builder', branch = 'dev') =>
  checkPush({ root: repo, policy: loadPolicy(repo), role, localSha: local, remoteRef: `refs/heads/${branch}`, remoteSha: remote });
const flowWith = (project, company = null) => {
  const layers = { ...loadLayers(null), project, company };
  const flow = merge(layers);
  return { flow, findings: validate(layers, flow) };
};
const COMPANY = { version: 1, name: 'Acme', floor: { signoffs: { '*': ['tech-lead'], high: ['security'] }, no_relay: ['apply'] },
  sources: { builder: [{ repo: 'acme/eng-skills', required: true }] }, defaults: { blocked_sources: ['random-dev/unsafe-hooks'] } };

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'flow-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  sh(['config', 'user.email', 'test@example.invalid']);
  sh(['config', 'user.name', 'test']);
  const r = spawnSync(process.execPath, [join(KIT, 'bin', 'bootstrap.mjs'), 'init', '--dev', 'dev'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  write('src/app.js', 'export const a = 1;\n');
  commit('base');
});
after(() => rmSync(repo, { recursive: true, force: true }));

describe('flow layers and company locks', () => {
  test('init writes a starter flow; built-in lanes load', () => {
    assert.ok(existsSync(join(repo, '.bootstrap', 'flow.json')));
    assert.ok(existsSync(join(repo, '.bootstrap', 'ui', 'flow-editor.html')));
    const { flow, findings } = flowWith({ version: 1 });
    assert.deepEqual(flow.lanes.map((l) => l.id), ['normal', 'no-screen', 'high', 'hotfix']);
    assert.equal(findings.filter((f) => f.level === 'error').length, 0);
  });
  test('a project cannot loosen a company floor: effective keeps it AND the check reports an error', () => {
    const { flow, findings } = flowWith({ version: 1, lanes: [{ id: 'no-screen', dev_signoffs: ['chief-of-staff'] }] }, COMPANY);
    assert.ok(flow.lanes.find((l) => l.id === 'no-screen').dev_signoffs.includes('tech-lead'));
    assert.ok(findings.some((f) => f.level === 'error' && /drops Tech Lead/.test(f.msg)));
  });
  test('a project can tighten: adding a sign-off is fine', () => {
    const { flow, findings } = flowWith({ version: 1, lanes: [{ id: 'normal', dev_signoffs: ['qa', 'tech-lead', 'security', 'librarian', 'chief-of-staff'] }] }, COMPANY);
    assert.ok(flow.lanes.find((l) => l.id === 'normal').dev_signoffs.includes('security'));
    assert.equal(findings.filter((f) => f.level === 'error').length, 0);
  });
  test('company: required sources, blocked sources, forbidden relays', () => {
    const { flow, findings } = flowWith({ version: 1, roles: { builder: { sources: ['random-dev/unsafe-hooks', 'obra/superpowers'] } }, words: { apply: { relay: true } } }, COMPANY);
    const list = flow.roles.builder.source_list;
    assert.ok(list.some((s) => s.slug === 'acme/eng-skills' && s.required && s.from === 'company'));
    assert.ok(list.some((s) => s.blocked && /unsafe-hooks/.test(s.slug)));
    assert.ok(list.some((s) => s.ok && s.slug === 'obra/superpowers' && !s.official));
    assert.equal(flow.words.apply.relay, false);
    assert.ok(findings.some((f) => f.level === 'error' && /forbid relaying/.test(f.msg)));
    assert.ok(findings.some((f) => f.level === 'warning' && /block it/.test(f.msg)));
  });
  test('checks catch: no reviewer, self-review, unknown session, live without a word', () => {
    const { findings } = flowWith({ version: 1, lanes: [
      { id: 'lazy', name: 'Lazy', stages: [{ kind: 'stage', role: 'builder', title: 'b' }, { kind: 'gate', gate: 'dev', title: 'd' }], dev_signoffs: ['chief-of-staff', 'builder'], live_word: 'release' },
      { id: 'bad', name: 'Bad', stages: [{ kind: 'stage', role: 'ghost', title: 'x' }, { kind: 'gate', gate: 'live', title: 'l' }], dev_signoffs: ['qa'], live_word: '' },
    ] });
    const msgs = findings.map((f) => `${f.level}:${f.msg}`).join('\n');
    assert.match(msgs, /warning:Lane "Lazy" lets code reach dev without QA/);
    assert.match(msgs, /warning:In lane "Lazy", Builder signs off its own work/);
    assert.match(msgs, /error:Lane "Bad" has a stage owned by "ghost"/);
    assert.match(msgs, /error:Lane "Bad" reaches live without one of your words/);
  });
  test('presets change lanes', () => {
    assert.deepEqual(flowWith({ version: 1, preset: 'custom' }).flow.lanes.map((l) => l.id), ['main', 'hotfix']);
    assert.ok(flowWith({ version: 1, preset: 'small' }).flow.lanes[0].stages.every((s) => s.role !== 'researcher'));
  });
  test('conditions add roles by file path; pasted links parse', () => {
    const { flow } = flowWith({ version: 1 });
    assert.deepEqual(requiredFor(flow, 'no-screen', ['src/auth/login.js']), ['chief-of-staff', 'librarian', 'qa', 'security']);
    assert.deepEqual(requiredFor(flow, 'no-screen', ['db/migrations/1.sql']), ['chief-of-staff', 'librarian', 'qa', 'tech-lead']);
    assert.deepEqual(requiredFor(flow, 'hotfix', ['src/auth/login.js']), []);
    assert.equal(parseSource('https://github.com/anthropics/skills/tree/main/skills/pdf').kind, 'Skill folder');
    assert.equal(parseSource('https://gitlab.com/x/y').ok, false);
  });
});

describe('pre-push follows the flow', () => {
  let base;
  test('setup: commit a flow with a custom light lane and push it (it becomes the accepted flow)', () => {
    write('.bootstrap/flow.json', JSON.stringify({ version: 1, preset: 'full', lanes: [
      { id: 'light', name: 'Light', when: 'docs-like code', stages: [{ kind: 'stage', role: 'builder', title: 'Build' }, { kind: 'gate', gate: 'dev', title: 'Push to dev' }], dev_signoffs: ['tech-lead', 'chief-of-staff'], live_word: 'release' },
    ] }, null, 2));
    base = commit('flow with light lane');
  });
  test('a piece on the light lane needs only its lane sign-offs', () => {
    write('src/app.js', 'export const a = 2;\n');
    const code = commit('code');
    onLane('P1', 'light');
    sign('P1', 'tech-lead', code);
    let tip = commit('docs: tl');
    assert.match(push(tip, base)[0] || '', /no complete sign-off/);
    sign('P1', 'chief-of-staff', code);
    tip = commit('docs: cos');
    assert.deepEqual(push(tip, base), []);
    base = tip;
  });
  test('a condition adds Security when the piece touches auth files', () => {
    write('src/auth/login.js', 'export const x = 1;\n');
    const code = commit('auth code');
    onLane('P2', 'light');
    sign('P2', 'tech-lead', code); sign('P2', 'chief-of-staff', code);
    let tip = commit('docs: signoffs');
    assert.match(push(tip, base)[0] || '', /no complete sign-off/);
    sign('P2', 'security', code);
    tip = commit('docs: security');
    assert.deepEqual(push(tip, base), []);
    base = tip;
  });
  test('a push that loosens the flow is judged by the flow already accepted', () => {
    write('.bootstrap/flow.json', JSON.stringify({ version: 1, lanes: [{ id: 'light', dev_signoffs: ['chief-of-staff'] }] }));
    write('src/app.js', 'export const a = 3;\n');
    const code = commit('loosen flow + code');
    onLane('P3', 'light');
    sign('P3', 'chief-of-staff', code);
    const tip = commit('docs: cos only');
    assert.match(push(tip, base)[0] || '', /no complete sign-off/, 'the remote flow still requires Tech Lead');
    sh(['reset', '-q', '--hard', base]);
  });
  test('only Hotfix may use an exempt lane', () => {
    write('src/app.js', 'export const a = 4;\n');
    const code = commit('code');
    onLane('P4', 'hotfix');
    sign('P4', 'qa', code);
    const tip = commit('docs: exempt lane');
    assert.match(push(tip, base, 'builder')[0] || '', /no complete sign-off/);
    sh(['reset', '-q', '--hard', base]);
  });
});

describe('guard knows custom sessions from the flow', () => {
  test('a custom session gets its write scope from flow.json', () => {
    const fp = join(repo, '.bootstrap', 'flow.json');
    const before = readFileSync(fp, 'utf8');
    writeFileSync(fp, JSON.stringify({ version: 1, roles: { 'data-engineer': { name: 'Data Engineer', job: 'Pipelines', write_globs: ['pipelines/**', 'docs/**'] } } }));
    writeFileSync(join(repo, '.bootstrap', 'session.json'), JSON.stringify({ role: 'data-engineer' }));
    assert.equal(decide({ tool: 'Write', filePath: 'pipelines/load.py', cwd: repo }).allow, true);
    assert.equal(decide({ tool: 'Write', filePath: 'src/app.js', cwd: repo }).allow, false);
    writeFileSync(fp, before);
  });
});

describe('editor server', () => {
  let srv, port, token;
  before(async () => {
    const m = makeServer({ root: repo });
    srv = m.server; token = m.token;
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    port = srv.address().port;
  });
  after(() => srv.close());
  const call = (path, { method = 'GET', body, tok = token, host } = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { 'x-flow-token': tok, 'content-type': 'application/json', ...(host ? { host } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });

  test('page needs the token; API needs the token header', async () => {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 403);
    const page = await fetch(`http://127.0.0.1:${port}/?t=${token}`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(token));
    assert.equal((await call('/api/state', { tok: 'wrong' })).status, 403);
    const st = await (await call('/api/state')).json();
    assert.equal(st.mode, 'project');
    assert.ok(st.flow.lanes.length >= 4);
  });
  test('a foreign Host header is refused (DNS rebinding), even with the token', async () => {
    const { request } = await import('node:http');
    const status = await new Promise((ok, bad) => {
      const r = request({ host: '127.0.0.1', port, path: '/api/state', headers: { host: 'evil.example:80', 'x-flow-token': token } }, (res) => { res.resume(); ok(res.statusCode); });
      r.on('error', bad); r.end();
    });
    assert.equal(status, 403);
  });
  test('/api/simulate answers with the same logic, for the flow being edited', async () => {
    const r = await (await call('/api/simulate', { method: 'POST', body: { project: { version: 1 }, condIds: ['sensitive'] } })).json();
    assert.equal(r.lane, 'high');
    assert.ok(r.required.includes('security'));
    assert.equal((await call('/api/simulate', { method: 'POST', tok: 'nope', body: {} })).status, 403);
  });
  test('save refuses a flow with errors, accepts a valid one and writes flow.md', async () => {
    const bad = await call('/api/save', { method: 'POST', body: { project: { version: 1, lanes: [{ id: 'x', name: 'X', stages: [{ kind: 'gate', gate: 'live', title: 'l' }], dev_signoffs: [], live_word: '' }] } } });
    assert.equal(bad.status, 409);
    const good = await call('/api/save', { method: 'POST', body: { project: { version: 1, preset: 'full', roles: { builder: { sources: ['obra/superpowers'] } } } } });
    assert.equal(good.status, 200);
    assert.match(readFileSync(join(repo, 'docs', 'flow.md'), 'utf8'), /```mermaid/);
    assert.match(readFileSync(join(repo, '.bootstrap', 'flow.json'), 'utf8'), /obra\/superpowers/);
  });
});

describe('canvas: side-by-side steps and the simulator', () => {
  test('with_previous groups session steps into one column; gates and words stay alone', () => {
    const { flow } = flowWith({ version: 1 });
    const l = JSON.parse(JSON.stringify(flow.lanes.find((x) => x.id === 'normal')));
    const build = l.stages.findIndex((x) => x.title === 'Build');
    l.stages[build].with_previous = true;
    l.stages[build + 1].with_previous = true; // the checkpoint: must not join the group
    const cols = columns(l).map((c) => c.map((e) => e.s.title));
    assert.deepEqual(cols.find((c) => c.length > 1), ['Acceptance checks', 'Build']);
    assert.ok(cols.some((c) => c.length === 1 && c[0] === 'Push to dev'));
  });
  test('docs/flow.md fans side-by-side steps out and back in', () => {
    const { flow } = flowWith({ version: 1, lanes: [{ id: 'hotfix', stages: [
      { kind: 'stage', role: 'hotfix', title: 'Fix' }, { kind: 'stage', role: 'qa', title: 'Check', with_previous: true },
      { kind: 'word', word: 'apply', title: 'apply' }, { kind: 'gate', gate: 'live', title: 'Live' }] }] });
    const md = renderMarkdown(flow);
    assert.match(md, /s0 --> s2/); assert.match(md, /s1 --> s2/);
  });
  test('simulate: auth + screen → HIGH, Design added, words include go and approve; docs-only skips', () => {
    const { flow } = flowWith({ version: 1 });
    const r = simulate(flow, { condIds: ['sensitive', 'screens'] });
    assert.equal(r.lane, 'high');
    assert.deepEqual(r.added, ['design']);
    assert.ok(r.required.includes('security') && r.required.includes('design'));
    assert.ok(r.words.includes('go') && r.words.includes('approve') && r.words.includes('release'));
    assert.equal(simulate(flow, { condIds: [] }).lane, 'no-screen');
    assert.equal(simulate(flow, { docsOnly: true }).docsOnly, true);
  });
  test('simulate agrees with requiredFor (the push check) for the same lane and files', () => {
    const { flow } = flowWith({ version: 1 });
    const r = simulate(flow, { condIds: ['sensitive'], laneId: 'normal' });
    assert.deepEqual([...r.required].sort(), requiredFor(flow, 'normal', ['src/auth/login.js']));
  });
});

describe('company defaults folder', () => {
  test('company init + a project extending it by path', () => {
    const dir = join(repo, 'agent-defaults');
    const r = spawnSync(process.execPath, [join(KIT, 'bin', 'bootstrap.mjs'), 'company', 'init', dir, '--name', 'Acme'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    writeFileSync(join(repo, '.bootstrap', 'flow.json'), JSON.stringify({ version: 1, extends: './agent-defaults/company.json', lanes: [{ id: 'normal', dev_signoffs: ['qa'] }] }));
    const layers = loadLayers(repo);
    const flow = merge(layers);
    assert.equal(flow.company.name, 'Acme');
    assert.ok(flow.lanes.find((l) => l.id === 'normal').dev_signoffs.includes('tech-lead'));
    assert.ok(validate(layers, flow).some((f) => f.level === 'error' && /Acme defaults require it/.test(f.msg)));
  });
});
