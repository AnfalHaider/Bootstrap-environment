#!/usr/bin/env node
// Install (or refresh) the skill as a standalone personal skill, with the kit it runs, so it works
// without the plugin:  node scripts/install-skill.mjs [--dest <dir>]
// Default dest: <CLAUDE_CONFIG_DIR or ~/.claude>/skills/bootstrap-environment. The previous SKILL.md is
// kept as SKILL.md.bak-<time> next to it unless it is identical. Nothing outside dest is touched.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--dest');
const dest = i > 0 ? process.argv[i + 1] : join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills', 'bootstrap-environment');
const src = join(KIT, 'skills', 'bootstrap-environment');

mkdirSync(dest, { recursive: true });
const old = join(dest, 'SKILL.md');
if (existsSync(old) && readFileSync(old, 'utf8') !== readFileSync(join(src, 'SKILL.md'), 'utf8')) {
  const bak = join(dest, `SKILL.md.bak-${Date.now()}`);
  copyFileSync(old, bak);
  console.log(`BACKUP  ${bak}`);
}
copyFileSync(join(src, 'SKILL.md'), old);
// The skill's references and the kit that `bin/` paths in SKILL.md resolve against (kit root = dest).
for (const d of ['references', 'bin', 'flow', 'ui', 'roles', 'templates', 'githooks']) {
  const from = d === 'references' ? join(src, d) : join(KIT, d);
  rmSync(join(dest, d), { recursive: true, force: true });
  cpSync(from, join(dest, d), { recursive: true });
}
for (const f of ['package.json', 'CHANGELOG.md', 'LICENSE']) copyFileSync(join(KIT, f), join(dest, f));
const version = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8')).version;
console.log(`INSTALLED bootstrap-environment ${version} → ${dest}`);
