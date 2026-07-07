import type { Comment, ReviewerStore } from './types';

export interface ExportMeta {
  generatedAt: string;
  project: string;
}

// Called per-comment to decide if the anchor still resolves. Comments for
// which this returns true are pulled into the "Orphaned comments" section
// (spec §5.2, §7.2).
export type IsOrphaned = (comment: Comment) => boolean;

/** Optional host-provided friendly label for a route/frame key (config.describeRoute). */
export type DescribeRoute = (key: string) => string;

// `## <label>` with the stable key in backticks beneath when the host labels
// this key; the plain v1 heading otherwise.
function routeHeading(route: string, describe?: DescribeRoute): string {
  const label = describe?.(route);
  return label ? `## ${label}\n\`${route}\`` : `## Route: ${route}`;
}

function tagFromCss(css: string): string {
  const last = css.split('>').pop()?.trim() ?? '';
  const tag = last.split(/[.:#[]/)[0];
  return tag || 'element';
}

function elementLabel(comment: Comment): string {
  const { selectors, textFingerprint } = comment.anchor;
  const tag = tagFromCss(selectors.css);
  const attr = selectors.testid
    ? ` data-testid="${selectors.testid}"`
    : selectors.id
      ? ` id="${selectors.id}"`
      : '';
  const text = textFingerprint ? ` ("${textFingerprint}")` : '';
  return `\`<${tag}${attr}>\`${text}`;
}

function selectorLines(comment: Comment): string {
  const { selectors } = comment.anchor;
  return [
    `- testid: ${selectors.testid ? `\`${selectors.testid}\`` : '(none)'}`,
    `- css: \`${selectors.css}\``,
    `- xpath: \`${selectors.xpath}\``,
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
  const disp =
    comment.status === 'done' || comment.status === 'declined' ? ` — ${comment.status}` : '';
  return `### [${comment.id}] Comment ${index} — ${reviewer ? `${reviewer}, ` : ''}${comment.createdAt}${disp}`;
}

// "the ‘Continue’ button under ‘Next section’" — the human twin of the CSS
// path, from the context captured at pin time. Empty when never captured (v2).
function contextLine(comment: Comment): string {
  const ctx = comment.anchor.context;
  if (!ctx) return '';
  const name = ctx.name ? `‘${ctx.name}’ ` : '';
  const under = ctx.heading ? ` under ‘${ctx.heading}’` : '';
  return `**Context:** the ${name}${ctx.role ?? 'element'}${under}`;
}

function commentBlock(comment: Comment, index: number, reviewer?: string): string {
  const heading = commentHeading(comment, index, reviewer);
  const pos = comment.anchor.positionPercent;
  const ctx = contextLine(comment);
  return [
    heading,
    `**Element:** ${elementLabel(comment)}`,
    ...(ctx ? [ctx] : []),
    '**Selector candidates:**',
    selectorLines(comment),
    `**Position:** ${Math.round(pos.x)}% from left, ${Math.round(pos.y)}% from top of element`,
    `**Viewport at time of comment:** ${viewportLabel(comment)}`,
    '',
    `> ${comment.text.replace(/\r?\n/g, '\n> ')}`,
  ].join('\n');
}

function orphanBlock(comment: Comment & { reviewer?: string }, index: number): string {
  return [
    commentHeading(comment, index, comment.reviewer),
    `**Last known element:** ${elementLabel(comment)}`,
    `**Last known selector:** \`${comment.anchor.selectors.css}\``,
    `**Route:** ${comment.route}`,
    '',
    `> ${comment.text.replace(/\r?\n/g, '\n> ')}`,
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
    .map((g) => g.route)
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
    'The following comments were left on elements that no longer exist in the current DOM. They are preserved here for context.',
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
      return [routeHeading(g.route, describeRoute), '', blocks.join('\n\n---\n\n')].join('\n');
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
    `# Feedback for ${meta.project} — from ${store.reviewer}`,
    '',
    `Generated: ${meta.generatedAt}`,
    `Reviewer: ${store.reviewer}`,
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
    .map((r) => `- ${r} — ${byReviewer.get(r) ?? 0} comments`)
    .join('\n');
  const byRouteLines = groups.map((g) => `- ${g.route} — ${g.comments.length} comments`).join('\n');
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
    `# Feedback for ${meta.project}`,
    '',
    `Generated: ${meta.generatedAt}`,
    `Reviewers: ${reviewers.join(', ')} (${reviewers.length} total, ${allComments.length} comments)`,
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
): string {
  const ts = timestamp.replace(/[:.]/g, '-');
  return reviewer
    ? `pinflow-feedback-${reviewer}-${project}-${ts}.md`
    : `pinflow-feedback-${project}-aggregate-${ts}.md`;
}
