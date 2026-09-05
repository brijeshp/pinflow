import { rememberReviewer } from './identity';
import { FP_MAX } from './selector';
import { cleanLabel, CSS_MAX, EXCLUDED_CAP, MEMBER_CAP, TAG_MAX } from './scope-limits';
import { validateSourcePath } from './source-path';
import { now } from './time';
import type { ChangeNode, Comment, ReviewerStore, Scope, ScopeNode } from './types';

// Exported: exportJSON's `pinflowExport` field shares this version namespace —
// "v4" means one thing everywhere (storage blob, JSON export, sync protocol).
export const SCHEMA_VERSION = 4;
// `c` = comments store; kept short to save bundle bytes and to avoid
// colliding with other pinflow:* keys (e.g. the identity key in identity.ts,
// which lives under `pinflow:r:<project>`).
const KEY_PREFIX = 'pinflow:c:';

interface PersistedStore extends ReviewerStore {
  schemaVersion: number;
}

// Components are URI-encoded so a ':' inside a project or reviewer name can't
// alias another namespace (review #19: project "a" + reviewer "b:c" must
// never equal project "a:b" + reviewer "c"). Colon-free values — every real
// deployment observed — encode to themselves, so existing keys are unchanged.
export function storageKey(project: string, reviewer: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(reviewer)}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPersistedStore(v: unknown): v is {
  schemaVersion: number;
  reviewer: string;
  project: string;
  createdAt?: unknown;
  comments?: unknown;
} {
  return (
    isObject(v) &&
    typeof v['schemaVersion'] === 'number' &&
    v['schemaVersion'] >= 1 &&
    typeof v['reviewer'] === 'string' &&
    typeof v['project'] === 'string'
  );
}

// The anchor sub-shape export/render dereference without guards: selectors
// (with a string `css`), positionPercent, and viewport must all be objects or
// the record is dropped rather than admitted to crash export later.
function finite(v: unknown): v is number {
  return Number.isFinite(v);
}

function optStr(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'string';
}

// A 0-100 percentage leaf. The same three-term chain appeared inline six times
// across `hasValidAnchor` and `validArea`; the comparisons are pure, so
// factoring them out reorders nothing observable. NaN and +/-Infinity fail on
// `finite` exactly as before, and both bounds stay inclusive.
function pct(v: unknown): boolean {
  return finite(v) && v >= 0 && v <= 100;
}

function validContext(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  if (!optStr(v['name']) || !optStr(v['role']) || !optStr(v['heading']) || !optStr(v['src']))
    return false;
  const styles = v['styles'];
  if (styles === undefined) return true;
  return isObject(styles) && Object.values(styles).every((s) => typeof s === 'string');
}

// A layer is dereferenced on every resolve (name compared, role trusted), so
// a malformed one drops the record like any other anchor corruption. The name
// cap matches every context field's ≤80 promise.
function validLayer(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  const name = v['name'];
  return (
    v['role'] === 'dialog' &&
    (name === undefined || (typeof name === 'string' && name.length <= 80))
  );
}

// Area comments (marquee picker): all four leaves are Math.round()ed on
// export, so NaN/out-of-range must drop the record like any anchor corruption.
function validArea(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  return pct(v['x']) && pct(v['y']) && pct(v['w']) && pct(v['h']);
}

function validVoice(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  const conf = v['confidence'];
  return (
    finite(v['durationMs']) &&
    v['durationMs'] >= 0 &&
    (conf === undefined || (finite(conf) && conf >= 0 && conf <= 1)) &&
    (v['interim'] === undefined || typeof v['interim'] === 'boolean') &&
    (v['edited'] === undefined || typeof v['edited'] === 'boolean') &&
    optStr(v['engine'])
  );
}

function hasValidAnchor(c: Record<string, unknown>): boolean {
  const anchor = c['anchor'];
  if (!isObject(anchor)) return false;
  const selectors = anchor['selectors'];
  const pos = anchor['positionPercent'];
  const vp = anchor['viewport'];
  // Numeric leaves are dereferenced unguarded downstream (Math.round on
  // export, pixel math on render) — NaN/absent must drop the record, not
  // produce "NaN%" artifacts (review #20).
  return (
    isObject(selectors) &&
    typeof selectors['css'] === 'string' &&
    optStr(selectors['testid']) &&
    optStr(selectors['id']) &&
    typeof selectors['xpath'] === 'string' &&
    // The role+name rung (0.12.0): string-or-absent, name ≤80 — compared
    // per candidate on every resolve, so a non-string must drop the record.
    (selectors['role'] === undefined ||
      (typeof selectors['role'] === 'string' && selectors['role'].length <= 80)) &&
    (selectors['name'] === undefined ||
      (typeof selectors['name'] === 'string' && selectors['name'].length <= 80)) &&
    isObject(pos) &&
    pct(pos['x']) &&
    pct(pos['y']) &&
    isObject(vp) &&
    finite(vp['width']) &&
    finite(vp['height']) &&
    vp['width'] > 0 &&
    vp['height'] > 0 &&
    // Optional shapes at their REAL locations (review r3: context lives on
    // the anchor, not the comment): reject records whose context, fingerprint,
    // or voice metadata would corrupt export or render.
    // STRICT, not optStr: normalizeComments dereferences .length on this a few
    // lines below, so a null/absent value passed validation and then threw a
    // TypeError that discarded the ENTIRE store, not just the bad record.
    // buildAnchor always writes a string (possibly ''), so nothing legitimate
    // is rejected — and there was never a working path for an absent one.
    typeof anchor['textFingerprint'] === 'string' &&
    validArea(anchor['areaPercent']) &&
    // string-or-ABSENT, not optStr: optStr admits null, and normalizeComments
    // preserves it through the spread into a field the type declares as
    // `string | undefined` — so a source() payload could hand every downstream
    // consumer a null where only a string is possible (review #2).
    (anchor['covers'] === undefined || typeof anchor['covers'] === 'string') &&
    validContext(anchor['context']) &&
    validLayer(anchor['layer']) &&
    validVoice(c['voice'])
  );
}

const RUNGS = new Set(['source', 'testid', 'repeated', 'landmark', 'anchor']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

// Scope validates SOFT — stripped, never fatal — and that asymmetry with
// hasValidAnchor is the whole reason `scope` lives on Comment rather than on
// Anchor. An anchor leaf is dereferenced unguarded downstream, so a bad one
// must drop the record; scope is rendered guarded and never re-resolved, so a
// bad one costs a boundary hint. Losing a hint must never lose the reviewer's
// words.
function scopeNode(v: unknown): ScopeNode | null {
  if (!isObject(v) || typeof v['tag'] !== 'string' || typeof v['css'] !== 'string') return null;
  // Rejected, not truncated. A clipped css path is a selector that may match a
  // DIFFERENT element than the one the reviewer drew around, which is worse
  // than having no hint at all — and losing a hint never loses their words.
  if (!v['tag'] || v['tag'].length > TAG_MAX || v['css'].length > CSS_MAX) return null;
  const node: ScopeNode = { tag: v['tag'], css: v['css'] };
  // Re-sanitised here, not trusted from the wire. Capture cleans what it reads
  // from the DOM; this boundary serves backends, imported exports and tampered
  // blobs, so it applies the SAME rule — length was already re-capped, but the
  // invisible-character strip was not, and `exportJSON` and `onChange` carry
  // these strings past the markdown escapers untouched.
  const testid = cleanLabel(v['testid']);
  if (testid) node.testid = testid;
  const label = cleanLabel(v['label']);
  if (label) node.label = label;
  return node;
}

// Non-empty or absent — never `[]`. A backend that normalises empty arrays to
// absent must not be able to change an annotation's kind in transit, and the
// reader decides kind by presence.
function nodeList<T>(v: unknown, cap: number, map: (n: ScopeNode, raw: unknown) => T): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const raw of v) {
    const node = scopeNode(raw);
    if (node) out.push(map(node, raw));
    if (out.length === cap) break;
  }
  return out.length ? out : null;
}

function validScope(v: unknown): Scope | undefined {
  if (!isObject(v)) return undefined;
  const boundary = scopeNode(v['boundary']);
  const rung = v['rung'];
  const confidence = v['confidence'];
  if (
    !boundary ||
    !finite(v['gen']) ||
    typeof rung !== 'string' ||
    !RUNGS.has(rung) ||
    typeof confidence !== 'string' ||
    !CONFIDENCES.has(confidence)
  )
    return undefined;

  const scope: Scope = {
    gen: v['gen'],
    rung: rung as Scope['rung'],
    confidence: confidence as Scope['confidence'],
    boundary,
  };

  const members = nodeList<ChangeNode>(v['members'], MEMBER_CAP, (node, raw) => ({
    ...node,
    // An unknown band reads as the WEAKER one. A wire value claiming `inside`
    // must not be able to promote a node the reviewer only grazed.
    band: isObject(raw) && raw['band'] === 'inside' ? 'inside' : 'partial',
  }));
  if (members) scope.members = members as [ChangeNode, ...ChangeNode[]];

  // Only meaningful alongside members, and only when it exceeds them — a wire
  // value claiming "2 of 1" or "2 of 2" is either corrupt or says nothing, and
  // it renders into a sentence an agent acts on. Integer-bounded because the
  // renderer prints it raw: 1e21 would arrive as "1e+21 <li>".
  // `sibs % 1 === 0` subsumes both finiteness checks — NaN % 1 and Infinity % 1
  // are both NaN, which fails the comparison — so it is shorter than
  // finite() && Number.isInteger() and rejects exactly the same values.
  //
  // The tag check mirrors capture, which sets `siblings` only when every member
  // shares one parent AND one tag. Export labels the sentence from
  // members[0].tag, so a mixed-tag payload renders "2 of 9 `<li>`" over a set
  // containing a `<section>` — a claim about a set that does not exist.
  const sibs = v['siblings'];
  if (
    members &&
    typeof sibs === 'number' &&
    sibs % 1 === 0 &&
    sibs > members.length &&
    sibs < 1e4 &&
    members.every((m) => m.tag === members[0]!.tag)
  )
    scope.siblings = sibs;

  const excluded = nodeList<ScopeNode>(v['excluded'], EXCLUDED_CAP, (node) => node);
  if (excluded) scope.excluded = excluded as [ScopeNode, ...ScopeNode[]];

  if (!members && isObject(v['between'])) {
    const between: { before?: ScopeNode; after?: ScopeNode } = {};
    const before = scopeNode(v['between']['before']);
    const after = scopeNode(v['between']['after']);
    if (before) between.before = before;
    if (after) between.after = after;
    scope.between = between;
  }

  // Third call site for the path validator (capture and export are the other
  // two). A conformant-looking backend can hand back anything.
  const source = validateSourcePath(v['source']);
  if (source) scope.source = source;
  // A rung claiming the host declared a path, without a path that survived
  // validation, is a claim with nothing behind it.
  else if (scope.rung === 'source') scope.rung = 'anchor';

  // Both halves must survive or the field is dropped whole — a motion node
  // without props renders "animates undefined". scopeNode() rejects rather
  // than truncates, and cleanLabel is typed `unknown` so a number or null in
  // `props` returns undefined instead of throwing into the path that discards
  // the whole store.
  const mo = v['motion'];
  const mn = scopeNode(mo);
  const mp = isObject(mo) ? cleanLabel(mo['props']) : undefined;
  if (mn && mp) scope.motion = { ...mn, props: mp };

  if (v['truncated'] === true) scope.truncated = true;
  if (v['stale'] === true) scope.stale = true;
  return scope;
}

// Comments from localStorage are untrusted: drop malformed entries, coerce the
// string fields downstream code dereferences unguarded, and guarantee every
// survivor carries a `modality` (v1 stores predate the field). v3 disposition
// fields are optional: an invalid status/resolution is stripped, not fatal.
// Exported for the source-hydration boundary: host-supplied payloads get the
// exact same distrust as localStorage blobs (review #18).
export function normalizeComments(input: unknown): Comment[] {
  if (!Array.isArray(input)) return [];
  const list = input
    .filter(
      (c): c is Record<string, unknown> =>
        isObject(c) && typeof c['id'] === 'string' && hasValidAnchor(c),
    )
    .map((c) => {
      const out: Comment = {
        ...(c as unknown as Comment),
        text: typeof c['text'] === 'string' ? c['text'] : '',
        route: typeof c['route'] === 'string' ? c['route'] : '',
        createdAt: typeof c['createdAt'] === 'string' ? c['createdAt'] : '',
        // The recency key for every merge AND the clear's revision stamp — a
        // non-string here used to ride the spread, and two different records
        // could stamp identically through JSON null (0.11.0 review #4).
        updatedAt:
          typeof c['updatedAt'] === 'string'
            ? c['updatedAt']
            : typeof c['createdAt'] === 'string'
              ? c['createdAt']
              : '',
        modality: c['modality'] === 'voice' ? 'voice' : 'text',
      };
      // Fingerprints beyond the documented representation are hostile or
      // corrupt — cap at the hydration boundary so no matcher's O(length)
      // work ever sees an oversized value (0.4.1 review #8).
      if (out.anchor.textFingerprint.length > FP_MAX) {
        out.anchor = {
          ...out.anchor,
          textFingerprint: out.anchor.textFingerprint.slice(0, FP_MAX),
        };
      }
      const s = c['status'];
      if (s === 'open' || s === 'done' || s === 'declined') out.status = s;
      else delete out.status;
      const r = c['resolution'];
      if (typeof r === 'string') out.resolution = r.slice(0, 500);
      else delete out.resolution;
      const scope = validScope(c['scope']);
      if (scope) out.scope = scope;
      else delete out.scope;
      return out;
    });
  // Duplicate ids would collapse the clear's revision map and desync every
  // by-id consumer (merge, union, render): keep one record per id — newest
  // updatedAt wins, the later entry on ties (0.11.0 review #5).
  const byId = new Map<string, Comment>();
  for (const c of list) {
    const prev = byId.get(c.id);
    if (!prev || c.updatedAt >= prev.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()];
}

// Forward-tolerant migration. v1 → default modality 'text'; v2 → as-is (v3
// disposition fields simply absent); a NEWER version is read for its stable
// core fields rather than wiped. Genuinely foreign data → null.
export function loadStore(
  storage: Storage,
  project: string,
  reviewer: string,
): ReviewerStore | null {
  let raw = storage.getItem(storageKey(project, reviewer));
  let legacy = false;
  if (!raw) {
    // Pre-encoding key shape; read-side fallback only, never written.
    // Corpora written before component encoding (colon-bearing names only).
    raw = storage.getItem(`${KEY_PREFIX}${project}:${reviewer}`);
    legacy = raw !== null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // corrupt blob — discard
  }
  const store: ReviewerStore | null = isPersistedStore(parsed)
    ? {
        reviewer: parsed.reviewer,
        project: parsed.project,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now(),
        comments: normalizeComments(parsed.comments),
      }
    : null;
  // A legacy raw key is ambiguous ("a:b:c" parses two ways) — trust it only
  // when the blob's OWN embedded scope matches the request (review #19).
  if (legacy && store && (store.project !== project || store.reviewer !== reviewer)) return null;
  return store;
}

// Persistence failing (quota, private mode) is worth exactly one signal per
// session, not one per keystroke.
let warnedWriteFailure = false;

/** Guarded write — never throws. On failure the session degrades to in-memory. */
export function saveStore(storage: Storage, store: ReviewerStore): void {
  const payload: PersistedStore = { ...store, schemaVersion: SCHEMA_VERSION };
  try {
    storage.setItem(storageKey(store.project, store.reviewer), JSON.stringify(payload));
  } catch (err: unknown) {
    if (!warnedWriteFailure) {
      warnedWriteFailure = true;
      console.warn('[pinflow] failed to persist comments', err);
    }
  }
}

/**
 * Union two comment lists by id, newest `updatedAt` winning; a tie goes to
 * `base` so the result never depends on argument order beyond that rule.
 *
 * Distinct from `mergeComments()`, which encodes the SYNC protocol's
 * server-always-wins disposition policy. That policy is wrong for a purely
 * local fold — there is no server here, only two corpora belonging to the same
 * person (0.7.0 review #2, which lost a newer edit to an id-only merge).
 */
export function unionByRecency(base: Comment[], incoming: Comment[]): Comment[] {
  const out = base.slice();
  const at = new Map(base.map((c, i) => [c.id, i]));
  for (const c of incoming) {
    const i = at.get(c.id);
    if (i === undefined) {
      at.set(c.id, out.length);
      out.push(c);
    } else if (c.updatedAt > out[i]!.updatedAt) {
      out[i] = c;
    }
  }
  return out;
}

/**
 * Move a reviewer's corpus to a new name. The storage key embeds the reviewer
 * (`pinflow:c:<project>:<reviewer>`), so naming yourself at export time is a
 * key move, not a field edit — without this the comments would be stranded
 * under the old handle and the named store would open empty.
 *
 * Copy-then-delete, never the reverse: a refused write leaves the reviewer's
 * comments exactly where they were. Returns whether the move happened.
 */
export function renameReviewer(
  storage: Storage,
  project: string,
  from: string,
  to: string,
): boolean {
  if (from === to) return false;
  const source = loadStore(storage, project, from);
  if (!source) return false;
  // Naming yourself something you've used before on this browser folds the two
  // corpora together rather than shadowing one with the other.
  const target = loadStore(storage, project, to);
  const merged: PersistedStore = {
    ...(target ?? source),
    project,
    reviewer: to,
    comments: unionByRecency(target?.comments ?? [], source.comments),
    schemaVersion: SCHEMA_VERSION,
  };
  try {
    storage.setItem(storageKey(project, to), JSON.stringify(merged));
  } catch {
    return false; // source untouched — the reviewer keeps their comments
  }
  // Copy -> REMEMBER -> delete, in that order. The identity marker is what
  // resolution reads on the next load, so it must land while the source key
  // still exists: if this write is the one that fails, the old name still
  // points at an intact corpus (0.7.0 review, residual risk 2). Remembering
  // after the delete could strand the corpus under a name nobody resolves to.
  rememberReviewer(storage, project, to);
  try {
    storage.removeItem(storageKey(project, from));
  } catch {
    /* the copy landed; a stale duplicate under the old key is survivable */
  }
  return true;
}

export function listReviewers(storage: Storage, project: string): string[] {
  const prefix = `${KEY_PREFIX}${encodeURIComponent(project)}:`;
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        out.push(decodeURIComponent(key.slice(prefix.length)));
      } catch {
        /* foreign malformed key — skip */
      }
    }
  }
  return out.sort();
}

export function loadAllStores(storage: Storage, project: string): ReviewerStore[] {
  return listReviewers(storage, project)
    .map((r) => loadStore(storage, project, r))
    .filter((s): s is ReviewerStore => s !== null);
}

export function emptyStore(project: string, reviewer: string): ReviewerStore {
  return {
    reviewer,
    project,
    createdAt: now(),
    comments: [],
  };
}

export function upsertComment(store: ReviewerStore, comment: Comment): ReviewerStore {
  const idx = store.comments.findIndex((c) => c.id === comment.id);
  const comments =
    idx === -1
      ? [...store.comments, comment]
      : store.comments.map((c, i) => (i === idx ? comment : c));
  return { ...store, comments };
}

export function deleteComment(store: ReviewerStore, id: string): ReviewerStore {
  return { ...store, comments: store.comments.filter((c) => c.id !== id) };
}

/**
 * Merge a `source`-hydrated server corpus into the local one, by comment id.
 * Pure — neither input is mutated.
 *
 * Semantics (the sync protocol's one subtle rule — see PROTOCOL.md):
 * - Content: the copy with the higher `updatedAt` wins WHOLE-comment; an exact
 *   tie resolves to the server copy (deterministic, and on a tie the two are
 *   the same write anyway).
 * - Disposition (`status`/`resolution`): the SERVER value always wins,
 *   including absence — the team sets disposition through the host, a
 *   reviewer's device never legitimately writes it, so a server copy without
 *   one CLEARS any local one.
 * - Server-only comments are appended (same reviewer, another device);
 *   local-only comments are KEPT (they may simply not have synced yet).
 * - Ordering: local order preserved, then unmatched server comments in server
 *   order.
 */
export function mergeComments(local: Comment[], server: Comment[]): Comment[] {
  const serverById = new Map(server.map((c) => [c.id, c]));
  const merged = local.map((l) => {
    const s = serverById.get(l.id);
    if (!s) return l;
    const base = l.updatedAt > s.updatedAt ? l : s;
    const out: Comment = { ...base };
    delete out.status;
    delete out.resolution;
    if (s.status !== undefined) out.status = s.status;
    if (s.resolution !== undefined) out.resolution = s.resolution;
    return out;
  });
  const localIds = new Set(local.map((c) => c.id));
  return [...merged, ...server.filter((c) => !localIds.has(c.id))];
}

export function clearProject(storage: Storage, project: string): void {
  for (const reviewer of listReviewers(storage, project)) {
    storage.removeItem(storageKey(project, reviewer));
  }
}
