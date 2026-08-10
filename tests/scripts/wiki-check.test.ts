import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Commit-backed tests for the release guard itself (0.4.1 review #6): the
// old `--diff-filter=d` suppressed DELETIONS across every watched path, so a
// commit that only deleted a source file, test, or workflow passed wiki:check
// and the release could publish while the wiki documented removed behaviour.
// The deletion exemption exists solely for consumed .changeset files.

const SCRIPT = join(__dirname, '../../scripts/wiki-check.mjs');
let repo: string;

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: repo, encoding: 'utf8' });
}

function git(...args: string[]): string {
  return sh('git', [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    '-c',
    'commit.gpgsign=false',
    ...args,
  ]);
}

function commit(msg: string): string {
  git('add', '-A');
  git('commit', '-m', msg, '--allow-empty');
  return git('rev-parse', 'HEAD').trim();
}

function markerTo(sha: string): void {
  writeFileSync(join(repo, 'docs/wiki/.last-sync'), `${sha}\n`);
  commit('docs(wiki): marker');
}

function wikiCheck(): { ok: boolean; out: string } {
  try {
    const out = execFileSync('node', [join(repo, 'scripts/wiki-check.mjs')], {
      cwd: repo,
      encoding: 'utf8',
    });
    return { ok: true, out };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'wiki-check-'));
  git('init', '-q');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'docs/wiki'), { recursive: true });
  mkdirSync(join(repo, '.changeset'), { recursive: true });
  mkdirSync(join(repo, '.github/workflows'), { recursive: true });
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(repo, 'scripts/wiki-check.mjs'));
  writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, '.changeset/pending.md'), '---\n---\nfeat\n');
  writeFileSync(join(repo, '.github/workflows/ci.yml'), 'name: ci\n');
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ version: '1.0.0', x: 1 }));
  const base = commit('base');
  markerTo(base);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('wiki-check deletion handling (0.4.1 review #6)', () => {
  it('passes when nothing watched changed', () => {
    expect(wikiCheck().ok).toBe(true);
  });

  it('FAILS on a deletion-only source commit', () => {
    rmSync(join(repo, 'src/a.ts'));
    commit('remove feature');
    const r = wikiCheck();
    expect(r.ok).toBe(false);
    expect(r.out).toContain('src/a.ts');
  });

  it('FAILS on a deletion-only workflow commit', () => {
    rmSync(join(repo, '.github/workflows/ci.yml'));
    commit('remove workflow');
    expect(wikiCheck().ok).toBe(false);
  });

  it('passes when a release consumes changesets (deletion + version-only bump)', () => {
    rmSync(join(repo, '.changeset/pending.md'));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ version: '1.1.0', x: 1 }));
    commit('Version Packages');
    expect(wikiCheck().ok).toBe(true);
  });

  it('FAILS when a changeset is ADDED', () => {
    writeFileSync(join(repo, '.changeset/new-feature.md'), '---\n---\nfeat\n');
    commit('add changeset');
    expect(wikiCheck().ok).toBe(false);
  });

  it('FAILS on a non-version package.json edit', () => {
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ version: '1.0.0', x: 2 }));
    commit('change scripts');
    expect(wikiCheck().ok).toBe(false);
  });
});
