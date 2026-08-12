import { getCssPath, getTestId, getTextFingerprint } from './selector';
import { EXCLUDED_CAP, LABEL_MAX, MEMBER_CAP } from './scope-limits';
import { validateSourcePath } from './source-path';
import type { ChangeNode, Scope, ScopeConfidence, ScopeNode, ScopeRung } from './types';

// The scope engine. Three modules divide the same problem by cardinality and
// by time: `selector.ts` is one element ⇄ durable strings ACROSS renders (it
// reads no geometry, deliberately); `anchor.ts` is one element → record at ONE
// instant; this file is region → element SET at one instant.
//
// Two contracts hold this file in place:
//   • It must not import `Comment` or `Anchor` — scope is a property of a
//     region, not of a comment, and keeping it ignorant of the record shape is
//     what lets `export.ts` stay DOM-free.
//   • `export.ts` must never import THIS file. Scope is stored, not derived at
//     export time; a host rendering an artifact server-side has no DOM.
//
// ⛔ ZERO `_`-prefixed identifiers in this file, enforced by a test against the
// source. tsup mangles `/^_/`, but only on DOTTED access — `storage.ts` reads
// untrusted records with QUOTED access, so a `_`-prefixed persisted key would
// have the writer emit `t` while the validator still reads `_x`, failing every
// record silently. Mangled names are also frequency-derived PER ENTRY POINT,
// and the IIFE and ESM builds write the same localStorage key; and `dts` is a
// separate rollup pass that never sees the mangler, so the published types
// would lie while the type test passed. CI green, package wrong.

/**
 * Tuning generation for every threshold in this file. Bump it whenever a band,
 * cap, or confidence rule changes — records carry it so a later reader can
 * tell which tuning produced a given `confidence`.
 */
export const SCOPE_GEN = 1;

// Coverage bands. `inside` matches Miro's "Precise selection" (the only
// production tool shipping an area ratio at all); `partial` is the ambiguity
// floor below which a node is grazed and excluded rather than changed.
const INSIDE = 0.9;
const PARTIAL = 0.35;

// Caps. Members and exclusions are what an agent reads; depth and nodes bound
// the walk itself. A cap that trips demotes confidence — a truncated answer
// must never look as certain as a complete one. The record-shape caps live in
// scope-limits.ts because storage.ts revalidates against the same numbers.
const DEPTH_CAP = 12;
const NODE_CAP = 1500;
const SIBLING_SCAN = 40;

// A candidate boundary this large is not a boundary. Both predicates are
// SHARES, never an element-name blocklist: `<div id="root">` wraps the whole
// app and passes any name test.
const MAX_DESCENDANT_SHARE = 0.5;
const MAX_VIEWPORT_SHARE = 0.9;

// Tags that can never be a pin target. Matched against an uppercased tagName
// so SVG and XHTML documents are covered too.
const SKIP_TAGS = new Set(
  'SCRIPT STYLE HEAD META LINK TITLE NOSCRIPT TEMPLATE BR WBR OPTION SOURCE TRACK PARAM COL DEFS'.split(
    ' ',
  ),
);

const LANDMARK_TAGS = new Set(
  'MAIN NAV HEADER FOOTER ASIDE SECTION ARTICLE FORM DIALOG FIGURE'.split(' '),
);

const LANDMARK_ROLES = new Set(
  'main navigation banner contentinfo complementary region form search dialog'.split(' '),
);

// Stripped at CAPTURE, not at render: the value flows into localStorage, the
// JSON export and the host's `onChange` payload, all of which bypass the
// markdown escapers entirely. Control chars, zero-width and BOM, bidi
// overrides and isolates, and the Unicode tag block (invisible instruction
// smuggling).
const INVISIBLE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;

/** A drawn region in viewport coordinates. */
export interface ScopeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The record plus the live element refs that produced it, from ONE walk.
 *
 * The refs exist so the outline paints exactly what was stored and can never
 * disagree with it. They are for the composer's lifetime only — never
 * persisted, never held past it.
 */
export interface ScopeResult {
  scope: Scope;
  elements: { boundary: Element; members: Element[]; excluded: Element[] };
}

function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const out = value.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
  return out || undefined;
}

function describe(el: Element): ScopeNode {
  const node: ScopeNode = { tag: el.tagName.toLowerCase(), css: getCssPath(el) };
  const testid = getTestId(el);
  if (testid) node.testid = testid;
  const label = clean(
    el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? getTextFingerprint(el),
  );
  if (label) node.label = label;
  return node;
}

function area(r: ScopeRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function intersect(a: ScopeRect, b: ScopeRect): ScopeRect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  return {
    left,
    top,
    width: Math.min(a.left + a.width, b.left + b.width) - left,
    height: Math.min(a.top + a.height, b.top + b.height) - top,
  };
}

function boxOf(el: Element): ScopeRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function skip(el: Element): boolean {
  return (
    SKIP_TAGS.has(el.tagName) ||
    el.hasAttribute('data-pinflow-ignore') ||
    el.hasAttribute('data-pinflow-root')
  );
}

function isLandmark(el: Element): boolean {
  if (LANDMARK_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute('role');
  return role !== null && LANDMARK_ROLES.has(role.toLowerCase());
}

// The structural signature is the primary test and reads no classes at all,
// which is the whole point: the plan's word-like class filter
// (`/^[a-z\-]{3,}$/i`) fails on `gap-4`, `w-1/2` and `md:flex` — i.e. it is
// blind in exactly the Tailwind output this rung targets — while the utility
// soup that DOES pass is shared by every div on the page. Child-tag sequence
// is class-independent and is what the data-record-mining literature actually
// uses. Class overlap survives only as a fallback for childless elements.
function signature(el: Element): string {
  let sig = el.tagName;
  const kids = el.children;
  for (let i = 0; i < kids.length && i < 8; i++) sig += ',' + kids[i]!.tagName;
  return sig;
}

function classOverlap(a: Element, b: Element): number {
  const left = new Set(Array.from(a.classList));
  const right = Array.from(b.classList);
  if (!left.size || !right.length) return 0;
  let shared = 0;
  const union = new Set(left);
  for (const token of right) {
    if (left.has(token)) shared++;
    union.add(token);
  }
  return shared / union.size;
}

// Two OTHER matching siblings, not one: a header/main pair shares a wrapper
// and a utility class set without either being an instance of anything.
function isRepeated(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  const sig = signature(el);
  const childless = el.children.length === 0;
  let matches = 0;
  const kids = parent.children;
  for (let i = 0; i < kids.length && i < SIBLING_SCAN; i++) {
    const sib = kids[i]!;
    if (sib === el || sib.tagName !== el.tagName) continue;
    if (childless ? classOverlap(sib, el) >= 0.6 : signature(sib) === sig) matches++;
    if (matches >= 2) return true;
  }
  return false;
}

function sourceOf(el: Element): string | null {
  return validateSourcePath(el.getAttribute('data-pinflow-source'));
}

/** The rung an element satisfies in its own right, without climbing. */
function rungOf(el: Element): ScopeRung {
  if (sourceOf(el)) return 'source';
  if (getTestId(el)) return 'testid';
  if (isRepeated(el)) return 'repeated';
  if (isLandmark(el)) return 'landmark';
  return 'anchor';
}

const CONFIDENCE: Record<ScopeRung, ScopeConfidence> = {
  source: 'high',
  testid: 'high',
  repeated: 'medium',
  landmark: 'medium',
  anchor: 'low',
};

function isRoot(el: Element | null): el is null {
  return el === null || el === document.body || el === document.documentElement;
}

/**
 * The scope ladder, strongest rung first: (a) `data-pinflow-source`,
 * (b) `data-testid` ancestor, (c) repeated-sibling signature,
 * (d) landmark/sectioning container, (e) none — the element itself.
 *
 * ONE upward pass records the nearest hit per rung, then rung strength picks
 * the winner: a far `data-pinflow-source` beats a near `data-testid`, because
 * the host declared the former on purpose.
 *
 * Exported so `anchor.ts` consumes the same primitive. `anchorTarget` IS rung
 * (b) implemented separately and without a depth cap — leaving it that way
 * would put a hole in the never-`<body>` guarantee exactly the width of the
 * fifth rung.
 */
export function climb(el: Element): { el: Element; rung: ScopeRung } {
  const hits = new Map<ScopeRung, Element>();
  let depth = 0;
  for (let cur: Element | null = el; !isRoot(cur) && depth < DEPTH_CAP; cur = cur.parentElement) {
    depth++;
    if (skip(cur)) continue;
    if (!hits.has('source') && sourceOf(cur)) hits.set('source', cur);
    if (!hits.has('testid') && getTestId(cur)) hits.set('testid', cur);
    if (!hits.has('repeated') && isRepeated(cur)) hits.set('repeated', cur);
    if (!hits.has('landmark') && isLandmark(cur)) hits.set('landmark', cur);
  }
  for (const rung of ['source', 'testid', 'repeated', 'landmark'] as const) {
    const hit = hits.get(rung);
    if (hit) return { el: hit, rung };
  }
  return { el, rung: 'anchor' };
}

// A boundary this large is the page, not a boundary. Share of the document's
// elements OR share of the viewport — either alone is defeatable (a tall
// scrolling list fails the viewport test; a sparse hero fails the descendant
// test).
function tooWide(el: Element): boolean {
  const total = document.getElementsByTagName('*').length;
  if (total && el.getElementsByTagName('*').length / total > MAX_DESCENDANT_SHARE) return true;
  const viewport = window.innerWidth * window.innerHeight;
  return viewport > 0 && area(boxOf(el)) / viewport > MAX_VIEWPORT_SHARE;
}

interface Walk {
  members: Element[];
  excluded: Element[];
  bands: Map<Element, 'inside' | 'partial'>;
  visits: number;
  truncated: boolean;
}

// Top-down with early stop. Three cards in a grid → all three children score
// `inside` → emit three and DO NOT recurse. A nested grid emits the inner
// grids, which is "emit outermost" for free. A marquee drawn in a container's
// padding grazes every child and emits nothing — the hollow-shape rule, with
// no rule written for it.
//
// The one case the naive version loses: a huge, barely-covered wrapper holding
// a fully-covered card. Recursion is therefore driven by INTERSECTION, not by
// band — an element is only excluded once it and its whole subtree have failed
// to produce anything. That is also what makes the exclusion-set invariant
// structural: an ancestor of an emitted node always reports EMITTED, so it can
// never reach the exclusion branch.
function visit(el: Element, clip: ScopeRect, region: ScopeRect, depth: number, w: Walk): boolean {
  if (skip(el)) return false;
  if (++w.visits > NODE_CAP) {
    w.truncated = true;
    return false;
  }
  const box = intersect(boxOf(el), clip);
  const own = area(box);
  // Zero area joins no band AND no exclusion set. 0/0 is NaN and NaN >= 0.35
  // is false, so an unguarded divisor drops a zero-area node into the
  // EXCLUSION list — letting a hostile page author a free "do not change" line.
  if (own <= 0) return false;
  const coverage = area(intersect(box, region)) / own;
  if (coverage <= 0) return false;

  if (coverage >= INSIDE) {
    if (w.members.length >= MEMBER_CAP) {
      w.truncated = true;
      return true;
    }
    w.members.push(el);
    w.bands.set(el, 'inside');
    return true;
  }

  let emitted = false;
  if (depth < DEPTH_CAP) {
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      if (visit(kids[i]!, box, region, depth + 1, w)) emitted = true;
    }
  }
  if (emitted) return true;

  if (coverage >= PARTIAL) {
    if (w.members.length >= MEMBER_CAP) {
      w.truncated = true;
      return true;
    }
    w.members.push(el);
    w.bands.set(el, 'partial');
    return true;
  }
  if (w.excluded.length < EXCLUDED_CAP) w.excluded.push(el);
  return false;
}

// The siblings bracketing an empty region, in document order. An insertion
// names a gap, so the container is deliberately NOT outlined and NOT claimed
// as changed — asserting a boundary the reviewer did not draw.
function bracket(boundary: Element, region: ScopeRect): { before?: Element; after?: Element } {
  const bottom = region.top + region.height;
  let before: Element | undefined;
  let after: Element | undefined;
  const kids = boundary.children;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]!;
    if (skip(kid)) continue;
    const box = boxOf(kid);
    if (area(box) <= 0) continue;
    if (box.top + box.height <= region.top) before = kid;
    else if (!after && box.top >= bottom) after = kid;
  }
  const out: { before?: Element; after?: Element } = {};
  if (before) out.before = before;
  if (after) out.after = after;
  return out;
}

// The smallest ancestor whose box fully contains the drawn region.
function containerFor(target: Element, region: ScopeRect): Element | null {
  const right = region.left + region.width;
  const bottom = region.top + region.height;
  for (let cur: Element | null = target; !isRoot(cur); cur = cur.parentElement) {
    const b = boxOf(cur);
    if (
      b.left <= region.left &&
      b.top <= region.top &&
      b.left + b.width >= right &&
      b.top + b.height >= bottom
    )
      return cur;
  }
  return null;
}

function demote(c: ScopeConfidence): ScopeConfidence {
  return c === 'high' ? 'medium' : 'low';
}

/**
 * Resolve the blast radius for an annotation.
 *
 * With a `region` this is a marquee: the boundary is the smallest ancestor
 * containing the drawn rect and the members are the covered set. Without one
 * it is a point pin: the boundary comes from the ladder and the single member
 * is the pinned element.
 *
 * Returns `null` rather than a boundary of `<body>` — R4 is absolute, and a
 * fabricated boundary is worse than an absent one. Callers render scope
 * guarded, so absence is always a legal state.
 */
export function resolveScope(target: Element, region?: ScopeRect | null): ScopeResult | null {
  if (!target.isConnected || isRoot(target) || skip(target)) return null;

  let boundary: Element;
  let rung: ScopeRung;
  let confidence: ScopeConfidence;

  if (region) {
    const found = containerFor(target, region);
    if (!found) return null;
    boundary = found;
    rung = rungOf(boundary);
    confidence = CONFIDENCE[rung];
  } else {
    // A point pin's boundary must be a STRICT ancestor of what it changes, so
    // the climb starts at the parent. Starting at the element collapses the
    // two whenever a rung matches the element itself — and `anchorTarget`
    // guarantees that for every page that uses `data-testid`, since the stored
    // anchor IS the testid element. The useful answer there is the section
    // ABOVE the component: change this component, do not leave this section.
    const above = target.parentElement;
    const climbed =
      above && !isRoot(above) ? climb(above) : { el: target, rung: 'anchor' as ScopeRung };
    // R4: a ladder pick that is really the page reports the ANCHOR element
    // with low confidence instead — never the page, never `<body>`.
    if (climbed.el !== target && tooWide(climbed.el)) {
      boundary = target;
      rung = 'anchor';
      confidence = 'low';
    } else {
      boundary = climbed.el;
      rung = climbed.rung;
      confidence = tooWide(boundary) ? 'low' : CONFIDENCE[rung];
    }
  }
  if (isRoot(boundary)) return null;

  const w: Walk = { members: [], excluded: [], bands: new Map(), visits: 0, truncated: false };
  if (region) {
    const clip = boxOf(boundary);
    const kids = boundary.children;
    for (let i = 0; i < kids.length; i++) visit(kids[i]!, clip, region, 1, w);
  } else if (boundary !== target) {
    w.members.push(target);
    w.bands.set(target, 'inside');
  }

  if (w.truncated) confidence = 'low';

  const scope: Scope = { gen: SCOPE_GEN, rung, confidence, boundary: describe(boundary) };
  const src = sourceOf(boundary);
  if (src) scope.source = src;
  if (w.truncated) scope.truncated = true;

  // Exclusions belong to BOTH branches: a note dropped in a gap has neighbours
  // an agent must equally leave alone, so this cannot live inside the region
  // arm below.
  if (w.excluded.length) scope.excluded = w.excluded.map(describe) as [ScopeNode, ...ScopeNode[]];

  if (w.members.length) {
    const nodes = w.members.map(
      (el): ChangeNode => ({ ...describe(el), band: w.bands.get(el) ?? 'partial' }),
    );
    scope.members = nodes as [ChangeNode, ...ChangeNode[]];
  } else if (region) {
    // Nothing covered: the reviewer drew a gap, which is an insertion rather
    // than a failure. Never reachable from a point pin.
    const ends = bracket(boundary, region);
    const between: { before?: ScopeNode; after?: ScopeNode } = {};
    if (ends.before) between.before = describe(ends.before);
    if (ends.after) between.after = describe(ends.after);
    scope.between = between;
    scope.confidence = demote(confidence);
    return { scope, elements: { boundary, members: [], excluded: w.excluded } };
  }

  return { scope, elements: { boundary, members: w.members, excluded: w.excluded } };
}

/**
 * What a healed anchor's scope becomes.
 *
 * A heal means the anchor moved to a different element than the one the
 * reviewer pinned, so every derived node list describes a DOM that no longer
 * exists. Keeping them would let an artifact name elements with total
 * confidence that were never in the drawn region. The boundary survives
 * because it is the one claim a heal does not invalidate — the reviewer's
 * region was inside it then and the ladder rung that found it still holds.
 *
 * Pure and idempotent.
 */
export function demoteScope(scope: Scope): Scope {
  const out: Scope = { ...scope, confidence: 'low', stale: true };
  delete out.members;
  delete out.excluded;
  delete out.between;
  delete out.truncated;
  return out;
}
