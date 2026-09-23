import { describe, expect, it } from 'vitest';
import {
  createVerification,
  feedbackRevision,
  isVerificationCurrent,
  readVerification,
} from '../../src/verification/index';
import type { Comment } from '../../src/core/types';
const comment: Comment = {
  id: 'cmt_checkout',
  createdAt: '2026-09-23',
  updatedAt: '2026-09-23',
  route: '/cart',
  fullUrl: 'https://example.com/cart',
  text: 'Checkout does nothing',
  modality: 'text',
  anchor: {
    selectors: { testid: 'buy', id: null, css: '#buy', xpath: '/html/body/button' },
    textFingerprint: 'Buy',
    positionPercent: { x: 50, y: 50 },
    viewport: { width: 390, height: 844 },
  },
  feedback: {
    steps: ['Add item', 'Select Buy'],
    expected: 'Checkout opens',
    acceptance: ['Checkout heading is visible'],
  },
};
const result = {
  outcome: 'verified' as const,
  interpretation: 'Open checkout when Buy is selected',
  files: ['src/Cart.tsx'],
  checks: [
    {
      name: 'Checkout heading is visible',
      result: 'passed' as const,
      evidence: 'playwright: checkout.spec.ts',
    },
  ],
  assumptions: [],
};

describe('revision-bound verification', () => {
  it('ties a report to exact intent and evidence, independent of object key order', async () => {
    const report = await createVerification(comment, result);
    expect(report.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await isVerificationCurrent(comment, report)).toBe(true);
    expect(
      await feedbackRevision({
        ...comment,
        feedback: {
          acceptance: ['Checkout heading is visible'],
          expected: 'Checkout opens',
          steps: ['Add item', 'Select Buy'],
        },
      }),
    ).toBe(report.revision);
    expect(
      await isVerificationCurrent(
        { ...comment, feedback: { ...comment.feedback, expected: 'Show an error' } },
        report,
      ),
    ).toBe(false);
    expect(await isVerificationCurrent({ ...comment, id: 'another' }, report)).toBe(false);
    expect(comment.status).toBeUndefined();
  });
  it('does not invalidate evidence when selectors are repaired', async () => {
    const report = await createVerification(comment, result);
    const healed = {
      ...comment,
      anchor: {
        ...comment.anchor,
        capturedSelectors: comment.anchor.selectors,
        selectors: { ...comment.anchor.selectors, css: '.new' },
      },
    };
    expect(await isVerificationCurrent(healed, report)).toBe(true);
  });
  it('rejects a claim of verified when checks are missing, failed, or assumptions remain', async () => {
    await expect(createVerification(comment, { ...result, checks: [] })).rejects.toThrow();
    await expect(
      createVerification(comment, { ...result, checks: [{ name: 'click', result: 'failed' }] }),
    ).rejects.toThrow();
    await expect(
      createVerification(comment, { ...result, assumptions: ['Cannot access checkout'] }),
    ).rejects.toThrow();
    await expect(
      createVerification(comment, {
        ...result,
        checks: [{ name: 'Unrelated unit test', result: 'passed' }],
      }),
    ).rejects.toThrow();
  });
  it('allows an honest blocked report and validates untrusted imports', async () => {
    const report = await createVerification(comment, {
      ...result,
      outcome: 'blocked',
      checks: [],
      assumptions: ['No test account'],
    });
    expect(readVerification(JSON.parse(JSON.stringify(report)))).toEqual(report);
    expect(readVerification({ ...report, files: ['../../.env'] })).toBeNull();
    expect(readVerification({ ...report, version: 2 })).toBeNull();
    expect(readVerification({ ...report, checks: [null] })).toBeNull();
    expect(await isVerificationCurrent(comment, { ...report, revision: 'forged' })).toBe(false);
  });
  it('detaches imported reports and rejects invalid evidence shapes without executing anything', async () => {
    const report = await createVerification(comment, result);
    const imported = readVerification({ ...report, command: 'rm -rf anything' });
    expect(imported).not.toHaveProperty('command');
    report.files.push('src/Other.tsx');
    expect(imported!.files).toEqual(['src/Cart.tsx']);
  });
});

it('requires evidence references before accepting a verified claim', async () => {
  await expect(
    createVerification(comment, {
      ...result,
      checks: [{ name: 'Checkout heading is visible', result: 'passed' }],
    }),
  ).rejects.toThrow();
});
