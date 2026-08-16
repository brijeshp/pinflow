#!/usr/bin/env node
/**
 * AGENTS.md provenance invariant, enforced on the artifact the policy names:
 * the commit log. File contents are covered by review greps; commit messages
 * are immutable once pushed, so the only durable protection is failing CI
 * before a violating commit reaches main (post-merge review F1/F6).
 *
 * ENFORCED_FROM scopes the check to commits authored after the policy's
 * enforcement date — earlier subjects on public main are documented
 * historical exceptions (see AGENTS.md), and a blanket scan would fail
 * forever on history nobody can rewrite without breaking every clone.
 *
 * Filtering happens HERE rather than in `git log --grep` because the merge
 * exemption below is a relationship between two parts of one message, which a
 * single ERE cannot express.
 */
import { execFileSync } from 'node:child_process';

const ENFORCED_FROM = '2026-08-10T00:00:00Z';

// `claude` must not match the repo's own `.claude/` directory — commit
// messages legitimately cite paths like `.claude/worktrees` or
// `.claude/skills/...` (tool-INTEGRATION naming, which the policy allows).
// A dot immediately before the name marks a path segment; attribution never
// arrives dot-prefixed ("Claude Code", "Co-Authored-By: Claude ...").
const ATTRIBUTION = /codex|(^|[^.])claude|copilot|cursor|co-authored-by|generated with/i;

// GitHub's merge button generates this subject VERBATIM, interpolating the head
// branch — so merging `claude/some-work` writes the branch name into a commit
// message on main that NO pre-merge gate can see: the branch's own log is clean
// right up until the merge creates the subject. That is how 9a33558 reached
// main red with every branch gate green.
//
// A branch ref echoed by the merge template is a workspace artifact, not the
// repo claiming AI authorship, so the SUBJECT of exactly this template is
// exempt. The exemption is deliberately narrow:
//
//   - it matches only GitHub's literal template, so a hand-written merge
//     subject like "Merge claude's branch" is still checked;
//   - it exempts the SUBJECT only — the body is always checked, so a
//     `Co-Authored-By:` trailer on a merge commit still fails;
//   - it is never silent. A suppressed hit prints a warning, because the fix
//     is to stop naming branches after tools, not to stop noticing.
const MERGE_TEMPLATE = /^Merge pull request #\d+ from [^\s/]+\/\S+$/;

// Unit/record separators, not NUL: node's execFile rejects any argument
// containing a null byte, so `--format=%h\x00...` throws before git runs.
// Both are control characters git will never emit from a commit message.
const FIELD = '\x1f';
const RECORD = '\x1e';

const log = execFileSync(
  'git',
  ['log', `--since=${ENFORCED_FROM}`, `--format=%h${FIELD}%s${FIELD}%b${RECORD}`],
  { encoding: 'utf8' },
);

const bad = [];
const noted = [];
for (const record of log.split(RECORD)) {
  if (!record.trim()) continue;
  const [sha = '', subject = '', body = ''] = record.replace(/^\s+/, '').split(FIELD);
  // The subject is governed unless it is GitHub's merge template; the body
  // always is.
  const governed = MERGE_TEMPLATE.test(subject) ? body : `${subject}\n${body}`;
  if (ATTRIBUTION.test(governed)) bad.push(`${sha} ${subject}`);
  else if (ATTRIBUTION.test(`${subject}\n${body}`)) noted.push(`${sha} ${subject}`);
}

if (noted.length) {
  console.warn(
    'provenance-check: tool name in a GitHub merge subject (branch ref, not attribution):',
  );
  for (const line of noted) console.warn(`  ${line}`);
  console.warn('Name branches without tool names so this does not recur.');
}

if (bad.length) {
  console.error('provenance-check: AI-agent attribution in commit messages (AGENTS.md invariant):');
  for (const line of bad) console.error(`  ${line}`);
  console.error('Reword these commits before merging — the log is immutable once pushed.');
  process.exit(1);
}
console.log('provenance-check: OK — no agent attribution in commit messages since enforcement.');
