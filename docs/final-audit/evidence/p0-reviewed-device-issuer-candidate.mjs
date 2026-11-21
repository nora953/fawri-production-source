// Source-only candidate. No HTTP route, pool, SQL, grant or production import.
// All adapters below are trusted SERVER dependencies, never request values.
import { createHash } from 'node:crypto';

export class ReviewIssuanceCandidateError extends Error {
  constructor(code) {
    super('Reviewed device issuance candidate refused: ' + code);
    this.name = 'ReviewIssuanceCandidateError';
    this.code = code;
  }
}

const selectionKeys = ['merchantId', 'stationId', 'deviceId', 'reviewReference'];
const observationKeys = [
  'version', 'kind', ...selectionKeys, 'reviewerSubjectId', 'observedAt',
  'localCounter', 'pendingOperations',
];
const models = ['OWNER_ADMIN_ONLY_INITIAL_REVIEW', 'EXPLICITLY_APPOINTED_REVIEWERS'];
const fail = code => { throw new ReviewIssuanceCandidateError(code); };
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => isRecord(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 &&
  value === value.normalize('NFKC').trim() && !/[\u0000-\u001f\u007f]/.test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const sameSelection = (value, selection) => exactKeys(value, selectionKeys) &&
  selectionKeys.every(key => value[key] === selection[key]);

// Produces data for the existing internal enrollment primitive, not permission
// to invoke it. The current application does not import this candidate.
// Adapters must authenticate the server session, enforce the adopted policy,
// revocation and assignment, and retrieve an independently verified ORIGINAL.
// Their return values are trust assumptions; booleans are not authentication.
export async function prepareReviewedEmptyDeviceCandidate(request, adapters) {
  if (!exactKeys(request, selectionKeys) || !selectionKeys.every(key => id(request[key]))) fail('REQUEST');
  const selection = Object.freeze(Object.fromEntries(selectionKeys.map(key => [key, request[key]])));
  for (const name of ['authenticateReviewer', 'authorizeReviewer', 'readOriginalEvidence', 'now']) {
    if (typeof adapters?.[name] !== 'function') fail('ADAPTERS');
  }
  // Capture the trusted functions before the first await. Dependency injection
  // belongs to the server composition root, not a client-provided JSON object.
  const { authenticateReviewer, authorizeReviewer, readOriginalEvidence, now } = adapters;
  const trustedCall = async (callback, ...args) => {
    try { return await callback(...args); }
    catch { fail('ADAPTER_FAILURE'); }
  };
  const currentTime = () => {
    let value;
    try { value = now(); } catch { fail('CLOCK'); }
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) fail('CLOCK');
    return value;
  };
  const startedAt = currentTime();
  const authenticated = await trustedCall(authenticateReviewer);
  if (!isRecord(authenticated) || !id(authenticated.subjectId) || !id(authenticated.sessionId)) fail('IDENTITY');
  const principal = Object.freeze({ subjectId: authenticated.subjectId, sessionId: authenticated.sessionId });
  const checkAuthorization = value => {
    if (!isRecord(value) || value.status !== 'APPROVED' || !models.includes(value.adoptedModel) ||
        !id(value.policyDecisionReference) || !id(value.policyRevision) ||
        value.subjectId !== principal.subjectId || value.sessionId !== principal.sessionId ||
        !sameSelection(value.selection, selection) || value.revoked !== false ||
        !instant(value.expiresAt) || Date.parse(value.expiresAt) <= currentTime()) fail('AUTHORIZATION');
    return Object.freeze({
      adoptedModel: value.adoptedModel, policyDecisionReference: value.policyDecisionReference,
      policyRevision: value.policyRevision,
    });
  };
  const initialAuthorization = checkAuthorization(await trustedCall(authorizeReviewer, principal, selection));
  const original = await trustedCall(readOriginalEvidence, principal, selection);
  // A bounded, immutable copy avoids mutation during a later authorization await.
  if (!isRecord(original) || original.custodyVerified !== true || !id(original.evidenceReference) ||
      !(original.bytes instanceof Uint8Array) || original.bytes.byteLength === 0 ||
      original.bytes.byteLength > 16384) fail('EVIDENCE_SOURCE');
  const bytes = Buffer.from(original.bytes);
  let observation;
  try {
    observation = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { fail('EVIDENCE_ENCODING'); }
  // One compact JSON representation: rejects duplicate keys, whitespace, BOM,
  // invalid UTF-8 and alternate escaping. This is NOT a signature verifier.
  if (!Buffer.from(JSON.stringify(observation), 'utf8').equals(bytes) ||
      !exactKeys(observation, observationKeys)) fail('EVIDENCE_ENCODING');
  if (observation.version !== 1 || observation.kind !== 'independent_empty_device_observation' ||
      !selectionKeys.every(key => observation[key] === selection[key]) ||
      observation.reviewerSubjectId !== principal.subjectId) fail('EVIDENCE_BINDING');
  if (observation.localCounter !== 0 || observation.pendingOperations !== 0) fail('NOT_EMPTY');
  if (!instant(observation.observedAt)) fail('EVIDENCE_TIME');
  const validateFreshness = () => {
    const time = currentTime();
    if (time < startedAt) fail('CLOCK');
    const observed = Date.parse(observation.observedAt);
    // Same outer bounds as the proposal SQL. SQL remains the final check and
    // may refuse an item that ages out between preparation and its transaction.
    if (observed < time - 15 * 60_000 || observed > time + 60_000) fail('EVIDENCE_TIME');
  };
  validateFreshness();
  const finalAuthorization = checkAuthorization(await trustedCall(authorizeReviewer, principal, selection));
  if (Object.keys(initialAuthorization).some(key =>
    finalAuthorization[key] !== initialAuthorization[key])) fail('AUTHORIZATION_CHANGED');
  validateFreshness();
  return Object.freeze({
    ...selection,
    reviewerReference: 'reviewer_subject_v1_' + digest('cashier-reviewer-subject-v1\0' + principal.subjectId),
    evidenceSha256: digest(bytes), reviewedAt: observation.observedAt,
    reviewedLocalCounter: 0, reviewedPendingOperations: 0,
  });
}
