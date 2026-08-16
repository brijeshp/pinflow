import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Commit-backed, because the thing under test is a property of the git LOG,
// not of a string: 9a33558 reached main red with every branch gate green, since
// GitHub's merge button writes a subject that does not exist until the merge
// happens. A unit test over a regex could not have caught that; a test that
// actually merges a branch can.

const SCRIPT = join(__dirname, '../../scripts/provenance-check.mjs');
let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function commit(message: string): void {
  writeFileSync(join(repo, `f${Math.random().toString(36).slice(2)}.txt`), 'x');
  git('add', '-A');
  git('commit', '-m', message);
}

/**
 * Runs the real script against the temp repo. `spawnSync`, not `execFileSync`:
 * the warning path writes to stderr and exits 0, and execFileSync's return
 * value is stdout only — so a success-path warning would be invisible to the
 * test that exists to assert it.
 */
function check(): { code: number; out: string } {
  const r = spawnSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'prov-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'x@y.z');
  git('config', 'user.name', 'Test');
  commit('chore: initial');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('provenance-check — what the invariant governs', () => {
  it('passes a clean log', () => {
    commit('feat(scope): say when members are a slice of a repeated set');
    expect(check().code).toBe(0);
  });

  it.each([
    ['a Co-Authored-By trailer', 'feat: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>'],
    ['a "generated with" line', 'feat: thing\n\nGenerated with Claude Code'],
    ['an assistant named in the subject', 'fix: apply Claude review feedback'],
    ['another tool named in the subject', 'fix: apply codex review feedback'],
    ['a hand-written merge subject naming a tool', "Merge claude's branch into main"],
    ['a near-miss merge subject', 'Merge PR #12 from brijeshp/claude/work'],
  ])('fails on %s', (_why, message) => {
    commit(message);
    const { code, out } = check();
    expect(code).toBe(1);
    expect(out).toContain('AI-agent attribution');
  });

  it('still allows the repo to cite its own .claude/ paths', () => {
    commit('chore: move .claude/skills/wiki-update into the pack');
    expect(check().code).toBe(0);
  });
});

describe('provenance-check — the GitHub merge-subject exemption', () => {
  // The regression. Reproduced the way it actually happened: a branch whose
  // NAME carries the tool, merged with --no-ff so git writes GitHub's subject.
  function mergeToolNamedBranch(subject = 'Merge pull request #12 from acme/claude/some-work') {
    git('checkout', '-q', '-b', 'claude/some-work');
    commit('feat: real work with a clean message');
    git('checkout', '-q', 'main');
    git('merge', '--no-ff', 'claude/some-work', '-m', subject);
  }

  it('passes when only the branch ref carries the tool name', () => {
    mergeToolNamedBranch();
    expect(check().code).toBe(0);
  });

  it('warns rather than passing silently, so the branch naming gets fixed', () => {
    mergeToolNamedBranch();
    const { out } = check();
    expect(out).toContain('branch ref, not attribution');
    expect(out).toContain('Name branches without tool names');
  });

  it('does NOT exempt the body of a merge commit', () => {
    git('checkout', '-q', '-b', 'feature');
    commit('feat: real work');
    git('checkout', '-q', 'main');
    git(
      'merge',
      '--no-ff',
      'feature',
      '-m',
      'Merge pull request #12 from acme/feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
    const { code, out } = check();
    expect(code).toBe(1);
    expect(out).toContain('AI-agent attribution');
  });

  it('does not exempt a merge subject that is not GitHub’s template', () => {
    git('checkout', '-q', '-b', 'claude/other');
    commit('feat: real work');
    git('checkout', '-q', 'main');
    // No "pull request #N from" — a hand-rolled subject must stay governed.
    git('merge', '--no-ff', 'claude/other', '-m', 'Merge branch claude/other into main');
    expect(check().code).toBe(1);
  });

  it('exempts only the subject line, never a trailing paragraph after it', () => {
    git('checkout', '-q', '-b', 'claude/third');
    commit('feat: real work');
    git('checkout', '-q', 'main');
    git(
      'merge',
      '--no-ff',
      'claude/third',
      '-m',
      'Merge pull request #99 from acme/claude/third\n\nGenerated with an assistant',
    );
    expect(check().code).toBe(1);
  });
});
