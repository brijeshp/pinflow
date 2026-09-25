import { afterEach, expect, it } from 'vitest';
import { buildAnchor, resolveAnchor } from '../../src/core/anchor';
import { exportReviewer } from '../../src/core/export';
import { normalizeComments } from '../../src/core/storage';
import type { Comment } from '../../src/core/types';

afterEach(() => {
  document.body.innerHTML = '';
});
const comment = (anchor: ReturnType<typeof buildAnchor>): Comment => ({
  id: 'c',
  text: 'Fix this',
  route: '/',
  fullUrl: 'https://example.com/',
  createdAt: 'now',
  updatedAt: 'now',
  modality: 'text',
  anchor,
});

it('keeps textless controls bound to their named repeated owner across filtering and reordering', () => {
  document.body.innerHTML =
    '<ul><li data-testid="item">Alpha<input data-testid="toggle" type="checkbox"></li><li data-testid="item">Bravo<input data-testid="toggle" type="checkbox" checked></li><li data-testid="item">Charlie<input data-testid="toggle" type="checkbox"></li></ul>';
  const row = document.querySelectorAll('li')[1]!;
  const input = row.querySelector('input')!;
  const a = buildAnchor(input, 0, 0);
  row.remove();
  expect(resolveAnchor(a)).toBeNull();
  document.querySelector('ul')!.prepend(row);
  expect(resolveAnchor(a)).toBe(input);
  row.firstChild!.textContent = 'Different entity';
  expect(resolveAnchor(a)).toBeNull();
});

it('keeps a nested action inside its modal instead of promoting it to a root testid', () => {
  document.body.innerHTML =
    '<main data-testid="app"><div role="dialog" aria-label="Billing"><button><span>Save</span></button></div></main>';
  const a = buildAnchor(document.querySelector('span')!, 0, 0);
  expect(a.selectors.testid).not.toBe('app');
  expect(a.context?.role).toBe('button');
  expect(a.layer?.name).toBe('Billing');
  document.querySelector('[role="dialog"]')!.setAttribute('hidden', '');
  expect(resolveAnchor(a)).toBeNull();
});

it('resolves an open-shadow control after capture and hydration without targeting its host', () => {
  const host = document.createElement('div');
  host.id = 'widget';
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button id="inner">Refresh report</button>';
  const button = shadow.querySelector('button')!;
  const a = buildAnchor(button, 0, 0);
  expect(resolveAnchor(a)).toBe(button);
  const normalized = normalizeComments([comment(a)]);
  expect(resolveAnchor(normalized[0]!.anchor)).toBe(button);
  shadow.innerHTML = '';
  expect(resolveAnchor(a)).toBeNull();
});

it('retains historical selection and viewport for parked feedback', () => {
  document.body.innerHTML = '<button>Save</button>';
  const c = comment(buildAnchor(document.querySelector('button')!, 0, 0));
  c.scope = {
    gen: 3,
    rung: 'landmark',
    confidence: 'medium',
    boundary: { tag: 'dialog', css: '#billing' },
    members: [{ tag: 'button', css: '#save', band: 'inside' }],
  };
  const md = exportReviewer(
    { reviewer: 'Test', project: 'audit', createdAt: 'now', comments: [c] },
    { project: 'audit', generatedAt: 'now' },
    () => true,
  );
  expect(md).toContain('#billing');
  expect(md).toContain('#save');
  expect(md).toContain('Viewport');
  expect(md).not.toContain('Their elements no longer exist');
  expect(md).not.toContain('this note may alter');
});

it('reports current match evidence separately from historical scope confidence', () => {
  document.body.innerHTML = '<button id="save">Save</button>';
  const c = comment(buildAnchor(document.querySelector('button')!, 0, 0));
  const report: import('../../src/core/types').TargetResolution = { availability: 'unresolved' };
  resolveAnchor(c.anchor, document, report);
  expect(report).toMatchObject({ availability: 'matched', rung: 'id', owner: 'not-recorded' });
  const store = { reviewer: 'Test', project: 'audit', createdAt: 'now', comments: [c] };
  const md = exportReviewer(
    store,
    { project: 'audit', generatedAt: 'now', resolve: () => report },
    () => false,
  );
  expect(md).toContain('Current target');
  expect(md).toContain('matched');
  const other = exportReviewer(store, { project: 'audit', generatedAt: 'now' }, () => false);
  expect(other).toContain('not-checked');
});

it('does not substitute the last remaining identically named owner for a removed stable entity', () => {
  document.body.innerHTML = '<ul><li id="one">Alex<input></li><li id="two">Alex<input></li></ul>';
  const a = buildAnchor(document.querySelector('#two input')!, 0, 0);
  document.querySelector('#two')!.remove();
  expect(resolveAnchor(a)).toBeNull();
});
it('parks ambiguous owner labels even when filtering leaves a single lookalike', () => {
  document.body.innerHTML = '<ul><li>Alex<input></li><li>Alex<input></li></ul>';
  const a = buildAnchor(document.querySelectorAll('input')[1]!, 0, 0);
  document.querySelectorAll('li')[1]!.remove();
  expect(resolveAnchor(a)).toBeNull();
});

it('parks a control hidden by an ancestor across an open shadow boundary', () => {
  const host = document.createElement('section');
  host.id = 'widget';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<button id="save">Save</button>';
  const a = buildAnchor(root.querySelector('button')!, 0, 0);
  host.hidden = true;
  expect(resolveAnchor(a)).toBeNull();
  host.hidden = false;
  expect(resolveAnchor(a)).toBe(root.querySelector('button'));
});

it('keeps export-time JSON diagnostics outside the authored comment', async () => {
  const { exportJSON } = await import('../../src/core/export');
  document.body.innerHTML = '<button>Save</button>';
  const c = comment(buildAnchor(document.querySelector('button')!, 0, 0));
  const json = JSON.parse(
    exportJSON({ project: 'audit', reviewer: 'Sam', createdAt: 'now', comments: [c] }, () => ({
      availability: 'unresolved',
      owner: 'unresolved',
    })),
  );
  expect(json.comments[0]).toEqual({ ...c, reviewer: 'Sam' });
  expect(json.targetResolution).toEqual([
    { commentId: 'c', reviewer: 'Sam', availability: 'unresolved', owner: 'unresolved' },
  ]);
  expect(c).not.toHaveProperty('targetResolution');
});
