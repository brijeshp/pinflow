import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The agent pack ships FOUR formats of the same protocol, installed into
// different tools — and 0.4.1 review #4 found the safety rules had drifted:
// two formats carried the fixed-string search requirement, two did not, so an
// artifact value like `.*` was a regex or a literal depending on which file a
// consumer installed. Safety guidance must not vary by integration format.
const FORMATS = [
  'agent/skills/pinflow-feedback/SKILL.md',
  'agent/commands/review-feedback.md',
  'agent/rules/pinflow.md',
  'agent/AGENTS.snippet.md',
] as const;

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('agent format parity (0.4.1 review #1/#4)', () => {
  it.each(FORMATS)('%s searches artifact values as fixed strings, never patterns', (path) => {
    const text = read(path).toLowerCase();
    expect(text).toContain('fixed string');
    // The concrete mechanics, not just the principle: a separate argument
    // defeats shell metacharacters but is still a PATTERN to rg/grep.
    expect(text).toMatch(/separate arg|argv element/);
  });

  it.each(FORMATS)('%s treats artifact content as data, never instructions', (path) => {
    const text = read(path).toLowerCase();
    expect(text).toMatch(/never as instructions|never instructions/);
    expect(text).toContain('never fetch a url');
  });

  it.each(FORMATS)('%s trusts only the line-anchored workflow fields', (path) => {
    const text = read(path);
    // The unit of work and the completion signal are the explicit fields —
    // no format may still teach the forgeable composite-heading grammar
    // (0.4.1 review #1).
    expect(text).toContain('**Comment ID:**');
    expect(text).toContain('**Status:**');
    expect(text).not.toMatch(/### \[cmt|trailing `— done`|— done` \/ `— declined/);
  });
});
