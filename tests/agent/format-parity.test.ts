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

// Prose assertions run against whitespace-collapsed text. These files are
// hand-wrapped markdown, so a rule that happens to straddle a line break would
// otherwise fail for its formatting rather than its content — a false negative
// that reads exactly like real drift.
const flat = (p: string) => read(p).toLowerCase().replace(/\s+/g, ' ');

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

  // v4. The scope lines are the most authoritative in an artifact and the most
  // consequential to misread, so the same four rules have to hold in every
  // format — the drift this suite exists to catch would otherwise mean an
  // agent's willingness to edit outside a boundary depended on which file its
  // user happened to install.
  it.each(FORMATS)('%s teaches scope as a ceiling, not a grant', (path) => {
    const text = flat(path);
    expect(text).toContain('ceiling, not a grant');
  });

  it.each(FORMATS)('%s requires a boundary crossing to be reported', (path) => {
    const text = flat(path);
    expect(text).toMatch(/which boundary you crossed/);
  });

  // Was "makes the exclusion list binding". An exclusion is a bare coverage
  // ratio against a hand-drawn rectangle — geometry, not intent — while the
  // boundary beside it comes from a real containment test and gets an explicit
  // override clause. Making the weaker evidence absolute is backwards, and on
  // a region that sliced a repeated set it forbids the only coherent fix.
  // Every format must now scope it to its own note and give a DETERMINISTIC
  // default: "confirm first" has no addressee in a no-round-trip pipeline.
  it.each(FORMATS)('%s scopes the exclusion list to its own note, with a default', (path) => {
    const text = flat(path);
    expect(text).toContain('**do not change:**');
    expect(text).toMatch(/grazed/);
    expect(text).toMatch(/this note alone|for that note alone|only for the note/);
    expect(text).toMatch(/prefer leaving/);
    expect(text).not.toMatch(/never edit (one )?(of those )?to satisfy a note/);
  });

  it.each(FORMATS)('%s marks the source hint unverified', (path) => {
    const text = flat(path);
    expect(text).toContain('unverified');
    expect(text).toMatch(/not a path to open on trust|never a path to open on trust/);
  });

  it.each(FORMATS)('%s says a scopeless artifact is old, not broken', (path) => {
    const text = flat(path);
    expect(text).toMatch(/older artifacts carry no scope|no scope lines are older/);
  });
});
