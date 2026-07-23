#!/usr/bin/env node
/**
 * Wiki staleness check: fails when code has changed since docs/wiki/.last-sync.
 * Only code-shaped paths count — docs/plans/tests-content churn doesn't nag.
 * Update procedure: .claude/skills/wiki-update/SKILL.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MARKER = 'docs/wiki/.last-sync';
const WATCHED = [
  'src',
  'tsup.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'package.json',
  'tsconfig.json',
  // Governed by build-and-release.md / testing.md too (codex audit #33):
  '.github/workflows',
  '.changeset',
  'tests',
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

let lastSync;
try {
  lastSync = readFileSync(MARKER, 'utf8').trim();
} catch {
  console.error(`wiki-check: missing ${MARKER} — run the wiki-update procedure to create it.`);
  process.exit(1);
}

try {
  git('cat-file', '-e', `${lastSync}^{commit}`);
} catch {
  console.error(`wiki-check: ${MARKER} holds "${lastSync}", which is not a commit in this repo.`);
  process.exit(1);
}

const changed = git('diff', '--name-only', `${lastSync}..HEAD`, '--', ...WATCHED)
  .split('\n')
  .filter(Boolean);

if (changed.length === 0) {
  console.log(`wiki-check: OK — docs/wiki is in sync with ${lastSync.slice(0, 7)}.`);
  process.exit(0);
}

console.error(
  `wiki-check: docs/wiki is STALE — ${changed.length} code file(s) changed since ${lastSync.slice(0, 7)}:`,
);
for (const f of changed) console.error(`  - ${f}`);
console.error('Run the update procedure in .claude/skills/wiki-update/SKILL.md before merging.');
process.exit(1);
