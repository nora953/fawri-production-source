import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicDns } from './v1-custom-domain-tls-check.mjs';

const expected = {
  apexA: ['216.24.57.1'],
  wwwCname: ['fawri-v1-commercial-gated-k9yj.onrender.com.'],
  apexAaaa: [], wwwAaaa: [],
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
    { wwwAaaa: ['2001:db8::2'] },
  ]) {
    assert.throws(() => assertPublicDns({ ...expected, ...changed }), /V1_DOMAIN_/);
  }
});
