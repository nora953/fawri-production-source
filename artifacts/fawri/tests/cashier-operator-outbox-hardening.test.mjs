import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('live cashier entry and manual sync use the operator-aware outbox authority', async () => {
  const entry = await source('src/cashierMain.tsx');
  const page = await source('src/pages/CashierCatalogSyncPage.tsx');

  assert.match(entry, /syncCashierOperatorOutboxToCloud/);
  assert.match(entry, /syncCashierOperatorCatalogFromCloud/);
  assert.doesNotMatch(entry, /syncCashierOutboxToCloud/);
  assert.match(page, /syncCashierOperatorOutboxToCloud/);
  assert.match(page, /syncCashierOperatorCatalogFromCloud/);
  assert.doesNotMatch(page, /syncCashierOutboxToCloud/);
});

test('operator outbox binds every upload to the active merchant station staff shift and device', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /getCashierOperationBinding\(operationId\)/);
  assert.match(sync, /binding\.merchant_id === session\.context\.merchant_id/);
  assert.match(sync, /binding\.station_id === session\.context\.station_id/);
  assert.match(sync, /binding\.staff_id === session\.context\.staff_id/);
  assert.match(sync, /binding\.device_id === session\.context\.device_id/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_BINDING_MISSING/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT/);
  assert.match(sync, /credentials:\s*'omit'/);
  assert.match(sync, /`\/api\/cashier\/operator\/sync\/\$\{kind\}`/);
});

test('operator outbox ACK is complete before local durable operation deletion', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /payload\.operation_id/);
  assert.match(sync, /payload\.device_sequence/);
  assert.match(sync, /payload\.order_id/);
  assert.match(sync, /payload\.accepted_entity_ids/);
  assert.match(sync, /payload\.compensation_kind/);
  assert.match(sync, /CASHIER_OPERATOR_ACK_INVALID/);

  const fetchCall = sync.indexOf("fetch(`/api/cashier/operator/sync/${kind}`");
  const operationAck = sync.indexOf('payload.operation_id', fetchCall);
  const sequenceAck = sync.indexOf('payload.device_sequence', fetchCall);
  const orderAck = sync.indexOf('payload.order_id', fetchCall);
  const entityAck = sync.indexOf('payload.accepted_entity_ids', fetchCall);
  const compensationAck = sync.indexOf('payload.compensation_kind', fetchCall);
  const localAck = sync.indexOf('await authority.acknowledgeSynced([operationId])');

  assert.ok(fetchCall >= 0, 'operator outbox must use the operator sync endpoint');
  assert.ok(operationAck > fetchCall, 'operation identity must be validated after the server response');
  assert.ok(sequenceAck > operationAck, 'device sequence must be part of ACK validation');
  assert.ok(orderAck > sequenceAck, 'canonical order identity must be part of ACK validation');
  assert.ok(entityAck > orderAck, 'every envelope entity must be acknowledged');
  assert.ok(compensationAck > entityAck, 'return/void kind must be confirmed by the server ACK');
  assert.ok(localAck > compensationAck, 'local outbox deletion must happen only after complete ACK validation');
});

test('operator outbox keeps a full boundary operation intact instead of uploading a partial group', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /function completeOperationWindow/);
  assert.match(sync, /batch\.length <= MAX_PENDING_ENVELOPES/);
  assert.match(sync, /listPendingSync\(MAX_PENDING_ENVELOPES \+ 1\)/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_TOO_LARGE/);
  assert.match(sync, /return pending\.slice\(0, firstBoundaryIndex\)/);
});

test('operator outbox fails closed before uploading past an unsupported local sequence', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const guard = sync.indexOf("if (kind === 'skip')");
  const failure = sync.indexOf('CASHIER_OPERATOR_UNSUPPORTED_OPERATION', guard);
  const upload = sync.indexOf('const uploadedResult = await postOperation(', guard);
  assert.ok(guard >= 0, 'unsupported operation branch must exist');
  assert.ok(failure > guard && failure < upload, 'unsupported sequence must fail before subsequent upload');
  assert.doesNotMatch(sync.slice(guard, upload), /skipped\s*\+=\s*1;\s*continue;/);
});

test('operator outbox rejects corrupt per-operation sequence groups before network upload', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('function groupByOperation(');
  const end = sync.indexOf('function completeOperationWindow(', start);
  assert.ok(start >= 0 && end > start);
  const grouping = sync.slice(start, end);
  assert.match(grouping, /list\[0\]\.device_sequence !== envelope\.device_sequence/);
  assert.match(grouping, /Number\.isSafeInteger\(sequence\)/);
  assert.match(grouping, /sequence <= previousSequence/);
  assert.match(grouping, /CASHIER_OPERATOR_OUTBOX_CORRUPT/);
});

test('legacy cashier outbox rejects missing operation identity and invalid sequences', async () => {
  const sync = await source('src/lib/cashierCloudOutboxSync.ts');
  const start = sync.indexOf('function groupPending(');
  const end = sync.indexOf('function classifyOperation(', start);
  assert.ok(start >= 0 && end > start);
  const grouping = sync.slice(start, end);
  assert.match(grouping, /CASHIER_OUTBOX_CORRUPT/);
  assert.match(grouping, /current\[0\]\.device_sequence !== envelope\.device_sequence/);
  assert.match(grouping, /Number\.isSafeInteger\(deviceSequence\)/);
  assert.doesNotMatch(grouping, /if \(!operationId\) continue;/);
});

test('live operator outbox rejects envelopes without operation identity', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('function groupByOperation(');
  const end = sync.indexOf('function completeOperationWindow(', start);
  assert.ok(start >= 0 && end > start);
  const grouping = sync.slice(start, end);
  assert.match(grouping, /!envelope\.operation_id/);
  assert.match(grouping, /!String\(envelope\.operation_id\)\.trim\(\)/);
  assert.match(grouping, /CASHIER_OPERATOR_OUTBOX_CORRUPT/);
});

test('operator outbox preflights unsupported operations before any network upload', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const preflight = sync.indexOf('for (const [, envelopes] of groups)');
  const rejection = sync.indexOf('CASHIER_OPERATOR_UNSUPPORTED_OPERATION', preflight);
  const uploadLoop = sync.indexOf('for (const [operationId, envelopes] of groups)', preflight);
  const upload = sync.indexOf('const uploadedResult = await postOperation(', uploadLoop);
  assert.ok(preflight >= 0 && rejection > preflight, 'unsupported operation preflight must reject');
  assert.ok(uploadLoop > rejection && upload > uploadLoop, 'preflight must precede every network upload');
});


test('unsupported operations are rejected across the batch before binding lookups', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('const groups = groupByOperation(uploadable)');
  const firstPreflight = sync.indexOf('for (const [, envelopes] of groups)', start);
  const rejection = sync.indexOf('CASHIER_OPERATOR_UNSUPPORTED_OPERATION', firstPreflight);
  const bindingRead = sync.indexOf('await getCashierOperationBinding(operationId)', start);
  const upload = sync.indexOf('const uploadedResult = await postOperation(', start);
  assert.ok(start >= 0 && firstPreflight > start, 'full-batch preflight must follow grouping');
  assert.ok(rejection > firstPreflight && rejection < bindingRead, 'unsupported operation must be detected before any binding lookup');
  assert.ok(bindingRead < upload, 'binding validation must still precede upload');
});

test('all historical bindings are checked before the first network upload', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('const groups = groupByOperation(uploadable)');
  const bindingLoop = sync.indexOf('for (const [operationId, envelopes] of groups)', start);
  const bindingConflict = sync.indexOf('CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT', bindingLoop);
  const upload = sync.indexOf('const uploadedResult = await postOperation(', start);
  assert.ok(start >= 0 && bindingLoop > start, 'batch binding validation must exist');
  assert.ok(bindingConflict > bindingLoop && bindingConflict < upload, 'cross-staff or station mismatch must reject before network upload');
  assert.doesNotMatch(sync.slice(bindingLoop, upload), /await postOperation\(/, 'preflight must not upload any operation');
});

test('historical shift binding is never rewritten to match a later login before upload', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('const binding = await getCashierOperationBinding(operationId)');
  const upload = sync.indexOf('const uploadedResult = await postOperation(', start);
  assert.ok(start >= 0 && upload > start, 'binding validation must precede upload');
  const gate = sync.slice(start, upload);
  assert.doesNotMatch(gate, /binding\.shift_id (?:===|!==) session\.context\.shift_id/, 'same-staff prior shifts rely on historical server attribution');
  assert.match(gate, /binding\.staff_id (?:===|!==) session\.context\.staff_id/);
  assert.match(gate, /CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT/);
  assert.doesNotMatch(gate, /(?:binding\.shift_id|binding\.staff_id)\s*=(?!=)/, 'original shift and staff must not be reassigned');
  assert.doesNotMatch(gate, /(?:updateCashierOperationBinding|rewriteCashierOperationBinding|setCashierOperationBinding)\s*\(/);
});

test('prior-shift recovery retains original binding and requires the same staff and station', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('const groups = groupByOperation(uploadable)');
  const upload = sync.indexOf('const uploadedResult = await postOperation(', start);
  const preflight = sync.slice(start, upload);
  assert.match(preflight, /binding\.staff_id !== session\.context\.staff_id/);
  assert.match(preflight, /binding\.station_id !== session\.context\.station_id/);
  assert.doesNotMatch(preflight, /binding\.shift_id (?:===|!==) session\.context\.shift_id/);
  assert.doesNotMatch(preflight, /(?:binding\.shift_id|binding\.staff_id)\s*=(?!=)/);
});

test('operator login cannot silently clear pending outbox or rewrite original shift attribution', async () => {
  const session = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const start = session.indexOf('export async function loginCashierOperator(');
  const end = session.indexOf('\nexport async function ', start + 1);
  assert.ok(start >= 0, 'operator login must exist');
  const login = session.slice(start, end < 0 ? undefined : end);
  assert.match(login, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY, JSON\.stringify\(session\)\)/);
  assert.doesNotMatch(login, /acknowledgeSynced\s*\(/);
  assert.doesNotMatch(login, /(?:clear|delete|remove)Pending(?:Sync|Outbox|Operation)/);
  assert.doesNotMatch(login, /(?:updateCashierOperationBinding|rewriteCashierOperationBinding|setCashierOperationBinding)\s*\(/);
});


test('operator outbox never treats a failed or incomplete server ACK as permission to delete local history', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const postStart = sync.indexOf('async function postOperation(');
  const postEnd = sync.indexOf('export async function syncCashierOperatorOutboxToCloud()', postStart);
  assert.ok(postStart >= 0 && postEnd > postStart);
  const post = sync.slice(postStart, postEnd);
  assert.match(post, /if \(!response\.ok \|\| payload\.ok !== true\)/);
  assert.match(post, /if \(acknowledgementInvalid\)/);
  assert.match(post, /CASHIER_OPERATOR_ACK_INVALID/);
  const uploadStart = sync.indexOf('const uploadedResult = await postOperation(', postEnd);
  const ack = sync.indexOf('await authority.acknowledgeSynced([operationId])', uploadStart);
  assert.ok(uploadStart > postEnd && ack > uploadStart, 'local acknowledgement must follow awaited upload');
  const between = sync.slice(uploadStart, ack);
  assert.match(between, /uploadedResult\.operation_id !== operationId/);
  assert.match(between, /CASHIER_OPERATOR_ACK_INVALID/);
  assert.doesNotMatch(between, /acknowledgeSynced\s*\(/);
});


test('historical shift recovery must not bypass the live operator authorization endpoint', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('async function postOperation(');
  const end = sync.indexOf('export async function syncCashierOperatorOutboxToCloud(', start);
  assert.ok(start >= 0 && end > start);
  const post = sync.slice(start, end);
  assert.match(post, /fetch\(`\/api\/cashier\/operator\/sync\/\$\{kind\}`/);
  assert.match(post, /cashierOperatorHeaders\(session\)/);
  assert.match(post, /credentials:\s*'omit'/);
  assert.doesNotMatch(post, /(?:fetch|postOperation)\s*\([^\n]*\/api\/cashier\/sync\//);
  assert.doesNotMatch(post, /(?:operator_token|station_token)\s*:\s*(?:null|undefined|''|""|false)/);
});

test('historical outbox cannot be acknowledged without matching operation sequence and entities', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const ack = sync.indexOf('const acknowledgementInvalid =');
  const throwAt = sync.indexOf('if (acknowledgementInvalid)', ack);
  const localDelete = sync.indexOf('await authority.acknowledgeSynced([operationId])', throwAt);
  assert.ok(ack >= 0 && throwAt > ack && localDelete > throwAt);
  const validation = sync.slice(ack, throwAt);
  assert.match(validation, /operationId !== expectedOperationId/);
  assert.match(validation, /deviceSequence !== expectedDeviceSequence/);
  assert.match(validation, /acceptedEntityIds\.length !== expectedEntityIds\.length/);
  assert.match(validation, /compensationKind !== kind/);
});


test('historical operation recovery cannot bypass missing binding or upload under a different station', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('const binding = await getCashierOperationBinding(operationId)');
  const end = sync.indexOf('const uploadedResult = await postOperation(', start);
  assert.ok(start >= 0 && end > start);
  const gate = sync.slice(start, end);
  assert.match(gate, /if \(!binding\)/);
  assert.match(gate, /CASHIER_OPERATOR_OPERATION_BINDING_MISSING/);
  for (const field of ['merchant_id', 'station_id', 'device_id', 'staff_id']) {
    assert.ok(gate.includes(`binding.${field} !== session.context.${field}`) || gate.includes(`binding.${field} === session.context.${field}`), `missing ${field} isolation`);
  }
  assert.match(gate, /CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT/);
});

test('pending historical operations cannot be acknowledged before a complete server ACK', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('for (const [operationId, envelopes] of groups)');
  const ack = sync.indexOf('await authority.acknowledgeSynced([operationId])', start);
  assert.ok(start >= 0 && ack > start);
  const gate = sync.slice(start, ack);
  assert.match(gate, /const uploadedResult = await postOperation\(/);
  assert.match(gate, /uploadedResult.operation_id !== operationId/);
  assert.match(gate, /CASHIER_OPERATOR_ACK_INVALID/);
  assert.doesNotMatch(gate, /acknowledgeSynced\s*\(/);
});


test('entire cashier batch preflights historical bindings before any network upload', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');
  const start = sync.indexOf('export async function syncCashierOperatorOutboxToCloud()');
  const body = sync.slice(start);
  const group = body.indexOf('const groups = groupByOperation(uploadable)');
  const firstPreflight = body.indexOf('for (const [operationId, envelopes] of groups)', group);
  const firstUpload = body.indexOf('const uploadedResult = await postOperation(', group);
  assert.ok(group >= 0 && firstPreflight > group && firstUpload > firstPreflight);
  const gate = body.slice(firstPreflight, firstUpload);
  assert.match(gate, /getCashierOperationBinding\(operationId\)/);
  assert.match(gate, /CASHIER_OPERATOR_OPERATION_BINDING_MISSING/);
  assert.match(gate, /CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT/);
  for (const field of ['merchant_id', 'station_id', 'staff_id', 'device_id']) {
    assert.ok(gate.includes(`binding.${field} !== session.context.${field}`),
      `batch preflight must reject mismatched ${field}`);
  }
  assert.doesNotMatch(gate, /postOperation\s*\(/, 'preflight cannot upload an earlier operation');
  assert.doesNotMatch(gate, /acknowledgeSynced\s*\(/, 'preflight cannot delete an earlier operation');
});
