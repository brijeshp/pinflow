import { SCHEMA_VERSION } from './storage';
import { now } from './time';
import type { Comment, ReviewerStore } from './types';

export interface ExportMeta {
  generatedAt: string;
  project: string;
}

// EVERY interpolated field is untrusted (localStorage, URL params, host
// callbacks, source hydration) — not just comment text. This is the baseline
// escaper applied to all of them: newlines collapse so no field can fabricate
// a heading or section, and backticks are neutralised so no field can open a
// code span that swallows the rest of the block. (Codex audit #2 — never
// weaken.)
//
// Backtick handling used to live in a separate `code()` helper applied
// per-field, so every new line asked "which escaper does this one need?" —
// and three consecutive review rounds found a field that answered it wrong:
// the css tag, then the text fingerprint, then a whole class of them
// (accessible name, nearest heading, font-family, resolution, comment id).
// The decision is gone. One baseline, applied everywhere. Only `comment.text`
// bypasses it, via quoted(), because a human's prose should keep its backticks.
function inline(v: unknown): string {
  return String(v ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/`/g, "'");
}

// Blockquote continuation must cover bare \r too.
function quoted(text: string): string {
  return `> ${text.replace(/\r\n|\r|\n/g, '\n> ')}`;
}

// For values rendered inside the element label — the attribute pair
// (data-testid="…", id="…") and the ("fingerprint") segment beside it.
//
// Markdown structure is already safe there, but the baseline does not touch
// quotes or angle brackets, so a value could close the attribute and forge a
// sibling (data-testid="pro" x="y"), terminate the pseudo-tag early (a>), or —
// from the fingerprint or the tag, both of which carry arbitrary stored text —
// emit an entire second well-formed label. An agent extracting
// data-testid="([^"]*)" then reads an attribute pinflow never emitted, and the
// NON-GLOBAL form returns the forged one first. Structure was defended;
// semantics were not.
//
// All FOUR interpolations in the label go through this — tag, testid, id,
// fingerprint. Rounds 1 and 2 each fixed a subset, which is how the tag
// survived twice.
function attr(v: unknown): string {
  return inline(v).replace(/"/g, "'").replace(/</g, '‹').replace(/>/g, '›');
}

// Called per-comment to decide if the anchor still resolves. Comments for
// which this returns true are pulled into the "Orphaned comments" section
// (spec §5.2, §7.2).
export type IsOrphaned = (comment: Comment) => boolean;

/** Optional host-provided friendly label for a route/frame key (config.describeRoute). */
export type DescribeRoute = (key: string) => string;

// attr(), like every other interpolation in the element label. The tag is
// derived from the stored css path, and storage.ts validates that only as
// `typeof === 'string'` — so a source() payload, an imported JSON export, or a
// tampered localStorage can put `"` or `<` in it and forge an attribute inside
// the pseudo-tag. Not reachable from page markup (cssSegment builds from
// tagName), which is exactly why it survived two review rounds.
function tagFromCss(css: string): string {
  const last = css.split('>').pop()?.trim() ?? '';
  const tag = last.split(/[.:#[]/)[0];
  return attr(tag) || 'element';
}

function elementLabel(comment: Comment): string {
  const { selectors, textFingerprint } = comment.anchor;
  const tag = tagFromCss(selectors.css);
  const ident = selectors.testid
    ? ` data-testid="${attr(selectors.testid)}"`
    : selectors.id
      ? ` id="${attr(selectors.id)}"`
      : '';
  // Quote-delimited, on the same line as the attribute above, and raw element
  // text — the most page-controlled field in the artifact.
  const text = textFingerprint ? ` ("${attr(textFingerprint)}")` : '';
  return `\`<${tag}${ident}>\`${text}`;
}

function selectorLines(comment: Comment): string {
  const { selectors } = comment.anchor;
  return [
    `- testid: ${selectors.testid ? `\`${inline(selectors.testid)}\`` : '(none)'}`,
    `- css: \`${inline(selectors.css)}\``,
    `- xpath: \`${inline(selectors.xpath)}\``,
  ].join('\n');
}

function viewportLabel(comment: Comment): string {
  const { width, height } = comment.anchor.viewport;
  const kind = width < 768 ? 'mobile' : width < 1200 ? 'tablet' : 'desktop';
  return `${width}×${height} (${kind})`;
}

// Leads with the stable comment id (the tracker/sync handle) and trails with
// the team's disposition — only when one exists, so backendless exports stay
// noise-free.
function commentHeading(comment: Comment, index: number, reviewer?: string): string {
  const s = comment.status;
  const disp = s === 'done' || s === 'declined' ? ` — ${s}` : '';
  return `### [${inline(comment.id)}] Comment ${index} — ${reviewer ? `${inline(reviewer)}, ` : ''}${inline(comment.createdAt)}${disp}`;
}

// "the ‘Continue’ button under ‘Next section’" — the human twin of the CSS
// path, from the context captured at pin time. Empty when never captured (v2).
function contextLine(comment: Comment): string {
  const ctx = comment.anchor.context;
  if (!ctx) return '';
  return `**Context:** the ${ctx.name ? `‘${inline(ctx.name)}’ ` : ''}${inline(ctx.role ?? 'element')}${
    ctx.heading ? ` under ‘${inline(ctx.heading)}’` : ''
  }`;
}

// "**Computed:** background rgb(...), text rgb(...), font 17px DM Sans" — the
// pin-time visual snapshot, so an agent knows WHAT is being pinned (a color,
// a font, an image) and its current value, not just where it sits.
function visualLines(comment: Comment): string[] {
  const ctx = comment.anchor.context;
  if (!ctx) return [];
  const s = ctx.styles;
  const parts: string[] = [];
  if (s?.background) parts.push(`background ${inline(s.background)}`);
  if (s?.color) parts.push(`text ${inline(s.color)}`);
  if (s?.fontSize || s?.fontFamily)
    parts.push(`font ${inline([s.fontSize, s.fontFamily].filter(Boolean).join(' '))}`);
  if (s?.radius) parts.push(`radius ${inline(s.radius)}`);
  // These two carry URLs straight off the page. The baseline neutralises the
  // backtick; the pack forbids fetching them, which is the other half.
  if (s?.backgroundImage) parts.push(`bg-image ${inline(s.backgroundImage)}`);
  const lines: string[] = [];
  if (parts.length) lines.push(`**Computed:** ${parts.join(', ')}`);
  if (ctx.src) lines.push(`**Image:** ${inline(ctx.src)}`);
  return lines;
}

function commentBlock(comment: Comment, index: number, reviewer?: string): string {
  const heading = commentHeading(comment, index, reviewer);
  const pos = comment.anchor.positionPercent;
  const ctx = contextLine(comment);
  return [
    heading,
    `**Element:** ${elementLabel(comment)}`,
    ...(ctx ? [ctx] : []),
    ...visualLines(comment),
    '**Selector candidates:**',
    selectorLines(comment),
    `**Position:** ${Math.round(pos.x)}% from left, ${Math.round(pos.y)}% from top of element`,
    `**Viewport at time of comment:** ${viewportLabel(comment)}`,
    // The team's "why" — the disposition heading suffix says WHAT happened,
    // this line says the reason. Together they close the loop in the artifact.
    ...(comment.resolution ? [`**Resolution:** ${inline(comment.resolution)}`] : []),
    '',
    quoted(comment.text),
  ].join('\n');
}

function orphanBlock(comment: Comment & { reviewer?: string }, index: number): string {
  // Orphans keep their human context and visual snapshot — the element is
  // GONE, so the last-known name/heading/colors are exactly what an agent
  // has left to work with (codex r18).
  const ctx = contextLine(comment);
  return [
    commentHeading(comment, index, comment.reviewer),
    `**Last known element:** ${elementLabel(comment)}`,
    ...(ctx ? [ctx] : []),
    ...visualLines(comment),
    `**Last known selector:** \`${inline(comment.anchor.selectors.css)}\``,
    `**Route:** ${inline(comment.route)}`,
    '',
    quoted(comment.text),
  ].join('\n');
}

interface RouteGroup {
  route: string;
  comments: Array<Comment & { reviewer?: string }>;
}

function groupByRoute(comments: Array<Comment & { reviewer?: string }>): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const c of comments) {
    const g = map.get(c.route) ?? { route: c.route, comments: [] };
    g.comments.push(c);
    map.set(c.route, g);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.comments.length - a.comments.length || a.route.localeCompare(b.route),
  );
}

function routesCovered(groups: RouteGroup[]): string {
  if (groups.length === 0) return '(none)';
  return groups
    .map((g) => inline(g.route))
    .sort()
    .join(', ');
}

function partitionOrphans<T extends Comment>(
  comments: T[],
  isOrphaned: IsOrphaned,
): { live: T[]; orphaned: T[] } {
  const live: T[] = [];
  const orphaned: T[] = [];
  for (const c of comments) (isOrphaned(c) ? orphaned : live).push(c);
  return { live, orphaned };
}

function orphanSection(orphaned: Array<Comment & { reviewer?: string }>): string {
  if (orphaned.length === 0) return '';
  const blocks = orphaned.map((c, i) => orphanBlock(c, i + 1)).join('\n\n---\n\n');
  return [
    '## Orphaned comments',
    '',
    'Their elements no longer exist in the DOM.',
    '',
    blocks,
  ].join('\n');
}

function bodyFromGroups(
  groups: RouteGroup[],
  withReviewer: boolean,
  describeRoute?: DescribeRoute,
): string {
  return groups
    .map((g) => {
      const blocks = g.comments.map((c, i) =>
        commentBlock(c, i + 1, withReviewer ? c.reviewer : undefined),
      );
      // `## <label>` with the stable key in backticks beneath when the host
      // labels this key; the plain v1 heading otherwise.
      const label = describeRoute?.(g.route);
      const heading = label
        ? `## ${inline(label)}\n\`${inline(g.route)}\``
        : `## Route: ${inline(g.route)}`;
      return [heading, '', blocks.join('\n\n---\n\n')].join('\n');
    })
    .join('\n\n---\n\n');
}

export function exportReviewer(
  store: ReviewerStore,
  meta: ExportMeta,
  isOrphaned: IsOrphaned,
  describeRoute?: DescribeRoute,
): string {
  const { live, orphaned } = partitionOrphans(store.comments, isOrphaned);
  const groups = groupByRoute(live);
  const header = [
    `# Feedback for ${inline(meta.project)} — from ${inline(store.reviewer)}`,
    '',
    `Generated: ${inline(meta.generatedAt)}`,
    `Reviewer: ${inline(store.reviewer)}`,
    `Total comments: ${store.comments.length}`,
    `Routes covered: ${routesCovered(groups)}`,
    '',
    '---',
  ].join('\n');

  const parts = [header, bodyFromGroups(groups, false, describeRoute)];
  const orphan = orphanSection(orphaned);
  if (orphan) parts.push('---', orphan);
  return parts.filter(Boolean).join('\n\n') + '\n';
}

function summarize(
  reviewers: string[],
  groups: RouteGroup[],
  byReviewer: Map<string, number>,
): string {
  const total = groups.reduce((sum, g) => sum + g.comments.length, 0);
  const byReviewerLines = reviewers
    .map((r) => `- ${inline(r)} — ${byReviewer.get(r) ?? 0} comments`)
    .join('\n');
  const byRouteLines = groups
    .map((g) => `- ${inline(g.route)} — ${g.comments.length} comments`)
    .join('\n');
  return [
    '## Summary',
    '',
    `${total} comments across ${groups.length} ${groups.length === 1 ? 'route' : 'routes'}.`,
    '',
    'By reviewer:',
    byReviewerLines,
    '',
    'By route:',
    byRouteLines,
  ].join('\n');
}

export function exportBuilder(
  stores: ReviewerStore[],
  meta: ExportMeta,
  isOrphaned: IsOrphaned,
  describeRoute?: DescribeRoute,
): string {
  const reviewers = stores.map((s) => s.reviewer);
  const allComments: Array<Comment & { reviewer: string }> = stores.flatMap((s) =>
    s.comments.map((c) => ({ ...c, reviewer: s.reviewer })),
  );
  const { live, orphaned } = partitionOrphans(allComments, isOrphaned);
  const byReviewer = new Map<string, number>();
  for (const c of live) byReviewer.set(c.reviewer, (byReviewer.get(c.reviewer) ?? 0) + 1);

  const groups = groupByRoute(live);

  const header = [
    `# Feedback for ${inline(meta.project)}`,
    '',
    `Generated: ${inline(meta.generatedAt)}`,
    `Reviewers: ${reviewers.map(inline).join(', ')} (${reviewers.length} total, ${allComments.length} comments)`,
    `Routes covered: ${routesCovered(groups)}`,
    '',
    '---',
    '',
    summarize(reviewers, groups, byReviewer),
    '',
    '---',
  ].join('\n');

  const parts = [header, bodyFromGroups(groups, true, describeRoute)];
  const orphan = orphanSection(orphaned);
  if (orphan) parts.push('---', orphan);
  return parts.filter(Boolean).join('\n\n') + '\n';
}

// `reviewer` doubles as the kind switch: null means the builder aggregate.
export function exportFilename(
  project: string,
  reviewer: string | null,
  timestamp: string,
  ext = 'md',
): string {
  const ts = timestamp.replace(/[:.]/g, '-');
  const who = reviewer ? `${reviewer}-${project}` : `${project}-aggregate`;
  return `pinflow-feedback-${who}-${ts}.${ext}`;
}

/**
 * Machine-readable twin of the markdown export (markdown for humans/agents,
 * JSON for pipelines). `pinflowExport` shares the storage schema version
 * namespace — "v3" means one thing everywhere. Pure and DOM-free by contract:
 * hosts run it server-side too.
 */
export function exportJSON(stores: ReviewerStore[] | ReviewerStore): string {
  const list = Array.isArray(stores) ? stores : [stores];
  return JSON.stringify({
    pinflowExport: SCHEMA_VERSION,
    generatedAt: now(),
    comments: list.flatMap((s) => s.comments.map((c) => ({ ...c, reviewer: s.reviewer }))),
  });
}
