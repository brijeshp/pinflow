import type { Comment } from '../core/types';
import { validateSourcePath } from '../core/source-path';

export interface VerificationInput {
  outcome: 'verified' | 'partial' | 'blocked';
  interpretation: string;
  files: string[];
  /** Name each acceptance criterion verbatim so coverage can be checked. Evidence is a passive reference. */
  checks: { name: string; result: 'passed' | 'failed' | 'not-run'; evidence?: string }[];
  /** Unresolved assumptions prevent a verified outcome. */
  assumptions: string[];
}
export interface VerificationResult extends VerificationInput {
  version: 1;
  commentId: string;
  revision: string;
}

// Canonical key order makes fingerprints independent of JSON producer ordering.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

/** Exact request/evidence identity; locator repair and team disposition are not a new request. Requires Web Crypto. */
export async function feedbackRevision(comment: Comment): Promise<string> {
  const { selectors, capturedSelectors, ...anchor } = comment.anchor;
  const snapshot = canonical({
    id: comment.id,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    route: comment.route,
    fullUrl: comment.fullUrl,
    text: comment.text,
    modality: comment.modality,
    voice: comment.voice,
    feedback: comment.feedback,
    anchor: { ...anchor, selectors: capturedSelectors ?? selectors },
    scope: comment.capturedScope ?? comment.scope,
  });
  // Absent on Node 18 without a flag and in insecure (http, non-localhost)
  // browser contexts; the bare property read would throw an opaque TypeError.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new Error(
      'Pinflow verification requires Web Crypto (crypto.subtle): use a secure browser context, or on Node 18 assign globalThis.crypto from node:crypto webcrypto',
    );
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 1000): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max;
const strings = (v: unknown, cap: number): v is string[] =>
  Array.isArray(v) && v.length <= cap && v.every((item) => text(item));

/** Validate and detach untrusted sidecar JSON. Invalid claims return null, never a partial success. */
export function readVerification(value: unknown): VerificationResult | null {
  if (
    !object(value) ||
    value['version'] !== 1 ||
    !text(value['commentId'], 200) ||
    !text(value['revision']) ||
    !/^sha256:[a-f0-9]{64}$/.test(value['revision'])
  )
    return null;
  const outcome = value['outcome'];
  if (outcome !== 'verified' && outcome !== 'partial' && outcome !== 'blocked') return null;
  if (
    !text(value['interpretation']) ||
    !strings(value['files'], 100) ||
    !value['files'].every((file) => validateSourcePath(file) === file) ||
    !strings(value['assumptions'], 24)
  )
    return null;
  const rawChecks = value['checks'];
  if (!Array.isArray(rawChecks) || rawChecks.length > 100) return null;
  const checks: VerificationResult['checks'] = [];
  for (const check of rawChecks) {
    if (!object(check) || !text(check['name'], 500)) return null;
    const result = check['result'];
    if (result !== 'passed' && result !== 'failed' && result !== 'not-run') return null;
    if (check['evidence'] !== undefined && !text(check['evidence'])) return null;
    checks.push({
      name: check['name'],
      result,
      ...(typeof check['evidence'] === 'string' ? { evidence: check['evidence'] } : {}),
    });
  }
  if (
    outcome === 'verified' &&
    (!checks.length ||
      checks.some((check) => check.result !== 'passed' || !check.evidence) ||
      value['assumptions'].length)
  )
    return null;
  return {
    version: 1,
    commentId: value['commentId'],
    revision: value['revision'],
    outcome,
    interpretation: value['interpretation'],
    files: [...value['files']],
    checks,
    assumptions: [...value['assumptions']],
  };
}

function coversAcceptance(comment: Comment, result: VerificationResult): boolean {
  return (
    result.outcome !== 'verified' ||
    (comment.feedback?.acceptance ?? []).every((criterion) =>
      result.checks.some((check) => check.name === criterion && check.result === 'passed'),
    )
  );
}

/** Builds a report, never runs commands, uploads evidence, or marks a comment done. */
export async function createVerification(
  comment: Comment,
  input: VerificationInput,
): Promise<VerificationResult> {
  const revision = await feedbackRevision(comment);
  const result = readVerification({ ...input, version: 1, commentId: comment.id, revision });
  if (!result || !coversAcceptance(comment, result))
    throw new Error('Invalid verification result or missing acceptance checks');
  return result;
}

/** A valid current report is a claim to review, not proof that its checks actually ran. */
export async function isVerificationCurrent(comment: Comment, value: unknown): Promise<boolean> {
  const result = readVerification(value);
  return (
    !!result &&
    result.commentId === comment.id &&
    coversAcceptance(comment, result) &&
    result.revision === (await feedbackRevision(comment))
  );
}
