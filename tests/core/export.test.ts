import { describe, expect, it } from 'vitest';
import { exportBuilder, exportFilename, exportJSON, exportReviewer } from '../../src/core/export';
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
    const md = exportReviewer(
      sarah,
      { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' },
      () => false,
    );
    expect(md).toContain('# Feedback for my-prototype — from Sarah');
    expect(md).toContain('Generated: 2026-04-15T14:45:00Z');
    expect(md).toContain('Reviewer: Sarah');
    expect(md).toContain('Total comments: 3');
    expect(md).toContain('Routes covered: /, /pricing');
    expect(md).toContain('## Route: /');
    expect(md).toContain('### [cmt_1] Comment 1 — 2026-04-15T14:24:00Z');
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
    const md = exportBuilder(
      [sarah, mike],
      { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' },
      () => false,
    );
    expect(md).toContain('# Feedback for my-prototype');
    expect(md).toContain('Reviewers: Sarah, Mike (2 total, 4 comments)');
    expect(md).toContain('## Summary');
    expect(md).toContain('- Sarah — 3 comments');
    expect(md).toContain('- Mike — 1 comments');
    expect(md).toContain('### [cmt_1] Comment 1 — Sarah, 2026-04-15T14:24:00Z');
    expect(md).toMatchSnapshot();
  });

  it('routes ordered by comment count descending', () => {
    const md = exportBuilder(
      [sarah, mike],
      { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' },
      () => false,
    );
    const routeOrder = [...md.matchAll(/## Route: (\S+)/g)].map((m) => m[1]);
    expect(routeOrder[0]).toBe('/'); // 2 comments
  });
});

describe('disposition in comment headings', () => {
  const meta = { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' };

  it('suffixes — done / — declined only when a disposition exists', () => {
    const store: ReviewerStore = {
      ...sarah,
      comments: [
        makeComment({ id: 'cmt_d', route: '/', text: 'a', status: 'done' }),
        makeComment({ id: 'cmt_x', route: '/', text: 'b', status: 'declined' }),
        makeComment({ id: 'cmt_o', route: '/', text: 'c', status: 'open' }),
        makeComment({ id: 'cmt_n', route: '/', text: 'd' }),
      ],
    };
    const md = exportReviewer(store, meta, () => false);
    expect(md).toContain('### [cmt_d] Comment 1 — 2026-04-15T14:24:00Z — done');
    expect(md).toContain('### [cmt_x] Comment 2 — 2026-04-15T14:24:00Z — declined');
    expect(md).toContain('### [cmt_o] Comment 3 — 2026-04-15T14:24:00Z\n');
    expect(md).toContain('### [cmt_n] Comment 4 — 2026-04-15T14:24:00Z\n');
  });
});

describe('element context in exports', () => {
  const meta = { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' };

  it('renders a human context line when anchor.context exists', () => {
    const store: ReviewerStore = {
      ...sarah,
      comments: [
        makeComment({
          id: 'cmt_ctx',
          route: '/',
          text: 'x',
          anchor: {
            ...sarah.comments[0]!.anchor,
            context: { name: 'Continue', role: 'button', heading: 'Next section' },
          },
        }),
      ],
    };
    const md = exportReviewer(store, meta, () => false);
    expect(md).toContain('**Context:** the ‘Continue’ button under ‘Next section’');
  });

  it('degrades without name/heading and is omitted without context', () => {
    const store: ReviewerStore = {
      ...sarah,
      comments: [
        makeComment({
          id: 'cmt_role',
          route: '/',
          text: 'x',
          anchor: { ...sarah.comments[0]!.anchor, context: { role: 'input' } },
        }),
        makeComment({ id: 'cmt_none', route: '/', text: 'y' }),
      ],
    };
    const md = exportReviewer(store, meta, () => false);
    expect(md).toContain('**Context:** the input\n');
    expect(md.match(/\*\*Context:\*\*/g)).toHaveLength(1);
  });
});

describe('describeRoute frame labels', () => {
  const meta = { generatedAt: '2026-04-15T14:45:00Z', project: 'my-prototype' };
  const label = (key: string): string => (key === '/' ? 'Landing page' : '');

  it('reviewer export renders the label heading with the key in backticks beneath', () => {
    const md = exportReviewer(sarah, meta, () => false, label);
    expect(md).toContain('## Landing page\n`/`');
    expect(md).not.toContain('## Route: /\n');
    // No label for /pricing — heading unchanged.
    expect(md).toContain('## Route: /pricing');
  });

  it('builder export renders labels too', () => {
    const md = exportBuilder([sarah], meta, () => false, label);
    expect(md).toContain('## Landing page\n`/`');
  });

  it('headings are unchanged when describeRoute is not given', () => {
    const md = exportReviewer(sarah, meta, () => false);
    expect(md).toContain('## Route: /');
  });
});

describe('exportFilename', () => {
  it('reviewer variant', () => {
    expect(exportFilename('p', 'Sarah', '2026-04-15T14:45:00Z')).toBe(
      'pinflow-feedback-Sarah-p-2026-04-15T14-45-00Z.md',
    );
  });
  it('builder variant', () => {
    expect(exportFilename('p', null, '2026-04-15T14:45:00Z')).toBe(
      'pinflow-feedback-p-aggregate-2026-04-15T14-45-00Z.md',
    );
  });
  it('custom extension', () => {
    expect(exportFilename('p', null, '2026-04-15T14:45:00Z', 'json')).toBe(
      'pinflow-feedback-p-aggregate-2026-04-15T14-45-00Z.json',
    );
  });
});

describe('exportJSON', () => {
  const mike: ReviewerStore = {
    reviewer: 'Mike',
    project: 'my-prototype',
    createdAt: '2026-04-15T14:20:00Z',
    comments: [makeComment({ id: 'cmt_m1', route: '/signup', text: 'Form has too many fields.' })],
  };

  it('emits a versioned, flattened corpus for an array of stores', () => {
    const parsed = JSON.parse(exportJSON([sarah, mike]));
    expect(parsed.pinflowExport).toBe(3);
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.comments).toHaveLength(4);
    expect(parsed.comments[0]).toMatchObject({ id: 'cmt_1', reviewer: 'Sarah' });
    expect(parsed.comments[3]).toMatchObject({ id: 'cmt_m1', reviewer: 'Mike' });
  });

  it('accepts a single store and carries disposition fields through', () => {
    const store: ReviewerStore = {
      ...sarah,
      comments: [
        makeComment({ id: 'cmt_d', route: '/', text: 'a', status: 'done', resolution: 'Fixed.' }),
      ],
    };
    const parsed = JSON.parse(exportJSON(store));
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0]).toMatchObject({
      reviewer: 'Sarah',
      status: 'done',
      resolution: 'Fixed.',
    });
  });
});

it('renders the resolution note in the comment block when present', async () => {
  const { exportBuilder } = await import('../../src/core/export');
  const store = {
    reviewer: 'R1',
    project: 'p',
    createdAt: '2026-07-07T00:00:00.000Z',
    comments: [
      {
        id: 'c_res',
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
        route: '/x',
        fullUrl: 'https://x/x',
        text: 'fix this',
        modality: 'text' as const,
        status: 'done' as const,
        resolution: 'Shipped in v2.1.',
        anchor: {
          selectors: { testid: null, id: null, css: 'p', xpath: '/p' },
          textFingerprint: '',
          positionPercent: { x: 1, y: 2 },
          viewport: { width: 100, height: 100 },
        },
      },
    ],
  };
  const md = exportBuilder([store], { generatedAt: 'now', project: 'p' }, () => false);
  expect(md).toContain('— done');
  expect(md).toContain('**Resolution:** Shipped in v2.1.');
});

it('renders the visual snapshot (Computed/Image lines) in comment blocks', async () => {
  const { exportReviewer } = await import('../../src/core/export');
  const store = {
    reviewer: 'R1',
    project: 'p',
    createdAt: '2026-07-11T00:00:00.000Z',
    comments: [
      {
        id: 'c_vis',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
        route: '/x',
        fullUrl: 'https://x/x',
        text: 'this background feels muddy',
        modality: 'text' as const,
        anchor: {
          selectors: { testid: null, id: null, css: 'div.hero', xpath: '/div' },
          textFingerprint: '',
          positionPercent: { x: 40, y: 20 },
          viewport: { width: 1280, height: 800 },
          context: {
            role: 'img',
            heading: 'Welcome',
            src: 'https://cdn.example.com/hero.jpg',
            styles: {
              background: 'rgb(241, 250, 238)',
              color: 'rgb(26, 35, 50)',
              fontSize: '17px',
              fontFamily: 'DM Sans',
              radius: '14px',
            },
          },
        },
      },
    ],
  };
  const md = exportReviewer(store, { generatedAt: 'now', project: 'p' }, () => false);
  expect(md).toContain(
    '**Computed:** background rgb(241, 250, 238), text rgb(26, 35, 50), font 17px DM Sans, radius 14px',
  );
  expect(md).toContain('**Image:** https://cdn.example.com/hero.jpg');
});
