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
  // Governed by build-and-release.md / testing.md too (review #33):
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

// A release is bookkeeping, not new behaviour, and its commit necessarily
// touches two WATCHED paths — changesets/action consumes every .changeset/*.md
// and bumps package.json's version. Counting those made EVERY release fail this
// check on the merge commit, which blocks the publish job behind it: 0.4.1 sat
// merged-but-unpublished on a red main until this was found. So:
//
//   - .changeset/ DELETIONS don't count. Adding a changeset can mean new
//     user-facing behaviour; consuming one is the release doing its job.
//   - package.json counts only if something other than `version` changed.
//     Scripts, size-limit, exports and files all still trigger the check.
//
// Both are narrow on purpose: the guard exists because these paths really do
// govern documented behaviour, and the fix must not blunt that. The deletion
// exemption in particular is scoped to .changeset/ ONLY — a blanket
// `--diff-filter=d` here once let a deletion-only source or workflow commit
// pass, so a release could publish while the wiki documented removed
// behaviour (0.4.1 review #6). Deleting code changes documented behaviour as
// surely as adding it.
const changed = git('diff', '--name-status', `${lastSync}..HEAD`, '--', ...WATCHED)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const parts = line.split('\t');
    // Renames/copies (`R100\told\tnew`) carry two paths; the last is the one
    // that exists at HEAD.
    return { status: parts[0][0], path: parts[parts.length - 1] };
  })
  .filter(({ status, path }) => !(status === 'D' && path.startsWith('.changeset/')))
  .map(({ path }) => path)
  .filter((f) => f !== 'package.json' || packageJsonChangedBeyondVersion(lastSync));

function packageJsonChangedBeyondVersion(base) {
  const strip = (src) => {
    try {
      const { version, ...rest } = JSON.parse(src);
      return JSON.stringify(rest);
    } catch {
      return src; // unparseable — fall back to treating it as changed
    }
  };
  // Both sides read from COMMITS, matching the `${base}..HEAD` diff above.
  // Reading the working tree here instead would make the result depend on
  // uncommitted edits while the file list did not — the two halves of one
  // check disagreeing about what they are comparing.
  let before, after;
  try {
    before = git('show', `${base}:package.json`);
    after = git('show', 'HEAD:package.json');
  } catch {
    return true; // absent on either side — can't compare, so assume material
  }
  return strip(before) !== strip(after);
}

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
