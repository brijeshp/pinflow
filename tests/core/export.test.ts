import { describe, expect, it } from 'vitest';
import { exportBuilder, exportFilename, exportReviewer } from '../../src/core/export';
import type { Comment, ReviewerStore } from '../../src/core/types';

function makeComment(partial: Partial<Comment> & Pick<Comment, 'id' | 'route' | 'text'>): Comment {
  return {
    createdAt: '2026-04-15T14:24:00Z',
    updatedAt: '2026-04-15T14:24:00Z',
    fullUrl: `http://x${partial.route}`,
    modality: 'text',
    anchor: {
      selectors: {
        testid: 'primary-cta',
        id: null,
        css: 'main > section:nth-of-type(1) > button.cta-primary',
        xpath: '/html/body/main/section[1]/button[1]',
      },
      textFingerprint: 'Get started for free',
      positionPercent: { x: 47.2, y: 38.1 },
      viewport: { width: 390, height: 844 },
    },
    ...partial,
  };
}

const sarah: ReviewerStore = {
  reviewer: 'Sarah',
  project: 'my-prototype',
  createdAt: '2026-04-15T14:20:00Z',
  comments: [
    makeComment({ id: 'cmt_1', route: '/', text: 'This CTA gets lost against the background.' }),
    makeComment({
      id: 'cmt_2',
      route: '/',
      text: 'Headline is doing too much.',
      createdAt: '2026-04-15T14:31:00Z',
      updatedAt: '2026-04-15T14:31:00Z',
      anchor: {
        selectors: {
          testid: null,
          id: null,
          css: 'main > header > h1',
          xpath: '/html/body/main/header/h1',
        },
        textFingerprint: 'Welcome to Sensavera',
        positionPercent: { x: 12, y: 50 },
        viewport: { width: 1440, height: 900 },
      },
    }),
    makeComment({ id: 'cmt_3', route: '/pricing', text: 'Confusing pricing tier.' }),
  ],
};

describe('exportReviewer', () => {
  it('matches spec §7.1 structure', () => {
    const md = exportReviewer(sarah, {
      generatedAt: '2026-04-15T14:45:00Z',
      project: 'my-prototype',
    });
    expect(md).toContain('# Feedback for my-prototype — from Sarah');
    expect(md).toContain('Generated: 2026-04-15T14:45:00Z');
    expect(md).toContain('Reviewer: Sarah');
    expect(md).toContain('Total comments: 3');
    expect(md).toContain('Routes covered: /, /pricing');
    expect(md).toContain('## Route: /');
    expect(md).toContain('### Comment 1 — 2026-04-15T14:24:00Z');
    expect(md).toContain(
      '**Element:** `<button data-testid="primary-cta">` ("Get started for free")',
    );
    expect(md).toContain('- testid: `primary-cta`');
    expect(md).toContain('**Position:** 47% from left, 38% from top of element');
    expect(md).toContain('**Viewport at time of comment:** 390×844 (mobile)');
    expect(md).toContain('> This CTA gets lost against the background.');
    expect(md).toMatchSnapshot();
  });
});

describe('exportBuilder', () => {
  const mike: ReviewerStore = {
    reviewer: 'Mike',
    project: 'my-prototype',
    createdAt: '2026-04-15T14:20:00Z',
    comments: [makeComment({ id: 'cmt_m1', route: '/signup', text: 'Form has too many fields.' })],
  };

  it('matches spec §7.2 structure', () => {
    const md = exportBuilder([sarah, mike], {
      generatedAt: '2026-04-15T14:45:00Z',
      project: 'my-prototype',
    });
    expect(md).toContain('# Feedback for my-prototype');
    expect(md).toContain('Reviewers: Sarah, Mike (2 total, 4 comments)');
    expect(md).toContain('## Summary');
    expect(md).toContain('- Sarah — 3 comments');
    expect(md).toContain('- Mike — 1 comments');
    expect(md).toContain('### Comment 1 — Sarah, 2026-04-15T14:24:00Z');
    expect(md).toMatchSnapshot();
  });

  it('routes ordered by comment count descending', () => {
    const md = exportBuilder([sarah, mike], {
      generatedAt: '2026-04-15T14:45:00Z',
      project: 'my-prototype',
    });
    const routeOrder = [...md.matchAll(/## Route: (\S+)/g)].map((m) => m[1]);
    expect(routeOrder[0]).toBe('/'); // 2 comments
  });
});

describe('exportFilename', () => {
  it('reviewer variant', () => {
    expect(exportFilename('reviewer', 'p', 'Sarah', '2026-04-15T14:45:00Z')).toBe(
      'pinflow-feedback-Sarah-p-2026-04-15T14-45-00Z.md',
    );
  });
  it('builder variant', () => {
    expect(exportFilename('builder', 'p', null, '2026-04-15T14:45:00Z')).toBe(
      'pinflow-feedback-p-aggregate-2026-04-15T14-45-00Z.md',
    );
  });
});
