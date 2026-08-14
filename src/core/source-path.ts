// `data-pinflow-source` is page-author-controlled text that an artifact renders
// as a path an agent will OPEN. That makes it the only field in the product
// where escaping is not enough: a perfectly-escaped `CLAUDE.md` still names a
// real file, and rung (a) would hand it to the agent with high confidence —
// which edits the file governing its own behaviour, persists across sessions,
// and taints every future artifact.
//
// So the rule is a POSITIVE charset, not a negative list, and the verdict is
// binary: a value either passes whole or is dropped whole. Never repaired —
// a repaired path is a path nobody wrote, pointing somewhere nobody chose.
//
// Lives in its own module, not in scope.ts, because all three call sites need
// it and two of them must not import the engine: `export.ts` is DOM-free by
// contract (hosts run it server-side) and `storage.ts` is the hydration
// boundary. Pure string logic, no DOM, no imports.

// One rule excludes NUL, every control character, and every non-ASCII
// codepoint — which is what kills fullwidth-dot traversal (U+FF0E), RTL
// overrides, zero-width joiners and tag smuggling in a single test. It also
// excludes `\` (Windows and UNC paths), `:` (drive letters, URL schemes),
// `%` (encoded traversal), `~` (home expansion), `*`/`?` (globs), and every
// shell and markdown metacharacter.
const CHARSET = /^[A-Za-z0-9._\-/]+$/;

// Extensions a source hint may plausibly name. Deliberately EXCLUDES .md,
// .json, .yml and .sh: an agent-instruction file, a lockfile-adjacent config
// and a script are the three shapes an attacker wants, and no legitimate
// "which component is this" hint needs them.
const EXTENSIONS = new Set(
  'ts tsx js jsx mjs cjs vue svelte astro css scss sass less html htm py rb go rs java kt swift php erb hbs'.split(
    ' ',
  ),
);

// Belt-and-braces over the extension list: an agent-instruction file renamed
// to a permitted extension is still an agent-instruction file.
const DENY = /^(claude|agents?|gemini|copilot-instructions)$/i;

const MAX = 120;

/**
 * Returns the path unchanged if it is a plausible, non-hostile repo-relative
 * source path; `null` otherwise. Never returns a modified string.
 */
export function validateSourcePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > MAX || !CHARSET.test(v)) return null;
  // Absolute paths address the machine, not the repo.
  if (v.startsWith('/')) return null;
  const segments = v.split('/');
  for (const s of segments) {
    // Empty ("a//b"), current, parent, hidden (.env, .git, .ssh, .claude),
    // argv-shaped (-rf), or trailing-dot (a Windows short-name trick).
    if (!s || s === '.' || s === '..' || s.startsWith('.') || s.startsWith('-') || s.endsWith('.'))
      return null;
  }
  const file = segments[segments.length - 1]!;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null; // no extension at all
  if (!EXTENSIONS.has(file.slice(dot + 1).toLowerCase())) return null;
  if (DENY.test(file.slice(0, dot))) return null;
  return v;
}
