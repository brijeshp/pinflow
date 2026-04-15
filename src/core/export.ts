import type { Comment, ReviewerStore } from './types';

export interface ExportMeta {
  generatedAt: string;
  project: string;
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

function commentBlock(comment: Comment, index: number, reviewer?: string): string {
  const heading = reviewer
    ? `### Comment ${index} — ${reviewer}, ${comment.createdAt}`
    : `### Comment ${index} — ${comment.createdAt}`;
  const pos = comment.anchor.positionPercent;
  return [
    heading,
    `**Element:** ${elementLabel(comment)}`,
    '**Selector candidates:**',
    selectorLines(comment),
    `**Position:** ${Math.round(pos.x)}% from left, ${Math.round(pos.y)}% from top of element`,
    `**Viewport at time of comment:** ${viewportLabel(comment)}`,
    '',
    `> ${comment.text.replace(/\r?\n/g, '\n> ')}`,
  ].join('\n');
}

interface RouteGroup {
  route: string;
  comments: Array<Comment & { reviewer?: string }>;
}

function groupByRoute(
  comments: Array<Comment & { reviewer?: string }>,
): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const c of comments) {
    const g = map.get(c.route) ?? { route: c.route, comments: [] };
    g.comments.push(c);
    map.set(c.route, g);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.comments.length - a.comments.length || a.route.localeCompare(b.route));
  return groups;
}

function routesCovered(groups: RouteGroup[]): string {
  if (groups.length === 0) return '(none)';
  return groups
    .map((g) => g.route)
    .sort()
    .join(', ');
}

export function exportReviewer(store: ReviewerStore, meta: ExportMeta): string {
  const comments = store.comments;
  const groups = groupByRoute(comments);
  const header = [
    `# Feedback for ${meta.project} — from ${store.reviewer}`,
    '',
    `Generated: ${meta.generatedAt}`,
    `Reviewer: ${store.reviewer}`,
    `Total comments: ${comments.length}`,
    `Routes covered: ${routesCovered(groups)}`,
    '',
    '---',
  ].join('\n');

  const body = groups
    .map((g) => {
      const blocks = g.comments.map((c, i) => commentBlock(c, i + 1));
      return [`## Route: ${g.route}`, '', blocks.join('\n\n---\n\n')].join('\n');
    })
    .join('\n\n---\n\n');

  return [header, body].filter(Boolean).join('\n\n') + '\n';
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
  const byRouteLines = groups
    .map((g) => `- ${g.route} — ${g.comments.length} comments`)
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

export function exportBuilder(stores: ReviewerStore[], meta: ExportMeta): string {
  const reviewers = stores.map((s) => s.reviewer);
  const allComments: Array<Comment & { reviewer: string }> = stores.flatMap((s) =>
    s.comments.map((c) => ({ ...c, reviewer: s.reviewer })),
  );
  const byReviewer = new Map<string, number>();
  for (const c of allComments) byReviewer.set(c.reviewer, (byReviewer.get(c.reviewer) ?? 0) + 1);

  const groups = groupByRoute(allComments);
  const totalComments = allComments.length;

  const header = [
    `# Feedback for ${meta.project}`,
    '',
    `Generated: ${meta.generatedAt}`,
    `Reviewers: ${reviewers.join(', ')} (${reviewers.length} total, ${totalComments} comments)`,
    `Routes covered: ${routesCovered(groups)}`,
    '',
    '---',
    '',
    summarize(reviewers, groups, byReviewer),
    '',
    '---',
  ].join('\n');

  const body = groups
    .map((g) => {
      const blocks = g.comments.map((c, i) => commentBlock(c, i + 1, c.reviewer));
      return [`## Route: ${g.route}`, '', blocks.join('\n\n---\n\n')].join('\n');
    })
    .join('\n\n---\n\n');

  return [header, body].filter(Boolean).join('\n\n') + '\n';
}

export function exportFilename(
  kind: 'reviewer' | 'builder',
  project: string,
  reviewer: string | null,
  timestamp: string,
): string {
  const ts = timestamp.replace(/[:.]/g, '-');
  return kind === 'reviewer' && reviewer
    ? `pinflow-feedback-${reviewer}-${project}-${ts}.md`
    : `pinflow-feedback-${project}-aggregate-${ts}.md`;
}
