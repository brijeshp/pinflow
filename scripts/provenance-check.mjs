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
 */
import { execFileSync } from 'node:child_process';

const ENFORCED_FROM = '2026-08-10T00:00:00Z';
// `claude` must not match the repo's own `.claude/` directory — commit
// messages legitimately cite paths like `.claude/worktrees` or
// `.claude/skills/...` (tool-INTEGRATION naming, which the policy allows).
// A dot immediately before the name marks a path segment; attribution never
// arrives dot-prefixed ("Claude Code", "Co-Authored-By: Claude ...").
const PATTERN = 'codex|(^|[^.])claude|copilot|cursor|co-authored-by|generated with';

const hits = execFileSync(
  'git',
  [
    'log',
    `--since=${ENFORCED_FROM}`,
    '--regexp-ignore-case',
    '--extended-regexp',
    `--grep=${PATTERN}`,
    '--format=%h %s',
  ],
  { encoding: 'utf8' },
).trim();

if (hits) {
  console.error('provenance-check: AI-agent attribution in commit messages (AGENTS.md invariant):');
  for (const line of hits.split('\n')) console.error(`  ${line}`);
  console.error('Reword these commits before merging — the log is immutable once pushed.');
  process.exit(1);
}
console.log('provenance-check: OK — no agent attribution in commit messages since enforcement.');
