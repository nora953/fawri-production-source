import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareReviewedEmptyDeviceCandidate as prepare, ReviewIssuanceCandidateError } from './p0-reviewed-device-issuer-candidate.mjs';

const time = Date.parse('2026-10-27T08:00:00.000Z');
function fixture() {
  const request = { merchantId: 'merchant-a', stationId: 'station-a', deviceId: 'device-a', reviewReference: 'review-a' };
  const principal = { subjectId: 'reviewer-a', sessionId: 'session-a' };
  const authorization = {
    status: 'APPROVED', adoptedModel: 'OWNER_ADMIN_ONLY_INITIAL_REVIEW',
    policyDecisionReference: 'synthetic-policy-only', policyRevision: 'revision-1',
    ...principal, selection: { ...request }, revoked: false,
    expiresAt: '2026-10-27T08:05:00.000Z',
  };
  const observation = {
    version: 1, kind: 'independent_empty_device_observation', ...request,
    reviewerSubjectId: principal.subjectId, observedAt: '2026-10-27T07:59:00.000Z',
    localCounter: 0, pendingOperations: 0,
  };
  const calls = [];
  const adapters = {
    now: () => time,
    authenticateReviewer: async () => { calls.push('identity'); return principal; },
    authorizeReviewer: async (p, s) => {
      calls.push('authorization');
      assert.deepEqual(p, principal);
      assert.deepEqual(s, request);
      assert.ok(Object.isFrozen(p)); assert.ok(Object.isFrozen(s));
      return authorization;
    },
    readOriginalEvidence: async (p, s) => {
      calls.push('evidence'); assert.deepEqual(p, principal); assert.deepEqual(s, request);
      return { custodyVerified: true, evidenceReference: 'synthetic-original-a', bytes: Buffer.from(JSON.stringify(observation)) };
    },
  };
  return { request, principal, authorization, observation, calls, adapters };
}
async function refused(f, code) {
  await assert.rejects(() => prepare(f.request, f.adapters), error =>
    error instanceof ReviewIssuanceCandidateError && error.code === code);
}

test('synthetic authorized binding derives reviewer/hash/time and exposes only primitive input fields', async () => {
  const f = fixture(); const value = await prepare(f.request, f.adapters);
  assert.deepEqual(value, {
    ...f.request,
    reviewerReference: 'reviewer_subject_v1_' + createHash('sha256').update('cashier-reviewer-subject-v1\0reviewer-a').digest('hex'),
    evidenceSha256: createHash('sha256').update(JSON.stringify(f.observation)).digest('hex'),
    reviewedAt: f.observation.observedAt, reviewedLocalCounter: 0, reviewedPendingOperations: 0,
  });
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(f.calls, ['identity', 'authorization', 'evidence', 'authorization']);
  assert.ok(!JSON.stringify(value).includes('session-a'));
  assert.ok(!JSON.stringify(value).includes('synthetic-original-a'));
});

test('both model names require an explicit synthetic adapter approval; neither is selected by the candidate', async () => {
  for (const model of ['OWNER_ADMIN_ONLY_INITIAL_REVIEW', 'EXPLICITLY_APPOINTED_REVIEWERS']) {
    const f = fixture(); f.authorization.adoptedModel = model;
    assert.equal((await prepare(f.request, f.adapters)).merchantId, 'merchant-a');
  }
});

for (const key of ['reviewerReference', 'role', 'evidenceSha256', 'reviewedAt', 'reviewedLocalCounter', 'pendingOperations']) {
  test('client cannot supply authority field ' + key, async () => {
    const f = fixture(); f.request[key] = 'forged'; await refused(f, 'REQUEST'); assert.deepEqual(f.calls, []);
  });
}
for (const value of [null, [], {}, 'request', { merchantId: 'x' }]) {
  test('malformed request refused: ' + JSON.stringify(value), async () => {
    const f = fixture(); f.request = value; await refused(f, 'REQUEST'); assert.deepEqual(f.calls, []);
  });
}
for (const value of ['', ' x', 'x\n', 'ｘ', 'a'.repeat(201), 1]) {
  test('noncanonical identity refused: ' + JSON.stringify(value), async () => {
    const f = fixture(); f.request.deviceId = value; await refused(f, 'REQUEST');
  });
}
test('missing trusted adapter refused before authentication', async () => {
  const f = fixture(); delete f.adapters.authorizeReviewer; await refused(f, 'ADAPTERS'); assert.deepEqual(f.calls, []);
});
test('missing authenticated subject is refused', async () => {
  const f = fixture(); f.adapters.authenticateReviewer = async () => ({ role: 'owner_admin' }); await refused(f, 'IDENTITY');
});
for (const [key, value] of [
  ['status', 'UNAPPROVED'], ['adoptedModel', null], ['adoptedModel', 'owner_admin'],
  ['policyDecisionReference', null], ['policyRevision', null], ['revoked', true],
  ['subjectId', 'other-reviewer'], ['sessionId', 'other-session'],
  ['expiresAt', '2026-10-27T08:00:00.000Z'],
]) {
  test('unapproved/stale/foreign authorization refused: ' + key + '=' + value, async () => {
    const f = fixture(); f.authorization[key] = value; await refused(f, 'AUTHORIZATION'); assert.ok(!f.calls.includes('evidence'));
  });
}
for (const key of ['merchantId', 'stationId', 'deviceId', 'reviewReference']) {
  test('authorization cannot cross binding ' + key, async () => {
    const f = fixture(); f.authorization.selection[key] = 'foreign'; await refused(f, 'AUTHORIZATION');
  });
  test('original evidence cannot cross binding ' + key, async () => {
    const f = fixture(); f.observation[key] = 'foreign'; await refused(f, 'EVIDENCE_BINDING');
  });
}
test('evidence cannot name a different authenticated reviewer', async () => {
  const f = fixture(); f.observation.reviewerSubjectId = 'foreign'; await refused(f, 'EVIDENCE_BINDING');
});
for (const key of ['localCounter', 'pendingOperations']) {
  for (const value of [1, '0', null]) {
    test('fresh-empty proof rejects ' + key + '=' + JSON.stringify(value), async () => {
      const f = fixture(); f.observation[key] = value; await refused(f, 'NOT_EMPTY');
    });
  }
}
test('missing custody verification refuses original', async () => {
  const f = fixture(); f.adapters.readOriginalEvidence = async () => ({ custodyVerified: false, evidenceReference: 'a', bytes: Buffer.from('{}') });
  await refused(f, 'EVIDENCE_SOURCE');
});
for (const bytes of [Buffer.alloc(0), Buffer.alloc(16385), 'not bytes']) {
  test('invalid or oversized original bytes refused: ' + (bytes.length ?? 'type'), async () => {
    const f = fixture(); f.adapters.readOriginalEvidence = async () => ({ custodyVerified: true, evidenceReference: 'a', bytes });
    await refused(f, 'EVIDENCE_SOURCE');
  });
}
for (const makeBytes of [
  o => Buffer.from(JSON.stringify(o) + '\n'),
  o => Buffer.from(JSON.stringify(o).replace('"localCounter":0', '"localCounter":99,"localCounter":0')),
  o => Buffer.from(JSON.stringify(o).replace('merchant-a', '\\u006derchant-a')),
  () => Buffer.from([0xff]),
  () => Buffer.from('{'),
]) {
  test('ambiguous/malformed original encoding refused #' + makeBytes.toString().slice(-35), async () => {
    const f = fixture(); f.adapters.readOriginalEvidence = async () => ({ custodyVerified: true, evidenceReference: 'a', bytes: makeBytes(f.observation) });
    await refused(f, 'EVIDENCE_ENCODING');
  });
}
test('extra observation field refused', async () => {
  const f = fixture(); f.observation.baselineImport = 12; await refused(f, 'EVIDENCE_ENCODING');
});
for (const observedAt of ['2026-10-27T07:44:59.999Z', '2026-10-27T08:01:00.001Z', '2026-10-27', 'invalid']) {
  test('stale/future/noncanonical observation time refused: ' + observedAt, async () => {
    const f = fixture(); f.observation.observedAt = observedAt; await refused(f, 'EVIDENCE_TIME');
  });
}
test('exact SQL freshness boundary times can be prepared; SQL still checks commit time', async () => {
  for (const observedAt of ['2026-10-27T07:45:00.000Z', '2026-10-27T08:01:00.000Z']) {
    const f = fixture(); f.observation.observedAt = observedAt;
    assert.equal((await prepare(f.request, f.adapters)).reviewedAt, observedAt);
  }
});
test('revocation during evidence read prevents issuance', async () => {
  const f = fixture(); const read = f.adapters.readOriginalEvidence;
  f.adapters.readOriginalEvidence = async (...args) => { const original = await read(...args); f.authorization.revoked = true; return original; };
  await refused(f, 'AUTHORIZATION');
});
test('policy revision changes during evidence read prevent issuance', async () => {
  const f = fixture(); const read = f.adapters.readOriginalEvidence;
  f.adapters.readOriginalEvidence = async (...args) => { const original = await read(...args); f.authorization.policyRevision = 'revision-2'; return original; };
  await refused(f, 'AUTHORIZATION_CHANGED');
});
test('evidence aging out while final authorization waits prevents issuance', async () => {
  const f = fixture(); let clock = time; f.adapters.now = () => clock;
  let checks = 0; const authorize = f.adapters.authorizeReviewer;
  f.adapters.authorizeReviewer = async (...args) => {
    if (++checks === 2) clock += 15 * 60_000;
    f.authorization.expiresAt = '2026-10-27T09:00:00.000Z'; return authorize(...args);
  };
  await refused(f, 'EVIDENCE_TIME');
});
test('clock regression refused', async () => {
  const f = fixture(); let ticks = 0; f.adapters.now = () => ticks++ === 0 ? time : time - 1;
  await refused(f, 'CLOCK');
});
test('original bytes are copied before final authorization can mutate provider buffer', async () => {
  const f = fixture(); const bytes = Buffer.from(JSON.stringify(f.observation)); const originalHash = createHash('sha256').update(bytes).digest('hex');
  f.adapters.readOriginalEvidence = async () => ({ custodyVerified: true, evidenceReference: 'a', bytes });
  let checks = 0; const authorize = f.adapters.authorizeReviewer;
  f.adapters.authorizeReviewer = async (...args) => { if (++checks === 2) bytes.fill(0); return authorize(...args); };
  assert.equal((await prepare(f.request, f.adapters)).evidenceSha256, originalHash);
});
test('client selection is copied before asynchronous authentication', async () => {
  const f = fixture(); const originalRequest = { ...f.request };
  f.adapters.authenticateReviewer = async () => { f.request.deviceId = 'changed'; return f.principal; };
  f.adapters.authorizeReviewer = async (_principal, selection) => { assert.deepEqual(selection, originalRequest); return f.authorization; };
  f.adapters.readOriginalEvidence = async (_principal, selection) => {
    assert.deepEqual(selection, originalRequest);
    return { custodyVerified: true, evidenceReference: 'a', bytes: Buffer.from(JSON.stringify(f.observation)) };
  };
  assert.equal((await prepare(f.request, f.adapters)).deviceId, originalRequest.deviceId);
});
for (const name of ['authenticateReviewer', 'authorizeReviewer', 'readOriginalEvidence']) {
  test('trusted adapter failure has no original data in outward error: ' + name, async () => {
    const f = fixture(); f.adapters[name] = async () => { throw new Error('sensitive-original-and-session'); };
    await assert.rejects(() => prepare(f.request, f.adapters), error => {
      assert.equal(error.code, 'ADAPTER_FAILURE'); assert.ok(!error.stack.includes('sensitive-original-and-session')); return true;
    });
  });
}
