import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicDns, classifyDomainProbeFailure } from './v1-custom-domain-tls-check.mjs';

const expected = {
  apexA: ['216.24.57.1'],
  wwwCname: ['fawri-v1-commercial-gated-k9yj.onrender.com.'],
  apexAaaa: [],
};

test('accepts only the exact first-commercial Render DNS pair', () => {
  assert.doesNotThrow(() => assertPublicDns(expected));
});

test('refuses stale parking/orphan routing and DNS ambiguity', () => {
  for (const changed of [
    { apexA: ['1.2.3.4'] },
    { apexA: ['216.24.57.1', '1.2.3.4'] },
    { wwwCname: ['parkingpage.namecheap.com.'] },
    { wwwCname: [] },
    { apexAaaa: ['2001:db8::1'] },
  ]) {
    assert.throws(() => assertPublicDns({ ...expected, ...changed }), /V1_DOMAIN_/);
  }
});

test('www CNAME target IPv6 is not mistaken for an extra customer record', () => {
  assert.doesNotThrow(() => assertPublicDns({ ...expected, wwwAaaa: ['2001:db8::2'] }));
});

test('unavailable runner network is inconclusive, not a false TLS failure', () => {
  assert.deepEqual(classifyDomainProbeFailure({ code: 'ECONNREFUSED' }),
    { state: 'INCONCLUSIVE_NETWORK', exitCode: 2 });
  assert.deepEqual(classifyDomainProbeFailure({ code: 'V1_DOMAIN_APEX_A_NOT_EXACT_RENDER_TARGET' }),
    { state: 'DNS_NOT_READY', exitCode: 1 });
  assert.deepEqual(classifyDomainProbeFailure({ code: 'CERT_HAS_EXPIRED' }),
    { state: 'TLS_NOT_READY_OR_UNKNOWN', exitCode: 1 });
});
